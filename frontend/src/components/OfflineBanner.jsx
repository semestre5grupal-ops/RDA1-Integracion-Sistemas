import { useEffect, useState } from 'react';
import { useOfflineSyncManager } from '../hooks/useOfflineSyncManager';

export function OfflineBanner() {
  const { isOffline } = useOfflineSyncManager();
  const [syncedCount, setSyncedCount] = useState(0);
  const [showSyncToast, setShowSyncToast] = useState(false);

  // Escuchar el evento global que emite offlineSync.js al terminar
  useEffect(() => {
    const handler = (e) => {
      setSyncedCount(e.detail?.count ?? 1);
      setShowSyncToast(true);
      // Auto-ocultar tras 5 segundos
      setTimeout(() => setShowSyncToast(false), 5000);
    };
    window.addEventListener('offline-sync-complete', handler);
    return () => window.removeEventListener('offline-sync-complete', handler);
  }, []);

  return (
    <>
      {/* ── Banner de sin conexión ── */}
      {isOffline && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          background: '#333',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: '320px',
        }}>
          <span role="img" aria-label="Sin conexión">📡</span>
          <div>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px' }}>Estás sin conexión</p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>Tus reservas se guardarán y se enviarán al reconectar.</p>
          </div>
        </div>
      )}

      {/* ── Toast de sincronización exitosa ── */}
      {showSyncToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: isOffline ? '90px' : '20px',
            left: '20px',
            background: '#059669',
            color: '#fff',
            padding: '14px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 9999,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: '320px',
            animation: 'slideInRight 0.3s ease',
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>✅</span>
          <div>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px' }}>
              {syncedCount === 1 ? '¡Reserva sincronizada!' : `¡${syncedCount} reservas sincronizadas!`}
            </p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
              Tu pago fue procesado con éxito.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSyncToast(false)}
            aria-label="Cerrar notificación"
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', marginLeft: '4px', opacity: 0.8 }}
          >
            ✕
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
