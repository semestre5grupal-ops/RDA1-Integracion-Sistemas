import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox } from './panelUtils';

/**
 * Flota de autos que ve Booking (GET /autos/flota): autos de las rentadoras
 * socias guardados en la base y la flota local del módulo de autos.
 * Si un dato no lo informa el socio se muestra "—"; no se rellena con valores de ejemplo.
 */
const COLOR_ESTADO = {
  DISPONIBLE: ['#dcfce7', '#15803d'],
  RESERVADO: ['#ede9fe', '#6d28d9'],
  ENTREGADO: ['#e0f2fe', '#0369a1'],
  EN_LIMPIEZA: ['#fef3c7', '#b45309'],
  EN_MANTENIMIENTO: ['#fee2e2', '#b91c1c'],
};

const reloj = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const kmTxt = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('es-EC')} km`);

export function Panel2_GestionFlotaAutos({ refreshKey = 0 }) {
  const [flota, setFlota] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const [proveedor, setProveedor] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/autos/flota');
      setFlota(Array.isArray(data) ? data : []);
      setActualizado(Date.now());
    } catch (e) {
      setFlota([]);
      setError(mensajeError(e, 'No se pudo leer la flota de autos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  // El cronómetro de limpieza solo corre si el backend informó los segundos restantes.
  const hayCronometro = flota.some((c) => c.estado_operativo === 'EN_LIMPIEZA' && Number(c.segundos_restantes_cooldown) > 0);
  useEffect(() => {
    if (!hayCronometro) return undefined;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hayCronometro]);

  const proveedores = useMemo(() => {
    const m = new Map();
    flota.forEach((c) => {
      const k = c.origen === 'LOCAL' ? 'LOCAL' : c.proveedor_nombre || 'Sin proveedor';
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [flota]);

  const visibles = flota.filter((c) => {
    const k = c.origen === 'LOCAL' ? 'LOCAL' : c.proveedor_nombre || 'Sin proveedor';
    if (proveedor !== 'TODOS' && k !== proveedor) return false;
    const q = busqueda.trim().toLowerCase();
    return !q || [c.marca, c.modelo, c.categoria, c.proveedor_nombre].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const porEstado = flota.reduce((acc, c) => ({ ...acc, [c.estado_operativo || 'SIN_ESTADO']: (acc[c.estado_operativo || 'SIN_ESTADO'] || 0) + 1 }), {});
  const conAlerta = flota.filter((c) => c.alerta_mantenimiento).length;

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.82rem', color: '#52514e' }}>
          <span><strong>{flota.length}</strong> autos</span>
          {Object.entries(porEstado).map(([e, n]) => <span key={e}>{e.replace(/_/g, ' ').toLowerCase()}: <strong>{n}</strong></span>)}
          {conAlerta > 0 && <span style={{ color: '#b91c1c' }}>con alerta de mantenimiento: <strong>{conAlerta}</strong></span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actualizado && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Actualizado {new Date(actualizado).toLocaleTimeString('es-EC')}</span>}
          <button type="button" onClick={cargar} disabled={loading} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: 6, cursor: loading ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
            {loading ? 'Cargando…' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      <ErrorBox error={error} onRetry={cargar} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['TODOS', flota.length], ...proveedores].map(([k, n]) => (
            <button key={k} type="button" onClick={() => setProveedor(k)} style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${proveedor === k ? '#006ce4' : '#e7e7e7'}`, background: proveedor === k ? '#ebf3ff' : '#fff', color: proveedor === k ? '#003b95' : '#1a1a1a', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              {k === 'TODOS' ? 'Todos' : k === 'LOCAL' ? 'Flota local del módulo' : k} ({n})
            </button>
          ))}
        </div>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Marca, modelo o categoría" style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #cbd5e1', fontSize: '0.82rem', minWidth: 200 }} />
      </div>

      {proveedor === 'LOCAL' && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', marginBottom: 12 }}>
          La flota local está escrita en el código del módulo de autos y vive en memoria: se reinicia con cada despliegue y no pertenece a ninguna rentadora socia.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {visibles.map((c) => {
          const [bg, fg] = COLOR_ESTADO[c.estado_operativo] || ['#f1f5f9', '#475569'];
          const restante = Number(c.segundos_restantes_cooldown) > 0 && actualizado
            ? Math.max(0, Number(c.segundos_restantes_cooldown) - Math.floor((ahora - actualizado) / 1000))
            : null;
          const ratio = c.kilometraje_actual != null && c.umbral_mantenimiento_km ? Math.min(100, (c.kilometraje_actual / c.umbral_mantenimiento_km) * 100) : null;
          return (
            <div key={c.id} style={{ border: c.alerta_mantenimiento ? '2px solid #ef4444' : '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.origen === 'LOCAL' ? '#fff7ed' : '#e0e7ff', color: c.origen === 'LOCAL' ? '#9a3412' : '#3730a3' }}>
                  {c.origen === 'LOCAL' ? 'Flota local (en memoria)' : c.proveedor_nombre}
                </span>
                <span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>{c.estado_operativo || 'sin estado'}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{c.marca} {c.modelo}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                {c.categoria || '—'} · {c.precio_diario != null ? `$${Number(c.precio_diario).toFixed(2)}/día` : 'precio no informado'}
              </div>
              {c.estado_operativo === 'EN_LIMPIEZA' && (
                <div style={{ background: '#fef3c7', borderRadius: 6, padding: 8, fontSize: '0.8rem', color: '#92400e', marginBottom: 8 }}>
                  En limpieza{restante !== null ? <> · disponible en <strong style={{ fontFamily: 'monospace' }}>{reloj(restante)}</strong></> : ''}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
                <span>Odómetro: <strong>{kmTxt(c.kilometraje_actual)}</strong></span>
                <span>Umbral: {kmTxt(c.umbral_mantenimiento_km)}</span>
              </div>
              {ratio !== null && (
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${ratio}%`, height: '100%', background: c.alerta_mantenimiento ? '#ef4444' : ratio > 80 ? '#f59e0b' : '#3b82f6' }} />
                </div>
              )}
              {c.alerta_mantenimiento && <div style={{ marginTop: 8, fontSize: '0.76rem', color: '#b91c1c', fontWeight: 600 }}>Superó el umbral de mantenimiento</div>}
            </div>
          );
        })}
        {!loading && !error && visibles.length === 0 && <div style={{ color: '#64748b', padding: 20 }}>No hay autos con este filtro.</div>}
      </div>
    </div>
  );
}
