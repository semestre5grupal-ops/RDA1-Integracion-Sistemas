import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox, aLista } from './panelUtils';

/** Estados reales de SagaOrchestratorService (schema_auditoria.saga_transacciones). */
const ESTADO_SAGA = {
  COMPLETED: { txt: '✓ COMPLETADA', bg: '#dcfce7', fg: '#166534', borde: '#e2e8f0' },
  IN_PROGRESS: { txt: '… EN CURSO', bg: '#e0f2fe', fg: '#075985', borde: '#bae6fd' },
  COMPENSATING: { txt: '↺ COMPENSANDO', bg: '#fef3c7', fg: '#92400e', borde: '#fcd34d' },
  FAILED: { txt: '↺ FALLÓ · COMPENSADA (LIFO)', bg: '#fee2e2', fg: '#991b1b', borde: '#fca5a5' },
  COMPENSATION_FAILED: { txt: '⚠ COMPENSACIÓN INCOMPLETA', bg: '#991b1b', fg: '#fff', borde: '#991b1b' },
};
const estadoSaga = (e) => ESTADO_SAGA[e] || { txt: e || '—', bg: '#f1f5f9', fg: '#475569', borde: '#e2e8f0' };

const COLOR_PASO = { SUCCESS: '#166534', FAILED: '#991b1b', COMPENSATED: '#b45309', COMPENSATION_FAILED: '#7f1d1d' };
const fmt = (d) => (d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—');

export function Panel8_AuditoriaSagas() {
  const [sagas, setSagas] = useState([]);
  const [logs, setLogs] = useState([]);
  const [errSagas, setErrSagas] = useState(null);
  const [errLogs, setErrLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('TODAS');
  const [detalle, setDetalle] = useState(null);
  const [errDetalle, setErrDetalle] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [s, l] = await Promise.allSettled([
      api.get('/esb/sagas', { params: { limit: 50 } }),
      api.get('/admin/auditoria', { params: { limit: 100 } }),
    ]);
    if (s.status === 'fulfilled') { setSagas(aLista(s.value)); setErrSagas(null); }
    else setErrSagas(mensajeError(s.reason, 'No se pudieron leer las sagas.'));
    if (l.status === 'fulfilled') { setLogs(aLista(l.value)); setErrLogs(null); }
    else setErrLogs(mensajeError(l.reason, 'No se pudo leer la auditoría.'));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const abrirDetalle = async (correlationId) => {
    setErrDetalle(null);
    setDetalle({ correlationId, cargando: true });
    try {
      const res = await api.get(`/esb/sagas/${encodeURIComponent(correlationId)}`);
      const body = res.data || res;
      setDetalle({ correlationId, saga: body.saga, journal: body.journal || [] });
    } catch (e) {
      setErrDetalle(mensajeError(e, 'No se pudo leer el detalle de la saga.'));
      setDetalle(null);
    }
  };

  const conteo = sagas.reduce((acc, s) => ({ ...acc, [s.estado]: (acc[s.estado] || 0) + 1 }), {});
  const visibles = filtroEstado === 'TODAS' ? sagas : sagas.filter((s) => s.estado === filtroEstado);

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛡️</span> Panel 8: Auditoría de Sagas LIFO y logs de auditoría
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Transacciones de <code>schema_auditoria</code> con su journal de pasos y compensaciones, y eventos de los archivos <code>logs/audit-*.log</code>.
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
          {loading ? 'Cargando…' : '🔄 Refrescar'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* SAGAS */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <h3 style={{ fontSize: '1rem', color: '#0f172a', margin: 0 }}>Transacciones Saga ({sagas.length})</h3>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
              <option value="TODAS">Todas</option>
              {Object.keys(ESTADO_SAGA).map((k) => (
                <option key={k} value={k}>{ESTADO_SAGA[k].txt.replace(/^[^A-ZÁÉÍÓÚ]+/, '')} ({conteo[k] || 0})</option>
              ))}
            </select>
          </div>
          <ErrorBox error={errSagas} onRetry={fetchData} />
          {!errSagas && !loading && visibles.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No hay sagas registradas{filtroEstado !== 'TODAS' ? ' con ese estado' : ''}.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: 520, overflowY: 'auto' }}>
            {visibles.map((s) => {
              const st = estadoSaga(s.estado);
              const activa = detalle?.correlationId === s.correlationId;
              return (
                <button
                  type="button"
                  key={s.id || s.correlationId}
                  onClick={() => abrirDetalle(s.correlationId)}
                  style={{ textAlign: 'left', border: `1px solid ${activa ? '#003580' : st.borde}`, background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', font: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, color: '#003580', fontFamily: 'monospace' }}>{s.correlationId}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: st.bg, color: st.fg }}>{st.txt}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>{s.sagaNombre} · paso {s.pasoActual ?? '?'} / {s.pasosTotales ?? '?'}</div>
                  {s.codigoCompensacion && <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginTop: 4 }}>Compensación: {s.codigoCompensacion}</div>}
                  {s.errorDetalle && <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: 4 }}>{s.errorDetalle}</div>}
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Inicio {fmt(s.iniciadaAt)}{s.finalizadaAt ? ` · Fin ${fmt(s.finalizadaAt)}` : ''}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* DETALLE + LOGS */}
        <div>
          <ErrorBox error={errDetalle} />
          {detalle && (
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ fontFamily: 'monospace', color: '#003580' }}>{detalle.correlationId}</strong>
                <button type="button" onClick={() => setDetalle(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              {detalle.cargando ? <p style={{ color: '#64748b', margin: 0 }}>Cargando journal…</p> : detalle.journal.length === 0 ? (
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>La saga no tiene pasos registrados.</p>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem' }}>
                  {detalle.journal.map((p, i) => (
                    <li key={p.id || i} style={{ marginBottom: 8 }}>
                      <strong>{p.servicioNombre}</strong> · {p.operacion}{' '}
                      <span style={{ color: COLOR_PASO[p.estadoPaso] || '#475569', fontWeight: 700 }}>[{p.estadoPaso}]</span>
                      <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all' }}>{p.endpointInvocado}</div>
                      {p.compensacionEndpoint && <div style={{ color: '#b45309', fontSize: '0.72rem' }}>Compensación: {p.compensacionEndpoint}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <h3 style={{ fontSize: '1rem', color: '#0f172a', marginBottom: '12px' }}>📜 Auditoría (archivos de log + eventos de negocio)</h3>
          <ErrorBox error={errLogs} onRetry={fetchData} />
          <div style={{ background: '#0f172a', color: '#f8fafc', padding: '14px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.76rem', height: 380, overflowY: 'auto' }}>
            {!errLogs && logs.length === 0 && <div style={{ color: '#94a3b8' }}>Sin registros.</div>}
            {logs.map((l) => (
              <div key={l.id} style={{ marginBottom: '9px', lineHeight: 1.4 }}>
                <span style={{ color: '#94a3b8' }}>[{fmt(l.fecha)}]</span>{' '}
                <span style={{ color: l.origen === 'ADMIN' ? '#fbbf24' : '#38bdf8' }}>{l.origen}</span>{' '}
                <strong style={{ color: /ROLLBACK|REJECT|FAIL|CANCEL/i.test(l.accion || '') ? '#f87171' : '#4ade80' }}>{l.accion}</strong>
                <br />
                <span style={{ color: '#cbd5e1' }}>{l.actor} · {l.entidad}{l.detalle ? ` · ${String(l.detalle).slice(0, 140)}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
