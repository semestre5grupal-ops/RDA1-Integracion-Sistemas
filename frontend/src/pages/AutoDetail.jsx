import { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { createOrderAuto } from '../services/autosApi';
import { v4 as uuidv4 } from 'uuid';

export function AutoDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auto = location.state?.auto || {};

  const precioDiario = auto.price || 35.5;
  const info = auto.vehicle_info || {};

  const [dias, setDias] = useState(3);
  const [driverAge, setDriverAge] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleBooking = async (e) => {
    e.preventDefault();
    if (driverAge < 18) {
       setError('El conductor debe ser mayor de edad.');
       return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    const idempotencyKey = uuidv4();
    const payload = {
      vehicle_id: id,
      dias: parseInt(dias, 10),
      driver: { age: parseInt(driverAge, 10) },
      booker: { country: 'EC', name: 'Usuario Web' }
    };

    try {
      const res = await createOrderAuto(payload, idempotencyKey);
      setSuccess(`Reserva exitosa. Order ID: ${res.order_id}`);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Error: Hubo un conflicto de idempotencia. La reserva ya fue procesada.');
      } else {
        setError(err.response?.data?.message || 'Error al procesar la reserva. Intente nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-container">
      <button className="back-btn" onClick={() => navigate('/autos')}>
        ← Volver a Autos
      </button>

      <div className="detail-content">
        <div className="detail-image-col">
          <img 
            src={auto.images && auto.images.length > 0 ? auto.images[0] : 'https://via.placeholder.com/600x400?text=Auto'} 
            alt="Auto" 
            className="detail-main-image"
            style={{ borderRadius: '12px', width: '100%', objectFit: 'cover' }}
          />
          <div style={{ marginTop: '1rem', background: '#f8f9fa', padding: '1rem', borderRadius: '8px' }}>
            <h3>Características</h3>
            <ul>
              <li><strong>Categoría:</strong> {info.category}</li>
              <li><strong>Transmisión:</strong> {info.transmission}</li>
              <li><strong>Puertas:</strong> {info.doors}</li>
              <li><strong>Combustible:</strong> {info.fuel}</li>
            </ul>
          </div>
        </div>

        <div className="detail-info-col">
          <span className="badge" style={{ background: '#34a853', color: 'white', padding: '4px 8px', borderRadius: '4px' }}>
            Disponible
          </span>
          <h1 className="detail-title">{info.category || 'Auto'} {info.type || 'Standard'}</h1>
          <p className="detail-price" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0d652d' }}>
            ${precioDiario.toFixed(2)} <span className="price-unit" style={{ fontSize: '1rem', color: '#666' }}>/ día</span>
          </p>

          <form className="booking-form" onSubmit={handleBooking} style={{ marginTop: '2rem' }}>
            <h3 className="form-title">Reserva tu Vehículo</h3>
            
            <div className="form-group">
              <label>Días de renta:</label>
              <input 
                type="number" 
                min="1" 
                max="30" 
                value={dias} 
                onChange={(e) => setDias(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Edad del Conductor:</label>
              <input 
                type="number" 
                min="18" 
                max="99" 
                value={driverAge} 
                onChange={(e) => setDriverAge(e.target.value)}
                required
              />
            </div>

            <div className="total-calculation" style={{ margin: '1rem 0', padding: '1rem', background: '#e8f5e9', borderRadius: '8px' }}>
              <div className="calc-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Tarifa Diaria x {dias} días</span>
                <span>${(precioDiario * dias).toFixed(2)}</span>
              </div>
              <div className="calc-row total" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
                <span>Total a Pagar</span>
                <span style={{ fontSize: '1.2rem', color: '#0d652d' }}>${(precioDiario * dias).toFixed(2)}</span>
              </div>
            </div>

            {error && <div className="alert error" style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
            {success && <div className="alert success" style={{ color: 'green', marginBottom: '1rem' }}>{success}</div>}

            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', background: '#0d652d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              {loading ? 'Procesando Pago Síncrono...' : 'Confirmar Reserva (Pago Síncrono)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
