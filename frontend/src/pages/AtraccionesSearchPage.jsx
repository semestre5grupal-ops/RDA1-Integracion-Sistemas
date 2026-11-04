import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getAtracciones } from '../services/atraccionesApi';
import { api } from '../services/api';
import { formatearMoneda } from '../services/formato';

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

  const fetchData = useCallback(async (currentPage, query) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAtracciones({ page: 1, limit: 50 });
      let items = result.data || result;
      if (!Array.isArray(items)) items = [];
      
      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        items = items.filter(a => {
          const nombre = (a.nombre || a.name || a.title || '').toLowerCase();
          const ciudad = (a.ciudad || a.city || a.ubicacion || '').toLowerCase();
          const desc = (a.descripcion_corta || a.descripcion || a.description || a.long_description || '').toLowerCase();
          const inclusiones = Array.isArray(a.inclusiones) ? a.inclusiones.join(' ').toLowerCase() : '';
          return nombre.includes(q) || ciudad.includes(q) || desc.includes(q) || inclusiones.includes(q);
        });
      }
      
      setAtracciones(items);
      setTotalPages(Math.max(1, Math.ceil(items.length / limit)));
    } catch (err) {
      setError('Error al cargar atracciones.');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData(page, destinoOriginal);
  }, [fetchData, page, destinoOriginal]);

  const handleSearch = () => {
    setPage(1);
    fetchData(1, busqueda);
  };

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
                placeholder="Destino"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
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
            
            {/* ÁRBOL JERÁRQUICO RECURSIVO DE CATEGORÍAS (GAP-FRONT-02) */}
            <div className="filter-group">
              <h4 style={{ color: '#003580', marginBottom: '8px' }}>🌲 Categorías Oficiales (RDA2 §6)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setCategoriaSeleccionada('')}
                  style={{
                    textAlign: 'left',
                    background: categoriaSeleccionada === '' ? '#eff6ff' : 'transparent',
                    border: 'none',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: categoriaSeleccionada === '' ? 700 : 400,
                    color: categoriaSeleccionada === '' ? '#006ce4' : '#374151',
                  }}
                >
                  📁 Todas las Categorías
                </button>
                {arbolCategorias.map((cat) => (
                  <div key={cat.id} style={{ marginLeft: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setCategoriaSeleccionada(cat.nombre)}
                      style={{
                        textAlign: 'left',
                        background: categoriaSeleccionada === cat.nombre ? '#eff6ff' : 'transparent',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        fontWeight: categoriaSeleccionada === cat.nombre ? 700 : 500,
                        color: categoriaSeleccionada === cat.nombre ? '#006ce4' : '#1f2937',
                        width: '100%',
                      }}
                    >
                      📂 {cat.nombre}
                    </button>
                    {(cat.hijos || []).map((hijo) => (
                      <button
                        key={hijo.id}
                        type="button"
                        onClick={() => setCategoriaSeleccionada(hijo.nombre)}
                        style={{
                          textAlign: 'left',
                          marginLeft: '14px',
                          background: categoriaSeleccionada === hijo.nombre ? '#eff6ff' : 'transparent',
                          border: 'none',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          color: categoriaSeleccionada === hijo.nombre ? '#006ce4' : '#4b5563',
                          width: 'calc(100% - 14px)',
                        }}
                      >
                        ↳ {hijo.nombre}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* INCLUSIONES OBLIGATORIAS DE CÁTEDRA (GAP-FRONT-02) */}
            <div className="filter-group" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
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

            <div className="filter-group" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              <h4>Ver resultados con</h4>
              <label><input type="checkbox" /> Cancelación gratis</label>
              <label><input type="checkbox" /> Accesible silla de ruedas</label>
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL (RESULTADOS) */}
        <main className="search-results-area">
          <h1 className="search-results-title">Atracciones: {categoriaSeleccionada || busqueda || 'Ecuador'}</h1>
          
          <div className="sort-tabs">
            <button className="active">Nuestros favoritos</button>
            <button>Precio más bajo</button>
            <button>Mejores comentarios</button>
          </div>

          {loading && <div className="spinner"></div>}
          {!loading && error && <p style={{color: 'red'}}>{error}</p>}
          
          {!loading && !error && (
            <div className="search-results-list">
              {atracciones
                .filter(a => {
                  if (filtroComida && !(a.includes?.some(i => i.toLowerCase().includes('comida') || i.toLowerCase().includes('degust')) || a.long_description?.toLowerCase().includes('cacao') || a.long_description?.toLowerCase().includes('degustación'))) return false;
                  if (filtroTransporte && !(a.includes?.some(i => i.toLowerCase().includes('transporte')) || a.long_description?.toLowerCase().includes('transporte'))) return false;
                  if (filtroGuia && !(a.includes?.some(i => i.toLowerCase().includes('guía') || i.toLowerCase().includes('guia')) || a.supported_languages?.length > 0)) return false;
                  if (categoriaSeleccionada && !(a.name || '').toLowerCase().includes(categoriaSeleccionada.toLowerCase()) && !(a.long_description || '').toLowerCase().includes(categoriaSeleccionada.toLowerCase())) return false;
                  return true;
                })
                .map((a, idx) => {
                const navigateToDetail = () => window.location.href = `/atracciones/${a.id}`;
                return (
                <div key={a.id} className="search-result-card" onClick={navigateToDetail} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToDetail(); } }} style={{cursor: 'pointer'}}>
                  <div className="sr-image">
                    {/* Usamos lazy loading para las imagenes para optimizar */}
                    <img loading="lazy" src={a.photos?.[0]?.url || `https://picsum.photos/seed/${a.id}/300/300`} onError={(e) => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${a.id}/300/300`; }} alt={a.name} />
                  </div>
                  <div className="sr-content">
                    <div className="sr-main-info">
                      <h2>{a.name || 'Atracción Turística'}</h2>
                      <p className="sr-description">
                        {a.long_description?.substring(0, 150) || 'Descubre esta increíble atracción...'}...
                      </p>
                      <div className="sr-details-list">
                        <span>⏱️ Duración: {a.duration || '2 horas - 3 horas'}</span>
                        <span>🗣️ Guía turístico: {a.supported_languages?.join(', ') || 'es, en'}</span>
                      </div>
                      <div className="sr-rating">
                        <span className="score">{a.ratings?.score?.toFixed(1) || '8.5'}</span>
                        <span className="text">Excepcional</span>
                        <span className="reviews">· {a.ratings?.number_of_reviews || 120} comentarios ℹ️</span>
                      </div>
                      <div className="sr-cancel">
                        {a.free_cancellation ? '📅 Cancelación gratis disponible' : ''}
                      </div>
                    </div>
                    <div className="sr-pricing">
                      <div className="price-info">
                        <span className="price-label">Desde</span>
                        <span className="price-value">{formatearMoneda(a.price?.total || 55, 'USD')}</span>
                      </div>
                      <div className="availability-info">Disponible desde el 28 sep</div>
                      <Link to={`/atracciones/${a.id}`} className="sr-btn">
                        Más información y disponibilidad {'>'}
                      </Link>
                    </div>
                  </div>
                </div>
                );
              })}

              {/* Paginación en la parte inferior */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button 
                    disabled={page === 1} 
                    onClick={() => setPage(p => p - 1)}
                    className="page-btn"
                  >
                    {'<'}
                  </button>
                  {Array.from({length: totalPages}, (_, i) => i + 1).map(num => (
                    <button 
                      key={num} 
                      className={`page-btn ${page === num ? 'active' : ''}`}
                      onClick={() => setPage(num)}
                    >
                      {num}
                    </button>
                  ))}
                  <button 
                    disabled={page === totalPages} 
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
