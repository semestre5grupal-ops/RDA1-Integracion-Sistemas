import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { getAlojamiento, getDisponibilidadAlojamiento, consultarDisponibilidad } from '../services/alojamientosApi';
import { BarraDisponibilidad, resumenOcupacion } from '../components/BarraDisponibilidad';
import { API_BASE } from '../services/api';
import { getAtracciones } from '../services/atraccionesApi';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/CurrencyContext';
import { formatearRegimen } from '../utils/regimenFormato';
import { AlojamientoCheckoutModal } from '../components/AlojamientoCheckoutModal';
import { ReportModal } from '../components/ReportModal';
import { normalizarTexto } from '../utils/destinos';
import { AlojamientosLoadingView } from '../components/AlojamientosLoadingView';

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
import { fechaLocal } from '../utils/fechas';
import { MapaAlojamientos } from '../components/MapaAlojamientos';

export function getHorarioCheckin(al) {
  if (!al) return '14:00';
  return (
    al.checkin_desde ||
    al.politicas?.checkin_desde ||
    al.politicas?.check_in ||
    al.politicas?.checkin ||
    al.politicas?.hora_checkin ||
    al.politicas?.hora_entrada ||
    al.politicas?.entrada ||
    al.checkInPermitidoDesde ||
    al.check_in_desde ||
    al.horaCheckin ||
    al.hora_checkin ||
    al.horarioCheckIn ||
    al.horario_checkin ||
    al.checkIn ||
    al.check_in ||
    al.checkin ||
    '14:00'
  );
}

export function getHorarioCheckinHasta(al) {
  if (!al) return null;
  return (
    al.checkin_hasta ||
    al.politicas?.checkin_hasta ||
    al.politicas?.check_in_hasta ||
    al.politicas?.hora_limite_checkin ||
    al.checkInPermitidoHasta ||
    al.check_in_hasta ||
    null
  );
}

export function getHorarioCheckout(al) {
  if (!al) return '11:00';
  return (
    al.checkout_hasta ||
    al.politicas?.checkout_hasta ||
    al.politicas?.check_out ||
    al.politicas?.checkout ||
    al.politicas?.hora_checkout ||
    al.politicas?.hora_salida ||
    al.politicas?.salida ||
    al.checkOutHoraMaxima ||
    al.check_out_hasta ||
    al.horaCheckout ||
    al.hora_checkout ||
    al.horarioCheckOut ||
    al.horario_checkout ||
    al.checkOut ||
    al.check_out ||
    al.checkout ||
    '11:00'
  );
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, convertPrice } = useCurrency();

  // URL parameters
  const queryCheckin = searchParams.get('checkin') || fechaLocal(2);
  const queryCheckout = searchParams.get('checkout') || fechaLocal(4);
  const queryAdults = parseInt(searchParams.get('group_adults') || '2', 10);
  const queryRooms = parseInt(searchParams.get('no_rooms') || '1', 10);
  // Edades de los niños como en la URL de Booking (`group_children=2&age=4&age=9`).
  const queryEdades = (() => {
    const n = Math.max(0, Math.min(10, parseInt(searchParams.get('group_children') || '0', 10) || 0));
    const edades = searchParams.getAll('age').map(Number).filter((e) => Number.isInteger(e) && e >= 0 && e <= 17);
    return Array.from({ length: n }, (_, i) => (edades[i] ?? 8));
  })();

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
  const [edadesNinos, setEdadesNinos] = useState(queryEdades);
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [surveyResponse, setSurveyResponse] = useState('');

  // Booking Form State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  // Cotización REAL del backend para las fechas y ocupación elegidas
  // (POST /alojamientos/availability): precio, noches y habitaciones libres.
  const [cotizacion, setCotizacion] = useState(null);
  // Tipo de habitación elegido en la tabla (product_id del backend). Se recuerda
  // en la URL (?tipo=codigo) para poder compartir o recargar la página.
  const [tipoElegidoId, setTipoElegidoId] = useState(null);
  const tipoDeUrl = searchParams.get('tipo');
  const [consultando, setConsultando] = useState(false);
  const [errorCotizacion, setErrorCotizacion] = useState('');

  const consultar = async (valores) => {
    setConsultando(true);
    try {
      const { tipoId, ...ocupacion } = valores;
      const data = await consultarDisponibilidad({ id, ...ocupacion });
      // Cada producto es un tipo de habitación con su precio, régimen y cupo.
      const productos = data.products || [];
      const preferido = tipoId !== undefined ? tipoId : (tipoElegidoId || tipoDeUrl);
      const producto = productos.find((p) => p.product_id === preferido || p.codigo === preferido) || productos[0] || null;
      setTipoElegidoId(producto ? producto.product_id : null);
      setCotizacion({
        precio: producto ? Number(producto.price) : null, // estancia completa, 1 habitación del tipo elegido
        moneda: data.currency,
        noches: data.nights,
        libres: producto ? producto.available_rooms : data.available_rooms,
        libresHotel: data.available_rooms,
        producto,
        productos,
      });
      setErrorCotizacion('');
      setCheckin(valores.checkin);
      setCheckout(valores.checkout);
      setAdults(valores.adultos);
      setRooms(valores.habitaciones);
      setEdadesNinos(valores.edadesNinos);
      // La URL refleja la búsqueda (se puede compartir o recargar), como en Booking.
      const params = new URLSearchParams(searchParams);
      params.set('checkin', valores.checkin);
      params.set('checkout', valores.checkout);
      params.set('group_adults', String(valores.adultos));
      params.set('no_rooms', String(valores.habitaciones));
      params.set('group_children', String(valores.edadesNinos.length));
      if (producto?.codigo) params.set('tipo', producto.codigo);
      params.delete('age');
      valores.edadesNinos.forEach((e) => params.append('age', String(e)));
      setSearchParams(params, { replace: true });
      if (!producto) {
        return { ok: false, mensaje: data.available_rooms > 0
          ? `Solo quedan ${data.available_rooms} habitación(es) libres para esas fechas. Reduce el número de habitaciones o cambia las fechas.`
          : 'No hay disponibilidad para esas fechas. Prueba con otras fechas.' };
      }
      return { ok: true };
    } catch (err) {
      const datos = err.response?.data;
      const errores = (datos?.invalidParams || []).map((p) => ({
        campo: /checkin|checkout|dates/.test(p.name) ? 'fechas' : 'ocupacion',
        mensaje: datos.detail && !/esquema/.test(datos.detail) ? `${datos.detail} ${p.reason}` : p.reason,
      }));
      const mensaje = err.response
        ? (errores.length ? '' : (datos?.detail || 'No se pudo consultar la disponibilidad.'))
        : 'No se pudo conectar con el servidor para consultar la disponibilidad.';
      if (!errores.length) setErrorCotizacion(mensaje);
      return { ok: false, errores, mensaje };
    } finally {
      setConsultando(false);
    }
  };

  /** Elegir otro tipo de habitación de la tabla (sin volver a consultar). */
  const elegirProducto = (p) => {
    setTipoElegidoId(p.product_id);
    setCotizacion((prev) => prev && { ...prev, producto: p, precio: Number(p.price), libres: p.available_rooms });
    if (rooms > p.available_rooms) consultar({ checkin, checkout, adultos: adults, edadesNinos, habitaciones: Math.max(1, p.available_rooms), tipoId: p.product_id });
    const params = new URLSearchParams(searchParams);
    if (p.codigo) params.set('tipo', p.codigo);
    setSearchParams(params, { replace: true });
  };

  // Disponibilidad de habitaciones en tiempo real
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(false);

  // Detectar si el usuario ya tiene una reserva confirmada para este alojamiento en estas fechas
  const existingActiveBooking = useMemo(() => {
    try {
      // Solo las reservas hechas con este correo: el navegador puede tener
      // reservas de otra persona o de pruebas (y un invitado no tiene correo aún).
      const correo = (user?.email || '').trim().toLowerCase();
      if (!correo) return null;
      const reservas = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      return reservas.find((r) =>
        (r.email || '').trim().toLowerCase() === correo &&
        (r.alojamientoId === id || r.alojamiento_id === id) &&
        !['CANCELLED', 'Cancelada', 'FALLIDA'].includes(r.status) &&
        (r.checkin === checkin || (r.checkin < checkout && r.checkout > checkin))
      );
    } catch {
      return null;
    }
  }, [id, checkin, checkout, user?.email]);

  // Al abrir la página o al modificar fechas y ocupación, se cotiza en vivo.
  useEffect(() => {
    if (!id || !checkin || !checkout) return;
    if (checkout <= checkin) return;
    if (edadesNinos.some((e) => e === null || e === undefined)) return;

    const timer = setTimeout(() => {
      consultar({ checkin, checkout, adultos: adults, edadesNinos, habitaciones: rooms }).then((r) => {
        if (r && !r.ok) {
          const primero = r.errores?.[0]?.mensaje || r.mensaje;
          if (primero) setErrorCotizacion(primero);
        }
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, checkin, checkout, adults, rooms, edadesNinos.length]);

  // Sincronizar disponibilidad en tiempo real (Polling continuo cada 5s emulando stream gRPC)
  useEffect(() => {
    if (!id) return;
    let isCancelled = false;
    const fetchAvail = async (silent = false) => {
      if (!silent) setLoadingDisponibilidad(true);
      try {
        const data = await getDisponibilidadAlojamiento(id, { checkin, checkout });
        if (!isCancelled && data) {
          setDisponibilidad(data);
          if (typeof data.available_rooms === 'number') {
            if (data.available_rooms > 0 && rooms > data.available_rooms) {
              setRooms(data.available_rooms);
            }
          }
        }
      } catch (err) {
        console.warn('[AlojamientoDetail] Error transitorio verificando disponibilidad:', err?.message || err);
      } finally {
        if (!isCancelled && !silent) setLoadingDisponibilidad(false);
      }
    };
    fetchAvail(false);

    // Stream gRPC: consulta periódica para reflejar caídas de stock en tiempo real
    const interval = setInterval(() => {
      fetchAvail(true);
      if (checkin && checkout && checkout > checkin) {
        consultarDisponibilidad({
          id,
          checkin,
          checkout,
          adultos: adults,
          edadesNinos,
          habitaciones: rooms,
        })
          .then((data) => {
            if (!isCancelled && data) {
              const productos = data.products || [];
              setCotizacion((prev) => {
                if (!prev) return prev;
                const prod = productos.find((p) => p.product_id === tipoElegidoId || p.codigo === tipoElegidoId) || productos[0] || prev.producto;
                return {
                  ...prev,
                  libres: prod ? prod.available_rooms : data.available_rooms,
                  libresHotel: data.available_rooms,
                  producto: prod,
                  productos,
                };
              });
            }
          })
          .catch(() => {});
      }
    }, 5000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [id, checkin, checkout, adults, rooms, edadesNinos, tipoElegidoId]);

  // References for Smooth Scrolling
  const overviewRef = useRef(null);
  const availabilityRef = useRef(null);
  const facilitiesRef = useRef(null);
  const rulesRef = useRef(null);
  const surroundingsRef = useRef(null);
  const reviewsRef = useRef(null);

  // Reviews State
  const [resenas, setResenas] = useState([]);
  const [resenasScores, setResenasScores] = useState(null);
  const [resenasLoading, setResenasLoading] = useState(false);


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

  // Galería: SIEMPRE las fotos reales que manda el alojamiento. Solo se usa la galería
  // de ejemplo cuando el socio no envió ninguna foto (p. ej. catálogo sin imágenes).
  const photos = useMemo(() => {
    const reales = Array.isArray(alojamiento?.photos)
      ? alojamiento.photos.filter((p) => p && p.url)
      : [];
    return reales.length >= 1 ? reales : GALLERY_DEFAULT_PHOTOS;
  }, [alojamiento]);

  // Nights calculation
  const nochesCalculadas = useMemo(() => {
    try {
      const d1 = new Date(checkin);
      const d2 = new Date(checkout);
      const diffTime = Math.abs(d2 - d1);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    } catch {
      return 1;
    }
  }, [checkin, checkout]);

  const nightsCount = cotizacion?.noches || nochesCalculadas;

  // Precio: el del backend para estas fechas (por habitación) × habitaciones.
  const pricePerNight = Number(alojamiento?.precioPorNoche || alojamiento?.precio_noche) > 0
    ? Number(alojamiento?.precioPorNoche || alojamiento?.precio_noche)
    : 85;
  const totalPrice = (cotizacion?.precio != null && Number(cotizacion.precio) > 0)
    ? Math.round(Number(cotizacion.precio) * rooms * 100) / 100
    : Math.round(pricePerNight * nightsCount * rooms);
  const originalPrice = Math.round(totalPrice * 1.14);
  const taxes = Math.round(totalPrice * 0.15);

  const scrollToSection = (ref, tabName) => {
    setActiveTab(tabName);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth' });
    }
  };


  if (loading) {
    return <AlojamientosLoadingView />;
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

  // Score y número de comentarios REALES del socio (no se inventan). Si el hotel no
  // trae puntuación o no tiene reseñas, se muestra como "Nuevo" / "Sin comentarios".
  const scoreNum = Number(alojamiento.ratings?.score);
  const tieneScore = Number.isFinite(scoreNum) && scoreNum > 0;
  const score = tieneScore ? scoreNum.toFixed(1) : null;
  const reviewsCount = resenas.length || Number(alojamiento.ratings?.number_of_reviews) || 0;

  const availableRoomsCount = typeof cotizacion?.libres === 'number'
    ? cotizacion.libres
    : disponibilidad && typeof disponibilidad.available_rooms === 'number'
      ? disponibilidad.available_rooms
      : (alojamiento.habitaciones || 5);
  const valoresBusqueda = { checkin, checkout, adultos: adults, edadesNinos, habitaciones: rooms };
  const textoOcupacion = resumenOcupacion(valoresBusqueda);
  const isSoldOut = availableRoomsCount <= 0;

  return (
    <main id="contenido-principal" className="dt-page-wrapper">
      {/* ======================================================================
          1. TOP SEARCH SUB-BAR
          ====================================================================== */}
      <section className="dt-search-container">
        <div className="dt-search-inner">
          <form
            className="dt-search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              const destTrim = searchDest.trim();
              const destNormal = normalizarTexto(destTrim);
              const destActual = normalizarTexto(alojamiento?.destino || 'Quito');
              const nombreActual = normalizarTexto(alojamiento?.nombre || '');
              
              // Si el destino ingresado coincide con el alojamiento actual o su ciudad, actualizar cotización en vivo
              if (!destTrim || destNormal === destActual || (nombreActual && destNormal.includes(nombreActual)) || (nombreActual && nombreActual.includes(destNormal))) {
                consultar({ checkin, checkout, adultos, edadesNinos, habitaciones: rooms });
                scrollToSection(availabilityRef, 'price');
              } else {
                navigate(`/alojamientos/search?ss=${encodeURIComponent(destTrim)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${edadesNinos.length}&no_rooms=${rooms}`);
              }
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
                        onChange={(e) => {
                          const cIn = e.target.value;
                          setCheckin(cIn);
                          if (checkout && checkout <= cIn) {
                            const [y, m, d] = cIn.split('-').map(Number);
                            const next = new Date(y, m - 1, d + 1);
                            const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
                            setCheckout(nextStr);
                          }
                        }}
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
                  {textoOcupacion}
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
            <button type="submit" className="dt-search-btn" disabled={consultando}>
              {consultando ? 'Actualizando…' : 'Buscar'}
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
        <nav className="dt-nav-tabs" aria-label="Secciones del alojamiento">
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
            className={`dt-nav-tab ${activeTab === 'surroundings' ? 'active' : ''}`}
            onClick={() => scrollToSection(surroundingsRef, 'surroundings')}
          >
            Ubicación y mapa
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
              {Number(alojamiento.estrellas) > 0 && (
                <div className="dt-rating-squares" role="img" aria-label={`Categoría de ${alojamiento.estrellas} estrellas`}>
                  {Array.from({ length: Math.min(5, Math.max(1, parseInt(alojamiento.estrellas, 10) || 1)) }).map((_, idx) => (
                    <svg key={idx} width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                  ))}
                </div>
              )}
              <span className="dt-travel-proud-badge">
                <TravelProudIcon size={14} />
                <span>Travel Proud</span>
              </span>
            </div>

            <h1 className="dt-property-title">{alojamiento.nombre}</h1>

            <div className="dt-address-line">
              <PinIcon size={16} color="#006ce4" />
              <span>{alojamiento.ubicacion?.address || (typeof alojamiento.ubicacion === 'string' ? alojamiento.ubicacion : alojamiento.destino || 'Ecuador')}</span>
              <span>–</span>
              <span className="dt-address-link" onClick={() => setShowMapModal(true)}>
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
              title={linkCopied ? '¡Enlace copiado al portapapeles!' : 'Compartir alojamiento'}
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2500);
              }}
              aria-label="Compartir alojamiento"
            >
              <ShareIcon size={20} color={linkCopied ? '#008009' : '#1a1a1a'} />
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

          {(photos[1] || photos[2]) && (
            <div className="dt-stacked-images">
              {photos.slice(1, 3).map((p, idx) => (
                <div key={idx} className="dt-stacked-image-wrapper" onClick={() => setLightboxIndex(idx + 1)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(idx + 1); } }}>
                  <img src={p.url} alt={`Foto ${idx + 2}`} className="dt-stacked-image" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Miniaturas: solo las fotos REALES que envió el hotel (sin repetir). El contador
            "+N fotos" refleja cuántas quedan fuera de la cuadrícula, o no se muestra. */}
        {photos.length > 3 && (
          <div className="dt-thumbnails-row">
            {photos.slice(3, 8).map((p, idx) => {
              const esUltima = idx === 4 && photos.length > 8;
              return (
                <div key={idx} className="dt-thumb-wrapper" onClick={() => setLightboxIndex(idx + 3)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIndex(idx + 3); } }}>
                  <img src={p.url} alt={`Foto ${idx + 4}`} className="dt-thumb-image" />
                  {esUltima && <div className="dt-more-photos-overlay">+{photos.length - 8} fotos</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Amenidades clave: las REALES que envía el hotel. */}
        {Array.isArray(alojamiento.amenidades) && alojamiento.amenidades.length > 0 && (
          <div className="dt-pills-bar">
            {alojamiento.amenidades.map((a, i) => (
              <span key={i} className="dt-pill-item">
                <CheckmarkIcon size={16} /> {a}
              </span>
            ))}
          </div>
        )}

        {/* 2-Column Section: Overview & Property Highlights */}
        <div className="dt-overview-grid">
          {/* Left Column */}
          <div className="dt-overview-left">
            <div className="dt-genius-notice">
              {user ? (
                <span>✓ Tienes beneficios y tarifas Genius activas aplicadas a tu estancia en <strong>{alojamiento.nombre}</strong>.</span>
              ) : (
                <span>Podrías optar a un descuento Genius en {alojamiento.nombre}. Para comprobar si hay un descuento Genius disponible para tus fechas, <Link to="/login" state={{ from: location.pathname + location.search }} onClick={() => sessionStorage.setItem('booking_return_url', location.pathname + location.search)}>inicia sesión</Link>.</span>
              )}
            </div>

            <div>
              <h2 className="dt-about-heading">Sobre este alojamiento</h2>
              {/* Descripción REAL que envía el hotel. */}
              {alojamiento.descripcion ? (
                <p className="dt-about-paragraph">{alojamiento.descripcion}</p>
              ) : (
                <p className="dt-about-paragraph" style={{ color: '#595959' }}>
                  {alojamiento.nombre}{alojamiento.destino ? ` · ${alojamiento.destino}` : ''}
                  {Number(alojamiento.estrellas) > 0 ? ` · ${alojamiento.estrellas} estrellas` : ''}.
                </p>
              )}
            </div>

            {/* Servicios más populares: SIEMPRE las amenidades reales del hotel. */}
            {Array.isArray(alojamiento.amenidades) && alojamiento.amenidades.length > 0 && (
              <div className="dt-popular-facilities-section">
                <h3 className="dt-popular-facilities-title">Servicios más populares</h3>
                <div className="dt-popular-facilities-grid">
                  {alojamiento.amenidades.map((a, i) => (
                    <span key={i} className="dt-popular-facility-item green">
                      <CheckmarkIcon size={16} color="#008009" /> {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Highlights Card & Score) */}
          <aside className="dt-overview-right">
            {/* Rating card */}
            <div className="dt-rating-card">
              <div className="dt-score-row">
                <div className="dt-score-text">
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    {!tieneScore ? 'Nuevo' : scoreNum >= 9 ? 'Excelente' : scoreNum >= 8 ? 'Muy bueno' : 'Bueno'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#595959' }}>
                    {reviewsCount > 0 ? `${reviewsCount} comentario${reviewsCount === 1 ? '' : 's'}` : 'Sin comentarios aún'}
                  </span>
                </div>
                {tieneScore && <div className="dt-score-badge">{score}</div>}
              </div>
              {Array.isArray(alojamiento.amenidades) && alojamiento.amenidades.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#374151', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                  <strong>Servicios del alojamiento:</strong>
                  <ul style={{ paddingLeft: '16px', margin: '6px 0 0 0' }}>
                    {alojamiento.amenidades.slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Side Map */}
            <div
              className="dt-side-map-box"
              style={{
                backgroundImage: 'url("https://tile.openstreetmap.org/13/2764/4096.png")',
                backgroundColor: '#e5e3df',
              }}
            >
              <button
                type="button"
                className="dt-btn-blue"
                onClick={() => setShowMapModal(true)}
              >
                <PinIcon size={16} /> Mostrar en el mapa
              </button>
            </div>

            {/* Property Highlights: datos reales del hotel. */}
            <div className="dt-highlights-card">
              <h3 className="dt-highlights-title">Puntos fuertes del alojamiento</h3>
              <div className="dt-stay-badge">¡Ideal para una estancia de {nightsCount} noches!</div>

              {(alojamiento.ubicacion?.address || alojamiento.destino) && (
                <div className="dt-highlight-point">
                  <PinIcon size={16} color="#006ce4" />
                  <div>
                    <strong>Ubicación:</strong> {alojamiento.ubicacion?.address || alojamiento.destino}
                  </div>
                </div>
              )}

              {Number(alojamiento.estrellas) > 0 && (
                <div className="dt-highlight-point">
                  <CheckmarkIcon size={16} color="#006ce4" />
                  <div><strong>Categoría:</strong> {alojamiento.estrellas} estrellas</div>
                </div>
              )}

              {(alojamiento.politicas?.checkin_desde || alojamiento.politicas?.checkout_hasta) && (
                <div className="dt-highlight-point">
                  <CheckmarkIcon size={16} color="#006ce4" />
                  <div>
                    <strong>Horarios:</strong> check-in {alojamiento.politicas?.checkin_desde || '—'} · check-out {alojamiento.politicas?.checkout_hasta || '—'}
                  </div>
                </div>
              )}

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

        {/* Genius promo banner: solo mostrar si el usuario NO ha iniciado sesión */}
        {!user && (
          <div className="dt-genius-promo-box">
            <div>
              <h3>Inicia sesión y ahorra dinero</h3>
              <p>Para comprobar si puedes ahorrar un 10% o más en este alojamiento, inicia sesión</p>
              <div className="dt-genius-btns">
                <Link to="/login" state={{ from: location.pathname + location.search }} onClick={() => sessionStorage.setItem('booking_return_url', location.pathname + location.search)} className="dt-btn-blue">
                  Iniciar sesión
                </Link>
                <Link to="/register" state={{ from: location.pathname + location.search }} onClick={() => sessionStorage.setItem('booking_return_url', location.pathname + location.search)} className="dt-link-blue">
                  Crear una cuenta gratis
                </Link>
              </div>
            </div>
            <div>
              <GeniusGiftIcon size={52} />
            </div>
          </div>
        )}

        {/* ======================================================================
            AVAILABILITY & ROOM SELECTION TABLE SECTION
            ====================================================================== */}
        <section className="dt-availability-section" ref={availabilityRef} id="availability">
          <div className="dt-availability-header">
            <div>
              <h2>Disponibilidad</h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#008009', fontWeight: 600, marginTop: '2px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#008009' }} />
                <span>En vivo: inventario y aforo sincronizados</span>
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', color: '#595959', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <PriceMatchIcon size={14} color="#008009" /> Igualamos el precio
            </span>
          </div>

          {/* Barra editable (fechas + ocupación), validada contra el backend */}
          <BarraDisponibilidad
            valores={valoresBusqueda}
            consultando={consultando}
            errorExterno={errorCotizacion}
            onAplicar={consultar}
          />

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
          <div className="dt-rooms-layout">
            <div className="dt-rooms-scroll">
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
                {(cotizacion?.productos?.length ? cotizacion.productos : []).map((p) => {
                  const elegido = p.product_id === cotizacion?.producto?.product_id;
                  const libres = Number(p.available_rooms) || 0;
                  return (
                    <tr key={p.product_id} className={elegido ? 'dt-room-row-elegida' : undefined} style={elegido ? { background: '#f0f6ff' } : undefined}>
                      <td>
                        <span className="dt-room-title-link">{p.room_name}</span>
                        <div className="dt-room-features-list">
                          <span style={{ fontWeight: 600, color: '#1a1a1a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <BedIcon size={14} color="#003580" />
                            {p.descripcion_camas || `${p.camas} ${p.camas === 1 ? 'cama' : 'camas'}`}
                            {p.tamano_m2 ? ` · ${p.tamano_m2} m²` : ''}
                          </span>
                          {p.descripcion && <span>{p.descripcion}</span>}
                          {(p.amenidades || []).slice(0, 3).map((a) => (
                            <span key={a} style={{ color: '#008009', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckmarkIcon size={14} /> {a}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '2px' }} aria-label={`Capacidad: ${p.capacidad?.adultos} adultos`}>
                          {Array.from({ length: Math.min(p.capacidad?.adultos || 1, 4) }, (_, i) => (
                            <UserIcon key={i} size={18} color="#1a1a1a" />
                          ))}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#595959', marginTop: 2 }}>
                          Máx. {p.capacidad?.adultos} {p.capacidad?.adultos === 1 ? 'adulto' : 'adultos'}
                          {p.capacidad?.ninos ? ` y ${p.capacidad.ninos} ${p.capacidad.ninos === 1 ? 'niño' : 'niños'}` : ''} por habitación
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', color: '#d4111e', textDecoration: 'line-through' }}>
                          {currency} {convertPrice(Math.round(p.price * 1.14))}
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a1a1a' }}>
                          {currency} {convertPrice(p.price)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#595959' }}>
                          {nightsCount} {nightsCount === 1 ? 'noche' : 'noches'}, {rooms} {Number(rooms) === 1 ? 'habitación' : 'habitaciones'} · +{currency} {convertPrice(Math.round(p.price * 0.15))} de impuestos
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.82rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckmarkIcon size={14} /> {formatearRegimen(p.meal_plan)}
                        </div>
                        <div style={{ color: p.reembolsable === false ? '#d4111e' : (p.reembolsable ? '#008009' : '#595959'), fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {p.reembolsable ? <CheckmarkIcon size={14} /> : (p.reembolsable === false ? '✕' : null)} {p.cancellation_type || (p.reembolsable === false ? 'No reembolsable' : 'Cancelación gratis')}
                        </div>
                        {libres <= 0 ? (
                          <div style={{ color: '#d4111e', fontWeight: 700, fontSize: '0.75rem' }}>
                            Agotado para tus fechas
                          </div>
                        ) : libres <= 3 ? (
                          <div style={{ color: '#d4111e', fontWeight: 700, fontSize: '0.75rem' }}>
                            ¡Solo {libres === 1 ? 'queda 1' : `quedan ${libres}`} a este precio en nuestra web!
                          </div>
                        ) : (
                          <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.75rem' }}>{libres} disponibles</div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                        {elegido ? (
                          <select
                            value={rooms}
                            onChange={(e) => consultar({ ...valoresBusqueda, habitaciones: Number(e.target.value), tipoId: p.product_id })}
                            disabled={consultando}
                            aria-label={`Habitaciones de tipo ${p.room_name}`}
                            style={{ padding: '8px 10px', border: '1px solid #003580', borderRadius: '4px', fontWeight: 700, fontSize: '14px', width: '100%', background: '#ffffff', cursor: 'pointer' }}
                          >
                            {Array.from({ length: Math.min(libres, 10) }, (_, i) => i + 1).map((num) => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => elegirProducto(p)}
                            disabled={consultando}
                            aria-label={`Elegir ${p.room_name}`}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #006ce4', borderRadius: '4px', background: '#ffffff', color: '#006ce4', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Elegir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!cotizacion?.productos?.length && (
                <tr>
                  <td>
                    <span className="dt-room-title-link">
                      {alojamiento.tipo_alojamiento || alojamiento.nombre || 'Habitación estándar'}
                    </span>
                    <div className="dt-room-features-list">
                      <span>
                        {[
                          alojamiento.habitaciones ? `${alojamiento.habitaciones} ${alojamiento.habitaciones === 1 ? 'dormitorio' : 'dormitorios'}` : null,
                          alojamiento.banos ? `${alojamiento.banos} ${alojamiento.banos === 1 ? 'baño privado' : 'baños'}` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                      <span>
                        {alojamiento.descripcion_camas || (alojamiento.camas ? `${alojamiento.camas} ${alojamiento.camas === 1 ? 'cama' : 'camas'}` : '1 cama')}
                      </span>
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
                    <div style={{ fontSize: '0.8rem', color: '#595959' }}>
                      Para {adults} {adults === 1 ? 'adulto' : 'adultos'}{edadesNinos.length > 0 ? ` y ${edadesNinos.length} ${edadesNinos.length === 1 ? 'niño' : 'niños'}` : ''}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#595959', marginTop: 2 }}>
                      Máx. {(alojamiento.capacidadAdultos || 2)} adultos por habitación
                    </div>
                  </td>
                  <td>
                    {originalPrice > 0 && (
                      <div style={{ fontSize: '0.85rem', color: '#d4111e', textDecoration: 'line-through' }}>
                        {currency} {convertPrice(originalPrice)}
                      </div>
                    )}
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a' }}>
                      {currency} {convertPrice(totalPrice > 0 ? totalPrice : (alojamiento.precioPorNoche || 0) * nightsCount)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#595959' }}>
                      {nightsCount} {nightsCount === 1 ? 'noche' : 'noches'}, 1 habitación · +{currency} {convertPrice(taxes > 0 ? taxes : Math.round(((totalPrice > 0 ? totalPrice : (alojamiento.precioPorNoche || 0) * nightsCount)) * 0.15))} de impuestos
                    </div>
                  </td>
                  <td>
                    <div style={{ color: '#008009', fontWeight: 600, fontSize: '0.82rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckmarkIcon size={14} /> {formatearRegimen(cotizacion?.producto?.meal_plan || 'Desayuno incluido')}
                    </div>
                    <div style={{ color: cotizacion?.producto?.reembolsable === false ? '#d4111e' : '#008009', fontWeight: 600, fontSize: '0.82rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {cotizacion?.producto?.reembolsable !== false && <CheckmarkIcon size={14} />} {cotizacion?.producto?.cancellation_type || (cotizacion?.producto?.reembolsable === false ? 'No reembolsable' : 'Cancelación gratis')}
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
                      onChange={(e) => consultar({ ...valoresBusqueda, habitaciones: Number(e.target.value) })}
                      disabled={isSoldOut || consultando}
                      aria-label="Habitaciones a reservar"
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
                )}
              </tbody>
            </table>
            </div>

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
                {rooms} × {cotizacion?.producto?.room_name || (rooms === 1 ? 'habitación' : 'habitaciones')} para {adults} {adults === 1 ? 'adulto' : 'adultos'}{edadesNinos.length > 0 ? ` y ${edadesNinos.length} ${edadesNinos.length === 1 ? 'niño' : 'niños'}` : ''} · {nightsCount} {nightsCount === 1 ? 'noche' : 'noches'}
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
                onClick={() => {
                  if (!user) {
                    sessionStorage.setItem('booking_return_url', location.pathname + location.search);
                    navigate('/login', { state: { from: location.pathname + location.search, message: 'Inicia sesión para completar tu reserva' } });
                    return;
                  }
                  setShowCheckoutModal(true);
                }}
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
                {alojamiento?.politicas?.es_reembolsable === false || cotizacion?.producto?.reembolsable === false ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d4111e', fontWeight: 600 }}>
                    <span>✕ No reembolsable</span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckmarkIcon size={12} color="#008009" /> <span>No pagas nada hoy</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckmarkIcon size={12} color="#008009" /> <span>Cancelación gratuita</span>
                    </div>
                  </>
                )}
              </div>
            </div>
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
                <strong>A partir de las {getHorarioCheckin(alojamiento)}{getHorarioCheckinHasta(alojamiento) ? ` hasta las ${getHorarioCheckinHasta(alojamiento)}` : ''}</strong>
                <div style={{ fontSize: '0.8rem', color: '#595959' }}>
                  Indica tu horario previsto de llegada al realizar la reserva.
                </div>
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <ClockIcon size={18} color="#003580" />
                <span>Salida</span>
              </div>
              <div className="dt-rule-right">
                <strong>Hasta las {getHorarioCheckout(alojamiento)}</strong>
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <InfoIcon size={18} color="#003580" />
                <span>Cancelación / prepago</span>
              </div>
              <div className="dt-rule-right">
                {alojamiento.politicas?.cancelacion || 'Las condiciones de cancelación y pago por adelantado pueden variar según el tipo de alojamiento y la tarifa seleccionada.'}
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
                  <strong>Cunas y camas supletorias:</strong> Hay cunas y camas adicionales disponibles a petición según disponibilidad.
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
                <PetsIcon size={18} color="#003580" />
                <span>Mascotas</span>
              </div>
              <div className="dt-rule-right">
                {alojamiento.politicas?.mascotas !== undefined
                  ? (alojamiento.politicas.mascotas ? 'Se admiten mascotas en el establecimiento.' : 'No se admiten mascotas en las habitaciones.')
                  : 'Consultar directamente con el establecimiento antes de la llegada.'}
              </div>
            </div>

            <div className="dt-rule-row">
              <div className="dt-rule-left">
                <NoSmokingIcon size={18} color="#003580" />
                <span>Fumar</span>
              </div>
              <div className="dt-rule-right">
                {alojamiento.politicas?.fumar !== undefined
                  ? (alojamiento.politicas.fumar ? 'Permitido fumar en áreas exteriores habilitadas.' : 'No se permite fumar en el interior del establecimiento.')
                  : 'No se permite fumar en las habitaciones ni en áreas comunes interiores.'}
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
                  <span style={{ fontSize: '0.8rem', color: '#595959', marginLeft: '8px' }}>Pagos electrónicos y tarjetas aceptadas</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================
            SURROUNDINGS & LANDMARKS
            ====================================================================== */}
        <section ref={surroundingsRef} style={{ marginBottom: '40px' }} id="surroundings">
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '14px' }}>
            Alrededores y lugares de interés cercanos
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', border: '1px solid #e7e7e7', borderRadius: '8px', padding: '20px', background: '#fff' }}>
            <div>
              <h3 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LandmarkIcon size={18} color="#003580" /> Monumentos y cultura
              </h3>
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
              <h3 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CoffeeIcon size={18} color="#003580" /> Restaurantes y cafeterías
              </h3>
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
              <h3 style={{ fontWeight: 700, margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrainIcon size={18} color="#003580" /> Transporte público
              </h3>
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

          {/* Mapa Interactivo de Ubicación y Alrededores */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '12px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PinIcon size={18} color="#003580" />
              Ubicación en el mapa interactivo
            </h3>
            <MapaAlojamientos
              mode="inline"
              alojamiento={alojamiento}
              height="380px"
            />
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
                {tieneScore ? `Puntuación de servicios: ${score}` : 'Servicios que ofrece el alojamiento'}
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
            {Array.isArray(alojamiento.amenidades) && alojamiento.amenidades.length > 0 ? (
              <div className="dt-facility-category-block">
                <h3>
                  <ApartmentIcon size={18} color="#003580" /> Servicios del alojamiento
                </h3>
                <ul className="dt-facility-items-list">
                  {alojamiento.amenidades.map((a, i) => (
                    <li key={i}><CheckmarkIcon size={14} /> {a}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#595959' }}>
                El alojamiento todavía no detalló sus servicios.
              </p>
            )}
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
              {reviewsCount > 0 ? `${reviewsCount} comentario${reviewsCount === 1 ? '' : 's'} de huéspedes` : 'Este alojamiento todavía no tiene comentarios'}
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
                  <div style={{ fontSize: '0.75rem', color: '#595959' }}>
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
          children={edadesNinos.length}
          edadesNinos={edadesNinos}
          tipoHabitacion={cotizacion?.producto || null}
          rooms={rooms}
          nightsCount={nightsCount}
          originalPrice={originalPrice}
          totalPrice={totalPrice}
          taxes={taxes}
          currency={currency}
          convertPrice={convertPrice}
          user={user}
          onClose={() => setShowCheckoutModal(false)}
        />
      )}

      <ReportModal 
        isOpen={showReportModal} 
        onClose={() => setShowReportModal(false)} 
        entityName={alojamiento?.nombre || 'Alojamiento'} 
        pnrOrId={alojamiento?.id || 'HOTEL'} 
        type="Hospedaje" 
      />

      {/* Modal de Mapa Interactivo con Leaflet y OpenStreetMap */}
      <MapaAlojamientos
        mode="modal"
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        alojamiento={alojamiento}
      />
    </main>
  );
}
