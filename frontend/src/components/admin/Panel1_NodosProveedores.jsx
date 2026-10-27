import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox, aLista } from './panelUtils';

/**
 * Estado visual a partir del semáforo que calcula NodesService
 * (`semaforo_led.estado`: HEALTHY | DEGRADED | DOWN | KILL_SWITCH_ACTIVE),
 * para que el panel y el backend usen las mismas reglas.
 */
function estadoNodo(n) {
  const sem = n.semaforo_led?.estado;
  if (sem === 'KILL_SWITCH_ACTIVE' || n.killSwitchActivo || n.estado === 'APAGADO') return { txt: 'DESCONECTADO', led: '#ef4444', bg: '#fee2e2', fg: '#991b1b', off: true };
  if (sem === 'DOWN' || n.estado === 'DOWN') return { txt: 'CAÍDO', led: '#ef4444', bg: '#fee2e2', fg: '#991b1b', off: false };
  if (sem === 'DEGRADED' || n.estado === 'DEGRADED') return { txt: 'DEGRADADO', led: '#f59e0b', bg: '#fef3c7', fg: '#92400e', off: false };
  if (!n.ultimo_ping_at) return { txt: 'SIN SONDEO', led: '#94a3b8', bg: '#f1f5f9', fg: '#475569', off: false };
  return { txt: 'OPERATIVO', led: '#10b981', bg: '#dcfce7', fg: '#166534', off: false };
}

export function Panel1_NodosProveedores() {
  const [nodos, setNodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [toggleError, setToggleError] = useState('');

  const [error, setError] = useState(null);

  const fetchNodos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/nodes');
      setNodos(aLista(res));
      setError(null);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo leer la lista de nodos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodos();
    const interval = setInterval(fetchNodos, 10000);
    return () => clearInterval(interval);
  }, [fetchNodos]);

  const handleToggle = async (nodoId) => {
    const nodo = nodos.find((item) => item.id === nodoId);
    const codigoNodo = nodo?.codigo_nodo || nodo?.codigo;
    if (!codigoNodo) {
      setToggleError('No se pudo identificar el nodo para cambiar su Kill-Switch.');
      return;
    }

    setTogglingId(nodoId);
    setToggleError('');
    try {
      await api.post(`/admin/nodes/${codigoNodo}/toggle-killswitch`);
      await fetchNodos();
    } catch (error) {
      setToggleError(mensajeError(error, 'No se pudo cambiar el Kill-Switch.'));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚦</span> Panel 1: Monitor de Nodos y Kill-Switches (EDA)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Control en vivo de la topología distribuida de microservicios con semáforo LED y conmutación de emergencia (Cátedra RDA2 §2, §7).
          </p>
        </div>
        <button 
          onClick={fetchNodos}
          style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}
        >
          🔄 Actualizar Estado
        </button>
      </div>

      <ErrorBox error={error} onRetry={fetchNodos} />
      {!loading && !error && nodos.length === 0 && (
        <p style={{ color: '#64748b' }}>No hay nodos registrados. Agrégalos en la pestaña «Servicios & Prov.».</p>
      )}
      {loading && nodos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Sondeando topología de nodos...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {toggleError && (
            <div role="alert" style={{ gridColumn: '1 / -1', color: '#991b1b', background: '#fef2f2', padding: '10px 12px', borderRadius: '6px' }}>
              {toggleError}
            </div>
          )}
          {nodos.map((nodo) => {
            const st = estadoNodo(nodo);
            const led = st.led;
            const isOff = st.off;

            return (
              <div 
                key={nodo.id}
                style={{
                  border: isOff ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                  background: isOff ? '#fef2f2' : '#ffffff',
                  borderRadius: '10px',
                  padding: '16px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span 
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: led,
                          boxShadow: `0 0 8px ${led}`,
                          display: 'inline-block'
                        }}
                      />
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{nodo.codigo_nodo || nodo.codigo}</strong>
                    </div>
                    <span 
                      style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        padding: '2px 8px', 
                        borderRadius: '12px',
                        background: st.bg,
                        color: st.fg,
                      }}
                    >
                      {st.txt}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '8px', fontWeight: 500 }}>
                    {nodo.nombre}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace', background: '#f8fafc', padding: '6px', borderRadius: '4px', marginBottom: '12px', wordBreak: 'break-all' }}>
                    {nodo.url}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginBottom: '14px' }}>
                    <span>Latencia: <strong style={{ color: led }}>{nodo.latenciaMs != null ? `${nodo.latenciaMs} ms` : '—'}</strong></span>
                    <span>Fallos: <strong>{nodo.tasa_fallos_pct != null ? `${nodo.tasa_fallos_pct}%` : (nodo.failCount ?? 0)}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '-8px', marginBottom: '14px' }}>
                    <span>Circuit breaker: <strong>{nodo.circuit_breaker_estado || '—'}</strong></span>
                    <span>Último ping: {nodo.ultimo_ping_at ? new Date(nodo.ultimo_ping_at).toLocaleTimeString('es-EC') : 'nunca'}</span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Kill-Switch:</span>
                  <button
                    onClick={() => handleToggle(nodo.id)}
                    disabled={togglingId === nodo.id}
                    style={{
                      background: isOff ? '#10b981' : '#ef4444',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    {togglingId === nodo.id ? 'Cambiando...' : isOff ? '🟢 Encender Nodo' : '🔴 Activar Kill-Switch'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
