import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox, ActualizadoHace } from './panelUtils';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

/**
 * Facturas emitidas (schema_facturacion.facturas_encabezado), con búsqueda,
 * filtro por estado y detalle con líneas y notas de crédito.
 * Todo sale de GET /facturas y GET /facturas/:id; no hay datos de ejemplo.
 */
const ESTADOS = [
  ['', 'Todos'],
  ['EMITIDA', 'Emitida'],
  ['PAGADA', 'Pagada'],
  ['ANULADA_POR_COMPENSACION', 'Anulada'],
];
const COLOR_ESTADO = { EMITIDA: '#075985', PAGADA: '#166534', ANULADA_POR_COMPENSACION: '#991b1b' };
const usd = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fecha = (d) => (d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const th = { padding: '10px', textAlign: 'left', fontWeight: 600, color: '#003b95', whiteSpace: 'nowrap' };
const td = { padding: '10px', verticalAlign: 'top' };

export function Panel5_ConsolaFiscalFacturas({ refreshKey = 0 }) {
  const [datos, setDatos] = useState({ items: [], total: 0, totales: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/facturas', { params: { limit: 200, ...(estado ? { estado } : {}), ...(busqueda ? { q: busqueda } : {}) } });
      setDatos({ items: Array.isArray(data?.items) ? data.items : [], total: data?.total ?? 0, totales: data?.totales ?? null });
    } catch (e) {
      if (silencioso) throw e;
      setDatos({ items: [], total: 0, totales: null });
      setError(mensajeError(e, 'No se pudieron leer las facturas.'));
    } finally {
      setLoading(false);
    }
  }, [estado, busqueda]);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  // Se actualiza solo cada 5 s (sin botón).
  const auto = useAutoRefresh(cargar, 5000);

  const abrir = async (f) => {
    setDetalle({ cargando: true, numero: f.numero_factura });
    try {
      const { data } = await api.get(`/facturas/${encodeURIComponent(f.id)}`);
      setDetalle({ factura: data });
    } catch (e) {
      setDetalle({ error: mensajeError(e, 'No se pudo leer el detalle de la factura.'), numero: f.numero_factura });
    }
  };

  const t = datos.totales;

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <form onSubmit={(e) => { e.preventDefault(); setBusqueda(q.trim()); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N.º, cliente, cédula/RUC o correo" style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #cbd5e1', minWidth: 240, fontSize: '0.82rem' }} />
          <button type="submit" style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #006ce4', background: '#006ce4', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Buscar</button>
          {ESTADOS.map(([id, label]) => (
            <button key={id || 'todos'} type="button" onClick={() => setEstado(id)} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${estado === id ? '#006ce4' : '#e7e7e7'}`, background: estado === id ? '#ebf3ff' : '#fff', color: estado === id ? '#003b95' : '#1a1a1a', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>{label}</button>
          ))}
        </form>
        <ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={5000} />
      </div>

      <ErrorBox error={error} onRetry={cargar} />

      {t && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '0.82rem', color: '#52514e', marginBottom: 10 }}>
          <span><strong>{t.cantidad}</strong> facturas</span>
          <span>Subtotal <strong>{usd(t.subtotal)}</strong></span>
          <span>IVA <strong>{usd(t.iva)}</strong></span>
          <span>Total <strong>{usd(t.total)}</strong></span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#ebf3ff' }}>
              {['N.º factura', 'Cliente', 'Emitida', 'Subtotal', 'IVA', 'Total', 'Pago', 'Estado', ''].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {datos.items.map((f) => (
              <tr key={f.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#003580', whiteSpace: 'nowrap' }}>{f.numero_factura}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{f.nombre_cliente || '—'}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{f.cedula_ruc_cliente || '—'}{f.email_cliente ? ` · ${f.email_cliente}` : ''}</div>
                </td>
                <td style={{ ...td, color: '#64748b', whiteSpace: 'nowrap' }}>{fecha(f.emitida_at)}</td>
                <td style={td}>{usd(f.subtotal)}</td>
                <td style={td}>{usd(f.iva_valor)} <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>({f.iva_porcentaje}%)</span></td>
                <td style={{ ...td, fontWeight: 700 }}>{usd(f.total)}</td>
                <td style={{ ...td, fontSize: '0.78rem' }}>{f.metodo_pago || '—'}</td>
                <td style={td}><span style={{ color: COLOR_ESTADO[f.estado] || '#475569', fontWeight: 700, fontSize: '0.75rem' }}>{f.estado}</span></td>
                <td style={td}><button type="button" onClick={() => abrir(f)} style={{ background: '#ebf3ff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}>Ver</button></td>
              </tr>
            ))}
            {!loading && !error && datos.items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No hay facturas{estado || busqueda ? ' con este filtro' : ' emitidas todavía'}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div onClick={() => setDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Factura {detalle.factura?.numero_factura || detalle.numero}</h3>
              <button type="button" onClick={() => setDetalle(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            {detalle.cargando && <div style={{ color: '#64748b' }}>Cargando…</div>}
            {detalle.error && <ErrorBox error={detalle.error} />}
            {detalle.factura && (() => {
              const f = detalle.factura;
              return (
                <div style={{ fontSize: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px', marginBottom: 14 }}>
                    {[['Cliente', f.nombre_cliente], ['Cédula / RUC', f.cedula_ruc_cliente], ['Correo', f.email_cliente], ['Emitida', fecha(f.emitida_at)], ['Método de pago', f.metodo_pago], ['Estado', f.estado], ['Transacción de pago', f.transaccion_pago_id]].map(([k, v]) => (
                      <div key={k}><div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div><div style={{ wordBreak: 'break-all' }}>{v || '—'}</div></div>
                    ))}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                    <thead><tr style={{ background: '#f8fafc' }}>{['Descripción', 'Cant.', 'P. unit.', 'Subtotal'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {f.lineas.map((l, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={td}>{l.descripcion}<div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{l.vertical} · {l.item_id}</div></td>
                          <td style={td}>{l.cantidad}</td>
                          <td style={td}>{usd(l.precio_unitario)}</td>
                          <td style={td}>{usd(l.subtotal)}</td>
                        </tr>
                      ))}
                      {f.lineas.length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#64748b' }}>Esta factura no tiene líneas de detalle guardadas.</td></tr>}
                    </tbody>
                  </table>
                  <div style={{ textAlign: 'right', lineHeight: 1.7 }}>
                    <div>Subtotal: <strong>{usd(f.subtotal)}</strong></div>
                    <div>IVA {f.iva_porcentaje}%: <strong>{usd(f.iva_valor)}</strong></div>
                    <div style={{ fontSize: '1rem' }}>Total: <strong>{usd(f.total)}</strong></div>
                  </div>
                  {f.notas_credito.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Notas de crédito</div>
                      {f.notas_credito.map((n) => (
                        <div key={n.numero_nota} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #f1f5f9', padding: '6px 0' }}>
                          <span style={{ fontFamily: 'monospace' }}>{n.numero_nota}</span>
                          <span style={{ color: '#64748b', flex: 1 }}>{n.motivo || ''}</span>
                          <span style={{ color: '#991b1b', fontWeight: 700 }}>−{usd(n.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
