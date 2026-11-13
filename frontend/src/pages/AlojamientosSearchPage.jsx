import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { getAlojamientos, searchAlojamientos } from '../services/alojamientosApi';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/CurrencyContext';
import { DestinoAutocomplete } from '../components/DestinoAutocomplete';
import { destinoExacto, combinarDestinos } from '../utils/destinos';
import {
  BedIcon,
  CalendarIcon,
  UserIcon,
  PinIcon,
  CheckmarkIcon,
  GeniusGiftIcon,
  CloseIcon,
  HeartIcon,
  ChevronDownIcon,
  PreferredPlusBadge,
  NoResultsIllustration,
} from '../components/BookingIcons';
import './AlojamientosSearchPage.css';
import { fechaLocal } from '../utils/fechas';
import { MapaAlojamientos } from '../components/MapaAlojamientos';

// Histogram bar heights to replicate Booking.com desktop distribution curve
const HISTOGRAM_BARS = [
  5, 5, 5, 16, 11, 44, 33, 38, 44, 38, 38, 33, 27, 27, 22, 100,
  61, 66, 27, 66, 50, 33, 22, 77, 94, 27, 77, 11, 38, 33, 38, 11,
  77, 22, 16, 61, 22, 61, 38, 5, 16, 27, 44, 11, 38, 11, 44, 16, 27, 11
];

const PRESUPUESTO_SIN_LIMITE = 250;

const POPULAR_FILTER_LABELS = {
  kitchen: 'Cocina / zona de cocina',
  '5stars': '5 estrellas',
  spa: 'Spa y bienestar',
  parking: 'Estacionamiento',
  holiday: 'Casas vacacionales',
  verygood: 'Muy bien: 8+',
  elevator: 'Acceso en ascensor',
};

const FACILITY_LABELS = {
  parking: 'Estacionamiento',
  pool: 'Piscina',
  spa: 'Spa y bienestar',
  hottub: 'Bañera de hidromasaje',
  wifi: 'WiFi gratis',
  gym: 'Gimnasio',
  airport: 'Traslado aeropuerto',
  restaurant: 'Restaurante',
};

const NEIGHBOURHOOD_LABELS = {
  centro: 'Centro Histórico',
  carolina: 'La Carolina',
  mariscal: 'La Mariscal',
  bellavista: 'Bellavista',
  floresta: 'La Floresta',
};

const POLICY_LABELS = {
  noprepay: 'Sin pago por adelantado',
  nocredit: 'Reserva sin tarjeta de crédito',
  freecancel: 'Cancelación gratis',
};

const getPropPrice = (p, noches = 1) => {
  const disp = p?.disponibilidad;
  const n = Number(disp?.nights) || Number(noches) || 1;
  if (disp?.price_per_night != null && Number(disp.price_per_night) > 0) {
    return Number(disp.price_per_night);
  }
  if (disp?.total_price != null && Number(disp.total_price) > 0) {
    return Number(disp.total_price) / n;
  }
  if (typeof p?.precio_por_noche === 'object' && p?.precio_por_noche?.total != null) {
    return Number(p.precio_por_noche.total);
  }
  const val = p?.precioPorNoche ?? p?.precio_por_noche ?? p?.precio_noche ?? p?.price;
  return Number(val) || 50;
};

export function AlojamientosSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { convertPrice, currency } = useCurrency();

  // Search parameters from URL or defaults
  const initialDestination = searchParams.get('ss') || searchParams.get('destino') || 'Quito';
  const initialCheckin = searchParams.get('checkin') || fechaLocal(2);
  const initialCheckout = searchParams.get('checkout') || fechaLocal(4);
  const initialAdults = parseInt(searchParams.get('group_adults') || searchParams.get('adultos') || '2', 10);
  const initialChildren = parseInt(searchParams.get('group_children') || searchParams.get('ninos') || '0', 10);
  const initialRooms = parseInt(searchParams.get('no_rooms') || searchParams.get('habitaciones') || '1', 10);
  const initialType = searchParams.get('type') || searchParams.get('tipo');

  // Search Bar Form State
  const [destination, setDestination] = useState(initialDestination);
  const [destinosCatalogo, setDestinosCatalogo] = useState(undefined);
  const [destinationError, setDestinationError] = useState('');
  const [checkin, setCheckin] = useState(initialCheckin);
  const [checkout, setCheckout] = useState(initialCheckout);
  const [adults, setAdults] = useState(initialAdults);
  const [children, setChildren] = useState(initialChildren);
  const [rooms, setRooms] = useState(initialRooms);

  // Popover controls
  const [showDatesPopover, setShowDatesPopover] = useState(false);
  const [showOccupancyPopover, setShowOccupancyPopover] = useState(false);
  const occupancyRef = useRef(null);
  const datesRef = useRef(null);

  // Helper for formatting Booking date ranges (e.g. vie. 9 oct. — dom. 11 oct.)
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

  // Results & UI State
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [sortBy, setSortBy] = useState('popularity');
  const [wishlist, setWishlist] = useState(new Set());
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [syncPulse, setSyncPulse] = useState(false);

  // Filter States
  // El extremo derecho del control ("US$250+") significa SIN LÍMITE, como en Booking.
  // Antes filtraba ≤ 250 desde el inicio y escondía los hoteles más caros sin que el
  // usuario hubiera tocado nada.
  const [maxBudget, setMaxBudget] = useState(PRESUPUESTO_SIN_LIMITE);
  const [selectedTypes, setSelectedTypes] = useState(initialType ? [initialType] : []);
  const [selectedPopular, setSelectedPopular] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedStars, setSelectedStars] = useState([]);
  const [minReviewScore, setMinReviewScore] = useState(null);
  const [selectedNeighbourhoods, setSelectedNeighbourhoods] = useState([]);
  const [selectedPolicies, setSelectedPolicies] = useState([]);
  const [bedroomsCount, setBedroomsCount] = useState(0);

  // Modal de Mapa Leaflet + OpenStreetMap
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedMapProperty, setSelectedMapProperty] = useState(null);

  // Expanded toggles for long filter lists
  const [showAllFacilities, setShowAllFacilities] = useState(false);
  const [showAllRoomFacilities, setShowAllRoomFacilities] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (occupancyRef.current && !occupancyRef.current.contains(e.target)) {
        setShowOccupancyPopover(false);
      }
      if (datesRef.current && !datesRef.current.contains(e.target)) {
        setShowDatesPopover(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Compute number of nights between checkin and checkout
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

  // Fetch properties from backend API
  const fetchResults = async (params, isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const destQuery = params?.destino || (typeof params === 'string' ? params : destination);
      const cIn = params?.checkin || checkin;
      const cOut = params?.checkout || checkout;
      const ad = params?.adultos ?? adults;
      const ch = params?.ninos ?? children;
      const rm = params?.habitaciones ?? rooms;

      const opts = isSilent ? { timeout: 12000 } : {};
      const res = await searchAlojamientos({
        destino: destQuery,
        adultos: ad,
        ninos: ch,
        habitaciones: rm,
        dates: { checkin: cIn, checkout: cOut },
        rows: 25,
      }, opts);

      const items = res.data || res;
      const list = Array.isArray(items) ? items : [];
      setProperties((prev) => {
        if (prev && prev.length === list.length) {
          let hasDiff = false;
          for (let i = 0; i < list.length; i++) {
            const p = prev[i];
            const n = list[i];
            const pId = p.id || p.alojamiento_id || p._id;
            const nId = n.id || n.alojamiento_id || n._id;
            const pPrice = typeof p.precio_por_noche === 'object' ? p.precio_por_noche?.total : (p.precio_por_noche || p.precio_noche || p.price);
            const nPrice = typeof n.precio_por_noche === 'object' ? n.precio_por_noche?.total : (n.precio_por_noche || n.precio_noche || n.price);
            const pStock = p.habitaciones_disponibles || p.cupos || p.disponibilidad;
            const nStock = n.habitaciones_disponibles || n.cupos || n.disponibilidad;
            if (pId !== nId || pPrice !== nPrice || pStock !== nStock || (p.nombre || p.name) !== (n.nombre || n.name)) {
              hasDiff = true;
              break;
            }
          }
          if (!hasDiff) return prev;
        }
        return list;
      });
      if (isSilent) setError(null);
    } catch (err) {
      // Fallback to general list
      try {
        const destQuery = params?.destino || (typeof params === 'string' ? params : destination);
        const fallback = await getAlojamientos({ limit: 25, destino: destQuery, timeout: 12000 });
        const items = fallback.data || fallback;
        const list = Array.isArray(items) ? items : [];
        setProperties(list);
      } catch (e) {
        console.warn('[AlojamientosSearchPage] Error transitorio en refresco silencioso:', err?.message || err);
        if (!isSilent) {
          setError('Error al conectar con el servidor.');
        }
      }
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const dest = searchParams.get('ss') || searchParams.get('destino') || 'Quito';
    const cin = searchParams.get('checkin') || fechaLocal(2);
    const cout = searchParams.get('checkout') || fechaLocal(4);
    const ad = parseInt(searchParams.get('group_adults') || searchParams.get('adultos') || '2', 10);
    const ch = parseInt(searchParams.get('group_children') || searchParams.get('ninos') || '0', 10);
    const rm = parseInt(searchParams.get('no_rooms') || searchParams.get('habitaciones') || '1', 10);
    const typeParam = searchParams.get('type') || searchParams.get('tipo');

    setDestination(dest);
    setCheckin(cin);
    setCheckout(cout);
    setAdults(ad);
    setChildren(ch);
    setRooms(rm);
    if (typeParam) {
      setSelectedTypes([typeParam]);
    }
    setProperties([]);

    const currentQuery = {
      destino: dest,
      checkin: cin,
      checkout: cout,
      adultos: ad,
      ninos: ch,
      habitaciones: rm,
    };

    let timer = null;
    let isCancelled = false;

    const runPoll = async (silent) => {
      if (isCancelled) return;
      if (silent && typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(() => runPoll(true), 5000);
        return;
      }
      await fetchResults(currentQuery, silent);
      if (!isCancelled) {
        timer = setTimeout(() => runPoll(true), 5000);
      }
    };

    runPoll(false);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [searchParams]);

  // Sincronización continua de inventario en vivo (Simulando stream gRPC cada 5 segundos)
  useEffect(() => {
    let isCancelled = false;

    const interval = setInterval(async () => {
      try {
        const destQuery = destination.trim() || 'Quito';
        const res = await searchAlojamientos({
          destino: destQuery,
          adultos: adults,
          ninos: children,
          habitaciones: rooms,
          dates: { checkin, checkout },
          rows: 25,
        });
        const items = res.data || res;
        if (!isCancelled && Array.isArray(items) && items.length > 0) {
          setProperties(items);
          setLastSyncTime(new Date());
          setSyncPulse(true);
          setTimeout(() => {
            if (!isCancelled) setSyncPulse(false);
          }, 900);
        }
      } catch (err) {
        // Silencioso para no interrumpir al usuario
      }
    }, 5000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [destination, checkin, checkout, adults, children, rooms]);

  // Handle Search Submission
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const typed = destination.trim();
    if (!typed) {
      setDestinationError('Introduce un destino para empezar a buscar.');
      document.getElementById('sr-destination-input')?.focus();
      return;
    }
    if (checkin && checkout && checkout <= checkin) {
      setShowOccupancyPopover(false);
      setShowDatesPopover(true);
      return;
    }
    setDestinationError('');
    setShowDatesPopover(false);
    setShowOccupancyPopover(false);

    // "quito" / "QUÍTO" se normaliza al nombre oficial del destino si coincide exactamente.
    const dest = destinoExacto(typed)?.nombre || typed;
    setDestination(dest);
    setSearchParams({
      ss: dest,
      checkin,
      checkout,
      group_adults: adults,
      group_children: children,
      no_rooms: rooms,
    });
    // El useEffect([searchParams]) detectará el cambio en la URL y lanzará fetchResults.
  };

  // Toggle wishlist heart
  const toggleWishlist = (id) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle filter helper
  const toggleCheckbox = (list, setList, value) => {
    if (list.includes(value)) {
      setList(list.filter((x) => x !== value));
    } else {
      setList([...list, value]);
    }
  };

  // Helper to reset all applied filters cleanly
  const resetAllFilters = () => {
    setMaxBudget(PRESUPUESTO_SIN_LIMITE);
    setSelectedTypes([]);
    setSelectedPopular([]);
    setSelectedFacilities([]);
    setSelectedStars([]);
    setMinReviewScore(null);
    setSelectedNeighbourhoods([]);
    setSelectedPolicies([]);
    setBedroomsCount(0);
  };

  const hasActiveFilters = Boolean(
    maxBudget < PRESUPUESTO_SIN_LIMITE ||
    selectedPopular.length > 0 ||
    selectedTypes.length > 0 ||
    selectedFacilities.length > 0 ||
    selectedStars.length > 0 ||
    minReviewScore !== null ||
    selectedNeighbourhoods.length > 0 ||
    selectedPolicies.length > 0 ||
    bedroomsCount > 0
  );

  // Dynamic filter counters computed from current properties list
  const filterCounts = useMemo(() => {
    const counts = {
      popular: {},
      types: {},
      facilities: {},
      stars: {},
      reviews: {},
      neighbourhoods: {},
      policies: {},
    };

    if (!properties || !properties.length) return counts;

    for (const p of properties) {
      const ams = (p.amenidades || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
      const score = Number(p.ratings?.score ?? p.puntuacion ?? p.calificacion ?? 8.5);
      const stars = Number(p.estrellas ?? p.stars ?? p.categoria ?? 0);
      const type = (p.tipo_propiedad || p.tipoPropiedad || p.tipo || 'Hotel').toLowerCase();
      const name = (p.nombre || p.name || '').toLowerCase();
      const loc = `${p.direccion || ''} ${p.ubicacion?.address || ''} ${p.ubicacion || ''} ${p.barrio || ''} ${p.nombre || ''} ${p.destino || ''}`.toLowerCase();
      const polText = `${typeof p.politicas === 'string' ? p.politicas : JSON.stringify(p.politicas || {})} ${p.normas || ''}`.toLowerCase();

      // Popular
      if (ams.some((a) => a.includes('cocina') || a.includes('kitchenette'))) counts.popular.kitchen = (counts.popular.kitchen || 0) + 1;
      if (stars === 5) counts.popular['5stars'] = (counts.popular['5stars'] || 0) + 1;
      if (ams.some((a) => a.includes('spa') || a.includes('bienestar'))) counts.popular.spa = (counts.popular.spa || 0) + 1;
      if (p.tieneParqueadero || ams.some((a) => /parqueadero|estacionamiento|parking/i.test(a))) counts.popular.parking = (counts.popular.parking || 0) + 1;
      if (type.includes('casa') || name.includes('casa') || type.includes('villa') || type.includes('lodge')) counts.popular.holiday = (counts.popular.holiday || 0) + 1;
      if (score >= 8.0) counts.popular.verygood = (counts.popular.verygood || 0) + 1;
      if (ams.some((a) => a.includes('ascensor') || a.includes('elevador'))) counts.popular.elevator = (counts.popular.elevator || 0) + 1;

      // Types
      if (type.includes('hotel') || name.includes('hotel')) counts.types['Hoteles'] = (counts.types['Hoteles'] || 0) + 1;
      if (type.includes('depart') || type.includes('apart') || name.includes('suite') || name.includes('apart')) counts.types['Apartamentos'] = (counts.types['Apartamentos'] || 0) + 1;
      if (type.includes('casa') || name.includes('casa') || type.includes('villa')) counts.types['Holiday homes'] = (counts.types['Holiday homes'] || 0) + 1;
      if (type.includes('bed') || name.includes('b&b')) counts.types['Bed and breakfasts'] = (counts.types['Bed and breakfasts'] || 0) + 1;
      if (type.includes('aparthotel') || name.includes('aparthotel')) counts.types['Aparthotels'] = (counts.types['Aparthotels'] || 0) + 1;
      if (type.includes('hostal') || name.includes('hostal') || type.includes('posada') || name.includes('posada')) counts.types['Hostales'] = (counts.types['Hostales'] || 0) + 1;
      if (type.includes('guest') || type.includes('huesped') || name.includes('guest')) counts.types['Guest houses'] = (counts.types['Guest houses'] || 0) + 1;

      // Facilities
      if (p.tieneParqueadero || ams.some((a) => /parqueadero|estacionamiento|parking/i.test(a))) counts.facilities.parking = (counts.facilities.parking || 0) + 1;
      if (p.tienePiscina || ams.some((a) => /piscina|alberca|pool/i.test(a))) counts.facilities.pool = (counts.facilities.pool || 0) + 1;
      if (ams.some((a) => /spa|bienestar/i.test(a))) counts.facilities.spa = (counts.facilities.spa || 0) + 1;
      if (ams.some((a) => /jacuzzi|hot\s*tub|hidromasaje/i.test(a))) counts.facilities.hottub = (counts.facilities.hottub || 0) + 1;
      if (ams.some((a) => /wifi|internet/i.test(a)) || true) counts.facilities.wifi = (counts.facilities.wifi || 0) + 1;
      if (ams.some((a) => /gimnasio|gym|fitness/i.test(a))) counts.facilities.gym = (counts.facilities.gym || 0) + 1;
      if (ams.some((a) => /traslado|aeropuerto|shuttle/i.test(a))) counts.facilities.airport = (counts.facilities.airport || 0) + 1;
      if (ams.some((a) => /restaurante|desayuno|bar|comedor/i.test(a))) counts.facilities.restaurant = (counts.facilities.restaurant || 0) + 1;

      // Stars
      if (stars >= 1 && stars <= 5) counts.stars[stars] = (counts.stars[stars] || 0) + 1;

      // Reviews
      if (score >= 9.0) counts.reviews[9.0] = (counts.reviews[9.0] || 0) + 1;
      if (score >= 8.0) counts.reviews[8.0] = (counts.reviews[8.0] || 0) + 1;
      if (score >= 7.0) counts.reviews[7.0] = (counts.reviews[7.0] || 0) + 1;
      if (score >= 6.0) counts.reviews[6.0] = (counts.reviews[6.0] || 0) + 1;

      // Neighbourhoods
      if (/centro|hist[oó]rico|san blas/i.test(loc)) counts.neighbourhoods.centro = (counts.neighbourhoods.centro || 0) + 1;
      if (/carolina|inaquito|iñaquito/i.test(loc)) counts.neighbourhoods.carolina = (counts.neighbourhoods.carolina || 0) + 1;
      if (/mariscal|foch|colon/i.test(loc)) counts.neighbourhoods.mariscal = (counts.neighbourhoods.mariscal || 0) + 1;
      if (/bellavista|gonzalez suarez/i.test(loc)) counts.neighbourhoods.bellavista = (counts.neighbourhoods.bellavista || 0) + 1;
      if (/floresta/i.test(loc)) counts.neighbourhoods.floresta = (counts.neighbourhoods.floresta || 0) + 1;

      // Policies
      if (p.cancelacionGratis !== false || /cancelaci[oó]n gratis|cancelacion gratuita/i.test(polText)) counts.policies.freecancel = (counts.policies.freecancel || 0) + 1;
      if (p.pagoEnAlojamiento !== false || /sin pago|pago en el alojamiento|pagar al llegar/i.test(polText) || true) counts.policies.noprepay = (counts.policies.noprepay || 0) + 1;
      counts.policies.nocredit = (counts.policies.nocredit || 0) + 1;
    }

    return counts;
  }, [properties]);

  // Filter and Sort properties with complete coverage
  const filteredProperties = useMemo(() => {
    let result = [...properties];

    // 1. Budget Filter (por noche)
    if (maxBudget < PRESUPUESTO_SIN_LIMITE) {
      result = result.filter((p) => getPropPrice(p, nightsCount) <= maxBudget);
    }

    // 2. Property Type Filter
    if (selectedTypes.length > 0) {
      result = result.filter((p) => {
        const type = (p.tipo_propiedad || p.tipoPropiedad || p.tipo || 'Hotel').toLowerCase();
        const name = (p.nombre || p.name || '').toLowerCase();
        return selectedTypes.some((t) => {
          const tLow = t.toLowerCase();
          if (tLow.includes('hotel') && !tLow.includes('apart')) {
            return type.includes('hotel') || name.includes('hotel') || (!type.includes('depart') && !type.includes('hostal') && !type.includes('casa'));
          }
          if (tLow.includes('depart') || tLow.includes('apart')) {
            return type.includes('depart') || type.includes('apart') || name.includes('suite') || name.includes('apart');
          }
          if (tLow.includes('hostal')) {
            return type.includes('hostal') || name.includes('hostal') || type.includes('posada') || name.includes('posada');
          }
          if (tLow.includes('casa') || tLow.includes('holiday') || tLow.includes('guest') || tLow.includes('bed')) {
            return type.includes('casa') || name.includes('casa') || type.includes('villa') || type.includes('lodge') || type.includes('posada');
          }
          return type.includes(tLow) || name.includes(tLow);
        });
      });
    }

    // 3. Popular amenities & conditions
    if (selectedPopular.length > 0) {
      result = result.filter((p) => {
        const ams = (p.amenidades || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
        const score = Number(p.ratings?.score ?? p.puntuacion ?? p.calificacion ?? 8.5);
        const stars = Number(p.estrellas ?? p.stars ?? p.categoria ?? 3);
        const type = (p.tipo_propiedad || p.tipoPropiedad || p.tipo || '').toLowerCase();
        const name = (p.nombre || '').toLowerCase();

        return selectedPopular.every((pop) => {
          if (pop === 'kitchen') return ams.some((a) => a.includes('cocina') || a.includes('kitchenette'));
          if (pop === '5stars') return stars === 5;
          if (pop === 'spa') return ams.some((a) => a.includes('spa') || a.includes('bienestar'));
          if (pop === 'parking') return p.tieneParqueadero || ams.some((a) => /parqueadero|estacionamiento|parking/i.test(a));
          if (pop === 'holiday') return type.includes('casa') || name.includes('casa') || type.includes('villa') || type.includes('lodge');
          if (pop === 'verygood') return score >= 8.0;
          if (pop === 'elevator') return ams.some((a) => a.includes('ascensor') || a.includes('elevador'));
          return true;
        });
      });
    }

    // 4. Facilities & Services
    if (selectedFacilities.length > 0) {
      result = result.filter((p) => {
        const ams = (p.amenidades || []).map((a) => (typeof a === 'string' ? a.toLowerCase() : ''));
        return selectedFacilities.every((fac) => {
          if (fac === 'pool') return p.tienePiscina || ams.some((a) => /piscina|alberca|pool/i.test(a));
          if (fac === 'wifi') return ams.some((a) => /wifi|internet/i.test(a)) || true;
          if (fac === 'parking') return p.tieneParqueadero || ams.some((a) => /parqueadero|estacionamiento|parking/i.test(a));
          if (fac === 'spa') return ams.some((a) => /spa|bienestar/i.test(a));
          if (fac === 'hottub') return ams.some((a) => /jacuzzi|hot\s*tub|hidromasaje/i.test(a));
          if (fac === 'gym') return ams.some((a) => /gimnasio|gym|fitness/i.test(a));
          if (fac === 'airport') return ams.some((a) => /traslado|aeropuerto|shuttle/i.test(a));
          if (fac === 'restaurant') return ams.some((a) => /restaurante|desayuno|bar|comedor/i.test(a));
          return true;
        });
      });
    }

    // 5. Stars
    if (selectedStars.length > 0) {
      result = result.filter((p) => {
        const s = Number(p.estrellas ?? p.stars ?? p.categoria ?? 0);
        return selectedStars.includes(s);
      });
    }

    // 6. Minimum Review Score
    if (minReviewScore !== null) {
      result = result.filter((p) => {
        const score = Number(p.ratings?.score ?? p.puntuacion ?? p.calificacion ?? 8.5);
        return score >= minReviewScore;
      });
    }

    // 7. Bedrooms count stepper
    if (bedroomsCount > 0) {
      result = result.filter((p) => (Number(p.habitaciones) || 1) >= bedroomsCount);
    }

    // 8. Neighbourhoods
    if (selectedNeighbourhoods.length > 0) {
      result = result.filter((p) => {
        const loc = `${p.direccion || ''} ${p.ubicacion?.address || ''} ${p.ubicacion || ''} ${p.barrio || ''} ${p.nombre || ''} ${p.destino || ''}`.toLowerCase();
        return selectedNeighbourhoods.some((nId) => {
          if (nId === 'centro') return /centro|hist[oó]rico|san blas/i.test(loc);
          if (nId === 'carolina') return /carolina|inaquito|iñaquito/i.test(loc);
          if (nId === 'mariscal') return /mariscal|foch|colon/i.test(loc);
          if (nId === 'bellavista') return /bellavista|gonzalez suarez/i.test(loc);
          if (nId === 'floresta') return /floresta/i.test(loc);
          return loc.includes(nId);
        });
      });
    }

    // 10. Reservation policies
    if (selectedPolicies.length > 0) {
      result = result.filter((p) => {
        const polText = `${typeof p.politicas === 'string' ? p.politicas : JSON.stringify(p.politicas || {})} ${p.normas || ''}`.toLowerCase();
        return selectedPolicies.every((polId) => {
          if (polId === 'freecancel') {
            return p.cancelacionGratis !== false || /cancelaci[oó]n gratis|cancelacion gratuita/i.test(polText);
          }
          if (polId === 'noprepay') {
            return p.pagoEnAlojamiento !== false || /sin pago|pago en el alojamiento|pagar al llegar/i.test(polText) || true;
          }
          if (polId === 'nocredit') {
            return true;
          }
          return true;
        });
      });
    }

    // Sorter logic
    if (sortBy === 'price_asc') {
      result.sort((a, b) => getPropPrice(a) - getPropPrice(b));
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => getPropPrice(b) - getPropPrice(a));
    } else if (sortBy === 'rating') {
      result.sort((a, b) => {
        const sA = Number(a.ratings?.score ?? a.puntuacion ?? 0);
        const sB = Number(b.ratings?.score ?? b.puntuacion ?? 0);
        return sB - sA;
      });
    } else if (sortBy === 'reviews') {
      result.sort((a, b) => {
        const rA = Number(a.ratings?.number_of_reviews ?? a.numero_resenas ?? 0);
        const rB = Number(b.ratings?.number_of_reviews ?? b.numero_resenas ?? 0);
        return rB - rA;
      });
    }

    return result;
  }, [
    properties,
    maxBudget,
    selectedTypes,
    selectedPopular,
    selectedFacilities,
    selectedStars,
    minReviewScore,
    selectedNeighbourhoods,
    selectedPolicies,
    bedroomsCount,
    sortBy,
  ]);

  if (loading && properties.length === 0) {
    return <AlojamientosLoadingView />;
  }

  return (
    <main id="contenido-principal" className="sr-page-wrapper">
      {/* ======================================================================
          TOP HORIZONTAL SEARCH BAR
          ====================================================================== */}
      <section className="sr-searchbox-container">
        <div className="sr-searchbox-inner">
          <form className="sr-searchbox-bar" onSubmit={handleSearchSubmit}>
            {/* 1. Destination Field */}
            <div className="sr-search-field">
              <span className="sr-search-icon" aria-hidden="true">
                <BedIcon size={20} color="#474747" />
              </span>
              <div className="sr-field-content">
                <label htmlFor="sr-destination-input" className="sr-field-label">Indica el destino</label>
                <DestinoAutocomplete
                  id="sr-destination-input"
                  className="sr-field-input"
                  value={destination}
                  onChange={(val) => {
                    setDestination(val);
                    if (val.trim()) setDestinationError('');
                  }}
                  onSelect={(destObj) => {
                    const destName = destObj?.nombre || destination;
                    setDestination(destName);
                    setDestinationError('');
                    setShowOccupancyPopover(false);
                    setSearchParams({
                      ss: destName,
                      checkin,
                      checkout,
                      group_adults: adults,
                      group_children: children,
                      no_rooms: rooms,
                    });
                    // fetchResults lo dispara el useEffect([searchParams])
                  }}
                  onInvalidChars={() => setDestinationError('Solo se permiten letras, espacios y los signos , . - \' &')}
                  invalid={Boolean(destinationError)}
                  errorId="sr-destination-error"
                  catalogo={destinosCatalogo}
                />
              </div>
              {destinationError && (
                <div id="sr-destination-error" role="alert" className="dest-ac-error">
                  {destinationError}
                </div>
              )}
              {destination && (
                <button
                  type="button"
                  className="sr-clear-btn"
                  onClick={() => {
                    setDestination('');
                    document.getElementById('sr-destination-input')?.focus();
                  }}
                  aria-label="Borrar destino"
                >
                  <CloseIcon size={14} color="#595959" />
                </button>
              )}
            </div>

            {/* 2. Dates Field */}
            <div className="sr-search-field" ref={datesRef} onClick={() => setShowDatesPopover(!showDatesPopover)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDatesPopover(!showDatesPopover); } }}>
              <span className="sr-search-icon" aria-hidden="true">
                <CalendarIcon size={20} color="#474747" />
              </span>
              <div className="sr-field-content">
                <span className="sr-field-label">Selecciona las fechas</span>
                <span className="sr-field-input">
                  {formatBookingDateRange(checkin, checkout)}
                </span>
              </div>

              {/* Dates Popover */}
              {showDatesPopover && (
                <div className="sr-popover" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fecha de entrada</label>
                      <input
                        type="date"
                        value={checkin}
                        onChange={(e) => setCheckin(e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fecha de salida</label>
                      <input
                        type="date"
                        value={checkout}
                        min={checkin || undefined}
                        onChange={(e) => setCheckout(e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                      />
                    </div>
                  </div>
                  {checkin && checkout && checkout <= checkin && (
                    <p role="alert" style={{ margin: '8px 0 0', color: '#d4111e', fontSize: '0.8rem', fontWeight: 600 }}>
                      La fecha de salida debe ser posterior a la de entrada.
                    </p>
                  )}
                  <button
                    type="button"
                    className="sr-smart-btn"
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      setShowDatesPopover(false);
                      if (checkin && checkout && checkout > checkin) {
                        setSearchParams({
                          ss: destination,
                          checkin,
                          checkout,
                          group_adults: adults,
                          group_children: children,
                          no_rooms: rooms,
                        });
                        // fetchResults lo dispara el useEffect([searchParams])
                      }
                    }}
                  >
                    Confirmar fechas
                  </button>
                </div>
              )}
            </div>

            {/* 3. Occupancy Field */}
            <div
              className="sr-search-field"
              ref={occupancyRef}
              onClick={() => setShowOccupancyPopover(!showOccupancyPopover)}
            >
              <span className="sr-search-icon" aria-hidden="true">
                <UserIcon size={20} color="#474747" />
              </span>
              <div className="sr-field-content">
                <span className="sr-field-label">Personas y habitaciones</span>
                <span className="sr-field-input">
                  {adults} adultos · {children} niños · {rooms} hab.
                </span>
              </div>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <ChevronDownIcon size={14} color="#595959" />
              </span>

              {/* Occupancy Stepper Popover */}
              {showOccupancyPopover && (
                <div className="sr-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="sr-popover-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>Adultos</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>18 años o más</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={adults <= 1}
                        onClick={() => setAdults((a) => Math.max(1, a - 1))}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{adults}</span>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={adults >= 10}
                        onClick={() => setAdults((a) => a + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="sr-popover-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>Niños</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>De 0 a 17 años</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={children <= 0}
                        onClick={() => setChildren((c) => Math.max(0, c - 1))}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{children}</span>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={children >= 10}
                        onClick={() => setChildren((c) => c + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="sr-popover-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>Habitaciones</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={rooms <= 1}
                        onClick={() => setRooms((r) => Math.max(1, r - 1))}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{rooms}</span>
                      <button
                        type="button"
                        className="sr-stepper-btn"
                        disabled={rooms >= 10}
                        onClick={() => setRooms((r) => r + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sr-smart-btn"
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      setShowOccupancyPopover(false);
                      setSearchParams({
                        ss: destination,
                        checkin,
                        checkout,
                        group_adults: adults,
                        group_children: children,
                        no_rooms: rooms,
                      });
                      // fetchResults lo dispara el useEffect([searchParams])
                    }}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* 4. Search Button */}
            <button type="submit" className="sr-search-btn" disabled={loading}>
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </form>
        </div>
      </section>

      {/* ======================================================================
          BREADCRUMBS
          ====================================================================== */}
      <div className="sr-breadcrumbs-container">
        <ol className="sr-breadcrumbs">
          <li>
            <Link to="/">Inicio</Link>
            <span className="sr-breadcrumb-separator">›</span>
          </li>
          <li>
            <Link to="/alojamientos">Ecuador</Link>
            <span className="sr-breadcrumb-separator">›</span>
          </li>
          <li>
            <Link to={`/alojamientos/search?ss=${encodeURIComponent(destination)}`}>{destination}</Link>
            <span className="sr-breadcrumb-separator">›</span>
          </li>
          <li className="sr-current">Resultados de búsqueda</li>
        </ol>
      </div>

      {/* ======================================================================
          MAIN 2-COLUMN CONTAINER
          ====================================================================== */}
      <div className="sr-main-container">
        {/* ================= LEFT SIDEBAR FILTERS ================= */}
        <aside className="sr-sidebar">
          {/* 1. Map preview card */}
          <div
            className="sr-map-entry"
            style={{
              backgroundImage:
                'url("https://tile.openstreetmap.org/13/2764/4096.png")',
              backgroundColor: '#e5e3df',
            }}
          >
            <button
              type="button"
              className="sr-map-btn"
              onClick={() => {
                setSelectedMapProperty(null);
                setShowMapModal(true);
              }}
            >
              <PinIcon size={18} color="currentColor" />
              <span>Mostrar en el mapa</span>
            </button>
          </div>

          {/* 2. Filters Box */}
          <div className="sr-filters-box">
            <h2 className="sr-filters-heading">Filtrar por:</h2>

            {/* Budget Filter with Histogram */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">
                <span>Tu presupuesto (por noche)</span>
              </div>
              <div className="sr-price-inputs">
                <span>US$5</span>
                <span>US${maxBudget}{maxBudget >= PRESUPUESTO_SIN_LIMITE ? '+' : ''} / noche</span>
              </div>
              {nightsCount > 1 && maxBudget < PRESUPUESTO_SIN_LIMITE && (
                <div style={{ fontSize: '0.74rem', color: '#595959', marginTop: '3px', textAlign: 'right' }}>
                  Hasta US${maxBudget * nightsCount} total ({nightsCount} noches)
                </div>
              )}

              {/* Histogram bars */}
              <div className="sr-histogram-container">
                {HISTOGRAM_BARS.map((height, i) => {
                  const barValue = 5 + (i / HISTOGRAM_BARS.length) * 200;
                  const isActive = barValue <= maxBudget;
                  return (
                    <span
                      key={i}
                      className={`sr-histogram-bar ${isActive ? '' : 'inactive'}`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>

              <input
                type="range"
                className="sr-range-slider"
                aria-label="Presupuesto máximo por noche"
                aria-valuetext={maxBudget >= PRESUPUESTO_SIN_LIMITE ? 'Sin límite' : `US$${maxBudget}`}
                min="10"
                max={PRESUPUESTO_SIN_LIMITE}
                step="5"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
              />
            </div>

            {/* Popular filters */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Filtros populares</div>
              {[
                { id: 'bathroom', label: 'Baño privado' },
                { id: 'kitchen', label: 'Cocina / zona de cocina' },
                { id: '5stars', label: '5 estrellas' },
                { id: 'spa', label: 'Spa y centro de bienestar' },
                { id: 'parking', label: 'Estacionamiento' },
                { id: 'holiday', label: 'Casas vacacionales' },
                { id: 'verygood', label: 'Muy bien: 8 o más' },
                { id: 'elevator', label: 'Acceso en ascensor' },
              ].map((item) => (
                <label key={item.id} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={selectedPopular.includes(item.id)}
                      onChange={() => toggleCheckbox(selectedPopular, setSelectedPopular, item.id)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.popular[item.id] || 0}</span>
                </label>
              ))}
            </div>

            {/* Property type */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Tipo de alojamiento</div>
              {[
                { id: 'Hoteles', label: 'Hoteles' },
                { id: 'Apartamentos', label: 'Departamentos' },
                { id: 'Holiday homes', label: 'Casas vacacionales' },
                { id: 'Bed and breakfasts', label: 'Bed and breakfasts' },
                { id: 'Aparthotels', label: 'Apartahoteles' },
                { id: 'Hostales', label: 'Hostales y pensiones' },
                { id: 'Guest houses', label: 'Casas de huéspedes' },
              ].map((item) => (
                <label key={item.id} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(item.id)}
                      onChange={() => toggleCheckbox(selectedTypes, setSelectedTypes, item.id)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.types[item.id] || 0}</span>
                </label>
              ))}
            </div>

            {/* Bedrooms stepper */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Dormitorios</div>
              <div className="sr-stepper-filter-row">
                <span className="sr-stepper-filter-label">Dormitorios</span>
                <div className="sr-stepper-control">
                  <button
                    type="button"
                    disabled={bedroomsCount <= 0}
                    onClick={() => setBedroomsCount((b) => Math.max(0, b - 1))}
                  >
                    −
                  </button>
                  <span>{bedroomsCount}</span>
                  <button type="button" onClick={() => setBedroomsCount((b) => b + 1)}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Facilities */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Servicios e instalaciones</div>
              {[
                { id: 'parking', label: 'Estacionamiento' },
                { id: 'pool', label: 'Piscina' },
                { id: 'spa', label: 'Spa y centro de bienestar' },
                { id: 'hottub', label: 'Bañera de hidromasaje' },
                { id: 'wifi', label: 'WiFi gratis' },
              ]
                .concat(
                  showAllFacilities
                    ? [
                        { id: 'gym', label: 'Gimnasio' },
                        { id: 'airport', label: 'Traslado aeropuerto' },
                        { id: 'restaurant', label: 'Restaurante' },
                      ]
                    : []
                )
                .map((item) => (
                  <label key={item.id} className="sr-checkbox-item">
                    <span className="sr-checkbox-label-left">
                      <input
                        type="checkbox"
                        checked={selectedFacilities.includes(item.id)}
                        onChange={() => toggleCheckbox(selectedFacilities, setSelectedFacilities, item.id)}
                      />
                      <span>{item.label}</span>
                    </span>
                    <span className="sr-checkbox-count">{filterCounts.facilities[item.id] || 0}</span>
                  </label>
                ))}
              <button
                type="button"
                className="sr-expand-btn"
                onClick={() => setShowAllFacilities(!showAllFacilities)}
              >
                {showAllFacilities ? 'Mostrar menos' : 'Mostrar más servicios ▾'}
              </button>
            </div>

            {/* Property rating (Stars) */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">
                <div>Categoría del alojamiento</div>
                <div className="sr-filter-subtitle">Encuentra hoteles con estrellas</div>
              </div>
              {[
                { stars: 5, label: '5 estrellas' },
                { stars: 4, label: '4 estrellas' },
                { stars: 3, label: '3 estrellas' },
                { stars: 2, label: '2 estrellas' },
                { stars: 1, label: '1 estrella' },
              ].map((item) => (
                <label key={item.stars} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={selectedStars.includes(item.stars)}
                      onChange={() => toggleCheckbox(selectedStars, setSelectedStars, item.stars)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.stars[item.stars] || 0}</span>
                </label>
              ))}
            </div>

            {/* Review score */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Puntuación de los comentarios</div>
              {[
                { score: 9.0, label: 'Excelente: 9 o más' },
                { score: 8.0, label: 'Muy bien: 8 o más' },
                { score: 7.0, label: 'Bien: 7 o más' },
                { score: 6.0, label: 'Agradable: 6 o más' },
              ].map((item) => (
                <label key={item.score} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={minReviewScore === item.score}
                      onChange={() => setMinReviewScore(minReviewScore === item.score ? null : item.score)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.reviews[item.score] || 0}</span>
                </label>
              ))}
            </div>

            {/* Neighbourhood */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Zonas y barrios</div>
              {[
                { id: 'centro', label: 'Centro Histórico' },
                { id: 'carolina', label: 'La Carolina' },
                { id: 'mariscal', label: 'La Mariscal' },
                { id: 'bellavista', label: 'Bellavista' },
                { id: 'floresta', label: 'La Floresta' },
              ].map((item) => (
                <label key={item.id} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={selectedNeighbourhoods.includes(item.id)}
                      onChange={() => toggleCheckbox(selectedNeighbourhoods, setSelectedNeighbourhoods, item.id)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.neighbourhoods[item.id] || 0}</span>
                </label>
              ))}
            </div>

            {/* Reservation policy */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Condiciones de reserva</div>
              {[
                { id: 'noprepay', label: 'Sin pago por adelantado' },
                { id: 'nocredit', label: 'Reserva sin tarjeta de crédito' },
                { id: 'freecancel', label: 'Cancelación gratis' },
              ].map((item) => (
                <label key={item.id} className="sr-checkbox-item">
                  <span className="sr-checkbox-label-left">
                    <input
                      type="checkbox"
                      checked={selectedPolicies.includes(item.id)}
                      onChange={() => toggleCheckbox(selectedPolicies, setSelectedPolicies, item.id)}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="sr-checkbox-count">{filterCounts.policies[item.id] || 0}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* ================= RIGHT SEARCH RESULTS CONTENT ================= */}
        <div className="sr-results-content">
          {/* Header Bar */}
          <div className="sr-results-header">
            <div>
              <h1 className="sr-results-title">
                {destination}: {filteredProperties.length} {filteredProperties.length === 1 ? 'alojamiento encontrado' : 'alojamientos encontrados'}
              </h1>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.8rem', color: '#008009', fontWeight: 600, marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#008009',
                    boxShadow: syncPulse ? '0 0 10px #00a812' : 'none',
                    transform: syncPulse ? 'scale(1.3)' : 'scale(1)',
                    transition: 'all 0.3s ease-in-out',
                  }}
                />
                <span>En vivo: inventario actualizado ({lastSyncTime.toLocaleTimeString()})</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* List / Grid Toggle */}
              <div className="sr-view-toggle">
                <button
                  type="button"
                  className={`sr-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  Lista
                </button>
                <button
                  type="button"
                  className={`sr-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  Cuadrícula
                </button>
              </div>

              {/* Sorter Dropdown */}
              <div className="sr-sorter-bar">
                <select
                  className="sr-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Ordenar resultados"
                >
                  <option value="popularity">Ordenar por: Nuestras opciones preferidas ↕</option>
                  <option value="price_asc">Precio (más bajo primero)</option>
                  <option value="price_desc">Precio (más alto primero)</option>
                  <option value="rating">Puntuación más alta</option>
                  <option value="reviews">Número de comentarios</option>
                </select>
              </div>
            </div>
          </div>

          {/* Applied filters chips if any */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.8rem', color: '#595959', fontWeight: 600 }}>Filtros activos:</span>
              {maxBudget < PRESUPUESTO_SIN_LIMITE && (
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => setMaxBudget(PRESUPUESTO_SIN_LIMITE)}
                >
                  <span>Hasta US${maxBudget}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              )}
              {selectedPopular.map((id) => (
                <span
                  key={id}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedPopular, setSelectedPopular, id)}
                >
                  <span>{POPULAR_FILTER_LABELS[id] || id}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {selectedTypes.map((t) => (
                <span
                  key={t}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedTypes, setSelectedTypes, t)}
                >
                  <span>{t}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {selectedFacilities.map((f) => (
                <span
                  key={f}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedFacilities, setSelectedFacilities, f)}
                >
                  <span>{FACILITY_LABELS[f] || f}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {selectedStars.map((s) => (
                <span
                  key={s}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedStars, setSelectedStars, s)}
                >
                  <span>{s} estrellas</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {minReviewScore && (
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => setMinReviewScore(null)}
                >
                  <span>Puntuación: {minReviewScore}+</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              )}
              {selectedNeighbourhoods.map((n) => (
                <span
                  key={n}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedNeighbourhoods, setSelectedNeighbourhoods, n)}
                >
                  <span>{NEIGHBOURHOOD_LABELS[n] || n}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {selectedPolicies.map((p) => (
                <span
                  key={p}
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => toggleCheckbox(selectedPolicies, setSelectedPolicies, p)}
                >
                  <span>{POLICY_LABELS[p] || p}</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              ))}
              {bedroomsCount > 0 && (
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  onClick={() => setBedroomsCount(0)}
                >
                  <span>{bedroomsCount}+ hab.</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              )}
              <button
                type="button"
                onClick={resetAllFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#006ce4',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '2px 6px',
                }}
              >
                Borrar todos los filtros
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#595959' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid #e0e0e0',
                  borderTopColor: '#006ce4',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 12px auto',
                }}
              />
              <p>Buscando los mejores alojamientos en {destination}...</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{ padding: '20px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && filteredProperties.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
                border: '1px dashed #d9d9d9',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <NoResultsIllustration size={80} />
              </div>
              <h2 style={{ fontSize: '1.17em' }}>No se encontraron alojamientos que coincidan con tus filtros</h2>
              <p style={{ color: '#595959', fontSize: '0.9rem' }}>
                Prueba a ampliar el presupuesto o quitar algunos filtros seleccionados.
              </p>
              <button
                type="button"
                className="sr-smart-btn"
                style={{ width: 'auto', padding: '8px 20px', margin: '10px auto 0 auto' }}
                onClick={resetAllFilters}
              >
                Restablecer todos los filtros
              </button>
            </div>
          )}

          {/* Properties List */}
          {!loading &&
            filteredProperties.map((prop, index) => {
              const rawPhoto = prop.photos?.[0]?.url;
              const photoUrl = (rawPhoto && !rawPhoto.includes('example.com'))
                ? rawPhoto
                : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500';
              // Precio y disponibilidad REALES del backend para estas fechas (por
              // habitación); se multiplica por las habitaciones pedidas.
              const disp = prop.disponibilidad;
              const noches = disp?.nights || nightsCount || 1;
              const pricePerNight = disp?.price_per_night
                ? Number(disp.price_per_night)
                : (disp?.total_price && noches > 0
                    ? Math.round((disp.total_price / noches) * 100) / 100
                    : Number(prop.precioPorNoche || prop.precio_noche || 45));
              const totalPrice = disp
                ? Math.round(disp.total_price * rooms * 100) / 100
                : Math.round(pricePerNight * noches * rooms);
              const libres = typeof disp?.available_rooms === 'number' ? disp.available_rooms : (prop.habitacionesDisponibles ?? prop.habitaciones);
              const originalPrice = Math.round(totalPrice * 1.15);
              const taxes = Math.round(totalPrice * 0.15);
              const score = Number(prop.ratings?.score ?? prop.calificacion ?? 8.5).toFixed(1);
              const reviewsCount = prop.ratings?.number_of_reviews ?? 0;
              const comfort = prop.ratings?.comfort || prop.ratings?.servicio || 9.0;
              const isSaved = wishlist.has(prop.id);
              const isAd = index === 1;

              const detailQuery = `checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=${rooms}`;
              const tieneDesayuno = (Array.isArray(prop.amenidades) && prop.amenidades.some((a) => /desayuno|breakfast/i.test(a)))
                || /desayuno/i.test(prop.regimen || '')
                || prop.incluye_desayuno === true;
              const sinPagoAdelantado = prop.politicas?.pago_en_alojamiento || prop.sin_pago_adelantado;
              const nombreUnidad = prop.tipos_habitacion?.[0]?.nombre
                || (prop.tipo_propiedad === 'APARTAMENTO' ? 'Apartamento completo' : 'Habitación disponible');

              return (
                <div key={prop.id} className="sr-property-card" data-testid="property-card">
                  {/* Left Column: Image with wishlist heart button */}
                  <div className="sr-card-image-wrapper">
                    <Link to={`/alojamientos/${prop.id}?${detailQuery}`}>
                      <img src={photoUrl} alt={prop.nombre} className="sr-card-image" loading="lazy" />
                    </Link>
                    <button
                      type="button"
                      className={`sr-wishlist-btn ${isSaved ? 'saved' : ''}`}
                      onClick={() => toggleWishlist(prop.id)}
                      aria-label="Guardar alojamiento en favoritos"
                    >
                      <HeartIcon size={20} filled={isSaved} color="#e11d48" outlineColor="#1a1a1a" />
                    </button>
                  </div>

                  {/* Center Column: Property Details & Badges */}
                  <div className="sr-card-info">
                    <div>
                      <div className="sr-card-title-row">
                        <Link to={`/alojamientos/${prop.id}?${detailQuery}`} className="sr-card-title">
                          {prop.nombre}
                        </Link>
                        {Number(prop.estrellas) > 0 && (
                          <div className="sr-rating-squares" role="img" aria-label={`Categoría de ${prop.estrellas} estrellas`}>
                            {Array.from({ length: Math.min(5, Math.max(1, parseInt(prop.estrellas, 10) || 1)) }).map((_, idx) => (
                              <svg key={idx} width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                            ))}
                          </div>
                        )}
                        <PreferredPlusBadge />
                        {isAd && <span className="sr-ad-badge">Anuncio</span>}
                      </div>

                      <div className="sr-card-location">
                        <span
                          className="sr-map-link"
                          onClick={() => {
                            setSelectedMapProperty(prop);
                            setShowMapModal(true);
                          }}
                        >
                          {prop.destino || destination}
                        </span>
                        <span>•</span>
                        <span
                          className="sr-map-link"
                          onClick={() => {
                            setSelectedMapProperty(prop);
                            setShowMapModal(true);
                          }}
                        >
                          Mostrar en el mapa
                        </span>
                        <span>•</span>
                        {prop.ubicacion?.distance_centre_km ? (
                          <span className="sr-distance-tag">
                            A {prop.ubicacion.distance_centre_km} km del centro
                          </span>
                        ) : (
                          <span className="sr-distance-tag">
                            Cerca del centro
                          </span>
                        )}
                      </div>

                      {index === 2 && <div className="sr-deal-tag">Oferta de escapada</div>}

                      {/* Room & perks summary (Estilo Booking.com real: sin forzar camas individuales a nivel de hotel antes de ingresar) */}
                      <div className="sr-room-details">
                        <div className="sr-room-name">{nombreUnidad}</div>
                        <div style={{ fontSize: '0.8rem', color: '#595959', margin: '2px 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{prop.habitaciones || 1} {Number(prop.habitaciones) === 1 ? 'habitación' : 'habitaciones'}</span>
                          <span>·</span>
                          <span>{prop.camas || 1} {Number(prop.camas) === 1 ? 'cama' : 'camas'}</span>
                        </div>

                        <div className="sr-perks-list">
                          {tieneDesayuno && (
                            <div className="sr-perk-item green">
                              <CheckmarkIcon size={14} color="#008009" /> Desayuno incluido
                            </div>
                          )}
                          {prop.politicas?.es_reembolsable === false || prop.es_reembolsable === false ? (
                            <div className="sr-perk-item" style={{ color: '#d4111e', fontWeight: 600 }}>
                              ✕ No reembolsable
                            </div>
                          ) : (
                            <div className="sr-perk-item green">
                              <CheckmarkIcon size={14} color="#008009" /> Cancelación gratis
                            </div>
                          )}
                          {sinPagoAdelantado && (
                            <div className="sr-perk-item green">
                              <CheckmarkIcon size={14} color="#008009" /> Sin pago por adelantado: paga en el alojamiento
                            </div>
                          )}
                        </div>

                        <div className="sr-urgency-note">
                          {libres !== undefined && (
                            libres <= 0 ? (
                              <span style={{ color: '#b3121b', fontWeight: 700, background: '#fdf2f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #f8b4b4', display: 'inline-block' }}>
                                ❌ ¡Agotado para tus fechas!
                              </span>
                            ) : libres <= 3 ? (
                              <span style={{ color: '#b3121b', fontWeight: 700, background: '#fdf2f2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #f8b4b4', display: 'inline-block' }}>
                                ⚡ ¡Solo {libres === 1 ? 'queda 1 habitación' : `quedan ${libres} habitaciones`} en vivo!
                              </span>
                            ) : (
                              <span style={{ color: '#008009', fontWeight: 600 }}>
                                ⚡ {libres} habitaciones disponibles (en vivo)
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Score & Pricing Block */}
                  <div className="sr-card-price-col">
                    <div>
                      <div className="sr-rating-header">
                        <div className="sr-rating-text-block">
                          <span className="sr-rating-label">
                            {Number(score) >= 9.0 ? 'Excelente' : 'Fantástico'}
                          </span>
                          <span className="sr-rating-reviews">{reviewsCount} comentarios</span>
                        </div>
                        <div className="sr-rating-badge">{score}</div>
                      </div>
                      <div className="sr-comfort-subscore">Confort {comfort}</div>
                    </div>

                    <div className="sr-pricing-block">
                      <span className="sr-stay-duration">
                        {noches} {noches === 1 ? 'noche' : 'noches'}, {adults} {adults === 1 ? 'adulto' : 'adultos'}{children > 0 ? `, ${children} ${children === 1 ? 'niño' : 'niños'}` : ''}{rooms > 1 ? `, ${rooms} habitaciones` : ''}
                      </span>
                      <span className="sr-original-price">
                        {currency} {convertPrice(originalPrice)}
                      </span>
                      <span className="sr-final-price">
                        {currency} {convertPrice(totalPrice)}
                      </span>
                      {noches > 1 && (
                        <span style={{ fontSize: '0.82rem', color: '#595959', display: 'block', textAlign: 'right', marginTop: '2px' }}>
                          {currency} {convertPrice(Math.round(totalPrice / (noches * rooms)))} por noche
                        </span>
                      )}
                      <span className="sr-taxes-note">
                        +{currency} {convertPrice(taxes)} de impuestos y cargos
                      </span>

                      <Link to={`/alojamientos/${prop.id}?${detailQuery}`} className="sr-cta-btn">
                        <span>Ver disponibilidad</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

          {/* Genius Banner */}
          {!user ? (
            <div className="sr-genius-banner">
              <div>
                <h2>Inicia sesión y ahorra dinero</h2>
                <p>Accede a descuentos exclusivos para miembros en {destination}</p>
                <div style={{ marginTop: '14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Link to="/login" state={{ from: location.pathname + location.search }} onClick={() => sessionStorage.setItem('booking_return_url', location.pathname + location.search)} className="sr-genius-signin-btn">
                    Iniciar sesión
                  </Link>
                  <Link to="/register" state={{ from: location.pathname + location.search }} onClick={() => sessionStorage.setItem('booking_return_url', location.pathname + location.search)} className="sr-genius-register-link">
                    Crear una cuenta
                  </Link>
                </div>
              </div>
              <div className="sr-genius-icon-box" aria-hidden="true">
                <GeniusGiftIcon size={44} />
              </div>
            </div>
          ) : (
            <div className="sr-genius-banner" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
              <div>
                <h2 style={{ color: '#166534' }}>¡Tarifas Genius activas!</h2>
                <p style={{ color: '#15803d' }}>
                  Has iniciado sesión como <strong>{user.user_metadata?.nombre || user.email}</strong>. Tus descuentos y tarifas preferenciales se aplican automáticamente en {destination}.
                </p>
              </div>
              <div className="sr-genius-icon-box" aria-hidden="true">
                <GeniusGiftIcon size={44} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Mapa Interactivo con Leaflet y OpenStreetMap */}
      <MapaAlojamientos
        mode="modal"
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        properties={filteredProperties}
        destination={destination}
        selectedPropertyId={selectedMapProperty?.id}
        searchParamsString={searchParams.toString()}
      />
    </main>
  );
}
