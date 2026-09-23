import { useState, useEffect, useCallback } from 'react';
import { searchAutos } from '../services/autosApi';
import { AutoCard } from '../components/AutoCard';

export function AutosPage() {
  const [autos, setAutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Usamos el request genérico que pide la rúbrica (booker, currency, driver, route)
      const mockRequest = {
        booker: { country: 'EC' },
        currency: 'USD',
        driver: { age: 30 },
        route: { dropoff: {}, pickup: {} }
      };
      const result = await searchAutos(mockRequest);
      setAutos(result.data || []);
    } catch (err) {
      setError('No se pudo conectar con el servicio de Autos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <>
      <section className="hero" style={{ background: 'linear-gradient(135deg, #34a853 0%, #0d652d 100%)' }}>
        <h1>Renta de Vehículos</h1>
        <p>Encuentra el auto ideal para tu viaje al mejor precio</p>
      </section>

      <main className="main-content">
        <h2 className="section-title">Vehículos Disponibles</h2>
        <p className="section-subtitle">Catálogo híbrido (Local + API Externa)</p>

        {loading && (
          <div className="state-container">
            <div className="spinner" />
            <p className="state-title">Buscando autos...</p>
          </div>
        )}

        {!loading && error && (
          <div className="state-container">
            <div className="error-icon">⚠️</div>
            <p className="state-subtitle">{error}</p>
            <button className="retry-btn" onClick={fetchData}>Reintentar</button>
          </div>
        )}

        {!loading && !error && autos.length === 0 && (
          <div className="state-container">
            <p className="state-title">No hay autos disponibles</p>
          </div>
        )}

        {!loading && !error && autos.length > 0 && (
          <div className="atracciones-grid">
            {autos.map((a, i) => (
              <AutoCard key={a.vehicle_id || i} auto={a} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
