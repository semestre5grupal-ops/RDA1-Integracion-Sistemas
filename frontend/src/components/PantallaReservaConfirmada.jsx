import { useEffect, useState } from 'react';
import { formatearFecha, formatearMoneda, extraerHora } from '../services/formato';
import { listarTickets } from '../services/vuelosApi';
import { CheckmarkIcon } from './BookingIcons';

/** `HH:mm` en hora de Ecuador, sin romper la pantalla si viene vacío o raro. */
function horaDe(valor) {
  const h = extraerHora(valor);
  return h === '--' ? '--:--' : h;
}

export function PantallaReservaConfirmada({ reserva, onVolver }) {
  const [tickets, setTickets] = useState(reserva?.tickets ?? []);

  useEffect(() => {
    document.title = `Reserva ${reserva?.pnr ?? ''} confirmada · Booking Prototipo`;
    return () => {
      document.title = 'Booking Prototipo';
    };
  }, [reserva?.pnr]);

  useEffect(() => {
    if (reserva?.bookingId && (!reserva.tickets || reserva.tickets.length === 0)) {
      listarTickets(reserva.bookingId)
        .then((data) => {
          if (data && data.tickets) {
            setTickets(data.tickets);
          }
        })
        .catch((err) => console.error('Error cargando tickets:', err));
    }
  }, [reserva?.bookingId, reserva?.tickets]);

  if (!reserva) return null;

  const iterarios = reserva.itineraries ?? [];

  return (
    <main className="main-content main-content-vuelos" style={{ padding: '32px 16px', background: '#f5f5f5', minHeight: '80vh' }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: '#ffffff',
        border: '1px solid #e7e7e7',
        borderRadius: '8px',
        padding: '32px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif"
      }}>

        {/* Banner offline */}
        {reserva.offline && (
          <div style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#856404' }}>
                Reserva guardada sin conexión
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#856404' }}>
                Tu reserva se sincronizará automáticamente cuando recuperes la conexión a internet. Guarda tu código de referencia.
              </p>
            </div>
          </div>
        )}

        {/* Cabecera minimalista */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#ecfdf5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <CheckmarkIcon size={26} color="#059669" />
          </div>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: '#1a1a1a' }}>
              {reserva.offline ? 'Guardado sin conexión' : '¡Tu reserva de vuelo está confirmada!'}
            </h1>
            <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
              {reserva.offline
                ? 'La confirmación se enviará a tu correo cuando se restaure la conexión. Guarda tu código PNR.'
                : 'Guarda tu código PNR: es lo que necesitas para presentarte en el aeropuerto.'}
            </p>
          </div>
        </div>

        {/* Caja de Localizador PNR */}
        <div style={{
          background: '#f8fafc',
          border: '1px dashed #cbd5e1',
          borderRadius: '6px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', display: 'block' }}>
              Código de reserva (PNR)
            </span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#003580', letterSpacing: '1px', marginTop: '2px' }}>
              {reserva.pnr}
            </div>
            {!reserva.offline ? (
              <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                Estado: <strong>{reserva.status}</strong> · Reservado el {formatearFecha(reserva.createdAt?.slice(0, 10))}
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                Estado: PENDIENTE DE SINCRONIZACIÓN
              </span>
            )}
          </div>
          <div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#008009' }}>
              {formatearMoneda(reserva.bookingPrice?.total ?? reserva.grandTotal?.total, reserva.grandTotal?.currency)}{' '}
              {reserva.grandTotal?.currency}
            </span>
          </div>
        </div>

        {/* Itinerario reservado */}
        {iterarios.length > 0 && (
          <div style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: '6px', padding: '18px 20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', margin: '0 0 14px 0', letterSpacing: '0.5px' }}>
              Itinerario reservado
            </h2>
            {iterarios.map((itin) => (
              <ol className="vuelo-segmentos" key={itin.itineraryId} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(itin.segments ?? []).map((seg) => (
                  <li key={seg.segmentId} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', padding: '6px 0', color: '#1a1a1a', flexWrap: 'wrap' }}>
                    <strong>{horaDe(seg.departureAt ?? seg.departure?.at)}</strong>
                    <span style={{ color: '#003580', fontWeight: 700 }}>{seg.departureIataCode ?? seg.departure?.iataCode}</span>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <strong>{horaDe(seg.arrivalAt ?? seg.arrival?.at)}</strong>
                    <span style={{ color: '#003580', fontWeight: 700 }}>{seg.arrivalIataCode ?? seg.arrival?.iataCode}</span>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>· Vuelo {seg.flightNumber}</span>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        )}

        {/* Pasajeros */}
        <div style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: '6px', padding: '18px 20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', margin: '0 0 14px 0', letterSpacing: '0.5px' }}>
            Pasajeros ({reserva.passengers?.length ?? 0})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {(reserva.passengers ?? []).map((p) => (
              <div key={p.passengerId} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>
                  {p.firstName} {p.lastName}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {p.documentType === 'PASSPORT' ? 'Pasaporte' : 'Cédula'} {p.documentNumber} · {p.nationality}
                </div>
                {p.contact?.email && (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {p.contact.email}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Billetes emitidos */}
        {tickets.length > 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: '6px', padding: '18px 20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', margin: '0 0 14px 0', letterSpacing: '0.5px' }}>
              Billetes electrónicos emitidos
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {tickets.map((t) => {
                const pasajero = reserva.passengers?.find((p) => p.passengerId === t.passengerId);
                return (
                  <div key={t.ticketId} style={{ fontSize: '13px', color: '#334155' }}>
                    <div><strong>Billete:</strong> {t.ticketId}</div>
                    <div style={{ color: '#64748b' }}>Pasajero: {pasajero ? `${pasajero.firstName} ${pasajero.lastName}` : t.passengerId}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#64748b', background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            {reserva.status === 'CONFIRMED'
              ? 'Los billetes electrónicos se están procesando...'
              : 'Los billetes aparecerán aquí en cuanto se complete la emisión en la aerolínea.'}
          </div>
        )}

        {/* Botón de acción */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', paddingTop: '20px' }}>
          <button
            type="button"
            onClick={onVolver}
            style={{
              background: '#006ce4',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Buscar otro vuelo
          </button>
        </div>

      </div>
    </main>
  );
}

