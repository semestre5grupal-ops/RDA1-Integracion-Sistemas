import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

const formatoFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export function ModalReservaSinCupo({
  abierto,
  nombreAlojamiento,
  destino,
  checkin,
  checkout,
  mensajeServidor,
  onVerDisponibles,
  onCambiarFechas,
}) {
  const ref = useRef(null);
  const idTitulo = useId();
  const idDesc = useId();
  useFocusTrap(abierto, onCambiarFechas, ref);

  if (!abierto) return null;

  const descTexto =
    mensajeServidor ||
    'El alojamiento seleccionado ya no cuenta con habitaciones disponibles para las fechas elegidas. Es posible que otro viajero haya reservado la última habitación disponible.';

  return createPortal(
    <div
      onClick={onCambiarFechas}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: 16,
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDesc}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ padding: '24px 24px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="10" y1="14" x2="14" y2="18" />
              <line x1="14" y1="14" x2="10" y2="18" />
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <h2
              id={idTitulo}
              style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#1a1a1a',
              }}
            >
              Habitaciones agotadas
            </h2>
            <p
              id={idDesc}
              style={{
                margin: '8px 0 0',
                fontSize: '0.92rem',
                color: '#474747',
                lineHeight: 1.45,
              }}
            >
              {descTexto}
            </p>
          </div>
        </div>

        {(checkin || checkout || nombreAlojamiento) && (
          <div
            style={{
              margin: '18px 24px 0',
              padding: '12px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: '0.86rem',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {nombreAlojamiento && (
              <div>
                <strong>Alojamiento:</strong> {nombreAlojamiento}
              </div>
            )}
            {checkin && checkout && (
              <div>
                <strong>Fechas:</strong> {formatoFecha(checkin)} al {formatoFecha(checkout)}
              </div>
            )}
            {destino && (
              <div>
                <strong>Destino:</strong> {destino}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            padding: '20px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onVerDisponibles}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: '#006ce4',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Ver alojamientos disponibles en {destino || 'este destino'}
          </button>
          <button
            type="button"
            onClick={onCambiarFechas}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              color: '#006ce4',
              border: '1px solid #006ce4',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Cambiar fechas o volver
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
