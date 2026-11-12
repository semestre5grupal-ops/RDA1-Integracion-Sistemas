import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ProcesoEnVivoAtracciones } from './ProcesoEnVivoAtracciones';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { ActualizadoHace } from './panelUtils';

/**
 * Vista de Atracciones en "Servicios & Prov." del admin: el proceso de reserva con
 * operadores socios mediante canal directo gRPC (HTTP/2, Protobuf, puerto 50051
 * punto a punto con el nodo dueño, sin broadcast gateway).
 *
 * Ilustra los 4 grafos de análisis de fallas (CFG, máquina de estados, árbol de fallas y
 * red de Petri) alimentados con datos de schema_atracciones y config_proveedor.
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
  A([Inicio: Reserva directa de atracción con operador dueño]) --> B{¿Metadata gRPC trae Idempotency-Key y cliente?}
  B -- no --> E1[/gRPC Code 3 INVALID_ARGUMENT/]
  B -- sí --> C[rpc CheckSlotQuota operador dueño :50051]
  C --> D{¿gRPC OK y cupos disponibles en el turno?}
  D -- no --> E2[/gRPC Code 5 NOT_FOUND o aforo agotado/]
  D -- sí --> S[rpc SyncCustomer cliente JIT en operador dueño]
  S --> F[Calcular tarifa de tickets adult/child/senior]
  F --> G[rpc IssueVoucherTicket operador dueño con Idempotency-Key]
  G --> H{¿Timeout socket o red?}
  H -- sí --> R[Reintento por canal gRPC idempotente]
  R --> I
  H -- no --> I{¿gRPC Code 0 OK y voucher QR emitido?}
  I -- no --> E3[/gRPC Code 14 UNAVAILABLE operador no confirmó/]
  I -- sí --> L[Guardar en schema_atracciones.atracciones_reservas]
  L --> M{¿Se persistió localmente?}
  M -- sí --> OK([200 OK Entrada emitida con QR y PNR canónico])
  M -- no --> W[Compensar Saga: rpc CompensateTicket operador dueño] --> E4[/gRPC Code 10 ABORTED Aforo liberado en socio/]
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
  state "Canal gRPC directo con operador dueño" as CANAL
  state "rpc CheckSlotQuota (:50051)" as CHECK
  state "rpc IssueVoucherTicket (Unary Protobuf)" as RPC_ISSUE
  state "Reintento idempotente en socket gRPC" as RECU
  state "CONFIRMED / CONFIRMADA · ${n('CONFIRMED') + n('CONFIRMADA')}" as CONFIRMADA
  state "CHECKED_IN / ASISTIDO · ${n('CHECKED_IN') + n('CONFIRMADO_ASISTIDO')}" as ASISTIDO
  state "CANCELLED / CANCELADA · ${n('CANCELLED') + n('CANCELADA')}" as CANCELADA
  state "COMPENSATED · ${n('COMPENSATED')}" as COMPENSADA
  [*] --> CANAL: handshake HTTP/2 con operador dueño
  CANAL --> CHECK: verificación de turno y aforo
  CHECK --> CANCELADA: gRPC Code 5 (aforo 0 agotado)
  CHECK --> RPC_ISSUE: cupos y horario congelados
  RPC_ISSUE --> RECU: DEADLINE_EXCEEDED (timeout)
  RECU --> CONFIRMADA: confirmación recuperada
  RPC_ISSUE --> CONFIRMADA: gRPC OK + voucher QR emitido
  RPC_ISSUE --> COMPENSADA: falla copia local, rpc CompensateTicket (Saga)
  CONFIRMADA --> ASISTIDO: escaneo de QR en torniquete (Flujo 2)
  CONFIRMADA --> CANCELADA: cancelación anticipada + reembolso
  ASISTIDO --> [*]
  CANCELADA --> [*]
  COMPENSADA --> [*]`;
}

function fta(d) {
  return `flowchart TD
  TOP["⚠ Fallo en reserva directa de atracción con el operador"] --> G0{{OR}}
  G0 --> A1["Booking Central no responde"]
  G0 --> A2["Canal gRPC con el operador dueño no responde"]
  G0 --> A3["El operador dueño rechaza la reserva del turno"]
  G0 --> A4["Fallo en generación de QR o persistencia local"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos central caída"))
  A2 --> G2{{OR}}
  G2 --> C1(("Socket TCP:50051 cerrado o caído"))
  G2 --> C2(("gRPC Code 4 DEADLINE_EXCEEDED"))
  G2 --> C3(("gRPC Code 14 UNAVAILABLE"))
  A3 --> G4{{OR}}
  G4 --> E1(("Aforo agotado en el turno"))
  G4 --> E2(("Circuit Breaker OPEN por tasa de fallos"))
  G4 --> E3(("Rechazo en sincronización JIT"))
  A4 --> G5{{OR}}
  G5 --> F1(("Error en pasarela de pagos MS_PAG"))
  G5 --> F2(("Fallo render QR: compensa por rpc Compensate"))
  classDef top fill:#fde7e5,stroke:#b42318,color:#5c120c,font-weight:bold
  classDef gate fill:#eef1f5,stroke:#4a5563,color:#17202b
  classDef base fill:#fdf1dc,stroke:#9a5b00,color:#4a2c00
  classDef vivo fill:#e3f4e8,stroke:#0d7a2f,color:#0b3d1a
  classDef caido fill:#fde7e5,stroke:#b42318,color:#5c120c
  class TOP top
  class G0,G1,G2,G4,G5 gate
  class B1,B2,C1,C2,C3,E1,E2,E3,F1,F2 base`;
}

function petri() {
  return `flowchart LR
  P1(("Turista A (2 cupos) · ●")) --> T1["▮ rpc IssueVoucherTicket A (operador dueño)"]
  P2(("Turista B (2 cupos) · ●")) --> T2["▮ rpc IssueVoucherTicket B (operador dueño)"]
  S(("Aforo en operador dueño · ● ● ●")) --> T1
  S --> T2
  T1 --> RA(("A CONFIRMADA (gRPC OK)"))
  T2 --> RB(("B → Code 5 NOT_FOUND / sin aforo"))
  RA --> T3["▮ escaneo en torniquete (Check-in)"]
  T3 --> AS(("A INGRESO ASISTIDO"))
  RA --> T4["▮ rpc CompensateTicket A"]
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
    titulo: 'Reserva directa punto a punto vía gRPC (HTTP/2 :50051)',
    foco: 'Código y algoritmos gRPC',
    detecta: 'Códigos de error gRPC no capturados, compensaciones LIFO',
    intro: 'Canal binario Unary gRPC directo con el microservicio dueño de la atracción (Gloria ms-catalog, Ariel, Alisson, Dilan, Michael). La llamada viaja directamente de ida y vuelta al socket :50051 del socio correspondiente sin broadcast tipo gateway.',
    def: () => cfg(),
    metodo: 'Se audita el flujo de RPCs Unary directas. Cada bifurcación evalúa códigos canónicos de gRPC (OK=0, INVALID_ARGUMENT=3, DEADLINE_EXCEEDED=4, NOT_FOUND=5, UNAVAILABLE=14). Si la persistencia local en Booking falla, se emite rpc CompensateTicket para liberar el aforo en el socio.',
    hallazgos: [
      ['alta', 'Canal punto a punto directo: no existe broadcast hacia operadores ajenos; la RPC se dirige exclusivamente al endpoint gRPC del socio dueño de la atracción.'],
      ['alta', 'Generación de QR canónico: el payload del QR incluye PNR, documento, turno y firma para validación offline en torniquetes.'],
      ['media', 'Recuperación idempotente: ante timeouts DEADLINE_EXCEEDED, se reintenta sobre el mismo canal gRPC conservando la metadata de idempotencia.'],
      ['ok', 'Sincronización JIT de cliente: se resuelve la identidad antes de emitir la reserva en el socio dueño.'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Ciclo de vida del ticket vía canal gRPC',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados canónicos de tickets para atracciones gestionados mediante RPCs directas. El número junto a cada estado refleja las reservas reales registradas en schema_atracciones.',
    def: (d) => estados(d),
    metodo: 'Se auditan las transiciones desde el handshake gRPC inicial hasta el escaneo de acceso en puerta/torniquete (Check-in / ASISTIDO).',
    hallazgos: [
      ['alta', 'Check-in por API de socios (Flujo 2): el operador escanea el voucher en torniquete y actualiza Booking mediante PATCH /reservas/{id}/checkin con su X-API-Key propia.'],
      ['media', 'Cancelación con liberación de aforo: una reserva devuelta antes del turno reasigna los cupos al aforo disponible del socio vía rpc CompensateTicket.'],
      ['ok', 'Compensación de fallos: el estado COMPENSATED registra transacciones revertidas en caso de error técnico en la emisión final.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'Fallo en reserva directa de atracción con el operador',
    foco: 'Confiabilidad de sistemas y canales gRPC',
    detecta: 'Puntos únicos de falla en canal punto a punto',
    intro: 'Descomposición de causas raíz de fallo en la comunicación gRPC directa con el operador dueño. Elimina la compuerta de broadcast y modela fallas de socket TCP:50051, timeouts y estados de red.',
    def: (d) => fta(d),
    metodo: 'Análisis de conjuntos de corte mínimos: caída de Booking Central vs errores de transporte gRPC (DEADLINE_EXCEEDED, UNAVAILABLE) con el operador socio dueño.',
    hallazgos: [
      ['alta', 'Punto único de falla del canal: si el socket gRPC :50051 del operador dueño está cerrado, Booking recibe UNAVAILABLE de inmediato.'],
      ['ok', 'Aislamiento de catálogo: la indisponibilidad de un parque u operador no interrumpe las reservas hacia otros operadores.'],
      ['media', 'Aforo dinámico por turno: si un horario agota sus cupos, la RPC retorna NOT_FOUND y el flujo redirige al turno contiguo con aforo.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Aforo concurrente en el operador dueño del turno',
    foco: 'Concurrencia y procesos',
    detecta: 'Sobrecupo, contención y agotamiento de aforo',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones. Dos turistas compiten por los últimos cupos del turno en los torniquetes del operador dueño.',
    def: () => petri(),
    metodo: 'Demostración de preservación de invariantes de capacidad: no se emiten más tickets que la cantidad de fichas de aforo definidas para el horario en el nodo dueño.',
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
  const [activo, setActivo] = useState('vivo');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/procesos/atracciones');
      setDatos(data);
    } catch (e) {
      if (silencioso) throw e;
      setError(e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'No se pudieron cargar los datos del proceso.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Se actualiza solo cada 5 s (sin botón).
  const auto = useAutoRefresh(cargar, 5000);

  const grafo = GRAFOS.find((g) => g.id === activo) || GRAFOS[0];
  const definicion = useMemo(() => grafo.def(datos), [grafo, datos]);
  const operadores = datos?.operadores ?? [];
  const enLinea = operadores.filter((a) => a.estado === 'EN_LINEA').length;

  const tiles = [
    { label: 'Reservas de atracciones socias', valor: (datos?.totalReservas ?? 0).toLocaleString('es-EC') },
    { label: 'Valor reservado', valor: usd(datos?.cobrado), nota: 'suma de todas las entradas' },
    { label: 'Reembolsado', valor: usd(datos?.reembolsado) },
    { label: 'Con ingreso / asistidos', valor: (datos?.asistidos ?? 0).toLocaleString('es-EC'), nota: 'CHECKED_IN / CONFIRMADO_ASISTIDO' },
    { label: 'Operadores en línea', valor: `${enLinea} / ${operadores.length}`, nota: 'sockets gRPC monitoreados' },
    { label: 'Canal de integración', valor: 'gRPC Unary / Protobuf', nota: 'Puerto :50051 · Punto a punto (sin broadcast)' },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de atracciones (Canal gRPC Punto a Punto)</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda, reserva directa con operador dueño vía gRPC (:50051), emisión de voucher QR y check-in · 4 grafos de análisis de fallas</div>
        </div>
        <ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={5000} />
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{t.valor}</div>
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

      {activo === 'vivo' && <ProcesoEnVivoAtracciones operadores={operadores} />}

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
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Hallazgos en la integración gRPC</div>
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

      {operadores.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 620 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Operador de atracciones', 'Código de nodo', 'Canal gRPC (:50051)', 'Estado / Código gRPC', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {operadores.map((a) => (
                <tr key={a.codigo} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 12px' }}>{a.nombre}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{a.codigo}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: T.azul }}>{`grpc://${limpio(a.codigo).toLowerCase()}:50051`}</td>
                  <td style={{ padding: '7px 12px' }}>
                    {{
                      EN_LINEA: '🟢 0 OK (HTTP/2)',
                      CAIDA: '🔴 14 UNAVAILABLE',
                      SIN_VERIFICAR: '⚪ 4 DEADLINE_EXCEEDED',
                      APAGADA: '⛔ 16 SHUTDOWN',
                    }[a.estado] || '⚪ 4 DEADLINE_EXCEEDED'}
                  </td>
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
