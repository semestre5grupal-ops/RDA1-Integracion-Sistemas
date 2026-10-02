import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getAlojamiento, reservarAlojamiento, getDisponibilidadAlojamiento } from '../services/alojamientosApi';
import { useAuth } from '../hooks/useAuth';
import { v4 as uuidv4 } from 'uuid';

export function AlojamientoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [alojamiento, setAlojamiento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Formulario de Reserva
  const [checkin, setCheckin] = useState('2026-10-10');
  const [checkout, setCheckout] = useState('2026-10-15');
  const [habitaciones, setHabitaciones] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  // Autocompletar datos del usuario si ha iniciado sesión
  useEffect(() => {
    if (user) {
      if (!customerName) {
        setCustomerName(user.user_metadata?.nombre || user.email?.split('@')[0] || '');
      }
      if (!customerEmail) {
        setCustomerEmail(user.email || '');
      }
    }
  }, [user]);


  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAlojamiento(id);
        setAlojamiento(data);
      } catch (err) {
        setError('No se pudo encontrar el alojamiento seleccionado.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  // Cálculo de noches
  const date1 = new Date(checkin);
  const date2 = new Date(checkout);
  const diffTime = Math.max(86400000, date2 - date1);
  const nights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

  const precioNoche = parseFloat(alojamiento?.precioPorNoche || alojamiento?.price?.total || 120);
  const totalEstimado = precioNoche * nights * habitaciones;

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setBookingError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!customerEmail.trim()) {
      setBookingError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setBookingLoading(true);
    setBookingError(null);
    setBookingSuccess(null);

    const idempotencyKey = uuidv4();
    const payload = {
      checkin,
      checkout,
      habitaciones_count: parseInt(habitaciones, 10),
      nights,
      customer_name: customerName,
      customer_email: customerEmail,
    };

    try {
      const res = await reservarAlojamiento(id, payload, idempotencyKey);
      setBookingSuccess({
        reservationId: res.reservation_id || res.id,
        status: res.status || 'CONFIRMED',
        totalPrice: res.total_price?.total || totalEstimado,
        links: res._links,
      });
    } catch (err) {
      if (err.response?.status === 409) {
        setBookingError('Conflicto de Idempotencia: Esta reserva ya fue procesada anteriormente.');
      } else {
        setBookingError(err.response?.data?.message || 'Error al procesar la reserva. Intenta de nuevo.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0', color: '#003580' }}>
        <h2>Cargando detalle del alojamiento...</h2>
      </div>
    );
  }

  if (error || !alojamiento) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px', background: '#fee2e2', borderRadius: '8px' }}>
        <h3>Error</h3>
        <p>{error || 'Alojamiento no disponible'}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: '16px', padding: '8px 16px', background: '#003580', color: '#fff', border: 'none', borderRadius: '4px' }}>
          Volver a Alojamientos
        </button>
      </div>
    );
  }

  const fotoPrincipal = alojamiento.photos?.[0]?.url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'none',
          border: 'none',
          color: '#0071c2',
          cursor: 'pointer',
          fontWeight: 600,
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        ← Volver a todos los alojamientos
      </button>

      {/* HEADER DEL HOTEL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <span style={{ fontSize: '0.8rem', background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
            HOTEL / RESORT
          </span>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', margin: '8px 0 4px' }}>
            {alojamiento.nombre}
          </h1>
          <p style={{ color: '#4b5563', fontSize: '0.95rem' }}>
            📍 {alojamiento.destino} • Excelente ubicación en el centro turístico
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: '#111827' }}>Excelente</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>240 comentarios verificados</div>
          </div>
          <div style={{ background: '#003580', color: '#fff', fontWeight: 800, fontSize: '1.2rem', padding: '8px 12px', borderRadius: '6px' }}>
            8.9
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL: FOTO + FORMULARIO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '28px', alignItems: 'start' }}>
        {/* COLUMNA IZQUIERDA: FOTOS Y DESCRIPCIÓN */}
        <div>
          <div style={{ height: '380px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
            <img
              src={fotoPrincipal}
              alt={alojamiento.nombre}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '12px', color: '#111827' }}>
              Acerca de este alojamiento
            </h2>
            <p style={{ color: '#4b5563', lineHeight: '1.6', fontSize: '0.95rem' }}>
              {alojamiento.descripcion || 'Disfruta de una estancia inolvidable en este alojamiento de primera categoría. Cuenta con habitaciones completamente equipadas, aire acondicionado, WiFi de alta velocidad y atención personalizada las 24 horas.'}
            </p>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '20px', marginBottom: '12px', color: '#111827' }}>
              Servicios e instalaciones más populares
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.9rem', color: '#374151' }}>
              <div>✓ WiFi gratis de alta velocidad</div>
              <div>✓ Recepción 24 horas</div>
              <div>{alojamiento.tienePiscina ? '🏊 Piscina al aire libre' : '✓ Zona de estar y terraza'}</div>
              <div>👥 Capacidad hasta {alojamiento.capacidadAdultos || 2} adultos</div>
              <div>🛏️ {alojamiento.habitaciones || 1} Habitación(es) privada(s)</div>
              <div>✓ Aire acondicionado independiente</div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: FORMULARIO DE RESERVA / CHECKOUT BOOKING */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '2px solid #003580', boxShadow: '0 8px 24px rgba(0,53,128,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#003580' }}>
                ${precioNoche.toFixed(2)}
              </span>
              <span style={{ color: '#6b7280', fontSize: '0.9rem' }}> / noche</span>
            </div>
            <span style={{ fontSize: '0.8rem', background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
              ✓ Precio Garantizado
            </span>
          </div>

          {bookingSuccess ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ color: '#065f46', fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>
                ¡Reserva Confirmada Exitosamente! 🎉
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#047857', marginBottom: '8px' }}>
                Tu reserva ha sido registrada en el sistema de Alojamientos.
              </p>
              <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#111827', margin: '12px 0' }}>
                <div><strong>ID de Reserva:</strong> {bookingSuccess.reservationId}</div>
                <div><strong>Estado:</strong> <span style={{ color: '#059669', fontWeight: 700 }}>{bookingSuccess.status}</span></div>
                <div><strong>Total:</strong> ${bookingSuccess.totalPrice} USD</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => setBookingSuccess(null)}
                  style={{ flex: 1, padding: '10px', background: '#f3f4f6', color: '#1f2937', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Nueva reserva
                </button>
                <Link
                  to="/mis-reservas"
                  style={{ flex: 1, padding: '10px', background: '#003580', color: '#fff', textAlign: 'center', textDecoration: 'none', borderRadius: '6px', fontWeight: 700 }}
                >
                  Ver mis reservas
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBooking}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', color: '#111827' }}>
                Detalles de tu estadía
              </h3>

              {bookingError && (
                <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
                  {bookingError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Check-in
                  </label>
                  <input
                    type="date"
                    value={checkin}
                    onChange={(e) => setCheckin(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Check-out
                  </label>
                  <input
                    type="date"
                    value={checkout}
                    onChange={(e) => setCheckout(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Número de habitaciones
                </label>
                <select
                  value={habitaciones}
                  onChange={(e) => setHabitaciones(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                >
                  <option value={1}>1 Habitación</option>
                  <option value={2}>2 Habitaciones</option>
                  <option value={3}>3 Habitaciones</option>
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Nombre completo del huésped
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="huesped@ejemplo.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>

              {/* DESGLOSE DE PRECIOS */}
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '6px', marginBottom: '18px', fontSize: '0.85rem', color: '#4b5563' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>${precioNoche} x {nights} noche(s) x {habitaciones} hab:</span>
                  <span>${totalEstimado.toFixed(2)} USD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#111827', borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '6px', fontSize: '0.95rem' }}>
                  <span>Total a confirmar:</span>
                  <span style={{ color: '#003580' }}>${totalEstimado.toFixed(2)} USD</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={bookingLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#0071c2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: bookingLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {bookingLoading ? 'Confirmando reserva...' : 'Reservar Ahora'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.75rem', color: '#6b7280' }}>
                🔒 Operación protegida mediante cabecera <code>Idempotency-Key</code>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
