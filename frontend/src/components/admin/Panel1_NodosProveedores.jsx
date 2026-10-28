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

export function Panel1_NodosProveedores({ refreshKey }) {
  const [nodos, setNodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [toggleError, setToggleError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [actionSuccess, setActionSuccess] = useState({});

  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);

  const fetchNodos = useCallback(async (manual = false) => {
    try {
      if (manual) setIsRefreshing(true);
      else if (nodos.length === 0) setLoading(true);
      const res = await api.get('/nodes');
      setNodos(aLista(res));
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(mensajeError(err, 'No se pudo leer la lista de nodos.'));
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, [nodos.length]);

  useEffect(() => {
    fetchNodos(false);
    const interval = setInterval(() => fetchNodos(false), 10000);
    return () => clearInterval(interval);
  }, [fetchNodos, refreshKey]);

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
      await fetchNodos(true);
    } catch (error) {
      setToggleError(mensajeError(error, 'No se pudo cambiar el Kill-Switch.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handlePing = async (codigoNodo) => {
    setActionLoading((prev) => ({ ...prev, [codigoNodo]: 'ping' }));
    setToggleError('');
    try {
      const res = await api.post(`/nodes/${codigoNodo}/ping`);
      const lat = res?.latencia_ms != null ? `${res.latencia_ms} ms` : 'OK';
      setActionSuccess((prev) => ({ ...prev, [codigoNodo]: `✓ Ping exitoso (${lat})` }));
      setTimeout(() => {
        setActionSuccess((prev) => ({ ...prev, [codigoNodo]: null }));
      }, 4000);
      await fetchNodos(false);
    } catch (err) {
      setToggleError(mensajeError(err, `Fallo al hacer ping a ${codigoNodo}`));
    } finally {
      setActionLoading((prev) => ({ ...prev, [codigoNodo]: null }));
    }
  };

  const handleSync = async (codigoNodo) => {
    setActionLoading((prev) => ({ ...prev, [codigoNodo]: 'sync' }));
    setToggleError('');
    try {
      const res = await api.post(`/nodes/${codigoNodo}/sync`);
      const count = res?.count ?? res?.total_recibidos ?? 0;
      setActionSuccess((prev) => ({ ...prev, [codigoNodo]: `✓ Sincronizados: ${count} ítems` }));
      setTimeout(() => {
        setActionSuccess((prev) => ({ ...prev, [codigoNodo]: null }));
      }, 5000);
      await fetchNodos(false);
    } catch (err) {
      setToggleError(mensajeError(err, `Error al sincronizar con ${codigoNodo}`));
    } finally {
      setActionLoading((prev) => ({ ...prev, [codigoNodo]: null }));
    }
  };

  const nodosFiltrados = nodos.filter(n => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (n.codigo_nodo || n.codigo || '').toLowerCase().includes(q)
      || (n.nombre_proveedor || n.nombre || '').toLowerCase().includes(q)
      || (n.vertical || n.tipo || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚦</span> Panel 1: Monitor de Nodos y Kill-Switches (EDA)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Control en vivo de la topología distribuida de microservicios con semáforo LED y conmutación de emergencia (Cátedra RDA2 §2, §7).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar nodo (ej. Daniel, Dilan, NODE_AUT)..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', minWidth: '220px', outline: 'none' }}
          />
          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '6px 10px', borderRadius: '6px' }}>
              ✓ Actualizado {lastUpdated.toLocaleTimeString('es-EC')}
            </span>
          )}
          <button 
            onClick={() => fetchNodos(true)}
            disabled={isRefreshing}
            style={{ 
              background: isRefreshing ? '#e2e8f0' : '#f8fafc', 
              border: '1px solid #cbd5e1', 
              padding: '8px 14px', 
              borderRadius: '8px', 
              cursor: isRefreshing ? 'wait' : 'pointer', 
              fontWeight: 600, 
              fontSize: '0.85rem', 
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>🔄</span>
            {isRefreshing ? 'Actualizando…' : '🔄 Actualizar Estado'}
          </button>
        </div>
      </div>

      <ErrorBox error={error} onRetry={() => fetchNodos(true)} />
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
          {nodosFiltrados.map((nodo) => {
            const st = estadoNodo(nodo);
            const led = st.led;
            const isOff = st.off;
            const codigo = nodo.codigo_nodo || nodo.codigo;
            const loadingAction = actionLoading[codigo];
            const successMsg = actionSuccess[codigo];

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
                  transition: 'box-shadow 0.2s',
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
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{codigo}</strong>
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
                    <span>Circuit breaker: <strong>{nodo.circuit_breaker_estado || 'CLOSED'}</strong></span>
                    <span>Último ping: {nodo.ultimo_ping_at ? new Date(nodo.ultimo_ping_at).toLocaleTimeString('es-EC') : 'nunca'}</span>
                  </div>

                  {successMsg && (
                    <div style={{ background: '#dcfce7', color: '#15803d', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, marginBottom: '12px', textAlign: 'center' }}>
                      {successMsg}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handlePing(codigo)}
                      disabled={loadingAction === 'ping' || isOff}
                      title="Probar conectividad y latencia live"
                      style={{
                        background: '#f8fafc',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: loadingAction === 'ping' || isOff ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ display: 'inline-block', animation: loadingAction === 'ping' ? 'spin 0.8s linear infinite' : 'none' }}>🔄</span>
                      {loadingAction === 'ping' ? 'Ping…' : 'Ping'}
                    </button>
                    {(nodo.vertical === 'AUTOS' || nodo.vertical === 'ATRACCIONES') && (
                      <button
                        onClick={() => handleSync(codigo)}
                        disabled={loadingAction === 'sync' || isOff}
                        title="Sincronizar catálogo con el proveedor"
                        style={{
                          background: '#f0fdf4',
                          color: '#166534',
                          border: '1px solid #bbf7d0',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: loadingAction === 'sync' || isOff ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ display: 'inline-block', animation: loadingAction === 'sync' ? 'spin 0.8s linear infinite' : 'none' }}>📥</span>
                        {loadingAction === 'sync' ? 'Sincronizando…' : 'Sincronizar'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
