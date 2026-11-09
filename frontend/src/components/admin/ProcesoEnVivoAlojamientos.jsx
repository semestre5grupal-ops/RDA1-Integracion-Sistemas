import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Flujo del proceso de ALOJAMIENTOS en tiempo real (espejo de ProcesoEnVivo de vuelos).
 *
 * Lee GET /admin/procesos/alojamientos/en-vivo?desde=<seq> cada 2 s. Cada evento es un
 * paso real del Saga del agregador (búsqueda, sincronizar cliente, cotizar, crear la
 * orden en el hotel, recuperar por idempotency_key, copia, confirmada, compensar,
 * cancelación y check-in), con una correlación por reserva para seguirla de punta a punta.
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#6a1b9a', fondo: '#f7f8fa',
  ok: '#0d7a2f', okBg: '#e3f4e8', warn: '#9a5b00', warnBg: '#fdf1dc', bad: '#b42318', badBg: '#fde7e5',
};

const PASOS = [
  { id: 'busqueda', label: 'Búsqueda', sub: 'disponibilidad en vivo', icon: '🔎' },
  { id: 'cliente', label: 'Cliente', sub: 'sincronizar huésped', icon: '👤' },
  { id: 'cotizar', label: 'Cotizar', sub: 'precio congelado', icon: '🏷️' },
  { id: 'crear_orden', label: 'Crear orden', sub: 'en el hotel', icon: '🏨' },
  { id: 'copia', label: 'Copia', sub: 'RESERVADO', icon: '🗂️' },
  { id: 'confirmada', label: 'Confirmada', sub: 'fin feliz', icon: '✅' },
];
const RAMAS = [
  { id: 'recuperar', label: 'Recuperar', sub: 'por idempotency_key', icon: '🔁' },
  { id: 'compensar', label: 'Compensar', sub: 'Saga: anular en el hotel', icon: '↩️' },
  { id: 'cancelacion', label: 'Cancelación', sub: 'del cliente', icon: '🛑' },
  { id: 'checkin', label: 'Check-in', sub: 'del hotel (Flujo 2)', icon: '🛎️' },
];
const TODOS = [...PASOS, ...RAMAS, { id: 'consulta', label: 'Otra consulta', icon: '🔁' }];
const INFO = Object.fromEntries(TODOS.map((p) => [p.id, p]));

const COLOR = {
  ok: { fg: T.ok, bg: T.okBg, icon: '✓' },
  aviso: { fg: T.warn, bg: T.warnBg, icon: '!' },
  error: { fg: T.bad, bg: T.badBg, icon: '✕' },
};
const COLOR_PUNTO = { ok: '#8e24aa', aviso: '#e8a400', error: '#d32f2f' };

const hora = (iso) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const usd = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
const duracion = (a, b) => {
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

function resumenReserva(eventos) {
  const pasos = new Set(eventos.map((e) => e.paso));
  const ultimo = eventos[eventos.length - 1];
  const fallo = eventos.find((e) => e.resultado === 'error');
  const conMotivo = (r) => ({ ...r, motivo: fallo?.detalle ?? null });
  if (pasos.has('checkin')) return conMotivo({ label: 'Con check-in', tono: 'ok' });
  if (pasos.has('cancelacion')) return conMotivo({ label: 'Cancelada', tono: 'aviso' });
  if (pasos.has('confirmada')) return conMotivo({ label: 'Completada', tono: 'ok' });
  if (pasos.has('compensar')) return conMotivo({ label: 'Compensada (Saga)', tono: 'aviso' });
  if (fallo) return conMotivo({ label: `Falló en ${INFO[fallo.paso]?.label ?? fallo.paso}`, tono: 'error' });
  return conMotivo({ label: `En curso · ${INFO[ultimo?.paso]?.label ?? ''}`, tono: 'neutro' });
}

/** Una reserva por correlación (el Saga genera una correlación fresca por intento). */
function dividirEnReservas(eventos) {
  const porCorrelacion = new Map();
  for (const e of eventos) {
    if (!porCorrelacion.has(e.correlacion)) porCorrelacion.set(e.correlacion, []);
    porCorrelacion.get(e.correlacion).push(e);
  }
  return [...porCorrelacion.entries()]
    .map(([correlacion, evs]) => ({
      id: correlacion,
      correlacion,
      eventos: evs,
      inicio: evs[0],
      ultimo: evs[evs.length - 1],
      cliente: evs.find((e) => e.cliente)?.cliente ?? null,
      nodo: evs.find((e) => e.nodo)?.nodo ?? null,
      monto: evs.find((e) => e.monto)?.monto ?? null,
      resumen: resumenReserva(evs),
    }))
    .sort((a, b) => b.ultimo.seq - a.ultimo.seq);
}

// ───────────────────────────── Canvas de arquitectura ─────────────────────────────

const W = 1000;
const H = 470;
const SEG_MS = 520;

const BASE = {
  cliente: { x: 85, y: 235, w: 130, h: 64, titulo: 'Cliente', sub: 'Navegador · React (Render)', icono: '🧑‍💻' },
  gateway: { x: 255, y: 235, w: 150, h: 72, titulo: 'API Booking', sub: '/api/v1 · NestJS (Azure)', icono: '🚪' },
  aloj: { x: 475, y: 150, w: 180, h: 66, titulo: 'Módulo Alojamientos', sub: 'agregador de hoteles', icono: '🏨' },
  grpc: { x: 475, y: 300, w: 180, h: 62, titulo: 'Inventario gRPC', sub: 'InventoryStockService · 50051', icono: '📡' },
  bd: { x: 710, y: 395, w: 160, h: 70, titulo: 'PostgreSQL', sub: 'Supabase · copias RESERVADO', icono: '🗄️' },
};

const ARISTAS = [
  ['cliente', 'gateway', 'HTTPS'],
  ['gateway', 'aloj', ''],
  ['aloj', 'grpc', 'stock en vivo'],
  ['aloj', 'bd', 'SQL'],
];

function rutaDe(e) {
  const hotel = e.nodo ? `hotel:${e.nodo}` : 'aloj';
  const desdeHotel = /^(Cancelada|Check-in confirmado por)/.test(e.detalle || '');
  switch (e.paso) {
    case 'busqueda':
    case 'consulta':
      return ['cliente', 'gateway', 'aloj', hotel, 'aloj', 'gateway', 'cliente'];
    case 'cliente':
    case 'cotizar':
    case 'crear_orden':
    case 'recuperar':
      return ['aloj', hotel, 'aloj'];
    case 'copia':
      return ['aloj', 'bd'];
    case 'confirmada':
      return ['aloj', 'gateway', 'cliente'];
    case 'compensar':
      return ['aloj', hotel];
    case 'cancelacion':
      return ['cliente', 'gateway', 'aloj', hotel, 'aloj', 'bd'];
    case 'checkin':
      return [hotel, 'gateway', 'aloj', 'bd'];
    default:
      return ['cliente', 'gateway', 'aloj'];
  }
}

function Arquitectura({ eventos, hoteles = [], reproducir }) {
  const [puntos, setPuntos] = useState([]);
  const [ahora, setAhora] = useState(() => performance.now());
  const vistos = useRef(new Set());
  const proximoInicio = useRef(0);
  const primeraCarga = useRef(true);

  const comps = useMemo(() => {
    const c = { ...BASE };
    const n = Math.max(hoteles.length, 1);
    const alto = Math.min(78, 360 / n);
    hoteles.forEach((h, i) => {
      c[`hotel:${h.codigo}`] = {
        x: 905, y: 70 + i * alto, w: 165, h: Math.min(56, alto - 8),
        titulo: h.nombre || h.codigo,
        sub: h.estado === 'EN_LINEA' ? 'REST · en línea' : `REST · ${String(h.estado || '').toLowerCase().replace(/_/g, ' ')}`,
        icono: '🏨', caida: h.estado !== 'EN_LINEA',
      };
    });
    return c;
  }, [hoteles]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos]);

  useEffect(() => {
    if (reproducir?.eventos?.length) { proximoInicio.current = 0; lanzar(reproducir.eventos); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const aristas = [...ARISTAS, ...hoteles.map((h) => ['aloj', `hotel:${h.codigo}`, 'REST'])].filter(([a, b]) => comps[a] && comps[b]);
  const ultimo = dibujados.length ? puntos[puntos.length - 1] : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Arquitectura del proceso de alojamientos con el tráfico en vivo" style={{ width: '100%', minWidth: 780, height: 'auto', display: 'block', background: '#fafbfc', borderRadius: 10 }}>
          <defs>
            <filter id="alo-brillo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect x={175} y={40} width={620} height={410} rx={14} fill="none" stroke="#c9b9dd" strokeDasharray="6 5" />
          <text x={185} y={58} fontSize="11" fill={T.muted}>Booking Core API · un solo despliegue en Azure App Service (módulos NestJS)</text>
          <text x={835} y={30} fontSize="11" fill={T.muted}>Hoteles socios (contrato v2)</text>

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
                <rect x={c.x - c.w / 2} y={c.y - c.h / 2} width={c.w} height={c.h} rx={10}
                  fill={luz ? '#f4ecf9' : T.surface} stroke={borde} strokeWidth={luz ? 2.5 : 1.3} filter={luz ? 'url(#alo-brillo)' : undefined} />
                <text x={c.x - c.w / 2 + 10} y={c.y - 4} fontSize="12.5" fontWeight="700" fill={T.text}>
                  {c.icono} {String(c.titulo).length > 20 ? `${String(c.titulo).slice(0, 19)}…` : c.titulo}
                </text>
                <text x={c.x - c.w / 2 + 10} y={c.y + 13} fontSize="9.5" fill={T.text2}>{c.sub}</text>
              </g>
            );
          })}

          {dibujados.map((d) => (
            <circle key={d.id} cx={d.x} cy={d.y} r={d.final ? 7 : 6} fill={d.color} opacity={d.opacidad} filter="url(#alo-brillo)" />
          ))}

          {hoteles.length === 0 && <text x={905} y={110} fontSize="11" fill={T.muted} textAnchor="middle">Sin hoteles registrados</text>}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.75rem', color: T.text2, alignItems: 'center' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.ok, marginRight: 4 }} />paso correcto</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.aviso, marginRight: 4 }} />con aviso</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.error, marginRight: 4 }} />falló</span>
        {ultimo && <span style={{ marginLeft: 'auto', color: T.text }}>Ahora: <strong>{INFO[ultimo.paso]?.label || ultimo.paso}</strong> — {String(ultimo.detalle || '').slice(0, 90)}</span>}
      </div>
    </div>
  );
}

// ───────────────────────────── Controlador ─────────────────────────────

export function ProcesoEnVivoAlojamientos({ hoteles = [] }) {
  const [eventos, setEventos] = useState([]);
  const [contadores, setContadores] = useState({});
  const [inicio, setInicio] = useState(null);
  const [pausado, setPausado] = useState(false);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [reproducir, setReproducir] = useState(null);
  const seqRef = useRef(0);
  const inicioRef = useRef(null);
  const enCurso = useRef(false);

  const consultar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      const { data } = await api.get('/admin/procesos/alojamientos/en-vivo', { params: { desde: seqRef.current } });
      if (inicioRef.current && data.inicio !== inicioRef.current) { seqRef.current = 0; setEventos([]); }
      inicioRef.current = data.inicio;
      setInicio(data.inicio);
      setContadores(data.contadores || {});
      setError(null);
      if (data.eventos?.length) {
        seqRef.current = data.ultimoSeq;
        setEventos((prev) => {
          const vistos = new Set(prev.map((e) => e.seq));
          return [...prev, ...data.eventos.filter((e) => !vistos.has(e.seq))].slice(-500);
        });
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Sin conexión con el backend');
    } finally {
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    consultar();
    if (pausado) return undefined;
    const id = setInterval(consultar, 2000);
    return () => clearInterval(id);
  }, [consultar, pausado]);

  const nombreHotel = useMemo(() => Object.fromEntries(hoteles.map((h) => [h.codigo, h.nombre || h.codigo])), [hoteles]);
  const reservas = useMemo(() => dividirEnReservas(eventos), [eventos]);
  const q = filtro.trim().toLowerCase();
  const reservasFiltradas = reservas.filter((c) =>
    !q || [c.correlacion, c.cliente, c.nodo, nombreHotel[c.nodo], ...c.eventos.map((e) => e.detalle)].some((v) => String(v || '').toLowerCase().includes(q)),
  );
  const elegida = reservas.find((c) => c.id === seleccion) || null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <style>{`@keyframes aloPunto { 0%,100% { opacity: 1 } 50% { opacity: .25 } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: T.text2 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: error ? T.bad : pausado ? T.muted : '#8e24aa', animation: !pausado && !error ? 'aloPunto 1.2s infinite' : 'none' }} />
          <strong style={{ color: T.text }}>{error ? 'Sin conexión' : pausado ? 'En pausa' : 'En vivo'}</strong>
          <span>· se actualiza cada 2 s · {eventos.length} pasos en pantalla{inicio ? ` · contadores desde ${hora(inicio)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setPausado((p) => !p)} style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            {pausado ? '▶ Reanudar' : '⏸ Pausar'}
          </button>
          {seleccion && (
            <button type="button" onClick={() => setSeleccion(null)} style={{ border: `1px solid ${T.azul}`, background: T.surface, color: T.azul, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              Ver todo el tráfico
            </button>
          )}
        </div>
      </div>
      {error && <div role="alert" style={{ background: T.badBg, color: T.bad, borderRadius: 8, padding: '8px 12px', fontSize: '0.83rem' }}>⚠️ {error}</div>}

      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', color: T.text2, maxWidth: 720 }}>
            {elegida ? (
              <>Reproduciendo la reserva de <strong>{elegida.cliente || 'cliente sin identificar'}</strong>{elegida.nodo ? ` en ${nombreHotel[elegida.nodo] || elegida.nodo}` : ''} ({hora(elegida.inicio.ts)}): cada punto es uno de sus pasos, en orden.</>
            ) : (
              <>Cada punto es un paso real que acaba de pasar por Booking: sale de donde empieza, recorre los componentes que toca y se apaga al terminar. Elige una reserva abajo para repetir su recorrido.</>
            )}
          </div>
          {elegida && (
            <button type="button" onClick={() => setReproducir({ eventos: elegida.eventos, n: Date.now() })} style={{ border: `1px solid ${T.azul}`, background: T.azul, color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              ▶ Repetir recorrido
            </button>
          )}
        </div>

        <Arquitectura eventos={pausado ? [] : eventos} hoteles={hoteles} reproducir={reproducir} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          <span style={{ fontSize: '0.74rem', color: T.muted, alignSelf: 'center', marginRight: 4 }}>Total desde que arrancó el servidor:</span>
          {TODOS.filter((p) => p.id !== 'consulta').map((p) => {
            const c = contadores[p.id] || { ok: 0, error: 0, aviso: 0 };
            return (
              <span key={p.id} title={p.sub} style={{ fontSize: '0.74rem', borderRadius: 999, padding: '3px 9px', border: `1px solid ${T.border}`, background: T.surface, fontVariantNumeric: 'tabular-nums' }}>
                {p.icon} {p.label} <strong style={{ color: T.ok }}>✓{c.ok}</strong>{c.aviso ? <strong style={{ color: T.warn }}> !{c.aviso}</strong> : null} <strong style={{ color: c.error ? T.bad : T.muted }}>✕{c.error}</strong>
              </span>
            );
          })}
        </div>
      </section>

      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Reservas</h3>
            <div style={{ fontSize: '0.76rem', color: T.muted }}>Una fila por reserva. Tócala para ver cada paso y repetir su recorrido en el diagrama.</div>
          </div>
          <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Cliente, hotel o correlación…" aria-label="Buscar reserva"
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.82rem', minWidth: 240 }} />
        </div>

        {reservasFiltradas.length === 0 && (
          <div style={{ padding: '22px 10px', textAlign: 'center', color: T.muted, fontSize: '0.86rem' }}>
            {eventos.length === 0 ? 'Todavía no pasa nada. Haz una reserva de alojamiento en el sitio y la verás aquí en 2 segundos.' : 'Ninguna reserva coincide con la búsqueda.'}
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {reservasFiltradas.slice(0, 50).map((c) => {
            const abierta = seleccion === c.id;
            const tono = c.resumen.tono === 'neutro' ? { fg: T.text2, bg: T.fondo } : COLOR[c.resumen.tono];
            const resultadoDe = (paso) => { const evs = c.eventos.filter((e) => e.paso === paso); return evs.length ? evs[evs.length - 1].resultado : null; };
            const ramas = RAMAS.filter((r) => c.eventos.some((e) => e.paso === r.id));
            return (
              <div key={c.id} style={{ border: `1px solid ${abierta ? T.azul : c.resumen.tono === 'error' ? '#f3c0bb' : T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" onClick={() => { setSeleccion(abierta ? null : c.id); if (!abierta) setReproducir({ eventos: c.eventos, n: Date.now() }); }} aria-expanded={abierta}
                  style={{ width: '100%', textAlign: 'left', background: abierta ? '#f4ecf9' : T.surface, border: 'none', padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,auto) minmax(150px,1.4fr) minmax(120px,1fr) auto auto', gap: 12, alignItems: 'center', fontSize: '0.82rem' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: T.text2 }}>{hora(c.inicio.ts)}</span>
                    <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.cliente || ''}>👤 {c.cliente || 'sin identificar'}</span>
                    <span style={{ color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nodo ? `🏨 ${nombreHotel[c.nodo] || c.nodo}` : '🏨 —'}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{c.monto ? usd(c.monto) : ''}</span>
                    <span style={{ background: tono.bg, color: tono.fg, borderRadius: 999, padding: '2px 10px', fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{c.resumen.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {PASOS.map((p, i) => {
                      const est = COLOR[resultadoDe(p.id)] || null;
                      return (
                        <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span title={c.eventos.filter((e) => e.paso === p.id).map((e) => e.detalle).join(' · ') || 'No llegó a este paso'}
                            style={{ fontSize: '0.72rem', borderRadius: 6, padding: '2px 7px', fontWeight: 600, background: est ? est.bg : T.fondo, color: est ? est.fg : '#b9b8b3', border: `1px solid ${est ? 'transparent' : T.border}` }}>
                            {est ? est.icon : '·'} {p.label}
                          </span>
                          {i < PASOS.length - 1 && <span aria-hidden="true" style={{ color: '#c9ccd1', fontSize: '0.7rem' }}>→</span>}
                        </span>
                      );
                    })}
                    {ramas.map((r) => {
                      const est = COLOR[resultadoDe(r.id)];
                      return <span key={r.id} style={{ fontSize: '0.72rem', borderRadius: 6, padding: '2px 7px', fontWeight: 600, background: est.bg, color: est.fg, marginLeft: 6 }}>{est.icon} {r.label}</span>;
                    })}
                  </div>
                  {c.resumen.tono === 'error' && c.resumen.motivo && <div style={{ fontSize: '0.78rem', color: T.bad }}>Motivo: {c.resumen.motivo}</div>}
                </button>
                {abierta && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px 12px', background: T.surface, display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: '0.76rem', color: T.muted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>Correlación: <code style={{ color: T.text }}>{c.correlacion}</code></span>
                      <span>Duración: {duracion(c.inicio.ts, c.ultimo.ts)}</span>
                      <span>{c.eventos.length} pasos</span>
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6, fontSize: '0.8rem' }}>
                      {c.eventos.map((e) => (
                        <li key={e.seq}>
                          <span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{hora(e.ts)}</span>{' '}
                          <strong style={{ color: COLOR[e.resultado].fg }}>{COLOR[e.resultado].icon} {INFO[e.paso]?.label ?? e.paso}</strong>
                          {e.nodo ? <span style={{ color: T.muted }}> · {nombreHotel[e.nodo] || e.nodo}</span> : null}
                          {e.monto ? <span style={{ color: T.muted }}> · {usd(e.monto)}</span> : null}
                          <div style={{ color: T.text2 }}>{e.detalle}</div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
