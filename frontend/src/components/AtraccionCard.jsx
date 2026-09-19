const EMOJIS = ['🏛️', '🎡', '🗺️', '🎭', '🏖️', '🌋', '🎠', '🏕️', '🎪', '🗽'];

export function AtraccionCard({ atraccion, onVerDetalle }) {
  const emoji = EMOJIS[parseInt(atraccion.id) % EMOJIS.length] || '🎡';
  const precio = parseFloat(atraccion.precio_unitario || atraccion.precio || 0);

  return (
    <div className="card" onClick={() => onVerDetalle(atraccion)}>
      <div className="card-img-wrapper">
        <div className="card-img">{emoji}</div>
        <span className="card-badge">Atracción</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{atraccion.nombre || atraccion.title || 'Sin nombre'}</h3>
        <p className="card-desc">
          {atraccion.descripcion || atraccion.body || 'Sin descripción disponible.'}
        </p>
        <div className="card-footer">
          <div className="card-price">
            ${precio.toFixed(2)}
            <span> / persona</span>
          </div>
          <button
            className="card-btn"
            onClick={(e) => { e.stopPropagation(); onVerDetalle(atraccion); }}
          >
            Ver más
          </button>
        </div>
      </div>
    </div>
  );
}
