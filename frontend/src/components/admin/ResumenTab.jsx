import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';

/**
 * Tablero "Resumen" del admin, al estilo del extranet de un Booking real.
 * Todo sale de GET /admin/metricas (datos reales de las 4 verticales y de las
 * aerolíneas socias). Si no hay datos, lo dice: no se inventan cifras.
 *
 * Colores: paleta categórica validada (dataviz) para las verticales, en orden
 * fijo; colores de estado reservados para confirmadas/pendientes/canceladas,
 * siempre con icono + texto. Los colores con poco contraste llevan etiquetas.
 */

const T = {
  surface: '#ffffff',
  page: '#f5f7fa',
  border: '#e3e6ea',
  text: '#1a1a1a',
  text2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  azul: '#003580',
  up: '#006300',
  down: '#b42318',
};

const VERTICALES = [
  { id: 'vuelos', label: 'Vuelos', icon: '✈️', color: '#2a78d6' },
  { id: 'autos', label: 'Autos', icon: '🚗', color: '#eb6834' },
  { id: 'atracciones', label: 'Atracciones', icon: '🎡', color: '#1baf7a' },
  { id: 'hospedaje', label: 'Hospedaje', icon: '🏨', color: '#eda100' },
];

const ESTADOS = [
  { id: 'confirmadas', label: 'Confirmadas', icon: '✓', color: '#0ca30c' },
  { id: 'pendientes', label: 'Pendientes', icon: '⏳', color: '#fab219', tinta: '#0b0b0b' },
  { id: 'canceladas', label: 'Canceladas', icon: '✕', color: '#d03b3b' },
  { id: 'otras', label: 'Otros', icon: '•', color: '#b5b3ab' },
];

const PERIODOS = [
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
  { dias: 365, label: '12 meses' },
];

const usd = (n) =>
  `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdCorto = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};
const entero = (n) => Number(n || 0).toLocaleString('es-EC');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => {
  const [, m, d] = String(iso).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
};

/** Agrupa la serie diaria en semanas (90 días) o meses (12 meses) para que se lea. */
function agrupar(serie, dias) {
  if (dias <= 31) return serie.map((d) => ({ ...d, etiqueta: fechaCorta(d.fecha), detalle: fechaCorta(d.fecha) }));
  const grupos = new Map();
  for (const d of serie) {
    const [y, m] = d.fecha.split('-');
    let clave;
    let etiqueta;
    if (dias > 120) {
      clave = `${y}-${m}`;
      etiqueta = `${MESES[Number(m) - 1]} ${y.slice(2)}`;
    } else {
      const idx = Math.floor(serie.indexOf(d) / 7);
      clave = `s${idx}`;
      etiqueta = fechaCorta(d.fecha);
    }
    const g = grupos.get(clave) ?? {
      fecha: d.fecha, etiqueta, desde: d.fecha, hasta: d.fecha, reservas: 0, ingresos: 0,
      porVertical: { vuelos: 0, autos: 0, atracciones: 0, hospedaje: 0 },
    };
    g.hasta = d.fecha;
    g.reservas += d.reservas;
    g.ingresos += d.ingresos;
    for (const v of VERTICALES) g.porVertical[v.id] += d.porVertical?.[v.id] || 0;
    grupos.set(clave, g);
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    detalle: dias > 120 ? g.etiqueta : `${fechaCorta(g.desde)} – ${fechaCorta(g.hasta)}`,
  }));
}

function variacion(actual, anterior) {
  if (!anterior) return actual ? null : 0;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

// ───────────────────────────── Piezas ─────────────────────────────

function Tarjeta({ titulo, children, accion, sub }) {
  return (
    <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: T.text }}>{titulo}</h3>
          {sub && <div style={{ fontSize: '0.78rem', color: T.muted, marginTop: 2 }}>{sub}</div>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, valor, actual, anterior, menosEsMejor = false, nota }) {
  const delta = variacion(actual, anterior);
  const bueno = delta === null ? null : menosEsMejor ? delta <= 0 : delta >= 0;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: '0.8rem', color: T.text2, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: T.text, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: '0.76rem', color: T.muted }}>
        {delta === null ? (
          <span>sin datos del período anterior</span>
        ) : delta === 0 ? (
          <span>= igual que el período anterior</span>
        ) : (
          <span style={{ color: bueno ? T.up : T.down, fontWeight: 700 }}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%
            <span style={{ color: T.muted, fontWeight: 400 }}> vs período anterior</span>
          </span>
        )}
      </div>
      {nota && <div style={{ fontSize: '0.72rem', color: T.muted, marginTop: 4 }}>{nota}</div>}
    </div>
  );
}

function Leyenda({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '0.78rem', color: T.text2 }}>
      {items.map((it) => (
        <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: it.color, display: 'inline-block' }} />
          {it.icon && <span aria-hidden="true">{it.icon}</span>}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Vacio({ children }) {
  return (
    <div style={{ padding: '28px 12px', textAlign: 'center', color: T.muted, fontSize: '0.86rem' }}>{children}</div>
  );
}

/** Columnas apiladas por vertical, con eje, cuadrícula y tooltip al pasar. */
function GraficoIngresos({ puntos }) {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(720);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const alto = 240;
  const m = { top: 10, right: 8, bottom: 26, left: 48 };
  const w = ancho - m.left - m.right;
  const h = alto - m.top - m.bottom;
  const max = Math.max(...puntos.map((p) => p.ingresos), 0);
  const tope = max > 0 ? niceMax(max) : 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const paso = w / Math.max(puntos.length, 1);
  const barra = Math.max(2, Math.min(28, paso * 0.68));
  const cadaEtiqueta = Math.ceil(puntos.length / Math.max(1, Math.floor(w / 56)));
  const y = (v) => m.top + h - (v / tope) * h;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={ancho} height={alto} role="img" aria-label="Ingresos cobrados por período, apilados por vertical" style={{ display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={ancho - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? T.axis : T.grid} strokeWidth={1} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={T.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {usdCorto(t)}
            </text>
          </g>
        ))}
        {puntos.map((p, i) => {
          const cx = m.left + paso * i + paso / 2;
          let base = 0;
          const capas = VERTICALES.filter((v) => (p.porVertical?.[v.id] || 0) > 0);
          return (
            <g key={p.fecha}>
              {capas.map((v, j) => {
                const val = p.porVertical[v.id];
                const y0 = y(base);
                const y1 = y(base + val);
                base += val;
                const esUltima = j === capas.length - 1;
                const altoSeg = Math.max(0, y0 - y1 - (esUltima ? 0 : 2));
                return esUltima ? (
                  <path key={v.id} d={rectRedondeadoArriba(cx - barra / 2, y1, barra, altoSeg, Math.min(4, barra / 2))} fill={v.color} />
                ) : (
                  <rect key={v.id} x={cx - barra / 2} y={y1 + 2} width={barra} height={altoSeg} fill={v.color} />
                );
              })}
              {i % cadaEtiqueta === 0 && (
                <text x={cx} y={alto - 8} textAnchor="middle" fontSize="11" fill={T.muted}>{p.etiqueta}</text>
              )}
              <rect
                x={m.left + paso * i}
                y={m.top}
                width={paso}
                height={h}
                fill={hover === i ? 'rgba(0,53,128,0.06)' : 'transparent'}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${p.detalle}: ${usd(p.ingresos)} cobrados, ${p.reservas} reservas`}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && puntos[hover] && (
        <Tooltip x={m.left + paso * hover + paso / 2} ancho={ancho} punto={puntos[hover]} />
      )}
    </div>
  );
}

function Tooltip({ x, ancho, punto }) {
  const izquierda = x > ancho - 200;
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute', top: 6, [izquierda ? 'right' : 'left']: izquierda ? ancho - x + 12 : x + 12,
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: '0.78rem', color: T.text, pointerEvents: 'none', minWidth: 170, zIndex: 2,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{punto.detalle}</div>
      {VERTICALES.map((v) => (
        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: v.color, marginRight: 6 }} />{v.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(punto.porVertical?.[v.id])}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <strong>Total</strong><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(punto.ingresos)}</strong>
      </div>
      <div style={{ color: T.muted, marginTop: 2 }}>{entero(punto.reservas)} reservas creadas</div>
    </div>
  );
}

function niceMax(v) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const paso = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return paso * exp;
}

function rectRedondeadoArriba(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Barras horizontales con etiqueta de valor siempre visible. */
function BarrasHorizontales({ filas, valor, formato, color }) {
  const max = Math.max(...filas.map(valor), 0);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {filas.map((f) => {
        const v = valor(f);
        const pct = max ? (v / max) * 100 : 0;
        return (
          <div key={f.key} title={f.title}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: T.text, marginBottom: 4 }}>
              <span>{f.label}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formato(v)}{f.extra ? <span style={{ color: T.muted, fontWeight: 400 }}> · {f.extra}</span> : null}</span>
            </div>
            <div style={{ background: '#f0f1f3', borderRadius: 4, height: 10 }}>
              <div style={{ width: `${pct}%`, minWidth: v > 0 ? 4 : 0, height: '100%', background: color(f), borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 100 % apilado por vertical (confirmadas / pendientes / canceladas / otros). */
function EstadosPorVertical({ porVertical }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {VERTICALES.map((v) => {
        const fila = porVertical.find((p) => p.vertical === v.id);
        const total = fila?.reservas || 0;
        return (
          <div key={v.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
              <span>{v.icon} {v.label}</span>
              <span style={{ color: T.muted }}>{entero(total)} reservas</span>
            </div>
            {total === 0 ? (
              <div style={{ height: 14, borderRadius: 4, background: '#f0f1f3' }} aria-label={`${v.label}: sin reservas`} />
            ) : (
              <div style={{ display: 'flex', gap: 2, height: 14 }} role="img"
                aria-label={`${v.label}: ` + ESTADOS.map((e) => `${fila.estados[e.id]} ${e.label.toLowerCase()}`).join(', ')}>
                {ESTADOS.filter((e) => fila.estados[e.id] > 0).map((e, i, arr) => (
                  <div
                    key={e.id}
                    title={`${e.label}: ${fila.estados[e.id]} (${Math.round((fila.estados[e.id] / total) * 100)}%)`}
                    style={{
                      flex: fila.estados[e.id], background: e.color, minWidth: 6,
                      borderRadius: `${i === 0 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TablaSerie({ puntos }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ background: '#f5f7fa', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Período</th>
            {VERTICALES.map((v) => <th key={v.id} style={{ padding: '6px 8px' }}>{v.label}</th>)}
            <th style={{ padding: '6px 8px' }}>Total</th>
            <th style={{ padding: '6px 8px' }}>Reservas</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((p) => (
            <tr key={p.fecha} style={{ borderTop: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <td style={{ textAlign: 'left', padding: '5px 8px' }}>{p.detalle}</td>
              {VERTICALES.map((v) => <td key={v.id} style={{ padding: '5px 8px' }}>{usd(p.porVertical?.[v.id])}</td>)}
              <td style={{ padding: '5px 8px', fontWeight: 700 }}>{usd(p.ingresos)}</td>
              <td style={{ padding: '5px 8px' }}>{entero(p.reservas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── Tablero ─────────────────────────────

export function ResumenTab({ refreshKey = 0, onIrA }) {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [verTabla, setVerTabla] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/metricas', { params: { dias } });
      setDatos(data);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'No se pudieron cargar las métricas.');
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const puntos = useMemo(() => (datos?.serieDiaria ? agrupar(datos.serieDiaria, datos.dias) : []), [datos]);
  const k = datos?.kpis || {};
  const ka = datos?.kpisAnterior || {};
  const porVertical = datos?.porVertical || [];
  const prov = datos?.proveedores || {};
  const hayIngresos = puntos.some((p) => p.ingresos > 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.azul }}>Resumen del negocio</h2>
          <div style={{ fontSize: '0.8rem', color: T.muted }}>
            {datos ? `Del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)} · datos reales de las 4 verticales y aerolíneas socias` : 'Cargando…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div role="group" aria-label="Período" style={{ display: 'inline-flex', border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', background: T.surface }}>
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                type="button"
                onClick={() => setDias(p.dias)}
                aria-pressed={dias === p.dias}
                style={{
                  border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: dias === p.dias ? T.azul : 'transparent', color: dias === p.dias ? '#fff' : T.text2,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={cargar} disabled={cargando}
            style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>
            {cargando ? '⏳' : '↻'} Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fdecea', border: '1px solid #f5c2c0', color: '#8a1c1c', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, opacity: cargando ? 0.6 : 1 }}>
        <Kpi label="Ingresos cobrados" valor={usd(k.ingresos)} actual={k.ingresos} anterior={ka.ingresos} nota={`${entero(k.reservasCobradas)} reservas pagadas`} />
        <Kpi label="Reservas creadas" valor={entero(k.reservas)} actual={k.reservas} anterior={ka.reservas} />
        <Kpi label="Ticket promedio" valor={usd(k.ticketPromedio)} actual={k.ticketPromedio} anterior={ka.ticketPromedio} />
        <Kpi label="Comisión Booking" valor={usd(k.comision)} actual={k.comision} anterior={ka.comision} nota={`${datos?.comisionPct ?? 0}% sobre lo cobrado`} />
        <Kpi label="Tasa de cancelación" valor={`${k.tasaCancelacion ?? 0}%`} actual={k.tasaCancelacion} anterior={ka.tasaCancelacion} menosEsMejor />
      </div>

      <Tarjeta
        titulo="Ingresos cobrados"
        sub={datos?.dias > 120 ? 'Por mes' : datos?.dias > 31 ? 'Por semana' : 'Por día'}
        accion={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Leyenda items={VERTICALES} />
            <button type="button" onClick={() => setVerTabla((v) => !v)}
              style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}>
              {verTabla ? '📊 Ver gráfico' : '📋 Ver tabla'}
            </button>
          </div>
        }
      >
        {!datos && cargando ? <Vacio>Cargando…</Vacio>
          : !hayIngresos ? <Vacio>No hay reservas cobradas en este período. Prueba con un rango más amplio.</Vacio>
          : verTabla ? <TablaSerie puntos={puntos} />
          : <GraficoIngresos puntos={puntos} />}
      </Tarjeta>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Tarjeta titulo="Ventas por vertical" sub="Ingresos cobrados y número de reservas">
          {porVertical.every((p) => !p.reservas) ? <Vacio>Sin reservas en el período.</Vacio> : (
            <BarrasHorizontales
              filas={VERTICALES.map((v) => {
                const p = porVertical.find((x) => x.vertical === v.id) || {};
                return { key: v.id, label: `${v.icon} ${v.label}`, ingresos: p.ingresos || 0, extra: `${entero(p.reservas)} reservas`, color: v.color };
              })}
              valor={(f) => f.ingresos}
              formato={usd}
              color={(f) => f.color}
            />
          )}
        </Tarjeta>

        <Tarjeta titulo="Estado de las reservas" accion={<Leyenda items={ESTADOS.slice(0, 3)} />}>
          {porVertical.every((p) => !p.reservas) ? <Vacio>Sin reservas en el período.</Vacio> : <EstadosPorVertical porVertical={porVertical} />}
        </Tarjeta>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Tarjeta titulo="Destinos más reservados" sub="Vuelos (destino) y hospedaje (ciudad)">
          {!datos?.topDestinos?.length ? <Vacio>Todavía no hay destinos con reservas en este período.</Vacio> : (
            <BarrasHorizontales
              filas={datos.topDestinos.map((d) => ({ key: d.destino, label: `📍 ${d.destino}`, reservas: d.reservas, extra: usd(d.ingresos) }))}
              valor={(f) => f.reservas}
              formato={(v) => `${entero(v)} reservas`}
              color={() => '#2a78d6'}
            />
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Proveedores conectados"
          sub="Según el último ping real (no simulado)"
          accion={onIrA && (
            <button type="button" onClick={() => onIrA('microservicios')}
              style={{ border: 'none', background: 'none', color: T.azul, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              Ver proveedores →
            </button>
          )}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { label: 'En línea', icon: '🟢', valor: prov.enLinea },
              { label: 'Sin respuesta', icon: '🔴', valor: prov.caidos },
              { label: 'Sin verificar', icon: '⚪', valor: prov.sinVerificar },
              { label: 'Apagados (Kill-Switch)', icon: '⛔', valor: prov.apagados },
            ].map((x) => (
              <div key={x.label} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.78rem', color: T.text2 }}>{x.icon} {x.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{entero(x.valor)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 10 }}>
            {entero(prov.total)} socios registrados
            {prov.porVertical && Object.keys(prov.porVertical).length > 0 &&
              ' · ' + Object.entries(prov.porVertical).map(([v, n]) => `${n} ${v.toLowerCase()}`).join(', ')}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
