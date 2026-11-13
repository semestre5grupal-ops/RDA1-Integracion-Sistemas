import { useNavigate } from 'react-router-dom';

export function AutoCard({ auto, dias = 3, startDate, endDate, pickupLocation }) {
  const navigate = useNavigate();
  const id = auto.vehicle_id || auto.id || 'auto-spark-01';
  const precioDiario = auto.precio_diario || auto.price || 35.50;
  const precioTotal = (precioDiario * dias).toFixed(2);
  const make = auto.marca || auto.make || (id === 'auto-047' ? 'Prueba2AutoSpot' : 'Chevrolet');
  const model = auto.modelo || auto.model || (id === 'auto-047' ? 'Prueba2AutoSpot' : 'Spark GT');
  const carDisplayName = make === model || (model && model.toLowerCase().includes(make.toLowerCase()))
    ? model
    : `${make} ${model}`.trim();
  const categoria = auto.categoria || auto.category || 'Económico';
  const seats = auto.asientos || auto.seats || 5;
  const doors = auto.puertas || auto.doors || 4;
  const bag_capacity = auto.maletas_grandes || auto.bag_capacity || 1;
  const transmission = auto.transmision || auto.transmission || 'Manual';
  const supplierId = auto.proveedor_id || auto.supplier_id || 1;

  // Mapa de proveedores alineado al diseño oficial de Booking.com
  const suppliersMap = {
    1: { bg: '#00843D', color: 'white', label: auto.proveedor?.nombre || 'Europcar', score: auto.proveedor?.rating || '8.4', scoreText: 'Muy bien', reviews: '320+' },
    2: { bg: '#00266b', color: '#ffb700', label: auto.proveedor?.nombre || 'Alamo', score: auto.proveedor?.rating || '8.6', scoreText: 'Excelente', reviews: '450+' },
    3: { bg: '#006600', color: 'white', label: auto.proveedor?.nombre || 'Enterprise', score: auto.proveedor?.rating || '9.1', scoreText: 'Excepcional', reviews: '800+' }
  };
  const supplierInfo = suppliersMap[supplierId] || suppliersMap[1];

  const handleSelect = () => {
    navigate(`/autos/${id}`, {
      state: {
        auto: {
          ...auto,
          price: precioDiario,
          make,
          model,
          seats,
          doors,
          bag_capacity,
          transmission,
          dias,
          startDate,
          endDate,
          pickupLocation
        }
      }
    });
  };

  return (
    <div 
      onClick={handleSelect} 
      tabIndex={0} 
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(); } }} 
      style={{ 
        border: '1px solid #e7e7e7', 
        borderRadius: '8px', 
        padding: '18px', 
        display: 'flex', 
        background: 'white', 
        marginBottom: '16px', 
        cursor: 'pointer', 
        transition: 'transform 0.2s, box-shadow 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }} 
      onMouseOver={e => {
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }} 
      onMouseOut={e => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Left: Car image & Supplier */}
      <div style={{ width: '240px', paddingRight: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative' }}>
          <img 
            src={auto.images && auto.images.length > 0 ? auto.images[0] : (auto.foto_url || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80')} 
            alt={carDisplayName}
            style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '6px' }}
          />
          <span style={{ 
            position: 'absolute', 
            top: '8px', 
            left: '8px', 
            background: 'rgba(0,0,0,0.75)', 
            color: 'white', 
            padding: '3px 8px', 
            borderRadius: '4px', 
            fontSize: '0.75rem', 
            fontWeight: '600',
            textTransform: 'uppercase'
          }}>
            {categoria}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
          <div style={{ background: supplierInfo.bg, color: supplierInfo.color, padding: '4px 8px', borderRadius: '3px', fontWeight: 'bold', fontSize: '0.8rem' }}>
            {supplierInfo.label}
          </div>
          <div style={{ background: '#003b95', color: 'white', padding: '4px 7px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem' }}>
            {supplierInfo.score}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#444', lineHeight: '1.2' }}>
            <b>{supplierInfo.scoreText}</b><br/>
            <span style={{ color: '#777' }}>{supplierInfo.reviews}</span>
          </div>
        </div>
      </div>
      
      {/* Center: Details & Badges */}
      <div style={{ flex: 1, paddingRight: '15px' }}>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 10px 0' }}>
          {carDisplayName}{' '}
          <span style={{ fontSize: '0.85rem', color: '#006ce4', fontWeight: 'normal', cursor: 'pointer' }}>
            o similar ℹ️
          </span>
        </h3>

        {/* Technical Specs with Emojis */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.88rem', color: '#444', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> {seats} plazas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚙️</span> {transmission}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧳</span> {bag_capacity} maleta grande
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚪</span> {doors} puertas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>❄️</span> Aire acondicionado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛣️</span> Kilometraje ilimitado
          </div>
        </div>

        {/* Transparency Badges (Booking.com style) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          <span style={{ background: '#e6f4ea', color: '#137333', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>
            ✓ Cancelación gratis (hasta 48h)
          </span>
          <span style={{ background: '#e8f0fe', color: '#1a73e8', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>
            ⛽ Lleno a lleno
          </span>
          <span style={{ background: '#fef7e0', color: '#b06000', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold' }}>
            ⭐ Mostrador en terminal
          </span>
        </div>

        <div style={{ color: '#006ce4', fontSize: '0.85rem', fontWeight: '600' }}>
          📍 {auto.proveedor?.ubicacion || 'Aeropuerto Internacional (Terminal de Llegadas)'}
        </div>
      </div>
      
      {/* Right: Price & CTA */}
      <div style={{ width: '210px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', borderLeft: '1px solid #f0f0f0', paddingLeft: '18px' }}>
        <div style={{ textAlign: 'right', width: '100%' }}>
          <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '2px' }}>
            Precio por día:
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1a1a1a' }}>
            ${precioDiario.toFixed(2)} USD
          </div>
          <div style={{ fontSize: '0.8rem', color: '#777', marginTop: '6px' }}>
            Total por {dias} días:
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 'bold', color: '#003b95', lineHeight: '1.1' }}>
            ${precioTotal} USD
          </div>
          <div style={{ fontSize: '0.72rem', color: '#008009', fontWeight: '600', marginTop: '4px' }}>
            Impuestos y tasas incluidos
          </div>
        </div>

        <div style={{ width: '100%', marginTop: '15px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); handleSelect(); }}
            style={{ 
              width: '100%', 
              background: '#006ce4', 
              color: 'white', 
              border: 'none', 
              padding: '11px', 
              borderRadius: '6px', 
              fontSize: '0.98rem', 
              fontWeight: 'bold', 
              cursor: 'pointer', 
              transition: 'background 0.2s',
              boxShadow: '0 2px 4px rgba(0,108,228,0.2)'
            }}
            onMouseOver={e => e.currentTarget.style.background = '#0057b8'} 
            onMouseOut={e => e.currentTarget.style.background = '#006ce4'}
          >
            Ver oferta →
          </button>
        </div>
      </div>
    </div>
  );
}
