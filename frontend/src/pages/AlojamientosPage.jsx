import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAlojamientos, searchAlojamientos } from '../services/alojamientosApi';
import { AlojamientoCard } from '../components/AlojamientoCard';

// Tipos de propiedades en español
const PROPERTY_TYPES = [
  {
    name: 'Hoteles',
    img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&auto=format&fit=crop&q=80',
    type: 'hotel',
  },
  {
    name: 'Departamentos',
    img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=500&auto=format&fit=crop&q=80',
    type: 'departamento',
  },
  {
    name: 'Resorts',
    img: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=500&auto=format&fit=crop&q=80',
    type: 'resort',
  },
  {
    name: 'Villas',
    img: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=500&auto=format&fit=crop&q=80',
    type: 'villa',
  },
];

// Destinos tendencia en Ecuador y destacados
const TRENDING_DESTINATIONS = [
  {
    id: 'quito',
    name: 'Quito',
    flag: '🇪🇨',
    img: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=700&auto=format&fit=crop&q=80',
    large: true,
  },
  {
    id: 'guayaquil',
    name: 'Guayaquil',
    flag: '🇪🇨',
    img: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=700&auto=format&fit=crop&q=80',
    large: true,
  },
  {
    id: 'cuenca',
    name: 'Cuenca',
    flag: '🇪🇨',
    img: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=500&auto=format&fit=crop&q=80',
    large: false,
  },
  {
    id: 'madrid',
    name: 'Madrid',
    flag: '🇪🇸',
    img: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=500&auto=format&fit=crop&q=80',
    large: false,
  },
  {
    id: 'banos',
    name: 'Baños',
    flag: '🇪🇨',
    img: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=500&auto=format&fit=crop&q=80',
    large: false,
  },
];

export function AlojamientosPage() {
  const navigate = useNavigate();

  // Estados de datos
  const [alojamientos, setAlojamientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados del SearchBox de Booking en español
  const [destination, setDestination] = useState('');
  const [checkin, setCheckin] = useState('2026-10-10');
  const [checkout, setCheckout] = useState('2026-10-15');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [workTravel, setWorkTravel] = useState(false);
  const [showOccupancyDropdown, setShowOccupancyDropdown] = useState(false);

  // Dropdown ref para cerrar al hacer clic afuera
  const occupancyRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (occupancyRef.current && !occupancyRef.current.contains(e.target)) {
        setShowOccupancyDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = useCallback(async (customDest) => {
    setLoading(true);
    setError(null);
    const destToSearch = customDest !== undefined ? customDest : destination;

    try {
      let result;
      if (destToSearch && destToSearch.trim()) {
        result = await searchAlojamientos({
          destino: destToSearch.trim(),
          dates: { checkin, checkout },
        });
      } else {
        result = await getAlojamientos({ limit: 12 });
      }

      const items = result.data || result;
      setAlojamientos(Array.isArray(items) ? items : []);
    } catch (err) {
      setError('No se pudo conectar con el microservicio de Alojamientos.');
    } finally {
      setLoading(false);
    }
  }, [destination, checkin, checkout]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    fetchData();
  };

  const handleDestinationClick = (destName) => {
    setDestination(destName);
    fetchData(destName);
    window.scrollTo({ top: 750, behavior: 'smooth' });
  };

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}>
      
      {/* ===================== HERO BANNER DESKTOP (Booking Oficial en Español) ===================== */}
      <section
        style={{
          background: '#003b95',
          color: '#ffffff',
          padding: '40px 24px 72px 24px',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h1
            style={{
              fontSize: '3rem',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              marginBottom: '10px',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Encuentra tu próximo alojamiento
          </h1>
          <p
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              opacity: 0.9,
              marginBottom: '20px',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Busca precios bajos en hoteles, casas y mucho más...
          </p>
        </div>
      </section>

      {/* ===================== SEARCHBOX DESKTOP FLOTANTE (Español) ===================== */}
      <div
        style={{
          maxWidth: '1100px',
          margin: '-40px auto 40px auto',
          padding: '0 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <form onSubmit={handleSearchSubmit}>
          <div
            style={{
              background: '#febb02',
              padding: '4px',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              display: 'grid',
              gridTemplateColumns: 'minmax(250px, 1.3fr) minmax(240px, 1.2fr) minmax(240px, 1.1fr) auto',
              gap: '4px',
              alignItems: 'stretch',
            }}
          >
            {/* 1. DESTINO */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 14px',
                gap: '12px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#1a1a1a">
                <path d="M2.75 12h18.5c.69 0 1.25.56 1.25 1.25V18l.75-.75H.75l.75.75v-4.75c0-.69.56-1.25 1.25-1.25m0-1.5A2.75 2.75 0 0 0 0 13.25V18c0 .414.336.75.75.75h22.5A.75.75 0 0 0 24 18v-4.75a2.75 2.75 0 0 0-2.75-2.75zM0 18v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 0 18m22.5 0v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-1.5 0m-.75-6.75V4.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 2.25 4.5v6.75a.75.75 0 0 0 1.5 0V4.5a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 0 1.5 0m-13.25-3h7a.25.25 0 0 1 .25.25v2.75l.75-.75h-9l.75.75V8.5a.25.25 0 0 1 .25-.25m0-1.5A1.75 1.75 0 0 0 6.75 8.5v2.75c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V8.5a1.75 1.75 0 0 0-1.75-1.75z"></path>
              </svg>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#474747',
                    fontWeight: 600,
                    lineHeight: 1.1,
                  }}
                >
                  Ingresa un destino
                </label>
                <input
                  type="text"
                  placeholder="¿A dónde vas?"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    color: '#1a1a1a',
                    padding: '2px 0 0 0',
                    background: 'transparent',
                  }}
                />
              </div>
            </div>

            {/* 2. FECHAS (Check-in — Check-out) */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 14px',
                gap: '12px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#1a1a1a">
                <path d="M22.5 13.5v8.25a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1-.75-.75V5.25a.75.75 0 0 1 .75-.75h19.5a.75.75 0 0 1 .75.75zm1.5 0V5.25A2.25 2.25 0 0 0 21.75 3H2.25A2.25 2.25 0 0 0 0 5.25v16.5A2.25 2.25 0 0 0 2.25 24h19.5A2.25 2.25 0 0 0 24 21.75zm-23.25-3h22.5a.75.75 0 0 0 0-1.5H.75a.75.75 0 0 0 0 1.5M7.5 6V.75a.75.75 0 0 0-1.5 0V6a.75.75 0 0 0 1.5 0M18 6V.75a.75.75 0 0 0-1.5 0V6A.75.75 0 0 0 18 6"></path>
              </svg>
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#474747',
                    fontWeight: 600,
                    lineHeight: 1.1,
                  }}
                >
                  Selecciona las fechas
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="date"
                    value={checkin}
                    onChange={(e) => setCheckin(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: '#1a1a1a',
                      background: 'transparent',
                      cursor: 'pointer',
                      width: '115px',
                    }}
                  />
                  <span style={{ color: '#888', fontSize: '0.8rem' }}>—</span>
                  <input
                    type="date"
                    value={checkout}
                    onChange={(e) => setCheckout(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      color: '#1a1a1a',
                      background: 'transparent',
                      cursor: 'pointer',
                      width: '115px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 3. OCUPACIÓN (Personas y Habitaciones) */}
            <div
              ref={occupancyRef}
              style={{
                background: '#ffffff',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                padding: '8px 14px',
                gap: '12px',
                position: 'relative',
                cursor: 'pointer',
              }}
              onClick={() => setShowOccupancyDropdown(!showOccupancyDropdown)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#1a1a1a">
                <path d="M16.5 6a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0M18 6A6 6 0 1 0 6 6a6 6 0 0 0 12 0M3 23.25a9 9 0 1 1 18 0 .75.75 0 0 0 1.5 0c0-5.799-4.701-10.5-10.5-10.5S1.5 17.451 1.5 23.25a.75.75 0 0 0 1.5 0"></path>
              </svg>
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#474747',
                    fontWeight: 600,
                    lineHeight: 1.1,
                  }}
                >
                  Selecciona la ocupación
                </span>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    color: '#1a1a1a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {adults} adultos · {children} niños · {rooms} hab.
                </span>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#474747">
                <path d="M19.268 8.913a.9.9 0 0 1-.266.642l-6.057 6.057A1.3 1.3 0 0 1 12 16c-.35.008-.69-.123-.945-.364L4.998 9.58a.91.91 0 0 1 0-1.284.897.897 0 0 1 1.284 0 .88.88 0 0 1 .266.642"></path>
              </svg>

              {/* Popover selector de ocupación */}
              {showOccupancyDropdown && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: '#ffffff',
                    border: '1px solid #e7e7e7',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    padding: '16px',
                    width: '280px',
                    zIndex: 100,
                  }}
                >
                  {/* Adultos */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a' }}>Adultos</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={adults <= 1}
                        onClick={() => setAdults((a) => Math.max(1, a - 1))}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: adults <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{adults}</span>
                      <button
                        type="button"
                        onClick={() => setAdults((a) => a + 1)}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Niños */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a' }}>Niños</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={children <= 0}
                        onClick={() => setChildren((c) => Math.max(0, c - 1))}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: children <= 0 ? 'not-allowed' : 'pointer' }}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{children}</span>
                      <button
                        type="button"
                        onClick={() => setChildren((c) => c + 1)}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Habitaciones */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a' }}>Habitaciones</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={rooms <= 1}
                        onClick={() => setRooms((r) => Math.max(1, r - 1))}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: rooms <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{rooms}</span>
                      <button
                        type="button"
                        onClick={() => setRooms((r) => r + 1)}
                        style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #006ce4', background: '#fff', color: '#006ce4', fontSize: '1.2rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowOccupancyDropdown(false)}
                    style={{ width: '100%', padding: '8px', background: '#006ce4', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>

            {/* 4. BOTÓN BUSCAR */}
            <button
              type="submit"
              style={{
                background: '#006ce4',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '0 32px',
                fontSize: '1.1rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s',
                fontFamily: "'Inter', sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#0057b8')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#006ce4')}
            >
              Buscar
            </button>
          </div>

          {/* Checkbox de Booking debajo del search box */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="work-check"
              type="checkbox"
              checked={workTravel}
              onChange={(e) => setWorkTravel(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#006ce4' }}
            />
            <label
              htmlFor="work-check"
              style={{ fontSize: '0.9rem', color: '#1a1a1a', cursor: 'pointer', fontWeight: 400 }}
            >
              Viajo por trabajo
            </label>
          </div>
        </form>
      </div>

      {/* ===================== CONTENIDO PRINCIPAL DE LA PÁGINA ===================== */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 60px 24px' }}>
        
        {/* ===================== 1. OFERTAS ===================== */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '4px' }}>
            Ofertas
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#474747', marginBottom: '16px' }}>
            Promociones, descuentos y ofertas especiales para ti
          </p>

          <div
            style={{
              border: '1px solid #e7e7e7',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              gap: '24px',
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#474747', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Oferta de fin de año
              </span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a1a1a', margin: '6px 0' }}>
                15% o más de descuento en estadías
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#474747', marginBottom: '16px', lineHeight: 1.4 }}>
                Escápate por menos con nuestras ofertas especiales. Reserva hasta el 7 de enero de 2027 para estancias entre el 1 de octubre de 2026 y el 7 de enero de 2027.
              </p>
              <button
                onClick={() => fetchData()}
                style={{
                  background: '#006ce4',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Buscar ofertas
              </button>
            </div>
            <div
              style={{
                width: '180px',
                height: '120px',
                borderRadius: '8px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&auto=format&fit=crop&q=80"
                alt="Oferta de fin de año"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </section>

        {/* ===================== 2. BUSCAR POR TIPO DE ALOJAMIENTO ===================== */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '20px' }}>
            Buscar por tipo de alojamiento
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {PROPERTY_TYPES.map((prop, idx) => (
              <div
                key={idx}
                onClick={() => handleDestinationClick('')}
                style={{
                  cursor: 'pointer',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ height: '160px', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                  <img
                    src={prop.img}
                    alt={prop.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>{prop.name}</h3>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== 3. DESTINOS DE MODA ===================== */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '4px' }}>
            Destinos de moda
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#474747', marginBottom: '20px' }}>
            Las opciones más populares para viajeros de Ecuador
          </p>

          {/* Grid: 2 grandes arriba, 3 abajo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Fila superior: 2 grandes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {TRENDING_DESTINATIONS.slice(0, 2).map((dest) => (
                <div
                  key={dest.id}
                  onClick={() => handleDestinationClick(dest.name)}
                  style={{
                    position: 'relative',
                    height: '240px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <img
                    src={dest.img}
                    alt={dest.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      left: '16px',
                      color: '#ffffff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <h3 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{dest.name}</h3>
                    <span style={{ fontSize: '1.3rem' }}>{dest.flag}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Fila inferior: 3 medianos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {TRENDING_DESTINATIONS.slice(2).map((dest) => (
                <div
                  key={dest.id}
                  onClick={() => handleDestinationClick(dest.name)}
                  style={{
                    position: 'relative',
                    height: '200px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <img
                    src={dest.img}
                    alt={dest.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '14px',
                      color: '#ffffff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{dest.name}</h3>
                    <span style={{ fontSize: '1.1rem' }}>{dest.flag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== 4. ¿POR QUÉ BOOKING.COM? ===================== */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '20px' }}>
            ¿Por qué Booking.com?
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '16px',
            }}
          >
            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📝</div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Reserva ahora, paga en el alojamiento
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Cancelación GRATIS en la mayoría de las habitaciones con política flexible.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>👍</div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Más de 300M de comentarios reales
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Opiniones auténticas de huéspedes verificados en todo el mundo.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🌍</div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Más de 2 millones de alojamientos
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Hoteles, departamentos, villas, cabañas y mucho más.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎧</div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Atención al cliente 24/7 de confianza
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Nuestro equipo internacional está a tu disposición en cualquier momento.
              </p>
            </div>
          </div>
        </section>

        {/* ===================== 5. ALOJAMIENTOS DISPONIBLES ===================== */}
        <section id="results-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a' }}>
                {destination ? `Alojamientos en ${destination}` : 'Alojamientos y hospedajes destacados'}
              </h2>
              <p style={{ fontSize: '0.9rem', color: '#474747' }}>
                {alojamientos.length} alojamientos disponibles según tu búsqueda
              </p>
            </div>
            {destination && (
              <button
                onClick={() => {
                  setDestination('');
                  fetchData('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#006ce4',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Limpiar filtro de búsqueda
              </button>
            )}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#003b95' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
              <p style={{ fontWeight: 600 }}>Cargando alojamientos disponibles...</p>
            </div>
          )}

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
              <strong>Aviso:</strong> {error}
            </div>
          )}

          {!loading && !error && alojamientos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', border: '1px solid #e7e7e7', borderRadius: '8px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🏨</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1a1a' }}>No se encontraron alojamientos</h3>
              <p style={{ color: '#474747', marginTop: '4px' }}>Prueba buscando otro destino o limpiando los filtros de búsqueda.</p>
            </div>
          )}

          {!loading && !error && alojamientos.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '24px',
              }}
            >
              {alojamientos.map((alojamiento) => (
                <AlojamientoCard key={alojamiento.id} alojamiento={alojamiento} />
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
