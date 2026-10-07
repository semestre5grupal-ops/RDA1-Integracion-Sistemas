import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAtracciones } from '../services/atraccionesApi';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Datos Mock para Destinos Top en Ecuador
const DESTINOS_TOP = [
  { id: 1, nombre: 'Quito', cosas: '245 cosas que hacer', img: 'https://picsum.photos/id/28/800/600' },
  { id: 2, nombre: 'Guayaquil', cosas: '128 cosas que hacer', img: 'https://picsum.photos/id/29/800/600' },
  { id: 3, nombre: 'Cuenca', cosas: '184 cosas que hacer', img: 'https://picsum.photos/id/38/800/600' },
  { id: 4, nombre: 'Baños', cosas: '312 cosas que hacer', img: 'https://picsum.photos/id/49/800/600' },
  { id: 5, nombre: 'Galápagos', cosas: '89 cosas que hacer', img: 'https://picsum.photos/id/58/800/600' }
];

const EXPLORA_TABS = ['Pichincha', 'Guayas', 'Azuay', 'Tungurahua', 'Manabí', 'Imbabura', 'Galápagos'];
const EXPLORA_DESTINOS = [
  { nombre: 'Mitad del Mundo', cosas: '45 cosas que hacer', img: 'https://picsum.photos/id/111/800/600' },
  { nombre: 'Mindo', cosas: '78 cosas que hacer', img: 'https://picsum.photos/id/112/800/600' },
  { nombre: 'Sangolquí', cosas: '12 cosas que hacer', img: 'https://picsum.photos/id/113/800/600' },
  { nombre: 'Machachi', cosas: '24 cosas que hacer', img: 'https://picsum.photos/id/114/800/600' },
];

const ECUADOR_IMAGES = [
  'https://picsum.photos/id/28/800/600',
  'https://picsum.photos/id/29/800/600',
  'https://picsum.photos/id/38/800/600',
  'https://picsum.photos/id/49/800/600',
  'https://picsum.photos/id/58/800/600',
  'https://picsum.photos/id/111/800/600'
];
const getEcuadorImage = (idx) => ECUADOR_IMAGES[idx % ECUADOR_IMAGES.length];

export function AtraccionesPage() {
  const navigate = useNavigate();
  const [atracciones, setAtracciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [flashRed, setFlashRed] = useState(false);
  const destinos = ['Quito', 'Guayaquil', 'Cuenca', 'Baños', 'Galápagos', 'Mindo', 'Mitad del Mundo', 'Otavalo'];

  const triggerFlash = (msg) => {
    setSearchError(msg);
    setFlashRed(true);
    setTimeout(() => setFlashRed(false), 300);
  };

  const handleSearchChange = (e) => {
    const raw = e.target.value;
    const hasNumbers = /[0-9]/.test(raw);
    const hasSymbols = /[^a-zA-Z\s,áéíóúÁÉÍÓÚñÑ0-9]/.test(raw);
    const hasMultipleSpaces = /\s{2,}/.test(raw);

    if (hasNumbers) {
      triggerFlash('No se permiten números en el destino');
    } else if (hasSymbols) {
      triggerFlash('Solo se permiten letras y comas');
    } else if (hasMultipleSpaces) {
      triggerFlash('No se permiten espacios consecutivos');
    } else {
      setSearchError('');
    }

    const clean = raw.replace(/[^a-zA-Z\s,áéíóúÁÉÍÓÚñÑ]/g, '').replace(/\s{2,}/g, ' ');
    setBusqueda(clean);
    setShowSuggestions(clean.length > 0);
    setFormError('');
  };

  const handleSelectSuggestion = (destino) => {
    setBusqueda(destino);
    setShowSuggestions(false);
    setSearchError('');
    setFormError('');
  };

  const [tabActivo, setTabActivo] = useState('Pichincha');
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  const [formError, setFormError] = useState('');

  const handleSearch = () => {
    const faltantes = [];
    if (busqueda.trim() === '') faltantes.push('el destino');
    if (!startDate) faltantes.push('la fecha de inicio');
    if (!endDate) faltantes.push('la fecha de fin');

    if (faltantes.length > 0) {
      let mensaje = '';
      if (faltantes.length === 1) {
        mensaje = `Por favor proporcione ${faltantes[0]}.`;
      } else if (faltantes.length === 2) {
        mensaje = `Por favor proporcione ${faltantes[0]} y ${faltantes[1]}.`;
      } else {
        mensaje = `Por favor proporcione ${faltantes[0]}, ${faltantes[1]} y ${faltantes[2]}.`;
      }
      setFormError(mensaje);
      return;
    }

    setFormError('');
    navigate(`/search?destino=${encodeURIComponent(busqueda)}`);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAtracciones({ page: 1, limit: 10 });
      const items = result.data || result;
      setAtracciones(Array.isArray(items) ? items : []);
    } catch (err) {
      setError('No se pudo conectar con el servicio de Atracciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const atraccionesFiltradas = atracciones.filter((a) => {
    const nombre = (a.nombre || a.name || a.title || '').toLowerCase();
    return nombre.includes(busqueda.toLowerCase());
  });

  return (
    <main id="contenido-principal">
      {/* HERO SECTION */}
      <section className="hero">
        <div className="hero-content">
          <h1>Atracciones, actividades y experiencias</h1>
          <p>Descubre nuevas atracciones y experiencias que coincidan con tus intereses y estilo de viaje en Ecuador</p>
        </div>
        
        <div className="search-box">
          <div className="search-input-group" style={{ position: 'relative', background: flashRed ? '#fce8e6' : 'white', border: flashRed ? '3px solid #d93025' : '3px solid transparent', transition: 'background-color 0.2s, border 0.2s' }}>
            <svg width="24" height="24" fill="none" stroke={flashRed ? '#d93025' : 'currentColor'} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <div className="input-text-wrapper" style={{ width: '100%' }}>
              <input
                type="text"
                placeholder="Destino o ¿A dónde vas?"
                value={busqueda}
                onChange={handleSearchChange}
                onFocus={() => setShowSuggestions(busqueda.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                style={{ background: 'transparent' }}
              />
            </div>
            {searchError && <div style={{ position: 'absolute', top: '-25px', left: 0, color: '#d93025', fontSize: '0.8rem', fontWeight: 'bold', background: '#fce8e6', padding: '2px 8px', borderRadius: '4px' }}>{searchError}</div>}
            {showSuggestions && busqueda && (
              <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', listStyle: 'none', margin: 0, padding: '0', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                {destinos.filter(d => d.toLowerCase().includes(busqueda.toLowerCase())).length > 0 ? (
                  destinos.filter(d => d.toLowerCase().includes(busqueda.toLowerCase())).map((destino, idx) => (
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
          
          <div className="search-input-group date-group">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <div className="input-text-wrapper date-picker-wrapper" style={{display: 'flex', flex: 1}}>
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => {
                  setDateRange(update);
                  setFormError('');
                }}
                monthsShown={2}
                placeholderText="Fechas"
                dateFormat="dd/MM/yyyy"
                className="custom-date-picker-input"
                minDate={new Date()}
              />
            </div>
          </div>
          
          <button className="search-btn" onClick={handleSearch}>Buscar</button>
        </div>
        {formError && (
          <div style={{ color: '#d93025', fontSize: '0.95rem', fontWeight: 'bold', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fce8e6', padding: '10px 16px', borderRadius: '8px', maxWidth: '800px', margin: '12px auto 0' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            {formError}
          </div>
        )}
      </section>

      <div className="main-content">
        
        {/* RECOMENDADO GENERADO POR IA */}
        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">Recomendado en Quito</h2>
              <p className="section-subtitle">Nuestra selección de las mejores atracciones basada en IA para ti</p>
            </div>
          </div>

          {loading && <div className="spinner"></div>}
          {!loading && error && <p style={{color: '#d32f2f'}}>{error}</p>}
          
          <div className="atracciones-horizontal-scroll">
            {atraccionesFiltradas.slice(0, 5).map((atraccion, idx) => (
              <div 
                key={atraccion.id} 
                className="atraccion-scroll-card"
                onClick={() => navigate(`/atracciones/${atraccion.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="asc-img-wrapper">
                  <span className="asc-badge">#{idx + 1} Más vendido</span>
                  <img src={getEcuadorImage(idx)} alt={atraccion.nombre} />
                  <div className="asc-info">
                    <h3 className="asc-title">{atraccion.nombre || atraccion.name || atraccion.title}</h3>
                    <div className="asc-rating">
                      <span className="score">{(Math.random() * 2 + 8).toFixed(1)}</span>
                      <span className="text">Excepcional ({Math.floor(Math.random() * 500) + 50})</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DESTINOS TOP ECUADOR */}
        <section className="section-block">
          <h2 className="section-title">Destinos top en Ecuador</h2>
          <div className="destinos-top-grid">
            {DESTINOS_TOP.map((destino, idx) => (
              <div 
                key={destino.id} 
                className={`destino-top-card ${idx < 2 ? 'large' : ''}`}
                onClick={() => navigate(`/atracciones/${destino.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <img src={destino.img} alt={destino.nombre} />
                <div className="dt-info">
                  <h3>{destino.nombre}</h3>
                  <p>{destino.cosas}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TU CUENTA BANNER */}
        <section className="section-block">
          <h2 className="section-title">Tu cuenta, tus viajes</h2>
          <div className="account-banner">
            <div className="account-banner-content">
              <h3>Todos los detalles de tus viajes en un mismo lugar</h3>
              <p>Inicia sesión para reservar más rápido y administrar tus viajes fácilmente</p>
              <div className="account-actions">
                <button className="btn-iniciar-sesion">Iniciar sesión</button>
                <button className="btn-registrate">Regístrate</button>
              </div>
            </div>
            <div className="account-banner-img">
              <span className="genius-icon">🎁 Genius</span>
            </div>
          </div>
        </section>

        {/* CUENTA CON NOSOTROS */}
        <section className="section-block">
          <h2 className="section-title">Cuenta con nosotros</h2>
          <div className="features-grid">
            <div className="feature-item">
              <span className="feature-icon">🎡</span>
              <div>
                <h3>Descubre las principales atracciones</h3>
                <p>Conoce lo mejor del destino con atracciones, tours, actividades y mucho más</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⏱️</span>
              <div>
                <h3>Rápido y flexible</h3>
                <p>Puedes reservar los boletos online en pocos minutos y hay cancelación gratis en muchas atracciones</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🎧</span>
              <div>
                <h3>Asistencia cuando lo necesites</h3>
                <p>El equipo de Atención al cliente está a tu disposición para ayudarte las 24 horas, todos los días</p>
              </div>
            </div>
          </div>
        </section>

        {/* EXPLORA MAS DESTINOS */}
        <section className="section-block">
          <h2 className="section-title">Explora más destinos</h2>
          <p className="section-subtitle">Encuentra cosas que hacer en ciudades de todo el Ecuador</p>
          
          <div className="explora-tabs">
            {EXPLORA_TABS.map(tab => (
              <button 
                key={tab} 
                className={`tab-btn ${tabActivo === tab ? 'active' : ''}`}
                onClick={() => setTabActivo(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div className="explora-grid">
            {EXPLORA_DESTINOS.map((dest, idx) => (
              <div 
                key={idx} 
                className="explora-card"
                onClick={() => navigate(`/atracciones/${idx + 1}`)}
                style={{ cursor: 'pointer' }}
              >
                <img src={dest.img} alt={dest.nombre} />
                <div className="ex-info">
                  <h3>{dest.nombre}</h3>
                  <p>{dest.cosas}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
