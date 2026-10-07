/**
 * Modal que se muestra ANTES de guardar una reserva offline.
 * Informa al usuario que no tiene conexión y que su reserva
 * se sincronizará automáticamente cuando vuelva la red.
 */
export function OfflineReservaModal({ onContinuar, onCancelar }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '32px 28px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          animation: 'fadeInScale 0.2s ease',
        }}
      >
        <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>📡</div>

        <h2
          id="offline-modal-title"
          style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 700, color: '#1a1a1a' }}
        >
          Estás sin conexión a internet
        </h2>

        <p style={{ margin: '0 0 8px', fontSize: '0.92rem', color: '#4b5563', lineHeight: 1.6 }}>
          Tu reserva se <strong>guardará de forma segura</strong> en tu dispositivo y
          se sincronizará automáticamente cuando recuperes la conexión.
        </p>

        <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: '#6b7280' }}>
          Recibirás la confirmación por correo en cuanto vuelva la red.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: '#ffffff',
              color: '#374151',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinuar}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#006ce4',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Guardar y sincronizar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
