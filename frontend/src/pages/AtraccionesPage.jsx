import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAtracciones } from '../services/atraccionesApi';
import { useAuth } from '../hooks/useAuth';
import { AtraccionesLoadingView } from '../components/AtraccionesLoadingView';
import { resolverImagenAtraccion } from '../utils/atraccionImagenes';

// Datos para Destinos Top en Ecuador con imágenes curadas de alta resolución
const DESTINOS_TOP = [
  { id: 'uio', nombre: 'Quito', cosas: '245 cosas que hacer', img: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop' },
  { id: 'gye', nombre: 'Guayaquil', cosas: '128 cosas que hacer', img: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop' },
  { id: 'cue', nombre: 'Cuenca', cosas: '184 cosas que hacer', img: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop' },
  { id: 'ban', nombre: 'Baños', cosas: '312 cosas que hacer', img: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop' },
  { id: 'gal', nombre: 'Galápagos', cosas: '89 cosas que hacer', img: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop' }
];

const EXPLORA_TABS = ['Pichincha', 'Guayas', 'Azuay', 'Tungurahua', 'Manabí', 'Imbabura', 'Galápagos'];
const DESTINOS_POR_PROVINCIA = {
  Pichincha: [
    { nombre: 'Mitad del Mundo', cosas: '45 cosas que hacer', img: 'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop' },
    { nombre: 'Mindo Bosque Nublado', cosas: '78 cosas que hacer', img: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop' },
    { nombre: 'Sangolquí & Valle', cosas: '12 cosas que hacer', img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop' },
    { nombre: 'Machachi & Volcanes', cosas: '24 cosas que hacer', img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop' },
  ],
  Guayas: [
    { nombre: 'Malecón 2000', cosas: '52 cosas que hacer', img: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&auto=format&fit=crop' },
    { nombre: 'Barrio Las Peñas', cosas: '34 cosas que hacer', img: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop' },
    { nombre: 'Parque de las Iguanas', cosas: '18 cosas que hacer', img: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop' },
    { nombre: 'Isla Santay', cosas: '22 cosas que hacer', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop' },
  ],
  Azuay: [
    { nombre: 'Catedral Nueva de Cuenca', cosas: '38 cosas que hacer', img: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop' },
    { nombre: 'Parque Nacional Cajas', cosas: '65 cosas que hacer', img: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop' },
    { nombre: 'Mirador de Turi', cosas: '19 cosas que hacer', img: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop' },
    { nombre: 'Barranco del Río Tomebamba', cosas: '27 cosas que hacer', img: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop' },
  ],
  Tungurahua: [
    { nombre: 'Pailón del Diablo (Baños)', cosas: '94 cosas que hacer', img: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop' },
    { nombre: 'Casa del Árbol & Columpio', cosas: '41 cosas que hacer', img: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop' },
    { nombre: 'Cascada Manto de la Novia', cosas: '32 cosas que hacer', img: 'https://images.unsplash.com/photo-1533240332313-0db49b459ad6?w=800&auto=format&fit=crop' },
    { nombre: 'Ruta de las Cascadas en Chiva', cosas: '56 cosas que hacer', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop' },
  ],
  Manabí: [
    { nombre: 'Playa Los Frailes', cosas: '29 cosas que hacer', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop' },
    { nombre: 'Parque Nacional Machalilla', cosas: '48 cosas que hacer', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop' },
    { nombre: 'Isla de la Plata', cosas: '31 cosas que hacer', img: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop' },
    { nombre: 'Canoa & Clases de Surf', cosas: '23 cosas que hacer', img: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop' },
  ],
  Imbabura: [
    { nombre: 'Laguna de Cuicocha', cosas: '35 cosas que hacer', img: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop' },
    { nombre: 'Mercado de Ponchos Otavalo', cosas: '60 cosas que hacer', img: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop' },
    { nombre: 'Cascada de Peguche', cosas: '21 cosas que hacer', img: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop' },
    { nombre: 'Paseo en Lago San Pablo', cosas: '26 cosas que hacer', img: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop' },
  ],
  Galápagos: [
    { nombre: 'Estación Charles Darwin', cosas: '42 cosas que hacer', img: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop' },
    { nombre: 'Tortuga Bay (Santa Cruz)', cosas: '39 cosas que hacer', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop' },
    { nombre: 'Túneles de Lava en Isabela', cosas: '51 cosas que hacer', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop' },
    { nombre: 'Snorkel en Kicker Rock', cosas: '28 cosas que hacer', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop' },
  ],
};

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
  const { user } = useAuth();
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
    const raw = e.target.value.slice(0, 60);
    const hasSymbols = /[^a-zA-Z0-9\s,áéíóúÁÉÍÓÚñÑ\-_.]/.test(raw);
    const hasMultipleSpaces = /\s{2,}/.test(raw);

    if (hasSymbols) {
      triggerFlash('Solo se permiten letras, números y signos comunes');
    } else if (hasMultipleSpaces) {
      triggerFlash('No se permiten espacios consecutivos');
    } else if (raw.length >= 60) {
      triggerFlash('Límite máximo de 60 caracteres alcanzado');
    } else {
      setSearchError('');
    }

    const clean = raw.replace(/[^a-zA-Z0-9\s,áéíóúÁÉÍÓÚñÑ\-_.]/g, '').replace(/\s{2,}/g, ' ');
    setBusqueda(clean);
    setShowSuggestions(clean.trim().length > 0);
    setFormError('');
  };

  const handleSearchBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setBusqueda(prev => prev.trim().replace(/\s{2,}/g, ' '));
    }, 200);
  };

  const handleSelectSuggestion = (destino) => {
    setBusqueda(destino);
    setShowSuggestions(false);
    setSearchError('');
    setFormError('');
  };

  const [tabActivo, setTabActivo] = useState('Pichincha');
  const [tabTransitioning, setTabTransitioning] = useState(false);

  const handleTabChange = (tab) => {
    if (tab === tabActivo) return;
    setTabTransitioning(true);
    setTabActivo(tab);
    setTimeout(() => setTabTransitioning(false), 200);
  };

  const [formError, setFormError] = useState('');

  const handleSearch = () => {
    const cleanDestino = busqueda.trim().replace(/\s{2,}/g, ' ');
    if (!cleanDestino) {
      const mensaje = 'Por favor proporcione el destino o atracción.';
      setFormError(mensaje);
      triggerFlash(mensaje);
      return;
    }

    setFormError('');
    navigate(`/search?destino=${encodeURIComponent(cleanDestino)}`);
  };

  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await getAtracciones({ page: 1, limit: 100 });
      const items = result.data || result;
      const list = Array.isArray(items) ? items : [];
      setAtracciones((prev) => {
        if (prev && prev.length === list.length) {
          let hasDiff = false;
          for (let i = 0; i < list.length; i++) {
            const p = prev[i];
            const n = list[i];
            const pId = p.id || p._id || p.atraccion_id;
            const nId = n.id || n._id || n.atraccion_id;
            const pPrice = typeof p.price === 'object' ? p.price?.total : (p.precio || p.price);
            const nPrice = typeof n.price === 'object' ? n.price?.total : (n.precio || n.price);
            const pStock = p.cupos || p.cupos_disponibles || p.stock;
            const nStock = n.cupos || n.cupos_disponibles || n.stock;
            if (
              pId !== nId ||
              pPrice !== nPrice ||
              pStock !== nStock ||
              (p.nombre || p.name) !== (n.nombre || n.name) ||
              (p.ciudad || p.city) !== (n.ciudad || n.city)
            ) {
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
      console.warn('[AtraccionesPage] Refresco en segundo plano omitido:', err?.message || err);
      if (!isSilent) {
        setError('No se pudo conectar con el servicio de Atracciones.');
      }
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, []);

  // Polling silencioso en segundo plano cada 8 segundos (RDA2 Tiempo Real)
  useEffect(() => {
    let timer = null;
    let isCancelled = false;

    const runPoll = async (silent) => {
      if (isCancelled) return;
      await fetchData(silent);
      if (!isCancelled) {
        timer = setTimeout(() => runPoll(true), 8000);
      }
    };

    runPoll(false);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchData]);

  const atraccionesFiltradas = atracciones.filter((a) => {
    if (!busqueda) return true;
    const term = busqueda.toLowerCase().trim();
    const nombre = (a.nombre || a.name || a.title || '').toLowerCase();
    const ciudad = (a.ciudad || a.city || a.ubicacion || '').toLowerCase();
    const descripcion = (a.descripcion_corta || a.descripcion || a.description || '').toLowerCase();
    const inclusiones = Array.isArray(a.inclusiones) ? a.inclusiones.join(' ').toLowerCase() : '';
    return nombre.includes(term) || ciudad.includes(term) || descripcion.includes(term) || inclusiones.includes(term);
  });

  if (loading) {
    return <AtraccionesLoadingView titulo="Buscando las mejores ofertas entre cientos de experiencias" />;
  }

  return (
    <main id="contenido-principal">
      {/* HERO SECTION */}
      <section className="hero">
        <div className="hero-content">
          <h1>Atracciones, actividades y experiencias</h1>
          <p>Descubre nuevas atracciones y experiencias que coincidan con tus intereses y estilo de viaje en Ecuador</p>
        </div>
        
        <div className="search-box">
          <div className="search-input-group" style={{ position: 'relative', flex: 1, background: flashRed ? '#fce8e6' : 'white', border: flashRed ? '3px solid #d93025' : '3px solid transparent', transition: 'background-color 0.2s, border 0.2s' }}>
            <svg width="24" height="24" fill="none" stroke={flashRed ? '#d93025' : 'currentColor'} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <div className="input-text-wrapper" style={{ width: '100%', position: 'relative' }}>
              <input
                type="text"
                maxLength={60}
                placeholder="Buscar por nombre de atracción o ciudad..."
                value={busqueda}
                onChange={handleSearchChange}
                onFocus={() => setShowSuggestions(busqueda.trim().length > 0)}
                onBlur={handleSearchBlur}
                aria-invalid={!!searchError || flashRed}
                style={{ background: 'transparent', paddingRight: '45px' }}
              />
              {busqueda.length > 30 && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', color: busqueda.length >= 60 ? '#d93025' : '#9ca3af', pointerEvents: 'none' }}>
                  {busqueda.length}/60
                </span>
              )}
            </div>
            {searchError && (
              <div 
                role="alert" 
                aria-live="assertive"
                style={{ 
                  position: 'absolute', 
                  top: '-32px', 
                  left: 0, 
                  color: '#991b1b', 
                  fontSize: '0.82rem', 
                  fontWeight: '700', 
                  background: '#fee2e2', 
                  border: '1px solid #ef4444',
                  padding: '3px 10px', 
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>⚠️</span> {searchError}
              </div>
            )}
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

          {error && <p style={{color: '#d32f2f'}}>{error}</p>}
          
          <div className="atracciones-horizontal-scroll">
            {atraccionesFiltradas.slice(0, 8).map((atraccion, idx) => {
              const foto = resolverImagenAtraccion(atraccion, idx);
              return (
                <div 
                  key={atraccion.id} 
                  className="atraccion-scroll-card"
                  onClick={() => navigate(`/atracciones/${atraccion.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="asc-img-wrapper">
                    <span className="asc-badge">#{idx + 1} Más vendido</span>
                    <img 
                      src={foto} 
                      alt={atraccion.nombre} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = resolverImagenAtraccion(atraccion, idx + 2);
                      }}
                    />
                    <div className="asc-info">
                      <h3 className="asc-title">{atraccion.nombre || atraccion.name || atraccion.title}</h3>
                      <div className="asc-rating">
                        <span className="score">{(Math.random() * 2 + 8).toFixed(1)}</span>
                        <span className="text">Excepcional ({Math.floor(Math.random() * 500) + 50})</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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

        {/* TU CUENTA BANNER (Solo visible para usuarios no logueados) */}
        {!user && (
          <section className="section-block">
            <h2 className="section-title">Tu cuenta, tus viajes</h2>
            <div className="account-banner">
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
          </section>
        )}

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
                onClick={() => handleTabChange(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div 
            className="explora-grid"
            style={{ 
              opacity: tabTransitioning ? 0.35 : 1, 
              transition: 'opacity 0.2s ease-in-out',
              minHeight: '220px'
            }}
          >
            {(DESTINOS_POR_PROVINCIA[tabActivo] || DESTINOS_POR_PROVINCIA['Pichincha']).map((dest, idx) => (
              <div 
                key={dest.nombre} 
                className="explora-card"
                onClick={() => navigate(`/search?destino=${encodeURIComponent(dest.nombre.split(' ')[0])}`)}
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
