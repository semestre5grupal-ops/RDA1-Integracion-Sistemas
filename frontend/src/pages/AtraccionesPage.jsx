import { useState, useEffect, useCallback } from 'react';
import { getAtracciones } from '../services/atraccionesApi';
import { AtraccionCard } from '../components/AtraccionCard';

const FILTERS = ['Todas', 'Museos', 'Parques', 'Tours', 'Aventura', 'Cultural'];

export function AtraccionesPage() {
  const [atracciones, setAtracciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('Todas');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(3);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAtracciones({ page, limit: 9 });
      const items = result.data || result;
      setAtracciones(Array.isArray(items) ? items : []);
      if (result.meta?.total) {
        setTotalPages(Math.ceil(result.meta.total / 9));
      }
    } catch (err) {
      setError('No se pudo conectar con el servicio de Atracciones. Verifica que el backend esté corriendo.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const atraccionesFiltradas = atracciones.filter((a) => {
    const nombre = (a.nombre || a.name || a.title || '').toLowerCase();
    return nombre.includes(busqueda.toLowerCase());
  });

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <h1>Descubre las mejores Atracciones</h1>
        <p>Museos, parques, tours y mucho más en un solo lugar</p>
        <div className="search-box">
          <div className="search-input-group">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="¿Qué atracción buscas?"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <button className="search-btn" onClick={fetchData}>Buscar</button>
        </div>
      </section>

      {/* CONTENIDO */}
      <main className="main-content">
        <h2 className="section-title">Atracciones disponibles</h2>
        <p className="section-subtitle">
          Información obtenida en tiempo real desde el servicio de Atracciones (Híbrido)
        </p>

        {/* FILTROS */}
        <div className="filters-row">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-chip ${filtroActivo === f ? 'active' : ''}`}
              onClick={() => setFiltroActivo(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="state-container">
            <div className="spinner" />
            <p className="state-title">Cargando atracciones...</p>
            <p className="state-subtitle">Conectando con el servicio externo y local</p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="state-container">
            <div className="error-icon">⚠️</div>
            <p className="state-title">Servicio no disponible</p>
            <p className="state-subtitle">{error}</p>
            <button className="retry-btn" onClick={fetchData}>Reintentar</button>
          </div>
        )}

        {/* GRID */}
        {!loading && !error && (
          <>
            {atraccionesFiltradas.length === 0 ? (
              <div className="state-container">
                <div className="error-icon">🔍</div>
                <p className="state-title">Sin resultados</p>
                <p className="state-subtitle">No se encontraron atracciones con ese nombre.</p>
              </div>
            ) : (
              <div className="atracciones-grid">
                {atraccionesFiltradas.map((a, i) => (
                  <AtraccionCard key={a.id || i} atraccion={a} />
                ))}
              </div>
            )}

            {/* PAGINACIÓN */}
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  ‹
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`page-btn ${page === n ? 'active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
