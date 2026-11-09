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

/**
 * Cómo terminó una compra y, si falló, en qué paso y por qué.
 * `motivo` es el detalle del primer paso que falló.
 */
function resumenCompra(eventos) {
  const pasos = new Set(eventos.map((e) => e.paso));
  const ultimo = eventos[eventos.length - 1];
  const fallo = eventos.find((e) => e.resultado === 'error');
  const conMotivo = (r) => ({ ...r, motivo: fallo?.detalle ?? null, pasoFallo: fallo?.paso ?? null });
  if (eventos.some((e) => e.paso === 'reembolso' && e.resultado === 'error')) return conMotivo({ label: 'Cobrado sin reserva', tono: 'error' });
  if (pasos.has('cancelacion')) return conMotivo({ label: 'Cancelada', tono: 'aviso' });
  if (pasos.has('confirmada')) return conMotivo({ label: 'Completada', tono: 'ok' });
  if (fallo) {
    const devuelto = eventos.some((e) => e.paso === 'reembolso' && e.resultado === 'ok');
    return conMotivo({ label: `Falló en ${INFO[fallo.paso]?.label ?? fallo.paso}${devuelto ? ' · cobro devuelto' : ''}`, tono: 'error' });
  }
  if (pasos.has('reembolso')) return conMotivo({ label: 'Reembolsada', tono: 'aviso' });
  if (!pasos.has('hold')) return conMotivo({ label: 'Solo búsqueda', tono: 'neutro' });
  return conMotivo({ label: `En curso · ${INFO[ultimo?.paso]?.label ?? ''}`, tono: 'neutro' });
}

/**
 * Separa los pasos en compras. Normalmente cada compra trae su propio
 * X-Correlation-Id; si un mismo id tuvo varios intentos (p. ej. reintentar
 * después de un fallo) cada nuevo hold empieza un intento distinto. Las
 * búsquedas previas al primer hold van con el primer intento; la cancelación o
 * el check-in posteriores quedan con el intento al que pertenecen.
 */
function dividirEnCompras(eventos) {
  const porCorrelacion = new Map();
  for (const e of eventos) {
    if (!porCorrelacion.has(e.correlacion)) porCorrelacion.set(e.correlacion, []);
    porCorrelacion.get(e.correlacion).push(e);
  }
  const compras = [];
  for (const [correlacion, evs] of porCorrelacion) {
    const previos = [];
    let actual = null;
    let intento = 0;
    for (const e of evs) {
      if (e.paso === 'hold' && (!actual || actual.eventos.some((x) => x.paso === 'hold'))) {
        intento += 1;
        actual = { id: `${correlacion}#${intento}`, correlacion, intento, eventos: intento === 1 ? [...previos] : [] };
        compras.push(actual);
      }
      if (actual) actual.eventos.push(e); else previos.push(e);
    }
    if (!actual) compras.push({ id: `${correlacion}#0`, correlacion, intento: 0, eventos: previos });
  }
  return compras.map((c) => {
    const intentos = compras.filter((x) => x.correlacion === c.correlacion && x.intento > 0).length;
    const cobro = c.eventos.find((e) => e.paso === 'cobro' && e.monto);
    return {
      ...c,
      intentos,
      inicio: c.eventos[0],
      ultimo: c.eventos[c.eventos.length - 1],
      cliente: c.eventos.find((e) => e.cliente)?.cliente ?? null,
      nodo: c.eventos.find((e) => e.nodo)?.nodo ?? null,
      monto: cobro?.monto ?? c.eventos.find((e) => e.monto)?.monto ?? null,
      pnr: c.eventos.map((e) => String(e.detalle || '').match(/PNR ([A-Z0-9]{5,8})/)?.[1]).find(Boolean) ?? null,
      resumen: resumenCompra(c.eventos),
    };
  }).sort((a, b) => b.ultimo.seq - a.ultimo.seq);
}

const duracion = (a, b) => {
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export function ProcesoEnVivo({ aerolineas = [] }) {
  const [eventos, setEventos] = useState([]);
  const [contadores, setContadores] = useState({});
  const [inicio, setInicio] = useState(null);
  const [pausado, setPausado] = useState(false);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [verBusquedas, setVerBusquedas] = useState(false);
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

  const nombreAerolinea = useMemo(() => Object.fromEntries(aerolineas.map((a) => [a.codigo, a.nombre || a.codigo])), [aerolineas]);
  const compras = useMemo(() => dividirEnCompras(eventos), [eventos]);
  const soloBusquedas = compras.filter((c) => c.intento === 0).length;

  const q = filtro.trim().toLowerCase();
  const comprasFiltradas = compras.filter((c) => {
    if (!verBusquedas && c.intento === 0) return false;
    if (!q) return true;
    return [c.correlacion, c.cliente, c.nodo, nombreAerolinea[c.nodo], c.pnr, ...c.eventos.map((e) => e.detalle)]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
  const elegida = compras.find((c) => c.id === seleccion) || null;

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
              <>Reproduciendo la compra de <strong>{elegida.cliente || 'cliente sin identificar'}</strong>{elegida.nodo ? ` en ${nombreAerolinea[elegida.nodo] || elegida.nodo}` : ''} ({hora(elegida.inicio.ts)}): cada punto es uno de sus pasos, en orden.</>
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

      {/* ── Compras: una fila por compra (X-Correlation-Id + intento) ── */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Compras</h3>
            <div style={{ fontSize: '0.76rem', color: T.muted }}>Una fila por compra. Tócala para ver cada paso y repetir su recorrido en el diagrama.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.78rem', color: T.text2, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={verBusquedas} onChange={(e) => setVerBusquedas(e.target.checked)} />
              Mostrar búsquedas sin compra ({soloBusquedas})
            </label>
            <input
              id="pv-filtro"
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Cliente, aerolínea, PNR o correlation ID…"
              aria-label="Buscar compra por cliente, aerolínea, PNR o correlation ID"
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.82rem', minWidth: 260 }}
            />
          </div>
        </div>

        {comprasFiltradas.length === 0 && (
          <div style={{ padding: '22px 10px', textAlign: 'center', color: T.muted, fontSize: '0.86rem' }}>
            {eventos.length === 0
              ? 'Todavía no pasa nada. Haz una búsqueda de vuelos en el sitio y la verás aparecer aquí en 2 segundos.'
              : q ? 'Ninguna compra coincide con la búsqueda.' : 'Todavía no hay compras; solo búsquedas.'}
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {comprasFiltradas.slice(0, 50).map((c) => {
            const abierta = seleccion === c.id;
            const tono = c.resumen.tono === 'neutro' ? { fg: T.text2, bg: T.fondo } : COLOR[c.resumen.tono];
            const resultadoDe = (paso) => {
              const evs = c.eventos.filter((e) => e.paso === paso);
              return evs.length ? evs[evs.length - 1].resultado : null;
            };
            const ramas = RAMAS.filter((r) => r.id !== 'estado_vuelo' && c.eventos.some((e) => e.paso === r.id));
            return (
              <div key={c.id} style={{ border: `1px solid ${abierta ? T.azul : c.resumen.tono === 'error' ? '#f3c0bb' : T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => { setSeleccion(abierta ? null : c.id); if (!abierta) setReproducir({ eventos: c.eventos, n: Date.now() }); }}
                  aria-expanded={abierta}
                  style={{ width: '100%', textAlign: 'left', background: abierta ? '#eef3fb' : T.surface, border: 'none', padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: 8 }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,auto) minmax(160px,1.4fr) minmax(120px,1fr) auto auto', gap: 12, alignItems: 'center', fontSize: '0.82rem' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: T.text2 }}>{hora(c.inicio.ts)}</span>
                    <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.cliente || ''}>👤 {c.cliente || 'sin identificar'}</span>
                    <span style={{ color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nodo ? `✈️ ${nombreAerolinea[c.nodo] || c.nodo}` : '✈️ todas las aerolíneas'}{c.pnr ? ` · PNR ${c.pnr}` : ''}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{c.monto ? usd(c.monto) : ''}</span>
                    <span style={{ background: tono.bg, color: tono.fg, borderRadius: 999, padding: '2px 10px', fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{c.resumen.label}</span>
                  </div>

                  {/* Barra del flujo: hasta dónde llegó la compra y dónde falló */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {PASOS.map((p, i) => {
                      const r = resultadoDe(p.id);
                      const est = r ? COLOR[r] : null;
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
                      return (
                        <span key={r.id} style={{ fontSize: '0.72rem', borderRadius: 6, padding: '2px 7px', fontWeight: 600, background: est.bg, color: est.fg, marginLeft: 6 }}>
                          {est.icon} {r.label}
                        </span>
                      );
                    })}
                  </div>

                  {c.resumen.tono === 'error' && c.resumen.motivo && (
                    <div style={{ fontSize: '0.78rem', color: T.bad }}>Motivo: {c.resumen.motivo}</div>
                  )}
                </button>
                {abierta && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px 12px', background: T.surface, display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: '0.76rem', color: T.muted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>Correlation ID: <code style={{ color: T.text }}>{c.correlacion}</code></span>
                      {c.intentos > 1 && <span>Intento {c.intento} de {c.intentos} con este ID</span>}
                      <span>Duración: {duracion(c.inicio.ts, c.ultimo.ts)}</span>
                      <span>{c.eventos.length} pasos</span>
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6, fontSize: '0.8rem' }}>
                      {c.eventos.map((e) => (
                        <li key={e.seq}>
                          <span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{hora(e.ts)}</span>{' '}
                          <strong style={{ color: COLOR[e.resultado].fg }}>{COLOR[e.resultado].icon} {INFO[e.paso]?.label ?? e.paso}</strong>
                          {e.nodo ? <span style={{ color: T.muted }}> · {nombreAerolinea[e.nodo] || e.nodo}</span> : null}
                          {e.ms != null ? <span style={{ color: T.muted }}> · {e.ms} ms</span> : null}
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
