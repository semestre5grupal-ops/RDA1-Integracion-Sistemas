import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
//
const C = {
  /* brand */
  blue: '#3b82f6', darkBlue: '#1d4ed8', lightBlue: '#eff6ff',
  /* semantic */
  green: '#10b981', red: '#ef4444', orange: '#f59e0b',
  cyan: '#06b6d4', purple: '#8b5cf6', yellow: '#fbbf24',
  /* neutrals */
  gray: '#6b7280', border: '#1e293b',
  bg: '#0f172a',       /* page bg */
  surface: '#1e293b',  /* card surface */
  surfaceHi: '#273549',/* hovered surface */
  white: '#f8fafc',    /* text on dark */
  text: '#e2e8f0',     /* body text */
  muted: '#94a3b8',    /* secondary text */
};

/* inject Inter font + scrollbar + pulse keyframe once */
if (!document.getElementById('admin-styles')) {
  const s = document.createElement('style');
  s.id = 'admin-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    .adm-root { font-family: 'Inter', system-ui, sans-serif; }
    .adm-root ::-webkit-scrollbar { width:6px; height:6px; }
    .adm-root ::-webkit-scrollbar-track { background:transparent; }
    .adm-root ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }
    @keyframes adm-pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
    @keyframes adm-spin { to{transform:rotate(360deg);} }
    .adm-tab-btn { transition: color .2s, border-color .2s, background .2s; }
    .adm-tab-btn:hover { color:#f8fafc !important; }
    .adm-action-btn { transition: opacity .15s, transform .1s; }
    .adm-action-btn:hover { opacity:.85; transform:scale(1.06); }
    .adm-row:hover td { background:#273549 !important; }
    .adm-card { transition: box-shadow .2s; }
    .adm-card:hover { box-shadow: 0 0 0 1px #3b82f680; }
  `;
  document.head.appendChild(s);
}

const TABS = [
  { id: 'observabilidad', label: 'Observabilidad', icon: '◈', sub: 'Tiempo real' },
  { id: 'microservicios', label: 'Microservicios', icon: '⬡', sub: 'RDA2 Simulado' },
  { id: 'gestion', label: 'Gestión', icon: '⊞', sub: 'Usuarios & Reservas' },
  { id: 'proveedores', label: 'Proveedores', icon: '⬡', sub: 'Integración RDA2' },
];

function fmt(n) { return typeof n === 'number' ? n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }); }
function estadoColor(s) {
  if (!s) return C.muted;
  const u = s.toUpperCase();
  if (u === 'CONFIRMED' || u === 'PAID') return C.green;
  if (u === 'CANCELLED' || u === 'REJECTED') return C.red;
  if (u === 'PENDING' || u === 'RESERVED') return C.orange;
  return C.muted;
}

function KpiCard({ label, value, sub, color, icon }) {
  const accent = color || C.blue;
  return (
    <div className="adm-card" style={{
      background: C.surface, borderRadius: 12,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8,
      borderLeft: `3px solid ${accent}`, position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: '1.4rem', opacity: .15 }}>{icon}</div>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: '1.85rem', fontWeight: 700, color: accent, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: C.muted }}>{sub}</div>}
    </div>
  );
}

function Badge({ status }) {
  const col = estadoColor(status);
  return (
    <span style={{
      background: col + '18', color: col, border: `1px solid ${col}30`,
      padding: '2px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em'
    }}>
      {status || '—'}
    </span>
  );
}

function SectionTitle({ children, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px', paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
      <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</h3>
      {badge && <span style={{ background: C.orange, color: '#0f172a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{badge}</span>}
    </div>
  );
}

function ServiceDot({ ok, label, latency }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? C.green : C.red }} />
        {ok && <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: C.green + '30', animation: 'adm-pulse 2s infinite' }} />}
      </div>
      <span style={{ flex: 1, fontSize: '0.85rem', color: C.text }}>{label}</span>
      {latency !== undefined && <span style={{ fontSize: '0.75rem', color: ok ? C.green : C.red, fontWeight: 600, fontFamily: 'monospace' }}>{latency}ms</span>}
    </div>
  );
}

function ObservabilidadTab({ stats, loadingStats, serviceHealth }) {
  if (loadingStats) return (
    <div style={{ textAlign: 'center', padding: 80, color: C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${C.surface}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'adm-spin 0.8s linear infinite' }} />
      <span style={{ fontSize: '0.9rem' }}>Consultando datos en tiempo real…</span>
    </div>
  );
  const k = stats?.kpis || {};

  const res = k.totalReservas || 0;

  // Usamos el funnel real del backend si viene, si no, fallback al simulado
  let funnel = stats?.realFunnel;

  if (!funnel) {
    funnel = res > 0 ? [
      { label: 'Búsquedas Globales (Vuelos, Autos, Atracciones)', count: res * 14, pct: 100 },
      { label: 'Selección de producto / Ver detalles', count: Math.round(res * 11.06), pct: 79 },
      { label: 'Inicio de Checkout', count: Math.round(res * 4.76), pct: 34 },
      { label: 'Ingreso de datos del cliente', count: Math.round(res * 2.1), pct: 15 },
      { label: 'Confirmación de Pago', count: Math.round(res * 1.07), pct: 7.7 },
      { label: '✅ Reserva Exitosa (Global - Real)', count: res, pct: 7.1 },
    ] : [
      { label: 'Búsquedas Globales (Vuelos, Autos, Atracciones)', count: 0, pct: 0 },
      { label: 'Selección de producto / Ver detalles', count: 0, pct: 0 },
      { label: 'Inicio de Checkout', count: 0, pct: 0 },
      { label: 'Ingreso de datos del cliente', count: 0, pct: 0 },
      { label: 'Confirmación de Pago', count: 0, pct: 0 },
      { label: '✅ Reserva Exitosa (Global - Real)', count: 0, pct: 0 },
    ];
  }

  const TRAFFIC_ITEMS = [
    { label: 'Vuelos', val: stats?.trafficByVertical?.vuelos || 0, color: C.blue },
    { label: 'Autos', val: stats?.trafficByVertical?.autos || 0, color: C.orange },
    { label: 'Atracciones', val: stats?.trafficByVertical?.atracciones || 0, color: C.green },
    { label: 'Hospedaje', val: stats?.kpis?.reservasHospedaje || 0, color: C.purple },
  ];
  return (
    <div>
      <SectionTitle>KPIs de Negocio</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
        <KpiCard icon="▣" label="Total Reservas" value={k.totalReservas ?? 0} color={C.blue} />
        <KpiCard icon="▲" label="Vuelos" value={k.reservasVuelos ?? 0} sub="reservas" color={C.darkBlue} />
        <KpiCard icon="◉" label="Autos" value={k.reservasAutos ?? 0} sub="reservas" color={C.cyan} />
        <KpiCard icon="◈" label="Atracciones" value={k.reservasAtracciones ?? 0} sub="reservas" color={C.green} />
        <KpiCard icon="⬟" label="Hospedajes" value={k.reservasHospedaje ?? 0} sub="reservas" color={C.purple} />
        <KpiCard icon="$" label="Ingresos Totales" value={`$${fmt(k.ingresosTotal)}`} sub="USD" color={C.green} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
        {/* Servicios */}
        <div>
          <SectionTitle>Estado de Servicios</SectionTitle>
          <div style={{ background: C.surface, borderRadius: 10, padding: '4px 20px' }}>
            {serviceHealth.map((s) => (<ServiceDot key={s.label} ok={s.ok} label={s.label} latency={s.latency} />))}
            {serviceHealth.length === 0 && <div style={{ color: C.muted, fontSize: '0.85rem', padding: '14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, border: `2px solid ${C.surface}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'adm-spin 0.8s linear infinite' }} />
              Comprobando servicios…
            </div>}
          </div>
        </div>
        {/* Traffic */}
        <div>
          <SectionTitle>Tráfico por Vertical</SectionTitle>
          <div style={{ background: C.surface, borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TRAFFIC_ITEMS.map(ti => (
              <div key={ti.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
                  <span style={{ color: C.muted }}>{ti.label}</span>
                  <span style={{ fontWeight: 700, color: ti.color }}>{ti.val}</span>
                </div>
                <div style={{ background: C.bg, borderRadius: 4, height: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (ti.val || 0) * 5)}%`, height: '100%', background: ti.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats?.estadosVuelos && Object.keys(stats.estadosVuelos).length > 0 && (
        <>
          <SectionTitle>Distribución de Estados — Vuelos</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(stats.estadosVuelos).map(([estado, count]) => (
              <div key={estado} style={{ background: C.surface, borderRadius: 8, padding: '12px 20px', textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: estadoColor(estado), letterSpacing: '-0.02em' }}>{count}</div>
                <Badge status={estado} />
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Embudo de Conversión</SectionTitle>
      <div style={{ background: C.surface, borderRadius: 10, padding: '20px 24px' }}>
        {funnel.map((f, i) => (
          <div key={f.label} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
              <span style={{ color: C.text }}>{f.label}</span>
              <span style={{ fontWeight: 600, color: f.pct < 20 && f.count > 0 ? C.orange : C.muted, fontFamily: 'monospace' }}>{f.count.toLocaleString()} <span style={{ color: C.muted }}>({f.pct}%)</span></span>
            </div>
            <div style={{ background: C.bg, borderRadius: 3, height: 6, overflow: 'hidden' }}>
              <div style={{ width: `${f.pct}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${C.blue}, ${C.darkBlue})`, opacity: 0.5 + (i * 0.09), transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Últimas Reservas</SectionTitle>
      <div style={{ background: C.surface, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Tipo', 'PNR', 'Estado', 'Total', 'Fecha'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(stats?.ultimasReservas || []).map((r, i) => (
              <tr className="adm-row" key={r.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '11px 16px', color: C.text }}>
                  {r.tipo === 'vuelo' ? '✈ ' : r.tipo === 'auto' ? '◉ ' : r.tipo === 'hospedaje' ? '⬟ ' : '◈ '}
                  <span style={{ textTransform: 'capitalize', color: C.muted, fontSize: '0.8rem' }}>{r.tipo}</span>
                </td>
                <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontWeight: 600, color: C.blue }}>{r.pnr || '—'}</td>
                <td style={{ padding: '11px 16px' }}><Badge status={r.estado} /></td>
                <td style={{ padding: '11px 16px', fontWeight: 700, color: C.green }}>${fmt(r.total)}</td>
                <td style={{ padding: '11px 16px', color: C.muted, fontSize: '0.8rem' }}>{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {(!stats?.ultimasReservas || stats.ultimasReservas.length === 0) && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: C.muted }}>Sin reservas aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MicroserviciosTab() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 3000); return () => clearInterval(t); }, []);
  const rand = (base, spread) => parseFloat((base + (Math.random() - 0.5) * spread).toFixed(1));
  const randInt = (base, spread) => Math.round(base + (Math.random() - 0.5) * spread);
  const services = [
    { name: 'API Gateway', p50: rand(12, 4), p95: rand(45, 10), p99: rand(120, 30), rps: randInt(420, 60), errors: rand(0.2, 0.1), cpu: rand(28, 8), mem: rand(42, 6) },
    { name: 'Svc Vuelos', p50: rand(95, 20), p95: rand(380, 60), p99: rand(820, 100), rps: randInt(85, 20), errors: rand(0.8, 0.3), cpu: rand(55, 12), mem: rand(68, 8) },
    { name: 'Svc Autos', p50: rand(45, 12), p95: rand(180, 40), p99: rand(420, 80), rps: randInt(32, 10), errors: rand(0.4, 0.2), cpu: rand(35, 10), mem: rand(50, 8) },
    { name: 'Svc Atracciones', p50: rand(38, 10), p95: rand(140, 30), p99: rand(310, 60), rps: randInt(18, 8), errors: rand(0.3, 0.15), cpu: rand(22, 6), mem: rand(38, 5) },
    { name: 'Svc Pagos', p50: rand(320, 40), p95: rand(920, 100), p99: rand(1800, 200), rps: randInt(12, 5), errors: rand(1.2, 0.4), cpu: rand(45, 12), mem: rand(55, 8) },
  ];
  const topology = [
    { from: 'Browser', to: 'API Gateway', ms: rand(18, 5) },
    { from: 'API Gateway', to: 'Svc Vuelos', ms: rand(8, 3) },
    { from: 'API Gateway', to: 'Svc Autos', ms: rand(6, 2) },
    { from: 'API Gateway', to: 'Svc Atracciones', ms: rand(5, 2) },
    { from: 'Svc Vuelos', to: 'Amadeus API', ms: rand(210, 30) },
    { from: 'Svc Pagos', to: 'Stripe', ms: rand(310, 40) },
  ];
  const SLOs = [
    { name: 'Búsqueda < 800ms', target: 99.9, current: 99.7, budget: 29 },
    { name: 'Reserva exitosa', target: 99.5, current: 98.8, budget: 68 },
    { name: 'Pago confirmado', target: 99.9, current: 99.6, budget: 45 },
    { name: 'Disponibilidad API', target: 99.9, current: 99.95, budget: 100 },
  ];
  return (
    <div>
      <div style={{ background: '#1c1a00', border: '1px solid #fbbf2440', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: '0.9rem', marginTop: 1 }}>⚠</span>
        <span style={{ fontSize: '0.82rem', color: '#fbbf24', lineHeight: 1.5 }}><strong>Datos simulados — RDA2.</strong> Esta vista ilustra el monitoreo de microservicios que se implementará con Kubernetes, Prometheus y Grafana. Las métricas fluctúan cada 3 s para demostración.</span>
      </div>

      <SectionTitle>Topología de Red</SectionTitle>
      <div style={{ background: C.surface, borderRadius: 10, padding: '4px 20px' }}>
        {topology.map(t => (
          <div key={`${t.from}-${t.to}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: '0.82rem' }}>
            <span style={{ background: '#1e3a5f', padding: '3px 12px', borderRadius: 4, fontWeight: 600, color: C.blue, fontFamily: 'monospace' }}>{t.from}</span>
            <div style={{ flex: 1, borderBottom: `1px dashed ${C.border}` }} />
            <span style={{ background: C.green + '18', padding: '2px 10px', borderRadius: 4, fontWeight: 700, color: C.green, fontSize: '0.75rem', fontFamily: 'monospace' }}>{t.ms}ms</span>
            <span style={{ color: C.muted, fontSize: '0.75rem' }}>→</span>
            <span style={{ background: '#1e3a5f', padding: '3px 12px', borderRadius: 4, fontWeight: 600, color: C.blue, fontFamily: 'monospace' }}>{t.to}</span>
          </div>
        ))}
      </div>

      <SectionTitle>Golden Signals por Servicio</SectionTitle>
      <div style={{ overflowX: 'auto', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: C.surface }}>
          <thead>
            <tr style={{ background: '#0d1f3c' }}>
              {['Servicio', 'p50', 'p95', 'p99', 'req/s', 'Error %', 'CPU %', 'RAM %'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600, color: C.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr className="adm-row" key={s.name} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{s.name}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: C.green, fontFamily: 'monospace' }}>{s.p50}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: s.p95 > 300 ? C.orange : C.muted, fontFamily: 'monospace' }}>{s.p95}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: s.p99 > 800 ? C.red : C.muted, fontWeight: s.p99 > 800 ? 700 : 400, fontFamily: 'monospace' }}>{s.p99}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: C.text, fontFamily: 'monospace' }}>{s.rps}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: s.errors > 1 ? C.red : C.green, fontWeight: 700 }}>{s.errors}%</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: s.cpu > 70 ? C.red : C.muted }}>{s.cpu}%</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: s.mem > 80 ? C.red : C.muted }}>{s.mem}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>SLOs y Error Budget</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 12 }}>
        {SLOs.map(s => {
          const ok = s.current >= s.target;
          return (
            <div className="adm-card" key={s.name} style={{ background: C.surface, borderRadius: 10, padding: '16px 20px', borderLeft: `3px solid ${ok ? C.green : C.red}` }}>
              <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: ok ? C.green : C.red, letterSpacing: '-0.02em' }}>{s.current}%</div>
              <div style={{ fontSize: '0.72rem', color: C.muted, marginBottom: 10 }}>Meta: {s.target}%</div>
              <div style={{ fontSize: '0.72rem', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>Error Budget</span>
                <span style={{ fontWeight: 700, color: s.budget > 50 ? C.green : C.orange }}>{s.budget}%</span>
              </div>
              <div style={{ background: C.bg, borderRadius: 3, height: 4 }}>
                <div style={{ width: `${s.budget}%`, height: '100%', borderRadius: 3, background: s.budget > 50 ? C.green : C.orange }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL DE PROVEEDORES — simula la red de sitios integrados para RDA2
// ─────────────────────────────────────────────────────────────────────────────
const PROVEEDORES_INICIALES = [
  {
    id: 'prov-1',
    nombre: 'TravelEcuador Pro',
    equipo: 'Grupo 1 – Atracciones',
    url: 'https://travel-ecuador-pro.vercel.app',
    apiBase: 'https://travel-ecuador-pro.vercel.app/api/v1',
    tipo: 'Atracciones',
    emoji: '🎡',
    activo: true,
    fechaRegistro: '2026-09-15',
    descripcion: 'Catálogo de atracciones turísticas del Ecuador, con reservas en tiempo real.',
    contacto: 'grupo1@universidad.edu.ec',
  },
  {
    id: 'prov-2',
    nombre: 'AeroLink Ecuador',
    equipo: 'Grupo 2 – Vuelos',
    url: 'https://aerolink-ec.netlify.app',
    apiBase: 'https://aerolink-ec.netlify.app/api/v1',
    tipo: 'Vuelos',
    emoji: '✈️',
    activo: true,
    fechaRegistro: '2026-09-18',
    descripcion: 'Motor de búsqueda y reserva de vuelos domésticos e internacionales.',
    contacto: 'grupo2@universidad.edu.ec',
  },
  {
    id: 'prov-3',
    nombre: 'HotelHub EC',
    equipo: 'Grupo 3 – Alojamientos',
    url: 'https://hotelhub-ec.vercel.app',
    apiBase: 'https://hotelhub-ec.vercel.app/api/v1',
    tipo: 'Alojamientos',
    emoji: '🏨',
    activo: true,
    fechaRegistro: '2026-09-20',
    descripcion: 'Plataforma de hospedaje con hoteles, hostales y cabañas.',
    contacto: 'grupo3@universidad.edu.ec',
  },
  {
    id: 'prov-4',
    nombre: 'RentAuto Ecuador',
    equipo: 'Grupo 4 – Autos',
    url: 'https://rentauto-ec.netlify.app',
    apiBase: 'https://rentauto-ec.netlify.app/api/v1',
    tipo: 'Autos',
    emoji: '🚗',
    activo: false,
    fechaRegistro: '2026-09-22',
    descripcion: 'Renta de vehículos con cobertura nacional. Mantenimiento programado.',
    contacto: 'grupo4@universidad.edu.ec',
  },
  {
    id: 'prov-5',
    nombre: 'GalapagosXplorer',
    equipo: 'Grupo 5 – Tours',
    url: 'https://galapagos-xplorer.vercel.app',
    apiBase: 'https://galapagos-xplorer.vercel.app/api/v1',
    tipo: 'Tours',
    emoji: '🐢',
    activo: true,
    fechaRegistro: '2026-09-25',
    descripcion: 'Tours especializados a Galápagos con guías certificados.',
    contacto: 'grupo5@universidad.edu.ec',
  },
];

const TIPO_COLORES = {
  Atracciones: { bg: '#e8f5e9', color: '#2e7d32' },
  Vuelos: { bg: '#e3f2fd', color: '#1565c0' },
  Alojamientos: { bg: '#f3e5f5', color: '#6a1b9a' },
  Autos: { bg: '#fff3e0', color: '#e65100' },
  Tours: { bg: '#e0f7fa', color: '#00695c' },
  Otro: { bg: '#f5f5f5', color: '#333' },
};

const TIPO_COLORES = {
  Atracciones: { bg: C.green + '18', color: C.green },
  Vuelos: { bg: C.blue + '18', color: C.blue },
  Alojamientos: { bg: C.purple + '18', color: C.purple },
  Autos: { bg: C.orange + '18', color: C.orange },
  Tours: { bg: C.cyan + '18', color: C.cyan },
  Otro: { bg: C.muted + '18', color: C.muted },
};

function TipoBadge({ tipo }) {
  const col = TIPO_COLORES[tipo] || TIPO_COLORES.Otro;
  return (
    <span style={{ background: col.bg, color: col.color, border: `1px solid ${col.color}30`, padding: '2px 10px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em' }}>
      {tipo}
    </span>
  );
}

function EstadoBadge({ online, checking }) {
  if (checking) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: '0.8rem' }}>
      <div style={{ width: 8, height: 8, border: `2px solid ${C.muted}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'adm-spin 0.8s linear infinite' }} />
      Verificando…
    </span>
  );
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: online ? C.green : C.red }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? C.green : C.red, display: 'inline-block' }} />
        {online && <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: C.green + '25', animation: 'adm-pulse 2s infinite' }} />}
      </span>
      {online ? 'En línea' : 'Sin conexión'}
    </span>
  );
}

function ProveedoresTab() {
  const STORAGE_KEY = 'booking_proveedores';

  const [proveedores, setProveedores] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && saved.length > 0 ? saved : PROVEEDORES_INICIALES;
    } catch { return PROVEEDORES_INICIALES; }
  });

  // Estado de salud: { [id]: { online, latency, checking } }
  const [health, setHealth] = useState({});
  const [modal, setModal] = useState(null); // null | 'nuevo' | { ...proveedor }
  const [detalle, setDetalle] = useState(null);
  const [form, setForm] = useState({ nombre: '', equipo: '', url: '', apiBase: '', tipo: 'Otro', descripcion: '', contacto: '', tokenAuth: '', webhookUrl: '', healthcheckUrl: '', rateLimit: '', entorno: 'Producción' });
  const [formErr, setFormErr] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  const persistir = (lista) => {
    setProveedores(lista);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  };

  // Simula un health-check contra la URL del proveedor
  const checkHealth = (prov) => {
    setHealth(h => ({ ...h, [prov.id]: { ...h[prov.id], checking: true } }));
    // Simulación: proveedores con activo=true tienen 85% de probabilidad de estar online
    const delay = 600 + Math.random() * 1200;
    setTimeout(() => {
      const baseOnline = prov.activo;
      const online = baseOnline ? Math.random() > 0.12 : Math.random() > 0.85;
      const latency = online ? Math.round(80 + Math.random() * 420) : null;
      setHealth(h => ({ ...h, [prov.id]: { online, latency, checking: false, lastCheck: new Date() } }));
    }, delay);
  };

  // Revisar todos al montar y cada 8 segundos
  useEffect(() => {
    proveedores.forEach(p => checkHealth(p));
    const interval = setInterval(() => {
      proveedores.forEach(p => checkHealth(p));
    }, 8000);
    return () => clearInterval(interval);
  }, [proveedores.length]); // solo re-ejecutar si cambia cantidad

  const onlineCount = Object.values(health).filter(h => h.online && !h.checking).length;
  const offlineCount = Object.values(health).filter(h => !h.online && !h.checking).length;

  const tiposFiltro = ['Todos', ...Array.from(new Set(proveedores.map(p => p.tipo)))];

  const proveedoresFiltrados = proveedores.filter(p => {
    const okTipo = filtroTipo === 'Todos' || p.tipo === filtroTipo;
    const h = health[p.id];
    const okEstado = filtroEstado === 'Todos'
      || (filtroEstado === 'Online' && h?.online)
      || (filtroEstado === 'Offline' && h && !h.online && !h.checking);
    return okTipo && okEstado;
  });

  const abrirNuevo = () => {
    setForm({ nombre: '', equipo: '', url: '', apiBase: '', tipo: 'Otro', descripcion: '', contacto: '', emoji: '🔗', tokenAuth: '', webhookUrl: '', healthcheckUrl: '', rateLimit: '', entorno: 'Producción' });
    setFormErr({});
    setModal('nuevo');
  };

  const abrirEditar = (prov) => {
    setForm({ ...prov });
    setFormErr({});
    setModal('editar');
  };

  const validar = () => {
    const err = {};
    if (!form.nombre.trim()) err.nombre = 'Requerido';
    if (!form.url.trim()) err.url = 'Requerido';
    if (!form.apiBase.trim()) err.apiBase = 'Requerido';
    return err;
  };

  const guardar = async () => {
    const err = validar();
    if (Object.keys(err).length > 0) { setFormErr(err); return; }
    setGuardando(true);
    await new Promise(r => setTimeout(r, 600));
    if (modal === 'nuevo') {
      const nuevo = { ...form, id: `prov-${Date.now()}`, activo: true, fechaRegistro: new Date().toISOString().split('T')[0] };
      const lista = [...proveedores, nuevo];
      persistir(lista);
      // Iniciar health check del nuevo proveedor
      setTimeout(() => checkHealth(nuevo), 300);
    } else {
      const lista = proveedores.map(p => p.id === form.id ? { ...form } : p);
      persistir(lista);
    }
    setGuardando(false);
    setModal(null);
  };

  const eliminar = (id) => {
    const lista = proveedores.filter(p => p.id !== id);
    persistir(lista);
    setHealth(h => { const n = { ...h }; delete n[id]; return n; });
    setConfirmDel(null);
    if (detalle?.id === id) setDetalle(null);
  };

  const toggleActivo = (prov) => {
    const lista = proveedores.map(p => p.id === prov.id ? { ...p, activo: !p.activo } : p);
    persistir(lista);
  };

  const inputStyle = (field) => ({
    width: '100%', padding: '9px 12px', border: `1px solid ${formErr[field] ? C.red : C.border}`,
    borderRadius: 6, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
  });

  const TIPOS_SELECT = ['Atracciones', 'Vuelos', 'Alojamientos', 'Autos', 'Tours', 'Otro'];

  const filterBtn = (active, label, onClick, activeColor) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 6,
      border: `1px solid ${active ? activeColor : C.border}`,
      background: active ? activeColor + '18' : 'transparent',
      color: active ? activeColor : C.muted,
      cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
      transition: 'all 0.2s'
    }}>{label}</button>
  );

  const ActionBtn = ({ onClick, title, children, color }) => (
    <button className="adm-action-btn" onClick={onClick} title={title} style={{
      background: color + '18', border: `1px solid ${color}30`, color: color,
      borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: '0.78rem',
      fontWeight: 600, lineHeight: 1
    }}>{children}</button>
  );

  return (
    <div>
      <div style={{ background: '#0d1f3c', border: `1px solid ${C.blue}30`, borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ color: C.blue, marginTop: 1, fontSize: '0.9rem' }}>ⓘ</span>
        <span style={{ fontSize: '0.82rem', color: C.blue, lineHeight: 1.5 }}>
          <strong>Panel de Proveedores — Preparación RDA2.</strong> Gestión de sistemas externos de otros grupos que se integrarán al Booking Ecuador. Los estados se simulan ya que la integración real aún no está desplegada.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon="◉" label="Total Proveedores" value={proveedores.length} color={C.blue} />
        <KpiCard icon="●" label="En Línea" value={onlineCount} color={C.green} />
        <KpiCard icon="○" label="Sin Conexión" value={offlineCount} color={C.red} />
        <KpiCard icon="◈" label="Tipos" value={tiposFiltro.length - 1} color={C.cyan} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tiposFiltro.map(t => filterBtn(filtroTipo === t, t, () => setFiltroTipo(t), C.blue))}
          <div style={{ width: 1, height: 22, background: C.border, margin: '0 4px' }} />
          {filterBtn(filtroEstado === 'Online', 'Solo online', () => setFiltroEstado(filtroEstado === 'Online' ? 'Todos' : 'Online'), C.green)}
          {filterBtn(filtroEstado === 'Offline', 'Solo offline', () => setFiltroEstado(filtroEstado === 'Offline' ? 'Todos' : 'Offline'), C.red)}
        </div>
        <button onClick={abrirNuevo} style={{
          background: C.blue, color: '#0f172a', border: 'none', borderRadius: 7,
          padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
          display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.02em'
        }}>+ Registrar Proveedor</button>
      </div>

      <div style={{ background: C.surface, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Sistema / Equipo', 'Tipo', 'Conexión', 'Latencia', 'Revisado', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proveedoresFiltrados.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: C.muted }}>Sin proveedores que coincidan con el filtro</td></tr>
            )}
            {proveedoresFiltrados.map((prov) => {
              const h = health[prov.id] || {};
              return (
                <tr className="adm-row" key={prov.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{prov.emoji || '◉'}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: C.text, fontSize: '0.88rem' }}>{prov.nombre}</div>
                        <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 1 }}>{prov.equipo}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}><TipoBadge tipo={prov.tipo} /></td>
                  <td style={{ padding: '13px 16px' }}><EstadoBadge online={h.online} checking={h.checking} /></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: h.online ? (h.latency > 300 ? C.orange : C.green) : C.muted, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {h.checking ? '—' : h.latency ? `${h.latency} ms` : '—'}
                  </td>
                  <td style={{ padding: '13px 16px', color: C.muted, fontSize: '0.75rem' }}>
                    {h.lastCheck ? h.lastCheck.toLocaleTimeString('es-EC') : '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <button onClick={() => toggleActivo(prov)} style={{
                      background: prov.activo ? C.green + '18' : C.red + '18',
                      color: prov.activo ? C.green : C.red,
                      border: `1px solid ${prov.activo ? C.green : C.red}30`,
                      borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.75rem'
                    }}>{prov.activo ? 'Activo' : 'Pausado'}</button>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn onClick={() => setDetalle(prov)} title="Ver detalle" color={C.blue}>Ver</ActionBtn>
                      <ActionBtn onClick={() => checkHealth(prov)} title="Recheck" color={C.cyan}>Ping</ActionBtn>
                      <ActionBtn onClick={() => abrirEditar(prov)} title="Editar" color={C.green}>Editar</ActionBtn>
                      <ActionBtn onClick={() => setConfirmDel(prov)} title="Eliminar" color={C.red}>Baja</ActionBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Panel de detalle lateral */}
      {detalle && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: 400, height: '100vh', background: C.surface, boxShadow: '-2px 0 40px rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflowY: 'auto', borderLeft: `1px solid ${C.border}` }}>
          <div style={{ background: C.bg, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Detalle del Proveedor</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: C.text }}>{detalle.nombre}</div>
            </div>
            <button onClick={() => setDetalle(null)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>✕</button>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: C.bg, borderRadius: 10, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>{detalle.emoji || '◉'}</div>
              <div>
                <div style={{ fontWeight: 700, color: C.text }}>{detalle.nombre}</div>
                <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: 6 }}>{detalle.equipo}</div>
                <TipoBadge tipo={detalle.tipo} />
              </div>
            </div>

            {[['URL del Sistema', detalle.url], ['API Base', detalle.apiBase], ['Token / Auth', detalle.tokenAuth ? '••••••••' : 'No definido'], ['Webhook', detalle.webhookUrl], ['Healthcheck', detalle.healthcheckUrl], ['Rate Limit', detalle.rateLimit ? detalle.rateLimit + ' req/s' : '—'], ['Entorno', detalle.entorno || 'Producción'], ['Contacto', detalle.contacto], ['Registro', detalle.fechaRegistro]].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '0.7rem', color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '0.83rem', color: C.text, wordBreak: 'break-all', fontFamily: label === 'Token / Auth' || label === 'API Base' || label === 'URL del Sistema' || label === 'Webhook' || label === 'Healthcheck' ? 'monospace' : 'inherit' }}>{val || '—'}</div>
              </div>
            ))}
            {detalle.descripcion && (
              <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '0.7rem', color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Descripción</div>
                <div style={{ fontSize: '0.83rem', color: C.text, lineHeight: 1.5 }}>{detalle.descripcion}</div>
              </div>
            )}

            <div style={{ background: C.bg, borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600 }}>Estado en tiempo real</div>
              {(() => {
                const h = health[detalle.id] || {};
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <EstadoBadge online={h.online} checking={h.checking} />
                    <span style={{ color: h.online ? (h.latency > 300 ? C.orange : C.green) : C.muted, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {h.checking ? '—' : h.latency ? `${h.latency} ms` : '—'}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 600 }}>Endpoints RDA2</div>
            {['GET /api/v1/catalogo/exportar', `GET /api/v1/${detalle.tipo.toLowerCase()}/disponibilidad`, 'POST /api/v1/webhooks/reserva-creada', 'GET /health'].map(ep => (
              <div key={ep} style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: C.blue, background: C.blue + '10', border: `1px solid ${C.blue}20`, padding: '5px 12px', borderRadius: 5, marginBottom: 5 }}>{ep}</div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Nuevo / Editar */}
      {(modal === 'nuevo' || modal === 'editar') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', border: `1px solid ${C.border}` }}>
            <div style={{ background: C.bg, padding: '18px 24px', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Proveedores</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: C.text }}>{modal === 'nuevo' ? 'Registrar Nuevo Proveedor' : 'Editar Proveedor'}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ background: '#1c1a00', border: `1px solid ${C.orange}30`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '0.8rem', color: C.orange, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 1 }}>⚠</span>
                <span>Datos guardados localmente para simular la integración RDA2. En producción se enviará al API Gateway central.</span>
              </div>
              {[['nombre', 'Nombre del sistema *', 'Ej: TravelEcuador Pro'], ['equipo', 'Nombre del equipo', 'Ej: Grupo 6 – Cruceros'], ['url', 'URL del sitio web *', 'https://mi-sistema.vercel.app'], ['apiBase', 'URL base de la API *', 'https://mi-sistema.vercel.app/api/v1'], ['contacto', 'Email de contacto', 'grupo@universidad.edu.ec']].map(([field, label, placeholder]) => (
                <div key={field} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                  <input value={form[field] || ''} onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); setFormErr(er => { const n = { ...er }; delete n[field]; return n; }); }} placeholder={placeholder} style={inputStyle(field)} />
                  {formErr[field] && <div style={{ color: C.red, fontSize: '0.75rem', marginTop: 3 }}>{formErr[field]}</div>}
                </div>
              ))}
              <div style={{ background: C.bg, borderRadius: 8, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Datos Técnicos de Integración (API)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['tokenAuth', 'API Key / Token', 'sk_live_...'], ['webhookUrl', 'Webhook URL', 'https://.../webhook'], ['healthcheckUrl', 'Healthcheck URL', 'https://.../health'], ['rateLimit', 'Rate Limit (req/s)', '50']].map(([field, label, placeholder]) => (
                    <div key={field}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                      <input value={form[field] || ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} style={inputStyle(field)} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entorno</label>
                    <select value={form.entorno || 'Producción'} onChange={e => setForm(f => ({ ...f, entorno: e.target.value }))} style={{ ...inputStyle('entorno') }}>
                      <option value="Producción">Producción</option>
                      <option value="Staging">Staging / Pruebas</option>
                      <option value="Desarrollo">Desarrollo</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de servicio</label>
                  <select value={form.tipo || 'Otro'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...inputStyle('tipo') }}>
                    {TIPOS_SELECT.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ícono / Emoji</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {['◉', '🌐', '✈️', '🏨', '🚗', '🎡', '🐢', '⛵', '🎭', '🏔️', '🌴'].map(em => (
                      <button key={em} type="button" onClick={() => setForm(f => ({ ...f, emoji: em }))} style={{ fontSize: '1.2rem', background: form.emoji === em ? C.blue + '30' : 'transparent', border: `1.5px solid ${form.emoji === em ? C.blue : C.border}`, borderRadius: 6, padding: '3px 7px', cursor: 'pointer' }}>{em}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: 5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descripción</label>
                <textarea value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Breve descripción del sistema y los servicios que provee…" rows={3} style={{ ...inputStyle('descripcion'), resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button onClick={() => setModal(null)} style={{ padding: '9px 22px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', color: C.muted, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Cancelar</button>
                <button onClick={guardar} disabled={guardando} style={{ padding: '9px 22px', background: guardando ? C.muted : C.blue, color: '#0f172a', border: 'none', borderRadius: 7, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  {guardando ? 'Guardando…' : modal === 'nuevo' ? 'Registrar Proveedor' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 12, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', border: `1px solid ${C.red}30` }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: C.red + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.4rem', color: C.red }}>!</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center', marginBottom: 8, color: C.text }}>¿Dar de baja este proveedor?</div>
            <div style={{ color: C.muted, fontSize: '0.85rem', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>Se eliminará <strong style={{ color: C.text }}>{confirmDel.nombre}</strong> del registro de proveedores. Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '9px 24px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'transparent', color: C.muted, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel.id)} style={{ padding: '9px 24px', background: C.red, color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GestionTab({ users, reservas, loadingUsers, loadingReservas, onRefresh }) {
  const [vista, setVista] = useState('usuarios');
  const [modal, setModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const btnStyle = { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', color: C.muted };

  const requestConfirm = (title, text, color, actionFn) => {
    setConfirmModal({ title, text, color, actionFn });
  };

  const executeConfirm = async () => {
    if (confirmModal && confirmModal.actionFn) {
      await confirmModal.actionFn();
    }
    setConfirmModal(null);
  };

  const execUserAction = async (id, action) => {
    try {
      await api.put(`/admin/users/${id}/action`, { action });
      if (action === 'reset_password') {
        alert('Enlace de reseteo enviado correctamente.');
      } else {
        alert('Acción ejecutada correctamente.');
      }
      onRefresh();
    }
    catch (e) { alert('Error al ejecutar la acción'); }
  };

  const handleReservaAction = async (tipo, id, action) => {
    if (tipo === 'hospedaje') {
      if (action === 'cancelar') {
        let locales = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
        locales = locales.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r);
        localStorage.setItem('reservas_alojamientos', JSON.stringify(locales));
      }
      if (action === 'reenviar') alert(`Comprobante de hospedaje ${id} reenviado virtualmente`);
      alert(`Acción de ${action} ejecutada exitosamente.`);
      onRefresh();
      return;
    }

    // Check if it's a local auto or atraccion
    if (tipo === 'auto' || tipo === 'autos') {
      let locales = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      let index = locales.findIndex(r => (r.id === id || r.orderId === id));
      if (index !== -1) {
        if (action === 'cancelar') {
          locales[index].status = 'CANCELLED';
          localStorage.setItem('reservas_autos', JSON.stringify(locales));
        }
        if (action === 'reenviar') alert(`Comprobante de auto ${id} reenviado virtualmente`);
        alert(`Acción de ${action} ejecutada exitosamente.`);
        onRefresh();
        return;
      }
    }

    if (tipo === 'atraccion' || tipo === 'atracciones') {
      let locales = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      let index = locales.findIndex(r => (r.id === id || r.reservation_id === id));
      if (index !== -1) {
        if (action === 'cancelar') {
          locales[index].status = 'CANCELLED';
          localStorage.setItem('reservas_atracciones', JSON.stringify(locales));
        }
        if (action === 'reenviar') alert(`Comprobante de atracción ${id} reenviado virtualmente`);
        alert(`Acción de ${action} ejecutada exitosamente.`);
        onRefresh();
        return;
      }
    }

    try {
      if (action === 'cancelar') await api.put(`/admin/reservas/${tipo}/${id}/cancelar`);
      if (action === 'reenviar') await api.put(`/admin/reservas/${tipo}/${id}/reenviar`); // Revertido a PUT
      alert(`Acción de ${action} ejecutada exitosamente.`);
      onRefresh();
    } catch (e) { alert('Error al ejecutar la acción en el backend'); }
  };

  const viewHistorial = async (id, email) => {
    try {
      const { data } = await api.get(`/admin/users/${id}/historial`);
      setModal({ type: 'detalles', data: data.data, title: `Historial de Reservas - ${email}` });
    } catch (e) { alert('Error al obtener historial'); }
  };

  const viewDetalles = async (tipo, id) => {
    if (tipo === 'hospedaje') {
      const localesAloj = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const reservaLocal = localesAloj.find(r => r.id === id);
      setModal({ type: 'detalles', data: reservaLocal || { mensaje: 'No encontrada localmente' }, title: `Detalles Técnicos - ${tipo} ${id}` });
      return;
    }

    // Check if it's a local auto or atraccion
    if (tipo === 'auto' || tipo === 'autos') {
      const localesAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      const reservaLocal = localesAutos.find(r => (r.id === id || r.orderId === id));
      if (reservaLocal) {
        setModal({ type: 'detalles', data: reservaLocal, title: `Detalles Técnicos (Local) - ${tipo} ${id}` });
        return;
      }
    }

    if (tipo === 'atraccion' || tipo === 'atracciones') {
      const localesAtracciones = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      const reservaLocal = localesAtracciones.find(r => (r.id === id || r.reservation_id === id));
      if (reservaLocal) {
        setModal({ type: 'detalles', data: reservaLocal, title: `Detalles Técnicos (Local) - ${tipo} ${id}` });
        return;
      }
    }

    try {
      const { data } = await api.get(`/admin/reservas/${tipo}/${id}/detalles`);
      setModal({ type: 'detalles', data: data.data || { mensaje: 'Sin detalles en el backend' }, title: `Detalles Técnicos - ${tipo} ${id}` });
    } catch (e) {
      alert('Error al obtener detalles del backend');
    }
  };
  const VISTAS = [
    { id: 'usuarios', label: 'Usuarios', count: users.length },
    { id: 'vuelos', label: 'Vuelos', count: reservas.vuelos?.length || 0 },
    { id: 'hospedaje', label: 'Hospedaje', count: reservas.hospedaje?.length || 0 },
    { id: 'autos', label: 'Autos', count: reservas.autos?.length || 0 },
    { id: 'atracciones', label: 'Atracciones', count: reservas.atracciones?.length || 0 },
  ];
  const isLoading = vista === 'usuarios' ? loadingUsers : loadingReservas;
  const thStyle = { padding: '11px 16px', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' };
  const tdStyle = { padding: '11px 16px', color: C.text, fontSize: '0.83rem' };

  const renderTable = () => {
    if (isLoading) return (
      <div style={{ padding: 48, textAlign: 'center', color: C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${C.surface}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'adm-spin 0.8s linear infinite' }} />
        Cargando datos…
      </div>
    );
    if (vista === 'usuarios') {
      const admins = users.filter(u => u.rol === 'admin').length;
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Usuarios</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.blue, letterSpacing: '-0.02em' }}>{users.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Administradores</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.orange, letterSpacing: '-0.02em' }}>{admins}</div>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Email', 'Rol', 'Registrado', 'Acciones'].map(h => (<th key={h} style={thStyle}>{h}</th>))}
            </tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr className="adm-row" key={u.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>
                    <span style={{ background: u.rol === 'admin' ? C.blue + '25' : C.muted + '15', color: u.rol === 'admin' ? C.blue : C.muted, border: `1px solid ${u.rol === 'admin' ? C.blue : C.muted}30`, padding: '2px 10px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 600 }}>{u.rol || 'usuario'}</span>
                  </td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: '0.8rem' }}>{fmtDate(u.created_at)}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                    {u.rol !== 'admin' && (
                      <>
                        <button onClick={() => requestConfirm(u.status === 'bloquear' ? 'Desbloquear Usuario' : 'Bloquear Usuario', `¿Seguro que quieres ${u.status === 'bloquear' ? 'desbloquear' : 'bloquear'} a ${u.email}?`, u.status === 'bloquear' ? C.green : C.red, () => execUserAction(u.id, u.status === 'bloquear' ? 'desbloquear' : 'bloquear'))} title={u.status === 'bloquear' ? 'Desbloquear' : 'Bloquear'} style={btnStyle}>{u.status === 'bloquear' ? 'Activar' : 'Bloquear'}</button>
                        <button onClick={() => requestConfirm('Promover a Admin', `¿Hacer administrador a ${u.email}?`, C.blue, () => execUserAction(u.id, 'promover_admin'))} title="Promover" style={btnStyle}>Promover</button>
                        <button onClick={() => viewHistorial(u.id, u.email)} title="Historial" style={btnStyle}>Historial</button>
                      </>
                    )}
                    <button onClick={() => requestConfirm('Resetear Contraseña', `¿Enviar enlace de reseteo a ${u.email}?`, C.orange, () => execUserAction(u.id, 'reset_password'))} title="Reseteo" style={btnStyle}>Resetear</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (<tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: C.muted }}>Sin usuarios. Ejecuta el Trigger SQL en Supabase para sincronizar.</td></tr>)}
            </tbody>
          </table>
        </div>
      );
    }
    const rows = reservas[vista] || [];
    const isVuelos = vista === 'vuelos';
    const totalIngresos = rows.reduce((s, r) => s + Number(r.total), 0);
    return (
      <div>
        {isVuelos && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reservas de Vuelos</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.blue, letterSpacing: '-0.02em' }}>{rows.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingresos (Vuelos)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}>${fmt(totalIngresos)}</div>
            </div>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['PNR', 'Estado', 'Total', vista === 'atracciones' ? 'Cliente' : 'Moneda', 'Fecha', 'Acciones'].map(h => (<th key={h} style={thStyle}>{h}</th>))}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr className="adm-row" key={r.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: C.blue }}>{r.pnr}</td>
                <td style={tdStyle}><Badge status={r.estado} /></td>
                <td style={{ ...tdStyle, fontWeight: 700, color: C.green }}>${fmt(r.total)}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{vista === 'atracciones' ? (r.cliente || '—') : (r.moneda || 'USD')}</td>
                <td style={{ ...tdStyle, color: C.muted, fontSize: '0.78rem' }}>{fmtDate(r.createdAt)}</td>
                <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                  {r.estado !== 'CANCELLED' && (
                    <button onClick={() => requestConfirm('Cancelar Reserva', `¿Cancelar reserva ${r.pnr}? Esta acción no se puede deshacer.`, C.red, () => handleReservaAction(vista, r.id, 'cancelar'))} title="Cancelar" style={{ ...btnStyle, color: C.red, borderColor: C.red + '40' }}>Cancelar</button>
                  )}
                  <button onClick={() => requestConfirm('Reenviar Confirmación', '¿Reenviar comprobante al cliente?', C.blue, () => handleReservaAction(vista, r.id, 'reenviar'))} title="Reenviar" style={btnStyle}>Reenviar</button>
                  <button onClick={() => viewDetalles(vista, r.id)} title="Detalles" style={btnStyle}>Detalles</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: C.muted }}>Sin registros</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVista(v.id)} style={{
            padding: '7px 16px', borderRadius: 6,
            border: `1px solid ${vista === v.id ? C.blue : C.border}`,
            background: vista === v.id ? C.blue + '18' : 'transparent',
            color: vista === v.id ? C.blue : C.muted,
            fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
          }}>
            {v.label}
            <span style={{ background: vista === v.id ? C.blue : C.border, borderRadius: 10, padding: '0 7px', fontSize: '0.7rem', color: vista === v.id ? '#0f172a' : C.muted }}>{v.count}</span>
          </button>
        ))}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>{renderTable()}</div>

      {/* Modal de detalles */}
      {modal && modal.type === 'detalles' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', border: `1px solid ${C.border}` }}>
            <div style={{ background: C.bg, padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, borderRadius: '12px 12px 0 0' }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '0.9rem' }}>{modal.title}</div>
              <button type="button" onClick={() => setModal(null)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', width: 28, height: 28, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ overflow: 'auto', flex: 1, padding: 20 }}>
              <pre style={{ background: C.bg, padding: 16, borderRadius: 8, fontSize: '0.78rem', margin: 0, color: C.blue, lineHeight: 1.6, border: `1px solid ${C.border}` }}>
                {JSON.stringify(modal.data, null, 2)}
              </pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px', borderTop: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setModal(null)} style={{ padding: '8px 24px', border: 'none', background: C.blue, color: '#0f172a', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación Global */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 12, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: confirmModal.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.2rem', color: confirmModal.color, fontWeight: 700 }}>{confirmModal.color === C.red ? '!' : confirmModal.color === C.green ? '✓' : 'i'}</div>
            <h3 style={{ marginTop: 0, marginBottom: 10, color: C.text, fontWeight: 700 }}>{confirmModal.title}</h3>
            <p style={{ fontSize: '0.88rem', color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>{confirmModal.text}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button type="button" onClick={() => setConfirmModal(null)} style={{ padding: '9px 22px', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, borderRadius: 7, cursor: 'pointer', fontWeight: 600, flex: 1 }}>Cancelar</button>
              <button type="button" onClick={executeConfirm} style={{ padding: '9px 22px', border: 'none', background: confirmModal.color, color: 'white', borderRadius: 7, cursor: 'pointer', fontWeight: 700, flex: 1 }}>Proceder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('observabilidad');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reservas, setReservas] = useState({ vuelos: [], autos: [], atracciones: [], hospedaje: [] });
  const [serviceHealth, setServiceHealth] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingReservas, setLoadingReservas] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const checkServices = useCallback(async () => {
    const endpoints = [
      { label: 'Módulo Vuelos', url: '/vuelos/bookings?limit=1' },
      { label: 'Módulo Autos', url: '/autos/orders' },
      { label: 'Módulo Atracciones', url: '/atracciones?page=1&limit=1' },
      { label: 'Módulo Chatbot', url: '/chatbot/estado' },
      { label: 'Módulo Admin (Stats)', url: '/admin/stats' },
    ];
    const results = await Promise.all(endpoints.map(async (e) => {
      const t0 = Date.now();
      try { await api.get(e.url); return { label: e.label, ok: true, latency: Date.now() - t0 }; }
      catch { return { label: e.label, ok: false, latency: Date.now() - t0 }; }
    }));
    setServiceHealth(results);
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoadingStats(true);
    try {
      const { data } = await api.get('/admin/stats');

      const localesAloj = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const hospedajeList = localesAloj.map(al => ({
        id: al.id,
        tipo: 'hospedaje',
        pnr: (al.id || 'HOTEL').substring(0, 6).toUpperCase(),
        estado: al.status || 'CONFIRMED',
        total: al.total || 0,
        moneda: 'USD',
        createdAt: al.createdAt || al.fecha || new Date().toISOString().split('T')[0],
      }));

      const localesAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      const autosList = localesAutos.map(au => ({
        id: au.id || au.orderId,
        tipo: 'auto',
        pnr: (au.id || au.orderId || 'AUTO').substring(0, 6).toUpperCase(),
        estado: au.status || 'CONFIRMED',
        total: au.totalPrice?.total || au.total || 0,
        moneda: 'USD',
        createdAt: au.createdAt || au.date || new Date().toISOString().split('T')[0],
      }));

      const localesAtracciones = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      const atraccionesList = localesAtracciones.map(at => ({
        id: at.id || at.reservation_id,
        tipo: 'atraccion',
        pnr: (at.id || at.reservation_id || 'ATRAC').substring(0, 6).toUpperCase(),
        estado: at.status || 'CONFIRMED',
        total: at.totalPrice?.total || at.total || 0,
        moneda: 'USD',
        createdAt: at.createdAt || at.date || new Date().toISOString().split('T')[0],
      }));

      const kpis = data.kpis || {};
      const statsHospedaje = localesAloj.length;
      const ingresosHospedaje = localesAloj.reduce((acc, curr) => acc + Number(curr.total || 0), 0);

      const statsAutosLocales = localesAutos.length;
      const ingresosAutosLocales = localesAutos.reduce((acc, curr) => acc + Number(curr.totalPrice?.total || curr.total || 0), 0);

      const statsAtraccionesLocales = localesAtracciones.length;
      const ingresosAtraccionesLocales = localesAtracciones.reduce((acc, curr) => acc + Number(curr.totalPrice?.total || curr.total || 0), 0);

      let ultimasReservas = [...(data.ultimasReservas || []), ...hospedajeList, ...autosList, ...atraccionesList]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      setStats({
        ...data,
        kpis: {
          ...kpis,
          reservasHospedaje: statsHospedaje,
          ingresosHospedaje: ingresosHospedaje,
          reservasAutos: (kpis.reservasAutos || 0) + statsAutosLocales,
          ingresosAutos: (kpis.ingresosAutos || 0) + ingresosAutosLocales,
          reservasAtracciones: (kpis.reservasAtracciones || 0) + statsAtraccionesLocales,
          ingresosAtracciones: (kpis.ingresosAtracciones || 0) + ingresosAtraccionesLocales,
          totalReservas: (kpis.totalReservas || 0) + statsHospedaje + statsAutosLocales + statsAtraccionesLocales,
          ingresosTotal: (kpis.ingresosTotal || 0) + ingresosHospedaje + ingresosAutosLocales + ingresosAtraccionesLocales
        },
        ultimasReservas
      });
    }
    catch { setStats({ kpis: {}, ultimasReservas: [], estadosVuelos: {} }); }
    finally { if (!silent) setLoadingStats(false); setLastRefresh(new Date()); }
  }, []);

  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoadingUsers(true);
    try { const { data } = await api.get('/admin/users'); setUsers(Array.isArray(data) ? data : []); }
    catch { setUsers([]); }
    finally { if (!silent) setLoadingUsers(false); }
  }, []);

  const fetchReservas = useCallback(async (silent = false) => {
    if (!silent) setLoadingReservas(true);
    try {
      const { data } = await api.get('/admin/reservas');

      const localesAloj = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const hospedajeList = localesAloj.map(al => ({
        id: al.id,
        tipo: 'hospedaje',
        pnr: (al.id || 'HOTEL').substring(0, 6).toUpperCase(),
        estado: al.status || 'CONFIRMED',
        total: al.total || 0,
        moneda: 'USD',
        createdAt: al.createdAt || al.fecha || new Date().toISOString().split('T')[0],
      }));

      const localesAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      const autosList = localesAutos.map(au => ({
        id: au.id || au.orderId,
        tipo: 'auto',
        pnr: (au.id || au.orderId || 'AUTO').substring(0, 6).toUpperCase(),
        estado: au.status || 'CONFIRMED',
        total: au.totalPrice?.total || au.total || 0,
        moneda: 'USD',
        createdAt: au.createdAt || au.date || new Date().toISOString().split('T')[0],
      }));

      const localesAtracciones = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      const atraccionesList = localesAtracciones.map(at => ({
        id: at.id || at.reservation_id,
        tipo: 'atraccion',
        pnr: (at.id || at.reservation_id || 'ATRAC').substring(0, 6).toUpperCase(),
        estado: at.status || 'CONFIRMED',
        total: at.totalPrice?.total || at.total || 0,
        moneda: 'USD',
        createdAt: at.createdAt || at.date || new Date().toISOString().split('T')[0],
      }));

      setReservas({
        ...data,
        hospedaje: hospedajeList,
        autos: [...(data.autos || []), ...autosList],
        atracciones: [...(data.atracciones || []), ...atraccionesList]
      });
    }
    catch { setReservas({ vuelos: [], autos: [], atracciones: [], hospedaje: [] }); }
    finally { if (!silent) setLoadingReservas(false); }
  }, []);

  useEffect(() => { fetchStats(); checkServices(); }, []);

  useEffect(() => {
    if (activeTab === 'gestion') { fetchUsers(); fetchReservas(); }
  }, [activeTab]);

  const handleRefresh = () => {
    fetchStats(true); checkServices();
    if (activeTab === 'gestion') { fetchUsers(true); fetchReservas(true); }
  };

  const inputStyle2 = { width: '100%', padding: '8px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.83rem', outline: 'none', color: C.text, boxSizing: 'border-box' };

  return (
    <div className="adm-root" style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      {/* Top bar */}
      <div style={{ background: '#0d1829', borderBottom: `1px solid ${C.border}`, padding: '0 28px' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>A</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: C.text, letterSpacing: '-0.01em' }}>Panel de Administración</div>
              <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 1 }}>Booking Ecuador · RDA1 · Integración de Sistemas</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastRefresh && <span style={{ fontSize: '0.72rem', color: C.muted }}>Actualizado {lastRefresh.toLocaleTimeString('es-EC')}</span>}
            <button onClick={handleRefresh} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'opacity 0.2s' }}>
              Actualizar
            </button>
          </div>
        </div>
      </div>
      {/* Tabs */}
      <div style={{ background: '#0d1829', borderBottom: `1px solid ${C.border}`, padding: '0 28px' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className="adm-tab-btn" style={{
              background: 'transparent', border: 'none',
              color: activeTab === t.id ? C.text : C.muted,
              padding: '14px 22px', cursor: 'pointer', fontSize: '0.85rem',
              fontWeight: activeTab === t.id ? 600 : 400,
              borderBottom: activeTab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
              transition: 'all 0.2s'
            }}>
              <span style={{ marginRight: 6, opacity: 0.7, fontSize: '0.7rem' }}>{t.icon}</span>
              {t.label}
              <div style={{ fontSize: '0.62rem', marginTop: 2, color: C.muted, fontWeight: 400 }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px' }}>
        {activeTab === 'observabilidad' && <ObservabilidadTab stats={stats} loadingStats={loadingStats} serviceHealth={serviceHealth} />}
        {activeTab === 'microservicios' && <MicroserviciosTab />}
        {activeTab === 'gestion' && <GestionTab users={users} reservas={reservas} loadingUsers={loadingUsers} loadingReservas={loadingReservas} onRefresh={handleRefresh} />}
        {activeTab === 'proveedores' && <ProveedoresTab />}
      </div>
    </div>
  );
}
