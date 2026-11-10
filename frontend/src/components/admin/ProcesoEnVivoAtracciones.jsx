import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Flujo del proceso de ATRACCIONES en tiempo real (espejo fiel de ProcesoEnVivo de vuelos y alojamientos).
 *
 * Lee GET /admin/procesos/atracciones/en-vivo?desde=<seq> cada 2 s. Cada evento es un
 * paso real del proceso con operadores socios de parques/tours vía canal directo gRPC punto a punto :50051
 * (búsqueda de turnos/aforo, sincronizar cliente, cotizar tickets adult/child, emisión de tickets QR
 * con el operador dueño, copia en schema_atracciones, confirmada con voucher, compensación y check-in/ingreso).
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#b91c1c', fondo: '#f7f8fa',
  ok: '#0d7a2f', okBg: '#e3f4e8', warn: '#9a5b00', warnBg: '#fdf1dc', bad: '#b42318', badBg: '#fde7e5',
};

const PASOS = [
  { id: 'busqueda', label: 'Búsqueda', sub: 'turnos y cupos', icon: '🔎' },
  { id: 'cliente', label: 'Visitante', sub: 'sincronizar JIT', icon: '👤' },
  { id: 'cotizar', label: 'Cotizar', sub: 'tarifas y cupos', icon: '🏷️' },
  { id: 'reserva_socio', label: 'Emisión gRPC', sub: 'nodo dueño :50051', icon: '🎟️' },
  { id: 'copia', label: 'Copia', sub: 'schema_atracciones', icon: '🗂️' },
  { id: 'confirmada', label: 'Confirmada', sub: 'voucher QR emitido', icon: '✅' },
];
const RAMAS = [
  { id: 'compensar', label: 'Compensar', sub: 'Saga: anular aforo', icon: '↩️' },
  { id: 'cancelacion', label: 'Cancelación', sub: 'del visitante', icon: '🛑' },
  { id: 'checkin', label: 'Check-in/Ingreso', sub: 'escaneo QR en parque', icon: '🎫' },
];
const TODOS = [...PASOS, ...RAMAS, { id: 'consulta', label: 'Otra consulta', icon: '🔁' }];
const INFO = Object.fromEntries(TODOS.map((p) => [p.id, p]));

const COLOR = {
  ok: { fg: T.ok, bg: T.okBg, icon: '✓' },
  aviso: { fg: T.warn, bg: T.warnBg, icon: '!' },
  error: { fg: T.bad, bg: T.badBg, icon: '✕' },
};
const COLOR_PUNTO = { ok: '#b91c1c', aviso: '#e8a400', error: '#d32f2f' };

const hora = (iso) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const usd = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
const duracion = (a, b) => {
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

function resumenReserva(eventos) {
  const pasos = new Set(eventos.map((e) => e.paso));
  const fallo = eventos.find((e) => e.resultado === 'error');
  const conMotivo = (r) => ({ ...r, motivo: fallo?.detalle ?? null, pasoFallo: fallo?.paso ?? null });
  if (pasos.has('cancelacion')) return conMotivo({ label: 'Cancelada', tono: 'aviso' });
  if (pasos.has('checkin')) return conMotivo({ label: 'Ingresó al Parque (QR)', tono: 'ok' });
  if (pasos.has('confirmada')) return conMotivo({ label: 'Confirmada (Tickets)', tono: 'ok' });
  if (fallo) {
    const compensado = eventos.some((e) => e.paso === 'compensar' && e.resultado === 'ok');
    return conMotivo({ label: `Falló en ${INFO[fallo.paso]?.label ?? fallo.paso}${compensado ? ' · aforo liberado' : ''}`, tono: 'error' });
  }
  if (pasos.has('compensar')) return conMotivo({ label: 'Compensada', tono: 'aviso' });
  if (pasos.has('reserva_socio')) return conMotivo({ label: 'Emisión con operador', tono: 'neutro' });
  if (!pasos.has('cotizar')) return conMotivo({ label: 'Búsqueda de cupos', tono: 'neutro' });
  return conMotivo({ label: 'En proceso', tono: 'neutro' });
}

function dividirEnReservas(eventos) {
  const porCorrelacion = new Map();
  for (const e of eventos) {
    if (!porCorrelacion.has(e.correlacion)) porCorrelacion.set(e.correlacion, []);
    porCorrelacion.get(e.correlacion).push(e);
  }
  const reservas = [];
  for (const [correlacion, evs] of porCorrelacion) {
    evs.sort((a, b) => a.seq - b.seq);
    const primerPaso = evs[0];
    const ultimoPaso = evs[evs.length - 1];
    const nodo = evs.find((e) => e.nodo)?.nodo ?? null;
    const monto = evs.find((e) => e.monto != null)?.monto ?? null;
    const cliente = evs.find((e) => e.cliente)?.cliente ?? null;
    reservas.push({
      id: correlacion,
      correlacion,
      nodo,
      monto,
      cliente,
      inicio: primerPaso.ts,
      fin: ultimoPaso.ts,
      eventos: evs,
      resumen: resumenReserva(evs),
    });
  }
  return reservas.reverse();
}

// ───────────────────────────── Diagrama SVG de Arquitectura ─────────────────────────────

const W = 1100;
const H = 460;
const SEG_MS = 500;

const BASE = {
  cliente: { x: 75, y: 230, w: 120, h: 62, titulo: 'Visitante', sub: 'Web / App (React)', icono: '🧑‍💻' },
  gateway: { x: 235, y: 230, w: 140, h: 70, titulo: 'API Booking', sub: '/api/v1 (NestJS Azure)', icono: '🚪' },
  atracciones: { x: 445, y: 135, w: 160, h: 68, titulo: 'Módulo Atracciones', sub: 'Canal gRPC Punto a Punto', icono: '🎡' },
  grpc: { x: 675, y: 135, w: 155, h: 68, titulo: 'Socket gRPC :50051', sub: 'HTTP/2 Unary + Protobuf', icono: '⚡' },
  bd: { x: 560, y: 360, w: 160, h: 68, titulo: 'PostgreSQL', sub: 'schema_atracciones · réplicas', icono: '🗄️' },
  bus: { x: 340, y: 360, w: 150, h: 62, titulo: 'Bus de Eventos', sub: 'RabbitMQ / Internal', icono: '📨' },
};

const ARISTAS = [
  ['cliente', 'gateway', 'HTTPS'],
  ['gateway', 'atracciones', ''],
  ['atracciones', 'grpc', 'gRPC directo'],
  ['atracciones', 'bd', 'SQL'],
  ['atracciones', 'bus', 'AMQP'],
];

function rutaDe(e) {
  const operador = e.nodo ? `operador:${e.nodo}` : 'grpc';
  switch (e.paso) {
    case 'busqueda':
    case 'consulta':
      return ['cliente', 'gateway', 'atracciones', operador, 'atracciones', 'gateway', 'cliente'];
    case 'cliente':
    case 'cotizar':
      return ['atracciones', 'grpc', operador, 'atracciones'];
    case 'reserva_socio':
      return ['atracciones', 'grpc', operador, 'atracciones'];
    case 'copia':
      return ['atracciones', 'bd'];
    case 'confirmada':
      return ['atracciones', 'bus', 'bd', 'atracciones', 'gateway', 'cliente'];
    case 'compensar':
      return ['atracciones', 'grpc', operador];
    case 'cancelacion':
      return ['cliente', 'gateway', 'atracciones', 'grpc', operador, 'atracciones', 'bd'];
    case 'checkin':
      return [operador, 'atracciones', 'bd'];
    default:
      return ['cliente', 'gateway', 'atracciones'];
  }
}

function Arquitectura({ eventos, operadores = [], reproducir }) {
  const [puntos, setPuntos] = useState([]);
  const [ahora, setAhora] = useState(() => performance.now());
  const vistos = useRef(new Set());
  const proximoInicio = useRef(0);
  const primeraCarga = useRef(true);

  const comps = useMemo(() => {
    const c = { ...BASE };
    const n = Math.max(operadores.length, 1);
    const alto = Math.min(82, 360 / n);
    operadores.forEach((a, i) => {
      c[`operador:${a.codigo}`] = {
        x: 915, y: 70 + i * alto, w: 165, h: Math.min(58, alto - 8),
        titulo: a.nombre || a.codigo,
        sub: a.estado === 'EN_LINEA' ? 'gRPC socket · en línea' : `gRPC socket · ${String(a.estado || '').toLowerCase().replace(/_/g, ' ')}`,
        icono: '🎡', caida: a.estado !== 'EN_LINEA',
      };
    });
    return c;
  }, [operadores]);

  const lanzar = (lista) => {
    const t = performance.now();
    let inicio = Math.max(t, proximoInicio.current);
    const nuevos = [];
    lista.forEach((e) => {
      const ruta = (rutaDe(e) || []).filter((id) => comps[id]);
      if (ruta.length >= 2) {
        const hasta = e.resultado === 'error' ? ruta.slice(0, Math.max(2, Math.ceil(ruta.length / 2) + 1)) : ruta;
        nuevos.push({ id: `${e.seq}-${t}`, ruta: hasta, inicio, resultado: e.resultado, paso: e.paso, detalle: e.detalle, nodo: e.nodo });
      }
      inicio += Math.min(1200, SEG_MS * 1.4);
    });
    proximoInicio.current = inicio;
    if (nuevos.length) setPuntos((p) => [...p.filter((x) => t < x.inicio + (x.ruta.length - 1) * SEG_MS + 900), ...nuevos].slice(-120));
  };

  useEffect(() => {
    const nuevos = eventos.filter((e) => !vistos.current.has(e.seq));
    nuevos.forEach((e) => vistos.current.add(e.seq));
    if (primeraCarga.current) { primeraCarga.current = false; if (eventos.length) return; }
    if (nuevos.length) lanzar(nuevos.slice(-25));
  }, [eventos]);

  useEffect(() => {
    if (reproducir?.eventos?.length) { proximoInicio.current = 0; lanzar(reproducir.eventos); }
  }, [reproducir]);

  const hayMovimiento = puntos.some((p) => ahora < p.inicio + (p.ruta.length - 1) * SEG_MS + 900);
  useEffect(() => {
    if (!hayMovimiento && puntos.length === 0) return undefined;
    let id;
    const tick = () => { setAhora(performance.now()); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    const limpiar = setTimeout(() => setPuntos((p) => p.filter((x) => performance.now() < x.inicio + (x.ruta.length - 1) * SEG_MS + 900)), 1500);
    return () => { cancelAnimationFrame(id); clearTimeout(limpiar); };
  }, [hayMovimiento, puntos.length]);

  const encendidos = {};
  const dibujados = [];
  for (const p of puntos) {
    const t = ahora - p.inicio;
    if (t < 0) continue;
    const tramos = p.ruta.length - 1;
    const total = tramos * SEG_MS;
    if (t > total + 900) continue;
    const k = Math.min(tramos - 1, Math.floor(t / SEG_MS));
    const f = t >= total ? 1 : (t - k * SEG_MS) / SEG_MS;
    const a = comps[p.ruta[k]];
    const b = comps[p.ruta[k + 1]];
    if (!a || !b) continue;
    const suave = f < 0.5 ? 2 * f * f : 1 - ((-2 * f + 2) ** 2) / 2;
    const x = a.x + (b.x - a.x) * suave;
    const y = a.y + (b.y - a.y) * suave;
    const llegando = t >= total ? p.ruta[tramos] : f > 0.85 ? p.ruta[k + 1] : p.ruta[k];
    const final = t >= total;
    const color = final && p.resultado !== 'ok' ? COLOR_PUNTO[p.resultado] : COLOR_PUNTO.ok;
    encendidos[llegando] = final ? (p.resultado === 'ok' ? 'ok' : p.resultado) : encendidos[llegando] || 'ok';
    dibujados.push({ id: p.id, x, y, color, final, opacidad: final ? Math.max(0, 1 - (t - total) / 900) : 1, a: p.ruta[k], b: p.ruta[k + 1] });
  }
  const tramosActivos = new Set(dibujados.filter((d) => !d.final).map((d) => [d.a, d.b].sort().join('|')));

  const aristas = [...ARISTAS, ...operadores.map((a) => ['grpc', `operador:${a.codigo}`, ':50051'])].filter(([a, b]) => comps[a] && comps[b]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Arquitectura del proceso de atracciones con tráfico en vivo" style={{ width: '100%', minWidth: 780, height: 'auto', display: 'block', background: '#fafbfc', borderRadius: 10 }}>
          <defs>
            <filter id="atr-brillo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect x={175} y={40} width={670} height={410} rx={14} fill="none" stroke="#fca5a5" strokeDasharray="6 5" />
          <text x={185} y={58} fontSize="11" fill={T.muted}>Booking Core API · Despliegue Azure (Módulo Atracciones & gRPC Gateway Unary)</text>
          <text x={875} y={30} fontSize="11" fill={T.muted}>Operadores socios (Gloria ms-catalog, Ariel, Alisson, Dilan, Michael)</text>

          {aristas.map(([a, b, etiqueta]) => {
            const A = comps[a]; const B = comps[b];
            const activa = tramosActivos.has([a, b].sort().join('|'));
            return (
              <g key={`${a}-${b}`}>
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={activa ? T.azul : T.border} strokeWidth={activa ? 2.5 : 1.5} />
                {etiqueta && <text x={(A.x + B.x) / 2 + (A.x === B.x ? 6 : 0)} y={(A.y + B.y) / 2 - 5} fontSize="9.5" fill={T.muted} textAnchor={A.x === B.x ? 'start' : 'middle'} paintOrder="stroke" stroke="#fafbfc" strokeWidth="3">{etiqueta}</text>}
              </g>
            );
          })}

          {Object.entries(comps).map(([id, c]) => {
            const luz = encendidos[id];
            const borde = luz === 'error' ? COLOR_PUNTO.error : luz === 'aviso' ? COLOR_PUNTO.aviso : luz ? T.azul : c.caida ? '#c3c2b7' : T.border;
            return (
              <g key={id} opacity={c.caida ? 0.6 : 1}>
                <rect x={c.x - c.w / 2} y={c.y - c.h / 2} width={c.w} height={c.h} rx={8} fill={T.surface} stroke={borde} strokeWidth={luz ? 2 : 1} filter={luz ? 'url(#atr-brillo)' : undefined} />
                <text x={c.x} y={c.y - 4} fontSize="12" fontWeight="700" fill={T.text} textAnchor="middle">{c.icono} {c.titulo}</text>
                <text x={c.x} y={c.y + 12} fontSize="9.5" fill={T.muted} textAnchor="middle">{c.sub}</text>
              </g>
            );
          })}

          {dibujados.map((d) => (
            <circle key={d.id} cx={d.x} cy={d.y} r={6} fill={d.color} opacity={d.opacidad} filter="url(#atr-brillo)" />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ───────────────────────────── Componente Principal ─────────────────────────────

export function ProcesoEnVivoAtracciones({ operadores = [] }) {
  const [eventos, setEventos] = useState([]);
  const [contadores, setContadores] = useState({});
  const [filtro, setFiltro] = useState('');
  const [mostrarBusquedas, setMostrarBusquedas] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);
  const [pausa, setPausa] = useState(false);
  const ultimoSeq = useRef(0);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/procesos/atracciones/en-vivo?desde=${ultimoSeq.current}`);
      if (data?.ultimoSeq) ultimoSeq.current = data.ultimoSeq;
      if (data?.contadores) setContadores(data.contadores);
      if (data?.eventos?.length) {
        setEventos((prev) => [...prev, ...data.eventos].slice(-200));
      }
    } catch {
      // Silencioso en reintentos periódicos
    }
  }, []);

  useEffect(() => {
    cargar();
    if (pausa) return undefined;
    const t = setInterval(cargar, 2000);
    return () => clearInterval(t);
  }, [cargar, pausa]);

  const reservas = useMemo(() => dividirEnReservas(eventos), [eventos]);
  const reservasFiltradas = useMemo(() => {
    return reservas.filter((r) => {
      if (!mostrarBusquedas && r.resumen.label === 'Búsqueda de cupos') return false;
      if (!filtro) return true;
      const f = filtro.toLowerCase();
      return (
        r.correlacion.toLowerCase().includes(f) ||
        (r.cliente && r.cliente.toLowerCase().includes(f)) ||
        (r.nodo && r.nodo.toLowerCase().includes(f))
      );
    });
  }, [reservas, mostrarBusquedas, filtro]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: T.text2 }}>
          <span style={{ color: pausa ? T.warn : '#d32f2f' }}>●</span>
          <span>{pausa ? 'Pausado' : 'En vivo · actualiza cada 2 s · canal gRPC directo :50051'}</span>
        </div>
        <button
          type="button"
          onClick={() => setPausa((p) => !p)}
          style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
        >
          {pausa ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: '0.85rem', color: T.text2, marginBottom: 12 }}>
            Cada punto es un paso real que pasa por Booking: sale del visitante, viaja por los sockets y componentes tocados, y se apaga al completarse. Toca una reserva para ver su recorrido.
          </div>
          <Arquitectura eventos={eventos} operadores={operadores} reproducir={seleccionada} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 600, color: T.muted }}>Últimas operaciones:</span>
            {TODOS.map((p) => {
              const c = contadores[p.id] || { ok: 0, error: 0 };
              if (c.ok === 0 && c.error === 0) return null;
              return (
                <span key={p.id} style={{ background: T.fondo, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 6px' }}>
                  {p.icon} {p.label} <b style={{ color: T.ok }}>✓{c.ok}</b> {c.error > 0 && <b style={{ color: T.bad }}>✕{c.error}</b>}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: T.text }}>Tickets y reservas de atracciones</h4>
            <div style={{ fontSize: '0.75rem', color: T.muted }}>Toca una reserva para repetir su recorrido en el diagrama interactivo.</div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: T.text2, cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarBusquedas} onChange={(e) => setMostrarBusquedas(e.target.checked)} />
            Mostrar búsquedas sin tickets
          </label>

          <input
            type="search"
            placeholder="Visitante, operador, correlación…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.8rem' }}
          />

          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {reservasFiltradas.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: T.muted, textAlign: 'center', padding: '20px 0' }}>
                Todavía no hay operaciones recientes. Haz una búsqueda o reserva de atracciones en el sitio para verla en vivo.
              </div>
            ) : (
              reservasFiltradas.map((r) => {
                const activa = seleccionada?.id === r.id;
                const tono = COLOR[r.resumen.tono] || { fg: T.text, bg: T.fondo };
                return (
                  <div
                    key={r.id}
                    onClick={() => setSeleccionada(r)}
                    style={{
                      border: `1px solid ${activa ? T.azul : T.border}`,
                      background: activa ? '#fef2f2' : T.surface,
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: T.text }}>
                        {r.cliente || 'Visitante anónimo'}
                      </span>
                      {r.monto != null && <span style={{ fontSize: '0.82rem', fontWeight: 700, color: T.azul }}>{usd(r.monto)}</span>}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                      <span style={{ background: tono.bg, color: tono.fg, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {r.resumen.label}
                      </span>
                      <span style={{ color: T.muted }}>{hora(r.inicio)} · {duracion(r.inicio, r.fin)}</span>
                    </div>

                    {r.nodo && (
                      <div style={{ fontSize: '0.72rem', color: T.muted }}>
                        Operador: <b>{r.nodo}</b>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
