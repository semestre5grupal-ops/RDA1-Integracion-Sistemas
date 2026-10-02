import { useNavigate } from 'react-router-dom';

export function AlojamientoCard({ alojamiento }) {
  const navigate = useNavigate();
  const id = alojamiento.id;

  const precio = parseFloat(alojamiento.precioPorNoche || alojamiento.price?.total || alojamiento.price || 120);
  const ratingScore = alojamiento.ratings?.score || (8.5 + (Math.abs(String(id).charCodeAt(0) || 5) % 15) / 10).toFixed(1);
  const reviewCount = alojamiento.ratings?.number_of_reviews || (120 + (Math.abs(String(id).charCodeAt(1) || 3) * 7));

  const foto = alojamiento.photos?.[0]?.url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600';

  return (
    <div className="card" onClick={() => navigate(`/alojamientos/${id}`)}>
      <div className="card-img-wrapper" style={{ height: '180px', overflow: 'hidden' }}>
        <img
          src={foto}
          alt={alojamiento.nombre}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <span className="card-badge" style={{ background: '#003580', color: '#fff' }}>
          🏨 {alojamiento.destino || 'Destino'}
        </span>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <h3 className="card-title" style={{ fontSize: '1.1rem', color: '#003580' }}>
            {alojamiento.nombre}
          </h3>
          <div style={{
            background: '#003580',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            padding: '4px 7px',
            borderRadius: '4px 4px 4px 0',
            minWidth: '32px',
            textAlign: 'center'
          }}>
            {ratingScore}
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '4px 0' }}>
          📍 {alojamiento.destino} • <span style={{ color: '#0071c2', fontWeight: 500 }}>Mostrar en el mapa</span>
        </p>

        <p className="card-desc" style={{ WebkitLineClamp: 2, margin: '6px 0 10px' }}>
          {alojamiento.descripcion || `Estupendo hotel con habitaciones climatizadas, ${alojamiento.habitaciones || 1} dormitorio(s) y excelente ubicación.`}
        </p>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {alojamiento.tienePiscina && (
            <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              🏊 Piscina
            </span>
          )}
          <span style={{ fontSize: '0.75rem', background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '12px' }}>
            👥 {alojamiento.capacidadAdultos || 2} Adultos
          </span>
          {alojamiento.capacidadNinos > 0 && (
            <span style={{ fontSize: '0.75rem', background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: '12px' }}>
              🧒 {alojamiento.capacidadNinos} Niños
            </span>
          )}
          <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
            ✓ Cancelación flexible
          </span>
        </div>

        <div className="card-footer" style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
          <div className="card-price">
            ${precio.toFixed(2)}
            <span> / noche</span>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 400 }}>+ impuestos y cargos</div>
          </div>
          <button
            className="card-btn"
            style={{ background: '#0071c2', color: '#fff' }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/alojamientos/${id}`);
            }}
          >
            Ver Disponibilidad
          </button>
        </div>
      </div>
    </div>
  );
}
