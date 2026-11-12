import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getAtracciones } from '../services/atraccionesApi';
import { api } from '../services/api';
import { formatearMoneda } from '../services/formato';
import { AtraccionesLoadingView } from '../components/AtraccionesLoadingView';
import { resolverImagenAtraccion } from '../utils/atraccionImagenes';

export function AtraccionesSearchPage() {
  const [searchParams] = useSearchParams();
  const destinoOriginal = searchParams.get('destino') || '';
  
  const [busqueda, setBusqueda] = useState(destinoOriginal);
  const [atracciones, setAtracciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
    
  // Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 5;

  // Filtros obligatorios de Cátedra RDA2 (§6 - GAP-FRONT-02)
  const [arbolCategorias, setArbolCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const [filtroComida, setFiltroComida] = useState(false);
  const [filtroTransporte, setFiltroTransporte] = useState(false);
  const [filtroGuia, setFiltroGuia] = useState(false);
  const [criterioOrden, setCriterioOrden] = useState('favoritos'); // 'favoritos' | 'precio_bajo' | 'mejores_comentarios'

  useEffect(() => {
    async function fetchArbol() {
      try {
        const res = await api.get('/atracciones/categorias/arbol');
        setArbolCategorias(Array.isArray(res) ? res : res.data || []);
      } catch (e) {
        setArbolCategorias([
          { id: 'cat-1', nombre: 'Aventura y Montaña', hijos: [{ id: 'sub-1', nombre: 'Volcanes Cotopaxi / Chimborazo' }] },
          { id: 'cat-2', nombre: 'Patrimonio Cultural', hijos: [{ id: 'sub-2', nombre: 'Centro Histórico Colonial' }] },
          { id: 'cat-3', nombre: 'Naturaleza y Selva', hijos: [{ id: 'sub-3', nombre: 'Tours Baños / Amazonía' }] },
        ]);
      }
    }
    fetchArbol();
  }, []);

  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (query, isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await getAtracciones({ page: 1, limit: 100 });
      let items = result.data || result;
      if (!Array.isArray(items)) items = [];
      setAtracciones((prev) => {
        if (prev && prev.length === items.length) {
          let hasDiff = false;
          for (let i = 0; i < items.length; i++) {
            const p = prev[i];
            const n = items[i];
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
        return items;
      });
      if (isSilent) setError(null);
    } catch (err) {
      console.warn('[AtraccionesSearchPage] Error transitorio en refresco silencioso:', err?.message || err);
      if (!isSilent) {
        setError('Error al cargar atracciones.');
      }
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, []);

  // Polling silencioso en segundo plano cada 8 segundos
  useEffect(() => {
    let timer = null;
    let isCancelled = false;

    const runPoll = async (silent) => {
      if (isCancelled) return;
      await fetchData(destinoOriginal, silent);
      if (!isCancelled) {
        timer = setTimeout(() => runPoll(true), 8000);
      }
    };

    runPoll(false);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchData, destinoOriginal]);

  const handleSearch = () => {
    setPage(1);
    fetchData(busqueda);
  };

  // Filtrado reactivo integral (Búsqueda por texto + filtros laterales RDA2)
  const filteredItems = atracciones.filter((a) => {
    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      const nombre = (a.nombre || a.name || a.title || '').toLowerCase();
      const ciudad = (a.ciudad || a.city || a.ubicacion || '').toLowerCase();
      const desc = (a.descripcion_corta || a.descripcion || a.description || a.long_description || '').toLowerCase();
      const inclusiones = Array.isArray(a.inclusiones) ? a.inclusiones.join(' ').toLowerCase() : '';
      const matchesSearch = nombre.includes(q) || ciudad.includes(q) || desc.includes(q) || inclusiones.includes(q);
      if (!matchesSearch) return false;
    }

    if (filtroComida && !(a.includes?.some(i => i.toLowerCase().includes('comida') || i.toLowerCase().includes('degust')) || a.long_description?.toLowerCase().includes('cacao') || a.long_description?.toLowerCase().includes('degustación'))) return false;
    if (filtroTransporte && !(a.includes?.some(i => i.toLowerCase().includes('transporte')) || a.long_description?.toLowerCase().includes('transporte'))) return false;
    if (filtroGuia && !(a.includes?.some(i => i.toLowerCase().includes('guía') || i.toLowerCase().includes('guia')) || a.supported_languages?.length > 0)) return false;
    if (categoriaSeleccionada && !(a.name || a.nombre || '').toLowerCase().includes(categoriaSeleccionada.toLowerCase()) && !(a.long_description || a.descripcion || '').toLowerCase().includes(categoriaSeleccionada.toLowerCase())) return false;
    return true;
  });

  // Ordenamiento interactivo por tabs
  const sortedItems = [...filteredItems].sort((a, b) => {
    const getPrecio = (item) => {
      if (typeof item.price === 'object' && item.price !== null) {
        return Number(item.price.total || item.price.adult || item.price.amount || 0);
      }
      if (typeof item.precio === 'object' && item.precio !== null) {
        return Number(item.precio.total || item.precio.adulto || item.precio.amount || 0);
      }
      return Number(item.precio_unitario_adulto || item.precio || 0);
    };

    const getScore = (item) => {
      const scoreObj = item.rating || item.calificacion || item.ratings;
      if (typeof scoreObj === 'object' && scoreObj !== null) {
        return Number(scoreObj.score || scoreObj.rating || scoreObj.general || 0);
      }
      return Number(item.rating_general || item.rating || 0);
    };

    if (criterioOrden === 'precio_bajo') {
      return getPrecio(a) - getPrecio(b);
    }
    if (criterioOrden === 'mejores_comentarios') {
      return getScore(b) - getScore(a);
    }
    // 'favoritos' por defecto: prioridad por mayor rating y reviews
    const reviewsA = Number(a.reviews_count || a.ratings?.number_of_reviews || 0);
    const reviewsB = Number(b.reviews_count || b.ratings?.number_of_reviews || 0);
    return getScore(b) - getScore(a) || reviewsB - reviewsA;
  });

  const totalCalculatedPages = Math.max(1, Math.ceil(sortedItems.length / limit));
  const displayedItems = sortedItems.slice((page - 1) * limit, page * limit);

  if (loading && atracciones.length === 0) {
    return <AtraccionesLoadingView titulo={`Buscando ofertas y experiencias en ${busqueda || 'Ecuador'}...`} />;
  }

  return (
    <div className="search-page-wrapper">
      {/* HEADER BUSCADOR REDUCIDO */}
      <div className="search-header-compact">
        <div className="search-box compact-box">
          <div className="search-input-group" style={{ flex: 1 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <div className="input-text-wrapper">
              <input
                type="text"
                placeholder="Buscar por nombre de atracción o ciudad..."
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          
          <button className="search-btn" onClick={handleSearch}>Buscar</button>
        </div>
      </div>

      <div className="breadcrumb-nav">
        <span>Inicio</span> {'>'} <span>Ecuador</span> {'>'} <span>Quito</span> {'>'} <strong>{busqueda || 'Todas'}</strong>
      </div>

      <div className="search-page-layout">
        
        {/* SIDEBAR DE FILTROS (STICKY) */}
        <aside className="search-sidebar">
          <div className="sidebar-box">
            <h3>Filtrar por:</h3>
            
            {/* INCLUSIONES OBLIGATORIAS DE CÁTEDRA (GAP-FRONT-02) */}
            <div className="filter-group">
              <h4 style={{ color: '#047857', marginBottom: '8px' }}>✨ Inclusiones del Servicio</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={filtroComida} onChange={(e) => setFiltroComida(e.target.checked)} />
                🍴 Incluye Alimentos / Degustación
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={filtroTransporte} onChange={(e) => setFiltroTransporte(e.target.checked)} />
                🚌 Incluye Transporte / Recogida
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={filtroGuia} onChange={(e) => setFiltroGuia(e.target.checked)} />
                🧭 Guía Oficial Certificado
              </label>
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL (RESULTADOS) */}
        <main className="search-results-area">
          <h1 className="search-results-title">Atracciones: {categoriaSeleccionada || busqueda || 'Ecuador'}</h1>
          
          <div className="sort-tabs">
            <button
              type="button"
              className={criterioOrden === 'favoritos' ? 'active' : ''}
              onClick={() => { setCriterioOrden('favoritos'); setPage(1); }}
            >
              Nuestros favoritos
            </button>
            <button
              type="button"
              className={criterioOrden === 'precio_bajo' ? 'active' : ''}
              onClick={() => { setCriterioOrden('precio_bajo'); setPage(1); }}
            >
              Precio más bajo
            </button>
            <button
              type="button"
              className={criterioOrden === 'mejores_comentarios' ? 'active' : ''}
              onClick={() => { setCriterioOrden('mejores_comentarios'); setPage(1); }}
            >
              Mejores comentarios
            </button>
          </div>

          {loading && <div className="spinner"></div>}
          {!loading && error && <p style={{color: 'red'}}>{error}</p>}
          
          {!loading && !error && (
            <div className="search-results-list">
              {displayedItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151' }}>No se encontraron atracciones para tu búsqueda</p>
                  <p style={{ color: '#6b7280', marginTop: '4px' }}>Intenta buscando otra palabra clave, ciudad o limpiando los filtros.</p>
                </div>
              ) : (
                displayedItems.map((a, idx) => {
                  const navigateToDetail = () => window.location.href = `/atracciones/${a.id}`;
                  const fotoIndex = idx + (page - 1) * limit;
                  const fotoUrl = resolverImagenAtraccion(a, fotoIndex);
                  return (
                    <div key={a.id} className="search-result-card" onClick={navigateToDetail} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToDetail(); } }} style={{cursor: 'pointer'}}>
                      <div className="sr-image">
                        <img 
                          loading="lazy" 
                          src={fotoUrl} 
                          onError={(e) => { 
                            e.target.onerror = null; 
                            e.target.src = resolverImagenAtraccion(a, fotoIndex + 3); 
                          }} 
                          alt={a.name || a.nombre} 
                        />
                      </div>
                      <div className="sr-content">
                        <div className="sr-main-info">
                          <h2>{a.name || a.nombre || 'Atracción Turística'}</h2>
                          <p className="sr-description">
                            {(a.long_description || a.descripcion || a.descripcion_larga || a.descripcion_corta || 'Descubre esta increíble atracción...').substring(0, 150)}...
                          </p>
                          <div className="sr-details-list">
                            <span>⏱️ Duración: {a.duration || a.duracion_estimada || '2 horas - 3 horas'}</span>
                            <span>📍 Ciudad: {a.ciudad || a.city || 'Quito'}</span>
                          </div>
                          <div className="sr-rating">
                            <span className="score">{a.ratings?.score?.toFixed(1) || '8.5'}</span>
                            <span className="text">Excepcional</span>
                            <span className="reviews">· {a.ratings?.number_of_reviews || 120} comentarios ℹ️</span>
                          </div>
                          <div className="sr-cancel">
                            {a.free_cancellation || a.cancelacion_gratis ? '📅 Cancelación gratis disponible' : ''}
                          </div>
                        </div>
                        <div className="sr-pricing">
                          <div className="price-info">
                            <span className="price-label">Desde</span>
                            <span className="price-value">{formatearMoneda(a.price?.total || a.precio_unitario_adulto || 55, 'USD')}</span>
                          </div>
                          <div className="availability-info">Disponible hoy</div>
                          <Link to={`/atracciones/${a.id}`} className="sr-btn">
                            Más información y disponibilidad {'>'}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Paginación en la parte inferior */}
              {totalCalculatedPages > 1 && (
                <div className="pagination">
                  <button 
                    disabled={page === 1} 
                    onClick={() => setPage(p => p - 1)}
                    className="page-btn"
                  >
                    {'<'}
                  </button>
                  {Array.from({length: totalCalculatedPages}, (_, i) => i + 1).map(num => (
                    <button 
                      key={num} 
                      className={`page-btn ${page === num ? 'active' : ''}`}
                      onClick={() => setPage(num)}
                    >
                      {num}
                    </button>
                  ))}
                  <button 
                    disabled={page === totalCalculatedPages} 
                    onClick={() => setPage(p => p + 1)}
                    className="page-btn"
                  >
                    {'>'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
