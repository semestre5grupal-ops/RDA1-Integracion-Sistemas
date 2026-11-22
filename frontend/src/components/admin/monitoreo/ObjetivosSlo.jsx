import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import { ActualizadoHace } from '../panelUtils';
import { PASOS } from './modeloVuelos';

const T = {
  surface: '#ffffff', border: '#e3e6ea', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  ok: '#0d7a2f', okBg: '#e3f4e8', warn: '#9a5b00', warnBg: '#fdf1dc', bad: '#b42318', badBg: '#fde7e5', gris: '#f1f1ef',
};
const ESTADO = {
  ok: { t: 'Cumpliendo', fg: T.ok, bg: T.okBg },
  atencion: { t: 'Atención', fg: T.warn, bg: T.warnBg },
  critico: { t: 'Crítico', fg: T.bad, bg: T.badBg },
  sin_datos: { t: 'Pocos datos', fg: T.text2, bg: T.gris },
};
const ms = (n) => (n == null ? '—' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);
const pct = (n, d = 1) => (n == null ? '—' : `${(n * 100).toFixed(d).replace(/\.0+$/, '')} %`);

/** Objetivos de servicio de vuelos: SLO, presupuesto de error, burn rate y percentiles exactos. */
export function ObjetivosSlo({ nombre = (c) => c }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      const { data } = await api.get('/admin/procesos/vuelos/slo', { params: { horas: 24 } });
      setDatos(data);
      setError(null);
    } catch (e) {
      if (silencioso) throw e;
      setError(e?.response?.data?.message || e?.message || 'No se pudieron cargar los objetivos');
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const auto = useAutoRefresh(cargar, 30_000);

  if (error) return <div role="alert" style={{ background: T.badBg, color: T.bad, padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem' }}>{error}</div>;
  if (!datos) return <div style={{ color: T.muted, fontSize: '0.9rem', padding: 20 }}>Cargando objetivos…</div>;
  if (datos.disponible === false) return <div style={{ background: T.warnBg, color: T.warn, padding: '12px 14px', borderRadius: 10, fontSize: '0.88rem' }}>{datos.motivo}</div>;

  const dias = [...new Set((datos.historial || []).map((h) => h.dia))];
  const busq = (datos.historial || []).filter((h) => h.sli === 'busqueda_rapida');
  const maxP95 = Math.max(1, ...busq.map((h) => h.p95 || 0));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.82rem', color: T.text2, maxWidth: 640 }}>
          Cada objetivo tiene un <b>presupuesto de error</b>: lo que puede fallar sin incumplir la meta de los últimos {datos.ventanaDias} días.
          El <b>ritmo de gasto</b> dice qué tan rápido se está gastando (1x = normal; 6x o más = hay que mirar).
        </div>
        <span style={{ marginLeft: 'auto' }}><ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={30_000} /></span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {datos.slos.map((s) => {
          const e = ESTADO[s.estado] || ESTADO.sin_datos;
          const consumido = s.presupuestoConsumidoPct;
          return (
            <div key={s.id} style={{ background: T.surface, border: `1px solid ${s.estado === 'critico' ? '#f5b5ae' : T.border}`, borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', flex: 1 }}>{s.nombre}</div>
                <span style={{ color: e.fg, background: e.bg, borderRadius: 999, padding: '2px 9px', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{e.t}</span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{pct(s.cumplimiento, 2)}</div>
              <div style={{ fontSize: '0.76rem', color: T.muted }}>Meta: {s.meta} · {s.total} medidos, {s.malos} fallaron</div>
              <div>
                <div style={{ height: 8, background: T.gris, borderRadius: 999, overflow: 'hidden' }} aria-label="Presupuesto de error consumido">
                  <div style={{ width: `${Math.min(consumido ?? 0, 100)}%`, height: '100%', background: (consumido ?? 0) >= 100 ? T.bad : (consumido ?? 0) >= 60 ? T.warn : T.ok }} />
                </div>
                <div style={{ fontSize: '0.74rem', color: T.text2, marginTop: 3 }}>
                  Presupuesto de error gastado: {consumido == null ? '—' : Number.isFinite(consumido) ? `${consumido} %` : 'agotado'} (se permitían {s.fallosPermitidos})
                </div>
              </div>
              <div style={{ fontSize: '0.74rem', color: T.text2 }}>
                Ritmo de gasto: última hora <b>{s.burnRate.h1 ?? '—'}x</b> · 6 h <b>{s.burnRate.h6 ?? '—'}x</b> · 24 h <b>{s.burnRate.h24 ?? '—'}x</b>
              </div>
              <div style={{ fontSize: '0.76rem', color: e.fg }}>{s.mensaje}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Tiempos por paso y aerolínea <span style={{ fontWeight: 500, color: T.muted }}>· últimas 24 h · p95 = el 5 % más lento tarda eso o más</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.muted }}>
                {['Paso', 'Aerolínea', 'Veces', 'p50', 'p95', 'p99', 'Máximo'].map((h) => <th key={h} style={{ padding: '4px 8px', fontWeight: 700 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {datos.latencias.length === 0 && <tr><td colSpan={7} style={{ padding: 12, color: T.muted }}>Todavía no hay tiempos en este período.</td></tr>}
              {datos.latencias.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '5px 8px' }}>{PASOS[l.paso]?.icon} {PASOS[l.paso]?.label ?? l.paso}</td>
                  <td style={{ padding: '5px 8px', color: T.text2 }}>{l.nodo ? nombre(l.nodo) : 'Todas (búsqueda total)'}</td>
                  <td style={{ padding: '5px 8px' }}>{l.n}</td>
                  <td style={{ padding: '5px 8px' }}>{ms(l.p50)}</td>
                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>{ms(l.p95)}</td>
                  <td style={{ padding: '5px 8px' }}>{ms(l.p99)}</td>
                  <td style={{ padding: '5px 8px', color: T.muted }}>{ms(l.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {busq.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Búsqueda: tiempo p95 por día <span style={{ fontWeight: 500, color: T.muted }}>· últimos {dias.length} días con datos</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {busq.map((h) => (
              <div key={h.dia} title={`${h.dia}: p95 ${ms(h.p95)} · ${h.total} búsquedas`} style={{ flex: 1, minWidth: 8, display: 'grid', alignItems: 'end', height: '100%' }}>
                <div style={{ height: `${Math.max(((h.p95 || 0) / maxP95) * 100, 3)}%`, background: (h.p95 || 0) > 3000 ? T.bad : T.ok, borderRadius: '4px 4px 0 0' }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: T.muted }}>La meta es no pasar de 3 s. Las barras rojas la superaron ese día.</div>
        </div>
      )}
    </div>
  );
}
