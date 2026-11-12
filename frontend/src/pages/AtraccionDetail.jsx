import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getAtraccion, reservarAtraccion, getDisponibilidadAtraccion } from '../services/atraccionesApi';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../hooks/useAuth';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { useCurrency } from '../hooks/CurrencyContext';
import { ReportModal } from '../components/ReportModal';
import { OfflineReservaModal } from '../components/OfflineReservaModal';
import { VoucherModal } from '../components/VoucherModal';
import { AtraccionesLoadingView } from '../components/AtraccionesLoadingView';
import { resolverGaleriaAtraccion } from '../utils/atraccionImagenes';

export function AtraccionDetail() {
  const todayStr = new Date().toISOString().split('T')[0];
  const { id } = useParams();
  const location = useLocation();
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
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('visa');
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [pendingOfflinePay, setPendingOfflinePay] = useState(false);
  
  // Horarios y disponibilidad dinámica (RDA2)
  const [timeSlots, setTimeSlots] = useState([
    { time: '09:00 a.m.', cupos: 8, estado: 'DISPONIBLE' },
    { time: '10:30 a.m.', cupos: 4, estado: 'DISPONIBLE' },
    { time: '12:00 p.m.', cupos: 0, estado: 'AGOTADO' },
    { time: '02:00 p.m.', cupos: 15, estado: 'DISPONIBLE' },
    { time: '03:30 p.m.', cupos: 2, estado: 'ULTIMOS_CUPOS' },
  ]);

  const [form, setForm] = useState({
    date: todayStr,
    time: '09:00 a.m.',
    adult_count: 1,
    child_count: 0,
    senior_count: 0,
    infant_count: 0,
    special_requirements: ''
  });

  const [calendarViewDate, setCalendarViewDate] = useState(() => {
    const parts = todayStr.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, 1);
  });

  const handleOpenCalendar = (e) => {
    e.preventDefault();
    const parts = (form.date || todayStr).split('-').map(Number);
    setCalendarViewDate(new Date(parts[0], parts[1] - 1, 1));
    setShowCalendar(true);
  };

  const prevMonth = () => {
    setCalendarViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  useEffect(() => {
    if (id) {
      const saved = localStorage.getItem(`atraccion_form_${id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (!parsed.date || parsed.date < todayStr) {
            parsed.date = todayStr;
          }
          setForm(parsed);
        } catch (e) {}
      }
    }
  }, [id, todayStr]);

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

  useEffect(() => {
    if (!id || !form.date) return;

    const refrescarDisponibilidad = () => {
      getDisponibilidadAtraccion(id, form.date)
        .then(res => {
          const list = Array.isArray(res) ? res : (res?.turnos || res?.time_slots || res?.slots || []);
          if (Array.isArray(list) && list.length > 0) {
            const mapped = list.map(s => {
              const cuposNum = Number(s.cupos ?? s.cupos_disponibles ?? s.available_spots ?? 5);
              const timeVal = s.time || s.horaInicio || s.hora || '09:00 a.m.';
              return {
                ...s,
                time: timeVal,
                cupos: cuposNum,
                cupos_disponibles: cuposNum,
                estado: s.estado || s.status || (cuposNum > 0 ? 'DISPONIBLE' : 'AGOTADO')
              };
            });
            setTimeSlots((prev) => {
              if (prev && prev.length === mapped.length) {
                let hasDiff = false;
                for (let i = 0; i < mapped.length; i++) {
                  if (
                    prev[i].time !== mapped[i].time ||
                    prev[i].cupos !== mapped[i].cupos ||
                    prev[i].estado !== mapped[i].estado
                  ) {
                    hasDiff = true;
                    break;
                  }
                }
                if (!hasDiff) return prev;
              }
              return mapped;
            });
            // Sincronizar automáticamente el formulario si el horario actual no existe en los turnos disponibles
            setForm((prev) => {
              const exists = mapped.some((s) => s.time === prev.time);
              if (!exists && mapped[0]) {
                return { ...prev, time: mapped[0].time };
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    };

    refrescarDisponibilidad();
    // Auto-polling para reflejar en tiempo real la deducción o adición de cupos
    const interval = setInterval(refrescarDisponibilidad, 4000);
    return () => clearInterval(interval);
  }, [id, form.date]);

  const precioAdulto = parseFloat(atraccion?.precio_unitario || atraccion?.price?.total || atraccion?.precioTicket || 55);
  const precioNino = parseFloat((precioAdulto * 0.5).toFixed(2));
  const precioSenior = parseFloat((precioAdulto * 0.7).toFixed(2)); // Tarifa 3ra edad 30% descuento
  const precioInfante = 0.0; // Tarifa $0 (Gratis) con cupo de aforo legal (Cátedra RDA2 §6)
  const totalTickets = (form.adult_count || 0) + (form.child_count || 0) + (form.senior_count || 0) + (form.infant_count || 0);
  const totalCalculado = parseFloat(
    ((form.adult_count * precioAdulto) + (form.child_count * precioNino) + (form.senior_count * precioSenior) + (form.infant_count * precioInfante)).toFixed(2)
  );

  // Heurística 5 & V-07: Validación reactiva de aforo y cupos en turno
  const selectedSlot = timeSlots.find(s => s.time === form.time) || timeSlots[0];
  const cuposDisponibles = selectedSlot ? Number(selectedSlot.cupos ?? selectedSlot.cupos_disponibles ?? selectedSlot.available_spots ?? 10) : 10;
  const isAgotadoSlot = selectedSlot ? (selectedSlot.estado === 'AGOTADO' || cuposDisponibles <= 0) : false;
  const cuposExcedidos = totalTickets > cuposDisponibles;

  const handleBooking = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isLoggedIn) {
      sessionStorage.setItem('booking_return_url', location.pathname + location.search);
      navigate('/login', { state: { from: location.pathname + location.search, message: 'Inicia sesión para reservar tu atracción' } });
      return;
    }

    // Heurística 5: Prevención de errores de fecha y aforo
    if (form.date < todayStr) {
      alert('No puedes reservar una fecha en el pasado. Por favor selecciona hoy o una fecha posterior.');
      return;
    }

    if (isAgotadoSlot) {
      alert('El turno seleccionado se encuentra agotado. Por favor selecciona otro horario.');
      return;
    }

    if (cuposExcedidos) {
      alert(`El turno seleccionado solo dispone de ${cuposDisponibles} cupos. Reduce la cantidad de boletos a un máximo de ${cuposDisponibles}.`);
      return;
    }

    if (!navigator.onLine && !pendingOfflinePay) {
      setPendingOfflinePay(true);
      setShowOfflineModal(true);
      return;
    }
    setPendingOfflinePay(false);

    setIsBooking(true);
    setBookingResult(null);

    const idempotencyKey = uuidv4();
    try {
      let result = null;
      const dateCompact = (form.date || todayStr).replace(/-/g, '');
      const timeNormalized = (form.time || '09:00').replace(/(a\.m\.|p\.m\.|\s)/gi, '').slice(0, 5) || '09:00';
      const time24 = timeNormalized.length === 4 ? `0${timeNormalized}` : timeNormalized;
      const timeCompact = time24.replace(/[^0-9]/g, '').slice(0, 4).padStart(4, '0');
      const targetSlotId = selectedSlot?.slot_id || selectedSlot?.id || `slot-${dateCompact}-${timeCompact}`;

      // Reconciliación automática y segura de fecha y hora según el slot seleccionado
      const slotMatch = (targetSlotId || '').match(/^slot-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
      const safeDate = slotMatch ? `${slotMatch[1]}-${slotMatch[2]}-${slotMatch[3]}` : (form.date || todayStr);
      const safeTime = slotMatch ? `${slotMatch[4]}:${slotMatch[5]}` : time24;

      const payload = {
        atraccionId: id,
        atraccion_id: id,
        slot_id: targetSlotId,
        date: safeDate,
        time: safeTime,
        adult_count: form.adult_count,
        child_count: form.child_count,
        senior_count: form.senior_count,
        infant_count: form.infant_count,
        ticket_count: totalTickets,
        customer_name: (user.user_metadata?.full_name || user.email.split('@')[0]).trim().replace(/\s{2,}/g, ' '),
        customer_email: user.email?.trim() || '',
        customer_phone: (user.user_metadata?.telefono || '+593987654321').trim(),
        document_id: (user.user_metadata?.cedula || '1755073481').trim(),
        cliente_id: user?.id || null,
        proveedor_codigo: atraccion?.proveedor_codigo || atraccion?.proveedorCodigo || atraccion?.proveedor?.codigo || atraccion?.proveedor?.id || undefined,
        special_requirements: (form.special_requirements || '').trim().replace(/\s{2,}/g, ' ')
      };

      if (!navigator.onLine) {
        const tituloAtraccion =
          atraccion?.nombre || atraccion?.name || `Tour / Atracción (${totalTickets} personas)`;

        await savePendingReservation('atraccion', payload, idempotencyKey, {
          tipo: 'atraccion',
          pnr: idempotencyKey.substring(0, 8).toUpperCase(),
          titulo: tituloAtraccion,
          total: totalCalculado.toFixed(2),
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
          result = await reservarAtraccion(id, payload, idempotencyKey);
        } catch (backendErr) {
          console.error('Error al reservar atracción en backend:', backendErr);
          setIsBooking(false);
          const msg = backendErr.response?.data?.detail || backendErr.response?.data?.message || backendErr.message || 'Error al procesar la reserva con el socio.';
          alert(`Error al procesar la reserva: ${msg}`);
          return;
        }
      }
      
      const realPnr = result?.reservation_code || result?.reservation_id || result?.pnr || idempotencyKey;
      const atraccionRes = {
        id: realPnr,
        reservation_id: realPnr,
        pnr: realPnr,
        tipo: 'atraccion',
        titulo: atraccion?.nombre || atraccion?.name || result?.titulo || result?.name || `Tour / Atracción (${totalTickets} personas)`,
        date: form.date,
        time: form.time,
        adult_count: form.adult_count,
        child_count: form.child_count,
        ticket_count: totalTickets,
        status: 'CONFIRMED',
        totalPrice: { currency: 'USD', total: totalCalculado.toFixed(2) },
        email: (user?.email || '').trim().toLowerCase(),
        guia_asignado: result?.guia_asignado || 'Carlos Villacís (Guía Oficial Certificado MINTUR)',
        punto_encuentro: atraccion?.locations?.[0]?.address || 'Punto de Encuentro Central'
      };

      setBookingResult({ success: true, data: result });
      setConfirmedReservation(atraccionRes);
      setShowSuccessModal(true);

      const existing = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      localStorage.setItem('reservas_atracciones', JSON.stringify([atraccionRes, ...existing]));

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
        error: err.message || 'Error desconocido al procesar la reserva' 
      });
    } finally {
      setIsBooking(false);
    }
  };

  if (loading) return <AtraccionesLoadingView />;
  if (error) return <main id="contenido-principal" className="state-container"><h1 className="sr-only">Error al cargar atracción</h1><div className="error-icon">⚠️</div><p className="state-subtitle">{error}</p><button className="retry-btn" onClick={() => navigate('/')}>Volver</button></main>;
  if (!atraccion) return null;

  const fotosGaleria = resolverGaleriaAtraccion(atraccion);

  return (
    <div className="search-page-wrapper">
      <div className="breadcrumb-nav" style={{ paddingTop: 24 }}>
        <span onClick={() => navigate('/')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/'); } }} style={{cursor: 'pointer'}}>Inicio</span> {'>'} <span>Atracciones</span> {'>'} <span>Cosas que hacer en Quito</span> {'>'} <span>Centro Histórico</span> {'>'} <strong>{atraccion.nombre || atraccion.name || 'Tour y Experiencia'}</strong>
      </div>

      <main className="detail-layout">
        
        {/* COLUMNA IZQUIERDA: CONTENIDO */}
        <div className="detail-content">
          <div className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                  #1 Más Vendido en Quito
                </span>
                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                  Confirmación Inmediata
                </span>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                  Voucher Digital con QR
                </span>
              </div>
              <h1 className="detail-title">{atraccion.nombre || atraccion.name || 'Recorrido a pie de Quito Old Town con degustación de cacao en grupos pequeños'}</h1>
              <p className="detail-subtitle">Visita guiada oficial por el casco antiguo de Quito, destacando siglos de historia, arquitectura colonial, plazas y costumbres locales.</p>
            </div>
          </div>

          <div className="gallery-grid">
            <div className="gallery-main">
              <img src={fotosGaleria[0]} onError={(e) => { e.target.onerror = null; e.target.src = fotosGaleria[1]; }} alt="Main" />
              <div className="gallery-badge-overlay">
                <div className="gb-score">9.8</div>
                <div className="gb-text">
                  <strong>Excepcional</strong><br/>
                  <a href="#reviews" style={{ color: 'white', textDecoration: 'underline', cursor: 'pointer' }}>142 opiniones verificadas {'>'}</a>
                </div>
              </div>
            </div>
            <div className="gallery-side">
              <img src={fotosGaleria[1]} onError={(e) => { e.target.onerror = null; e.target.src = fotosGaleria[0]; }} alt="Gallery 1" />
              <img src={fotosGaleria[2]} onError={(e) => { e.target.onerror = null; e.target.src = fotosGaleria[0]; }} alt="Gallery 2" />
              <img src={fotosGaleria[3]} onError={(e) => { e.target.onerror = null; e.target.src = fotosGaleria[1]; }} alt="Gallery 3" />
              <div className="gallery-more">
                <img src={fotosGaleria[4]} onError={(e) => { e.target.onerror = null; e.target.src = fotosGaleria[2]; }} alt="Gallery 4" />
                <div className="more-overlay">🖼️ Ver todas las imágenes</div>
              </div>
            </div>
          </div>

          <div className="detail-highlights">
            <div className="dh-item">
              <span className="icon success">✔️</span>
              <div>
                <strong>Cancelación gratis</strong><br/>
                <span className="muted">Hasta 24 horas antes del inicio del turno</span>
              </div>
            </div>
            <div className="dh-item">
              <span className="icon">⏱️</span>
              <div>
                <strong>Duración: 3 horas</strong><br/>
                <span className="muted">Horario flexible con múltiples turnos</span>
              </div>
            </div>
            <div className="dh-item">
              <span className="icon">🗣️</span>
              <div>
                <strong>Guía bilingüe oficial</strong><br/>
                <span className="muted">Español e Inglés incluidos</span>
              </div>
            </div>
            <div className="dh-item">
              <span className="icon">🐾</span>
              <div>
                <strong>Animales de servicio</strong><br/>
                <span className="muted">Se admiten perros de asistencia</span>
              </div>
            </div>
          </div>

          <div className="detail-description">
            <p>{atraccion.long_description || 'Descubre la magia del primer Patrimonio Cultural de la Humanidad con guías oficiales certificados. Incluye recorrido por iglesias coloniales, cata de chocolates finos de aroma y mirador panorámico.'}</p>
          </div>

          {/* RAZONES PARA IR */}
          <div className="detail-section">
            <h2>Razones para ir</h2>
            <ul className="check-list">
              <li>Guía turístico local profesional con comentarios sobre historia, arte barroco y leyendas de Quito.</li>
              <li>Degustación guiada de cacao fino ecuatoriano en chocolatería artesanal tradicional.</li>
              <li>Visita al mirador panorámico del Panecillo con vista de 360 grados de los volcanes andinos.</li>
              <li>Grupos reducidos para garantizar distanciamiento, seguridad y atención personalizada.</li>
            </ul>
          </div>

          {/* QUÉ INCLUYE Y QUÉ NO INCLUYE */}
          <div className="detail-section">
            <h2>Inclusiones y Servicios del Tour</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1rem', color: '#137333', marginBottom: '10px' }}>✓ Lo que incluye</h3>
                <ul className="check-list" style={{ paddingLeft: '0' }}>
                  <li>Guía turístico oficial bilingüe (Español / Inglés).</li>
                  <li>Degustación de chocolates finos de aroma y café orgánico.</li>
                  <li>Transporte turístico en bus panorámico hop-on hop-off.</li>
                  <li>Voucher digital QR y check-in presencial garantizado.</li>
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', color: '#b91c1c', marginBottom: '10px' }}>✕ No incluye</h3>
                <ul className="bullet-list" style={{ paddingLeft: '20px', color: '#595959' }}>
                  <li>Propinas voluntarias para el personal.</li>
                  <li>Alimentos o bebidas alcohólicas adicionales no especificadas.</li>
                  <li>Traslados privados desde hoteles fuera del perímetro central.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ITINERARIO CRONOLÓGICO DE PARADAS */}
          <div className="detail-section">
            <h2>Itinerario cronológico del recorrido</h2>
            <div className="itinerary-timeline">
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Punto de encuentro: Boulevard Naciones Unidas</strong>
                  <span className="success-text">📍 09:00 a.m.</span>
                  <p>Registro con el guía asignado mostrando tu voucher QR desde tu teléfono inteligente.</p>
                  <span className="tl-time">⏱️ 15 minutos</span>
                </div>
              </div>
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Parada 1: Basílica del Voto Nacional</strong>
                  <span className="success-text">✔️ Parada fotográfica</span>
                  <p>Explicación sobre la arquitectura neogótica y las figuras de fauna ecuatoriana en sus gárgolas.</p>
                  <span className="tl-time">⏱️ 40 minutos</span>
                </div>
              </div>
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Parada 2: Plaza de San Francisco y Degustación de Cacao</strong>
                  <span className="success-text">🍫 Degustación incluida</span>
                  <p>Cata interactiva de 4 variedades de chocolates de origen con maridaje de café de altura.</p>
                  <span className="tl-time">⏱️ 45 minutos</span>
                </div>
              </div>
              <div className="timeline-item">
                <div className="tl-dot"></div>
                <div className="tl-content">
                  <strong>Parada 3: Mirador El Panecillo</strong>
                  <span className="success-text">🔭 Vista panorámica 360°</span>
                  <p>Tiempo libre para fotos de la Virgen Alada y la cordillera de los Andes.</p>
                  <span className="tl-time">⏱️ 35 minutos</span>
                </div>
              </div>
            </div>
          </div>

          {/* UBICACIÓN */}
          <div className="detail-section">
            <h2>Punto de encuentro y ubicación</h2>
            <div className="map-container" style={{ width: '100%', height: '300px', overflow: 'hidden', borderRadius: '8px', border: '1px solid #ccc', position: 'relative' }}>
              <iframe
                title="Mapa del tour"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src="https://www.openstreetmap.org/export/embed.html?bbox=-78.517327%2C-0.225164%2C-78.507327%2C-0.215164&amp;layer=mapnik&amp;marker=-0.220164%2C-78.512327"
                allowFullScreen
              ></iframe>
            </div>
          </div>

          {/* VALORACIONES DE USUARIOS */}
          <div className="detail-section" id="reviews">
            <h2>Valoraciones y Desglose de Experiencia</h2>
            <div className="reviews-summary" style={{ display: 'flex', gap: '30px', alignItems: 'center', background: '#f8f9fa', padding: '20px', borderRadius: '10px' }}>
              <div className="rs-badge" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span className="score" style={{ background: '#003580', color: '#fff', fontSize: '1.8rem', fontWeight: 800, padding: '12px 18px', borderRadius: '8px' }}>9.8</span>
                <div>
                  <strong style={{ fontSize: '1.2rem', color: '#1a1a1a' }}>Excepcional</strong><br/>
                  <span className="muted">Basado en 142 opiniones verificadas de viajeros</span>
                </div>
              </div>
              <div className="rs-bars" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="bar-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>🧹 Limpieza y Bioseguridad</span>
                  <strong>9.9 / 10</strong>
                </div>
                <div className="bar-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>🧑‍🏫 Servicio y Conocimiento del Guía</span>
                  <strong>9.8 / 10</strong>
                </div>
                <div className="bar-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>💎 Relación Calidad-Precio</span>
                  <strong>9.6 / 10</strong>
                </div>
                <div className="bar-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>⏱️ Puntualidad y Logística</span>
                  <strong>9.7 / 10</strong>
                </div>
              </div>
            </div>

            <h3 style={{ marginTop: 28, marginBottom: 16 }}>Opiniones recientes de clientes</h3>
            <div className="customer-likes-carousel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="like-card" style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '16px', borderRadius: '8px' }}>
                <div className="user-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                  <div className="avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: '#006ce4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>C</div>
                  <div><strong>Carlos M.</strong><br/><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>🇪🇨 Ecuador</span></div>
                </div>
                <p style={{ fontSize: '0.88rem', fontStyle: 'italic', margin: 0 }}>"El recorrido fue impecable. El guía Carlos conocía a fondo la historia y la degustación de cacao fue insuperable."</p>
              </div>

              <div className="like-card" style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '16px', borderRadius: '8px' }}>
                <div className="user-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                  <div className="avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>E</div>
                  <div><strong>Elena R.</strong><br/><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>🇪🇸 España</span></div>
                </div>
                <p style={{ fontSize: '0.88rem', fontStyle: 'italic', margin: 0 }}>"Muy fácil hacer la reserva y el check-in con el código QR. El mirador del Panecillo ofrece fotos espectaculares."</p>
              </div>
            </div>
          </div>

          <div className="detail-section faq-section">
            <h2>Preguntas frecuentes</h2>
            <details><summary>¿Cómo accedo al tour una vez completado el pago?</summary><p>Inmediatamente tras el pago recibes tu voucher digital con código QR dinámico. Puedes guardarlo en tu teléfono o realizar el check-in presencial en un clic.</p></details>
            <details><summary>¿Qué pasa si llueve o cambia el clima en Quito?</summary><p>Nuestros buses panorámicos cuentan con techo retráctil hermético y los guías adaptan las paradas peatonales sin comprometer el itinerario.</p></details>
            <details><summary>¿Puedo cancelar y recibir reembolso?</summary><p>Sí, dispones de cancelación gratuita con reembolso íntegro (100%) hasta 24 horas antes del inicio de tu turno seleccionado, acreditado a tu método de pago original.</p></details>
            <details><summary>¿Qué tipo de vestimenta o equipamiento debo llevar?</summary><p>Recomendamos calzado cómodo con suela antideslizante para caminar sobre adoquines coloniales, chaqueta abrigada ligera (capas) por el viento andino, protector solar y cámara fotográfica.</p></details>
            <details><summary>¿Qué documentación debo presentar ante el guía?</summary><p>Presenta tu cédula de identidad física o pasaporte vigente, junto con el código QR de confirmación desde la pantalla de tu dispositivo móvil en la sección Mis Reservas.</p></details>
          </div>

        </div>

        {/* COLUMNA DERECHA: CONFIGURADOR DE RESERVA (STICKY) */}
        <aside className="detail-sidebar">
          <div className="booking-box" style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: 8, color: '#1a1a1a' }}>Boletos y Disponibilidad</h2>
            <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: 16 }}>Elige tu fecha y turno con cupos en tiempo real:</p>

            {/* SELECTOR DE FECHAS */}
            {!showCalendar && (
              <a href="#" className="link-action" onClick={handleOpenCalendar} style={{ color: '#006ce4', textDecoration: 'underline', fontSize: '0.9rem', fontWeight: 600 }}>
                📅 Cambiar fecha ({form.date})
              </a>
            )}
            
            {showCalendar ? (
              <div className="custom-calendar-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px', marginTop: '12px', marginBottom: '20px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                      type="button" 
                      onClick={prevMonth} 
                      style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '0.85rem' }}
                      title="Mes anterior"
                    >
                      ◀
                    </button>
                    <strong style={{ fontSize: '1rem', textTransform: 'capitalize' }}>
                      {calendarViewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                    </strong>
                    <button 
                      type="button" 
                      onClick={nextMonth} 
                      style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '0.85rem' }}
                      title="Mes siguiente"
                    >
                      ▶
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowCalendar(false)} style={{ background: 'none', border: 'none', color: '#006ce4', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Cerrar ✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.85rem' }}>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>do</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>lu</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>ma</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>mi</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>ju</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>vi</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>sa</div>

                  {Array.from({ length: new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1).getDay() }).map((_, idx) => (
                    <div key={`empty-${idx}`}></div>
                  ))}

                  {Array.from({ length: new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((day) => {
                    const cYear = calendarViewDate.getFullYear();
                    const cMonth = String(calendarViewDate.getMonth() + 1).padStart(2, '0');
                    const cDay = String(day).padStart(2, '0');
                    const dateStr = `${cYear}-${cMonth}-${cDay}`;
                    const isSelected = form.date === dateStr;
                    const isPast = dateStr < todayStr;
                    return (
                      <div 
                        key={dateStr}
                        onClick={() => {
                          if (isPast) return;
                          setForm({ ...form, date: dateStr });
                          setShowCalendar(false);
                        }}
                        style={{
                          padding: '10px 0',
                          cursor: isPast ? 'not-allowed' : 'pointer',
                          borderRadius: '6px',
                          background: isSelected ? '#006ce4' : 'transparent',
                          color: isPast ? '#9ca3af' : isSelected ? '#fff' : '#1a1a1a',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          textDecoration: isPast ? 'line-through' : 'none',
                          opacity: isPast ? 0.35 : 1,
                          transition: 'background-color 0.15s'
                        }}
                        title={isPast ? 'No es posible seleccionar fechas pasadas' : `Seleccionar ${dateStr}`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>O elige en el selector:</span>
                  <input 
                    type="date" 
                    min={todayStr} 
                    value={form.date} 
                    onChange={(e) => {
                      if (e.target.value) {
                        setForm({ ...form, date: e.target.value });
                        const parts = e.target.value.split('-').map(Number);
                        setCalendarViewDate(new Date(parts[0], parts[1] - 1, 1));
                      }
                    }}
                    style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                </div>
              </div>
            ) : (
              <div className="date-selector" style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '16px' }}>
                {((form.date <= todayStr) ? [0, 1, 2] : [-1, 0, 1]).map(offset => {
                  const d = new Date(form.date + 'T00:00:00');
                  d.setDate(d.getDate() + offset);
                  const dateStr = d.toISOString().split('T')[0];
                  const isPast = dateStr < todayStr;
                  const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const isActive = form.date === dateStr;

                  return (
                    <div 
                      key={dateStr} 
                      className={`date-box ${isActive ? 'active' : ''}`} 
                      onClick={() => {
                        if (isPast) return;
                        setForm({...form, date: dateStr});
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        border: isActive ? '2px solid #006ce4' : isPast ? '1px dashed #d1d5db' : '1px solid #d1d5db',
                        borderRadius: '6px',
                        textAlign: 'center',
                        cursor: isPast ? 'not-allowed' : 'pointer',
                        background: isActive ? '#eff6ff' : isPast ? '#f9fafb' : '#fff',
                        opacity: isPast ? 0.45 : 1
                      }}
                      title={isPast ? 'Fecha pasada no disponible' : `Seleccionar ${dayName} ${dayNum}`}
                    >
                      <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: isActive ? '#006ce4' : '#6b7280' }}>{dayName}</span>
                      <strong style={{ fontSize: '1.1rem', color: isActive ? '#006ce4' : isPast ? '#9ca3af' : '#111827' }}>{dayNum}</strong>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SELECTOR DINÁMICO DE TURNOS HORARIOS */}
            <p style={{ margin: '16px 0 8px 0', fontWeight: 700, fontSize: '0.95rem' }}>Selecciona tu turno horario:</p>
            <div className="time-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {timeSlots.map((slot, idx) => {
                const slotTime = slot.time || slot.hora || slot.hora_inicio || '10:30 a.m.';
                const isSelected = form.time === slotTime;
                const cupos = slot.cupos ?? slot.cupos_disponibles ?? 0;
                const estado = slot.estado ?? slot.status ?? (cupos <= 0 ? 'AGOTADO' : (cupos <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE'));
                const isAgotado = estado === 'AGOTADO' || cupos === 0;

                return (
                  <button
                    key={slot.id || slotTime || idx}
                    type="button"
                    disabled={isAgotado}
                    onClick={() => setForm({ ...form, time: slotTime })}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #006ce4' : '1px solid #d1d5db',
                      background: isAgotado ? '#f3f4f6' : isSelected ? '#eff6ff' : '#fff',
                      color: isAgotado ? '#9ca3af' : isSelected ? '#006ce4' : '#1f2937',
                      cursor: isAgotado ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 700 : 500,
                      textAlign: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div>{slotTime}</div>
                    <span style={{ fontSize: '0.75rem', display: 'block', marginTop: '2px', color: isAgotado ? '#ef4444' : estado === 'ULTIMOS_CUPOS' ? '#f59e0b' : '#10b981' }}>
                      {isAgotado ? 'Agotado' : estado === 'ULTIMOS_CUPOS' ? `¡${cupos} cupos!` : `${cupos} libres`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* MATRIZ DE CONFIGURACIÓN DE ENTRADAS POR EDAD */}
            <div className="ticket-configuration" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: '12px' }}>Cantidad de boletos:</strong>

              {/* Adulto */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block' }}>Adulto (13+ años)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{convertPrice(precioAdulto)} c/u</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, adult_count: Math.max(1, form.adult_count - 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{form.adult_count}</span>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, adult_count: Math.min(10, form.adult_count + 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Niño */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block' }}>Niño (5 a 12 años)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#15803d' }}>50% Dcto: {convertPrice(precioNino)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, child_count: Math.max(0, form.child_count - 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{form.child_count}</span>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, child_count: Math.min(10, form.child_count + 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Senior (3ra Edad) - GAP-FRONT-01 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block' }}>Senior (65+ años)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#0369a1' }}>Tarifa 3ra Edad (30% Dcto): {convertPrice(precioSenior)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, senior_count: Math.max(0, form.senior_count - 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{form.senior_count}</span>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, senior_count: Math.min(10, form.senior_count + 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Infante (0 a 4 años) - Tarifa $0 con cupo de aforo legal obligatorio - GAP-FRONT-01 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: '#f0fdf4', border: '1px dashed #86efac', padding: '10px 12px', borderRadius: '8px' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block', color: '#166534' }}>Infante (0 a 4 años)</strong>
                  <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>Tarifa $0.00 (Ocupa cupo legal de aforo)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, infant_count: Math.max(0, form.infant_count - 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    -
                  </button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{form.infant_count}</span>
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, infant_count: Math.min(10, form.infant_count + 1) })}
                    style={{ width: 32, height: 32, borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* WIDGET PROMO COMBO B2B - GAP-FRONT-05 */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1d4ed8', fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>
                  <span>🎁</span> Combo Promocional B2B Recomendado
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#1e40af' }}>
                  Añade un auto de alquiler con <strong>15% de descuento directo</strong> negociado mediante contrato con Alamo & Hertz.
                </p>
              </div>

              {/* ALERTA DE CUPO Y AFORO */}
              {isAgotadoSlot && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 12px', borderRadius: '6px', fontSize: '0.83rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️</span> El turno de las {form.time} está agotado. Por favor selecciona otro turno horario disponible.
                </div>
              )}

              {!isAgotadoSlot && cuposExcedidos && (
                <div role="alert" style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 12px', borderRadius: '6px', fontSize: '0.83rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️</span> Has solicitado {totalTickets} boletos, pero el turno seleccionado solo dispone de {cuposDisponibles} cupos libres.
                </div>
              )}

              {/* REQUERIMIENTOS ESPECIALES / ALERGIAS */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label htmlFor="special-requirements-input" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                    Requerimientos especiales (Alergias o movilidad):
                  </label>
                  <span style={{ fontSize: '0.72rem', color: (form.special_requirements?.length || 0) >= 250 ? '#d93025' : '#6b7280' }}>
                    {(form.special_requirements || '').length}/250
                  </span>
                </div>
                <input 
                  id="special-requirements-input"
                  type="text" 
                  maxLength={250}
                  placeholder="Ej. Alergia a frutos secos / Silla de ruedas"
                  value={form.special_requirements || ''}
                  onChange={(e) => {
                    const clean = e.target.value.slice(0, 250).replace(/\s{2,}/g, ' ');
                    setForm({ ...form, special_requirements: clean });
                  }}
                  onBlur={() => {
                    setForm(prev => ({
                      ...prev,
                      special_requirements: (prev.special_requirements || '').trim().replace(/\s{2,}/g, ' ')
                    }));
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '8px 10px', 
                    borderRadius: '6px', 
                    border: (form.special_requirements?.length || 0) >= 250 ? '1px solid #d93025' : '1px solid #d1d5db', 
                    fontSize: '0.85rem' 
                  }}
                />
              </div>

              {isLoggedIn ? (
                <>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>Método de pago:</label>
                  <select 
                    className="full-width-input" 
                    style={{ width: '100%', padding: '8px', marginBottom: '16px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem' }} 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="visa">Visa Débito ****1234</option>
                    <option value="paypal">PayPal ({user.email})</option>
                    <option value="mastercard">Mastercard ****9876</option>
                  </select>

                  <div className="total-price-box" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Total a Pagar:</span>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#003580' }}>
                          {convertPrice(totalCalculado)}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>✓ Impuestos y cargos incluidos</span>
                      </div>
                    </div>

                    {isAdmin ? (
                      <div style={{ marginTop: 12, padding: '10px', background: '#f8d7da', color: '#721c24', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem' }}>
                        Las cuentas de administrador no pueden realizar reservas.
                      </div>
                    ) : (
                      <>
                        <button 
                          className="search-btn" 
                          style={{ 
                            width: '100%', 
                            padding: '14px', 
                            fontSize: '1rem', 
                            marginTop: 16, 
                            borderRadius: '8px', 
                            background: (isBooking || cuposExcedidos || isAgotadoSlot) ? '#9ca3af' : '#006ce4', 
                            color: '#fff', 
                            border: 'none', 
                            fontWeight: 700, 
                            cursor: (isBooking || cuposExcedidos || isAgotadoSlot) ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s'
                          }} 
                          onClick={handleBooking} 
                          disabled={isBooking || cuposExcedidos || isAgotadoSlot}
                        >
                          {isBooking 
                            ? 'Procesando tu reserva y generando entradas...' 
                            : isAgotadoSlot 
                            ? 'Turno Agotado' 
                            : cuposExcedidos 
                            ? `Excede Cupos Libres (${cuposDisponibles})` 
                            : `Pagar y Confirmar (${totalTickets} boletos)`}
                        </button>

                        {showOfflineModal && (
                          <OfflineReservaModal
                            onContinuar={() => {
                              setShowOfflineModal(false);
                              handleBooking({ preventDefault: () => {} });
                            }}
                            onCancelar={() => {
                              setShowOfflineModal(false);
                              setPendingOfflinePay(false);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 20, textAlign: 'center', padding: '16px', border: '1px solid #e0e0e0', borderRadius: 8, background: '#f9fafb' }}>
                  <p style={{ marginBottom: 12, fontSize: '0.9rem', color: '#4b5563' }}>Inicia sesión con tu cuenta para asegurar tus cupos de forma inmediata.</p>
                  <button className="search-btn" style={{ width: '100%', padding: '10px', fontSize: '0.95rem', borderRadius: '6px', background: '#006ce4', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }} onClick={() => navigate('/login')}>
                    Iniciar Sesión para Reservar
                  </button>
                </div>
              )}
              
              {bookingResult?.error && (
                <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: 12, background: '#fee2e2', padding: '8px', borderRadius: '6px' }}>
                  {bookingResult.error}
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* MODAL DE ÉXITO Y ACCESO AL VOUCHER QR */}
      {showSuccessModal && bookingResult?.success && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'white', padding: '36px', borderRadius: '14px', maxWidth: '460px', width: '90%', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              ✓
            </div>
            <h2 style={{ marginBottom: '8px', color: '#1a1a1a', fontSize: '1.4rem' }}>
              {bookingResult.data?.offline ? 'Guardado sin conexión' : '¡Reserva y Pago Exitosos!'}
            </h2>
            <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '0.95rem' }}>
              Tu comprobante y voucher digital han sido generados para <strong>{user?.email}</strong>.
            </p>
            
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', textAlign: 'left', marginBottom: '20px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Localizador / PNR:</span>
                <strong style={{ color: '#003580' }}>{confirmedReservation?.reservation_id?.substring(0, 8).toUpperCase()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Turno Confirmado:</span>
                <strong>{form.date} ({form.time})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Total Pagado:</span>
                <strong style={{ color: '#15803d' }}>{convertPrice(totalCalculado)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                style={{ width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', background: '#006ce4', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => {
                  setShowSuccessModal(false);
                  setShowVoucherModal(true);
                }}
              >
                🎟️ Ver Voucher Digital con Código QR
              </button>
              <button 
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setShowSuccessModal(false)}
              >
                Continuar Explorando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VOUCHER DIGITAL CON QR Y CHECK-IN */}
      {showVoucherModal && confirmedReservation && (
        <VoucherModal 
          isOpen={showVoucherModal} 
          onClose={() => setShowVoucherModal(false)}
          reserva={confirmedReservation}
          atraccion={atraccion}
          user={user}
          convertPrice={convertPrice}
        />
      )}

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
