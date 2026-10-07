import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getAlojamiento, reservarAlojamiento, getDisponibilidadAlojamiento } from '../services/alojamientosApi';
import { API_BASE } from '../services/api';
import { getAtracciones } from '../services/atraccionesApi';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/CurrencyContext';
import { savePendingReservation } from '../services/offlineSync';
import { formatearFecha } from '../services/formato';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import { AlojamientoCheckoutModal } from '../components/AlojamientoCheckoutModal';
import { ReportModal } from '../components/ReportModal';

const ESTADOS_ES = {
  PENDING: 'Pendiente',
  PENDING_PAYMENT: 'Pendiente de pago',
  TICKET_ISSUING: 'Emitiendo billetes',
  CONFIRMED: 'Confirmada',
  FAILED: 'Fallida',
  CHANGE_PENDING: 'Cambio en curso',
  CANCELLATION_PENDING: 'Cancelación en curso',
  CANCELLED: 'Cancelada',
  PENDING_OFFLINE: 'Pendiente (Offline)',
};
import {
  BedIcon,
  CalendarIcon,
  UserIcon,
  PinIcon,
  CheckmarkIcon,
  WifiIcon,
  PoolIcon,
  ParkingIcon,
  CoffeeIcon,
  PetsIcon,
  NoSmokingIcon,
  FamilyIcon,
  ShowerIcon,
  KitchenIcon,
  ApartmentIcon,
  ClockIcon,
  InfoIcon,
  CreditCardIcon,
  GymIcon,
  TvIcon,
  ShieldCheckIcon,
  LandmarkIcon,
  TrainIcon,
  TravelProudIcon,
  GeniusGiftIcon,
  SurveyAvatarIcon,
  CloseIcon,
  StarFilledIcon,
  StarIcon,
  PriceMatchIcon,
  HeartIcon,
  ShareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../components/BookingIcons';
import './AlojamientoDetail.css';

// High-res gallery photos matching Booking.com desktop layout
const GALLERY_DEFAULT_PHOTOS = [
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/833148758.jpg?k=4af6fee87e75cf2bdb688cfa67e30d77b3282140a0ed4ee22ac61e5be30b95dd&o=&hp=1', caption: 'Piscina en la azotea con vista panorámica a la ciudad' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/905741452.jpg?k=2c8998f3c9385578508b687a6a3bf803a685941e58067f121557016a6e27352e&o=&hp=1', caption: 'Baño privado con ducha de diseño y acabados en mármol' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/905741462.jpg?k=e1df22825c4fec8750f395c5030aad8742ecfd7b9e7df24cf993514402b5357a&o=&hp=1', caption: 'Dormitorio principal con cama matrimonial y ventanales' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/905741459.jpg?k=a8c16d03562400ff7c8c3b03cba10760928da608b9abd33b94ab60c2b82de61a&o=&hp=1', caption: 'Comedor con mesa moderna y luz natural' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/855893551.jpg?k=0e8928ddc786ebd626a6e48664e20218178e6c1f66d95e9c09b19b722ab6959e&o=&hp=1', caption: 'Gimnasio completamente equipado con vistas a Quito' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/833149322.jpg?k=181ee9413f7de41d7287c68c3759f6c89d681df9ed23636b5847f67d59eb9b51&o=&hp=1', caption: 'Vista del parque La Carolina desde el edificio' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/905745401.jpg?k=55617c39e4cd1c9220e24468dae9fc424972ce977b7a041ad8c54e0c426dd7bc&o=&hp=1', caption: 'Segundo dormitorio con dos camas individuales' },
  { url: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/833149258.jpg?k=50b981ea59873de377d07e18f7eaccdc51ad1d71852ac1f94fffa905781a3fd0&o=&hp=1', caption: 'Lobby principal con conserjería 24 horas' },
];

// Fallback curated tours matching Booking.com Things to do
const DEFAULT_ATTRACTIONS = [
  {
    id: 'attr-quito-01',
    name: 'Quito City Bus Tour',
    photos: [{ url: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=500' }],
    ratings: { score: 4.26, number_of_reviews: 119 },
    price: { total: 15 },
    free_cancellation: true,
  },
  {
    id: 'attr-quito-02',
    name: 'Cotopaxi Full-Day from Quito Including Entrances',
    photos: [{ url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=500' }],
    ratings: { score: 4.8, number_of_reviews: 262 },
    price: { total: 59 },
    free_cancellation: true,
  },
  {
    id: 'attr-quito-03',
    name: 'Quito Old Town tip based walking tour small groups',
    photos: [{ url: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=500' }],
    ratings: { score: 4.95, number_of_reviews: 38 },
    price: { total: 5 },
    free_cancellation: true,
  },
  {
    id: 'attr-quito-04',
    name: 'Gastronomic and Cultural Walking Tour of Quito with Tastings',
    photos: [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500' }],
    ratings: { score: 4.83, number_of_reviews: 274 },
    price: { total: 40 },
    free_cancellation: true,
  },
];

export function AlojamientoDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, convertPrice } = useCurrency();

  // URL parameters
  const queryCheckin = searchParams.get('checkin') || '2026-10-07';
  const queryCheckout = searchParams.get('checkout') || '2026-11-01';
  const queryAdults = parseInt(searchParams.get('group_adults') || '2', 10);
  const queryRooms = parseInt(searchParams.get('no_rooms') || '1', 10);

  // Core Data
  const [alojamiento, setAlojamiento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attractions, setAttractions] = useState([]);

  // Search State on Property Page
  const [searchDest, setSearchDest] = useState('Quito');
  const [checkin, setCheckin] = useState(queryCheckin);
  const [checkout, setCheckout] = useState(queryCheckout);
  const [adults, setAdults] = useState(queryAdults);
  const [rooms, setRooms] = useState(queryRooms);
  const [showDatesPopover, setShowDatesPopover] = useState(false);
  const [showOccupancyPopover, setShowOccupancyPopover] = useState(false);

  // Helper for formatting Booking date ranges (e.g., vie. 9 oct. — dom. 11 oct.)
  const formatBookingDateRange = (startStr, endStr) => {
    if (!startStr || !endStr) return 'Selecciona las fechas';
    try {
      const [y1, m1, d1] = startStr.split('-').map(Number);
      const [y2, m2, d2] = endStr.split('-').map(Number);
      const dStart = new Date(y1, m1 - 1, d1);
      const dEnd = new Date(y2, m2 - 1, d2);
      const days = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
      const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
      return `${days[dStart.getDay()]} ${d1} ${months[dStart.getMonth()]} — ${days[dEnd.getDay()]} ${d2} ${months[dEnd.getMonth()]}`;
    } catch {
      return `${startStr} — ${endStr}`;
    }
  };

  // UI Interactive States
  const [activeTab, setActiveTab] = useState('overview');
  const [isSaved, setIsSaved] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [surveyResponse, setSurveyResponse] = useState('');

  // Booking Form State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Disponibilidad de habitaciones en tiempo real
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(false);

  // Detectar si el usuario ya tiene una reserva confirmada para este alojamiento en estas fechas
  const existingActiveBooking = useMemo(() => {
    try {
      const reservas = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      return reservas.find((r) =>
        (r.alojamientoId === id || r.alojamiento_id === id) &&
        !['CANCELLED', 'Cancelada', 'FALLIDA'].includes(r.status) &&
        (r.checkin === checkin || (r.checkin < checkout && r.checkout > checkin))
      );
    } catch {
      return null;
    }
  }, [id, checkin, checkout]);

  // Sincronizar disponibilidad en tiempo real
  useEffect(() => {
    if (!id) return;
    let isCancelled = false;
    const fetchAvail = async () => {
      setLoadingDisponibilidad(true);
      try {
        const data = await getDisponibilidadAlojamiento(id, { checkin, checkout });
        if (!isCancelled) {
          setDisponibilidad(data);
          if (data && typeof data.available_rooms === 'number') {
            if (data.available_rooms > 0 && rooms > data.available_rooms) {
              setRooms(data.available_rooms);
            }
          }
        }
      } catch (err) {
        console.warn('Error verificando disponibilidad de habitaciones:', err);
      } finally {
        if (!isCancelled) setLoadingDisponibilidad(false);
      }
    };
    fetchAvail();
    return () => { isCancelled = true; };
  }, [id, checkin, checkout]);

  // References for Smooth Scrolling
  const overviewRef = useRef(null);
  const availabilityRef = useRef(null);
  const facilitiesRef = useRef(null);
  const rulesRef = useRef(null);
  const reviewsRef = useRef(null);

  // Reviews State
  const [resenas, setResenas] = useState([]);
  const [resenasScores, setResenasScores] = useState(null);
  const [resenasLoading, setResenasLoading] = useState(false);

  // Pre-fill user profile if logged in
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

  // Load Resenas
  useEffect(() => {
    if (!id) return;
    setResenasLoading(true);
    fetch(`${API_BASE}/alojamientos/${id}/resenas`)
      .then((r) => r.json())
      .then((data) => {
        setResenas(data.resenas || []);
        setResenasScores(data.scores || null);
      })
      .catch(() => {})
      .finally(() => setResenasLoading(false));
  }, [id]);

  // Load Alojamiento & Related Attractions
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [data, attrData] = await Promise.allSettled([
          getAlojamiento(id),
          getAtracciones({ limit: 4 }),
        ]);

        if (data.status === 'fulfilled') {
          setAlojamiento(data.value);
          if (data.value.destino) setSearchDest(data.value.destino);
        } else {
          setError('No se pudo encontrar el alojamiento seleccionado.');
        }

        if (attrData.status === 'fulfilled' && Array.isArray(attrData.value?.data || attrData.value)) {
          const items = attrData.value?.data || attrData.value;
          if (items.length > 0) {
            setAttractions(items);
          } else {
            setAttractions(DEFAULT_ATTRACTIONS);
          }
        } else {
          setAttractions(DEFAULT_ATTRACTIONS);
        }
      } catch (err) {
        setError('No se pudo encontrar el alojamiento seleccionado.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  // Photo gallery with fallbacks
  const photos = useMemo(() => {
    if (alojamiento?.photos && alojamiento.photos.length >= 4) {
      return alojamiento.photos;
    }
    return GALLERY_DEFAULT_PHOTOS;
  }, [alojamiento]);

  // Nights calculation
  const nightsCount = useMemo(() => {
    try {
      const d1 = new Date(checkin);
      const d2 = new Date(checkout);
      const diffTime = Math.abs(d2 - d1);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 25;
    } catch {
      return 25;
    }
  }, [checkin, checkout]);

  // Price calculations
  const pricePerNight = Number(alojamiento?.precioPorNoche || alojamiento?.precio_noche || 91);
  const totalPrice = Math.round(pricePerNight * nightsCount * rooms);
  const originalPrice = Math.round(totalPrice * 1.14);
  const taxes = Math.round(totalPrice * 0.15);

  const scrollToSection = (ref, tabName) => {
    setActiveTab(tabName);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Reservation handler
  const handleBookingSubmit = async (e) => {
    if (e) e.preventDefault();
    if (bookingLoading) return; // Prevenir doble clic

    if (!customerName.trim()) {
      setBookingError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!customerEmail.trim()) {
      setBookingError('Por favor ingresa tu correo electrónico.');
      return;
    }

    // Validar disponibilidad de habitaciones
    if (disponibilidad && typeof disponibilidad.available_rooms === 'number' && disponibilidad.available_rooms < parseInt(rooms, 10)) {
      setBookingError(`Lo sentimos, solo quedan ${disponibilidad.available_rooms} habitaciones disponibles para estas fechas.`);
      return;
    }

    setBookingLoading(true);
    setBookingError(null);
    setBookingSuccess(null);

    const idempotencyKey = uuidv4();
    const payload = {
      checkin,
      checkout,
      habitaciones_count: parseInt(rooms, 10),
      nights: nightsCount,
      customer_name: customerName,
      customer_email: customerEmail,
    };

    const codigoReservaPnr = `BKG-${uuidv4().substring(0, 6).toUpperCase()}`;
    const datosFactura = {
      tipo: 'alojamiento',
      pnr: codigoReservaPnr,
      titulo: `${alojamiento?.nombre || 'Alojamiento'} (${nightsCount} noches)`,
      total: totalPrice,
      pasajeros: [
        {
          firstName: customerName || user?.user_metadata?.nombre || 'Huésped',
          lastName: user?.user_metadata?.apellido || '',
          documentNumber: user?.user_metadata?.cedula || '',
          email: customerEmail || user?.email || '',
        },
      ],
    };

    // Offline flow
    if (!navigator.onLine) {
      await savePendingReservation(
        'alojamiento',
        { alojamientoId: id, data: payload },
        idempotencyKey,
        datosFactura
      );

      const localBooking = {
        id: codigoReservaPnr,
        reservationId: codigoReservaPnr,
        alojamientoId: id,
        titulo: `${alojamiento?.nombre} (${nightsCount} noches)`,
        checkin,
        checkout,
        fecha: checkin,
        habitaciones: rooms,
        huesped: customerName,
        email: customerEmail,
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

      setBookingSuccess({ ...localBooking, offline: true });
      setBookingLoading(false);
      return;
    }

    try {
      const res = await reservarAlojamiento(id, payload, idempotencyKey);
      const reservationCode = res.codigo_reserva || res.codigoReserva || res.reservation_id || codigoReservaPnr;

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
        alojamientoId: id,
        titulo: `${alojamiento?.nombre} (${nightsCount} noches)`,
        checkin,
        checkout,
        fecha: checkin,
        habitaciones: rooms,
        huesped: customerName,
        email: customerEmail,
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

      setBookingSuccess(confirmedBooking);
    } catch (err) {
      if (err.response?.status === 409) {
        const errorDetail = err.response?.data?.detail || err.response?.data?.message;
        setBookingError(errorDetail || 'Esta reserva ya fue registrada anteriormente.');
      } else {
        const errorDetail = err.response?.data?.detail || err.response?.data?.message;
        setBookingError(errorDetail || 'Error al procesar la reserva. Intenta de nuevo.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  // PDF confirmation export (idéntica a la generada por Vuelos en Mis Reservas)
  const handleDescargarComprobante = () => {
    if (!bookingSuccess || !alojamiento) return;
    setIsDownloadingPdf(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF();

        // Colores y Fuentes
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(0, 108, 228); // Azul Booking
        doc.text('Confirmacion de Reserva', 20, 30);

        // Función para limpiar emojis y caracteres especiales no soportados por jsPDF base
        const cleanText = (str) => (str || '').replace(/[^\x00-\xFF]/g, '').trim();

        doc.setFontSize(14);
        doc.setTextColor(51, 51, 51);
        doc.text('Servicio: Alojamiento', 20, 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        const tituloReserva = `${alojamiento.nombre || 'Alojamiento'} (${nightsCount} noches)`;
        doc.text(`Nombre de reserva: ${cleanText(tituloReserva)}`, 20, 60);

        // Bloque de datos
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(20, 70, 170, 60, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.text('Detalles del Pago y Fechas', 25, 80);

        const pnr = bookingSuccess.reservationId || bookingSuccess.id || 'BKG-ALJ';

        doc.setFont('helvetica', 'normal');
        doc.text('Código (PNR):', 25, 95);
        doc.setFont('helvetica', 'bold');
        doc.text(`${pnr}`, 70, 95);

        doc.setFont('helvetica', 'normal');
        doc.text('Fecha del servicio:', 25, 105);
        doc.setFont('helvetica', 'bold');
        const fechaTexto = `${formatearFecha(checkin)} al ${formatearFecha(checkout)}`;
        doc.text(`${cleanText(fechaTexto)}`, 70, 105);

        doc.setFont('helvetica', 'normal');
        doc.text('Estado actual:', 25, 115);
        doc.setFont('helvetica', 'bold');
        const estadoTexto = ESTADOS_ES[bookingSuccess.status] ?? (bookingSuccess.status || 'Confirmada');
        doc.text(`${estadoTexto}`, 70, 115);

        doc.setFont('helvetica', 'normal');
        doc.text('Total pagado:', 25, 125);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 128, 9); // Verde Booking
        doc.text(`${convertPrice(totalPrice)}`, 70, 125);

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(`Generado automáticamente el ${new Date().toLocaleDateString()}`, 20, 280);

        doc.save(`Reserva_${pnr}.pdf`);
      } catch (err) {
        console.error('Error al generar PDF:', err);
      } finally {
        setIsDownloadingPdf(false);
      }
    }, 800);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', color: '#003580' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e0e0e0',
            borderTopColor: '#006ce4',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px auto',
          }}
        />
        <h2>Cargando alojamiento...</h2>
      </div>
    );
  }

  if (error || !alojamiento) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '24px', background: '#fee2e2', borderRadius: '8px' }}>
        <h3>Error</h3>
        <p>{error || 'Alojamiento no encontrado'}</p>
        <button
          onClick={() => navigate('/alojamientos/search?ss=Quito')}
          style={{ marginTop: '16px', padding: '8px 16px', background: '#003580', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Volver a la búsqueda
        </button>
      </div>
    );
  }

  const score = Number(alojamiento.ratings?.score || 8.7).toFixed(1);
  const reviewsCount = alojamiento.ratings?.number_of_reviews || 24;

  const availableRoomsCount = disponibilidad && typeof disponibilidad.available_rooms === 'number'
    ? disponibilidad.available_rooms
    : (alojamiento.habitaciones || 5);
  const isSoldOut = availableRoomsCount <= 0;

  return (
    <div className="dt-page-wrapper">
      {/* ======================================================================
          1. TOP SEARCH SUB-BAR
          ====================================================================== */}
      <section className="dt-search-container">
        <div className="dt-search-inner">
          <form
            className="dt-search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/alojamientos/search?ss=${encodeURIComponent(searchDest)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&no_rooms=${rooms}`);
            }}
          >
            {/* Field 1: Destination */}
            <div className="dt-search-field">
              <span className="dt-field-icon">
                <BedIcon size={22} color="#1a1a1a" />
              </span>
              <div className="dt-field-content">
                <span className="dt-field-label">Indica el destino</span>
                <input
                  type="text"
                  className="dt-search-input"
                  placeholder="¿A dónde vas?"
                  value={searchDest}
                  onChange={(e) => setSearchDest(e.target.value)}
                />
              </div>
              {searchDest && (
                <button
                  type="button"
                  className="dt-field-clear"
                  onClick={() => setSearchDest('')}
                  aria-label="Borrar destino"
                >
                  <CloseIcon size={14} color="#595959" />
                </button>
              )}
            </div>

            {/* Field 2: Dates */}
            <div
              className="dt-search-field dt-clickable-field"
              onClick={() => {
                setShowDatesPopover(!showDatesPopover);
                setShowOccupancyPopover(false);
              }}
            >
              <span className="dt-field-icon">
                <CalendarIcon size={22} color="#1a1a1a" />
              </span>
              <div className="dt-field-content">
                <span className="dt-field-label">Selecciona las fechas</span>
                <span className="dt-field-value">
                  {formatBookingDateRange(checkin, checkout)}
                </span>
              </div>

              {showDatesPopover && (
                <div
                  className="dt-popover dt-dates-popover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="dt-popover-header">
                    <strong>Fechas de estancia</strong>
                    <button
                      type="button"
                      className="dt-popover-close"
                      onClick={() => setShowDatesPopover(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="dt-dates-inputs">
                    <div className="dt-date-col">
                      <label>Check-in</label>
                      <input
                        type="date"
                        value={checkin}
                        onChange={(e) => setCheckin(e.target.value)}
                        className="dt-popover-date-input"
                      />
                    </div>
                    <div className="dt-date-col">
                      <label>Check-out</label>
                      <input
                        type="date"
                        value={checkout}
                        onChange={(e) => setCheckout(e.target.value)}
                        className="dt-popover-date-input"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dt-popover-done-btn"
                    onClick={() => setShowDatesPopover(false)}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* Field 3: Occupancy */}
            <div
              className="dt-search-field dt-clickable-field"
              onClick={() => {
                setShowOccupancyPopover(!showOccupancyPopover);
                setShowDatesPopover(false);
              }}
            >
              <span className="dt-field-icon">
                <UserIcon size={22} color="#1a1a1a" />
              </span>
              <div className="dt-field-content">
                <span className="dt-field-label">Personas y habitaciones</span>
                <span className="dt-field-value">
                  {adults} adultos · 0 niños · {rooms} hab.
                </span>
              </div>
              <span className="dt-field-chevron">
                <ChevronDownIcon size={14} color="#595959" />
              </span>

              {showOccupancyPopover && (
                <div
                  className="dt-popover dt-occupancy-popover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="dt-popover-row">
                    <div>
                      <div className="dt-row-title">Adultos</div>
                      <div className="dt-row-desc">18 años o más</div>
                    </div>
                    <div className="dt-stepper">
                      <button
                        type="button"
                        disabled={adults <= 1}
                        onClick={() => setAdults(Math.max(1, adults - 1))}
                      >
                        −
                      </button>
                      <span>{adults}</span>
                      <button
                        type="button"
                        disabled={adults >= 30}
                        onClick={() => setAdults(adults + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="dt-popover-row">
                    <div>
                      <div className="dt-row-title">Habitaciones</div>
                      <div className="dt-row-desc">Cantidad total</div>
                    </div>
                    <div className="dt-stepper">
                      <button
                        type="button"
                        disabled={rooms <= 1}
                        onClick={() => setRooms(Math.max(1, rooms - 1))}
                      >
                        −
                      </button>
                      <span>{rooms}</span>
                      <button
                        type="button"
                        disabled={rooms >= 10}
                        onClick={() => setRooms(rooms + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="dt-popover-done-btn"
                    onClick={() => setShowOccupancyPopover(false)}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* Field 4: Search Button */}
            <button type="submit" className="dt-search-btn">
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* ======================================================================
          2. BREADCRUMBS & NAVIGATION TABS
          ====================================================================== */}
      <div className="dt-breadcrumbs-bar">
        <ol className="dt-breadcrumbs">
          <li>
            <Link to="/">Inicio</Link>
            <span className="dt-breadcrumb-sep">›</span>
          </li>
          <li>
            <Link to="/alojamientos">Hoteles</Link>
            <span className="dt-breadcrumb-sep">›</span>
          </li>
          <li>
            <Link to="/alojamientos/search">Departamentos</Link>
            <span className="dt-breadcrumb-sep">›</span>
          </li>
          <li>
            <Link to="/alojamientos">Ecuador</Link>
            <span className="dt-breadcrumb-sep">›</span>
          </li>
          <li>
            <Link to={`/alojamientos/search?ss=${encodeURIComponent(alojamiento.destino || 'Quito')}`}>
              {alojamiento.destino || 'Quito'}
            </Link>
            <span className="dt-breadcrumb-sep">›</span>
          </li>
          <li style={{ color: '#1a1a1a', fontWeight: 500 }}>
            {alojamiento.nombre} (Ofertas)
          </li>
        </ol>

        {/* Secondary Navigation Tabs */}
        <nav className="dt-nav-tabs">
          <button
            type="button"
            className={`dt-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => scrollToSection(overviewRef, 'overview')}
          >
            Información general
          </button>
          <button
            type="button"
            className={`dt-nav-tab ${activeTab === 'price' ? 'active' : ''}`}
            onClick={() => scrollToSection(availabilityRef, 'price')}
          >
            Precios e info
          </button>
          <button
            type="button"
            className={`dt-nav-tab ${activeTab === 'facilities' ? 'active' : ''}`}
            onClick={() => scrollToSection(facilitiesRef, 'facilities')}
          >
            Instalaciones
          </button>
          <button
            type="button"
            className={`dt-nav-tab ${activeTab === 'rules' ? 'active' : ''}`}
            onClick={() => scrollToSection(rulesRef, 'rules')}
          >
            Normas de la casa
          </button>
          <button
            type="button"
            className="dt-nav-tab"
            onClick={() => alert('La información legal es provista por el anfitrión')}
          >
            Información legal
          </button>
          <button
            type="button"
            className={`dt-nav-tab ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => scrollToSection(reviewsRef, 'reviews')}
          >
            Comentarios ({resenas.length || reviewsCount})
          </button>
        </nav>
      </div>

      {/* ======================================================================
          3. MAIN PROPERTY CONTAINER
          ====================================================================== */}
      <div className="dt-main-container" ref={overviewRef}>
        {/* Header section */}
        <div className="dt-header-section">
          <div className="dt-header-left">
            <div className="dt-badge-row">
              <div className="dt-rating-squares" aria-label="Categoría de 4 estrellas">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
              </div>
              <span className="dt-travel-proud-badge">
                <TravelProudIcon size={14} />
                <span>Travel Proud</span>
              </span>
            </div>

            <h1 className="dt-property-title">{alojamiento.nombre}</h1>

            <div className="dt-address-line">
              <PinIcon size={16} color="#006ce4" />
              <span>{alojamiento.ubicacion?.address || 'Av. Eloy Alfaro & Av. República, 170517 Quito, Ecuador'}</span>
              <span>–</span>
              <span className="dt-address-link" onClick={() => alert('Abriendo mapa de ubicación')}>
                Ubicación excelente – mostrar en el mapa
              </span>
              <span className="dt-price-match-tag">
                <PriceMatchIcon size={14} color="#008009" /> Igualamos el precio
              </span>
            </div>
          </div>

          <div className="dt-header-actions">
            <button
              type="button"
              className={`dt-action-icon-btn ${isSaved ? 'saved' : ''}`}
              onClick={() => setIsSaved(!isSaved)}
              aria-label="Guardar en favoritos"
            >
              <HeartIcon size={20} filled={isSaved} color="#e11d48" outlineColor="#1a1a1a" />
            </button>
            <button
              type="button"
              className="dt-action-icon-btn"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                alert('Enlace copiado al portapapeles!');
              }}
              aria-label="Compartir alojamiento"
            >
              <ShareIcon size={20} color="#1a1a1a" />
            </button>
            <button
              type="button"
              className="dt-reserve-btn-primary"
              onClick={() => scrollToSection(availabilityRef, 'price')}
            >
              Reservar tu estancia
            </button>
          </div>
        </div>

        {/* Photo Gallery Collage (Booking.com signature layout) */}
        <section className="dt-gallery-grid">
          <div className="dt-hero-image-wrapper" onClick={() => setLightboxIndex(0)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(0); } }}>
            <img src={photos[0].url} alt={alojamiento.nombre} className="dt-hero-image" />
          </div>

          <div className="dt-stacked-images">
            <div className="dt-stacked-image-wrapper" onClick={() => setLightboxIndex(1)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(1); } }}>
              <img src={photos[1]?.url || photos[0].url} alt="Room detail" className="dt-stacked-image" />
            </div>
            <div className="dt-stacked-image-wrapper" onClick={() => setLightboxIndex(2)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(2); } }}>
              <img src={photos[2]?.url || photos[0].url} alt="Room detail" className="dt-stacked-image" />
            </div>
          </div>
        </section>

        {/* Bottom 5 Thumbnails */}
        <div className="dt-thumbnails-row">
          {photos.slice(3, 7).map((p, idx) => (
            <div key={idx} className="dt-thumb-wrapper" onClick={() => setLightboxIndex(idx + 3)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(idx + 3); } }}>
              <img src={p.url} alt={`Thumbnail ${idx + 3}`} className="dt-thumb-image" />
            </div>
          ))}
          <div className="dt-thumb-wrapper" onClick={() => setLightboxIndex(0)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(0); } }}>
            <img src={photos[7]?.url || photos[0].url} alt="Más fotos" className="dt-thumb-image" />
            <div className="dt-more-photos-overlay">+29 fotos</div>
          </div>
        </div>

        {/* Key Amenities Strip (Pills with elegant SVG icons) */}
        <div className="dt-pills-bar">
          <span className="dt-pill-item">
            <ApartmentIcon size={16} /> Departamentos
          </span>
          <span className="dt-pill-item">
            <WifiIcon size={16} /> WiFi gratis
          </span>
          <span className="dt-pill-item">
            <CoffeeIcon size={16} /> Desayuno
          </span>
          <span className="dt-pill-item">
            <ParkingIcon size={16} /> Estacionamiento privado
          </span>
          <span className="dt-pill-item">
            <PetsIcon size={16} /> Se admiten mascotas
          </span>
          <span className="dt-pill-item">
            <NoSmokingIcon size={16} /> Habitaciones sin humo
          </span>
          <span className="dt-pill-item">
            <FamilyIcon size={16} /> Habitaciones familiares
          </span>
          <span className="dt-pill-item">
            <PoolIcon size={16} /> Piscina al aire libre
          </span>
          <span className="dt-pill-item">
            <ShowerIcon size={16} /> Baño privado
          </span>
          <span className="dt-pill-item">
            <KitchenIcon size={16} /> Cocina
          </span>
        </div>

        {/* 2-Column Section: Overview & Property Highlights */}
        <div className="dt-overview-grid">
          {/* Left Column */}
          <div className="dt-overview-left">
            <div className="dt-genius-notice">
              Podrías optar a un descuento Genius en {alojamiento.nombre}. Para comprobar si hay un descuento Genius disponible para tus fechas, <Link to="/login">inicia sesión</Link>.
            </div>

            <div>
              <h2 className="dt-about-heading">Sobre este alojamiento</h2>
              <p className="dt-about-paragraph">
                <strong>Alojamiento elegante:</strong> {alojamiento.nombre} en {alojamiento.destino || 'Quito'} ofrece departamentos elegantes con piscina de vistas panorámicas, terraza amplia y WiFi gratis.
              </p>
              <p className="dt-about-paragraph">
                <strong>Comodidades confortables:</strong> Los huéspedes disfrutan de check-in y check-out privado, gimnasio, ascensor, conserjería, habitaciones familiares, seguridad 24 horas y mostrador de tours.
              </p>
              {showFullDesc && (
                <p className="dt-about-paragraph">
                  <strong>Instalaciones modernas:</strong> {alojamiento.descripcion || 'El departamento cuenta con cocina equipada, baño privado, secador de pelo, cafetera, refrigerador, zona de estar, microondas, ducha, TV de pantalla plana, hervidor eléctrico y armario.'}
                </p>
              )}

              <button
                type="button"
                className="dt-show-more-btn"
                onClick={() => setShowFullDesc(!showFullDesc)}
              >
                {showFullDesc ? 'Mostrar menos' : 'Mostrar más'}
              </button>
            </div>

            {/* Most popular facilities */}
            <div className="dt-popular-facilities-section">
              <h3 className="dt-popular-facilities-title">Servicios más populares</h3>
              <div className="dt-popular-facilities-grid">
                <span className="dt-popular-facility-item green">
                  <PoolIcon size={16} color="#008009" /> Piscina al aire libre
                </span>
                <span className="dt-popular-facility-item green">
                  <NoSmokingIcon size={16} color="#008009" /> Habitaciones sin humo
                </span>
                <span className="dt-popular-facility-item green">
                  <ParkingIcon size={16} color="#008009" /> Estacionamiento privado
                </span>
                <span className="dt-popular-facility-item green">
                  <WifiIcon size={16} color="#008009" /> WiFi gratis
                </span>
                <span className="dt-popular-facility-item green">
                  <FamilyIcon size={16} color="#008009" /> Habitaciones familiares
                </span>
                <span className="dt-popular-facility-item green">
                  <CoffeeIcon size={16} color="#008009" /> Desayuno
                </span>
              </div>
            </div>
          </div>

          {/* Right Column (Highlights Card & Score) */}
          <aside className="dt-overview-right">
            {/* Rating card */}
            <div className="dt-rating-card">
              <div className="dt-score-row">
                <div className="dt-score-text">
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    {Number(score) >= 9 ? 'Excelente' : 'Fantástico'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#595959' }}>{reviewsCount} comentarios</span>
                </div>
                <div className="dt-score-badge">{score}</div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#374151', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                <strong>A los clientes les encantó:</strong>
                <ul style={{ paddingLeft: '16px', margin: '6px 0 0 0' }}>
                  <li>WiFi gratis (Puntuación: 10/10)</li>
                  <li>Piscina en la azotea con vistas panorámicas</li>
                  <li>Habitaciones impecables y camas muy cómodas</li>
                </ul>
              </div>
            </div>

            {/* Side Map */}
            <div
              className="dt-side-map-box"
              style={{
                backgroundImage: 'url("https://maps.googleapis.com/maps/api/staticmap?size=340x140&center=-0.1838,-78.4919&zoom=13&scale=2&sensor=false")',
                backgroundColor: '#e5e3df',
              }}
            >
              <button
                type="button"
                className="dt-btn-blue"
                onClick={() => alert(`Mostrando mapa para ${alojamiento.nombre}`)}
              >
                <PinIcon size={16} /> Mostrar en el mapa
              </button>
            </div>

            {/* Property Highlights */}
            <div className="dt-highlights-card">
              <h3 className="dt-highlights-title">Puntos fuertes del alojamiento</h3>
              <div className="dt-stay-badge">¡Ideal para una estancia de {nightsCount} noches!</div>

              <div className="dt-highlight-point">
                <PinIcon size={16} color="#006ce4" />
                <div>
                  <strong>Ubicación ideal:</strong> Muy valorada por huéspedes recientes ({score})
                </div>
              </div>

              <div className="dt-highlight-point">
                <CoffeeIcon size={16} color="#006ce4" />
                <div>
                  <strong>Desayuno:</strong> Continental, buffet
                </div>
              </div>

              <div className="dt-highlight-point">
                <ParkingIcon size={16} color="#006ce4" />
                <div>Estacionamiento privado disponible en el alojamiento</div>
              </div>

              <button
                type="button"
                className="dt-reserve-btn-full"
                onClick={() => scrollToSection(availabilityRef, 'price')}
              >
                Reservar tu estancia
              </button>
            </div>
          </aside>
        </div>

        {/* Genius promo banner */}
        <div className="dt-genius-promo-box">
          <div>
            <h3>Inicia sesión y ahorra dinero</h3>
            <p>Para comprobar si puedes ahorrar un 10% o más en este alojamiento, inicia sesión</p>
            <div className="dt-genius-btns">
              <Link to="/login" className="dt-btn-blue">
                Iniciar sesión
              </Link>
              <Link to="/register" className="dt-link-blue">
                Crear una cuenta gratis
              </Link>
            </div>
          </div>
          <div>
            <GeniusGiftIcon size={52} />
          </div>
        </div>

        {/* ======================================================================
            AVAILABILITY & ROOM SELECTION TABLE SECTION
            ====================================================================== */}
        <section className="dt-availability-section" ref={availabilityRef} id="availability">
          <div className="dt-availability-header">
            <h2>Disponibilidad</h2>
            <span style={{ fontSize: '0.85rem', color: '#595959', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PriceMatchIcon size={14} color="#008009" /> Igualamos el precio
            </span>
          </div>

          {/* Change search sub-bar */}
          <div className="dt-change-search-bar">
            <div className="dt-change-cell">
              <CalendarIcon size={16} color="#003580" />
              <span>
                {checkin} — {checkout} ({nightsCount} noches)
              </span>
            </div>
            <div className="dt-change-cell">
              <UserIcon size={16} color="#003580" />
              <span>
                {adults} adultos · 0 niños · {rooms} hab.
              </span>
            </div>
            <button
              type="button"
              className="dt-change-btn"
              onClick={() => navigate(`/alojamientos/search?ss=${encodeURIComponent(alojamiento.destino || 'Quito')}`)}
            >
              Modificar búsqueda
            </button>
          </div>

          {/* Banner de Reserva Existente */}
          {existingActiveBooking && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '14px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ color: '#92400e', fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>
                  Ya tienes una reserva confirmada en este alojamiento
                </div>
                <div style={{ color: '#b45309', fontSize: '0.85rem' }}>
                  Estancia del {existingActiveBooking.checkin} al {existingActiveBooking.checkout} • Código PNR: <strong>{existingActiveBooking.codigoReserva || existingActiveBooking.reservationId || existingActiveBooking.id}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/mis-reservas')}
                style={{ background: '#006ce4', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ver en Mis Reservas
              </button>
            </div>
          )}

          {/* Room Type and Rates Table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px', alignItems: 'start' }}>
            <table className="dt-rooms-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Tipo de alojamiento</th>
                  <th style={{ width: '12%' }}>Capacidad</th>
                  <th style={{ width: '23%' }}>Precio para {nightsCount} noches</th>
                  <th style={{ width: '18%' }}>Tus opciones</th>
                  <th style={{ width: '12%' }}>Habitaciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="dt-room-title-link">
                      {alojamiento.tipo_alojamiento || 'Departamento de 2 dormitorios'}
                    </span>
                    <div className="dt-room-features-list">
                      <span>Departamento entero · {alojamiento.habitaciones || 2} dormitorios · 1 sala de estar · {alojamiento.banos || 2} baños</span>
                      <span>1 cocina · 95 m²</span>
                      <span>{alojamiento.camas || 3} camas (2 individuales, 1 doble)</span>
                      <span style={{ color: '#008009', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckmarkIcon size={14} /> WiFi gratis incluido
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <UserIcon size={18} color="#1a1a1a" />
                      <UserIcon size={18} color="#1a1a1a" />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#595959' }}>Para {adults} adultos</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', color: '#d4111e', textDecoration: 'line-through' }}>
                      {currency} {convertPrice(originalPrice)}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a' }}>
                      {currency} {convertPrice(totalPrice)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#595959' }}>
                      +{currency} {convertPrice(taxes)} de impuestos y cargos
                    </div>
                  </td>
                  <td>
                    <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.82rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckmarkIcon size={14} /> Desayuno incluido
                    </div>
                    <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckmarkIcon size={14} /> Cancelación gratis
                    </div>
                    {isSoldOut ? (
                      <div style={{ color: '#d4111e', fontWeight: 700, fontSize: '0.8rem' }}>
                        ¡Agotado para las fechas seleccionadas!
                      </div>
                    ) : availableRoomsCount <= 3 ? (
                      <div style={{ color: '#d4111e', fontWeight: 700, fontSize: '0.75rem' }}>
                        ¡Solo quedan {availableRoomsCount} a este precio en nuestra web!
                      </div>
                    ) : (
                      <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.75rem' }}>
                        {availableRoomsCount} habitaciones disponibles
                      </div>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                    <select
                      value={rooms}
                      onChange={(e) => setRooms(Number(e.target.value))}
                      disabled={isSoldOut}
                      style={{
                        padding: '8px 10px',
                        border: '1px solid #003580',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '14px',
                        width: '100%',
                        background: isSoldOut ? '#f3f4f6' : '#ffffff',
                        cursor: isSoldOut ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSoldOut ? (
                        <option value="0">0 (Agotado)</option>
                      ) : (
                        Array.from({ length: Math.min(availableRoomsCount, 10) }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))
                      )}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Sticky/Floating Booking.com Confirmation CTA Box */}
            <div
              style={{
                background: '#ebf3ff',
                border: '1px solid #cce0ff',
                borderRadius: '6px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#003580' }}>
                {rooms} {rooms === 1 ? 'apartamento' : 'apartamentos'} para {adults} adultos
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.1 }}>
                {currency} {convertPrice(totalPrice)}
              </div>
              <div style={{ fontSize: '11px', color: '#595959', marginBottom: '4px' }}>
                +{currency} {convertPrice(taxes)} de impuestos y cargos
              </div>

              <button
                type="button"
                className="dt-reserve-btn-primary"
                disabled={isSoldOut}
                onClick={() => setShowCheckoutModal(true)}
                style={{
                  width: '100%',
                  fontSize: '16px',
                  padding: '12px 16px',
                  fontWeight: 800,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  opacity: isSoldOut ? 0.6 : 1,
                  cursor: isSoldOut ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{isSoldOut ? 'Agotado' : 'Reservaré'}</span>
                <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.9 }}>
                  {isSoldOut ? 'Sin disponibilidad' : 'Confirmación inmediata'}
                </span>
              </button>

              <div style={{ fontSize: '11px', color: '#4b5563', lineHeight: 1.4, marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckmarkIcon size={12} color="#008009" /> <span>¡Solo te llevará 2 minutos!</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckmarkIcon size={12} color="#008009" /> <span>No pagas nada hoy</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckmarkIcon size={12} color="#008009" /> <span>Cancelación gratuita</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Reservation Form */}
          <div className="dt-reservation-box">
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
              Confirma tu reserva en {alojamiento.nombre}
            </h3>
            <p style={{ color: '#595959', fontSize: '0.85rem', marginBottom: '16px' }}>
              Sin pago por adelantado: paga durante tu estancia. Cancelación gratuita incluida.
            </p>

            {bookingSuccess ? (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '20px', borderRadius: '8px' }}>
                <h4 style={{ color: '#065f46', fontSize: '1.1rem', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckmarkIcon size={20} color="#059669" />
                  <span>Reserva confirmada con éxito</span>
                </h4>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#047857' }}>
                  Código de reserva (PNR): <strong>{bookingSuccess.reservationId || bookingSuccess.id}</strong>
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dt-btn-blue"
                    onClick={handleDescargarComprobante}
                    disabled={isDownloadingPdf}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    {isDownloadingPdf ? (
                      <>
                        <span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                        Generando PDF...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Descargar PDF
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    style={{ background: '#f3f4f6', border: '1px solid #ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => navigate('/mis-reservas')}
                  >
                    Ver mis reservas
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit}>
                {bookingError && (
                  <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '4px', marginBottom: '14px', fontSize: '0.85rem' }}>
                    {bookingError}
                  </div>
                )}

                <div className="dt-res-grid">
                  <div className="dt-res-input-group">
                    <label>Nombre y Apellidos</label>
                    <input
                      type="text"
                      placeholder="Ej. Juan Pérez"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="dt-res-input-group">
                    <label>Correo Electrónico (para confirmación)</label>
                    <input
                      type="email"
                      placeholder="nombre@ejemplo.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="dt-res-grid">
                  <div className="dt-res-input-group">
                    <label>Habitaciones solicitadas</label>
                    <select
                      value={rooms}
                      onChange={(e) => setRooms(Number(e.target.value))}
                      disabled={isSoldOut}
                    >
                      {isSoldOut ? (
                        <option value="0">0 (Agotado)</option>
                      ) : (
                        Array.from({ length: Math.min(availableRoomsCount, 10) }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num} habitación ({currency} {convertPrice(Math.round(pricePerNight * nightsCount * num))})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="dt-res-input-group">
                    <label>Método de garantía</label>
                    <input type="text" value="Tarjeta de crédito (Pagar en destino)" disabled style={{ background: '#f9fafb' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#595959' }}>Total estimado ({nightsCount} noches): </span>
                    <strong style={{ fontSize: '1.25rem', color: '#008009' }}>
                      {currency} {convertPrice(totalPrice)}
                    </strong>
                  </div>
                  <button type="submit" className="dt-reserve-btn-primary" disabled={bookingLoading || isSoldOut}>
                    {bookingLoading ? 'Procesando reserva...' : isSoldOut ? 'Agotado' : 'Reservaré'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* ======================================================================
            SURVEY CARD ("¿Qué te parece nuestra página?")
            ====================================================================== */}
        <section className="dt-survey-box">
          <div className="dt-survey-header">
            <h3>¿Qué te parece nuestra página?</h3>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={(e) => e.currentTarget.parentElement.parentElement.remove()}
              aria-label="Cerrar encuesta"
            >
              <CloseIcon size={16} color="#595959" />
            </button>
          </div>
          <div className="dt-survey-body">
            <SurveyAvatarIcon size={52} />
            <div>
              <div style={{ fontSize: '0.8rem', color: '#595959', marginBottom: '4px' }}>1 de 2</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>
                Me resulta fácil seleccionar el tipo de alojamiento que necesito
              </div>
              <div className="dt-survey-options">
                {['Totalmente de acuerdo', 'De acuerdo', 'Neutral', 'En desacuerdo', 'Totalmente en desacuerdo'].map((opt) => (
                  <label key={opt} className="dt-survey-option-label">
                    <input
                      type="radio"
                      name="survey"
                      value={opt}
                      checked={surveyResponse === opt}
                      onChange={(e) => setSurveyResponse(e.target.value)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================
            HOUSE RULES SECTION
            ====================================================================== */}
        <section className="dt-rules-section" ref={rulesRef} id="rules">
          <div className="dt-rules-header">
            <div>
              <h2>Normas de la casa</h2>
              <div style={{ fontSize: '0.85rem', color: '#595959' }}>
                {alojamiento.nombre} acepta peticiones especiales: ¡añádelas en el siguiente paso!
              </div>
            </div>
            <button
              type="button"
              className="dt-reserve-btn-primary"
              onClick={() => scrollToSection(availabilityRef, 'price')}
            >
              Ver disponibilidad
            </button>
          </div>

          <div className="dt-rules-box">
            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <ClockIcon size={18} color="#003580" />
                <span>Entrada</span>
              </div>
              <div className="dt-rule-right">
                <strong>De 15:00 a 23:00</strong>
                <div style={{ fontSize: '0.8rem', color: '#595959' }}>
                  Debes avisar al alojamiento con antelación a qué hora vas a llegar.
                </div>
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <ClockIcon size={18} color="#003580" />
                <span>Salida</span>
              </div>
              <div className="dt-rule-right">
                <strong>De 07:00 a 11:00</strong>
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <InfoIcon size={18} color="#003580" />
                <span>Cancelación / prepago</span>
              </div>
              <div className="dt-rule-right">
                Las condiciones de cancelación y pago por adelantado pueden variar según el tipo de alojamiento. Cancelación gratis hasta 48 horas antes de la entrada.
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <FamilyIcon size={18} color="#003580" />
                <span>Camas y niños</span>
              </div>
              <div className="dt-rule-right">
                <div>
                  <strong>Políticas sobre menores:</strong> Se pueden alojar niños de cualquier edad.
                </div>
                <div style={{ marginTop: '4px' }}>
                  <strong>Cunas y camas supletorias:</strong> Hay cunas y camas supletorias disponibles a petición sin costo adicional.
                </div>
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <UserIcon size={18} color="#003580" />
                <span>Restricción de edad</span>
              </div>
              <div className="dt-rule-right">
                Edad mínima para el check-in: 18 años
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <CreditCardIcon size={18} color="#003580" />
                <span>Tarjetas aceptadas</span>
              </div>
              <div className="dt-rule-right">
                <div className="dt-payment-cards-row">
                  <span className="dt-card-badge">American Express</span>
                  <span className="dt-card-badge">Visa</span>
                  <span className="dt-card-badge">Mastercard</span>
                  <span style={{ fontSize: '0.8rem', color: '#595959', marginLeft: '8px' }}>No se acepta efectivo</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================
            SURROUNDINGS & LANDMARKS
            ====================================================================== */}
        <section style={{ marginBottom: '40px' }} id="surroundings">
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '14px' }}>
            Alrededores y lugares de interés cercanos
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', border: '1px solid #e7e7e7', borderRadius: '8px', padding: '20px', background: '#fff' }}>
            <div>
              <h4 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LandmarkIcon size={18} color="#003580" /> Monumentos y cultura
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Museo Capilla del Hombre</span>
                  <span style={{ color: '#595959' }}>2.4 km</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Parque El Ejido</span>
                  <span style={{ color: '#595959' }}>2.5 km</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Parque La Carolina</span>
                  <span style={{ color: '#595959' }}>0.4 km</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Basílica del Voto Nacional</span>
                  <span style={{ color: '#595959' }}>3.2 km</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CoffeeIcon size={18} color="#003580" /> Restaurantes y cafeterías
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Coffee Factory</span>
                  <span style={{ color: '#595959' }}>150 m</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cafetería Coffee Point</span>
                  <span style={{ color: '#595959' }}>200 m</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Hamburguesas El Corral</span>
                  <span style={{ color: '#595959' }}>200 m</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrainIcon size={18} color="#003580" /> Transporte público
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Terminal de Ferrocarriles</span>
                  <span style={{ color: '#595959' }}>7 km</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Estación de Metro La Carolina</span>
                  <span style={{ color: '#595959' }}>300 m</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ======================================================================
            CROSS-SELL: "Qué hacer en [Destino]" (Conectado con el Módulo de Atracciones)
            ====================================================================== */}
        <section className="dt-activities-section">
          <div className="dt-activities-header">
            <h2>Qué hacer en {alojamiento.destino || 'Quito'}</h2>
            <Link to="/atracciones" style={{ color: '#006ce4', fontWeight: 600, fontSize: '0.88rem' }}>
              Ver todas
            </Link>
          </div>

          <div className="dt-activities-carousel">
            {attractions.slice(0, 4).map((act) => {
              const rawPhoto = act.photos?.[0]?.url;
              const photoUrl = (rawPhoto && !rawPhoto.includes('example.com'))
                ? rawPhoto
                : 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=500';
              const price = act.price?.total || 15;
              const ratingScore = act.ratings?.score || 4.8;
              const reviews = act.ratings?.number_of_reviews || 120;

              return (
                <div
                  key={act.id}
                  className="dt-activity-card"
                  onClick={() => navigate(`/atracciones/${act.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="dt-activity-image-wrapper">
                    <img src={photoUrl} alt={act.name} className="dt-activity-image" />
                    <span className="dt-bestseller-badge">Más vendido</span>
                  </div>
                  <div className="dt-activity-body">
                    <div className="dt-activity-title">{act.name}</div>
                    <div className="dt-activity-rating" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <StarFilledIcon size={13} color="#f59e0b" />
                      <span style={{ fontWeight: 600 }}>{ratingScore}</span>
                      <span style={{ color: '#595959', fontSize: '0.75rem' }}>({reviews} comentarios)</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#595959' }}>Entradas desde</div>
                      <div className="dt-activity-price">{currency} {convertPrice(price)}</div>
                      <div className="dt-activity-free-cancel">Cancelación gratis disponible</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ======================================================================
            FULL CATEGORIZED FACILITIES GRID
            ====================================================================== */}
        <section className="dt-facilities-section" ref={facilitiesRef} id="facilities">
          <div className="dt-facilities-header">
            <div>
              <h2>Instalaciones y servicios de {alojamiento.nombre}</h2>
              <div style={{ fontSize: '0.85rem', color: '#595959' }}>
                ¡Instalaciones fantásticas! Puntuación: {score}
              </div>
            </div>
            <button
              type="button"
              className="dt-reserve-btn-primary"
              onClick={() => scrollToSection(availabilityRef, 'price')}
            >
              Ver disponibilidad
            </button>
          </div>

          <div className="dt-facilities-full-grid">
            <div className="dt-facility-category-block">
              <h4>
                <ApartmentIcon size={18} color="#003580" /> Lo más destacado
              </h4>
              <ul className="dt-facility-items-list">
                <li><CheckmarkIcon size={14} /> WiFi gratis</li>
                <li><CheckmarkIcon size={14} /> Cocina</li>
                <li><CheckmarkIcon size={14} /> Baño privado</li>
                <li><CheckmarkIcon size={14} /> Se admiten mascotas</li>
                <li><CheckmarkIcon size={14} /> Estacionamiento</li>
                <li><CheckmarkIcon size={14} /> Habitaciones familiares</li>
                <li><CheckmarkIcon size={14} /> TV de pantalla plana</li>
                <li><CheckmarkIcon size={14} /> Habitaciones para no fumadores</li>
                <li><CheckmarkIcon size={14} /> Información turística</li>
                <li><CheckmarkIcon size={14} /> Piscina al aire libre</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <ParkingIcon size={18} color="#003580" /> Estacionamiento
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.4 }}>
                Hay estacionamiento privado en el establecimiento (es necesario reservar) y cuesta US$12 por día.
              </p>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <WifiIcon size={18} color="#003580" /> Internet
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.4 }}>
                Hay conexión a internet Wi-Fi disponible en todo el establecimiento. Gratis.
              </p>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <KitchenIcon size={18} color="#003580" /> Cocina
              </h4>
              <ul className="dt-facility-items-list">
                <li>Cafetera</li>
                <li>Horno</li>
                <li>Hervidor eléctrico</li>
                <li>Utensilios de cocina</li>
                <li>Microondas</li>
                <li>Refrigerador</li>
                <li>Zona de cocina</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <BedIcon size={18} color="#003580" /> Habitación
              </h4>
              <ul className="dt-facility-items-list">
                <li>Ropa de cama</li>
                <li>Armario o closet</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <ShowerIcon size={18} color="#003580" /> Baño
              </h4>
              <ul className="dt-facility-items-list">
                <li>Papel higiénico</li>
                <li>Toallas</li>
                <li>Baño privado</li>
                <li>WC</li>
                <li>Secador de pelo</li>
                <li>Ducha</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <ApartmentIcon size={18} color="#003580" /> Zona de estar
              </h4>
              <ul className="dt-facility-items-list">
                <li>Zona de estar</li>
                <li>Zona de comedor</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <TvIcon size={18} color="#003580" /> Equipamiento audiovisual y tecnológico
              </h4>
              <ul className="dt-facility-items-list">
                <li>TV de pantalla plana</li>
                <li>Canales por cable</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <PoolIcon size={18} color="#003580" /> Piscina al aire libre (¡Gratis!)
              </h4>
              <ul className="dt-facility-items-list">
                <li>Abierta todo el año</li>
                <li>Para todas las edades</li>
                <li>Piscina con vistas</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <GymIcon size={18} color="#003580" /> Bienestar y fitness
              </h4>
              <ul className="dt-facility-items-list">
                <li>Gimnasio / Sala de fitness</li>
                <li>Espacio para yoga</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <UserIcon size={18} color="#003580" /> Servicios de recepción
              </h4>
              <ul className="dt-facility-items-list">
                <li>Registro de entrada y salida privado</li>
                <li>Servicio de conserjería</li>
                <li>Información turística</li>
                <li>Recepción 24 horas</li>
              </ul>
            </div>

            <div className="dt-facility-category-block">
              <h4>
                <ShieldCheckIcon size={18} color="#003580" /> Seguridad
              </h4>
              <ul className="dt-facility-items-list">
                <li>Extintores</li>
                <li>Cámaras de seguridad en zonas comunes</li>
                <li>Detectores de humo</li>
                <li>Seguridad 24 horas</li>
                <li>Caja fuerte</li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* ======================================================================
          REVIEWS / COMENTARIOS SECTION
          ====================================================================== */}
      <section className="dt-reviews-section" ref={reviewsRef} id="reviews">
        <div className="dt-reviews-header">
          <div>
            <h2>Comentarios de los huespedes</h2>
            <div style={{ fontSize: '0.85rem', color: '#595959' }}>
              {resenas.length || reviewsCount} comentarios reales de viajeros verificados
            </div>
          </div>
          <button
            type="button"
            className="dt-reserve-btn-primary"
            onClick={() => scrollToSection(availabilityRef, 'price')}
          >
            Ver disponibilidad
          </button>
        </div>

        {/* Score Summary */}
        {resenasScores && (
          <div className="dt-reviews-summary">
            <div className="dt-reviews-score-big">
              <div className="dt-score-badge" style={{ fontSize: '2.2rem', width: '80px', height: '80px', borderRadius: '8px 8px 8px 0' }}>
                {resenasScores.general}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                  {resenasScores.general >= 9 ? 'Excelente' : resenasScores.general >= 8 ? 'Muy bueno' : 'Bueno'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#595959' }}>{resenas.length} comentarios</div>
              </div>
            </div>
            <div className="dt-reviews-bars">
              {[
                { label: 'Limpieza', val: resenasScores.limpieza },
                { label: 'Servicio', val: resenasScores.servicio },
                { label: 'Calidad-precio', val: resenasScores.calidad },
              ].map(({ label, val }) => (
                <div key={label} className="dt-review-bar-row">
                  <span className="dt-review-bar-label">{label}</span>
                  <div className="dt-review-bar-track">
                    <div className="dt-review-bar-fill" style={{ width: `${(val / 10) * 100}%` }} />
                  </div>
                  <span className="dt-review-bar-val">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Individual Reviews */}
        {resenasLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#595959' }}>Cargando comentarios...</div>
        ) : (
          <div className="dt-reviews-list">
            {resenas.map((r) => (
              <div key={r.id} className="dt-review-card">
                <div className="dt-review-avatar">
                  {(r.usuarioNombre || 'A').charAt(0).toUpperCase()}
                </div>
                <div className="dt-review-body">
                  <div className="dt-review-meta">
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>{r.usuarioNombre || 'Huesped anonimo'}</strong>
                      <span style={{ fontSize: '0.78rem', color: '#595959', marginLeft: '6px' }}>{r.usuarioPais}</span>
                    </div>
                    <div className="dt-review-score-pill">{Number(r.puntuacion).toFixed(1)}</div>
                  </div>
                  <p className="dt-review-comment">{r.comentario}</p>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }) : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ======================================================================
          LIGHTBOX FULLSCREEN MODAL
          ====================================================================== */}
      {lightboxIndex !== null && (
        <div className="dt-lightbox-modal" onClick={() => setLightboxIndex(null)}>
          <button
            type="button"
            className="dt-lightbox-close"
            onClick={() => setLightboxIndex(null)}
            aria-label="Cerrar galería de fotos"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <CloseIcon size={24} color="#ffffff" />
          </button>
          <img
            src={photos[lightboxIndex]?.url || photos[0].url}
            alt="Vista de la galería"
            className="dt-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="dt-lightbox-controls" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="dt-lightbox-btn"
              onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeftIcon size={20} color="#ffffff" />
            </button>
            <span>
              {lightboxIndex + 1} / {photos.length}
            </span>
            <button
              type="button"
              className="dt-lightbox-btn"
              onClick={() => setLightboxIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRightIcon size={20} color="#ffffff" />
            </button>
          </div>
        </div>
      )}

      {/* Booking.com Authentic Checkout Modal Flow */}
      {showCheckoutModal && (
        <AlojamientoCheckoutModal
          alojamiento={alojamiento}
          checkin={checkin}
          checkout={checkout}
          adults={adults}
          rooms={rooms}
          nightsCount={nightsCount}
          originalPrice={originalPrice}
          totalPrice={totalPrice}
          taxes={taxes}
          currency={currency}
          convertPrice={convertPrice}
          user={user}
          onClose={() => setShowCheckoutModal(false)}
          onSuccess={(booking) => {
            setBookingSuccess(booking);
            setShowCheckoutModal(false);
          }}
        />
      )}

      <ReportModal 
        isOpen={showReportModal} 
        onClose={() => setShowReportModal(false)} 
        entityName={alojamiento?.nombre || 'Alojamiento'} 
        pnrOrId={alojamiento?.id || 'HOTEL'} 
        type="Hospedaje" 
      />
    </div>
  );
}
