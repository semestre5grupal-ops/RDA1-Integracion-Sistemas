import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import { reservarAlojamiento } from '../services/alojamientosApi';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { formatearFecha } from '../services/formato';
import { OfflineReservaModal } from './OfflineReservaModal';
import {
  CheckmarkIcon,
  CloseIcon,
  StarFilledIcon,
  CreditCardIcon,
  InfoIcon,
  ShieldCheckIcon,
  PriceMatchIcon,
  PetsIcon,
  WifiIcon,
  ParkingIcon,
  ClockIcon,
  LockIcon,
  ThumbsUpIcon,
  AirportShuttleIcon,
} from './BookingIcons';
import './AlojamientoCheckoutModal.css';

const PAISES = [
  { code: 'EC', name: 'Ecuador', prefix: '+593' },
  { code: 'CO', name: 'Colombia', prefix: '+57' },
  { code: 'PE', name: 'Perú', prefix: '+51' },
  { code: 'US', name: 'Estados Unidos', prefix: '+1' },
  { code: 'ES', name: 'España', prefix: '+34' },
  { code: 'AR', name: 'Argentina', prefix: '+54' },
  { code: 'CL', name: 'Chile', prefix: '+56' },
  { code: 'MX', name: 'México', prefix: '+52' },
  { code: 'BR', name: 'Brasil', prefix: '+55' },
];

export function AlojamientoCheckoutModal({
  alojamiento,
  checkin,
  checkout,
  adults = 2,
  rooms = 1,
  nightsCount = 6,
  originalPrice = 257.40,
  totalPrice = 205.92,
  taxes = 50.89,
  currency = 'USD',
  convertPrice = (p) => p,
  user = null,
  onClose,
  onSuccess,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Tus datos, 2: Finalizar reserva, 3: Confirmada

  const defaultNombre = user?.user_metadata?.nombre || user?.nombre || 'Liz';
  const defaultApellido = user?.user_metadata?.apellido || user?.apellido || 'Cadena';
  const defaultEmail = user?.email || 'lizcadena@example.com';
  const defaultCardHolder = `${defaultNombre} ${defaultApellido}`.trim();

  // Step 1 Form state
  const [paraQuien, setParaQuien] = useState('principal'); // 'principal' | 'otra_persona'
  const [viajaPorTrabajo, setViajaPorTrabajo] = useState('no'); // 'si' | 'no'
  const [nombre, setNombre] = useState(defaultNombre);
  const [apellidos, setApellidos] = useState(defaultApellido);
  const [email, setEmail] = useState(defaultEmail);
  const [confirmEmail, setConfirmEmail] = useState(defaultEmail);
  const [pais, setPais] = useState('EC');
  const [telefonoPrefijo, setTelefonoPrefijo] = useState('+593');
  const [telefono, setTelefono] = useState('0991234567');
  const [confirmacionSinPapel, setConfirmacionSinPapel] = useState(true);
  const [nombreHuesped, setNombreHuesped] = useState(defaultCardHolder);
  const [deseaAuto, setDeseaAuto] = useState(false);
  const [deseaTaxi, setDeseaTaxi] = useState(false);
  const [peticionesEspeciales, setPeticionesEspeciales] = useState('');
  const [horaLlegada, setHoraLlegada] = useState('15:00 - 16:00');

  // Step 2 Form state (Payment) - Tarjeta por defecto pre-cargada
  const [titularTarjeta, setTitularTarjeta] = useState(defaultCardHolder);
  const [numeroTarjeta, setNumeroTarjeta] = useState('4532 8765 4321 4242');
  const [fechaCaducidad, setFechaCaducidad] = useState('12/28');
  const [cvc, setCvc] = useState('842');
  const [aceptaMarketing, setAceptaMarketing] = useState(true);
  const [codigoPromo, setCodigoPromo] = useState('');
  const [promoAplicada, setPromoAplicada] = useState(false);
  const [promoError, setPromoError] = useState('');

  // UI state
  const [showTaxesDetail, setShowTaxesDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bookingConfirmed, setBookingConfirmed] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [pendingOfflinePay, setPendingOfflinePay] = useState(false);

  // Discount calculation
  const discountAmount = Math.max(0, originalPrice - totalPrice);
  const cancellationCost = Math.round(totalPrice * 0.5 * 100) / 100;
  const ivaAmount = Math.round(totalPrice * 0.15 * 100) / 100;
  const cleaningFee = Math.max(0, Math.round((taxes - ivaAmount) * 100) / 100) || 20.00;

  // Safe hotel address formatting (handles string, object with address/city/country)
  const hotelAddress = useMemo(() => {
    if (!alojamiento?.ubicacion) return 'Quito, Ecuador';
    if (typeof alojamiento.ubicacion === 'string') return alojamiento.ubicacion;
    if (typeof alojamiento.ubicacion === 'object') {
      const parts = [
        alojamiento.ubicacion.address,
        alojamiento.ubicacion.city,
        alojamiento.ubicacion.country,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : 'Quito, Ecuador';
    }
    return 'Quito, Ecuador';
  }, [alojamiento?.ubicacion]);

  // Auto pre-fill titular tarjeta when moving to Step 2
  const handleAvanzarPaso2 = (e) => {
    e.preventDefault();
    if (!nombre.trim() || !apellidos.trim()) {
      setErrorMsg('Por favor completa tu nombre y apellidos.');
      return;
    }
    if (!email.trim() || !confirmEmail.trim()) {
      setErrorMsg('Por favor introduce tu dirección de e-mail.');
      return;
    }
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setErrorMsg('Las direcciones de e-mail no coinciden.');
      return;
    }
    if (!telefono.trim()) {
      setErrorMsg('Por favor ingresa un número de teléfono de contacto.');
      return;
    }

    setErrorMsg('');
    setTitularTarjeta(`${nombre} ${apellidos}`.trim() || defaultCardHolder);
    if (!numeroTarjeta) setNumeroTarjeta('4532 8765 4321 4242');
    if (!fechaCaducidad) setFechaCaducidad('12/28');
    if (!cvc) setCvc('842');

    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Promo code validation
  const handleAplicarPromo = (e) => {
    e.preventDefault();
    setPromoError('');
    if (!codigoPromo.trim()) return;

    if (codigoPromo.toUpperCase() === 'BOOKING10' || codigoPromo.toUpperCase() === 'DESCUENTO10') {
      setPromoAplicada(true);
      setPromoError('');
    } else {
      setPromoError('El código introducido no es válido o ha expirado.');
    }
  };

  // Detectar si el usuario ya tiene una reserva confirmada para este alojamiento en estas fechas
  const existingActiveBooking = useMemo(() => {
    try {
      const reservas = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      return reservas.find((r) => 
        (r.alojamientoId === alojamiento?.id || r.alojamiento_id === alojamiento?.id) &&
        !['CANCELLED', 'Cancelada', 'FALLIDA'].includes(r.status) &&
        (r.checkin === checkin || (r.checkin < checkout && r.checkout > checkin))
      );
    } catch {
      return null;
    }
  }, [alojamiento?.id, checkin, checkout]);

  // Submission handler in Step 2
  const handleCompletarReserva = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevenir envíos concurrentes por doble clic

    if (!titularTarjeta.trim()) {
      setErrorMsg('Ingresa el nombre del titular de la tarjeta.');
      return;
    }
    if (!numeroTarjeta.trim() || numeroTarjeta.replace(/\s/g, '').length < 13) {
      setErrorMsg('Por favor introduce un número de tarjeta válido.');
      return;
    }
    if (!fechaCaducidad.trim() || !cvc.trim()) {
      setErrorMsg('Completa la fecha de caducidad y el código CVC.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    // Interceptar antes de proceder si no hay conexión
    if (!navigator.onLine && !pendingOfflinePay) {
      setLoading(false);
      setPendingOfflinePay(true);
      setShowOfflineModal(true);
      return;
    }
    setPendingOfflinePay(false);

    const idempotencyKey = uuidv4();
    const payload = {
      checkin: checkin || new Date().toISOString().split('T')[0],
      checkout: checkout || new Date(Date.now() + 86400000 * (nightsCount || 1)).toISOString().split('T')[0],
      habitaciones_count: Math.max(1, parseInt(rooms, 10) || 1),
      nights: Math.max(1, parseInt(nightsCount, 10) || 1),
      customer_name: `${nombre} ${apellidos}`.trim() || 'Huésped',
      customer_email: email.trim() || 'cliente@example.com',
      adultos: Math.max(1, parseInt(adults, 10) || 2),
      ninos: 0,
    };

    const codigoReservaPnr = `BKG-${uuidv4().substring(0, 6).toUpperCase()}`;
    const datosFactura = {
      tipo: 'alojamiento',
      pnr: codigoReservaPnr,
      titulo: `${alojamiento?.nombre || 'Alojamiento'} (${nightsCount} noches)`,
      total: totalPrice,
      pasajeros: [
        {
          firstName: nombre || 'Huésped',
          lastName: apellidos || '',
          documentNumber: user?.user_metadata?.cedula || '',
          email: email.trim() || user?.email || '',
        },
      ],
    };

    // Offline mode support
    if (!navigator.onLine) {
      await savePendingReservation(
        'alojamiento',
        { alojamientoId: alojamiento.id, data: payload },
        idempotencyKey,
        datosFactura
      );

      const localBooking = {
        id: codigoReservaPnr,
        reservationId: codigoReservaPnr,
        codigoReserva: codigoReservaPnr,
        alojamientoId: alojamiento.id,
        nombreAlojamiento: alojamiento?.nombre || null,
        photoUrl: Array.isArray(alojamiento?.photos) && alojamiento.photos.length > 0
          ? alojamiento.photos[0].url
          : null,
        destino: alojamiento?.destino || null,
        titulo: `${alojamiento?.nombre} (${nightsCount} noches)`,
        checkin: payload.checkin,
        checkout: payload.checkout,
        fecha: payload.checkin,
        habitaciones: payload.habitaciones_count,
        huespedes: payload.huespedes,
        huesped: `${nombre} ${apellidos}`.trim(),
        email: email.trim(),
        status: 'PENDING_OFFLINE',
        totalPrice,
      };

      const existing = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const existingIdx = existing.findIndex((r) =>
        (r.id && (r.id === localBooking.id || r.id === localBooking.reservationId || r.id === localBooking.codigoReserva)) ||
        (r.reservationId && (r.reservationId === localBooking.reservationId || r.reservationId === localBooking.id)) ||
        (r.alojamientoId === localBooking.alojamientoId && r.checkin === localBooking.checkin && r.checkout === localBooking.checkout)
      );
      if (existingIdx >= 0) {
        existing[existingIdx] = localBooking;
      } else {
        existing.unshift(localBooking);
      }
      localStorage.setItem('reservas_alojamientos', JSON.stringify(existing));

      setBookingConfirmed({ ...localBooking, offline: true });
      setStep(3);
      setLoading(false);
      if (onSuccess) onSuccess(localBooking);
      return;
    }

    try {
      const res = await reservarAlojamiento(alojamiento.id, payload, idempotencyKey);
      const reservationCode = res.codigo_reserva || res.codigoReserva || res.reservation_id || codigoReservaPnr;

      // Automated email invoice dispatch
      if (navigator.onLine) {
        enviarFacturaTrasCompra({
          ...datosFactura,
          pnr: String(reservationCode).substring(0, 8).toUpperCase(),
        });
      }

      const confirmedBooking = {
        id: res.reservation_id || res.id || reservationCode,
        reservationId: reservationCode,
        codigoReserva: reservationCode,
        alojamientoId: alojamiento.id,
        nombreAlojamiento: alojamiento?.nombre || null,
        photoUrl: Array.isArray(alojamiento?.photos) && alojamiento.photos.length > 0
          ? alojamiento.photos[0].url
          : null,
        destino: alojamiento?.destino || null,
        titulo: `${alojamiento?.nombre} (${nightsCount} noches)`,
        checkin: payload.checkin,
        checkout: payload.checkout,
        fecha: payload.checkin,
        habitaciones: payload.habitaciones_count,
        huespedes: payload.huespedes,
        huesped: `${nombre} ${apellidos}`.trim(),
        email: email.trim(),
        status: res.status || 'CONFIRMED',
        totalPrice,
      };

      const existing = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const existingIdx = existing.findIndex((r) =>
        (r.id && (r.id === confirmedBooking.id || r.id === confirmedBooking.reservationId || r.id === confirmedBooking.codigoReserva)) ||
        (r.reservationId && (r.reservationId === confirmedBooking.reservationId || r.reservationId === confirmedBooking.id)) ||
        (r.codigoReserva && (r.codigoReserva === confirmedBooking.codigoReserva || r.codigoReserva === confirmedBooking.id)) ||
        (r.alojamientoId === confirmedBooking.alojamientoId && r.checkin === confirmedBooking.checkin && r.checkout === confirmedBooking.checkout && r.status === confirmedBooking.status)
      );
      if (existingIdx >= 0) {
        existing[existingIdx] = confirmedBooking;
      } else {
        existing.unshift(confirmedBooking);
      }
      localStorage.setItem('reservas_alojamientos', JSON.stringify(existing));

      setBookingConfirmed(confirmedBooking);
      setStep(3);
      if (onSuccess) onSuccess(confirmedBooking);
    } catch (err) {
      if (err.response?.status === 409) {
        const errorDetail = err.response?.data?.detail || err.response?.data?.message;
        setErrorMsg(errorDetail || 'Esta reserva ya fue procesada anteriormente.');
      } else {
        const errorDetail = err.response?.data?.detail || err.response?.data?.message;
        const invalidParams = err.response?.data?.invalidParams?.map(p => `${p.name}: ${p.reason}`).join(', ');
        setErrorMsg(invalidParams || errorDetail || 'Hubo un inconveniente al procesar tu reserva. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  // PDF voucher generator identical to flights & mis reservas
  const handleDescargarPdf = () => {
    if (!bookingConfirmed) return;
    setIsDownloadingPdf(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(0, 108, 228);
        doc.text('Confirmacion de Reserva', 20, 30);

        const cleanText = (str) => (str || '').replace(/[^\x00-\xFF]/g, '').trim();

        doc.setFontSize(14);
        doc.setTextColor(51, 51, 51);
        doc.text('Servicio: Alojamiento', 20, 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        const tituloReserva = `${alojamiento.nombre || 'Alojamiento'} (${nightsCount} noches)`;
        doc.text(`Alojamiento: ${cleanText(tituloReserva)}`, 20, 60);

        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(20, 70, 170, 65, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.text('Detalles del Pago y Fechas', 25, 80);

        const pnr = bookingConfirmed.reservationId || bookingConfirmed.id || 'BKG-ALJ';

        doc.setFont('helvetica', 'normal');
        doc.text('Codigo (PNR):', 25, 95);
        doc.setFont('helvetica', 'bold');
        doc.text(`${pnr}`, 75, 95);

        doc.setFont('helvetica', 'normal');
        doc.text('Fechas de estancia:', 25, 105);
        doc.setFont('helvetica', 'bold');
        const fechaTexto = `${formatearFecha(checkin)} al ${formatearFecha(checkout)}`;
        doc.text(`${cleanText(fechaTexto)}`, 75, 105);

        doc.setFont('helvetica', 'normal');
        doc.text('Huesped:', 25, 115);
        doc.setFont('helvetica', 'bold');
        doc.text(`${cleanText(bookingConfirmed.huesped)}`, 75, 115);

        doc.setFont('helvetica', 'normal');
        doc.text('Importe Total:', 25, 125);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 128, 9);
        doc.text(`${currency} ${convertPrice(totalPrice)}`, 75, 125);

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(`Generado el ${new Date().toLocaleDateString()} a traves de Booking.com`, 20, 280);

        doc.save(`Confirmacion_${pnr}.pdf`);
      } catch (err) {
        console.error('Error al generar PDF de confirmación:', err);
      } finally {
        setIsDownloadingPdf(false);
      }
    }, 600);
  };

  return (
    <div className="bkg-checkout-overlay" role="dialog" aria-modal="true" aria-label="Proceso de reserva">
      {/* 1. TOP NAVBAR */}
      <header className="bkg-checkout-nav">
        <div className="bkg-checkout-nav-inner">
          <div className="bkg-checkout-logo">
            <span>Booking<span className="logo-dot">.</span>com</span>
          </div>
          <button
            type="button"
            className="bkg-checkout-close-btn"
            onClick={onClose}
            aria-label="Cerrar y volver al alojamiento"
          >
            <CloseIcon size={14} color="#ffffff" />
            <span>Volver al alojamiento</span>
          </button>
        </div>
      </header>

      {/* 2. STEPPER PROGRESS BAR */}
      <div className="bkg-checkout-stepper-wrap">
        <div className="bkg-checkout-stepper">
          <div className="bkg-step-item completed">
            <span className="bkg-step-circle">
              <CheckmarkIcon size={14} color="#ffffff" />
            </span>
            <span>Tu selección</span>
          </div>
          <div className="bkg-step-divider" />
          <div className={`bkg-step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
            <span className="bkg-step-circle">
              {step > 1 ? <CheckmarkIcon size={14} color="#ffffff" /> : '2'}
            </span>
            <span>Tus datos</span>
          </div>
          <div className="bkg-step-divider" />
          <div className={`bkg-step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
            <span className="bkg-step-circle">
              {step > 2 ? <CheckmarkIcon size={14} color="#ffffff" /> : '3'}
            </span>
            <span>Finalizar reserva</span>
          </div>
        </div>
      </div>

      {/* 3. STEP 3: CONFIRMED VIEW */}
      {step === 3 && bookingConfirmed ? (
        <main className="bkg-confirmed-container">
          {/* Banner offline: visible solo cuando la reserva fue guardada localmente */}
          {bookingConfirmed.offline && (
            <div style={{
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}>
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>📡</span>
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

          <div className="bkg-confirmed-header">
            <div className="bkg-confirmed-check-icon">
              <CheckmarkIcon size={32} color={bookingConfirmed.offline ? '#f59e0b' : '#059669'} />
            </div>
            <div>
              <h2>{bookingConfirmed.offline ? 'Guardado sin conexión' : '¡Tu reserva está confirmada!'}</h2>
              <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
                {bookingConfirmed.offline
                  ? 'La confirmación se enviará a tu correo cuando se restaure la conexión.'
                  : <>Hemos enviado la confirmación y los detalles de tu factura a <strong>{email}</strong>.</>
                }
              </p>
            </div>
          </div>

          <div className="bkg-confirmed-pnr-box">
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Número de confirmación (PNR)
              </span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#003580', letterSpacing: '1px' }}>
                {bookingConfirmed.reservationId || bookingConfirmed.id}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                PIN de seguridad
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#334155' }}>
                8492
              </div>
            </div>
          </div>

          <div className="bkg-confirmed-details-list">
            <div className="bkg-confirmed-detail-item">
              <strong>Alojamiento</strong>
              <span>{alojamiento.nombre}</span>
            </div>
            <div className="bkg-confirmed-detail-item">
              <strong>Huésped</strong>
              <span>{bookingConfirmed.huesped}</span>
            </div>
            <div className="bkg-confirmed-detail-item">
              <strong>Check-in</strong>
              <span>{checkin} (15:00 – 00:00)</span>
            </div>
            <div className="bkg-confirmed-detail-item">
              <strong>Check-out</strong>
              <span>{checkout} (05:00 – 11:00)</span>
            </div>
            <div className="bkg-confirmed-detail-item">
              <strong>Estancia</strong>
              <span>{nightsCount} noches, {rooms} habitación</span>
            </div>
            <div className="bkg-confirmed-detail-item">
              <strong>Total</strong>
              <span style={{ color: '#008009', fontWeight: 800, fontSize: '18px' }}>
                {currency} {convertPrice(totalPrice)}
              </span>
            </div>
          </div>

          <div className="bkg-confirmed-buttons">
            <button
              type="button"
              className="bkg-btn-primary"
              onClick={handleDescargarPdf}
              disabled={isDownloadingPdf}
            >
              {isDownloadingPdf ? 'Generando PDF...' : 'Descargar confirmación en PDF'}
            </button>
            <button
              type="button"
              className="bkg-btn-secondary"
              onClick={() => {
                onClose();
                navigate('/mis-reservas');
              }}
            >
              Ir a Mis Reservas
            </button>
          </div>
        </main>
      ) : (
        /* 4. STEPS 1 & 2: TWO COLUMNS (SIDEBAR + MAIN FORM) */
        <div className="bkg-checkout-container">
          {/* ==================== LEFT SIDEBAR ==================== */}
          <aside className="bkg-checkout-sidebar">
            {/* HOTEL DETAILS CARD */}
            <div className="bkg-card">
              <img
                src={alojamiento.fotos?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600'}
                alt={alojamiento.nombre}
                className="bkg-hotel-card-thumb"
              />
              <div className="bkg-hotel-stars">
                <StarFilledIcon size={14} color="#febb02" />
                <StarFilledIcon size={14} color="#febb02" />
                <StarFilledIcon size={14} color="#febb02" />
                <span style={{ background: '#febb02', color: '#1a1a1a', fontSize: '10px', padding: '2px 5px', borderRadius: '2px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 700, marginLeft: '4px' }}>
                  <ThumbsUpIcon size={11} color="#1a1a1a" />
                </span>
              </div>
              <h3 className="bkg-hotel-name">{alojamiento.nombre}</h3>
              <p className="bkg-hotel-address">{hotelAddress}</p>
              <div className="bkg-hotel-location-score">Excelente ubicación — 9.5</div>

              <div className="bkg-score-badge-row">
                <span className="bkg-score-badge">8.6</span>
                <span className="bkg-score-text"><strong>Fabuloso</strong> · 820 comentarios</span>
              </div>

              <div className="bkg-amenities-tags">
                <span className="bkg-amenity-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <PetsIcon size={13} color="#4b5563" /> Se admiten mascotas
                </span>
                <span className="bkg-amenity-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <WifiIcon size={13} color="#4b5563" /> WiFi gratis
                </span>
                <span className="bkg-amenity-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <AirportShuttleIcon size={13} color="#4b5563" /> Traslado aeropuerto
                </span>
                <span className="bkg-amenity-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ParkingIcon size={13} color="#4b5563" /> Estacionamiento
                </span>
              </div>
            </div>

            {/* YOUR BOOKING DETAILS */}
            <div className="bkg-card">
              <h4 className="bkg-card-title">Los datos de tu reserva</h4>
              <div className="bkg-booking-dates-grid">
                <div>
                  <div className="bkg-date-col-label">Entrada</div>
                  <div className="bkg-date-col-value">{checkin}</div>
                  <div className="bkg-date-col-hours">15:00 – 00:00</div>
                  <div className="bkg-today-tag">
                    <ClockIcon size={13} color="#d4111e" />
                    <span>El check-in es hoy</span>
                  </div>
                </div>
                <div>
                  <div className="bkg-date-col-label">Salida</div>
                  <div className="bkg-date-col-value">{checkout}</div>
                  <div className="bkg-date-col-hours">05:00 – 11:00</div>
                </div>
              </div>

              <div className="bkg-total-stay-text">
                Duración total de la estancia: <strong>{nightsCount} noches</strong>
                <br />
                <strong>{rooms} apartamento para {adults} adultos</strong>
              </div>

              {step === 1 && (
                <button
                  type="button"
                  className="bkg-change-selection-link"
                  onClick={onClose}
                  style={{ background: 'none', border: 'none', padding: 0 }}
                >
                  Cambiar selección
                </button>
              )}
            </div>

            {/* PRICE SUMMARY CARD */}
            <div className="bkg-card">
              <h4 className="bkg-card-title">Desglose del precio</h4>
              <div className="bkg-price-row strike">
                <span>Precio original</span>
                <span>{currency} {convertPrice(originalPrice)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="bkg-price-row discount">
                  <span>Escapada de fin de año / Late Escape Deal</span>
                  <span>- {currency} {convertPrice(discountAmount)}</span>
                </div>
              )}

              <div className="bkg-final-price-box">
                <div className="bkg-final-price-header">
                  <span className="bkg-final-price-label">Precio</span>
                  <span className="bkg-final-price-num">{currency} {convertPrice(totalPrice)}</span>
                </div>
                <div className="bkg-taxes-note">
                  + {currency} {convertPrice(taxes)} de impuestos y cargos
                </div>

                <button
                  type="button"
                  className="bkg-taxes-dropdown-btn"
                  onClick={() => setShowTaxesDetail(!showTaxesDetail)}
                >
                  {showTaxesDetail ? 'Ocultar detalles ▲' : 'Información sobre el precio ▼'}
                </button>

                {showTaxesDetail && (
                  <div className="bkg-taxes-breakdown">
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      No incluye {currency} {convertPrice(taxes)} en impuestos y cargos:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span>15% IVA</span>
                      <span>{currency} {convertPrice(ivaAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tarifa de limpieza</span>
                      <span>{currency} {convertPrice(cleaningFee)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CANCELLATION CARD */}
            <div className="bkg-card bkg-cancellation-card">
              <h4 className="bkg-card-title">¿Cuánto cuesta cancelar?</h4>
              <div>
                Si cancelas, tendrás que pagar:{' '}
                <span className="bkg-cancellation-price">{currency} {convertPrice(cancellationCost)}</span>
              </div>
            </div>

            {/* PROMO CODE CARD IN STEP 2 */}
            {step === 2 && (
              <div className="bkg-card">
                <h4 className="bkg-card-title">¿Tienes un código promocional?</h4>
                <div className="bkg-promo-input-row">
                  <input
                    type="text"
                    placeholder="Introduce tu código promocional"
                    className="bkg-promo-input"
                    value={codigoPromo}
                    onChange={(e) => setCodigoPromo(e.target.value)}
                    disabled={promoAplicada}
                  />
                  <button
                    type="button"
                    className="bkg-promo-btn"
                    onClick={handleAplicarPromo}
                    disabled={promoAplicada}
                  >
                    {promoAplicada ? 'Aplicado' : 'Aplicar'}
                  </button>
                </div>
                {promoAplicada && (
                  <p style={{ margin: '6px 0 0 0', color: '#008009', fontSize: '12px', fontWeight: 600 }}>
                    ¡Código de descuento aplicado con éxito!
                  </p>
                )}
                {promoError && (
                  <p style={{ margin: '6px 0 0 0', color: '#d4111e', fontSize: '12px' }}>
                    {promoError}
                  </p>
                )}
              </div>
            )}

            {/* LIMITED SUPPLY ALERT */}
            <div className="bkg-urgency-card">
              <ClockIcon size={20} color="#991b1b" />
              <div>
                <h5>Poca disponibilidad para tus fechas:</h5>
                <p>226 apartamentos como este ya no están disponibles en nuestra web.</p>
              </div>
            </div>
          </aside>

          {/* ==================== RIGHT MAIN COLUMN ==================== */}
          <main className="bkg-checkout-main">
            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '12px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 600 }}>
                {errorMsg}
              </div>
            )}

            {existingActiveBooking && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: 1.4 }}>
                  <strong>Aviso de reserva previa:</strong> Ya cuentas con una reserva confirmada para este alojamiento ({existingActiveBooking.checkin} al {existingActiveBooking.checkout}, Código: <strong>{existingActiveBooking.codigoReserva || existingActiveBooking.reservationId || existingActiveBooking.id}</strong>).
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/mis-reservas')}
                  style={{ background: '#006ce4', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Ver en Mis Reservas
                </button>
              </div>
            )}

            {/* STEP 1: TUS DATOS */}
            {step === 1 && (
              <form onSubmit={handleAvanzarPaso2}>
                {/* INFO BANNER */}
                <div className="bkg-info-banner">
                  <InfoIcon size={18} color="#003580" />
                  <span>¡Ya casi está! Solo llena los datos obligatorios marcados con *</span>
                </div>

                {/* CARD 1: PERSONAL DETAILS */}
                <div className="bkg-card" style={{ marginTop: '16px' }}>
                  <h3 className="bkg-card-title">Introduce tus datos</h3>

                  {/* Radio principal o para otra persona */}
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                    ¿Para quién es la reserva?
                  </div>
                  <div className="bkg-radio-group">
                    <label className="bkg-radio-label">
                      <input
                        type="radio"
                        name="paraQuien"
                        value="principal"
                        checked={paraQuien === 'principal'}
                        onChange={(e) => setParaQuien(e.target.value)}
                      />
                      <span>Soy el huésped principal</span>
                    </label>
                    <label className="bkg-radio-label">
                      <input
                        type="radio"
                        name="paraQuien"
                        value="otra_persona"
                        checked={paraQuien === 'otra_persona'}
                        onChange={(e) => setParaQuien(e.target.value)}
                      />
                      <span>La reserva es para otra persona</span>
                    </label>
                  </div>

                  {/* Radio viaja por trabajo */}
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                    ¿Viajas por trabajo?
                  </div>
                  <div className="bkg-radio-group">
                    <label className="bkg-radio-label">
                      <input
                        type="radio"
                        name="trabajo"
                        value="si"
                        checked={viajaPorTrabajo === 'si'}
                        onChange={(e) => setViajaPorTrabajo(e.target.value)}
                      />
                      <span>Sí</span>
                    </label>
                    <label className="bkg-radio-label">
                      <input
                        type="radio"
                        name="trabajo"
                        value="no"
                        checked={viajaPorTrabajo === 'no'}
                        onChange={(e) => setViajaPorTrabajo(e.target.value)}
                      />
                      <span>No</span>
                    </label>
                  </div>

                  {/* Nombres y Apellidos */}
                  <div className="bkg-form-grid-2">
                    <div className="bkg-input-group">
                      <label htmlFor="chk-nombre">Nombre *</label>
                      <input
                        id="chk-nombre"
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Juan"
                        required
                      />
                    </div>
                    <div className="bkg-input-group">
                      <label htmlFor="chk-apellidos">Apellidos *</label>
                      <input
                        id="chk-apellidos"
                        type="text"
                        value={apellidos}
                        onChange={(e) => setApellidos(e.target.value)}
                        placeholder="Ej. Pérez Cadena"
                        required
                      />
                    </div>
                  </div>

                  {/* Email & Confirm */}
                  <div className="bkg-form-grid-2">
                    <div className="bkg-input-group">
                      <label htmlFor="chk-email">Dirección de e-mail *</label>
                      <input
                        id="chk-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nombre@ejemplo.com"
                        required
                      />
                      <span className="bkg-input-subtext">
                        El e-mail de confirmación se enviará a esta dirección
                      </span>
                    </div>
                    <div className="bkg-input-group">
                      <label htmlFor="chk-confirm-email">Confirmar dirección de e-mail *</label>
                      <input
                        id="chk-confirm-email"
                        type="email"
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        placeholder="nombre@ejemplo.com"
                        required
                      />
                    </div>
                  </div>

                  {/* País y Teléfono */}
                  <div className="bkg-form-grid-2">
                    <div className="bkg-input-group">
                      <label htmlFor="chk-pais">País o territorio *</label>
                      <select
                        id="chk-pais"
                        value={pais}
                        onChange={(e) => {
                          setPais(e.target.value);
                          const p = PAISES.find((x) => x.code === e.target.value);
                          if (p) setTelefonoPrefijo(p.prefix);
                        }}
                      >
                        {PAISES.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bkg-input-group">
                      <label htmlFor="chk-telefono">Número de teléfono *</label>
                      <div className="bkg-phone-wrapper">
                        <select
                          className="bkg-phone-prefix-select"
                          value={telefonoPrefijo}
                          onChange={(e) => setTelefonoPrefijo(e.target.value)}
                        >
                          {PAISES.map((p) => (
                            <option key={p.code} value={p.prefix}>
                              {p.code} {p.prefix}
                            </option>
                          ))}
                        </select>
                        <input
                          id="chk-telefono"
                          type="tel"
                          style={{ flex: 1 }}
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          placeholder="0991234567"
                          required
                        />
                      </div>
                      <span className="bkg-input-subtext">
                        Por si el alojamiento necesita contactar contigo.
                      </span>
                    </div>
                  </div>

                  {/* Checkbox confirmacion sin papel */}
                  <label className="bkg-checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmacionSinPapel}
                      onChange={(e) => setConfirmacionSinPapel(e.target.checked)}
                    />
                    <span>Sí, quiero confirmación sin papel gratuita (recomendado)</span>
                  </label>
                </div>

                {/* CARD 2: ROOM SUMMARY */}
                <div className="bkg-card">
                  <h4 className="bkg-card-title">{alojamiento.tipo_alojamiento || 'Departamento de 2 dormitorios'}</h4>
                  <div className="bkg-room-summary-box">
                    <div style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: 600 }}>
                      Apartamento entero · 95 m² · {adults} adultos
                    </div>
                    <div className="bkg-room-badge-row">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckmarkIcon size={14} color="#008009" /> Cancelación gratis
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckmarkIcon size={14} color="#008009" /> WiFi gratis
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckmarkIcon size={14} color="#008009" /> No se puede fumar
                      </span>
                    </div>
                  </div>
                  <div className="bkg-input-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="chk-guest-name">Nombre completo del huésped *</label>
                    <input
                      id="chk-guest-name"
                      type="text"
                      placeholder="Nombre del huésped que se alojará"
                      value={nombreHuesped || `${nombre} ${apellidos}`.trim()}
                      onChange={(e) => setNombreHuesped(e.target.value)}
                    />
                  </div>
                </div>

                {/* CARD 3: ADDONS */}
                <div className="bkg-card">
                  <h4 className="bkg-card-title">Añade a tu estancia</h4>
                  <div className="bkg-addon-item">
                    <div className="bkg-addon-info">
                      <h6>Quiero alquilar un coche con un 5% de descuento</h6>
                      <p>Ahorra en alquiler de autos para moverte con total libertad en tu destino.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={deseaAuto}
                      onChange={(e) => setDeseaAuto(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                  <div className="bkg-addon-item">
                    <div className="bkg-addon-info">
                      <h6>Quiero reservar un taxi privado con antelación</h6>
                      <p>Evita sorpresas y viaja sin estrés desde el aeropuerto hasta el alojamiento.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={deseaTaxi}
                      onChange={(e) => setDeseaTaxi(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* CARD 4: SPECIAL REQUESTS */}
                <div className="bkg-card">
                  <h4 className="bkg-card-title">Peticiones especiales</h4>
                  <p style={{ fontSize: '12px', color: '#595959', margin: '0 0 8px 0' }}>
                    El alojamiento no puede garantizar que se cumplan las peticiones especiales, pero hará todo lo posible por ayudarte.
                  </p>
                  <div className="bkg-input-group" style={{ marginBottom: 0 }}>
                    <textarea
                      rows={3}
                      placeholder="Escribe tus peticiones en inglés o español (opcional)..."
                      value={peticionesEspeciales}
                      onChange={(e) => setPeticionesEspeciales(e.target.value)}
                    />
                  </div>
                </div>

                {/* CARD 5: ARRIVAL TIME */}
                <div className="bkg-card">
                  <h4 className="bkg-card-title">Tu hora de llegada</h4>
                  <p style={{ fontSize: '13px', color: '#1a1a1a', margin: '0 0 4px 0' }}>
                    Tu habitación estará lista para el check-in entre las 15:00 y las 00:00.
                  </p>
                  <p style={{ fontSize: '12px', color: '#595959', margin: '0 0 12px 0' }}>
                    Recepción 24 horas: ¡siempre habrá alguien para recibirte!
                  </p>
                  <div className="bkg-input-group" style={{ maxWidth: '320px', marginBottom: 0 }}>
                    <label htmlFor="chk-arrival">Añade tu hora estimada de llegada</label>
                    <select
                      id="chk-arrival"
                      value={horaLlegada}
                      onChange={(e) => setHoraLlegada(e.target.value)}
                    >
                      <option value="No lo sé">No lo sé</option>
                      <option value="12:00 - 13:00">12:00 – 13:00</option>
                      <option value="13:00 - 14:00">13:00 – 14:00</option>
                      <option value="14:00 - 15:00">14:00 – 15:00</option>
                      <option value="15:00 - 16:00">15:00 – 16:00</option>
                      <option value="16:00 - 17:00">16:00 – 17:00</option>
                      <option value="17:00 - 18:00">17:00 – 18:00</option>
                      <option value="18:00 - 19:00">18:00 – 19:00</option>
                      <option value="19:00 - 20:00">19:00 – 20:00</option>
                      <option value="20:00 - 21:00">20:00 – 21:00</option>
                      <option value="21:00 - 22:00">21:00 – 22:00</option>
                      <option value="22:00 - 23:00">22:00 – 23:00</option>
                      <option value="23:00 - 00:00">23:00 – 00:00</option>
                    </select>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="bkg-checkout-actions">
                  <div className="bkg-price-match-guarantee">
                    <ShieldCheckIcon size={18} color="#008009" />
                    <span>Igualamos el precio</span>
                  </div>
                  <button type="submit" className="bkg-btn-primary">
                    <span>Siguiente: últimos datos</span>
                    <span>&gt;</span>
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: FINALIZAR RESERVA / PAGO */}
            {step === 2 && (
              <form onSubmit={handleCompletarReserva}>
                {/* CARD 1: PAY WITH THE PROPERTY */}
                <div className="bkg-pay-property-banner">
                  <h4>Paga en el alojamiento</h4>
                  <p>
                    El alojamiento gestionará el pago. La fecha de cargo depende de las condiciones de la reserva.
                  </p>
                </div>

                {/* CARD 2: HOW WOULD YOU LIKE TO PAY */}
                <div className="bkg-card">
                  <h3 className="bkg-card-title">¿Cómo quieres pagar?</h3>

                  {/* BRAND ICONS */}
                  <div className="bkg-card-brands-row">
                    <span className="bkg-brand-badge" style={{ color: '#002663' }}>AMEX</span>
                    <span className="bkg-brand-badge" style={{ color: '#d9222a' }}>UnionPay</span>
                    <span className="bkg-brand-badge" style={{ color: '#004a98' }}>Diners Club</span>
                    <span className="bkg-brand-badge" style={{ color: '#f76b1c' }}>Discover</span>
                    <span className="bkg-brand-badge" style={{ color: '#006241' }}>JCB</span>
                    <span className="bkg-brand-badge" style={{ color: '#eb001b' }}>MasterCard</span>
                    <span className="bkg-brand-badge" style={{ color: '#1a1f71' }}>VISA</span>
                  </div>

                  {/* TITULAR */}
                  <div className="bkg-input-group">
                    <label htmlFor="chk-titular">Nombre del titular de la tarjeta *</label>
                    <input
                      id="chk-titular"
                      type="text"
                      value={titularTarjeta}
                      onChange={(e) => setTitularTarjeta(e.target.value)}
                      placeholder="Nombre como figura en la tarjeta"
                      required
                    />
                  </div>

                  {/* NUMERO DE TARJETA */}
                  <div className="bkg-input-group">
                    <label htmlFor="chk-numero-tarjeta">Número de tarjeta *</label>
                    <div className="bkg-card-input-with-icon">
                      <CreditCardIcon size={20} color="#6b7280" />
                      <input
                        id="chk-numero-tarjeta"
                        type="text"
                        maxLength={19}
                        placeholder="•••• •••• •••• ••••"
                        value={numeroTarjeta}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                          const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                          setNumeroTarjeta(formatted);
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* CADUCIDAD Y CVC */}
                  <div className="bkg-form-grid-2">
                    <div className="bkg-input-group">
                      <label htmlFor="chk-caducidad">Fecha de caducidad *</label>
                      <input
                        id="chk-caducidad"
                        type="text"
                        maxLength={5}
                        placeholder="MM / AA"
                        value={fechaCaducidad}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                          if (val.length > 2) val = `${val.slice(0, 2)}/${val.slice(2)}`;
                          setFechaCaducidad(val);
                        }}
                        required
                      />
                    </div>

                    <div className="bkg-input-group">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label htmlFor="chk-cvc">CVC *</label>
                        <span title="Código de 3 o 4 dígitos al reverso de la tarjeta" style={{ cursor: 'pointer', color: '#006ce4' }}>
                          <InfoIcon size={14} color="#006ce4" />
                        </span>
                      </div>
                      <input
                        id="chk-cvc"
                        type="password"
                        maxLength={4}
                        placeholder="•••"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* MARKETING CHECKBOX */}
                <div className="bkg-card">
                  <label className="bkg-checkbox-label">
                    <input
                      type="checkbox"
                      checked={aceptaMarketing}
                      onChange={(e) => setAceptaMarketing(e.target.checked)}
                    />
                    <span>
                      Acepto recibir e-mails de marketing de Booking.com, como ofertas, promociones, recomendaciones personalizadas y novedades sobre productos y servicios.
                    </span>
                  </label>
                  <p style={{ margin: '8px 0 0 24px', fontSize: '12px', color: '#595959', lineHeight: 1.4 }}>
                    Puedes cancelar la suscripción en cualquier momento haciendo clic en el enlace del pie de página de nuestros e-mails. Consulta nuestra política de privacidad.
                  </p>
                </div>

                {/* LEGAL CLAUSE */}
                <div style={{ fontSize: '12px', color: '#595959', lineHeight: 1.4, margin: '8px 0' }}>
                  Tu reserva es directamente con {alojamiento.nombre}. Al pulsar en "Completar reserva", aceptas las{' '}
                  <span style={{ color: '#006ce4', textDecoration: 'underline', cursor: 'pointer' }}>condiciones de la reserva</span>, las{' '}
                  <span style={{ color: '#006ce4', textDecoration: 'underline', cursor: 'pointer' }}>condiciones generales</span> y la{' '}
                  <span style={{ color: '#006ce4', textDecoration: 'underline', cursor: 'pointer' }}>política de privacidad</span>.
                </div>

                {/* ACTIONS */}
                <div className="bkg-checkout-actions">
                  <button
                    type="button"
                    className="bkg-btn-secondary"
                    onClick={() => {
                      setStep(1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    ← Modificar tus datos
                  </button>

                  <button
                    type="submit"
                    className="bkg-btn-primary"
                    disabled={loading}
                  >
                    <LockIcon size={16} color="#ffffff" />
                    <span>{loading ? 'Confirmando reserva...' : 'Completar reserva'}</span>
                  </button>
                </div>

                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                  <a href="#condiciones" onClick={(e) => e.preventDefault()} style={{ fontSize: '12px', color: '#006ce4', textDecoration: 'underline' }}>
                    ¿Cuáles son mis condiciones de reserva?
                  </a>
                </div>
              </form>
            )}
          </main>
        </div>
      )}

      {/* Modal offline: aparece cuando se pulsa Completar reserva sin internet */}
      {showOfflineModal && (
        <OfflineReservaModal
          onContinuar={() => {
            setShowOfflineModal(false);
            handleCompletarReserva({ preventDefault: () => {} });
          }}
          onCancelar={() => {
            setShowOfflineModal(false);
            setPendingOfflinePay(false);
          }}
        />
      )}
    </div>
  );
}

