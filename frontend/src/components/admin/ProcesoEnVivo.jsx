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
  { id: 'cambio_fecha', label: 'Cambio de fecha', sub: 'retraso o cambio', icon: '🗓️' },
  { id: 'asiento', label: 'Asiento', sub: 'bloqueo en tiempo real', icon: '💺' },
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
// Operaciones de vuelos que no son una compra: llegan después, con su propio
// correlation ID (desde Mis Reservas o desde el feed de la aerolínea).
const OPERACIONES = [
  { id: 'cancelacion', filtro: 'Cancelaciones', icon: '🛑' },
  { id: 'checkin', filtro: 'Check-in', icon: '🛂' },
  { id: 'cambio_fecha', filtro: 'Cambios de fecha', icon: '🗓️' },
  { id: 'reembolso', filtro: 'Reembolsos', icon: '↩️' },
];
const ID_OPERACIONES = OPERACIONES.map((o) => o.id);
const pnrDe = (e) => String(e?.detalle || '').match(/PNR ([A-Z0-9]{5,8})/)?.[1] ?? null;

/** Cómo terminó una operación posterior a la compra (check-in, cancelación, reembolso, cambio de fecha). */
function resumenOperacion(eventos) {
  const ultimoDe = (paso) => [...eventos].reverse().find((e) => e.paso === paso);
  const conMotivo = (r, e) => ({ ...r, motivo: e && e.resultado !== 'ok' ? e.detalle : null, pasoFallo: e && e.resultado !== 'ok' ? e.paso : null });
  const reemb = ultimoDe('reembolso');
  const canc = ultimoDe('cancelacion');
  if (canc) {
    if (canc.resultado !== 'ok') return conMotivo({ label: 'Cancelación rechazada', tono: canc.resultado }, canc);
    if (reemb?.resultado === 'error') return conMotivo({ label: 'Cancelada · reembolso falló', tono: 'error' }, reemb);
    return conMotivo({ label: reemb ? 'Cancelada · reembolsada' : 'Cancelada', tono: 'aviso' }, null);
  }
  const ci = ultimoDe('checkin');
  if (ci) return conMotivo({ label: ci.resultado === 'ok' ? 'Check-in hecho' : 'Check-in rechazado', tono: ci.resultado }, ci);
  const cf = ultimoDe('cambio_fecha');
  if (cf) return conMotivo({ label: cf.resultado === 'ok' ? 'Cambio de fecha' : 'Cambio de fecha con aviso', tono: 'aviso' }, cf.resultado === 'ok' ? null : cf);
  if (reemb) return conMotivo({ label: reemb.resultado === 'ok' ? 'Reembolsada' : 'Reembolso falló', tono: reemb.resultado === 'ok' ? 'aviso' : 'error' }, reemb);
  return conMotivo({ label: 'Consulta', tono: 'neutro' }, null);
}

/**
 * Separa las operaciones que no son compras por PNR: un mismo ciclo del feed de
 * la aerolínea puede traer varias reservas.
 */
function separarPorPnr(grupo) {
  const porPnr = new Map();
  for (const e of grupo.eventos) {
    const k = pnrDe(e) ?? '';
    if (!porPnr.has(k)) porPnr.set(k, []);
    porPnr.get(k).push(e);
  }
  const sinPnr = porPnr.get('') ?? [];
  porPnr.delete('');
  if (porPnr.size <= 1) return [grupo];
  // Las consultas sin PNR quedan con la primera reserva.
  const partes = [...porPnr.entries()].map(([pnr, evs], i) => ({ ...grupo, id: `${grupo.id}~${pnr}`, eventos: (i === 0 ? [...sinPnr, ...evs] : evs).sort((a, b) => a.seq - b.seq) }));
  return partes;
}

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
    if (!actual) {
      const grupo = { id: `${correlacion}#0`, correlacion, intento: 0, eventos: previos };
      if (previos.some((e) => ID_OPERACIONES.includes(e.paso))) compras.push(...separarPorPnr(grupo));
      else compras.push(grupo);
    }
  }
  return compras.map((c) => {
    const esOperacion = c.intento === 0 && c.eventos.some((e) => ID_OPERACIONES.includes(e.paso));
    const operacion = esOperacion ? OPERACIONES.find((o) => c.eventos.some((e) => e.paso === o.id)) : null;
    // ¿La hizo el cliente en Booking o llegó desde la aerolínea (su web, mostrador o feed)?
    const textos = c.eventos.map((e) => String(e.detalle || '')).join(' ');
    const desdeAerolinea = esOperacion && !/desde Booking|Cancelada desde Booking|Reembolso al cliente/.test(textos) && /por NODE|en NODE|Cancelada en|confirmado por|Cambio de fecha en/.test(textos);
    const intentos = compras.filter((x) => x.correlacion === c.correlacion && x.intento > 0).length;
    const cobro = c.eventos.find((e) => e.paso === 'cobro' && e.monto);
    return {
      ...c,
      intentos,
      inicio: c.eventos[0],
      ultimo: c.eventos[c.eventos.length - 1],
      // La búsqueda es pública (va sin token) y queda como "invitado"; el hold y
      // el pago sí llevan la sesión: se muestra el correo si alguno lo tiene.
      cliente: c.eventos.find((e) => e.cliente && e.cliente.includes('@'))?.cliente
        ?? c.eventos.find((e) => e.cliente)?.cliente ?? null,
      nodo: c.eventos.find((e) => e.nodo)?.nodo ?? null,
      monto: cobro?.monto ?? c.eventos.find((e) => e.monto)?.monto ?? null,
      pnr: c.eventos.map(pnrDe).find(Boolean) ?? null,
      tipo: c.intento > 0 ? 'compra' : esOperacion ? 'operacion' : 'busqueda',
      operacion,
      desdeAerolinea,
      resumen: esOperacion ? resumenOperacion(c.eventos) : resumenCompra(c.eventos),
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
  const [tipoFiltro, setTipoFiltro] = useState('todas');
  const [verBusquedas, setVerBusquedas] = useState(false);
  const [latidos, setLatidos] = useState({});
  const [busActivo, setBusActivo] = useState(false);
  const [reproducir, setReproducir] = useState(null);
  const [origen, setOrigen] = useState(null);
  const diagramaRef = useRef(null);
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
      setOrigen(data.origen || 'memoria');
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
  const soloBusquedas = compras.filter((c) => c.tipo === 'busqueda').length;
  /** Filtro por tipo de flujo: todas, compras o una operación (check-in, cancelación…). */
  const cumpleTipo = (c, t) => t === 'todas' || (t === 'compras' ? c.tipo === 'compra' : c.eventos.some((e) => e.paso === t));
  const conteoTipo = (t) => compras.filter((c) => c.tipo !== 'busqueda' && cumpleTipo(c, t)).length;

  const q = filtro.trim().toLowerCase();
  const comprasFiltradas = compras.filter((c) => {
    if (!verBusquedas && c.tipo === 'busqueda') return false;
    if (!cumpleTipo(c, tipoFiltro)) return false;
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

  /** Elige una compra y repite su recorrido; en pantallas angostas sube al diagrama. */
  const elegir = useCallback((c) => {
    setSeleccion(c ? c.id : null);
    if (!c) return;
    setReproducir({ eventos: c.eventos, n: Date.now() });
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1199px)').matches) {
      diagramaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  /** ↑ ↓ en la lista: pasa a la compra anterior o siguiente y la reproduce. */
  const moverConTeclado = (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const lista = comprasFiltradas.slice(0, 80);
    if (!lista.length) return;
    ev.preventDefault();
    const i = lista.findIndex((c) => c.id === seleccion);
    const j = i < 0 ? 0 : Math.min(lista.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)));
    const c = lista[j];
    setSeleccion(c.id);
    setReproducir({ eventos: c.eventos, n: Date.now() });
    const fila = ev.currentTarget.querySelector(`[data-compra="${CSS.escape(c.id)}"]`);
    fila?.focus({ preventScroll: true });
    fila?.scrollIntoView({ block: 'nearest' });
  };

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
        .pv-layout { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); align-items: start; }
        .pv-lista { display: flex; flex-direction: column; gap: 6px; }
        .pv-lista > * { flex-shrink: 0; }
        @media (min-width: 1200px) {
          .pv-layout { grid-template-columns: minmax(0, 1.65fr) minmax(360px, 1fr); }
          .pv-diagrama { position: sticky; top: 12px; }
          .pv-lista { max-height: calc(100vh - 230px); overflow-y: auto; padding-right: 4px; }
        }
        .pv-fila:focus-visible { outline: 2px solid ${T.azul}; outline-offset: -2px; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: T.text2 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: error ? T.bad : pausado ? T.muted : '#d03b3b', animation: !pausado && !error ? 'pvPunto 1.2s infinite' : 'none' }} />
          <strong style={{ color: T.text }}>{error ? 'Sin conexión' : pausado ? 'En pausa' : 'En vivo'}</strong>
          <span>· {eventos.length} pasos en pantalla{origen === 'base' ? ' · historial compartido (igual en todas las computadoras)' : inicio ? ` · solo memoria de este servidor desde ${hora(inicio)}` : ''}</span>
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

      <div className="pv-layout">
      {/* ── La arquitectura con el tráfico en vivo ── */}
      <section ref={diagramaRef} className="pv-diagrama" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', color: T.text2, maxWidth: 720 }}>
            {elegida ? (
              <>Reproduciendo {elegida.tipo === 'operacion' ? `${elegida.operacion?.filtro === 'Check-in' ? 'el check-in' : elegida.operacion?.filtro === 'Cancelaciones' ? 'la cancelación' : elegida.operacion?.filtro === 'Reembolsos' ? 'el reembolso' : 'el cambio de fecha'}${elegida.pnr ? ` del PNR ${elegida.pnr}` : ''}${elegida.desdeAerolinea ? ' (hecho en la aerolínea)' : ''} de` : 'la compra de'} <strong>{elegida.cliente || (elegida.desdeAerolinea ? 'un pasajero' : 'cliente sin identificar')}</strong>{elegida.nodo ? ` en ${nombreAerolinea[elegida.nodo] || elegida.nodo}` : ''} ({hora(elegida.inicio.ts)}): cada punto es uno de sus pasos, en orden.</>
            ) : (
              <>Cada punto es un paso real que acaba de pasar por Booking: sale de donde empieza, recorre los componentes que toca y se apaga al terminar. Elige una operación de la lista para repetir su recorrido.</>
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
          <span style={{ fontSize: '0.74rem', color: T.muted, alignSelf: 'center', marginRight: 4 }}>{origen === 'base' ? 'Últimas 24 h:' : 'Total desde que arrancó el servidor:'}</span>
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

      {/* ── Operaciones: compras (X-Correlation-Id + intento) y check-ins, cancelaciones, reembolsos y cambios de fecha ── */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Operaciones de vuelos</h3>
            <div style={{ fontSize: '0.76rem', color: T.muted }}>Compras, check-ins, cancelaciones, reembolsos y cambios de fecha, hechos en Booking o en la aerolínea. Toca una y su recorrido se repite en el diagrama. Con ↑ ↓ pasas a la anterior o la siguiente.</div>
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
              aria-label="Buscar operación por cliente, aerolínea, PNR o correlation ID"
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.82rem', minWidth: 220, flex: 1 }}
            />
          </div>
        </div>

        <div role="group" aria-label="Tipo de operación" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['todas', 'Todas', ''], ['compras', 'Compras', '🛒'], ...OPERACIONES.map((o) => [o.id, o.filtro, o.icon])].map(([id, texto, icono]) => {
            const activo = tipoFiltro === id;
            return (
              <button key={id} type="button" aria-pressed={activo} onClick={() => setTipoFiltro(id)}
                style={{ border: `1px solid ${activo ? T.azul : T.border}`, background: activo ? T.azul : T.surface, color: activo ? '#fff' : T.text2, borderRadius: 999, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                {icono ? `${icono} ` : ''}{texto} ({conteoTipo(id)})
              </button>
            );
          })}
        </div>

        {comprasFiltradas.length === 0 && (
          <div style={{ padding: '22px 10px', textAlign: 'center', color: T.muted, fontSize: '0.86rem' }}>
            {eventos.length === 0
              ? 'Todavía no pasa nada. Haz una búsqueda de vuelos en el sitio y la verás aparecer aquí en unos segundos.'
              : q ? 'Ninguna operación coincide con la búsqueda.' : tipoFiltro !== 'todas' ? 'No hay operaciones de este tipo en pantalla.' : 'Todavía no hay compras ni operaciones; solo búsquedas.'}
          </div>
        )}

        <div className="pv-lista" onKeyDown={moverConTeclado}>
          {comprasFiltradas.slice(0, 80).map((c) => {
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
                  className="pv-fila"
                  data-compra={c.id}
                  onClick={() => elegir(abierta ? null : c)}
                  aria-expanded={abierta}
                  style={{ width: '100%', textAlign: 'left', background: abierta ? '#eef3fb' : T.surface, border: 'none', padding: '8px 10px', cursor: 'pointer', display: 'grid', gap: 6 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', minWidth: 0 }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: T.text2, flexShrink: 0 }}>{hora(c.inicio.ts)}</span>
                    <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={c.cliente || ''}>
                      {c.tipo === 'operacion' ? `${c.operacion?.icon ?? ''} ` : ''}👤 {c.cliente || (c.desdeAerolinea ? 'desde la aerolínea' : 'sin identificar')}
                    </span>
                    <span style={{ background: tono.bg, color: tono.fg, borderRadius: 999, padding: '2px 9px', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{c.resumen.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: T.text2, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {c.nodo ? `✈️ ${nombreAerolinea[c.nodo] || c.nodo}` : '✈️ todas las aerolíneas'}{c.pnr ? ` · PNR ${c.pnr}` : ''}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: T.text, flexShrink: 0 }}>{c.monto ? usd(c.monto) : ''}</span>
                  </div>

                  {/* Barra del flujo: un punto por paso (verde, ámbar, rojo o gris si no llegó).
                      En una operación posterior solo se muestran sus pasos. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                    {c.tipo === 'operacion' && (
                      <span style={{ fontSize: '0.7rem', color: T.muted, marginRight: 4 }}>{c.desdeAerolinea ? 'Hecho en la aerolínea' : 'Hecho en Booking'}</span>
                    )}
                    {c.tipo !== 'operacion' && PASOS.map((p) => {
                      const r = resultadoDe(p.id);
                      const est = r ? COLOR[r] : null;
                      return (
                        <span key={p.id} title={`${p.label}: ${c.eventos.filter((e) => e.paso === p.id).map((e) => e.detalle).join(' · ') || 'no llegó a este paso'}`}
                          style={{ fontSize: '0.66rem', borderRadius: 5, padding: '1px 5px', fontWeight: 600, background: est ? est.bg : T.fondo, color: est ? est.fg : '#b9b8b3', border: `1px solid ${est ? 'transparent' : T.border}` }}>
                          {est ? est.icon : '·'} {p.label}
                        </span>
                      );
                    })}
                    {ramas.map((r) => {
                      const est = COLOR[resultadoDe(r.id)] ?? COLOR.ok;
                      return (
                        <span key={r.id} style={{ fontSize: '0.72rem', borderRadius: 6, padding: '2px 7px', fontWeight: 600, background: est.bg, color: est.fg, marginLeft: 6 }}>
                          {est.icon} {r.label}
                        </span>
                      );
                    })}
                  </div>

                  {(c.resumen.tono === 'error' || (c.tipo === 'operacion' && c.resumen.tono === 'aviso')) && c.resumen.motivo && (
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
    </div>
  );
}
