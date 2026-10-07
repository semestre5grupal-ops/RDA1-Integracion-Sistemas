import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { getAlojamientos, searchAlojamientos } from '../services/alojamientosApi';
import { useCurrency } from '../hooks/CurrencyContext';
import { DestinoAutocomplete } from '../components/DestinoAutocomplete';
import { destinoExacto } from '../utils/destinos';
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

// Histogram bar heights to replicate Booking.com desktop distribution curve
const HISTOGRAM_BARS = [
  5, 5, 5, 16, 11, 44, 33, 38, 44, 38, 38, 33, 27, 27, 22, 100,
  61, 66, 27, 66, 50, 33, 22, 77, 94, 27, 77, 11, 38, 33, 38, 11,
  77, 22, 16, 61, 22, 61, 38, 5, 16, 27, 44, 11, 38, 11, 44, 16, 27, 11
];

export function AlojamientosSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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

  // Filter States
  const [maxBudget, setMaxBudget] = useState(250);
  const [selectedTypes, setSelectedTypes] = useState(initialType ? [initialType] : []);
  const [selectedPopular, setSelectedPopular] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedStars, setSelectedStars] = useState([]);
  const [minReviewScore, setMinReviewScore] = useState(null);
  const [selectedNeighbourhoods, setSelectedNeighbourhoods] = useState([]);
  const [selectedPolicies, setSelectedPolicies] = useState([]);
  const [smartFilterQuery, setSmartFilterQuery] = useState('');
  const [appliedSmartFilter, setAppliedSmartFilter] = useState('');
  const [bedroomsCount, setBedroomsCount] = useState(0);
  const [bathroomsCount, setBathroomsCount] = useState(0);

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
  const fetchResults = async (params) => {
    setLoading(true);
    setError(null);
    try {
      const destQuery = params?.destino || (typeof params === 'string' ? params : destination);
      const cIn = params?.checkin || checkin;
      const cOut = params?.checkout || checkout;
      const ad = params?.adultos ?? adults;
      const ch = params?.ninos ?? children;
      const rm = params?.habitaciones ?? rooms;

      const res = await searchAlojamientos({
        destino: destQuery,
        adultos: ad,
        ninos: ch,
        habitaciones: rm,
        dates: { checkin: cIn, checkout: cOut },
        rows: 25,
      });

      const items = res.data || res;
      setProperties(Array.isArray(items) ? items : []);
    } catch (err) {
      // Fallback to general list
      try {
        const destQuery = params?.destino || (typeof params === 'string' ? params : destination);
        const fallback = await getAlojamientos({ limit: 25, destino: destQuery });
        const items = fallback.data || fallback;
        setProperties(Array.isArray(items) ? items : []);
      } catch (e) {
        setError('Error al conectar con el servidor.');
      }
    } finally {
      setLoading(false);
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

    fetchResults({
      destino: dest,
      checkin: cin,
      checkout: cout,
      adultos: ad,
      ninos: ch,
      habitaciones: rm,
    });
  }, [searchParams]);

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

    // "quito" / "QUÍTO" se normaliza al nombre oficial del destino.
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

  // Filter and Sort properties
  const filteredProperties = useMemo(() => {
    let result = [...properties];

    // Budget Filter
    result = result.filter((p) => {
      const pricePerNight = Number(p.precioPorNoche || p.precio_noche || 50);
      return pricePerNight <= maxBudget;
    });

    // Property Type Filter
    if (selectedTypes.length > 0) {
      result = result.filter((p) => {
        const type = (p.tipo_propiedad || p.tipoPropiedad || '').toLowerCase();
        return selectedTypes.some((t) => type.includes(t.toLowerCase()));
      });
    }

    // Popular amenities & Facilities
    if (selectedFacilities.length > 0) {
      result = result.filter((p) => {
        const ams = (p.amenidades || []).map((a) => a.toLowerCase());
        return selectedFacilities.every((fac) => {
          if (fac === 'pool') return p.tienePiscina || ams.some((a) => a.includes('piscina'));
          if (fac === 'wifi') return ams.some((a) => a.includes('wifi'));
          if (fac === 'parking') return ams.some((a) => a.includes('parqueadero') || a.includes('estacionamiento') || a.includes('parking'));
          if (fac === 'spa') return ams.some((a) => a.includes('spa'));
          if (fac === 'hottub') return ams.some((a) => a.includes('jacuzzi') || a.includes('hot tub'));
          return true;
        });
      });
    }

    // Minimum Review Score
    if (minReviewScore !== null) {
      result = result.filter((p) => {
        const score = Number(p.ratings?.score || 8.5);
        return score >= minReviewScore;
      });
    }

    // Bedrooms count stepper
    if (bedroomsCount > 0) {
      result = result.filter((p) => (p.habitaciones || 1) >= bedroomsCount);
    }

    // Bathrooms count stepper
    if (bathroomsCount > 0) {
      result = result.filter((p) => (Number(p.banos) || 1) >= bathroomsCount);
    }

    // Smart filter free text query
    if (appliedSmartFilter.trim()) {
      const q = appliedSmartFilter.toLowerCase();
      result = result.filter((p) => {
        const name = (p.nombre || '').toLowerCase();
        const desc = (p.descripcion || '').toLowerCase();
        const ams = (p.amenidades || []).join(' ').toLowerCase();
        return name.includes(q) || desc.includes(q) || ams.includes(q);
      });
    }

    // Sorter logic
    if (sortBy === 'price_asc') {
      result.sort((a, b) => Number(a.precioPorNoche || 0) - Number(b.precioPorNoche || 0));
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => Number(b.precioPorNoche || 0) - Number(a.precioPorNoche || 0));
    } else if (sortBy === 'rating') {
      result.sort((a, b) => Number(b.ratings?.score || 0) - Number(a.ratings?.score || 0));
    } else if (sortBy === 'reviews') {
      result.sort((a, b) => Number(b.ratings?.number_of_reviews || 0) - Number(a.ratings?.number_of_reviews || 0));
    }

    return result;
  }, [
    properties,
    maxBudget,
    selectedTypes,
    selectedFacilities,
    minReviewScore,
    bedroomsCount,
    bathroomsCount,
    appliedSmartFilter,
    sortBy,
  ]);

  return (
    <div className="sr-page-wrapper">
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
                  onSelect={() => {
                    setDestinationError('');
                    setShowOccupancyPopover(false);
                    setShowDatesPopover(true);
                  }}
                  onInvalidChars={() => setDestinationError('Solo se permiten letras, espacios y los signos , . - \' &')}
                  invalid={Boolean(destinationError)}
                  errorId="sr-destination-error"
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
                    onClick={() => setShowDatesPopover(false)}
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
                    onClick={() => setShowOccupancyPopover(false)}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* 4. Search Button */}
            <button type="submit" className="sr-search-btn">
              Buscar
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
                'url("https://maps.googleapis.com/maps/api/staticmap?size=264x150&center=-0.1838,-78.4919&zoom=13&scale=2&sensor=false")',
              backgroundColor: '#e5e3df',
            }}
          >
            <button
              type="button"
              className="sr-map-btn"
              onClick={() => alert(`Mostrando mapa para ${destination}`)}
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
                <span>US${maxBudget}+</span>
              </div>

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
                min="10"
                max="250"
                step="5"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
              />
            </div>

            {/* Popular filters */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Filtros populares</div>
              {[
                { id: 'bathroom', label: 'Baño privado', count: 280 },
                { id: 'kitchen', label: 'Cocina / zona de cocina', count: 193 },
                { id: '5stars', label: '5 estrellas', count: 4 },
                { id: 'spa', label: 'Spa y centro de bienestar', count: 11 },
                { id: 'parking', label: 'Estacionamiento', count: 282 },
                { id: 'holiday', label: 'Casas vacacionales', count: 5 },
                { id: 'verygood', label: 'Muy bien: 8 o más', count: 243 },
                { id: 'elevator', label: 'Acceso en ascensor', count: 55 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>

            {/* Smart Filters widget */}
            <div className="sr-filter-group">
              <div className="sr-smart-filter-box">
                <div className="sr-smart-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#003580">
                    <path d="M12 2L9.5 7.5 4 10l5.5 2.5L12 18l2.5-5.5L20 10l-5.5-2.5z" />
                  </svg>
                  <span>Filtros inteligentes</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: '6px' }}>
                  ¿Qué estás buscando?
                </div>
                <textarea
                  className="sr-smart-textarea"
                  placeholder="Ejemplo: Quiero un lugar con buenas valoraciones y cancelación gratis"
                  value={smartFilterQuery}
                  onChange={(e) => setSmartFilterQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="sr-smart-btn"
                  onClick={() => setAppliedSmartFilter(smartFilterQuery)}
                >
                  Buscar alojamientos
                </button>
              </div>
            </div>

            {/* Property type */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Tipo de alojamiento</div>
              {[
                { id: 'Hoteles', label: 'Hoteles', count: 95 },
                { id: 'Apartamentos', label: 'Departamentos', count: 167 },
                { id: 'Holiday homes', label: 'Casas vacacionales', count: 5 },
                { id: 'Bed and breakfasts', label: 'Bed and breakfasts', count: 8 },
                { id: 'Aparthotels', label: 'Apartahoteles', count: 5 },
                { id: 'Hostales', label: 'Hostales y pensiones', count: 25 },
                { id: 'Guest houses', label: 'Casas de huéspedes', count: 54 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>

            {/* Bedrooms and bathrooms stepper */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Habitaciones y baños</div>
              <div className="sr-stepper-filter-row">
                <span className="sr-stepper-filter-label">Habitaciones</span>
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
              <div className="sr-stepper-filter-row">
                <span className="sr-stepper-filter-label">Baños</span>
                <div className="sr-stepper-control">
                  <button
                    type="button"
                    disabled={bathroomsCount <= 0}
                    onClick={() => setBathroomsCount((b) => Math.max(0, b - 1))}
                  >
                    −
                  </button>
                  <span>{bathroomsCount}</span>
                  <button type="button" onClick={() => setBathroomsCount((b) => b + 1)}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Facilities */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Servicios e instalaciones</div>
              {[
                { id: 'parking', label: 'Estacionamiento', count: 282 },
                { id: 'pool', label: 'Piscina', count: 40 },
                { id: 'spa', label: 'Spa y centro de bienestar', count: 11 },
                { id: 'hottub', label: 'Bañera de hidromasaje', count: 57 },
                { id: 'wifi', label: 'WiFi gratis', count: 372 },
              ]
                .concat(
                  showAllFacilities
                    ? [
                        { id: 'gym', label: 'Gimnasio', count: 35 },
                        { id: 'airport', label: 'Traslado aeropuerto', count: 45 },
                        { id: 'restaurant', label: 'Restaurante', count: 80 },
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
                    <span className="sr-checkbox-count">{item.count}</span>
                  </label>
                ))}
              <button
                type="button"
                className="sr-expand-btn"
                onClick={() => setShowAllFacilities(!showAllFacilities)}
              >
                {showAllFacilities ? 'Mostrar menos' : 'Mostrar los 14 ▾'}
              </button>
            </div>

            {/* Property rating (Stars) */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">
                <div>Categoría del alojamiento</div>
                <div className="sr-filter-subtitle">Encuentra hoteles con estrellas</div>
              </div>
              {[
                { stars: 5, label: '5 estrellas', count: 4 },
                { stars: 4, label: '4 estrellas', count: 63 },
                { stars: 3, label: '3 estrellas', count: 93 },
                { stars: 2, label: '2 estrellas', count: 10 },
                { stars: 1, label: '1 estrella', count: 6 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>

            {/* Review score */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Puntuación de los comentarios</div>
              {[
                { score: 9.0, label: 'Excelente: 9 o más', count: 135 },
                { score: 8.0, label: 'Muy bien: 8 o más', count: 243 },
                { score: 7.0, label: 'Bien: 7 o más', count: 282 },
                { score: 6.0, label: 'Agradable: 6 o más', count: 298 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>

            {/* Neighbourhood */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Zonas y barrios</div>
              {[
                { id: 'centro', label: 'Centro Histórico', count: 75 },
                { id: 'carolina', label: 'La Carolina', count: 62 },
                { id: 'mariscal', label: 'La Mariscal', count: 56 },
                { id: 'bellavista', label: 'Bellavista', count: 8 },
                { id: 'floresta', label: 'La Floresta', count: 7 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>

            {/* Reservation policy */}
            <div className="sr-filter-group">
              <div className="sr-filter-title">Condiciones de reserva</div>
              {[
                { id: 'noprepay', label: 'Sin pago por adelantado', count: 308 },
                { id: 'nocredit', label: 'Reserva sin tarjeta de crédito', count: 243 },
                { id: 'freecancel', label: 'Cancelación gratis', count: 294 },
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
                  <span className="sr-checkbox-count">{item.count}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* ================= RIGHT SEARCH RESULTS CONTENT ================= */}
        <main className="sr-results-content">
          {/* Header Bar */}
          <div className="sr-results-header">
            <h1 className="sr-results-title">
              {destination}: {filteredProperties.length > 0 ? filteredProperties.length : properties.length} alojamientos encontrados
            </h1>

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
          {(appliedSmartFilter || minReviewScore || selectedTypes.length > 0) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#595959' }}>Filtros activos:</span>
              {appliedSmartFilter && (
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
                  onClick={() => setAppliedSmartFilter('')}
                >
                  <span>"{appliedSmartFilter}"</span>
                  <CloseIcon size={12} color="#0369a1" />
                </span>
              )}
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
              <h3>No se encontraron alojamientos que coincidan con tus filtros</h3>
              <p style={{ color: '#595959', fontSize: '0.9rem' }}>
                Prueba a ampliar el presupuesto o quitar algunos filtros seleccionados.
              </p>
              <button
                type="button"
                className="sr-smart-btn"
                style={{ width: 'auto', padding: '8px 20px', margin: '10px auto 0 auto' }}
                onClick={() => {
                  setMaxBudget(250);
                  setSelectedTypes([]);
                  setSelectedFacilities([]);
                  setMinReviewScore(null);
                  setAppliedSmartFilter('');
                }}
              >
                Restablecer filtros
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
              const pricePerNight = Number(prop.precioPorNoche || prop.precio_noche || 45);
              const totalPrice = Math.round(pricePerNight * nightsCount);
              const originalPrice = Math.round(totalPrice * 1.15);
              const taxes = Math.round(totalPrice * 0.15);
              const score = Number(prop.ratings?.score || 8.9).toFixed(1);
              const reviewsCount = prop.ratings?.number_of_reviews || 240;
              const comfort = prop.ratings?.comfort || 9.0;
              const isSaved = wishlist.has(prop.id);
              const isAd = index === 1;

              const detailQuery = `checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=${rooms}`;

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
                        <div className="sr-rating-squares" aria-label="Categoría de 4 estrellas">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb700"><rect width="24" height="24" rx="3" /></svg>
                        </div>
                        <PreferredPlusBadge />
                        {isAd && <span className="sr-ad-badge">Anuncio</span>}
                      </div>

                      <div className="sr-card-location">
                        <span
                          className="sr-map-link"
                          onClick={() => alert(`Mostrando ${prop.nombre} en el mapa`)}
                        >
                          {prop.destino || destination}
                        </span>
                        <span>•</span>
                        <span
                          className="sr-map-link"
                          onClick={() => alert(`Mostrando ${prop.nombre} en el mapa`)}
                        >
                          Mostrar en el mapa
                        </span>
                        <span>•</span>
                        <span className="sr-distance-tag">
                          A {prop.ubicacion?.distance_centre_km || '1.4'} km del centro
                        </span>
                      </div>

                      {index === 2 && <div className="sr-deal-tag">Oferta de escapada</div>}

                      {/* Room & Beds summary */}
                      <div className="sr-room-details">
                        <div className="sr-room-name">{prop.tipo_alojamiento || 'Habitación Doble'}</div>
                        <div className="sr-bed-config">
                          {prop.camas || 1} cama(s) ({prop.habitaciones || 1} hab.)
                        </div>

                        <div className="sr-perks-list">
                          <div className="sr-perk-item green">
                            <CheckmarkIcon size={14} color="#008009" /> Desayuno incluido
                          </div>
                          <div className="sr-perk-item green">
                            <CheckmarkIcon size={14} color="#008009" /> Cancelación gratis
                          </div>
                          <div className="sr-perk-item green">
                            <CheckmarkIcon size={14} color="#008009" /> Sin pago por adelantado: paga en el alojamiento
                          </div>
                        </div>

                        <div className="sr-urgency-note">
                          {prop.habitacionesDisponibles !== undefined ? (
                            prop.habitacionesDisponibles <= 0 ? (
                              <span style={{ color: '#d9534f', fontWeight: 600 }}>¡Agotado para tus fechas!</span>
                            ) : prop.habitacionesDisponibles <= 3 ? (
                              <span style={{ color: '#d9534f', fontWeight: 600 }}>¡Solo quedan {prop.habitacionesDisponibles} habitaciones disponibles para tus fechas!</span>
                            ) : (
                              <span>{prop.habitacionesDisponibles} habitaciones disponibles</span>
                            )
                          ) : (
                            <span>¡Solo quedan {((index * 3) % 5) + 1} a este precio en nuestra web!</span>
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
                        {nightsCount} noches, {adults} adultos
                      </span>
                      <span className="sr-original-price">
                        {currency} {convertPrice(originalPrice)}
                      </span>
                      <span className="sr-final-price">
                        {currency} {convertPrice(totalPrice)}
                      </span>
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
          <div className="sr-genius-banner">
            <div>
              <h3>Inicia sesión y ahorra dinero</h3>
              <p>Accede a descuentos exclusivos para miembros en {destination}</p>
              <div style={{ marginTop: '14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Link to="/login" className="sr-genius-signin-btn">
                  Iniciar sesión
                </Link>
                <Link to="/register" className="sr-genius-register-link">
                  Crear una cuenta
                </Link>
              </div>
            </div>
            <div className="sr-genius-icon-box" aria-hidden="true">
              <GeniusGiftIcon size={44} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
