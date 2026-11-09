import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ProcesoEnVivoAlojamientos } from './ProcesoEnVivoAlojamientos';

/**
 * Vista de Alojamientos en "Servicios & Prov." del admin: el proceso de reserva con
 * hoteles socios visto con 4 grafos (CFG, máquina de estados, árbol de fallas y red de
 * Petri). Los grafos se dibujan con Mermaid y se alimentan con datos en vivo de
 * GET /admin/procesos/alojamientos: reservas por estado y estado real de cada hotel.
 *
 * Espejo estricto de ProcesosTab (vuelos), adaptado al Saga del agregador de
 * alojamientos (alojamientos-socios-reservas.service.ts).
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#6a1b9a', ok: '#0d7a2f', warn: '#9a5b00', bad: '#b42318',
  chipOk: '#e3f4e8', chipWarn: '#fdf1dc', chipBad: '#fde7e5', fondo: '#f7f8fa',
};

const usd = (n) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limpio = (s) => String(s ?? '').replace(/["[\]{}()<>#;|`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// ───────────────────────────── Definiciones de los grafos ─────────────────────────────

function cfg() {
  return `flowchart TD
  A([Inicio: POST /alojamientos/NODO~id/reservations]) --> B{¿Trae Idempotency-Key y documento?}
  B -- no --> E1[/400 Falta Idempotency-Key o documento/]
  B -- sí --> C[GET disponibilidad en el hotel]
  C --> D{¿Hay cupo para el tipo pedido?}
  D -- no --> E2[/409 OUT_OF_STOCK el hotel no tiene habitaciones/]
  D -- sí --> S[Sincronizar huésped en el hotel GET/POST /clientes]
  S --> F[Cotizar con precio congelado]
  F --> G[POST orders/create en el hotel con la MISMA Idempotency-Key]
  G --> H{¿Timeout o 5xx?}
  H -- sí --> R[GET orders?idempotency_key= recuperar sin duplicar]
  R --> I
  H -- no --> I{¿2xx y trae order_id?}
  I -- no --> E3[/502 El hotel no confirmó no se reservó nada/]
  I -- sí --> L[Guardar copia RESERVADO idempotency_key UNIQUE]
  L --> M{¿Se guardó la copia?}
  M -- sí --> OK([201 Reserva confirmada])
  M -- no --> W[Compensar: cancelar la orden en el hotel Saga] --> E4[/502 Se canceló en el hotel no hay copia/]
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
  state "Buscando en los hoteles" as BUSCA
  state "Cotizando (precio congelado)" as COTIZA
  state "Creando la orden en el hotel" as CREA
  state "Recuperando por idempotency_key" as RECU
  state "RESERVADO · ${n('RESERVADO')}" as RESERVADO
  state "CONFIRMADO_ASISTIDO · ${n('CONFIRMADO_ASISTIDO')}" as ASISTIDO
  state "CANCELADO · ${n('CANCELADO')}" as CANCELADO
  [*] --> BUSCA: disponibilidad en vivo
  BUSCA --> COTIZA: hay cupo
  BUSCA --> CANCELADO: 409 sin cupo
  COTIZA --> CREA: precio congelado
  CREA --> RECU: timeout o 5xx
  RECU --> RESERVADO: orden recuperada
  CREA --> RESERVADO: el hotel confirma + copia guardada
  CREA --> CANCELADO: copia falla, se compensa en el hotel
  RESERVADO --> ASISTIDO: check-in del hotel (Flujo 2, su X-API-Key)
  RESERVADO --> CANCELADO: cancelar + reembolso 100%
  ASISTIDO --> [*]
  CANCELADO --> [*]`;
}

function fta(d) {
  const hoteles = d?.hoteles ?? [];
  const lineas = [];
  const clases = { EN_LINEA: [], CAIDA: [], SIN_VERIFICAR: [], APAGADA: [] };
  hoteles.forEach((a, i) => {
    const id = `H${i}`;
    const icono = { EN_LINEA: '🟢', CAIDA: '🔴', SIN_VERIFICAR: '⚪', APAGADA: '⛔' }[a.estado] || '⚪';
    lineas.push(`  G2 --> ${id}["${icono} ${limpio(a.nombre)}"]`);
    clases[a.estado]?.push(id);
  });
  const caidos = hoteles.filter((a) => a.estado !== 'EN_LINEA').length;
  const etiquetaAnd = hoteles.length
    ? `AND · ${caidos} de ${hoteles.length} hoteles sin servicio`
    : 'AND · no hay hoteles registrados';
  return `flowchart TD
  TOP["⚠ El cliente no puede reservar un alojamiento"] --> G0{{OR}}
  G0 --> A1["Booking no responde"]
  G0 --> A2["La búsqueda no trae hoteles"]
  G0 --> A3["El hotel no confirma la orden"]
  G0 --> A4["La copia local no se guarda"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos caída"))
  A2 --> G2{{"${etiquetaAnd}"}}
${lineas.join('\n') || '  G2 --> SIN(("Registrar hoteles en Servicios & Prov."))'}
  A3 --> G4{{OR}}
  G4 --> E1(("Sin cupo OUT_OF_STOCK"))
  G4 --> E2(("Timeout del hotel"))
  G4 --> E3(("El hotel no expone /clientes"))
  A4 --> G5{{OR}}
  G5 --> F1(("DB del Booking caída"))
  G5 --> F2(("Se compensa cancelando en el hotel"))
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
  P1(("Cliente A · ●")) --> T1["▮ reservar A"]
  P2(("Cliente B · ●")) --> T2["▮ reservar B"]
  S(("Última habitación · ●")) --> T1
  S --> T2
  T1 --> RA(("A RESERVADO"))
  T2 --> RB(("B → 409 sin cupo"))
  RA --> T3["▮ check-in del hotel"]
  T3 --> AS(("A CONFIRMADO_ASISTIDO"))
  RA --> T4["▮ cancelar A"]
  T4 --> S
  classDef lugar fill:#ffffff,stroke:#6a1b9a,color:#17202b
  classDef trans fill:#17202b,stroke:#17202b,color:#ffffff
  class P1,P2,S,RA,RB,AS lugar
  class T1,T2,T3,T4 trans`;
}

// ───────────────────────────── Contenido por grafo ─────────────────────────────

const GRAFOS = [
  {
    id: 'cfg',
    tab: 'Flujo de Control (CFG)',
    titulo: 'Crear una reserva con un hotel socio',
    foco: 'Código y algoritmos',
    detecta: 'Ramas no cubiertas, excepciones no capturadas',
    intro: 'Recorrido de reservar() en alojamientos-socios-reservas.service.ts. Cada rombo es una decisión; la última habitación la decide el hotel y la copia local se guarda solo si el hotel confirma.',
    def: () => cfg(),
    metodo: 'Se cuentan las ramas (salidas de cada rombo) y se cruzan con las pruebas de alojamientos-socios.spec.ts (26 casos: idempotencia, concurrencia, recuperación por idempotency_key y compensación).',
    hallazgos: [
      ['ok', 'Doble clic con la misma Idempotency-Key: el socio recibe una sola orden y la copia tiene idempotency_key UNIQUE. Con prueba.'],
      ['ok', 'Timeout tras crear la orden: se recupera por GET orders?idempotency_key= sin duplicar. Con prueba.'],
      ['ok', 'Si la copia local falla, se compensa cancelando en el hotel (Saga). Con prueba.'],
      ['media', 'Si el socio no expone /clientes, se reserva igual sin inventar client_id (Kawsay y Cozy hoy).'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Vida de una reserva de alojamiento',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados de la copia en schema_alojamientos.alojamientos_reservas_socio. El número junto a cada estado es cuántas reservas de hoteles socios están hoy en él.',
    def: (d) => estados(d),
    metodo: 'Se buscan flechas que el negocio prohíbe pero el código permite, y estados de los que nada te saca.',
    hallazgos: [
      ['ok', 'El check-in solo lo confirma el hotel dueño con su X-API-Key (Flujo 2): otra clave da 401.'],
      ['ok', 'Una reserva con check-in (CONFIRMADO_ASISTIDO) ya no se puede cancelar.'],
      ['media', 'Cancelaciones hechas en la web del socio: el cupo se ve bien en vivo, pero la copia sigue en RESERVADO hasta leer el feed de eventos.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'El cliente no puede reservar un alojamiento',
    foco: 'Confiabilidad de sistemas',
    detecta: 'Combinación de eventos que tumban el servicio',
    intro: 'Del evento malo hacia sus causas. OR: basta una causa. AND: tienen que ocurrir todas. Las hojas de la búsqueda son los hoteles registrados, con su estado real del último ping.',
    def: (d) => fta(d),
    metodo: 'Se buscan los conjuntos de corte mínimos: la combinación más pequeña de causas que tumba el servicio. Un conjunto de una sola causa es un punto único de falla.',
    hallazgos: [
      ['alta', 'Puntos únicos de falla: App Service y base de datos del Booking. Cualquiera, solo, impide reservar.'],
      ['ok', 'La búsqueda es robusta: la puerta AND exige que caigan todos los hoteles a la vez (consulta en paralelo con timeout por cada uno, caché 10 s).'],
      ['media', 'OUT_OF_STOCK no es falla del Booking: el hotel decide la última habitación y se responde 409.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Dos clientes y la última habitación',
    foco: 'Concurrencia y procesos',
    detecta: 'Inanición (starvation), bloqueos mutuos, sobreventa',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones, que se disparan cuando todos sus lugares de entrada tienen ficha. Hay dos clientes y una sola habitación libre; el hotel decide quién la toma.',
    def: () => petri(),
    metodo: 'Bloqueo mutuo: un marcado sin transiciones habilitadas. Inanición: una transición habilitada que nunca se dispara. Sobreventa: dos fichas de reserva sobre un mismo lugar de habitación.',
    hallazgos: [
      ['ok', 'Sin sobreventa por parte de Booking: la ficha de la habitación la consume un solo reservar() y el otro recibe 409 del hotel.'],
      ['ok', 'El doble clic se serializa por clave y la copia tiene idempotency_key UNIQUE.'],
      ['alta', 'Riesgo del lado del socio: LuxeStays confirma dos reservas sobre la última habitación (su carrera, no la del Booking).'],
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
      .then((mermaid) => mermaid.render(`grafo-alo-${id}-${Date.now()}`, definicion))
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

export function ProcesosAlojamientosTab({ refreshKey = 0 }) {
  const [activo, setActivo] = useState('vivo');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/procesos/alojamientos');
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
  const hoteles = datos?.hoteles ?? [];
  const enLinea = hoteles.filter((a) => a.estado === 'EN_LINEA').length;

  const tiles = [
    { label: 'Reservas con hoteles socios', valor: (datos?.totalReservas ?? 0).toLocaleString('es-EC') },
    { label: 'Valor reservado', valor: usd(datos?.cobrado), nota: 'suma de todas las reservas' },
    { label: 'Reembolsado', valor: usd(datos?.reembolsado) },
    { label: 'Con check-in del hotel', valor: (datos?.asistidos ?? 0).toLocaleString('es-EC'), nota: 'CONFIRMADO_ASISTIDO' },
    { label: 'Hoteles en línea', valor: `${enLinea} / ${hoteles.length}`, nota: 'según el último ping real' },
    { label: 'Fuente de alojamientos', valor: datos?.fuente === 'local' ? 'Base local' : datos?.fuente === 'mixto' ? 'Mixta' : 'Hoteles socios', nota: `timeout ${datos?.timeoutMs ?? 10000} ms por hotel` },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de alojamientos</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda, sincronización de cliente, cotización, reserva (Saga) y check-in con los hoteles socios · 4 grafos de análisis de fallas</div>
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
        {[{ id: 'vivo', tab: '🔴 Flujo en vivo' }, ...GRAFOS].map((g) => (
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

      {activo === 'vivo' && <ProcesoEnVivoAlojamientos hoteles={hoteles} />}

      {activo !== 'vivo' && (
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
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Hallazgos en el código</div>
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
      )}

      {hoteles.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 520 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Hotel socio', 'Código', 'Estado', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {hoteles.map((a) => (
                <tr key={a.codigo} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 12px' }}>{a.nombre}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{a.codigo}</td>
                  <td style={{ padding: '8px 12px' }}>{{ EN_LINEA: '🟢 En línea', CAIDA: '🔴 Caída', SIN_VERIFICAR: '⚪ Sin verificar', APAGADA: '⛔ Apagada' }[a.estado] || a.estado}</td>
                  <td style={{ padding: '8px 12px' }}>{a.latenciaMs != null ? `${a.latenciaMs} ms` : '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{a.ultimoPing ? new Date(a.ultimoPing).toLocaleString('es-EC') : 'Pendiente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
