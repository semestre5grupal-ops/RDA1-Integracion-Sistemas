import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ProcesoEnVivo } from './ProcesoEnVivo';

/**
 * Pestaña "Procesos" del admin: el proceso de reserva de vuelos con aerolíneas
 * socias visto con 4 grafos (CFG, máquina de estados, árbol de fallas y red de
 * Petri). Los grafos se dibujan con Mermaid y se alimentan con datos en vivo de
 * GET /admin/procesos/vuelos: reservas por estado y estado real de cada aerolínea.
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#003580', ok: '#0d7a2f', warn: '#9a5b00', bad: '#b42318',
  chipOk: '#e3f4e8', chipWarn: '#fdf1dc', chipBad: '#fde7e5', fondo: '#f7f8fa',
};

const usd = (n) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto seguro dentro de una etiqueta Mermaid entre comillas. */
const limpio = (s) => String(s ?? '').replace(/["[\]{}()<>#;|`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// ───────────────────────────── Definiciones de los grafos ─────────────────────────────

function cfg() {
  return `flowchart TD
  A([Inicio: POST /bookings con holdId NODO~id]) --> B{¿Trae Idempotency-Key?}
  B -- no --> E1[/400 Falta Idempotency-Key/]
  B -- sí --> C[GET hold en la aerolínea]
  C --> D{¿2xx y lockedPrice.total mayor a 0?}
  D -- no --> E2[/409 Hold sin precio o error de aerolínea/]
  D -- sí --> F[Cobrar en MS_PAG con el precio del hold]
  F --> G{¿Pago APROBADO?}
  G -- no --> E3[/402 o 502 Pago no aprobado/]
  G -- sí --> H[POST booking en la aerolínea con paymentReference real]
  H --> I{¿2xx y trae bookingId?}
  I -- no --> J[Reembolsar en MS_PAG]
  J --> K{¿Reembolso OK?}
  K -- sí --> E4[/Error de aerolínea + se reembolsó/]
  K -- no --> E5[/El dinero NO volvió: solo queda en el log/]
  I -- sí --> L[Guardar copia en vuelos_reservas_socio]
  L --> M{¿Se guardó?}
  M -- sí --> OK([201 Reserva confirmada])
  M -- no --> W[Solo log] --> OK2([201 pero sin copia en Booking])
  classDef err fill:#fde7e5,stroke:#b42318,color:#5c120c
  classDef ok fill:#e3f4e8,stroke:#0d7a2f,color:#0b3d1a
  classDef riesgo fill:#fdf1dc,stroke:#9a5b00,color:#4a2c00
  class E1,E2,E3,E4 err
  class OK ok
  class E5,OK2,W riesgo`;
}

function estados(d) {
  const n = (k) => d?.porEstado?.[k] ?? 0;
  return `stateDiagram-v2
  state "OFERTA" as OFERTA
  state "HELD (15 min)" as HELD
  state "EXPIRED" as EXPIRED
  state "Cobrando en MS_PAG" as Cobrando
  state "Reservando en aerolínea" as Reservando
  state "Reembolsada" as Reembolsada
  state "CONFIRMED · ${n('CONFIRMED')}" as CONFIRMED
  state "TICKETED · ${n('TICKETED')}" as TICKETED
  state "CANCELLATION_PENDING · ${n('CANCELLATION_PENDING')}" as PEND
  state "CANCELLED · ${n('CANCELLED')}" as CANCELLED
  [*] --> OFERTA: búsqueda
  OFERTA --> HELD: POST /offers/hold
  HELD --> EXPIRED: vence el TTL
  HELD --> Cobrando: Confirmar pago
  Cobrando --> HELD: pago rechazado
  Cobrando --> Reservando: pago aprobado
  Reservando --> Reembolsada: aerolínea rechaza
  Reservando --> CONFIRMED: aerolínea confirma
  CONFIRMED --> TICKETED: emitir boletos
  CONFIRMED --> PEND: cancelar asíncrono
  TICKETED --> PEND: cancelar asíncrono
  CONFIRMED --> CANCELLED: cancelar + reembolso
  TICKETED --> CANCELLED: cancelar + reembolso
  PEND --> CANCELLED: solo al abrir el detalle
  EXPIRED --> [*]
  Reembolsada --> [*]
  CANCELLED --> [*]`;
}

function fta(d) {
  const aerolineas = d?.aerolineas ?? [];
  const lineas = [];
  const clases = { EN_LINEA: [], CAIDA: [], SIN_VERIFICAR: [], APAGADA: [] };
  aerolineas.forEach((a, i) => {
    const id = `AL${i}`;
    const icono = { EN_LINEA: '🟢', CAIDA: '🔴', SIN_VERIFICAR: '⚪', APAGADA: '⛔' }[a.estado] || '⚪';
    lineas.push(`  G2 --> ${id}["${icono} ${limpio(a.nombre)}"]`);
    clases[a.estado]?.push(id);
  });
  const caidas = aerolineas.filter((a) => a.estado !== 'EN_LINEA').length;
  const etiquetaAnd = aerolineas.length
    ? `AND · ${caidas} de ${aerolineas.length} aerolíneas sin servicio`
    : 'AND · no hay aerolíneas registradas';
  return `flowchart TD
  TOP["⚠ El cliente no puede reservar un vuelo"] --> G0{{OR}}
  G0 --> A1["Booking no responde"]
  G0 --> A2["La búsqueda no trae vuelos"]
  G0 --> A3["El pago falla"]
  G0 --> A4["La aerolínea rechaza la reserva"]
  A1 --> G1{{OR}}
  G1 --> B1(("App Service caído"))
  G1 --> B2(("Base de datos caída"))
  G1 --> B3(("Despliegue roto"))
  A2 --> G2{{"${etiquetaAnd}"}}
${lineas.join('\n') || '  G2 --> SIN(("Registrar aerolíneas en Servicios & Prov."))'}
  A3 --> G4{{OR}}
  G4 --> E1(("MS_PAG caído"))
  G4 --> E2(("Fondos o fraude"))
  A4 --> G5{{OR}}
  G5 --> F1(("Hold expirado"))
  G5 --> F2(("Sin cupo"))
  classDef top fill:#fde7e5,stroke:#b42318,color:#5c120c,font-weight:bold
  classDef gate fill:#eef1f5,stroke:#4a5563,color:#17202b
  classDef base fill:#fdf1dc,stroke:#9a5b00,color:#4a2c00
  classDef vivo fill:#e3f4e8,stroke:#0d7a2f,color:#0b3d1a
  classDef caido fill:#fde7e5,stroke:#b42318,color:#5c120c
  classDef neutro fill:#f1f1ef,stroke:#898781,color:#3a3a38
  class TOP top
  class G0,G1,G2,G4,G5 gate
  class B1,B2,B3,E1,E2,F1,F2 base
${clases.EN_LINEA.length ? `  class ${clases.EN_LINEA.join(',')} vivo` : ''}
${clases.CAIDA.length ? `  class ${clases.CAIDA.join(',')} caido` : ''}
${[...clases.SIN_VERIFICAR, ...clases.APAGADA].length ? `  class ${[...clases.SIN_VERIFICAR, ...clases.APAGADA].join(',')} neutro` : ''}`;
}

function petri() {
  return `flowchart LR
  P1(("Cliente A · ●")) --> T1["▮ hold A"]
  P2(("Cliente B · ●")) --> T2["▮ hold B"]
  S(("Asiento libre · ●")) --> T1
  S --> T2
  T1 --> HA(("A con hold"))
  T2 --> HB(("B con hold"))
  HA --> T3["▮ pagar y reservar A"]
  HB --> T4["▮ pagar y reservar B"]
  T3 --> RA(("A reservado"))
  T4 --> RB(("B reservado"))
  HA --> T5["▮ expira A"]
  HB --> T6["▮ expira B"]
  T5 --> S
  T6 --> S
  RA --> T7["▮ cancelar A"]
  T7 --> S
  classDef lugar fill:#ffffff,stroke:#0b4f9c,color:#17202b
  classDef trans fill:#17202b,stroke:#17202b,color:#ffffff
  class P1,P2,S,HA,HB,RA,RB lugar
  class T1,T2,T3,T4,T5,T6,T7 trans`;
}

// ───────────────────────────── Contenido por grafo ─────────────────────────────

const GRAFOS = [
  {
    id: 'cfg',
    tab: 'Flujo de Control (CFG)',
    titulo: 'Crear una reserva con una aerolínea socia',
    foco: 'Código y algoritmos',
    detecta: 'Ramas no cubiertas, excepciones no capturadas',
    intro: 'Recorrido de reservar() en vuelos-socios.middleware.ts. Cada rombo es una decisión; cada salida roja es un camino de error y las amarillas esconden una excepción.',
    def: () => cfg(),
    metodo: 'Se cuentan las ramas (salidas de cada rombo) y se cruzan con las pruebas. Cobertura actual: 6 de 12 ramas con prueba en vuelos-socios.spec.ts.',
    hallazgos: [
      ['alta', 'Reembolso que falla en silencio (K → no): el cliente queda cobrado sin reserva y solo queda una línea en el log.'],
      ['alta', 'Copia no guardada (M → no): la aerolínea confirmó, pero el dueño recibe 404 al abrir su reserva por la protección IDOR.'],
      ['media', 'Ramas sin prueba: hold sin precio, pago rechazado, reembolso fallido y copia fallida.'],
      ['ok', 'Sin Idempotency-Key no se cobra, y si la aerolínea rechaza sí se reembolsa: ambas ramas tienen prueba.'],
    ],
  },
  {
    id: 'estados',
    tab: 'Máquina de Estados',
    titulo: 'Vida de una reserva de vuelo',
    foco: 'Ciclo de vida y negocio',
    detecta: 'Transiciones ilegales, estados muertos',
    intro: 'Estados del contrato vuelos-openapi v2 más los pasos internos de Booking. El número junto a cada estado es cuántas reservas de aerolíneas socias están hoy en él.',
    def: (d) => estados(d),
    metodo: 'Se buscan flechas que el negocio prohíbe pero el código permite, y estados de los que nada te saca.',
    hallazgos: [
      ['alta', 'CANCELLATION_PENDING casi muerto: Booking solo actualiza la copia cuando alguien abre el detalle. Si nadie la abre, queda pendiente y el reembolso no se ejecuta.'],
      ['media', 'Cancelar dos veces: lo frena la clave de idempotencia del reembolso, pero solo si el monto es el mismo.'],
      ['media', '"Reembolsada" no se guarda en ninguna tabla: el cliente no la ve en Mis Reservas.'],
      ['ok', 'Un hold expirado no se puede pagar: al leerlo la aerolínea responde 404 y Booking corta antes de cobrar.'],
    ],
  },
  {
    id: 'fta',
    tab: 'Árbol de Fallas (FTA)',
    titulo: 'El cliente no puede reservar un vuelo',
    foco: 'Confiabilidad de sistemas',
    detecta: 'Combinación de eventos que tumban el servicio',
    intro: 'Del evento malo hacia sus causas. OR: basta una causa. AND: tienen que ocurrir todas. Las hojas de la búsqueda son las aerolíneas registradas, con su estado real del último ping.',
    def: (d) => fta(d),
    metodo: 'Se buscan los conjuntos de corte mínimos: la combinación más pequeña de causas que tumba el servicio. Un conjunto de una sola causa es un punto único de falla.',
    hallazgos: [
      ['alta', 'Puntos únicos de falla: App Service, base de datos y MS_PAG. Cualquiera, solo, impide reservar.'],
      ['ok', 'La búsqueda es robusta: la puerta AND exige que fallen todas las aerolíneas a la vez (consulta en paralelo con timeout por cada una).'],
      ['media', 'Evento relacionado "cobrado sin reserva" = AND(aerolínea rechaza, reembolso falla): el camino amarillo del CFG.'],
    ],
  },
  {
    id: 'petri',
    tab: 'Red de Petri',
    titulo: 'Dos clientes y el último asiento',
    foco: 'Concurrencia y procesos',
    detecta: 'Inanición (starvation), bloqueos mutuos',
    intro: 'Círculos = lugares con fichas (●). Barras = transiciones, que se disparan cuando todos sus lugares de entrada tienen ficha. Hay dos clientes y un solo asiento libre.',
    def: () => petri(),
    metodo: 'Bloqueo mutuo: un marcado sin transiciones habilitadas. Inanición: una transición habilitada que nunca llega a dispararse.',
    hallazgos: [
      ['ok', 'Sin bloqueo mutuo: solo un hold toma la ficha del asiento y el TTL la devuelve si el cliente abandona.'],
      ['ok', 'Sin inanición en la búsqueda: cada aerolínea tiene su propio timeout y se consultan en paralelo.'],
      ['media', 'Doble clic en "Confirmar pago": MS_PAG cobra una vez, pero la reserva se reenvía dos veces a la aerolínea; si no respeta la Idempotency-Key, crea dos.'],
      ['media', 'Token OAuth2 vencido con búsquedas simultáneas: todas piden token a la vez. No bloquea, pero multiplica las llamadas.'],
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
      // useMaxWidth: false -> el grafo se dibuja a su tamaño real y el contenedor
      // hace scroll horizontal, en vez de encogerse hasta ser ilegible.
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
      .then((mermaid) => mermaid.render(`grafo-${id}-${Date.now()}`, definicion))
      .then(({ svg }) => {
        if (!vivo || !ref.current) return;
        ref.current.innerHTML = svg;
        // Ajuste al ancho disponible, sin bajar del 60 % del tamaño real (legible);
        // si aun así no cabe, el contenedor hace scroll horizontal.
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

export function ProcesosTab({ refreshKey = 0 }) {
  const [activo, setActivo] = useState('vivo');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/procesos/vuelos');
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

  const enVivo = activo === 'vivo';
  const grafo = GRAFOS.find((g) => g.id === activo) || GRAFOS[0];
  const definicion = useMemo(() => (enVivo ? '' : grafo.def(datos)), [grafo, datos, enVivo]);
  const aero = datos?.aerolineas ?? [];
  const enLinea = aero.filter((a) => a.estado === 'EN_LINEA').length;

  const tiles = [
    { label: 'Reservas con aerolíneas socias', valor: (datos?.totalReservas ?? 0).toLocaleString('es-EC') },
    { label: 'Valor reservado', valor: usd(datos?.cobrado), nota: 'suma de todas las reservas' },
    { label: 'Reembolsado', valor: usd(datos?.reembolsado) },
    { label: 'Aerolíneas en línea', valor: `${enLinea} / ${aero.length}`, nota: 'según el último ping real' },
    { label: 'Fuente de vuelos', valor: datos?.fuente === 'local' ? 'Base local' : datos?.fuente === 'mixto' ? 'Mixta' : 'Aerolíneas', nota: `timeout ${datos?.timeoutMs ?? 8000} ms por aerolínea` },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Proceso de reserva de vuelos</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>Búsqueda, hold, cobro, reserva y cancelación con las aerolíneas socias · 4 grafos de análisis de fallas</div>
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

      {enVivo && <ProcesoEnVivo />}

      {!enVivo && (
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

      {aero.length > 0 && activo === 'fta' && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 520 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Aerolínea', 'Código', 'Estado', 'Latencia', 'Último ping'].map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {aero.map((a) => (
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
