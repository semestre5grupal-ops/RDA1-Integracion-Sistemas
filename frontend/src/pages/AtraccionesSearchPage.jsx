import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getAtracciones } from '../services/atraccionesApi';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { formatearMoneda } from '../services/formato';

export function AtraccionesSearchPage() {
  const [searchParams] = useSearchParams();
  const destinoOriginal = searchParams.get('destino') || '';
  
  const [busqueda, setBusqueda] = useState(destinoOriginal);
  const [atracciones, setAtracciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState([null, null]);
  const [startDate, endDate] = dateRange;
  
  // Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 5; // Tarjetas horizontales, mostramos 5 por página para demo

  const fetchData = useCallback(async (currentPage, query) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAtracciones({ page: currentPage, limit });
      let items = result.data || result;
      if (!Array.isArray(items)) items = [];
      
      // Filtro local simulado si hay query (ya que la API de mock no siempre filtra)
      if (query) {
        items = items.filter(a => (a.name || '').toLowerCase().includes(query.toLowerCase()));
      }
      
      setAtracciones(items);
      if (result.meta?.total) {
        setTotalPages(Math.ceil(result.meta.total / limit));
      } else {
        setTotalPages(3); // Mock
      }
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
          <div className="search-input-group">
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
          <div className="search-input-group date-group">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onChange={(update) => setDateRange(update)}
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
      </div>

      <div className="breadcrumb-nav">
        <span>Inicio</span> {'>'} <span>Ecuador</span> {'>'} <span>Quito</span> {'>'} <strong>{busqueda || 'Todas'}</strong>
      </div>

      <div className="search-page-layout">
        
        {/* SIDEBAR DE FILTROS (STICKY) */}
        <aside className="search-sidebar">
          <div className="sidebar-box">
            <h3>Filtrar por:</h3>
            
            <div className="filter-group">
              <h4>Categoría</h4>
              <label><input type="checkbox" /> Tours</label>
              <label><input type="checkbox" /> Museos, arte y cultura</label>
              <label><input type="checkbox" /> Naturaleza y aire libre</label>
              <label><input type="checkbox" /> Comida y bebida</label>
            </div>

            <div className="filter-group">
              <h4>Ver resultados con</h4>
              <label><input type="checkbox" /> Cancelación gratis</label>
              <label><input type="checkbox" /> Accesible silla de ruedas</label>
            </div>

            <div className="filter-group">
              <h4>Calificación de los comentarios ℹ️</h4>
              <label><input type="checkbox" /> 9 y más</label>
              <label><input type="checkbox" /> 8 y más</label>
              <label><input type="checkbox" /> 7 y más</label>
            </div>

            <div className="filter-group">
              <h4>Horario</h4>
              <label>
                <input type="checkbox" /> 
                <div>
                  <strong>Mañana</strong><br/>
                  <span>Empieza antes de las 12:00 p.m.</span>
                </div>
              </label>
              <label>
                <input type="checkbox" /> 
                <div>
                  <strong>Tarde</strong><br/>
                  <span>Empieza después de las 12:00 p.m.</span>
                </div>
              </label>
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL (RESULTADOS) */}
        <main className="search-results-area">
          <h1 className="search-results-title">Atracciones: {busqueda || 'Ecuador'}</h1>
          
          <div className="sort-tabs">
            <button className="active">Nuestros favoritos</button>
            <button>Precio más bajo</button>
            <button>Mejores comentarios</button>
          </div>

          {loading && <div className="spinner"></div>}
          {!loading && error && <p style={{color: 'red'}}>{error}</p>}
          
          {!loading && !error && (
            <div className="search-results-list">
              {atracciones.map((a, idx) => {
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
