import { useNavigate } from 'react-router-dom';

export function AutoCard({ auto }) {
  const navigate = useNavigate();
  const id = auto.vehicle_id;
  const precio = auto.price || 0;
  const info = auto.vehicle_info || {};

  return (
    <div className="card" onClick={() => navigate(`/autos/${id}`)} style={{ cursor: 'pointer' }}>
      <div className="card-img-wrapper" style={{ overflow: 'hidden' }}>
        <img 
          src={auto.images && auto.images.length > 0 ? auto.images[0] : 'https://via.placeholder.com/300x150?text=Auto'} 
          alt="Car"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <span className="card-badge" style={{ background: '#34a853' }}>Rent a Car</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{info.category || 'Auto'} {info.type || 'Standard'}</h3>
        <p className="card-desc" style={{ fontSize: '0.9rem', color: '#555' }}>
          Transmisión: {info.transmission || 'N/A'}<br/>
          Puertas: {info.doors || '?'} | Asientos: {info.seats || '?'}
        </p>
        <div className="card-footer">
          <div className="card-price">
            ${precio.toFixed(2)}
            <span> / día</span>
          </div>
          <button
            className="card-btn"
            onClick={(e) => { e.stopPropagation(); navigate(`/autos/${id}`, { state: { auto } }); }}
          >
            Reservar
          </button>
        </div>
      </div>
    </div>
  );
}
