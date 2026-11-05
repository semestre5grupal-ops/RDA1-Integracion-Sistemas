import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { searchAutos } from '../services/autosApi';
import { AutoCard } from '../components/AutoCard';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useCurrency } from '../hooks/CurrencyContext';
import { formatearMoneda } from '../services/formato';

const DESTINOS_ECUADOR = [
  {
    codigo: 'GYE',
    nombre: 'Guayaquil',
    descripcion: 'La Perla del Pacífico',
    imagen: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=240&fit=crop',
    desde: '$49',
  },
  {
    codigo: 'CUE',
    nombre: 'Cuenca',
    descripcion: 'Ciudad Patrimonio de la Humanidad',
    imagen: 'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=400&h=240&fit=crop',
    desde: '$59',
  },
  {
    codigo: 'LOH',
    nombre: 'Loja',
    descripcion: 'La Capital Musical del Ecuador',
    imagen: 'https://images.unsplash.com/photo-1465447142348-e9952c393450?w=400&h=240&fit=crop',
    desde: '$69',
  },
  {
    codigo: 'GPS',
    nombre: 'Galápagos',
    descripcion: 'Paraíso natural único en el mundo',
    imagen: 'https://images.unsplash.com/photo-1547459124-e23883747a40?w=400&h=240&fit=crop',
    desde: '$119',
  },
];

export function AutosPage() {
  const navigate = useNavigate();
  const [autos, setAutos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { convertPrice, currency } = useCurrency();
  const { user } = useAuth();
  
  // Search form state
  const [pickupLocation, setPickupLocation] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pickupError, setPickupError] = useState('');
  const [flashRed, setFlashRed] = useState(false);
  const destinos = ['Quito', 'Guayaquil', 'Cuenca', 'Manta', 'Aeropuerto Mariscal Sucre', 'Aeropuerto José Joaquín de Olmedo', 'Loja', 'Machala'];

  const triggerFlash = (msg) => {
    setPickupError(msg);
    setFlashRed(true);
    setTimeout(() => setFlashRed(false), 300);
  };

  const handlePickupChange = (e) => {
    const raw = e.target.value.slice(0, 60);
    const hasNumbers = /[0-9]/.test(raw);
    const hasSymbols = /[^a-zA-Z\s,áéíóúÁÉÍÓÚñÑ0-9]/.test(raw);
    const hasMultipleSpaces = /\s{2,}/.test(raw);

    if (hasNumbers) {
      triggerFlash('No se permiten números en el destino');
    } else if (hasSymbols) {
      triggerFlash('Solo se permiten letras, comas y acentos');
    } else if (hasMultipleSpaces) {
      triggerFlash('No se permiten espacios consecutivos');
    } else if (raw.length >= 60) {
      triggerFlash('Límite máximo de 60 caracteres alcanzado');
    } else {
      setPickupError('');
    }

    const clean = raw.replace(/[^a-zA-Z\s,áéíóúÁÉÍÓÚñÑ]/g, '').replace(/\s{2,}/g, ' ');
    setPickupLocation(clean);
    setShowSuggestions(clean.trim().length > 0);
    setFormError('');
  };

  const handlePickupBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setPickupLocation(prev => prev.trim().replace(/\s{2,}/g, ' '));
    }, 200);
  };

  const handleSelectSuggestion = (destino) => {
    setPickupLocation(destino);
    setShowSuggestions(false);
    setPickupError('');
    setFormError('');
  };

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [dropoffTime, setDropoffTime] = useState('');
  const [sameDropoff, setSameDropoff] = useState(false);
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [driverAge, setDriverAge] = useState(true);
  const [customAge, setCustomAge] = useState(22);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTransmission, setSelectedTransmission] = useState('ALL');
  const [metadata, setMetadata] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [activeDestinationTab, setActiveDestinationTab] = useState(0);

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  // Data for destination tabs
  const destinationTabs = [
    {
      label: 'Ciudades de Ecuador',
      items: [
        { name: 'Quito', imgId: 10, puntos: 15, precio: 57.79 },
        { name: 'Guayaquil', imgId: 12, puntos: 3, precio: 47.70 },
        { name: 'Cuenca', imgId: 11, puntos: 3, precio: 46.65 },
        { name: 'Manta', imgId: 13, puntos: 2, precio: 52.64 },
      ]
    },
    {
      label: 'Aeropuertos de Ecuador',
      items: [
        { name: 'Aeropuerto Mariscal Sucre', imgId: 20, puntos: 12, precio: 62.30 },
        { name: 'Aeropuerto José Joaquín de Olmedo', imgId: 21, puntos: 8, precio: 55.90 },
        { name: 'Aeropuerto Camilo Ponce Enríquez', imgId: 22, puntos: 4, precio: 48.50 },
        { name: 'Aeropuerto Eloy Alfaro', imgId: 23, puntos: 3, precio: 51.20 },
      ]
    },
    {
      label: 'Regiones de Ecuador',
      items: [
        { name: 'Costa', imgId: 30, puntos: 20, precio: 44.00 },
        { name: 'Sierra', imgId: 31, puntos: 18, precio: 49.80 },
        { name: 'Amazonía', imgId: 32, puntos: 6, precio: 58.40 },
        { name: 'Galápagos', imgId: 33, puntos: 5, precio: 72.10 },
      ]
    },
    {
      label: 'Ciudades de todo el mundo',
      items: [
        { name: 'Madrid', imgId: 40, puntos: 45, precio: 38.50 },
        { name: 'Nueva York', imgId: 41, puntos: 60, precio: 85.20 },
        { name: 'Ciudad de México', imgId: 42, puntos: 35, precio: 42.90 },
        { name: 'Bogotá', imgId: 43, puntos: 22, precio: 36.70 },
      ]
    },
    {
      label: 'Aeropuertos de todo el mundo',
      items: [
        { name: 'Aeropuerto Adolfo Suárez Barajas', imgId: 50, puntos: 30, precio: 55.00 },
        { name: 'Aeropuerto Internacional JFK', imgId: 51, puntos: 50, precio: 92.30 },
        { name: 'Aeropuerto Benito Juárez', imgId: 52, puntos: 28, precio: 47.60 },
        { name: 'Aeropuerto El Dorado', imgId: 53, puntos: 18, precio: 41.20 },
      ]
    },
  ];

  const handleDestinationCardClick = (destinationName) => {
    setPickupLocation(destinationName);
    setPickupError('');
    setShowSuggestions(false);
    // Scroll to top (form) and trigger search
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      fetchData();
    }, 400);
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 3;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1;
  };

  const fetchData = useCallback(async (catOverride = null, transOverride = null) => {
    setLoading(true);
    setError(null);
    try {
      const cat = catOverride !== null ? catOverride : selectedCategory;
      const trans = transOverride !== null ? transOverride : selectedTransmission;
      const ageToUse = driverAge ? 32 : Number(customAge || 22);

      const requestPayload = {
        pickup_location: pickupLocation || 'Quito',
        dropoff_location: sameDropoff ? (dropoffLocation || pickupLocation || 'Quito') : (pickupLocation || 'Quito'),
        pickup_date: startDate || new Date().toISOString().split('T')[0],
        pickup_time: pickupTime || '10:00',
        dropoff_date: endDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        dropoff_time: dropoffTime || '10:00',
        driver_age: ageToUse,
        driver_age_bracket: driverAge,
        category: cat,
        transmission: trans,
        currency: 'USD'
      };

      const result = await searchAutos(requestPayload);
      setAutos(result.data || []);
      setMetadata(result.metadata || null);
    } catch (err) {
      console.error('Error al consultar autos:', err);
      setError('No se pudo conectar con el servicio de autos o los filtros no arrojaron resultados.');
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, [pickupLocation, dropoffLocation, sameDropoff, startDate, endDate, pickupTime, dropoffTime, driverAge, customAge, selectedCategory, selectedTransmission]);

  const timeOptions = [];
  for(let i=0; i<24; i++) {
    const h = i.toString().padStart(2, '0');
    timeOptions.push(`${h}:00`, `${h}:30`);
  }

  const [formError, setFormError] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    const cleanPickup = pickupLocation.trim().replace(/\s{2,}/g, ' ');
    const faltantes = [];
    if (!cleanPickup) faltantes.push('el lugar de recogida');
    if (!startDate) faltantes.push('la fecha de salida');
    if (!endDate) faltantes.push('la fecha de regreso');
    if (!pickupTime) faltantes.push('la hora de salida');
    if (!dropoffTime) faltantes.push('la hora de regreso');

    if (faltantes.length > 0) {
      let mensaje = '';
      if (faltantes.length === 1) {
        mensaje = `Por favor proporcione ${faltantes[0]}.`;
      } else if (faltantes.length === 2) {
        mensaje = `Por favor proporcione ${faltantes[0]} y ${faltantes[1]}.`;
      } else {
        const last = faltantes.pop();
        mensaje = `Por favor proporcione ${faltantes.join(', ')} y ${last}.`;
      }
      setFormError(mensaje);
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 800);
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setFormError('La fecha de regreso no puede ser anterior a la fecha de salida.');
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 800);
      return;
    }

    if (!driverAge && (customAge < 18 || customAge > 99)) {
      setFormError('La edad del conductor debe estar comprendida entre 18 y 99 años.');
      setFlashRed(true);
      setTimeout(() => setFlashRed(false), 800);
      return;
    }
    
    setFormError('');
    fetchData();
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const marcasPopulares = [
    { nombre: 'Europcar', bg: '#00843D', color: 'white', label: 'Europcar' },
    { nombre: 'Alamo', bg: '#00266b', color: '#ffb700', label: 'Alamo' },
    { nombre: 'Localiza', bg: '#006d35', color: 'white', label: 'Localiza' },
    { nombre: 'Keddy By Europcar', bg: '#6a1b9a', color: 'white', label: 'Keddy By Europcar' },
    { nombre: 'Goldcar', bg: '#fdd306', color: '#000', label: 'Goldcar' },
    { nombre: 'Sixt', bg: '#ff5f00', color: '#000', label: 'Sixt' },
    { nombre: 'Avis', bg: 'white', color: '#d40000', label: 'Avis' },
    { nombre: 'Budget', bg: 'white', color: '#002244', label: 'Budget' }
  ];

  const marcasLoading = [
    { nombre: 'Alamo', bg: '#00266b', color: '#ffb700', label: 'Alamo' },
    { nombre: 'Europcar', bg: '#00843D', color: 'white', label: 'Europcar' },
    { nombre: 'Enterprise', bg: '#004a32', color: 'white', label: 'enterprise' },
    { nombre: 'Dollar', bg: 'white', color: '#de002a', label: 'dollar.' },
    { nombre: 'Budget', bg: 'white', color: '#002244', label: 'Budget' },
    { nombre: 'Avis', bg: 'white', color: '#d40000', label: 'AVIS' },
    { nombre: 'Sixt', bg: '#ff5f00', color: '#000', label: 'SIXT' },
    { nombre: 'Hertz', bg: '#fdd306', color: '#000', label: 'Hertz' },
    { nombre: 'Record go', bg: '#e50000', color: 'white', label: 'record go' },
    { nombre: 'Thrifty', bg: 'white', color: '#005b9b', label: 'Thrifty' },
    { nombre: 'Green Motion', bg: 'white', color: '#88c63f', label: 'green motion' },
    { nombre: 'Keddy', bg: '#6a1b9a', color: 'white', label: 'keddy' }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 20px', minHeight: '80vh', background: 'white' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333', marginBottom: '40px', textAlign: 'center' }}>Buscando las mejores ofertas entre cientos de marcas</h2>
        
        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: '800px', height: '8px', background: '#f0f0f0', borderRadius: '4px', marginBottom: '60px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: '#006ce4', width: '40%', animation: 'loading-slide 1.5s infinite ease-in-out' }}></div>
        </div>

        {/* Logos Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', maxWidth: '800px', marginBottom: '80px' }}>
            {marcasLoading.map((marca, i) => (
              <div key={`load-${i}`} style={{ width: '110px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: marca.bg, color: marca.color, fontWeight: '900', borderRadius: '4px', fontSize: '1rem', border: '1px solid #e7e7e7', letterSpacing: '-0.5px' }}>
                 {marca.label}
              </div>
            ))}
        </div>

        {/* Bottom indicator */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <img src="https://cf.bstatic.com/static/img/cars/icons/car_icon/d261ad47db337611bdcb4914da6b553c3eefbba5.png" alt="car" style={{ height: '40px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
          <span style={{ fontSize: '2.5rem', display: 'none' }}>🚙</span>
          <div>
            <h4 style={{ fontWeight: 'bold', color: '#333', margin: 0, fontSize: '1.1rem' }}>Coches de todos los tamaños</h4>
            <p style={{ color: '#666', margin: 0, fontSize: '1rem' }}>para todo tipo de viajes</p>
          </div>
        </div>

        <style>
          {`
            @keyframes loading-slide {
              0% { left: -40%; }
              100% { left: 100%; }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <main id="contenido-principal">
      {/* HEADER HERO ESTILO BOOKING */}
      <section className="hero" style={{ background: '#003b95', padding: '60px 0 20px', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white' }}>
        <div style={{ maxWidth: '1100px', width: '100%', padding: '0 20px' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '10px', textAlign: 'left', lineHeight: '1.2' }}>Alquiler de coches para cualquier tipo de viaje</h1>
          <p style={{ fontSize: '1.4rem', marginBottom: '30px', textAlign: 'left' }}>Coches fantásticos a precios increíbles de las principales empresas de alquiler</p>
                <form className="av-form-container" onSubmit={handleSearch} style={{ marginTop: '20px' }}>
            <div className="av-form-grid" style={{ gridTemplateColumns: 'minmax(250px, 2fr) minmax(280px, 2fr) minmax(280px, 2fr) auto' }}>
              
              {/* Pickup Location */}
              <div className="av-input-group" style={flashRed ? { borderColor: '#d93025' } : {}}>
                <div className="av-input-segment">
                  <div className="av-input-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  </div>
                  <div className="av-input-field">
                    <label style={{ color: flashRed ? '#d93025' : '#666' }}>Lugar de recogida</label>
                    <input
                      type="text"
                      maxLength={60}
                      required
                      placeholder="Aeropuerto, ciudad o estación"
                      value={pickupLocation}
                      onChange={handlePickupChange}
                      onFocus={() => setShowSuggestions(pickupLocation.trim().length > 0)}
                      onBlur={handlePickupBlur}
                      aria-invalid={!!pickupError || flashRed}
                    />
                    {pickupLocation.length > 30 && (
                      <span style={{ position: 'absolute', right: 8, bottom: 8, fontSize: '0.7rem', color: pickupLocation.length >= 60 ? '#d93025' : '#9ca3af', pointerEvents: 'none' }}>
                        {pickupLocation.length}/60
                      </span>
                    )}
                  </div>
                </div>
                {pickupError && <div role="alert" style={{ position: 'absolute', top: '-25px', left: 0, color: '#d93025', fontSize: '0.8rem', fontWeight: 'bold', background: '#fce8e6', padding: '2px 8px', borderRadius: '4px' }}>{pickupError}</div>}
                {showSuggestions && pickupLocation && (
                  <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', listStyle: 'none', margin: 0, padding: '0', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px', zIndex: 1050, maxHeight: '200px', overflowY: 'auto' }}>
                    {destinos.filter(d => d.toLowerCase().includes(pickupLocation.toLowerCase())).length > 0 ? (
                      destinos.filter(d => d.toLowerCase().includes(pickupLocation.toLowerCase())).map((destino, idx) => (
                        <li key={idx} onMouseDown={() => handleSelectSuggestion(destino)} style={{ padding: '12px 16px', borderBottom: '1px solid #e7e7e7', cursor: 'pointer', fontSize: '0.95rem', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
                          <span style={{ color: '#666' }}>📍</span> {destino}
                        </li>
                      ))
                    ) : (
                      <li style={{ padding: '12px 16px', color: '#666', fontSize: '0.95rem' }}>No hay resultados</li>
                    )}
                  </ul>
                )}
              </div>
              
              {/* Pickup Date & Time */}
              <div className="av-input-group">
                <div className="av-input-segment">
                  <div className="av-input-icon">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6.66667 3.33366H13.3333V1.66699H15V3.33366H15.8333C16.2917 3.33366 16.6842 3.49691 17.0109 3.82357C17.337 4.14968 17.5 4.54199 17.5 5.00033V16.667C17.5 17.1253 17.337 17.5179 17.0109 17.8446C16.6842 18.1707 16.2917 18.3337 15.8333 18.3337H4.16667C3.70833 18.3337 3.31576 18.1707 2.9891 17.8446C2.66298 17.5179 2.5 17.1253 2.5 16.667V5.00033C2.5 4.54199 2.66298 4.14968 2.9891 3.82357C3.31576 3.49691 3.70834 3.33366 4.16667 3.33366H5V1.66699H6.66667V3.33366ZM4.16667 16.667H15.8333V8.33366H4.16667V16.667ZM6.66667 13.3337C7.125 13.3337 7.5 13.7087 7.5 14.167C7.5 14.6253 7.125 15.0003 6.66667 15.0003C6.20833 15.0003 5.83333 14.6253 5.83333 14.167C5.83333 13.7087 6.20833 13.3337 6.66667 13.3337ZM10 13.3337C10.4583 13.3337 10.8333 13.7087 10.8333 14.167C10.8333 14.6253 10.4583 15.0003 10 15.0003C9.54167 15.0003 9.16667 14.6253 9.16667 14.167C9.16667 13.7087 9.54167 13.3337 10 13.3337ZM13.3333 13.3337C13.7917 13.3337 14.1667 13.7087 14.1667 14.167C14.1667 14.6253 13.7917 15.0003 13.3333 15.0003C12.875 15.0003 12.5 14.6253 12.5 14.167C12.5 13.7087 12.875 13.3337 13.3333 13.3337ZM6.66667 10.0003C7.125 10.0003 7.5 10.3753 7.5 10.8337C7.5 11.292 7.125 11.667 6.66667 11.667C6.20833 11.667 5.83333 11.292 5.83333 10.8337C5.83333 10.3753 6.20833 10.0003 6.66667 10.0003ZM10 10.0003C10.4583 10.0003 10.8333 10.3753 10.8333 10.8337C10.8333 11.292 10.4583 11.667 10 11.667C9.54167 11.667 9.16667 11.292 9.16667 10.8337C9.16667 10.3753 9.54167 10.0003 10 10.0003ZM13.3333 10.0003C13.7917 10.0003 14.1667 10.3753 14.1667 10.8337C14.1667 11.292 13.7917 11.667 13.3333 11.667C12.875 11.667 12.5 11.292 12.5 10.8337C12.5 10.3753 12.875 10.0003 13.3333 10.0003Z"/></svg>
                  </div>
                  <div className="av-input-field">
                    <label>Salida</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setFormError(''); }}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                <div className="av-divider"></div>
                <div className="av-input-segment" style={{ flex: 0.7 }}>
                  <div className="av-input-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>
                  </div>
                  <div className="av-input-field">
                    <label>Hora</label>
                    <select aria-label="Hora de recogida" value={pickupTime} onChange={(e) => { setPickupTime(e.target.value); setFormError(''); }}>
                      <option value="">Seleccione hora</option>
                      {timeOptions.map(t => <option key={`pickup-${t}`} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Dropoff Date & Time */}
              <div className="av-input-group">
                <div className="av-input-segment">
                  <div className="av-input-icon">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6.66667 3.33366H13.3333V1.66699H15V3.33366H15.8333C16.2917 3.33366 16.6842 3.49691 17.0109 3.82357C17.337 4.14968 17.5 4.54199 17.5 5.00033V16.667C17.5 17.1253 17.337 17.5179 17.0109 17.8446C16.6842 18.1707 16.2917 18.3337 15.8333 18.3337H4.16667C3.70833 18.3337 3.31576 18.1707 2.9891 17.8446C2.66298 17.5179 2.5 17.1253 2.5 16.667V5.00033C2.5 4.54199 2.66298 4.14968 2.9891 3.82357C3.31576 3.49691 3.70834 3.33366 4.16667 3.33366H5V1.66699H6.66667V3.33366ZM4.16667 16.667H15.8333V8.33366H4.16667V16.667ZM6.66667 13.3337C7.125 13.3337 7.5 13.7087 7.5 14.167C7.5 14.6253 7.125 15.0003 6.66667 15.0003C6.20833 15.0003 5.83333 14.6253 5.83333 14.167C5.83333 13.7087 6.20833 13.3337 6.66667 13.3337ZM10 13.3337C10.4583 13.3337 10.8333 13.7087 10.8333 14.167C10.8333 14.6253 10.4583 15.0003 10 15.0003C9.54167 15.0003 9.16667 14.6253 9.16667 14.167C9.16667 13.7087 9.54167 13.3337 10 13.3337ZM13.3333 13.3337C13.7917 13.3337 14.1667 13.7087 14.1667 14.167C14.1667 14.6253 13.7917 15.0003 13.3333 15.0003C12.875 15.0003 12.5 14.6253 12.5 14.167C12.5 13.7087 12.875 13.3337 13.3333 13.3337ZM6.66667 10.0003C7.125 10.0003 7.5 10.3753 7.5 10.8337C7.5 11.292 7.125 11.667 6.66667 11.667C6.20833 11.667 5.83333 11.292 5.83333 10.8337C5.83333 10.3753 6.20833 10.0003 6.66667 10.0003ZM10 10.0003C10.4583 10.0003 10.8333 10.3753 10.8333 10.8337C10.8333 11.292 10.4583 11.667 10 11.667C9.54167 11.667 9.16667 11.292 9.16667 10.8337C9.16667 10.3753 9.54167 10.0003 10 10.0003ZM13.3333 10.0003C13.7917 10.0003 14.1667 10.3753 14.1667 10.8337C14.1667 11.292 13.7917 11.667 13.3333 11.667C12.875 11.667 12.5 11.292 12.5 10.8337C12.5 10.3753 12.875 10.0003 13.3333 10.0003Z"/></svg>
                  </div>
                  <div className="av-input-field">
                    <label>Regreso</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setFormError(''); }}
                      min={startDate || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                <div className="av-divider"></div>
                <div className="av-input-segment" style={{ flex: 0.7 }}>
                  <div className="av-input-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>
                  </div>
                  <div className="av-input-field">
                    <label>Hora</label>
                    <select aria-label="Hora de devolución" value={dropoffTime} onChange={(e) => { setDropoffTime(e.target.value); setFormError(''); }}>
                      <option value="">Seleccione hora</option>
                      {timeOptions.map(t => <option key={`dropoff-${t}`} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Submit */}
              <button type="submit" className="av-btn-buscar">
                Buscar
              </button>
            </div>

            {formError && (
              <div style={{ color: '#d93025', fontSize: '0.95rem', fontWeight: 'bold', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fce8e6', padding: '10px 16px', borderRadius: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                {formError}
              </div>
            )}

            {/* Opciones inferiores */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', color: '#1b1b1b', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={sameDropoff} onChange={(e) => setSameDropoff(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#003580' }} />
                  Devolver el coche en otra oficina
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={driverAge} onChange={(e) => setDriverAge(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#003580' }} />
                  Conductor entre 30 y 65 años
                </label>

                {!driverAge && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '4px 10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <label style={{ fontSize: '0.85rem', color: '#333' }}>Edad real:</label>
                    <input
                      type="number"
                      min="18"
                      max="99"
                      value={customAge}
                      onChange={(e) => setCustomAge(e.target.value)}
                      style={{ width: '60px', padding: '4px', border: '1px solid #aaa', borderRadius: '3px', fontSize: '0.9rem' }}
                    />
                    {Number(customAge) < 25 && (
                      <span style={{ fontSize: '0.75rem', color: '#b06000', fontWeight: 'bold' }}>
                        *Aplica tasa por conductor joven (+$15/día)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {sameDropoff && (
                <div style={{ maxWidth: '420px', marginTop: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#1b1b1b', marginBottom: '3px', fontWeight: 600 }}>
                    Lugar de devolución diferente:
                  </label>
                  <input
                    type="text"
                    placeholder="Oficina, aeropuerto o ciudad de devolución"
                    value={dropoffLocation}
                    onChange={(e) => setDropoffLocation(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}
                  />
                </div>
              )}
            </div>
          </form>
        </div>
      </section>

      {!hasSearched && (
        <>
          {/* Hero */}
          <section
            style={{
              maxWidth: '1024px',
              margin: '40px auto 0',
              padding: '0 24px 24px',
            }}
          >
            <div
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '300px',
                background: '#1a2a4a',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {/* Background image */}
              <img
                src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=400&fit=crop"
                alt="Alquiler de coches"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.45,
                }}
              />
              {/* Text overlay */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  padding: '40px 48px',
                  maxWidth: '520px',
                }}
              >
                <h2
                  style={{
                    color: '#fff',
                    fontSize: '2.2rem',
                    fontWeight: 800,
                    lineHeight: 1.2,
                    marginBottom: '12px',
                    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                >
                  Hay un Ecuador esperándote
                </h2>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '1.05rem',
                    lineHeight: 1.6,
                    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  Te llevamos a los mejores destinos dentro del país para que encuentres los lugares que te muevan. Reserva hoy tu próximo vehículo.
                </p>
              </div>
            </div>
          </section>

          {/* ── DESTINOS ────────────────────────────────────────────────── */}
          <section
            style={{
              maxWidth: '1024px',
              margin: '0 auto',
              padding: '0 24px 32px',
            }}
          >
            <h2
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: '#1a1a1a',
                marginBottom: '4px',
              }}
            >
              Ofertas desde{' '}
              <span style={{ color: '#0057b8' }}>Quito ▾</span>
            </h2>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '20px' }}>
              Haz clic en un destino para iniciar tu búsqueda directamente.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {DESTINOS_ECUADOR.map((dest) => (
                <button
                  key={dest.codigo}
                  type="button"
                  onClick={() => handleDestinationCardClick(dest.nombre)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    textAlign: 'left',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
                  }}
                  aria-label={`Buscar coches en ${dest.nombre}`}
                >
                  {/* Card image */}
                  <div style={{ position: 'relative', height: '150px' }}>
                    <img
                      src={dest.imagen}
                      alt={dest.nombre}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      onError={(e) => {
                        e.target.src = `https://picsum.photos/seed/${dest.codigo}/400/240`;
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(255,255,255,0.92)',
                        color: '#0057b8',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Oferta especial
                    </span>
                  </div>
                  {/* Card info */}
                  <div style={{ padding: '14px 16px', background: '#fff' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        color: '#1a1a1a',
                        marginBottom: '2px',
                      }}
                    >
                      {dest.nombre}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.82rem', marginBottom: '8px' }}>
                      {dest.descripcion}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#888', fontSize: '0.8rem' }}>Desde</span>
                      <span
                        style={{
                          color: '#0057b8',
                          fontWeight: 700,
                          fontSize: '1rem',
                        }}
                      >
                        {dest.desde}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {hasSearched && (
        <div className="main-content" style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
          {error && (
          <div className="state-container" style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="error-icon" style={{ fontSize: '2rem' }}>⚠️</div>
            <p className="state-subtitle">{error}</p>
            <button className="retry-btn" onClick={fetchData} style={{ background: '#006ce4', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', marginTop: '10px', cursor: 'pointer' }}>Reintentar</button>
          </div>
        )}

        {hasSearched && !error && autos.length === 0 && (
          <div className="state-container" style={{ textAlign: 'center', padding: '40px 0' }}>
            <p className="state-title">No hay autos disponibles para tu búsqueda</p>
          </div>
        )}

        {hasSearched && !error && autos.length > 0 && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            {/* Sidebar */}
            <div style={{ width: '280px', flexShrink: 0 }}>
              <div style={{ background: '#e0e0e0', height: '150px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px' }}>
                <button style={{ background: '#006ce4', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>Mostrar en el Mapa</button>
              </div>
              <div style={{ border: '1px solid #e7e7e7', borderRadius: '4px', padding: '16px', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, color: '#333' }}>Filtrar</h3>
                  <span style={{ fontSize: '0.8rem', color: '#006ce4', cursor: 'pointer' }}>Borrar todos los filtros</span>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', color: '#333' }}>Compañía</h4>
                  {marcasPopulares.map((m, idx) => (
                     <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer' }}>
                       <input type="checkbox" style={{ width: '18px', height: '18px' }} /> {m.label} <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.8rem' }}>10</span>
                     </label>
                  ))}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', color: '#333' }}>Categoría del vehículo</h4>
                  {['Coche pequeño', 'Coche mediano', 'Coche grande', 'SUV'].map((c, idx) => (
                     <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer' }}>
                       <input type="checkbox" style={{ width: '18px', height: '18px' }} /> {c} <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.8rem' }}>5</span>
                     </label>
                  ))}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', color: '#333' }}>Precio por día</h4>
                  {[`0 ${currency} - ${convertPrice(50)}`, `${convertPrice(50)} - ${convertPrice(100)}`, `${convertPrice(100)} - ${convertPrice(150)}`].map((p, idx) => (
                     <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer' }}>
                       <input type="checkbox" style={{ width: '18px', height: '18px' }} /> {p}
                     </label>
                  ))}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', color: '#333' }}>Número de plazas</h4>
                  {['4 plazas', '5 plazas', '7 o más plazas'].map((p, idx) => (
                     <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px', cursor: 'pointer' }}>
                       <input type="checkbox" style={{ width: '18px', height: '18px' }} /> {p}
                     </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Column */}
            <div style={{ flex: 1 }}>
              {/* Category & Transmission Filter Bar */}
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e7e7e7', marginBottom: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Categoría del Vehículo:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { id: 'ALL', label: '🚗 Todos' },
                      { id: 'ECONOMICO', label: '⚡ Económico' },
                      { id: 'COMPACTO', label: '🚘 Compacto' },
                      { id: 'SUV', label: '🚙 SUV / 4x4' },
                      { id: 'PREMIUM', label: '💎 Premium' },
                      { id: 'VAN', label: '🚐 Vans' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { setSelectedCategory(cat.id); fetchData(cat.id, selectedTransmission); }}
                        style={{
                          background: selectedCategory === cat.id ? '#003580' : '#f0f4f8',
                          color: selectedCategory === cat.id ? 'white' : '#333',
                          border: selectedCategory === cat.id ? '1px solid #003580' : '1px solid #d0d7de',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontSize: '0.86rem',
                          fontWeight: selectedCategory === cat.id ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Transmisión:
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { id: 'ALL', label: 'Todas' },
                      { id: 'MANUAL', label: '⚙️ Manual' },
                      { id: 'AUTOMATICO', label: '🕹️ Automática' }
                    ].map(trans => (
                      <button
                        key={trans.id}
                        type="button"
                        onClick={() => { setSelectedTransmission(trans.id); fetchData(selectedCategory, trans.id); }}
                        style={{
                          background: selectedTransmission === trans.id ? '#006ce4' : '#f0f4f8',
                          color: selectedTransmission === trans.id ? 'white' : '#333',
                          border: selectedTransmission === trans.id ? '1px solid #006ce4' : '1px solid #d0d7de',
                          padding: '5px 12px',
                          borderRadius: '16px',
                          fontSize: '0.82rem',
                          fontWeight: selectedTransmission === trans.id ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {trans.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Banner Informativo de Cooldown y Reglas RDA2 */}
              <div style={{ background: '#eef8ff', border: '1px solid #b8e2fb', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                <div style={{ fontSize: '0.85rem', color: '#004373', lineHeight: 1.4 }}>
                  <b>Garantía de Limpieza e Inspección (RDA2):</b> Los vehículos devueltos cumplen un <b>cooldown estricto de 2 horas</b> de higienización técnica antes de reingresar al catálogo.
                </div>
              </div>

              {metadata?.surcharge_applied && (
                <div style={{ background: '#fef7e0', border: '1px solid #f6e05e', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#975a16', fontSize: '0.85rem' }}>
                  ⚠️ Se ha aplicado un recargo por conductor menor de 25 años (+${metadata.surcharge_amount || 15} USD/día) según políticas de alquiler.
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                 <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333', margin: '0 0 15px 0' }}>{autos.length} coches disponibles</h2>
                 <div style={{ display: 'inline-flex', border: '1px solid #666', borderRadius: '32px', padding: '6px 16px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', alignItems: 'center', gap: '5px' }}>
                   <span style={{ fontSize: '0.8rem' }}>↓↑</span> Ordenar por: Recomendado <span style={{ fontSize: '0.7rem', marginLeft: '5px' }}>▼</span>
                 </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {autos.map((a, i) => (
                  <AutoCard
                    key={a.vehicle_id || i}
                    auto={a}
                    dias={calculateDays()}
                    startDate={startDate}
                    endDate={endDate}
                    pickupLocation={pickupLocation}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </main>
  );
}
