import { useNavigate } from 'react-router-dom';

const EMOJIS = ['🏛️', '🎡', '🗺️', '🎭', '🏖️', '🌋', '🎠', '🏕️', '🎪', '🗽'];

export function AtraccionCard({ atraccion }) {
  const navigate = useNavigate();
  const id = atraccion.id;
  
  // Si es un string normal o numérico, intentamos un hash simple para el emoji
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) hash += String(id).charCodeAt(i);
  const emoji = EMOJIS[hash % EMOJIS.length] || '🎡';
  
  const precio = parseFloat(atraccion.precio_unitario || atraccion.price?.total || atraccion.precioTicket || 0);

  return (
    <div className="card" onClick={() => navigate(`/atracciones/${id}`)}>
      <div className="card-img-wrapper">
        <div className="card-img">{emoji}</div>
        <span className="card-badge">Atracción</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{atraccion.nombre || atraccion.name || 'Sin nombre'}</h3>
        <p className="card-desc">
          {atraccion.descripcion || atraccion.long_description || 'Sin descripción disponible.'}
        </p>
        <div className="card-footer">
          <div className="card-price">
            ${precio.toFixed(2)}
            <span> / persona</span>
          </div>
          <button
            className="card-btn"
            onClick={(e) => { e.stopPropagation(); navigate(`/atracciones/${id}`); }}
          >
            Ver Detalles
          </button>
        </div>
      </div>
    </div>
  );
}
