import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox } from './panelUtils';

const hoy = () => new Date().toISOString().slice(0, 10);
const fmtHora = (d) => (d ? new Date(d).toLocaleTimeString('es-EC') : '—');

const FORM_INICIAL = {
  service_id: 'NODE_VUE_ECOAIRLINES',
  item_id: 'AV1632-ECONOMY',
  date: hoy(),
  time_slot: '08:30',
  available_units: 10,
};

const input = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' };
const th = { padding: '10px' };
const td = { padding: '10px' };

function Metrica({ titulo, valor, color = '#0f172a', mono }) {
  return (
    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{titulo}</span>
      <div style={{ fontSize: mono ? '0.85rem' : '1.2rem', fontWeight: 800, color, marginTop: '4px', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {valor}
      </div>
    </div>
  );
}

export function Panel7_MonitorStockGrpc() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(FORM_INICIAL);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await api.get('/inventory/status');
      setMetrics(res.data || res);
      setError(null);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo leer el estado del servidor gRPC.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 8000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const enviarPrueba = async (e) => {
    e.preventDefault();
    setPushing(true);
    setPushResult(null);
    try {
      const res = await api.post('/inventory/push-stock', {
        ...form,
        available_units: Number(form.available_units),
        timestamp: Date.now(),
      });
      setPushResult({ ok: true, message: (res.data || res).message });
      await fetchMetrics();
    } catch (err) {
      setPushResult({ ok: false, message: mensajeError(err, 'El mensaje fue rechazado.') });
    } finally {
      setPushing(false);
    }
  };

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const authAbierto = metrics?.auth_mode === 'ABIERTO';

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> Panel 7: Monitor de Inventario gRPC Inbound (TCP {metrics?.port ?? 50051})
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Stock que los proveedores empujan con <code>InventoryStockService</code>. Cada registro se guarda por proveedor (<code>service_id</code>).
          </p>
        </div>
        <button onClick={fetchMetrics} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
          🔄 Refrescar
        </button>
      </div>

      <ErrorBox error={error} onRetry={fetchMetrics} />
      {loading && !metrics && <p style={{ color: '#64748b' }}>Cargando telemetría…</p>}

      {metrics && (
        <>
          {authAbierto && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.83rem' }}>
              ⚠️ Autenticación gRPC en <strong>modo abierto</strong>: no está definida <code>GRPC_NODE_KEYS</code>, así que se acepta cualquier
              <code> x-api-key</code>. Defínela en el servidor antes de las pruebas con las aerolíneas.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            <Metrica titulo="Autenticación" valor={authAbierto ? 'Abierta' : 'x-api-key por nodo'} color={authAbierto ? '#b45309' : '#10b981'} />
            <Metrica titulo="Throughput (último minuto)" valor={`${metrics.throughput_msg_sec ?? 0} msg/s`} color="#006ce4" />
            <Metrica titulo="Mensajes recibidos" valor={metrics.total_messages_received ?? 0} color="#10b981" />
            <Metrica titulo="Mensajes rechazados" valor={metrics.total_messages_rejected ?? 0} color={metrics.total_messages_rejected ? '#dc2626' : '#0f172a'} />
            <Metrica titulo="Ítems sincronizados" valor={metrics.total_items_in_registry ?? 0} />
            <Metrica titulo="Último mensaje" valor={fmtHora(metrics.last_message_at)} />
            <Metrica titulo="Hash último stream" valor={metrics.last_sync_hash || 'sin streams aún'} mono />
          </div>

          <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '12px' }}>Stock por proveedor</h3>
          {(metrics.nodes || []).length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Ningún proveedor ha enviado stock todavía.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={th}>Service ID</th><th style={th}>Ítems</th><th style={th}>Unidades libres</th><th style={th}>Mensajes</th><th style={th}>Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {metrics.nodes.map((n) => (
                  <tr key={n.service_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#003580', fontFamily: 'monospace' }}>{n.service_id}</td>
                    <td style={td}>{n.items}</td>
                    <td style={td}>{n.unidades_disponibles}</td>
                    <td style={td}>{n.mensajes}</td>
                    <td style={{ ...td, color: '#64748b' }}>{fmtHora(n.ultima_actualizacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(metrics.recent_rejections || []).length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', color: '#991b1b', marginBottom: '12px' }}>Mensajes rechazados recientes</h3>
              <ul style={{ margin: '0 0 24px', padding: 0, listStyle: 'none', fontSize: '0.82rem' }}>
                {metrics.recent_rejections.map((r, i) => (
                  <li key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #fee2e2', background: '#fff5f5' }}>
                    <span style={{ color: '#64748b' }}>{fmtHora(r.at)}</span> · <code>{r.service_id || 'sin service_id'}</code> — {r.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '12px' }}>Registros recibidos (últimos 50)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={th}>Item ID</th><th style={th}>Service ID</th><th style={th}>Fecha</th><th style={th}>Turno</th><th style={th}>Libres</th><th style={th}>Origen</th><th style={th}>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {(metrics.sample_records || []).map((r) => (
                <tr key={`${r.service_id}|${r.item_id}|${r.date}|${r.time_slot}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, fontWeight: 700, color: '#003580' }}>{r.item_id}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.service_id}</td>
                  <td style={td}>{r.date}</td>
                  <td style={td}>{r.time_slot}</td>
                  <td style={td}>
                    <span style={{ background: r.available_units > 0 ? '#dcfce7' : '#fee2e2', color: r.available_units > 0 ? '#166534' : '#991b1b', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                      {r.available_units}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: '0.75rem', color: '#64748b' }}>{r.source}</td>
                  <td style={{ ...td, color: '#64748b', fontSize: '0.8rem' }}>{fmtHora(r.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '8px' }}>Probar un mensaje de stock</h3>
      <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.8rem' }}>
        Se registra con la misma validación de <code>service_id</code> que el canal gRPC (no se aceptan valores genéricos como <code>vuelos</code>).
      </p>
      <form onSubmit={enviarPrueba} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label style={{ fontSize: '0.75rem', color: '#475569' }}>service_id<input style={input} required {...campo('service_id')} /></label>
        <label style={{ fontSize: '0.75rem', color: '#475569' }}>item_id<input style={input} required {...campo('item_id')} /></label>
        <label style={{ fontSize: '0.75rem', color: '#475569' }}>Fecha<input style={input} type="date" required {...campo('date')} /></label>
        <label style={{ fontSize: '0.75rem', color: '#475569' }}>Hora<input style={input} required {...campo('time_slot')} /></label>
        <label style={{ fontSize: '0.75rem', color: '#475569' }}>Unidades libres<input style={input} type="number" min="0" required {...campo('available_units')} /></label>
        <button type="submit" disabled={pushing} style={{ background: '#006ce4', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: '8px', cursor: pushing ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
          {pushing ? 'Enviando…' : '📡 Enviar'}
        </button>
      </form>
      {pushResult && (
        <div style={{ marginTop: 12, background: pushResult.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${pushResult.ok ? '#a7f3d0' : '#fecaca'}`, color: pushResult.ok ? '#065f46' : '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
          {pushResult.ok ? '✓ ' : '✗ '}{pushResult.message}
        </div>
      )}
    </div>
  );
}
