import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ArquitecturaVuelos } from './ArquitecturaVuelos';

/**
 * Flujo del proceso de vuelos EN TIEMPO REAL.
 *
 * Lee GET /admin/procesos/vuelos/en-vivo?desde=<seq> cada 2 s. Cada evento es un
 * paso real que hizo Booking (búsqueda, hold, cobro, reserva en la aerolínea,
 * copia, reembolso, cancelación) con el X-Correlation-Id de la compra, así que
 * se puede seguir cada compra de punta a punta.
 */

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#003580', fondo: '#f7f8fa',
  ok: '#0d7a2f', okBg: '#e3f4e8', warn: '#9a5b00', warnBg: '#fdf1dc', bad: '#b42318', badBg: '#fde7e5',
};

const PASOS = [
  { id: 'busqueda', label: 'Búsqueda', sub: 'en las aerolíneas', icon: '🔎' },
  { id: 'hold', label: 'Hold', sub: 'precio congelado', icon: '⏱️' },
  { id: 'cobro', label: 'Cobro', sub: 'MS_PAG', icon: '💳' },
  { id: 'reserva_aerolinea', label: 'Reserva', sub: 'en la aerolínea', icon: '✈️' },
  { id: 'copia', label: 'Copia', sub: 'Mis Reservas', icon: '🗂️' },
  { id: 'factura', label: 'Factura', sub: 'Factura · NC · comisión', icon: '🧾' },
  { id: 'confirmada', label: 'Confirmada', sub: 'fin feliz', icon: '✅' },
];
const RAMAS = [
  { id: 'reembolso', label: 'Reembolso', sub: 'SAGA / cancelación', icon: '↩️' },
  { id: 'cancelacion', label: 'Cancelación', sub: 'del cliente', icon: '🛑' },
  { id: 'checkin', label: 'Check-in', sub: 'Asistencia en aerolínea', icon: '🛂' },
  { id: 'estado_vuelo', label: 'Estado de vuelo', sub: 'consulta', icon: '📡' },
];
const TODOS = [...PASOS, ...RAMAS, { id: 'consulta', label: 'Otra consulta', icon: '🔁' }];
const INFO = Object.fromEntries(TODOS.map((p) => [p.id, p]));

const COLOR = {
  ok: { fg: T.ok, bg: T.okBg, icon: '✓' },
  aviso: { fg: T.warn, bg: T.warnBg, icon: '!' },
  error: { fg: T.bad, bg: T.badBg, icon: '✕' },
};

const hora = (iso) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const usd = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
const corto = (c) => (c?.length > 22 ? `${c.slice(0, 14)}…${c.slice(-6)}` : c);

/** Estado final de una compra según sus pasos. */
function resumenCompra(eventos) {
  const pasos = new Set(eventos.map((e) => e.paso));
  const ultimo = eventos[eventos.length - 1];
  if (eventos.some((e) => e.paso === 'reembolso' && e.resultado === 'error')) return { label: 'Cobrado sin reserva', tono: 'error' };
  if (pasos.has('cancelacion')) return { label: 'Cancelada', tono: 'aviso' };
  if (pasos.has('confirmada')) return { label: 'Confirmada', tono: 'ok' };
  if (eventos.some((e) => e.paso === 'reembolso' && e.resultado === 'ok')) return { label: 'Reembolsada', tono: 'aviso' };
  if (ultimo?.resultado === 'error') return { label: `Falló en ${INFO[ultimo.paso]?.label ?? ultimo.paso}`, tono: 'error' };
  return { label: `En curso · ${INFO[ultimo?.paso]?.label ?? ''}`, tono: 'neutro' };
}

export function ProcesoEnVivo({ aerolineas = [] }) {
  const [eventos, setEventos] = useState([]);
  const [contadores, setContadores] = useState({});
  const [inicio, setInicio] = useState(null);
  const [pausado, setPausado] = useState(false);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [latidos, setLatidos] = useState({});
  const [busActivo, setBusActivo] = useState(false);
  const [reproducir, setReproducir] = useState(null);
  const seqRef = useRef(0);
  const inicioRef = useRef(null);

  const enCurso = useRef(false);

  const consultar = useCallback(async () => {
    // Si el backend tarda más de 2 s, no se lanza otra consulta con el mismo
    // "desde": eso traía los mismos eventos dos o tres veces.
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      const { data } = await api.get('/admin/procesos/vuelos/en-vivo', { params: { desde: seqRef.current } });
      // Si el servidor se reinició, la secuencia vuelve a empezar: se limpia la vista.
      if (inicioRef.current && data.inicio !== inicioRef.current) {
        seqRef.current = 0;
        setEventos([]);
      }
      inicioRef.current = data.inicio;
      setInicio(data.inicio);
      setContadores(data.contadores || {});
      setBusActivo(!!data.bus?.rabbitmq);
      setError(null);
      if (data.eventos?.length) {
        seqRef.current = data.ultimoSeq;
        setEventos((prev) => {
          const vistos = new Set(prev.map((e) => e.seq));
          return [...prev, ...data.eventos.filter((e) => !vistos.has(e.seq))].slice(-500);
        });
        const ahora = Date.now();
        const nuevos = {};
        data.eventos.forEach((e) => { nuevos[e.paso] = { resultado: e.resultado, hasta: ahora + 2500 }; });
        setLatidos((l) => ({ ...l, ...nuevos }));
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

  // Apaga los latidos vencidos.
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = Date.now();
      setLatidos((l) => {
        const vivos = Object.fromEntries(Object.entries(l).filter(([, v]) => v.hasta > ahora));
        return Object.keys(vivos).length === Object.keys(l).length ? l : vivos;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  const compras = useMemo(() => {
    const mapa = new Map();
    for (const e of eventos) {
      if (!mapa.has(e.correlacion)) mapa.set(e.correlacion, []);
      mapa.get(e.correlacion).push(e);
    }
    return [...mapa.entries()]
      .map(([correlacion, evs]) => ({
        correlacion,
        eventos: evs,
        ultimo: evs[evs.length - 1],
        nodo: evs.find((e) => e.nodo)?.nodo ?? null,
        monto: evs.find((e) => e.monto)?.monto ?? null,
        resumen: resumenCompra(evs),
      }))
      .sort((a, b) => b.ultimo.seq - a.ultimo.seq);
  }, [eventos]);

  const comprasFiltradas = filtro.trim()
    ? compras.filter((c) => c.correlacion.toLowerCase().includes(filtro.trim().toLowerCase()) || (c.nodo || '').toLowerCase().includes(filtro.trim().toLowerCase()))
    : compras;
  const elegida = compras.find((c) => c.correlacion === seleccion) || null;

  // Pasos de la compra elegida -> resultado por paso (para pintar su recorrido).
  const recorrido = useMemo(() => {
    if (!elegida) return null;
    const r = {};
    elegida.eventos.forEach((e) => { r[e.paso] = e.resultado; });
    return r;
  }, [elegida]);

  const estadoNodo = (id) => (recorrido ? recorrido[id] ?? false : undefined);
  const latido = (id) => (recorrido ? null : latidos[id]?.resultado ?? null);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <style>{`
        @keyframes pvLatido { 0% { box-shadow: 0 0 0 0 rgba(0,53,128,.45) } 100% { box-shadow: 0 0 0 14px rgba(0,53,128,0) } }
        .pv-latido { animation: pvLatido 1.1s ease-out 2; }
        @keyframes pvFicha { from { left: -4px } to { left: calc(100% - 6px) } }
        .pv-ficha { position: absolute; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: ${T.azul}; animation: pvFicha .9s linear infinite; }
        @keyframes pvPunto { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @media (prefers-reduced-motion: reduce) { .pv-latido, .pv-ficha { animation: none } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: T.text2 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: error ? T.bad : pausado ? T.muted : '#d03b3b', animation: !pausado && !error ? 'pvPunto 1.2s infinite' : 'none' }} />
          <strong style={{ color: T.text }}>{error ? 'Sin conexión' : pausado ? 'En pausa' : 'En vivo'}</strong>
          <span>· se actualiza cada 2 s · {eventos.length} pasos en pantalla{inicio ? ` · contadores desde ${hora(inicio)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setPausado((p) => !p)}
            style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            {pausado ? '▶ Reanudar' : '⏸ Pausar'}
          </button>
          {seleccion && (
            <button type="button" onClick={() => setSeleccion(null)}
              style={{ border: `1px solid ${T.azul}`, background: T.surface, color: T.azul, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              Ver todo el tráfico
            </button>
          )}
        </div>
      </div>
      {error && <div role="alert" style={{ background: T.badBg, color: T.bad, borderRadius: 8, padding: '8px 12px', fontSize: '0.83rem' }}>⚠️ {error}</div>}

      {/* ── La arquitectura con el tráfico en vivo ── */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', color: T.text2, maxWidth: 720 }}>
            {elegida ? (
              <>Reproduciendo la compra <code style={{ background: T.fondo, padding: '1px 6px', borderRadius: 4 }}>{corto(elegida.correlacion)}</code>: cada punto es uno de sus pasos, en orden.</>
            ) : (
              <>Cada punto es un paso real que acaba de pasar por Booking: sale de donde empieza, recorre los componentes que toca y se apaga al terminar. Elige una compra abajo para repetir su recorrido.</>
            )}
          </div>
          {elegida && (
            <button type="button" onClick={() => setReproducir({ eventos: elegida.eventos, n: Date.now() })}
              style={{ border: `1px solid ${T.azul}`, background: T.azul, color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              ▶ Repetir recorrido
            </button>
          )}
        </div>

        <ArquitecturaVuelos eventos={pausado ? [] : eventos} aerolineas={aerolineas} busActivo={busActivo} reproducir={reproducir} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
          <span style={{ fontSize: '0.74rem', color: T.muted, alignSelf: 'center', marginRight: 4 }}>Total desde que arrancó el servidor:</span>
          {[...PASOS, ...RAMAS].map((p) => {
            const c = contadores[p.id] || { ok: 0, error: 0, aviso: 0 };
            const lat = latido(p.id);
            const sel = estadoNodo(p.id);
            const tono = sel ? COLOR[sel] : lat ? COLOR[lat] : null;
            return (
              <span key={p.id} className={lat ? 'pv-latido' : undefined} title={p.sub}
                style={{ fontSize: '0.74rem', borderRadius: 999, padding: '3px 9px', border: `1px solid ${tono ? tono.fg : T.border}`, background: tono ? tono.bg : T.surface, opacity: sel === false ? 0.45 : 1, fontVariantNumeric: 'tabular-nums' }}>
                {p.icon} {p.label} <strong style={{ color: T.ok }}>✓{c.ok}</strong>{c.aviso ? <strong style={{ color: T.warn }}> !{c.aviso}</strong> : null} <strong style={{ color: c.error ? T.bad : T.muted }}>✕{c.error}</strong>
              </span>
            );
          })}
        </div>
      </section>

      {/* ── Compras por correlation ID ── */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Compras por X-Correlation-Id</h3>
          <input
            id="pv-filtro"
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Pega un correlation ID o una aerolínea…"
            aria-label="Buscar por correlation ID o aerolínea"
            style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.82rem', minWidth: 260 }}
          />
        </div>

        {comprasFiltradas.length === 0 && (
          <div style={{ padding: '22px 10px', textAlign: 'center', color: T.muted, fontSize: '0.86rem' }}>
            {eventos.length === 0
              ? 'Todavía no pasa nada. Haz una búsqueda de vuelos en el sitio y la verás aparecer aquí en 2 segundos.'
              : 'Ninguna compra coincide con la búsqueda.'}
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {comprasFiltradas.slice(0, 40).map((c) => {
            const abierta = seleccion === c.correlacion;
            const tono = c.resumen.tono === 'neutro' ? { fg: T.text2, bg: T.fondo } : COLOR[c.resumen.tono];
            return (
              <div key={c.correlacion} style={{ border: `1px solid ${abierta ? T.azul : T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => { setSeleccion(abierta ? null : c.correlacion); if (!abierta) setReproducir({ eventos: c.eventos, n: Date.now() }); }}
                  aria-expanded={abierta}
                  style={{ width: '100%', textAlign: 'left', background: abierta ? '#eef3fb' : T.surface, border: 'none', padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: 6 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.text }} title={c.correlacion}>{corto(c.correlacion)}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.76rem', color: T.muted }}>
                      {c.nodo && <span>✈️ {c.nodo}</span>}
                      {c.monto ? <span>{usd(c.monto)}</span> : null}
                      <span>{hora(c.ultimo.ts)}</span>
                      <span style={{ background: tono.bg, color: tono.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>{c.resumen.label}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {c.eventos.map((e) => (
                      <span key={e.seq} title={e.detalle}
                        style={{ fontSize: '0.72rem', borderRadius: 6, padding: '2px 7px', background: COLOR[e.resultado].bg, color: COLOR[e.resultado].fg, fontWeight: 600 }}>
                        {COLOR[e.resultado].icon} {INFO[e.paso]?.label ?? e.paso}
                      </span>
                    ))}
                  </div>
                </button>
                {abierta && (
                  <ol style={{ margin: 0, padding: '8px 12px 12px 34px', borderTop: `1px solid ${T.border}`, display: 'grid', gap: 6, fontSize: '0.8rem', background: T.surface }}>
                    {c.eventos.map((e) => (
                      <li key={e.seq}>
                        <span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{hora(e.ts)}</span>{' '}
                        <strong style={{ color: COLOR[e.resultado].fg }}>{INFO[e.paso]?.label ?? e.paso}</strong>
                        {e.nodo ? <span style={{ color: T.muted }}> · {e.nodo}</span> : null}
                        {e.ms != null ? <span style={{ color: T.muted }}> · {e.ms} ms</span> : null}
                        <div style={{ color: T.text2 }}>{e.detalle}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
