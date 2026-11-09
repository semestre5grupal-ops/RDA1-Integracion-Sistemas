import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Vista de Autos en "Servicios & Prov." del admin: el proceso de reserva con
 * agencias de autos socias visto con 4 grafos (CFG, máquina de estados, árbol de fallas y red de
 * Petri). Los grafos se dibujan con Mermaid y se alimentan con datos en vivo de
 * GET /admin/procesos/autos: reservas por estado y estado real de cada agencia socia.
 *
 * Espejo estricto de ProcesosTab (vuelos) y ProcesosAlojamientosTab, adaptado
 * a la vertical de renta de vehículos (schema_autos.autos_reservas y config_proveedor).
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#0369a1', ok: '#0d7a2f', warn: '#9a5b00', bad: '#b42318',
  chipOk: '#e3f4e8', chipWarn: '#fdf1dc', chipBad: '#fde7e5', fondo: '#f7f8fa',
};

const usd = (n) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limpio = (s) => String(s ?? '').replace(/["[\]{}()<>#;|`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// ───────────────────────────── Definiciones de los grafos ─────────────────────────────

function cfg() {
  return `flowchart TD
  A([Inicio: POST /autos/orders con auto_id]) --> B{¿Trae Idempotency-Key y conductor?}
  B -- no --> E1[/400 Falta Idempotency-Key o conductor/]
  B -- sí --> C[GET disponibilidad de flota en la agencia socia]
  C --> D{¿Hay vehículo disponible en el rango de fechas?}
  D -- no --> E2[/409 OUT_OF_STOCK vehículo reservado o no disponible/]
  D -- sí --> S[Sincronizar conductor en la agencia GET/POST /clientes JIT]
  S --> F[Cotizar tarifa congelada y seguro de garantía]
  F --> G[POST /orders en la agencia con la MISMA Idempotency-Key]
  G --> H{¿Timeout o 5xx?}
  H -- sí --> R[GET orders?idempotency_key= recuperación sin duplicar]
  R --> I
  H -- no --> I{¿2xx y trae order_id o PNR?}
  I -- no --> E3[/502 La agencia socia no confirmó no se arrienda/]
  I -- sí --> L[Guardar copia local en schema_autos.autos_reservas]
  L --> M{¿Se guardó la copia?}
  M -- sí --> OK([201 Renta confirmada con voucher de retiro])
  M -- no --> W[Compensar Saga: cancelar orden en la agencia] --> E4[/502 Se canceló en la agencia por error local/]
  classDef err fill:#fde7e5,stroke:#b42318,color:#5c120c
  classDef ok fill:#e3f4e8,stroke:#0d7a2f,color:#0b3d1a
  classDef riesgo fill:#fdf1dc,stroke:#9a5b00,color:#4a2c00
  class E1,E2,E3,E4 err
  class OK ok
  class R,W riesgo`;
}

function estados(d) {
  const n = (k) => d?.porEstado?.[k] ?? 0;
  return `stateDiagram-v2
  state "Consultando flota de agencias" as BUSCA
  state "Cotizando (tarifa diaria congelada)" as COTIZA
  state "Emitiendo orden en agencia socia" as CREA
  state "Recuperando por idempotency_key" as RECU
  state "CONFIRMADA · ${n('CONFIRMADA') + n('RESERVADO')}" as CONFIRMADA
  state "ACTIVA / RETIRADO · ${n('ACTIVA')}" as ACTIVA
  state "CONFIRMADO_ASISTIDO · ${n('CONFIRMADO_ASISTIDO')}" as ASISTIDO
  state "COMPLETADA · ${n('COMPLETADA')}" as COMPLETADA
  state "CANCELADA · ${n('CANCELADA') + n('CANCELADO')}" as CANCELADA
  [*] --> BUSCA: consulta de fechas y ciudad
  BUSCA --> COTIZA: auto seleccionado
  BUSCA --> CANCELADA: 409 sin disponibilidad
  COTIZA --> CREA: confirmación del usuario
  CREA --> RECU: timeout o 5xx
  RECU --> CONFIRMADA: orden recuperada
  CREA --> CONFIRMADA: agencia confirma + copia guardada
  CREA --> CANCELADA: copia falla, compensación Saga LIFO
  CONFIRMADA --> ACTIVA: retiro en sucursal (Check-in con licencia)
  CONFIRMADA --> ASISTIDO: check-in del socio (Flujo 2, su X-API-Key)
  ACTIVA --> COMPLETADA: devolución de vehículo e inspección de km
  CONFIRMADA --> CANCELADA: cancelar antes de recogida + reembolso 100%
  ASISTIDO --> COMPLETADA: cierre de orden
  COMPLETADA --> [*]
  CANCELADA --> [*]`;
}

function fta(d) {
  const agencias = d?.agencias ?? [];
  const lineas = [];
  const clases = { EN_LINEA: [], CAIDA: [], SIN_VERIFICAR: [], APAGADA: [] };
  agencias.forEach((a, i) => {
    const id = `A${i}`;
    const icono = { EN_LINEA: '🟢', CAIDA: '🔴', SIN_VERIFICAR: '⚪', APAGADA: '⛔' }[a.estado] || '⚪';
    lineas.push(`  G2 --> ${id}["${icono} ${limpio(a.nombre)}"]`);
    clases[a.estado]?.push(id);
  });
  const caidas = agencias.filter((a) => a.estado !== 'EN_LINEA').length;
  const etiquetaAnd = agencias.length
    ? `AND · ${caidas} de ${agencias.length} agencias de autos sin servicio`
    : 'AND · no hay agencias de autos registradas';
  return `flowchart TD
  TOP["⚠ El cliente no puede arrendar un vehículo"] --> G0{{OR}}
  G0 --> A1["Booking no responde"]
  G0 --> A2["La búsqueda no encuentra autos"]
  G0 --> A3["La agencia socia rechaza la reserva"]
  G0 --> A4["Fallo en cobro o copia local"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos caída"))
  A2 --> G2{{"${etiquetaAnd}"}}
${lineas.join('\n') || '  G2 --> SIN(("Registrar agencias en Servicios & Prov."))'}
  A3 --> G4{{OR}}
  G4 --> E1(("Vehículo ocupado / Sin stock"))
  G4 --> E2(("Timeout de la agencia socia"))
  G4 --> E3(("Agencia no expone /clientes JIT"))
  A4 --> G5{{OR}}
  G5 --> F1(("Error en pasarela de pagos MS_PAG"))
  G5 --> F2(("DB Booking caída: compensa en agencia"))
  classDef top fill:#fde7e5,stroke:#b42318,color:#5c120c,font-weight:bold
  classDef gate fill:#eef1f5,stroke:#4a5563,color:#17202b
  classDef base fill:#fdf1dc,stroke:#9a5b00,color:#4a2c00
  classDef vivo fill:#e3f4e8,stroke:#0d7a2f,color:#0b3d1a
  classDef caido fill:#fde7e5,stroke:#b42318,color:#5c120c
  classDef neutro fill:#f1f1ef,stroke:#898781,color:#3a3a38
  class TOP top
  class G0,G1,G2,G4,G5 gate
  class B1,B2,E1,E2,E3,F1,F2 base
${clases.EN_LINEA.length ? `  class ${clases.EN_LINEA.join(',')} vivo` : ''}
${clases.CAIDA.length ? `  class ${clases.CAIDA.join(',')} caido` : ''}
${[...clases.SIN_VERIFICAR, ...clases.APAGADA].length ? `  class ${[...clases.SIN_VERIFICAR, ...clases.APAGADA].join(',')} neutro` : ''}`;
}

function petri() {
  return `flowchart LR
  P1(("Cliente A · ●")) --> T1["▮ reservar auto A"]
  P2(("Cliente B · ●")) --> T2["▮ reservar auto B"]
  S(("Vehículo disponible · ●")) --> T1
  S --> T2
  T1 --> RA(("A CONFIRMADA"))
  T2 --> RB(("B → 409 sin stock"))
  RA --> T3["▮ retiro de vehículo (Check-in)"]
  T3 --> AS(("A ACTIVA / ASISTIDO"))
  AS --> T4["▮ devolución e inspección"]
  T4 --> S
  RA --> T5["▮ cancelar A"]
  T5 --> S
  classDef lugar fill:#ffffff,stroke:#0369a1,color:#17202b
  classDef trans fill:#17202b,stroke:#17202b,color:#ffffff
  class P1,P2,S,RA,RB,AS lugar
  class T1,T2,T3,T4,T5 trans`;
}

// ───────────────────────────── Contenido por grafo ─────────────────────────────

const GRAFOS = [
  {
    id: 'cfg',
    tab: 'Flujo de Control (CFG)',
    titulo: 'Crear una reserva con una agencia de autos socia',
    foco: 'Código y algoritmos',
    detecta: 'Ramas no cubiertas, excepciones no capturadas',
    intro: 'Recorrido de la orquestación de renta de autos. Cada rombo es una decisión; el stock vehicular lo valida la agencia y la copia local se guarda solo si la agencia confirma con éxito.',
    def: () => cfg(),
    metodo: 'Se analizan las bifurcaciones y compensaciones Saga. Si la copia en Booking falla, se gatilla la compensación para cancelar la orden en la agencia y no dejar autos bloqueados.',
    hallazgos: [
      ['alta', 'Compensación Saga LIFO: si la base de datos de Booking no puede guardar la copia, se emite cancelación a la agencia para liberar la unidad.'],
      ['media', 'Recuperación idempotente: ante un timeout 504 con la agencia, se reintenta por Idempotency-Key para no crear dos alquileres simultáneos.'],
      ['ok', 'Sincronización JIT de conductor: se valida y registra la identidad del conductor antes de enviar la orden final a la agencia.'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Ciclo de vida del arriendo de un auto',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados canónicos del arriendo de vehículos. El número junto a cada estado refleja las reservas reales registradas en schema_autos.',
    def: (d) => estados(d),
    metodo: 'Se verifican las transiciones desde la reserva inicial hasta el retiro en sucursal (Check-in / ASISTIDO) y la devolución final con inspección de kilometraje.',
    hallazgos: [
      ['alta', 'Check-in por API de socios (Flujo 2): la agencia socia reporta el retiro del vehículo mediante PATCH /reservas/{id}/checkin con su X-API-Key propia.'],
      ['media', 'Retención por garantía: el estado ACTIVA bloquea el vehículo hasta que la devolución registre km_retorno y cierre la orden en COMPLETADA.'],
      ['ok', 'Cancelación con devolución inmediata: una reserva CONFIRMADA puede cancelarse antes de la fecha de recogida liberando el inventario.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'El cliente no puede arrendar un vehículo',
    foco: 'Confiabilidad de sistemas',
    detecta: 'Combinación de eventos que tumban el servicio',
    intro: 'Del fallo de reserva hacia sus causas raíz. La compuerta AND de agencias socias muestra el semáforo LED y latencia en vivo del último ping.',
    def: (d) => fta(d),
    metodo: 'Análisis de conjuntos de corte mínimos: caída de microservicios centrales (App Service, Postgres) vs indisponibilidad de flotas de agencias externas.',
    hallazgos: [
      ['alta', 'Puntos únicos de falla: DB Central de Booking y pasarela de cobro. Si caen, ninguna reserva puede completarse.'],
      ['ok', 'Tolerancia en búsqueda: si una agencia socia falla o tiene alta latencia, el catálogo continúa ofreciendo las unidades de las agencias restantes.'],
      ['media', 'Circuit Breaker por agencia: si un socio supera el 50% de fallos, el breaker pasa a OPEN para no degradar el tiempo de respuesta del usuario.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Concurrencia sobre el último vehículo disponible',
    foco: 'Concurrencia y procesos',
    detecta: 'Inanición, colisiones y sobre-alquiler',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones. Dos clientes compiten en simultáneo por el único vehículo de una categoría en la misma ciudad.',
    def: () => petri(),
    metodo: 'Demostración matemática de exclusión mutua: la primera transacción en confirmar consume la ficha del vehículo; la segunda recibe 409 OUT_OF_STOCK.',
    hallazgos: [
      ['ok', 'Exclusión mutua garantizada: la agencia socia serializa la reserva y responde conflicto a peticiones concurrentes sobre la misma patente.'],
      ['ok', 'Retorno de ficha por cancelación: si el cliente A cancela su reserva, el vehículo vuelve al lugar de disponibilidad para nuevos arriendos.'],
    ],
  },
];

const SEV = {
  alta: { label: 'ALTA', bg: T.chipBad, fg: T.bad },
  media: { label: 'MEDIA', bg: T.chipWarn, fg: T.warn },
  ok: { label: 'OK', bg: T.chipOk, fg: T.ok },
};

// ───────────────────────────── Render de Mermaid ─────────────────────────────

let mermaidPromesa = null;
function cargarMermaid() {
  if (!mermaidPromesa) {
    mermaidPromesa = import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', theme: 'default', fontFamily: 'inherit',
        flowchart: { htmlLabels: true, useMaxWidth: false }, state: { useMaxWidth: false },
      });
      return mermaid;
    });
  }
  return mermaidPromesa;
}

function Diagrama({ definicion, id }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setError(null);
    cargarMermaid()
      .then((mermaid) => mermaid.render(`grafo-aut-${id}-${Date.now()}`, definicion))
      .then(({ svg }) => {
        if (!vivo || !ref.current) return;
        ref.current.innerHTML = svg;
        const el = ref.current.querySelector('svg');
        const vb = el?.viewBox?.baseVal;
        const caja = ref.current.parentElement?.clientWidth || 800;
        if (el && vb?.width) {
          const escala = Math.min(1, Math.max((caja - 24) / vb.width, 0.6));
          el.style.maxWidth = 'none';
          el.setAttribute('width', String(Math.round(vb.width * escala)));
          el.setAttribute('height', String(Math.round(vb.height * escala)));
        }
      })
      .catch((e) => vivo && setError(e?.message || 'No se pudo dibujar el grafo.'));
    return () => {
      vivo = false;
    };
  }, [definicion, id]);

  return (
    <div style={{ overflowX: 'auto', border: `1px dashed ${T.border}`, borderRadius: 10, background: T.fondo, padding: 12, minHeight: 120 }}>
      {error ? (
        <div role="alert" style={{ color: T.bad, fontSize: '0.85rem' }}>⚠️ {error}</div>
      ) : (
        <div ref={ref} style={{ width: 'max-content', minWidth: '100%', display: 'flex', justifyContent: 'center' }} aria-label="Grafo del proceso">
          <span style={{ color: T.muted, fontSize: '0.85rem', alignSelf: 'center' }}>Dibujando…</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Pestaña ─────────────────────────────

export function ProcesosAutosTab({ refreshKey = 0 }) {
  const [activo, setActivo] = useState('cfg');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/procesos/autos');
      setDatos(data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'No se pudieron cargar los datos del proceso.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const grafo = GRAFOS.find((g) => g.id === activo) || GRAFOS[0];
  const definicion = useMemo(() => grafo.def(datos), [grafo, datos]);
  const agencias = datos?.agencias ?? [];
  const enLinea = agencias.filter((a) => a.estado === 'EN_LINEA').length;

  const tiles = [
    { label: 'Reservas de autos socias', valor: (datos?.totalReservas ?? 0).toLocaleString('es-EC') },
    { label: 'Valor reservado', valor: usd(datos?.cobrado), nota: 'suma de todas las órdenes' },
    { label: 'Reembolsado', valor: usd(datos?.reembolsado) },
    { label: 'Con entrega / asistidos', valor: (datos?.asistidos ?? 0).toLocaleString('es-EC'), nota: 'CONFIRMADO_ASISTIDO' },
    { label: 'Agencias en línea', valor: `${enLinea} / ${agencias.length}`, nota: 'según el último ping real' },
    { label: 'Fuente de autos', valor: datos?.fuente === 'local' ? 'Base local' : datos?.fuente === 'mixto' ? 'Mixta' : 'Agencias socias', nota: `timeout ${datos?.timeoutMs ?? 8000} ms por agencia` },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de autos</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda de flota, sincronización de conductor JIT, cotización, reserva (Saga) y entrega de vehículo · 4 grafos de análisis de fallas</div>
        </div>
        <button type="button" onClick={cargar} disabled={cargando}
          style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: '0.8rem' }}>
          {cargando ? '⏳' : '↻'} Actualizar datos
        </button>
      </div>

      {error && (
        <div role="alert" style={{ background: T.chipBad, border: '1px solid #f5c2c0', color: '#8a1c1c', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem' }}>
          ⚠️ {error} Los grafos se muestran sin datos en vivo.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.78rem', color: T.text2, fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{t.valor}</div>
            {t.nota && <div style={{ fontSize: '0.72rem', color: T.muted }}>{t.nota}</div>}
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Tipo de grafo" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {GRAFOS.map((g) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            aria-selected={activo === g.id}
            onClick={() => setActivo(g.id)}
            style={{
              border: `1px solid ${activo === g.id ? T.azul : T.border}`, background: activo === g.id ? T.azul : T.surface,
              color: activo === g.id ? '#fff' : T.text, borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600,
            }}
          >
            {g.tab}
          </button>
        ))}
      </div>

      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: T.text }}>{grafo.titulo}</h3>
          <span style={{ fontSize: '0.75rem', color: T.text2, border: `1px solid ${T.border}`, borderRadius: 999, padding: '2px 8px' }}>Foco: {grafo.foco}</span>
          <span style={{ fontSize: '0.75rem', color: T.text2, border: `1px solid ${T.border}`, borderRadius: 999, padding: '2px 8px' }}>Detecta: {grafo.detecta}</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: T.text2, maxWidth: '80ch' }}>{grafo.intro}</p>

        <Diagrama definicion={definicion} id={grafo.id} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Dónde detecta la falla</div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: T.text2 }}>{grafo.metodo}</p>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Hallazgos en la integración</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {grafo.hallazgos.map(([sev, texto]) => (
                <li key={texto} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, fontSize: '0.86rem', alignItems: 'start' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: SEV[sev].bg, color: SEV[sev].fg, marginTop: 2 }}>{SEV[sev].label}</span>
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {agencias.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 520 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Agencia de autos', 'Código de nodo', 'Estado', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {agencias.map((a) => (
                <tr key={a.codigo} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 12px' }}>{a.nombre}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{a.codigo}</td>
                  <td style={{ padding: '7px 12px' }}>{{ EN_LINEA: '🟢 En línea', CAIDA: '🔴 Sin respuesta', SIN_VERIFICAR: '⚪ Sin verificar', APAGADA: '⛔ Apagada' }[a.estado]}</td>
                  <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums' }}>{a.estado === 'EN_LINEA' || a.estado === 'CAIDA' ? `${a.latenciaMs} ms` : '—'}</td>
                  <td style={{ padding: '7px 12px', color: T.muted }}>{a.ultimoPing && a.estado !== 'SIN_VERIFICAR' ? new Date(a.ultimoPing).toLocaleString('es-EC') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

