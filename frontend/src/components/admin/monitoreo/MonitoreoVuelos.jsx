import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import { ActualizadoHace } from '../panelUtils';
import { ProcesoEnVivo } from '../ProcesoEnVivo';
import { saludDeTramos } from '../ArquitecturaVuelos';
import { armarCasos, BARRA_COMPRA, COLUMNAS_AEROLINEA, esPrueba, PASOS, porAerolinea, resumen } from './modeloVuelos';

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781', azul: '#003580', azul2: '#006ce4', fondo: '#f7f8fa',
  ok: '#0d7a2f', okBg: '#e3f4e8', warn: '#9a5b00', warnBg: '#fdf1dc', bad: '#b42318', badBg: '#fde7e5', curso: '#1d4ed8', cursoBg: '#eff6ff',
};
const TONO = {
  ok: [T.ok, T.okBg], aviso: [T.warn, T.warnBg], error: [T.bad, T.badBg], curso: [T.curso, T.cursoBg], neutro: [T.text2, '#f1f1ef'],
};
const PERIODOS = [{ h: 1, t: 'Última hora' }, { h: 24, t: 'Hoy (24 h)' }, { h: 168, t: '7 días' }];
const FILTROS = [
  { id: 'todas', t: 'Todas' }, { id: 'problemas', t: 'Problemas' }, { id: 'curso', t: 'En curso' }, { id: 'completada', t: 'Completadas' },
  { id: 'abandonada', t: 'Abandonadas' }, { id: 'posventa', t: 'Post-venta' }, { id: 'fondo', t: 'Integración' },
];

const hora = (iso) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const usd = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const seg = (ms) => (ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

function Chip({ tono = 'neutro', children, title }) {
  const [fg, bg] = TONO[tono] || TONO.neutro;
  return <span title={title} style={{ color: fg, background: bg, borderRadius: 999, padding: '2px 9px', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

/** Monitoreo del proceso de vuelos: Resumen · Operaciones · Aerolíneas · Diagrama. */
export function MonitoreoVuelos({ aerolineas = [] }) {
  const [vista, setVista] = useState('resumen');
  const [horas, setHoras] = useState(24);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ocultarPruebas, setOcultarPruebas] = useState(true);
  const [reproducir, setReproducir] = useState(null);
  const [abrir, setAbrir] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      const { data } = await api.get('/admin/procesos/vuelos/monitoreo', { params: { horas } });
      setDatos(data);
      setError(null);
    } catch (e) {
      if (silencioso) throw e;
      setError(e?.response?.data?.message || e?.message || 'No se pudo cargar el monitoreo');
    }
  }, [horas]);
  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  const auto = useAutoRefresh(cargar, 10_000, { pausado: vista === 'diagrama' });

  const nombres = useMemo(() => Object.fromEntries(aerolineas.map((a) => [a.codigo, a.nombre || a.codigo])), [aerolineas]);
  const nombre = useCallback((c) => nombres[c] || String(c || '').replace(/^NODE_VUE_/, '') || '—', [nombres]);
  const eventos = useMemo(() => datos?.eventos ?? [], [datos]);
  const todos = useMemo(() => armarCasos(eventos), [eventos]);
  const casos = useMemo(() => (ocultarPruebas ? todos.filter((c) => !esPrueba(c)) : todos), [todos, ocultarPruebas]);
  const pruebas = todos.length - casos.length;
  const res = useMemo(() => resumen(casos, eventos, { aerolineas, nombre }), [casos, eventos, aerolineas, nombre]);
  const salud = useMemo(() => saludDeTramos(eventos.filter((e) => Date.now() - Date.parse(e.ts) < 3_600_000), aerolineas), [eventos, aerolineas]);

  const verRecorrido = (caso) => {
    setReproducir({ eventos: [...caso.eventos, ...caso.posventa], n: Date.now() });
    setVista('diagrama');
  };
  const irA = (casoId) => { setAbrir(casoId); setVista('operaciones'); };

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, background: '#eef1f5', padding: 4, borderRadius: 10, flexWrap: 'wrap' }}>
          {[['resumen', '📊 Resumen'], ['operaciones', '🧾 Operaciones'], ['aerolineas', '✈️ Aerolíneas'], ['diagrama', '🔴 Diagrama en vivo']].map(([id, t]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
              style={{ border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem', background: vista === id ? T.surface : 'transparent', color: vista === id ? T.azul : T.text2, boxShadow: vista === id ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
              {t}{id === 'resumen' && res.alertas.length ? <span style={{ marginLeft: 6, background: res.alertas.some((a) => a.nivel === 'critico') ? T.bad : T.warn, color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: '0.72rem' }}>{res.alertas.length}</span> : null}
            </button>
          ))}
        </div>
        {vista !== 'diagrama' && (
          <>
            <select value={horas} onChange={(e) => setHoras(Number(e.target.value))} aria-label="Período"
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', fontSize: '0.83rem', background: T.surface }}>
              {PERIODOS.map((p) => <option key={p.h} value={p.h}>{p.t}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: T.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={ocultarPruebas} onChange={(e) => setOcultarPruebas(e.target.checked)} />
              Ocultar pruebas{pruebas ? ` (${pruebas})` : ''}
            </label>
            <span style={{ marginLeft: 'auto' }}><ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={10_000} /></span>
          </>
        )}
      </div>

      {error && <div role="alert" style={{ background: T.badBg, color: T.bad, padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem' }}>{error}</div>}
      {!datos && !error && vista !== 'diagrama' && <div style={{ color: T.muted, fontSize: '0.9rem', padding: 20 }}>Cargando monitoreo…</div>}
      {datos?.truncado && vista !== 'diagrama' && <div style={{ fontSize: '0.78rem', color: T.warn }}>Hay más eventos de los que se muestran en este período: se ven los más recientes.</div>}

      {datos && vista === 'resumen' && <Resumen res={res} irA={irA} horas={horas} />}
      {datos && vista === 'operaciones' && <Operaciones casos={casos} nombre={nombre} aerolineas={aerolineas} abrir={abrir} setAbrir={setAbrir} verRecorrido={verRecorrido} />}
      {datos && vista === 'aerolineas' && <Aerolineas filas={porAerolinea(eventos.filter((e) => !ocultarPruebas || !/^corr-e2e/.test(e.correlacion) && !/example\.com/.test(e.cliente || '')), aerolineas)} />}
      {vista === 'diagrama' && <ProcesoEnVivo aerolineas={aerolineas} reproducirExterno={reproducir} salud={salud} />}
    </section>
  );
}

// ───────────────────────────── Resumen ─────────────────────────────

function Resumen({ res, irA, horas }) {
  const { embudo, kpis, alertas } = res;
  const max = Math.max(1, ...embudo.map((e) => e.n));
  const tarjetas = [
    ['Compras confirmadas', kpis.confirmadas, null],
    ['Cobrado', usd(kpis.cobrado), null],
    ['Reembolsado', usd(kpis.reembolsado), null],
    ['En curso', kpis.enCurso, 'hold vivo, sin pagar todavía'],
    ['Abandonadas', kpis.abandonadas, 'el hold venció sin pago'],
    ['Tasa de error', `${Math.round(kpis.tasaError * 100)} %`, 'compras que fallaron / compras con hold'],
    ['Tiempo de compra', seg(kpis.duracionMediana), 'mediana: del hold a confirmada'],
    ['Check-ins · Cancelaciones', `${kpis.checkins} · ${kpis.cancelaciones}`, null],
  ];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {alertas.length === 0 ? (
          <div style={{ background: T.okBg, color: T.ok, borderRadius: 10, padding: '12px 14px', fontWeight: 700, fontSize: '0.9rem' }}>✓ Sin alertas: todo funciona con normalidad.</div>
        ) : alertas.map((a, i) => (
          <div key={i} role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 10, padding: '10px 14px', background: a.nivel === 'critico' ? T.badBg : T.warnBg, border: `1px solid ${a.nivel === 'critico' ? '#f5b5ae' : '#f1d39b'}` }}>
            <span aria-hidden="true">{a.nivel === 'critico' ? '🚨' : '⚠️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: a.nivel === 'critico' ? T.bad : T.warn, fontSize: '0.9rem' }}>{a.titulo}</div>
              <div style={{ fontSize: '0.82rem', color: T.text2, overflowWrap: 'anywhere' }}>{a.texto}</div>
            </div>
            {a.casoId && <button type="button" onClick={() => irA(a.casoId)} style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Ver</button>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {tarjetas.map(([t, v, ayuda]) => (
          <div key={t} title={ayuda || undefined} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t}</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div>
            {ayuda && <div style={{ fontSize: '0.7rem', color: T.muted }}>{ayuda}</div>}
          </div>
        ))}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontWeight: 800, color: T.azul, marginBottom: 10 }}>Embudo de ventas · {PERIODOS.find((p) => p.h === horas)?.t.toLowerCase()}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {embudo.map((e, i) => {
            const prev = i ? embudo[i - 1].n : null;
            const pct = prev ? Math.round((e.n / prev) * 100) : null;
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 170px) 1fr 90px', gap: 10, alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: T.text2 }}>{PASOS[e.id]?.icon} {e.label}</span>
                <div style={{ background: '#eef1f5', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(e.n / max) * 100}%`, minWidth: e.n ? 4 : 0, height: '100%', background: i === embudo.length - 1 ? T.ok : T.azul2, borderRadius: 6, transition: 'width .4s' }} />
                </div>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{e.n}{pct != null ? <span style={{ color: T.muted, fontWeight: 500 }}> · {pct}%</span> : null}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Operaciones ─────────────────────────────

function Operaciones({ casos, nombre, aerolineas, abrir, setAbrir, verRecorrido }) {
  const [filtro, setFiltro] = useState('todas');
  const [aero, setAero] = useState('');
  const [texto, setTexto] = useState('');
  const [verBusquedas, setVerBusquedas] = useState(false);
  const [limite, setLimite] = useState(40);

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return casos.filter((c) => {
      if (c.tipo === 'busqueda' && !verBusquedas) return false;
      if (aero && c.nodo !== aero) return false;
      const k = c.estado.clave;
      if (filtro === 'problemas' && !(k === 'fallo' || k === 'critico' || (c.tipo !== 'compra' && c.estado.tono === 'error'))) return false;
      if (filtro === 'curso' && k !== 'curso') return false;
      if (filtro === 'completada' && k !== 'completada') return false;
      if (filtro === 'abandonada' && k !== 'abandonada') return false;
      if (filtro === 'posventa' && !(c.tipo === 'posventa' || c.posventa.length)) return false;
      if (filtro === 'fondo' && !(c.tipo === 'integracion' || c.tipo === 'webhook')) return false;
      if (q && ![c.pnr, c.cliente, c.correlacion, nombre(c.nodo)].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [casos, filtro, aero, texto, verBusquedas, nombre]);
  const cuenta = (id) => casos.filter((c) => (id === 'todas' ? c.tipo !== 'busqueda' : id === 'problemas' ? ['fallo', 'critico'].includes(c.estado.clave) : id === 'posventa' ? c.tipo === 'posventa' || c.posventa.length : id === 'fondo' ? c.tipo === 'integracion' || c.tipo === 'webhook' : c.estado.clave === id)).length;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {FILTROS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
            style={{ border: `1px solid ${filtro === f.id ? T.azul : T.border}`, background: filtro === f.id ? T.azul : T.surface, color: filtro === f.id ? '#fff' : T.text, borderRadius: 999, padding: '5px 11px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            {f.t} <span style={{ opacity: 0.75 }}>({cuenta(f.id)})</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select value={aero} onChange={(e) => setAero(e.target.value)} aria-label="Aerolínea" style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem', background: T.surface }}>
          <option value="">Todas las aerolíneas</option>
          {aerolineas.map((a) => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
        </select>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar PNR, correo o código…" aria-label="Buscar"
          style={{ flex: '1 1 200px', minWidth: 0, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: T.text2, cursor: 'pointer' }}>
          <input type="checkbox" checked={verBusquedas} onChange={(e) => setVerBusquedas(e.target.checked)} /> Mostrar búsquedas sin compra
        </label>
      </div>

      {visibles.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.muted, background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 12 }}>No hay operaciones con estos filtros.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {visibles.slice(0, limite).map((c) => (
          <FilaCaso key={c.id} caso={c} nombre={nombre} abierto={abrir === c.id} alternar={() => setAbrir(abrir === c.id ? null : c.id)} verRecorrido={verRecorrido} />
        ))}
      </div>
      {visibles.length > limite && (
        <button type="button" onClick={() => setLimite((l) => l + 40)} style={{ justifySelf: 'center', border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>
          Ver más ({visibles.length - limite})
        </button>
      )}
    </div>
  );
}

function BarraPasos({ caso }) {
  if (caso.tipo !== 'compra') {
    const pasos = [...new Set(caso.eventos.map((e) => e.paso))];
    return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{pasos.map((p) => <span key={p} style={{ fontSize: '0.72rem', color: T.text2 }}>{PASOS[p]?.icon} {PASOS[p]?.label}</span>)}</div>;
  }
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
      {BARRA_COMPRA.map((p) => {
        const evs = caso.eventos.filter((e) => e.paso === p);
        const peor = evs.some((e) => e.resultado === 'error') ? 'error' : evs.some((e) => e.resultado === 'aviso') ? 'aviso' : evs.length ? 'ok' : null;
        const [fg, bg] = peor ? TONO[peor] : ['#b6b4ad', '#f4f4f2'];
        return <span key={p} title={`${PASOS[p].label}${evs.length > 1 ? ` ×${evs.length}` : ''}`} style={{ fontSize: '0.7rem', fontWeight: 700, color: fg, background: bg, borderRadius: 6, padding: '2px 6px' }}>{peor === 'error' ? '✕' : peor === 'aviso' ? '!' : peor ? '✓' : '·'} {PASOS[p].label}{evs.length > 1 ? ` ×${evs.length}` : ''}</span>;
      })}
      {caso.consultas > 0 && <span title="Consultas a la aerolínea (mapa de asientos, etc.)" style={{ fontSize: '0.7rem', color: T.muted }}>🔁 ×{caso.consultas}</span>}
      {caso.posventa.length > 0 && <span style={{ fontSize: '0.7rem', color: T.azul, fontWeight: 700 }}>+ post-venta: {caso.estadoPosventa?.label}</span>}
    </div>
  );
}

function FilaCaso({ caso, nombre, abierto, alternar, verRecorrido }) {
  const borde = caso.estado.tono === 'error' ? '#f5b5ae' : T.border;
  return (
    <div style={{ background: T.surface, border: `1px solid ${borde}`, borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={alternar} aria-expanded={abierto}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'grid', gap: 6, padding: '10px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{fechaHora(caso.fin)}</span>
          {caso.cliente && <span style={{ fontSize: '0.82rem', fontWeight: 700, overflowWrap: 'anywhere' }}>👤 {caso.cliente}</span>}
          {caso.nodo && <span style={{ fontSize: '0.8rem', color: T.text2 }}>✈ {nombre(caso.nodo)}</span>}
          {caso.pnr && <span style={{ fontSize: '0.8rem', fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700 }}>PNR {caso.pnr}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {caso.monto != null && <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{usd(caso.monto)}</span>}
            <Chip tono={caso.estado.tono}>{caso.estado.label}</Chip>
          </span>
        </div>
        <BarraPasos caso={caso} />
        {caso.estado.motivo && <div style={{ fontSize: '0.78rem', color: caso.estado.tono === 'error' ? T.bad : T.text2, overflowWrap: 'anywhere' }}>Motivo: {caso.estado.motivo}</div>}
      </button>
      {abierto && <LineaDeTiempo caso={caso} nombre={nombre} verRecorrido={verRecorrido} />}
    </div>
  );
}

function LineaDeTiempo({ caso, nombre, verRecorrido }) {
  // Las consultas repetidas (mapa de asientos) se agrupan en una sola línea.
  const items = [];
  for (const e of [...caso.eventos, ...caso.posventa].sort((a, b) => a.seq - b.seq)) {
    const prev = items[items.length - 1];
    if (e.paso === 'consulta' && prev?.paso === 'consulta' && prev.resultado === e.resultado) { prev.veces += 1; prev.ms.push(e.ms); prev.hasta = e.ts; continue; }
    items.push({ ...e, veces: 1, ms: [e.ms], hasta: e.ts });
  }
  const inicio = Date.parse(items[0]?.ts);
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, background: T.fondo, padding: '12px 14px', display: 'grid', gap: 10 }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
        {items.map((e, i) => {
          const [fg, bg] = TONO[e.resultado === 'ok' ? 'ok' : e.resultado === 'aviso' ? 'aviso' : 'error'];
          const msVal = e.veces > 1 ? null : e.ms[0];
          return (
            <li key={e.seq} style={{ display: 'grid', gridTemplateColumns: '70px 22px 1fr', gap: 8, alignItems: 'start' }}>
              <span style={{ fontSize: '0.72rem', color: T.muted, fontVariantNumeric: 'tabular-nums', paddingTop: 3 }}>{hora(e.ts)}<br /><span style={{ opacity: 0.8 }}>+{seg(Date.parse(e.ts) - inicio)}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{e.resultado === 'ok' ? '✓' : e.resultado === 'aviso' ? '!' : '✕'}</span>
                {i < items.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 10, background: '#dfe3e8' }} />}
              </span>
              <div style={{ paddingBottom: 10, minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                  {PASOS[e.paso]?.icon} {PASOS[e.paso]?.label ?? e.paso}{e.veces > 1 ? ` ×${e.veces}` : ''}
                  {e.nodo && <span style={{ fontWeight: 500, color: T.text2 }}> · {nombre(e.nodo)}</span>}
                  {msVal != null && <span style={{ fontWeight: 500, color: msVal > 5000 ? T.warn : T.muted }}> · {seg(msVal)}</span>}
                  {e.monto != null && <span style={{ fontWeight: 700, color: T.text }}> · {usd(e.monto)}</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: e.resultado === 'ok' ? T.text2 : fg, overflowWrap: 'anywhere' }}>
                  {e.veces > 1 ? `${e.veces} consultas entre ${hora(e.ts)} y ${hora(e.hasta)} · mediana ${seg([...e.ms].filter(Number.isFinite).sort((a, b) => a - b)[Math.floor((e.ms.length - 1) / 2)])}` : e.detalle}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => verRecorrido(caso)} style={{ border: 0, background: T.azul, color: '#fff', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>▶ Ver recorrido en el diagrama</button>
        <span style={{ fontSize: '0.72rem', color: T.muted, fontFamily: 'ui-monospace,Menlo,monospace', overflowWrap: 'anywhere' }}>{caso.correlacion}</span>
      </div>
    </div>
  );
}

// ───────────────────────────── Aerolíneas ─────────────────────────────

function Aerolineas({ filas }) {
  const estado = { EN_LINEA: ['ok', '🟢 Integrada'], SIN_INTEGRACION: ['aviso', '🟡 Sin integración'], CAIDA: ['error', '🔴 Caída'], APAGADA: ['neutro', '⛔ Apagada'], SIN_VERIFICAR: ['neutro', '⚪ Sin verificar'] };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ overflowX: 'auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 760 }}>
          <thead>
            <tr style={{ background: T.fondo, textAlign: 'left' }}>
              <th style={{ padding: '9px 12px' }}>Aerolínea</th>
              <th style={{ padding: '9px 8px' }}>Estado</th>
              {COLUMNAS_AEROLINEA.map((p) => <th key={p} style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>{PASOS[p].icon} {p === 'consulta' ? 'Mapa / consultas' : PASOS[p].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const [tono, texto] = estado[f.estado] || ['neutro', f.estado || '—'];
              return (
                <tr key={f.codigo} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '9px 12px', fontWeight: 700 }}>{f.nombre}<div style={{ fontWeight: 500, color: T.muted, fontSize: '0.72rem' }}>ping {f.latencia != null ? `${f.latencia} ms` : '—'}</div></td>
                  <td style={{ padding: '9px 8px' }}><Chip tono={tono}>{texto}</Chip></td>
                  {COLUMNAS_AEROLINEA.map((p) => {
                    const v = f.pasos[p];
                    if (!v) return <td key={p} style={{ padding: '9px 8px', color: '#c3c2b7' }}>—</td>;
                    const lento = v.mediana != null && v.mediana > 5000;
                    return (
                      <td key={p} style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: T.ok, fontWeight: 700 }}>✓{v.ok}</span>{v.problemas ? <span style={{ color: T.bad, fontWeight: 700 }}> ✕{v.problemas}</span> : null}
                        {v.mediana != null && <div title="mediana · p90" style={{ color: lento ? T.warn : T.muted, fontSize: '0.72rem', fontWeight: lento ? 700 : 400 }}>{seg(v.mediana)} · p90 {seg(v.p90)}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {filas.map((f) => (
          <div key={f.codigo} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontWeight: 800, color: T.azul, marginBottom: 6 }}>{f.nombre}</div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>Cambios de integración</div>
            {f.cambios.length ? f.cambios.map((e) => <div key={e.seq} style={{ fontSize: '0.78rem', color: e.resultado === 'ok' ? T.ok : e.resultado === 'error' ? T.bad : T.warn }}>{fechaHora(e.ts)} · {e.detalle.split(' · ')[0]}</div>) : <div style={{ fontSize: '0.78rem', color: T.muted }}>Sin cambios en el período.</div>}
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', marginTop: 8 }}>Últimos problemas</div>
            {f.errores.length ? f.errores.map((e) => <div key={e.seq} style={{ fontSize: '0.78rem', color: T.text2, overflowWrap: 'anywhere' }}><b style={{ color: e.resultado === 'error' ? T.bad : T.warn }}>{PASOS[e.paso]?.label}</b> · {fechaHora(e.ts)} · {e.detalle}</div>) : <div style={{ fontSize: '0.78rem', color: T.muted }}>Ninguno en el período.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
