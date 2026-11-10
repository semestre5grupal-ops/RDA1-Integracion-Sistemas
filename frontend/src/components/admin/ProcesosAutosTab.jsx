import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Vista de Autos en "Servicios & Prov." del admin: el proceso de reserva con
 * agencias de autos socias mediante canal directo gRPC (HTTP/2, Protobuf, puerto 50051
 * punto a punto con el nodo dueño, sin broadcast gateway).
 *
 * Ilustra los 4 grafos de análisis de fallas (CFG, máquina de estados, árbol de fallas y
 * red de Petri) alimentados con datos de schema_autos y config_proveedor.
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
  A([Inicio: Reserva directa de auto con nodo dueño]) --> B{¿Metadata gRPC trae Idempotency-Key y conductor?}
  B -- no --> E1[/gRPC Code 3 INVALID_ARGUMENT/]
  B -- sí --> C[rpc CheckVehicleAvailability nodo dueño :50051]
  C --> D{¿gRPC OK y vehículo libre?}
  D -- no --> E2[/gRPC Code 5 NOT_FOUND o cupo agotado/]
  D -- sí --> S[rpc SyncDriver conductor JIT en nodo dueño]
  S --> F[Calcular tarifa congelada con depósito en garantía]
  F --> G[rpc ReserveVehicle nodo dueño con Idempotency-Key]
  G --> H{¿Timeout socket o red?}
  H -- sí --> R[Reintento por canal gRPC idempotente]
  R --> I
  H -- no --> I{¿gRPC Code 0 OK y PNR emitido?}
  I -- no --> E3[/gRPC Code 14 UNAVAILABLE socio no confirmó/]
  I -- sí --> L[Guardar copia en schema_autos.autos_reservas]
  L --> M{¿Se persistió localmente?}
  M -- sí --> OK([200 OK Renta confirmada con voucher de retiro])
  M -- no --> W[Compensar Saga: rpc CancelVehicleReservation nodo dueño] --> E4[/gRPC Code 10 ABORTED Se liberó en socio/]
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
  state "Canal gRPC directo con nodo dueño" as CANAL
  state "rpc CheckVehicleAvailability (:50051)" as CHECK
  state "rpc ReserveVehicle (Unary Protobuf)" as RPC_RESERVE
  state "Reintento idempotente en socket gRPC" as RECU
  state "CONFIRMADA · ${n('CONFIRMADA') + n('RESERVADO')}" as CONFIRMADA
  state "ACTIVA / RETIRADO · ${n('ACTIVA')}" as ACTIVA
  state "CONFIRMADO_ASISTIDO · ${n('CONFIRMADO_ASISTIDO')}" as ASISTIDO
  state "COMPLETADA · ${n('COMPLETADA')}" as COMPLETADA
  state "CANCELADA · ${n('CANCELADA') + n('CANCELADO')}" as CANCELADA
  [*] --> CANAL: handshake HTTP/2 con socio dueño
  CANAL --> CHECK: consulta de disponibilidad
  CHECK --> CANCELADA: gRPC Code 5 (sin unidades)
  CHECK --> RPC_RESERVE: vehículo seleccionado
  RPC_RESERVE --> RECU: DEADLINE_EXCEEDED (timeout)
  RECU --> CONFIRMADA: confirmación recuperada
  RPC_RESERVE --> CONFIRMADA: gRPC OK + orden guardada
  RPC_RESERVE --> CANCELADA: falla copia local, rpc CancelReservation (Saga)
  CONFIRMADA --> ACTIVA: retiro en sucursal (Check-in con licencia)
  CONFIRMADA --> ASISTIDO: check-in del socio (Flujo 2, su X-API-Key)
  ACTIVA --> COMPLETADA: devolución de vehículo e inspección de km
  CONFIRMADA --> CANCELADA: cancelación antes de recogida + reembolso 100%
  ASISTIDO --> COMPLETADA: cierre de orden
  COMPLETADA --> [*]
  CANCELADA --> [*]`;
}

function fta(d) {
  return `flowchart TD
  TOP["⚠ Fallo en reserva directa de auto con el socio"] --> G0{{OR}}
  G0 --> A1["Booking Central no responde"]
  G0 --> A2["Canal gRPC con el socio dueño no responde"]
  G0 --> A3["El socio dueño rechaza la reserva del vehículo"]
  G0 --> A4["Fallo en cobro o persistencia local"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos central caída"))
  A2 --> G2{{OR}}
  G2 --> C1(("Socket TCP:50051 cerrado o caído"))
  G2 --> C2(("gRPC Code 4 DEADLINE_EXCEEDED"))
  G2 --> C3(("gRPC Code 14 UNAVAILABLE"))
  A3 --> G4{{OR}}
  G4 --> E1(("Vehículo ocupado / NOT_FOUND"))
  G4 --> E2(("Circuit Breaker OPEN por tasa de fallos"))
  G4 --> E3(("Rechazo en sincronización JIT"))
  A4 --> G5{{OR}}
  G5 --> F1(("Error en pasarela de pagos MS_PAG"))
  G5 --> F2(("Fallo DB local: compensa por rpc Cancel"))
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
  P1(("Cliente A · ●")) --> T1["▮ rpc ReserveVehicle A (nodo dueño)"]
  P2(("Cliente B · ●")) --> T2["▮ rpc ReserveVehicle B (nodo dueño)"]
  S(("Vehículo en nodo dueño · ●")) --> T1
  S --> T2
  T1 --> RA(("A CONFIRMADA (gRPC OK)"))
  T2 --> RB(("B → Code 5 NOT_FOUND / sin stock"))
  RA --> T3["▮ retiro de vehículo (Check-in)"]
  T3 --> AS(("A ACTIVA / ASISTIDO"))
  AS --> T4["▮ devolución e inspección"]
  T4 --> S
  RA --> T5["▮ rpc CancelVehicleReservation"]
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
    titulo: 'Reserva directa punto a punto vía gRPC (HTTP/2 :50051)',
    foco: 'Código y algoritmos gRPC',
    detecta: 'Códigos de error gRPC no capturados, compensaciones LIFO',
    intro: 'Canal binario Unary gRPC directo con el microservicio dueño del auto (Daniel RutaLibre o Mateo Maneja de Una). La llamada viaja directamente de ida y vuelta al socket :50051 del socio correspondiente sin broadcast tipo gateway.',
    def: () => cfg(),
    metodo: 'Se audita el flujo de RPCs Unary directas. Cada bifurcación evalúa códigos canónicos de gRPC (OK=0, INVALID_ARGUMENT=3, DEADLINE_EXCEEDED=4, NOT_FOUND=5, UNAVAILABLE=14). Si la base de datos de Booking falla al persistir, se emite rpc CancelVehicleReservation para no retener el auto.',
    hallazgos: [
      ['alta', 'Canal punto a punto directo: no existe broadcast hacia agencias ajenas; la RPC se dirige exclusivamente al endpoint gRPC del socio dueño del auto.'],
      ['alta', 'Compensación Saga LIFO: si Booking no puede guardar la copia local, se emite cancelación gRPC al socio para liberar el vehículo inmediatamente.'],
      ['media', 'Recuperación idempotente: ante timeouts DEADLINE_EXCEEDED, se reintenta sobre el mismo canal gRPC conservando la metadata de idempotencia.'],
      ['ok', 'Sincronización JIT de conductor: se resuelve la identidad antes de invocar la orden final en el socio dueño.'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Ciclo de vida del arriendo vía canal gRPC',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados canónicos del arriendo de vehículos gestionados mediante RPCs directas. El número junto a cada estado refleja las reservas reales registradas en schema_autos.',
    def: (d) => estados(d),
    metodo: 'Se auditan las transiciones desde el handshake gRPC inicial hasta el retiro en sucursal (Check-in / ASISTIDO) y la devolución final con inspección de kilometraje.',
    hallazgos: [
      ['alta', 'Check-in por API de socios (Flujo 2): la agencia socia reporta el retiro del vehículo mediante PATCH /reservas/{id}/checkin con su X-API-Key propia.'],
      ['media', 'Retención por garantía: el estado ACTIVA bloquea el vehículo hasta que la devolución registre km_retorno y cierre la orden en COMPLETADA.'],
      ['ok', 'Cancelación con devolución inmediata: una reserva CONFIRMADA puede cancelarse antes de la fecha de recogida liberando el inventario en el socio.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'Fallo en reserva directa de auto con el socio',
    foco: 'Confiabilidad de sistemas y canales gRPC',
    detecta: 'Puntos únicos de falla en canal punto a punto',
    intro: 'Descomposición de causas raíz de fallo en la comunicación gRPC directa con la agencia dueña. Elimina la compuerta de broadcast y modela fallas de socket TCP:50051, timeouts y estados de red.',
    def: (d) => fta(d),
    metodo: 'Análisis de conjuntos de corte mínimos: caída de Booking Central vs errores de transporte gRPC (DEADLINE_EXCEEDED, UNAVAILABLE) con la agencia socia dueña.',
    hallazgos: [
      ['alta', 'Punto único de falla del canal: si el socket gRPC :50051 del socio dueño está cerrado, Booking recibe UNAVAILABLE de inmediato.'],
      ['ok', 'Aislamiento de fallos: la caída o lentitud de una agencia de autos no afecta en absoluto las reservas dirigidas a otra agencia.'],
      ['media', 'Circuit Breaker por socket: si el socio dueño supera el umbral de fallos, el breaker se abre evitando peticiones inútiles.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Concurrencia en nodo dueño sobre el último vehículo',
    foco: 'Concurrencia y procesos',
    detecta: 'Inanición, colisiones y sobre-alquiler',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones. Dos clientes compiten en simultáneo por el único vehículo de una categoría en la sucursal del socio dueño.',
    def: () => petri(),
    metodo: 'Demostración matemática de exclusión mutua: la primera RPC Unary en confirmar consume la ficha del vehículo en el nodo dueño; la segunda recibe gRPC Code 5 NOT_FOUND / sin stock.',
    hallazgos: [
      ['ok', 'Exclusión mutua garantizada: el socio dueño serializa la reserva y responde conflicto a peticiones concurrentes sobre la misma patente.'],
      ['ok', 'Retorno de ficha por cancelación: si el cliente A cancela su reserva, la compensación devuelve el vehículo al inventario disponible.'],
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
    { label: 'Agencias en línea', valor: `${enLinea} / ${agencias.length}`, nota: 'sockets gRPC monitoreados' },
    { label: 'Canal de integración', valor: 'gRPC Unary / Protobuf', nota: 'Puerto :50051 · Punto a punto (sin broadcast)' },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de autos (Canal gRPC Punto a Punto)</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda, reserva directa con nodo dueño vía gRPC (:50051), cotización y entrega de vehículo · 4 grafos de análisis de fallas</div>
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{t.valor}</div>
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

      {agencias.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 620 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Agencia de autos', 'Código de nodo', 'Canal gRPC (:50051)', 'Estado / Código gRPC', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {agencias.map((a) => (
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
