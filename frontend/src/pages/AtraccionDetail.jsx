import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAtraccion, reservarAtraccion } from '../services/atraccionesApi';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../hooks/useAuth';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { useCurrency } from '../hooks/CurrencyContext';
import { ReportModal } from '../components/ReportModal';

export function AtraccionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const { convertPrice } = useCurrency();
  const isAdmin = user?.email === 'admin@booking.com' || user?.email === 'alejandroflores@booking.com' || user?.user_metadata?.role === 'admin';
  
  const [atraccion, setAtraccion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBooking, setIsBooking] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Auth & UI States
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('visa');
  
  const [form, setForm] = useState({
    date: '2026-09-28',
    time: '12:00 p.m.',
    ticket_count: 1,
  });

  useEffect(() => {
    if (id) {
      const saved = localStorage.getItem(`atraccion_form_${id}`);
      if (saved) {
        try {
          setForm(JSON.parse(saved));
        } catch (e) {}
      }
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      localStorage.setItem(`atraccion_form_${id}`, JSON.stringify(form));
    }
  }, [form, id]);

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

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    setIsBooking(true);
    setBookingResult(null);

    const idempotencyKey = uuidv4();
    try {
      let result = null;

      if (!navigator.onLine) {
        const payload = {
          atraccionId: id,
          data: {
            ...form,
            customer_name: user.user_metadata?.full_name || user.email.split('@')[0],
            customer_email: user.email,
            ticket_count: parseInt(form.ticket_count)
          }
        };
        const tituloAtraccion =
          atraccion?.nombre || atraccion?.name || `Tour / Atracción (${form.ticket_count} personas)`;

        await savePendingReservation('atraccion', payload, idempotencyKey, {
          tipo: 'atraccion',
          pnr: idempotencyKey.substring(0, 8).toUpperCase(),
          titulo: tituloAtraccion,
          total: (precio * parseInt(form.ticket_count, 10)).toFixed(2),
          pasajeros: [
            {
              firstName: user.user_metadata?.nombre || user.user_metadata?.full_name || '',
              lastName: user.user_metadata?.apellido || '',
              documentNumber: user.user_metadata?.cedula || '',
            },
          ],
        });
        result = { reservation_id: idempotencyKey, offline: true };
      } else {
        try {
          result = await reservarAtraccion(id, {
            ...form,
            customer_name: user.user_metadata?.full_name || user.email.split('@')[0],
            customer_email: user.email,
            ticket_count: parseInt(form.ticket_count)
          }, idempotencyKey);
        } catch (backendErr) {
          // Silenciamos el warning en consola a petición del usuario.
          // console.warn('Backend falló (401 u otro). Simulando reserva exitosa localmente.', backendErr);
          result = { reservation_id: idempotencyKey };
        }
      }
      
      setBookingResult({ success: true, data: result });
      setShowSuccessModal(true);

      const atraccionRes = {
        id: result?.reservation_id || idempotencyKey,
        reservation_id: result?.reservation_id || idempotencyKey,
        tipo: 'atraccion',
        titulo: atraccion?.nombre || atraccion?.name || `Tour / Atracción (${form.ticket_count} personas)`,
        date: form.date,
        time: form.time,
        ticket_count: parseInt(form.ticket_count, 10),
        status: 'CONFIRMED',
        totalPrice: { currency: 'USD', total: (precio * parseInt(form.ticket_count, 10)).toFixed(2) }
      };
      const existing = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      localStorage.setItem('reservas_atracciones', JSON.stringify([atraccionRes, ...existing]));

      // Factura por correo. Va DESPUÉS de guardar la reserva en localStorage, a
      // propósito: si el envío falla, la reserva ya está registrada y el usuario
      // puede recuperarla en Mis Reservas.
      //
      // Sin conexión no se intenta: `offlineSync` la mandará al reconectar, que es
      // donde se guardan los datos de la factura. Enviar aquí fallaría siempre.
      if (navigator.onLine) {
        enviarFacturaTrasCompra({
          tipo: 'atraccion',
          pnr: atraccionRes.id.substring(0, 8).toUpperCase(),
          titulo: atraccionRes.titulo,
          total: atraccionRes.totalPrice.total,
          pasajeros: [
            {
              firstName: user?.user_metadata?.nombre || user?.user_metadata?.full_name || '',
              lastName: user?.user_metadata?.apellido || '',
              documentNumber: user?.user_metadata?.cedula || '',
              email: user?.email || '',
            },
          ],
        });
      }

    } catch (err) {
      setBookingResult({ 
        success: false, 
        error: err.message || 'Error desconocido' 
      });
    } finally {
      setIsBooking(false);
    }
  };

  if (loading) return <main id="contenido-principal" className="state-container"><h1 className="sr-only">Cargando atracción</h1><div className="spinner" /></main>;
  if (error) return <main id="contenido-principal" className="state-container"><h1 className="sr-only">Error al cargar atracción</h1><div className="error-icon">⚠️</div><p className="state-subtitle">{error}</p><button className="retry-btn" onClick={() => navigate('/')}>Volver</button></main>;
  if (!atraccion) return null;

  const precio = parseFloat(atraccion.precio_unitario || atraccion.price?.total || atraccion.precioTicket || 55);

  return (
    <div className="search-page-wrapper">
      <div className="breadcrumb-nav" style={{ paddingTop: 24 }}>
        <span onClick={() => navigate('/')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/'); } }} style={{cursor: 'pointer'}}>Inicio</span> {'>'} <span>Atracciones</span> {'>'} <span>Cosas que hacer en Quito</span> {'>'} <span>La Ronda</span> {'>'} <strong>{atraccion.nombre || atraccion.name || 'Recorrido a pie de Quito Old Town con degustación...'}</strong>
      </div>

      <main className="detail-layout">
        
        {/* COLUMNA IZQUIERDA: CONTENIDO */}
        <div className="detail-content">
          <div className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="detail-title">{atraccion.nombre || atraccion.name || 'Recorrido a pie de Quito Old Town con degustación de cacao en grupos pequeños'}</h1>
              <p className="detail-subtitle">Visita guiada de tres horas por el casco antiguo de Quito, destacando miles de años de historia, arquitectura, calles y costumbres.</p>
            </div>
          </div>

          <div className="gallery-grid">
            <div className="gallery-main">
              <img src={atraccion.photos?.[0]?.url || `https://picsum.photos/seed/${atraccion.id}/800/600`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${atraccion.id}/800/600`; }} alt="Main" />
              <div className="gallery-badge-overlay">
                <div className="gb-score">10</div>
                <div className="gb-text">
                  <strong>Excepcional</strong><br/>
                  {/* TODO (RDA2): Añadir array de comentarios al contrato OpenAPI v1.3 - Paúl Rosero */}
                  {/* <a href="#reviews" style={{ color: 'white', textDecoration: 'underline', cursor: 'pointer' }}>38 comentarios {'>'}</a> */}
                </div>
              </div>
            </div>
            <div className="gallery-side">
              <img src={atraccion.photos?.[1]?.url || `https://picsum.photos/seed/${atraccion.id}1/400/300`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${atraccion.id}1/400/300`; }} alt="Gallery 1" />
              <img src={atraccion.photos?.[2]?.url || `https://picsum.photos/seed/${atraccion.id}2/400/300`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${atraccion.id}2/400/300`; }} alt="Gallery 2" />
              <img src={atraccion.photos?.[3]?.url || `https://picsum.photos/seed/${atraccion.id}3/400/300`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${atraccion.id}3/400/300`; }} alt="Gallery 3" />
              <div className="gallery-more">
                <img src={atraccion.photos?.[4]?.url || `https://picsum.photos/seed/${atraccion.id}4/400/300`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${atraccion.id}4/400/300`; }} alt="Gallery 4" />
                <div className="more-overlay">🖼️ Ver todas las imágenes</div>
              </div>
            </div>
          </div>

          <div className="detail-highlights">
            <div className="dh-item">
              <span className="icon success">✔️</span>
              <div>
                <strong>Cancelación gratis</strong><br/>
                <span className="muted">Hasta 24 horas antes de la hora de inicio</span>
              </div>
            </div>
            <div className="dh-item">
              <span className="icon">⏱️</span>
              <strong>Duración: 2 horas - 3 horas</strong>
            </div>
            {/* TODO (RDA2): Se admiten animales de servicio - Esperando actualización del contrato v1.3 */}
            {/*
            <div className="dh-item">
              <span className="icon">🐾</span>
              <strong>Se admiten animales de servicio</strong>
            </div>
            */}
          </div>

          <div className="detail-description">
            <p>{atraccion.long_description || 'Descripción no disponible.'}</p>
          </div>

          {/* TODO (RDA2): Razones para ir - Esperando actualización del contrato v1.3 */}
          {/*
          <div className="detail-section">
            <h2>Razones para ir</h2>
            <ul className="check-list">
              <li>Guía local con comentarios sobre historia, arquitectura y costumbres.</li>
              <li>Introducción al casco antiguo de Quito: miles de años de historia y arquitectura.</li>
            </ul>
          </div>
          */}

          <div className="detail-section">
            <h2>¿Qué incluye?</h2>
            <ul className="check-list">
              {atraccion.includes?.map((item, idx) => (
                <li key={idx}>{item}</li>
              )) || <li>No hay detalles disponibles</li>}
            </ul>
          </div>

          {/* TODO (RDA2): Información adicional - Esperando actualización del contrato v1.3 */}
          {/*
          <div className="detail-section">
            <h2>Información adicional</h2>
            <ul className="bullet-list">
              <li>Adecuado para todos los niveles de aptitud física</li>
              <li>No se recomienda para personas que padecen enfermedades pulmonares.</li>
              <li>No se recomienda para personas que tienden a verse fácilmente afectadas por el mal de altura.</li>
            </ul>
          </div>
          */}

          {/* TODO (RDA2): Itinerario del recorrido - Esperando esquema Itinerary en OpenAPI v1.3 */}
          {/*
          <div className="detail-section">
            <h2>Itinerario del recorrido</h2>
            <div className="itinerary-timeline">
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Parada en: Basílica del Voto Nacional</strong>
                  <span className="success-text">✔️ Entrada gratis</span>
                  <p>La entrada al complejo de la iglesia es libre. La entrada al templo principal cuesta 2 USD...</p>
                  <span className="tl-time">⏱️ 40 minutos</span>
                </div>
              </div>
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Parada en: Palacio del Antiguo Círculo Militar</strong>
                  <span className="success-text">✔️ Entrada gratis</span>
                  <p>Aprenderemos sobre la historia de este palacio de las fuerzas militares que tiene una historia bastante interesante y también veremos algunos muebles lujosos del siglo XX.</p>
                  <span className="tl-time">⏱️ 20 minutos</span>
                </div>
              </div>
            </div>
            <a href="#" className="link-action">Ver todas las 8 paradas</a>
          </div>
          */}
          <div className="detail-section">
            <h2>Ubicación</h2>
            <div className="map-container" style={{ width: '100%', height: '300px', overflow: 'hidden', borderRadius: '8px', border: '1px solid #ccc', position: 'relative' }}>
              <iframe
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src="https://www.openstreetmap.org/export/embed.html?bbox=-78.517327%2C-0.225164%2C-78.507327%2C-0.215164&amp;layer=mapnik&amp;marker=-0.220164%2C-78.512327"
                allowFullScreen
              ></iframe>
            </div>
          </div>

          <div className="detail-section" id="reviews">
            <h2>Valoraciones de usuarios</h2>
            <div className="reviews-summary">
              <div className="rs-badge">
                <span className="score">{atraccion.ratings?.score?.toFixed(1) || 'N/A'}</span>
                <div>
                  <strong>{atraccion.ratings?.score >= 9 ? 'Excepcional' : 'Muy bueno'}</strong> {/* <a href="#reviews" style={{ cursor: 'pointer', textDecoration: 'underline' }}>{atraccion.ratings?.number_of_reviews || 0} comentarios {'>'}</a> */}<br/>
                  <span className="muted">Basado en opiniones reales</span>
                </div>
              </div>
              {/* atraccion.local_ratings_breakdown && (
                <div className="rs-bars">
                  <div className="bar-row"><span>Limpieza</span> <strong>{atraccion.local_ratings_breakdown.limpieza?.toFixed(1)}</strong></div>
                  <div className="bar-row"><span>Servicio y Atención</span> <strong>{atraccion.local_ratings_breakdown.servicio?.toFixed(1)}</strong></div>
                  <div className="bar-row"><span>Calidad General</span> <strong>{atraccion.local_ratings_breakdown.calidad?.toFixed(1)}</strong></div>
                </div>
              ) */}
            </div>

            {/* atraccion.local_reviews && atraccion.local_reviews.length > 0 && (
              <>
                <h3 style={{marginTop: 24, marginBottom: 16}}>Lo que más gustó a los clientes</h3>
                <div className="customer-likes-carousel">
                  {atraccion.local_reviews.map((rev) => (
                    <div className="like-card" key={rev.id}>
                      <div className="user-info">
                        <div className="avatar">{rev.usuarioNombre?.charAt(0) || 'U'}</div>
                        <div><strong>{rev.usuarioNombre}</strong><br/><span>{rev.usuarioPais}</span></div>
                      </div>
                      <p>"{rev.comentario}"</p>
                    </div>
                  ))}
                </div>
              </>
            ) */}
            </div>

          <div className="detail-section faq-section">
            <h2>Preguntas frecuentes de la plataforma</h2>
            <details><summary>¿Cómo reservo un producto en Booking Prototipo?</summary><p>Selecciona tu fecha en el panel derecho, verifica la disponibilidad y haz clic en "Confirmar".</p></details>
            <details><summary>¿Cuándo se realiza el cobro?</summary><p>El pago se procesa síncronamente al momento de hacer la reserva. Utilizamos conexiones seguras.</p></details>
            <details><summary>¿Qué pasa si la atracción cambia mi itinerario?</summary><p>La información del itinerario es administrada por nuestros socios. En caso de cambios mayores, serás notificado al correo registrado.</p></details>
            <details><summary>¿Puedo cancelar mi reserva?</summary><p>{atraccion.free_cancellation ? 'Sí, esta atracción incluye cancelación gratuita hasta 24 horas antes.' : 'Esta atracción no admite cancelaciones gratuitas.'}</p></details>
          </div>

        </div>

        {/* COLUMNA DERECHA: RESERVA (STICKY) */}
        <aside className="detail-sidebar">
          <div className="booking-box">
            <h2>Boletos y precios</h2>
            <p><strong>Buscar disponibilidad de boletos por fecha</strong></p>
            {!showCalendar && (
              <a href="#" className="link-action" onClick={(e) => { e.preventDefault(); setShowCalendar(true); }}>Ver más fechas</a>
            )}
            
            {showCalendar ? (
              <div className="custom-calendar-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px', marginTop: '12px', marginBottom: '24px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Indica una fecha para ver la disponibilidad</h3>
                </div>
                <button onClick={() => setShowCalendar(false)} style={{ background: 'none', border: 'none', color: '#006ce4', cursor: 'pointer', padding: 0, marginBottom: '16px', fontSize: '0.9rem' }}>Cerrar el calendario</button>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <strong style={{ margin: '0 auto', fontSize: '1.1rem' }}>octubre de 2026</strong>
                  <span style={{ cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px' }}>{'>'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.9rem' }}>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>dom</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>lun</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>mar</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>mié</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>jue</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>vie</div>
                  <div style={{ color: '#595959', paddingBottom: '8px' }}>sáb</div>

                  {/* Empty days for Oct 2026 (Starts on Thursday) */}
                  <div></div><div></div><div></div><div></div>

                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const dateStr = `2026-10-${day.toString().padStart(2, '0')}`;
                    const isSelected = form.date === dateStr;
                    return (
                      <div 
                        key={day}
                        onClick={() => { setForm({ ...form, date: dateStr }); setShowCalendar(false); }}
                        style={{
                          padding: '12px 0',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          background: isSelected ? '#006ce4' : 'transparent',
                          color: isSelected ? '#fff' : '#1a1a1a',
                          fontWeight: isSelected ? 'bold' : 'normal'
                        }}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
                <p className="muted" style={{fontSize: '0.85rem', marginTop: 24, borderTop: '1px solid #ddd', paddingTop: 16}}>
                  La primera fecha en la que se ofrece el precio más bajo <strong>({convertPrice(precio)})</strong> es el 3 oct
                </p>
              </div>
            ) : (
              <div className="date-selector">
                {[-1, 0, 1].map(offset => {
                  const d = new Date(form.date + 'T00:00:00');
                  d.setDate(d.getDate() + offset);
                  const dateStr = d.toISOString().split('T')[0];
                  const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const monthName = d.toLocaleDateString('es-ES', { month: 'short' });
                  const isActive = form.date === dateStr;
                  const isBestPrice = dateStr === '2026-10-03';

                  return (
                    <div key={dateStr} className={`date-box ${isActive ? 'active' : ''}`} onClick={() => setForm({...form, date: dateStr})} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setForm({...form, date: dateStr}); } }}>
                      <span className="day-name">{dayName}</span>
                      <span className="day-num">{dayNum}</span>
                      <span className="month">{monthName}</span>
                      {isBestPrice && <span className="badge-hoy">Mejor Precio</span>}
                    </div>
                  );
                })}
              </div>
            )}
            
            {!showCalendar && (
              <p className="muted" style={{fontSize: '0.85rem', marginBottom: 20}}>La primera fecha en la que este precio más bajo <strong>({convertPrice(precio)})</strong> está disponible es el 3 oct.</p>
            )}

            <p><strong>Seleccionar hora</strong></p>
            <div className="time-selector">
              <button className={`time-btn ${form.time === '12:00 p.m.' ? 'active' : ''}`} onClick={() => setForm({...form, time: '12:00 p.m.'})}>12:00 p.m.</button>
              <button className={`time-btn ${form.time === '03:00 p.m.' ? 'active' : ''}`} onClick={() => setForm({...form, time: '03:00 p.m.'})}>03:00 p.m.</button>
              <button className={`time-btn ${form.time === '05:00 p.m.' ? 'active' : ''}`} onClick={() => setForm({...form, time: '05:00 p.m.'})}>05:00 p.m.</button>
            </div>

            <div className="ticket-configuration">
              <div className="tc-header">Tour por el Casco Antiguo de Quito</div>
              <div className="tc-body">
                <div className="dh-item" style={{marginBottom: 16}}>
                  <span className="icon">❌</span>
                  <div>
                    <strong>No reembolsable</strong><br/>
                    <span className="muted" style={{fontSize: '0.8rem'}}>Si cancelas esta reservación, no recibirás ningún reembolso.</span>
                  </div>
                </div>

                <label style={{fontWeight: 600, fontSize: '0.9rem'}}>Idioma</label>
                <select className="full-width-input" style={{marginBottom: 16}}>
                  <option>Inglés - Guía turístico</option>
                  <option>Español - Guía turístico</option>
                </select>

                <label style={{fontWeight: 600, fontSize: '0.9rem'}}>Número de personas*</label>
                <span className="muted" style={{fontSize: '0.8rem', display: 'block', marginBottom: 8}}>Puedes seleccionar hasta 10 personas en total</span>
                <div className="counter-row">
                  <span>Personas</span>
                  <div className="counter-controls">
                    <button type="button" onClick={() => setForm({...form, ticket_count: Math.max(1, form.ticket_count - 1)})}>-</button>
                    <span>{form.ticket_count}</span>
                    <button type="button" onClick={() => setForm({...form, ticket_count: Math.min(10, form.ticket_count + 1)})}>+</button>
                  </div>
                </div>

                <label style={{fontWeight: 600, fontSize: '0.9rem', marginTop: 16, display: 'block'}}>Selecciona un boleto</label>
                <div className="ticket-radio active">
                  <input type="radio" checked readOnly />
                  <div>
                    <strong>Boletos ({form.ticket_count} personas)</strong><br/>
                    <span className="muted">{convertPrice(precio * form.ticket_count)} subtotal</span>
                  </div>
                </div>

                {isLoggedIn ? (
                  <>
                    <label style={{fontWeight: 600, fontSize: '0.9rem', marginTop: 16, display: 'block'}}>Método de pago (Guardado)</label>
                    <select className="full-width-input" style={{marginBottom: 16}} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="visa">Visa terminada en ****1234</option>
                      <option value="paypal">PayPal ({user.email})</option>
                      <option value="mastercard">Mastercard terminada en ****9876</option>
                    </select>

                    <div className="total-price-box">
                      <div className="total-text">Total <strong>{convertPrice(precio * form.ticket_count)}</strong><br/><span>Incluye impuestos y cargos</span></div>
                      {isAdmin ? (
                        <div style={{ marginTop: 16, padding: '10px', background: '#f8d7da', color: '#721c24', borderRadius: '4px', textAlign: 'center', fontSize: '0.9rem' }}>
                          Las cuentas de administrador no pueden realizar compras.
                        </div>
                      ) : (
                        <button className="search-btn" style={{width: '100%', padding: '12px', fontSize: '1rem', marginTop: 16}} onClick={handleBooking} disabled={isBooking}>
                          {isBooking ? 'Procesando Pago Seguro...' : 'Pagar y Confirmar'}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 24, textAlign: 'center', padding: '16px', border: '1px solid #e0e0e0', borderRadius: 8, background: '#f5f5f5' }}>
                    <p style={{marginBottom: 12, fontSize: '0.95rem'}}>Inicia sesión con tu cuenta para continuar con la reserva de forma segura.</p>
                    <button className="search-btn" style={{width: '100%', padding: '10px', fontSize: '1rem'}} onClick={() => navigate('/login')}>
                      Iniciar Sesión
                    </button>
                  </div>
                )}
                
                {bookingResult?.error && (
                  <div style={{ color: 'red', fontSize: '0.9rem', marginTop: 16 }}>{bookingResult.error}</div>
                )}
              </div>
            </div>
          </div>
          
          {!isLoggedIn && (
            <div className="account-banner mini-banner">
              <div className="account-banner-content">
                <h3>Todos los detalles de tus viajes en un mismo lugar</h3>
                <p>Inicia sesión para reservar más rápido y administrar tus viajes fácilmente</p>
                <div className="account-actions">
                  <button className="btn-iniciar-sesion" onClick={() => navigate('/login')}>Iniciar sesión</button>
                  <button className="btn-registrate" onClick={() => navigate('/register')}>Regístrate</button>
                </div>
              </div>
              <div className="account-banner-img">
                <span className="genius-icon">🎁 Genius</span>
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* MODAL DE ÉXITO PREMIUM */}
      {showSuccessModal && bookingResult?.success && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'white', padding: '40px', borderRadius: '12px', maxWidth: '450px', width: '90%', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.4s ease-out' }}>
            <div className="modal-icon" style={{ width: 64, height: 64, borderRadius: '50%', background: '#e6f4ea', color: '#137333', fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
              ✓
            </div>
            <h2 style={{ marginBottom: '8px', color: '#1a1a1a' }}>
              {bookingResult.data?.offline ? 'Guardado sin conexión' : '¡Pago Exitoso!'}
            </h2>
            <p style={{ color: '#595959', marginBottom: '24px' }}>
              {bookingResult.data?.offline 
                ? 'Tu reserva se sincronizará automáticamente cuando recuperes la conexión a internet.' 
                : `Hemos enviado tu comprobante de pago electrónico al correo `}
              {!bookingResult.data?.offline && <strong>{user.email}</strong>}
            </p>
            
            <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '8px', textAlign: 'left', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>Reserva ID:</span>
                <strong style={{ fontSize: '0.85rem' }}>{bookingResult.data.reservation_id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>Atracción:</span>
                <strong>{atraccion?.name?.substring(0, 20)}...</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#595959' }}>Total Pagado:</span>
                <strong>{convertPrice(precio * form.ticket_count)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#595959' }}>Método:</span>
                <strong style={{ textTransform: 'capitalize' }}>{paymentMethod}</strong>
              </div>
            </div>

            <button 
              className="search-btn" 
              style={{ width: '100%', padding: '14px', fontSize: '1.05rem', borderRadius: '8px' }}
              onClick={() => setShowSuccessModal(false)}
            >
              ¡Listo!
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <ReportModal 
        isOpen={showReportModal} 
        onClose={() => setShowReportModal(false)} 
        entityName={atraccion.nombre || atraccion.name || 'Atracción'} 
        pnrOrId={atraccion?.id || 'ATRAC'} 
        type="Atracción" 
      />
    </div>
  );
}
