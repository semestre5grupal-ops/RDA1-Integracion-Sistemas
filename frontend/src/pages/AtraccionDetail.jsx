import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAtraccion, reservarAtraccion } from '../services/atraccionesApi';
import { v4 as uuidv4 } from 'uuid';

export function AtraccionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [atraccion, setAtraccion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBooking, setIsBooking] = useState(false);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    ticket_count: 1,
    customer_name: '',
    customer_email: ''
  });

  const [bookingResult, setBookingResult] = useState(null);

  useEffect(() => {
    async function fetchDetalle() {
      try {
        const data = await getAtraccion(id);
        setAtraccion(data);
      } catch (err) {
        setError('No se pudo cargar la atracción.');
      } finally {
        setLoading(false);
      }
    }
    fetchDetalle();
  }, [id]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    setIsBooking(true);
    setBookingResult(null);

    const idempotencyKey = uuidv4();
    try {
      const result = await reservarAtraccion(id, {
        ...form,
        ticket_count: parseInt(form.ticket_count)
      }, idempotencyKey);
      
      setBookingResult({ success: true, data: result });
    } catch (err) {
      setBookingResult({ 
        success: false, 
        error: err.response?.data?.detail || err.message 
      });
    } finally {
      setIsBooking(false);
    }
  };

  if (loading) return <div className="state-container"><div className="spinner" /></div>;
  if (error) return <div className="state-container"><div className="error-icon">⚠️</div><p className="state-subtitle">{error}</p><button className="retry-btn" onClick={() => navigate('/')}>Volver</button></div>;
  if (!atraccion) return null;

  const precio = parseFloat(atraccion.precio_unitario || atraccion.price?.total || atraccion.precioTicket || 0);

  return (
    <main className="main-content">
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: 'var(--booking-blue)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ← Volver a Atracciones
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px', alignItems: 'start' }}>
        {/* Lado Izquierdo: Detalle */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: 'var(--card-shadow)' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
            {atraccion.nombre || atraccion.name || 'Atracción'}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
            {atraccion.descripcion || atraccion.long_description}
          </p>
          
          {atraccion.includes && (
            <div style={{ marginBottom: 24 }}>
              <h3>Incluye:</h3>
              <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                {atraccion.includes.map((inc, idx) => <li key={idx}>{inc}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--booking-blue)' }}>
                ${precio.toFixed(2)}
              </div>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>por persona</div>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Checkout */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: 'var(--card-shadow)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 16 }}>Reserva ahora</h2>
          
          {bookingResult?.success ? (
            <div style={{ background: '#e6f4ea', color: '#137333', padding: 16, borderRadius: 8 }}>
              <h3 style={{ marginBottom: 8 }}>¡Reserva Confirmada! 🎉</h3>
              <p>ID: {bookingResult.data.reservation_id}</p>
              <p>Total pagado: ${bookingResult.data.total_price?.total}</p>
            </div>
          ) : (
            <form onSubmit={handleBooking} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Fecha</label>
                <input required type="date" name="date" value={form.date} onChange={handleChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Hora</label>
                <input required type="time" name="time" value={form.time} onChange={handleChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Cantidad de tickets</label>
                <input required type="number" min="1" max="20" name="ticket_count" value={form.ticket_count} onChange={handleChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nombre Completo</label>
                <input required type="text" name="customer_name" value={form.customer_name} onChange={handleChange} placeholder="Ej. Juan Pérez" style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email</label>
                <input required type="email" name="customer_email" value={form.customer_email} onChange={handleChange} placeholder="juan@ejemplo.com" style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              {bookingResult?.error && (
                <div style={{ color: 'red', fontSize: '0.9rem' }}>{bookingResult.error}</div>
              )}

              <button type="submit" disabled={isBooking} className="card-btn" style={{ padding: '12px', fontSize: '1.1rem', marginTop: 8 }}>
                {isBooking ? 'Procesando pago...' : `Pagar $${(precio * form.ticket_count).toFixed(2)}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
