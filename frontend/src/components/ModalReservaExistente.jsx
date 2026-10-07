import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * Aviso de "ya tienes una reserva para estas fechas", como en Booking.com.
 *
 * Booking NO impide reservar si ya tienes otra reserva que coincide en fechas:
 * hay motivos legítimos (otra habitación para la familia, un viaje con dos
 * ciudades, reservar para otra persona). Lo que hace es AVISAR y dejar decidir:
 * - Si la reserva previa es en el MISMO alojamiento, advierte de un posible
 *   duplicado ("¿quieres hacer otra reserva?").
 * - Si es en OTRO alojamiento, recuerda que esas noches ya tienen alojamiento.
 * En ambos casos el usuario puede continuar, volver o revisar sus reservas.
 *
 * Accesibilidad: `role="alertdialog"` (pide una decisión), foco atrapado y
 * Escape = "No, volver".
 */
const formatoFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export function ModalReservaExistente({
  abierto,
  reservas = [],
  alojamientoActualId,
  nombreAlojamientoActual,
  checkin,
  checkout,
  mensajeServidor,
  onContinuar,
  onCancelar,
  onVerReservas,
}) {
  const ref = useRef(null);
  const idTitulo = useId();
  const idDesc = useId();
  useFocusTrap(abierto, onCancelar, ref);

  if (!abierto) return null;

  const mismoAlojamiento = reservas.some(
    (r) => (r.alojamientoId || r.alojamiento_id) === alojamientoActualId,
  ) || (reservas.length === 0 && Boolean(mensajeServidor));

  const titulo = mismoAlojamiento
    ? 'Ya tienes una reserva en este alojamiento'
    : 'Ya tienes una reserva para estas fechas';

  // Portal a <body>: dentro de la página el modal quedaba atrapado en el contexto
  // de apilamiento de su contenedor y el banner de cookies se le ponía encima.
  return createPortal(
    <div
      onClick={onCancelar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: 16 }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDesc}
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', fontFamily: 'inherit' }}
      >
        <div style={{ padding: '20px 24px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: '#fff4e5', color: '#c75000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
            !
          </span>
          <div>
            <h2 id={idTitulo} style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1a1a1a' }}>
              {titulo}
            </h2>
            <p id={idDesc} style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#474747', lineHeight: 1.45 }}>
              {mismoAlojamiento
                ? `¿Quieres hacer otra reserva en ${nombreAlojamientoActual || 'este alojamiento'}? Si solo querías revisar la que ya tienes, no hace falta reservar de nuevo.`
                : 'Estas noches coinciden con una reserva que ya tienes. Puedes continuar si necesitas otro alojamiento (por ejemplo, para otra persona).'}
            </p>
          </div>
        </div>

        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#474747', marginBottom: 8 }}>
            Tu nueva estancia: {formatoFecha(checkin)} — {formatoFecha(checkout)}
          </div>

          {reservas.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reservas.map((r) => {
                const esMismo = (r.alojamientoId || r.alojamiento_id) === alojamientoActualId;
                return (
                  <li key={r.id || r.codigoReserva} style={{ border: `1px solid ${esMismo ? '#f5b942' : '#e7e7e7'}`, background: esMismo ? '#fffbeb' : '#fafafa', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.95rem' }}>
                      {r.nombreAlojamiento || r.nombre_alojamiento || 'Alojamiento'}
                      {esMismo && <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: '#92400e', background: '#fde68a', borderRadius: 4, padding: '2px 6px' }}>Mismo alojamiento</span>}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#595959', marginTop: 2 }}>
                      {r.destino ? `${r.destino} · ` : ''}{formatoFecha(r.checkin)} — {formatoFecha(r.checkout)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#595959', marginTop: 2 }}>
                      Código: <strong>{r.codigoReserva || r.reservationId || r.id}</strong>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            mensajeServidor && (
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#92400e', background: '#fffbeb', border: '1px solid #f5b942', borderRadius: 8, padding: '10px 12px' }}>
                {mensajeServidor}
              </p>
            )
          )}
        </div>

        <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onContinuar}
            style={{ background: '#006ce4', color: '#fff', border: 'none', borderRadius: 6, padding: '12px 16px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', minHeight: 44 }}
          >
            {mismoAlojamiento ? 'Sí, hacer otra reserva' : 'Sí, continuar con la reserva'}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            style={{ background: '#fff', color: '#006ce4', border: '1px solid #006ce4', borderRadius: 6, padding: '11px 16px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', minHeight: 44 }}
          >
            No, volver
          </button>
          {onVerReservas && (
            <button
              type="button"
              onClick={onVerReservas}
              style={{ background: 'none', border: 'none', color: '#006ce4', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 6 }}
            >
              Ver mis reservas
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Reservas activas guardadas en este navegador que se solapan con [checkin, checkout)
 * en CUALQUIER alojamiento. Dos estancias se solapan si una empieza antes de que
 * termine la otra (salir el día 13 y entrar el 13 no es solape).
 */
export function reservasQueSeSolapan(checkin, checkout) {
  if (!checkin || !checkout) return [];
  try {
    const reservas = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
    return reservas.filter(
      (r) =>
        r && r.checkin && r.checkout &&
        !['CANCELLED', 'Cancelada', 'FALLIDA'].includes(r.status) &&
        r.checkin < checkout && r.checkout > checkin,
    );
  } catch {
    return [];
  }
}

/** `true` si el 409 del backend es el aviso de posible duplicado (y no un conflicto de idempotencia). */
export function esAvisoDuplicado(err) {
  const data = err?.response?.data;
  return err?.response?.status === 409 &&
    Array.isArray(data?.invalidParams) &&
    data.invalidParams.some((p) => p.name === 'confirmar_duplicado');
}
