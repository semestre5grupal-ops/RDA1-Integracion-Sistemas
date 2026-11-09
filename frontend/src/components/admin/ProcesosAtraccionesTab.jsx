import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Vista de Atracciones en "Servicios & Prov." del admin: el proceso de reserva con
 * operadores y parques socios visto con 4 grafos (CFG, máquina de estados, árbol de fallas y red de
 * Petri). Los grafos se dibujan con Mermaid y se alimentan con datos en vivo de
 * GET /admin/procesos/atracciones: reservas por estado y estado real de cada operador socio.
 *
 * Espejo estricto de ProcesosTab (vuelos), ProcesosAlojamientosTab y ProcesosAutosTab, adaptado
 * a la vertical de atracciones turísticas (schema_atracciones.atracciones_reservas y config_proveedor).
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#b91c1c', ok: '#0d7a2f', warn: '#9a5b00', bad: '#b42318',
  chipOk: '#e3f4e8', chipWarn: '#fdf1dc', chipBad: '#fde7e5', fondo: '#f7f8fa',
};

const usd = (n) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limpio = (s) => String(s ?? '').replace(/["[\]{}()<>#;|`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// ───────────────────────────── Definiciones de los grafos ─────────────────────────────

function cfg() {
  return `flowchart TD
  A([Inicio: POST /atracciones/reservas]) --> B{¿Trae Idempotency-Key y cliente?}
  B -- no --> E1[/400 Falta Idempotency-Key o cliente/]
  B -- sí --> C[Consultar turno y aforo en el operador socio]
  C --> D{¿Hay cupo disponible en el turno y fecha?}
  D -- no --> E2[/409 Aforo agotado para la fecha y horario solicitados/]
  D -- sí --> S[Sincronizar turista en el socio GET/POST /clientes JIT]
  S --> F[Cobro de tickets en MS_PAG con tarifas diferenciadas]
  F --> G[POST /reservas en el operador socio con Idempotency-Key]
  G --> H{¿Timeout o 5xx?}
  H -- sí --> R[GET reservas?idempotency_key= recuperación sin duplicar]
  R --> I
  H -- no --> I{¿2xx y voucher QR emitido?}
  I -- no --> E3[/502 El operador socio no confirmó la reserva/]
  I -- sí --> L[Guardar en schema_atracciones.atracciones_reservas]
  L --> M{¿Se guardó la copia?}
  M -- sí --> OK([201 Entrada emitida con voucher QR y PNR canónico])
  M -- no --> W[Compensar Saga: cancelar reserva en el operador] --> E4[/502 Cancelado en socio por fallo interno local/]
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
  state "Consultando catálogo y turnos" as CAT
  state "Verificando aforo en tiempo real" as AFORO
  state "Emitiendo voucher con operador" as EMITE
  state "Recuperando por idempotency_key" as RECU
  state "CONFIRMED / CONFIRMADA · ${n('CONFIRMED') + n('CONFIRMADA')}" as CONFIRMADA
  state "CHECKED_IN / ASISTIDO · ${n('CHECKED_IN') + n('CONFIRMADO_ASISTIDO')}" as ASISTIDO
  state "CANCELLED / CANCELADA · ${n('CANCELLED') + n('CANCELADA')}" as CANCELADA
  state "COMPENSATED · ${n('COMPENSATED')}" as COMPENSADA
  [*] --> CAT: exploración por categoría
  CAT --> AFORO: selección de turno y fecha
  AFORO --> CANCELADA: 409 aforo agotado
  AFORO --> EMITE: cupo congelado + pago
  EMITE --> RECU: timeout o 5xx
  RECU --> CONFIRMADA: orden recuperada
  EMITE --> CONFIRMADA: operador confirma + voucher QR emitido
  EMITE --> COMPENSADA: fallo de copia local, Saga compensa
  CONFIRMADA --> ASISTIDO: escaneo de QR en puerta/torniquete (Flujo 2)
  CONFIRMADA --> CANCELADA: cancelación anticipada + reembolso
  ASISTIDO --> [*]
  CANCELADA --> [*]
  COMPENSADA --> [*]`;
}

function fta(d) {
  const operadores = d?.operadores ?? [];
  const lineas = [];
  const clases = { EN_LINEA: [], CAIDA: [], SIN_VERIFICAR: [], APAGADA: [] };
  operadores.forEach((a, i) => {
    const id = `O${i}`;
    const icono = { EN_LINEA: '🟢', CAIDA: '🔴', SIN_VERIFICAR: '⚪', APAGADA: '⛔' }[a.estado] || '⚪';
    lineas.push(`  G2 --> ${id}["${icono} ${limpio(a.nombre)}"]`);
    clases[a.estado]?.push(id);
  });
  const caidos = operadores.filter((a) => a.estado !== 'EN_LINEA').length;
  const etiquetaAnd = operadores.length
    ? `AND · ${caidos} de ${operadores.length} operadores sin servicio`
    : 'AND · no hay operadores registrados';
  return `flowchart TD
  TOP["⚠ El turista no puede reservar una atracción"] --> G0{{OR}}
  G0 --> A1["Booking no responde"]
  G0 --> A2["Catálogo de atracciones vacío"]
  G0 --> A3["El operador rechaza la reserva de turno"]
  G0 --> A4["Fallo en generación de QR o cobro"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos caída"))
  A2 --> G2{{"${etiquetaAnd}"}}
${lineas.join('\n') || '  G2 --> SIN(("Registrar operadores en Servicios & Prov."))'}
  A3 --> G4{{OR}}
  G4 --> E1(("Aforo agotado en el turno"))
  G4 --> E2(("Timeout del operador socio"))
  G4 --> E3(("Operador no expone /clientes JIT"))
  A4 --> G5{{OR}}
  G5 --> F1(("Error pasarela de pago MS_PAG"))
  G5 --> F2(("Fallo render QR: compensa en operador"))
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
  P1(("Turista A (2 cupos) · ●")) --> T1["▮ reservar cupo A"]
  P2(("Turista B (2 cupos) · ●")) --> T2["▮ reservar cupo B"]
  S(("Aforo disponible · ● ● ●")) --> T1
  S --> T2
  T1 --> RA(("A CONFIRMADA con QR"))
  T2 --> RB(("B → 409 cupos insuficientes"))
  RA --> T3["▮ escaneo en torniquete (Check-in)"]
  T3 --> AS(("A INGRESO ASISTIDO"))
  RA --> T4["▮ cancelar tickets A"]
  T4 --> S
  classDef lugar fill:#ffffff,stroke:#b91c1c,color:#17202b
  classDef trans fill:#17202b,stroke:#17202b,color:#ffffff
  class P1,P2,S,RA,RB,AS lugar
  class T1,T2,T3,T4 trans`;
}

// ───────────────────────────── Contenido por grafo ─────────────────────────────

const GRAFOS = [
  {
    id: 'cfg',
    tab: 'Flujo de Control (CFG)',
    titulo: 'Crear una reserva de atracción con operador socio',
    foco: 'Código y algoritmos',
    detecta: 'Ramas no cubiertas, excepciones no capturadas',
    intro: 'Recorrido de la orquestación de atracciones turísticas. Cada rombo es una decisión; el aforo por turno lo valida el socio y el voucher con código QR canónico se genera al confirmar.',
    def: () => cfg(),
    metodo: 'Se audita el flujo de emisión y compensación Saga. Si la copia en Booking falla tras confirmarse en el operador, se gatilla la compensación para no cobrar al usuario ni saturar aforo.',
    hallazgos: [
      ['alta', 'Generación de QR canónico: el payload del QR incluye PNR, documento, turno y firma para validación offline en puerta.'],
      ['media', 'Recuperación idempotente: ante timeouts en la emisión con el socio, la clave de idempotencia evita la emisión duplicada de tickets.'],
      ['ok', 'Sincronización JIT de cliente: se resuelve la identidad unificada del visitante antes de emitir la reserva en el socio.'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Ciclo de vida de una entrada a atracciones',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados canónicos de tickets para atracciones. El número junto a cada estado refleja las reservas reales registradas en schema_atracciones.',
    def: (d) => estados(d),
    metodo: 'Se auditan las transiciones desde la consulta de catálogo y reserva de turno hasta el escaneo de acceso en puerta (Check-in / ASISTIDO).',
    hallazgos: [
      ['alta', 'Check-in por API de socios (Flujo 2): el operador escanea el voucher en torniquete y actualiza Booking mediante PATCH /reservas/{id}/checkin con su X-API-Key.'],
      ['media', 'Cancelación con liberación de aforo: una reserva CONFIRMED devuelta antes del turno reasigna los cupos al aforo disponible del operador.'],
      ['ok', 'Compensación de fallos: el estado COMPENSATED registra transacciones revertidas en caso de error técnico en la emisión final.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'El turista no puede reservar una atracción',
    foco: 'Confiabilidad de sistemas',
    detecta: 'Combinación de eventos que tumban el servicio',
    intro: 'Del fallo de reserva hacia sus causas raíz. La compuerta AND de operadores socios muestra el semáforo LED y latencia en vivo del último ping.',
    def: (d) => fta(d),
    metodo: 'Análisis de conjuntos de corte mínimos: impacto de indisponibilidad de la base central vs caídas de catálogos de operadores socios (Gloria ms-catalog, Ariel, Alisson, Dilan, Michael).',
    hallazgos: [
      ['alta', 'Puntos únicos de falla: DB Central de Booking y pasarela de cobro. Si caen, ninguna reserva puede emitirse.'],
      ['ok', 'Resiliencia de catálogo: la caída de un operador individual no impide que el turista explore y reserve atracciones de otros operadores.'],
      ['media', 'Aforo dinámico por turno: si un horario agota sus cupos, el flujo redirige automáticamente al siguiente turno con capacidad disponible.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Aforo concurrente y asignación de cupos por turno',
    foco: 'Concurrencia y procesos',
    detecta: 'Sobrecupo, contención y agotamiento de aforo',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones. Dos turistas compiten por los últimos cupos del turno.',
    def: () => petri(),
    metodo: 'Demostración de preservación de invariantes de capacidad: no se emiten más tickets que la cantidad de fichas de aforo definidas para el horario.',
    hallazgos: [
      ['ok', 'Invariante de aforo: el operador decrementa atómicamente el cupo disponible del turno evitando el sobrecupo.'],
      ['ok', 'Reintegración de cupos: la cancelación anticipada restituye las fichas al lugar de aforo para que otros turistas puedan reservar.'],
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
      .then((mermaid) => mermaid.render(`grafo-atr-${id}-${Date.now()}`, definicion))
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

export function ProcesosAtraccionesTab({ refreshKey = 0 }) {
  const [activo, setActivo] = useState('cfg');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/procesos/atracciones');
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
  const operadores = datos?.operadores ?? [];
  const enLinea = operadores.filter((a) => a.estado === 'EN_LINEA').length;

  const tiles = [
    { label: 'Reservas de atracciones socias', valor: (datos?.totalReservas ?? 0).toLocaleString('es-EC') },
    { label: 'Valor reservado', valor: usd(datos?.cobrado), nota: 'suma de todas las entradas' },
    { label: 'Reembolsado', valor: usd(datos?.reembolsado) },
    { label: 'Con ingreso / asistidos', valor: (datos?.asistidos ?? 0).toLocaleString('es-EC'), nota: 'CHECKED_IN / CONFIRMADO_ASISTIDO' },
    { label: 'Operadores en línea', valor: `${enLinea} / ${operadores.length}`, nota: 'según el último ping real' },
    { label: 'Fuente de catálogo', valor: datos?.fuente === 'local' ? 'Base local' : datos?.fuente === 'mixto' ? 'Mixta' : 'Operadores socios', nota: `timeout ${datos?.timeoutMs ?? 8000} ms por operador` },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de atracciones</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda de catálogo, verificación de aforo, emisión de voucher QR y check-in con socios · 4 grafos de análisis de fallas</div>
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

      {operadores.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 520 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Operador de atracciones', 'Código de nodo', 'Estado', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {operadores.map((a) => (
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
