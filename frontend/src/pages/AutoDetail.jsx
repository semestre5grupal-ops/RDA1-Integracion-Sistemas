import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { createOrderAuto, getAutoById } from '../services/autosApi';
import { v4 as uuidv4 } from 'uuid';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { ReportModal } from '../components/ReportModal';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { OfflineReservaModal } from '../components/OfflineReservaModal';
import { useCurrency } from '../hooks/CurrencyContext';
import { AutoVoucherModal } from '../components/AutoVoucherModal';

export function AutoDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { convertPrice } = useCurrency();
  const isAdmin = user?.email === 'admin@booking.com' || user?.email === 'alejandroflores@booking.com' || user?.user_metadata?.role === 'admin';
  const [fetchedAuto, setFetchedAuto] = useState(null);

  useEffect(() => {
    if (!location.state?.auto && id) {
      getAutoById(id)
        .then(data => setFetchedAuto(data))
        .catch(err => console.warn('No se pudo cargar vehículo por ID:', err));
    }
  }, [id, location.state?.auto]);

  const auto = location.state?.auto || fetchedAuto || {};

  const precioDiario = auto.price || 35.50;
  const make = auto.make || 'Chevrolet';
  const model = auto.model || 'Spark';
  const seats = auto.seats || 5;
  const doors = auto.doors || 4;
  const bag_capacity = auto.bag_capacity || 1;
  const transmission = auto.transmission || 'Manual';
  const supplierId = auto.supplier_id || 1;

  const suppliersMap = {
    1: { bg: '#00843D', color: 'white', label: 'Europcar', score: '8.2', scoreText: 'Aceptable', reviews: '300+' },
    2: { bg: '#00266b', color: '#ffb700', label: 'Alamo', score: '8.5', scoreText: 'Excelente', reviews: '450+' },
    3: { bg: '#006600', color: 'white', label: 'Enterprise', score: '9.1', scoreText: 'Excepcional', reviews: '800+' }
  };
  const supplierInfo = suppliersMap[supplierId] || suppliersMap[1];

  const [dias, setDias] = useState(3);
  const [driverAge, setDriverAge] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('puntual');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('TARJETA');
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [instructionsType, setInstructionsType] = useState('recogida');
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [showImportantInfoModal, setShowImportantInfoModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [pendingOfflinePay, setPendingOfflinePay] = useState(false);
  const [tipoCobertura, setTipoCobertura] = useState('BASICA');
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [reservaConfirmada, setReservaConfirmada] = useState(null);
  const [diasError, setDiasError] = useState('');
  const [driverAgeError, setDriverAgeError] = useState('');

  // Sanitizar entradas para permitir solo números
  const handleNumberKeyDown = (e) => {
    if (!/^[0-9]$/.test(e.key) &&
      !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const handleDiasChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setDias(val);
    if (!val || parseInt(val, 10) < 1 || parseInt(val, 10) > 30) {
      setDiasError('El alquiler debe ser entre 1 y 30 días.');
    } else {
      setDiasError('');
    }
  };

  const handleAgeChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setDriverAge(val);
    if (!val || parseInt(val, 10) < 18 || parseInt(val, 10) > 99) {
      setDriverAgeError('El conductor debe tener entre 18 y 99 años.');
    } else {
      setDriverAgeError('');
    }
  };

  useEffect(() => {
    if (id) {
      const saved = localStorage.getItem(`auto_form_${id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.dias) setDias(parsed.dias);
          if (parsed.driverAge) setDriverAge(parsed.driverAge);
        } catch (e) { }
      }
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      localStorage.setItem(`auto_form_${id}`, JSON.stringify({ dias, driverAge }));
    }
  }, [dias, driverAge, id]);

  const handleBooking = async (e) => {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (!dias || parseInt(dias, 10) < 1 || parseInt(dias, 10) > 30) {
      setError('Por favor indica una cantidad válida de días de renta (entre 1 y 30).');
      setDiasError('El alquiler debe ser entre 1 y 30 días.');
      return;
    }

    if (!driverAge || parseInt(driverAge, 10) < 18 || parseInt(driverAge, 10) > 99) {
      setError('El conductor debe tener entre 18 y 99 años de edad.');
      setDriverAgeError('El conductor debe tener entre 18 y 99 años.');
      return;
    }

    setError('');
    setDiasError('');
    setDriverAgeError('');
    // Abrir modal de pagos en lugar de llamar directamente a la API
    setShowPaymentModal(true);
  };

  const procesarPagoYReserva = async () => {
    // Si no hay conexión, mostrar modal de aviso ANTES de guardar
    if (!navigator.onLine && !pendingOfflinePay) {
      setPendingOfflinePay(true);
      setShowOfflineModal(true);
      return;
    }
    setPendingOfflinePay(false);
    setLoading(true);
    setError(null);
    setSuccess(null);

    const costoCoberturaDiaria = tipoCobertura === 'TOTAL' ? 18.00 : 0.00;
    const precioDiarioFinal = precioDiario + costoCoberturaDiaria;
    const totalCalculado = (precioDiarioFinal * dias).toFixed(2);
    const idempotencyKey = uuidv4();

    const userEmail = (user?.email || '').trim().toLowerCase();
    const payload = {
      vehicle_id: id,
      auto_id: id,
      vehiculo: {
        marca: make,
        modelo: model,
        categoria: auto.categoria || 'Económico',
        transmision: transmission,
        foto_url: auto.images?.[0] || auto.foto_url || ''
      },
      dias: parseInt(dias, 10),
      tipo_cobertura: tipoCobertura,
      conductor: {
        nombre: (user?.user_metadata?.full_name || user?.nombre || 'Usuario Web').trim().replace(/\s{2,}/g, ' '),
        email: userEmail,
        telefono: (user?.telefono || '+593998765432').trim(),
        licencia: (user?.user_metadata?.cedula || '1723456789').trim(),
        edad: parseInt(driverAge, 10)
      },
      driver: { age: parseInt(driverAge, 10), email: userEmail },
      booker: {
        country: 'EC',
        name: (user?.nombre || user?.user_metadata?.full_name || 'Usuario Web').trim().replace(/\s{2,}/g, ' '),
        email: userEmail
      },
      payment_method: paymentMethod
    };

    let orderId = idempotencyKey;
    const tituloReserva = `Renta de ${make} ${model} (${dias} días) - Cobertura ${tipoCobertura}`;

    const datosFactura = {
      tipo: 'auto',
      pnr: orderId.substring(0, 8).toUpperCase(),
      titulo: tituloReserva,
      total: totalCalculado,
      pasajeros: [
        {
          firstName: user?.user_metadata?.nombre || user?.user_metadata?.full_name || '',
          lastName: user?.user_metadata?.apellido || '',
          documentNumber: user?.user_metadata?.cedula || '',
          email: user?.email || '',
        },
      ],
    };

    let backendRes = null;
    if (!navigator.onLine) {
      await savePendingReservation('auto', payload, idempotencyKey, datosFactura);
    } else {
      try {
        const res = await createOrderAuto(payload, idempotencyKey);
        if (res && (res.order_id || res.pnr)) {
          orderId = res.pnr || res.order_id;
          backendRes = res;
        }
      } catch (err) {
        console.error('Error al crear reserva de auto:', err);
        const errMsg = err.response?.data?.message || err.response?.data?.detail || err.message || 'El vehículo no está disponible para las fechas seleccionadas.';
        setError(errMsg);
        setShowPaymentModal(false);
        setLoading(false);
        return;
      }

      enviarFacturaTrasCompra({
        ...datosFactura,
        pnr: orderId.substring(0, 8).toUpperCase(),
      });
    }

    const pnrFinal = backendRes?.pnr || orderId.substring(0, 8).toUpperCase();
    const confirmedData = backendRes || {
      order_id: pnrFinal,
      pnr: pnrFinal,
      status: 'CONFIRMED',
      tipo_cobertura: tipoCobertura,
      total_price: { total: totalCalculado, currency: 'USD' },
      vehiculo: { marca: make, modelo: model, categoria: 'Económico', transmision },
      voucher_qr_data: `BOOKING-CAR-${pnrFinal}-CONFIRMED`,
      checklist_mostrador: [
        'Licencia de conducir física original con antigüedad mayor a 1 año',
        'Cédula de identidad o Pasaporte físico vigente',
        tipoCobertura === 'TOTAL'
          ? 'Tarjeta de crédito física a nombre del titular (Cobertura Total: Depósito $0.00)'
          : 'Tarjeta de crédito física con cupo de $1,200.00 para retención de depósito'
      ]
    };

    setReservaConfirmada(confirmedData);
    setShowVoucherModal(true);
    setShowPaymentModal(false);

    if (!navigator.onLine) {
      setSuccess(`Guardado sin conexión (ID: ${pnrFinal}). Se sincronizará automáticamente.`);
    } else {
      setSuccess(`¡Reserva confirmada con éxito! Localizador PNR: ${pnrFinal}`);
    }

    const autoRes = {
      id: pnrFinal,
      orderId: pnrFinal,
      tipo: 'auto',
      titulo: tituloReserva,
      date: new Date().toISOString().split('T')[0],
      dias: parseInt(dias, 10),
      status: 'CONFIRMED',
      totalPrice: { currency: 'USD', total: totalCalculado },
      email: userEmail,
    };
    const existing = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
    localStorage.setItem('reservas_autos', JSON.stringify([autoRes, ...existing]));

    setLoading(false);
  };

  const costoCoberturaDiaria = tipoCobertura === 'TOTAL' ? 18.00 : 0.00;
  const precioDiarioFinal = precioDiario + costoCoberturaDiaria;
  const subtotal = precioDiarioFinal * dias;
  const total = convertPrice(subtotal);

  return (
    <main id="contenido-principal" style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>

        {/* Breadcrumb & Header */}
        <div style={{ marginBottom: '20px' }}>
          <span onClick={() => navigate('/autos')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/autos'); } }} style={{ color: '#006ce4', cursor: 'pointer', fontSize: '0.9rem' }}>Volver a los resultados de búsqueda</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333', margin: '10px 0 5px 0' }}>Tu oferta</h1>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>Siguiente: Añade los extras</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '5px', marginTop: '15px' }}>
            <div style={{ flex: 1, height: '4px', background: '#006ce4' }}></div>
            <div style={{ flex: 1, height: '4px', background: '#e7e7e7' }}></div>
            <div style={{ flex: 1, height: '4px', background: '#e7e7e7' }}></div>
            <div style={{ flex: 1, height: '4px', background: '#e7e7e7' }}></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Cancellation Box */}
            <div style={{ border: '1px solid #008009', borderRadius: '4px', padding: '12px 16px', background: '#f2fcf5', color: '#008009', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '500' }}>
              <span style={{ fontSize: '1.2rem' }}>✓</span> Cancelación gratuita hasta 48 horas antes de la recogida
            </div>

            {/* Car Details */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ width: '250px' }}>
                  <img
                    src={auto.images && auto.images.length > 0 ? auto.images[0] : 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80'}
                    alt={`${make} ${model}`}
                    style={{ width: '100%', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>
                    {make} {model}{' '}
                    <span style={{ position: 'relative', cursor: 'pointer', fontSize: '0.9rem', color: '#006ce4', fontWeight: 'normal' }} onClick={() => setShowSimilarModal(!showSimilarModal)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSimilarModal(!showSimilarModal); } }}>
                      o un coche pequeño similar ℹ️
                      {showSimilarModal && (
                        <div style={{ position: 'absolute', top: '100%', left: '0', marginTop: '10px', background: '#222', color: 'white', padding: '15px', borderRadius: '4px', width: '300px', zIndex: 10, fontSize: '0.9rem', lineHeight: '1.4', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', fontWeight: 'normal', textAlign: 'left' }}>
                          <div style={{ position: 'absolute', top: '-6px', left: '20px', width: '0', height: '0', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '6px solid #222' }}></div>
                          <strong style={{ display: 'block', marginBottom: '8px', fontSize: '1rem' }}>¿Qué significa "o similar"?</strong>
                          El modelo exacto puede variar, pero siempre tendrás un coche de la misma categoría y tamaño, con el mismo número de puertas, tipo de cambio y características. Esto es habitual en la mayoría de las empresas de alquiler de coches.
                        </div>
                      )}
                    </span>
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem', color: '#333', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>👤</span> {seats} plazas</div>
                    {/* <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>⚙️</span> {transmission}</div> */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>💼</span> {bag_capacity} pieza de equipaje</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🛣️</span> Kilometraje ilimitado</div>
                  </div>

                  <div style={{ fontSize: '0.9rem', color: '#333' }}>
                    <strong>Quito Aeropuerto</strong><br />
                    <span style={{ color: '#666' }}>En el aeropuerto</span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e7e7e7', marginTop: '20px', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: supplierInfo.bg, color: supplierInfo.color, padding: '4px 8px', borderRadius: '2px', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '-0.5px' }}>{supplierInfo.label}</div>
                  <div style={{ background: '#003b95', color: 'white', padding: '6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem' }}>{supplierInfo.score}</div>
                  <div style={{ fontSize: '0.85rem', color: '#333', lineHeight: '1.2' }}><b>{supplierInfo.scoreText}</b><br /><span style={{ color: '#666' }}>{supplierInfo.reviews} opiniones</span></div>
                </div>
                <div onClick={() => setShowImportantInfoModal(true)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowImportantInfoModal(true); } }} style={{ color: '#006ce4', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>ℹ️</span> Información importante
                </div>
              </div>
            </div>

            {/* Buena eleccion */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>¡Muy buena elección!</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '0.9rem', color: '#333' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Valoración de los usuarios: {supplierInfo.score} / 10</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Mostrador dentro de la terminal aérea</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Opción de combustible más solicitada (Lleno a lleno)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Cancelación gratuita hasta 48h antes</div>
                </div>
              </div>
              <div style={{ fontSize: '3.5rem' }}>🔑</div>
            </div>

            {/* SELECTOR INTERACTIVO DE COBERTURA Y SEGUROS (RDA2) */}
            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #cce4fc', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#003580', margin: 0 }}>
                    Elige tu nivel de protección
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: '#555' }}>
                    Viaja tranquilo con la cobertura adecuada para tu viaje
                  </p>
                </div>
                <span style={{ background: '#e7f0fd', color: '#006ce4', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                  Recomendado
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                
                {/* Opción 1: Protección Básica */}
                <div 
                  onClick={() => setTipoCobertura('BASICA')}
                  style={{
                    border: tipoCobertura === 'BASICA' ? '2px solid #006ce4' : '1px solid #ddd',
                    background: tipoCobertura === 'BASICA' ? '#f4f8ff' : '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#333' }}>
                      Protección Básica
                    </div>
                    <input 
                      type="radio" 
                      name="cobertura" 
                      checked={tipoCobertura === 'BASICA'} 
                      onChange={() => setTipoCobertura('BASICA')} 
                      style={{ accentColor: '#006ce4', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#008009', marginBottom: '8px' }}>
                    Incluida en el precio
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.84rem', color: '#555', lineHeight: 1.6 }}>
                    <li>Responsabilidad civil básica</li>
                    <li>Cobertura por colisión con franquicia ($1,200.00 US$)</li>
                    <li><b>Depósito retenido en tarjeta:</b> $1,200.00 US$</li>
                    <li style={{ color: '#d93025' }}>No cubre cristales, ruedas ni pérdida de llaves</li>
                  </ul>
                </div>

                {/* Opción 2: Cobertura Total / Protección Premium */}
                <div 
                  onClick={() => setTipoCobertura('TOTAL')}
                  style={{
                    border: tipoCobertura === 'TOTAL' ? '2px solid #008009' : '1px solid #ddd',
                    background: tipoCobertura === 'TOTAL' ? '#f2fcf5' : '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#008009', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🛡️</span> Cobertura Total
                    </div>
                    <input 
                      type="radio" 
                      name="cobertura" 
                      checked={tipoCobertura === 'TOTAL'} 
                      onChange={() => setTipoCobertura('TOTAL')} 
                      style={{ accentColor: '#008009', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#003580', marginBottom: '8px' }}>
                    + $18.00 US$ / día
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.84rem', color: '#2d3748', lineHeight: 1.6 }}>
                    <li><b>Franquicia CERO ($0.00 US$):</b> Sin responsabilidad económica</li>
                    <li><b>Depósito en tarjeta:</b> Exonerado ($0.00 US$)</li>
                    <li>Protección total de parabrisas, ventanillas y neumáticos</li>
                    <li>Reposición de llaves extraviadas y asistencia en carretera 24/7</li>
                  </ul>
                </div>

              </div>
            </div>

            {/* Incluido en el precio */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>Incluido en el precio</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '0.9rem', color: '#333' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Cancelación gratuita hasta 48 horas antes de la recogida</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Cobertura parcial por colisión y robo</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Kilometraje ilimitado sin costos adicionales</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><span style={{ color: '#008009' }}>✓</span> Higienización y cooldown de 2h completado</div>
              </div>
            </div>

            {/* Lo imprescindible */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333', padding: '20px 20px 10px 20px', margin: 0 }}>Lo imprescindible para la recogida</h3>
              <div style={{ display: 'flex', borderBottom: '1px solid #e7e7e7' }}>
                <div onClick={() => setActiveTab('puntual')} style={{ flex: 1, textAlign: 'center', padding: '15px', cursor: 'pointer', borderBottom: activeTab === 'puntual' ? '2px solid #006ce4' : 'none', color: activeTab === 'puntual' ? '#006ce4' : '#666', fontWeight: activeTab === 'puntual' ? 'bold' : 'normal' }}>
                  Sé puntual
                </div>
                <div onClick={() => setActiveTab('llevar')} style={{ flex: 1, textAlign: 'center', padding: '15px', cursor: 'pointer', borderBottom: activeTab === 'llevar' ? '2px solid #006ce4' : 'none', color: activeTab === 'llevar' ? '#006ce4' : '#666', fontWeight: activeTab === 'llevar' ? 'bold' : 'normal' }}>
                  Qué llevar contigo
                </div>
                <div onClick={() => setActiveTab('deposito')} style={{ flex: 1, textAlign: 'center', padding: '15px', cursor: 'pointer', borderBottom: activeTab === 'deposito' ? '2px solid #006ce4' : 'none', color: activeTab === 'deposito' ? '#006ce4' : '#666', fontWeight: activeTab === 'deposito' ? 'bold' : 'normal' }}>
                  Depósito reembolsable
                </div>
              </div>
              <div style={{ padding: '20px', fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>
                {activeTab === 'puntual' && (
                  <p>Las agencias de alquiler mantienen tu reserva durante un tiempo limitado tras la hora acordada. Te recomendamos informar tu número de vuelo si viajas en avión.<br /><br /><strong>Tu hora de recogida programada: 10:00 AM</strong></p>
                )}
                {activeTab === 'llevar' && (
                  <p>Deberás presentar tu pasaporte o cédula física original, licencia de conducir vigente del conductor titular y tarjeta de crédito física a nombre del conductor.</p>
                )}
                {activeTab === 'deposito' && (
                  <p>{tipoCobertura === 'TOTAL' ? '¡Excelente! Con Cobertura Total seleccionada, no se retendrá depósito de garantía por daños en tu tarjeta de crédito.' : 'Con Protección Básica, el proveedor retendrá un depósito temporal de $1,200.00 US$ en tu tarjeta de crédito física, el cual se liberará al devolver el coche sin daños.'}</p>
                )}
              </div>
            </div>

            {/* Error y Exito */}
            {error && <div style={{ color: '#d93025', background: '#fce8e6', padding: '12px', borderRadius: '4px' }}>{error}</div>}
            {success && <div style={{ color: '#137333', background: '#e6f4ea', padding: '12px', borderRadius: '4px' }}>{success}</div>}

            {/* Continuar button form */}
            <form onSubmit={handleBooking} style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="submit" style={{ background: '#006ce4', color: 'white', border: 'none', padding: '12px 24px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>
                {!user ? 'Inicia sesión para continuar' : 'Continuar a Pago'}
              </button>
            </form>

          </div>

          {/* RIGHT COLUMN */}
          <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Edit parameters quickly */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>Ajustar Reserva</h3>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label htmlFor="auto-dias" style={{ fontSize: '0.9rem', color: '#666' }}>Días de renta:</label>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Máx 30 días</span>
                </div>
                <input 
                  id="auto-dias" 
                  type="text" 
                  inputMode="numeric"
                  maxLength={2} 
                  value={dias} 
                  onChange={handleDiasChange} 
                  onKeyDown={handleNumberKeyDown} 
                  aria-invalid={!!diasError}
                  style={{ width: '100%', padding: '8px', border: diasError ? '2px solid #d93025' : '1px solid #ccc', borderRadius: '4px' }} 
                />
                {diasError && <span role="alert" style={{ fontSize: '0.78rem', color: '#d93025', display: 'block', marginTop: '4px', fontWeight: 600 }}>{diasError}</span>}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label htmlFor="auto-edad" style={{ fontSize: '0.9rem', color: '#666' }}>Edad del conductor:</label>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>18 - 99 años</span>
                </div>
                <input 
                  id="auto-edad" 
                  type="text" 
                  inputMode="numeric"
                  maxLength={2} 
                  value={driverAge} 
                  onChange={handleAgeChange} 
                  onKeyDown={handleNumberKeyDown} 
                  aria-invalid={!!driverAgeError}
                  style={{ width: '100%', padding: '8px', border: driverAgeError ? '2px solid #d93025' : '1px solid #ccc', borderRadius: '4px' }} 
                />
                {driverAgeError && <span role="alert" style={{ fontSize: '0.78rem', color: '#d93025', display: 'block', marginTop: '4px', fontWeight: 600 }}>{driverAgeError}</span>}
              </div>
            </div>

            {/* Recogida y devolucion */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>Recogida y devolución</h3>
              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                <div style={{ position: 'absolute', left: '0', top: '5px', bottom: '5px', width: '2px', background: '#ccc' }}></div>

                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #666', background: 'white' }}></div>
                  <div style={{ fontSize: '0.9rem', color: '#333' }}>lun, 5 oct - 10:00</div>
                  <div style={{ fontWeight: 'bold', color: '#333', fontSize: '1rem' }}>Quito Aeropuerto</div>
                  <div onClick={() => { setInstructionsType('recogida'); setShowInstructionsModal(true); }} style={{ color: '#006ce4', fontSize: '0.9rem', cursor: 'pointer', marginTop: '5px' }}>Ver instrucciones para la recogida</div>
                </div>

                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #666', background: 'white' }}></div>
                  <div style={{ fontSize: '0.9rem', color: '#333' }}>jue, 8 oct - 10:00</div>
                  <div style={{ fontWeight: 'bold', color: '#333', fontSize: '1rem' }}>Quito Aeropuerto</div>
                  <div onClick={() => { setInstructionsType('devolución'); setShowInstructionsModal(true); }} style={{ color: '#006ce4', fontSize: '0.9rem', cursor: 'pointer', marginTop: '5px' }}>Ver instrucciones para la devolución</div>
                </div>
              </div>
            </div>

            {/* Desglose */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e7e7e7', padding: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333', marginBottom: '15px' }}>Desglose del precio del coche</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: '#333', marginBottom: '20px' }}>
                <span>Precio del alquiler ({dias} días)</span>
                <span>{total}</span>
              </div>
              <div style={{ borderTop: '1px solid #e7e7e7', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#333' }}>Total</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333' }}>{total}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '15px', lineHeight: '1.4' }}>
                Si pagas con una tarjeta ecuatoriana, el proveedor te cobrará un cargo adicional, de acuerdo con la legislación fiscal de Ecuador.
              </p>
            </div>

            {/* Promo */}
            <div style={{ border: '1px solid #008009', borderRadius: '4px', padding: '20px', background: '#f2fcf5' }}>
              <h4 style={{ color: '#008009', fontSize: '1rem', fontWeight: 'bold', margin: '0 0 10px 0' }}>Este vehículo cuesta tan solo {total}, ¡una verdadera ganga!</h4>
              <p style={{ color: '#008009', fontSize: '0.9rem', margin: 0 }}>
                En esta época del año, un coche pequeño en Quito Aeropuerto suele costar {convertPrice(precioDiario * dias * 1.4)}.
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* PAYMENT MODAL (SIMULADOR DE PASARELA) */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '30px', width: '400px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px', color: '#333' }}>Pasarela de Pago</h2>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>Total a pagar: <strong>{total}</strong></p>

            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="pago-metodo" style={{ display: 'block', fontSize: '0.9rem', color: '#333', marginBottom: '10px', fontWeight: 'bold' }}>Método de pago:</label>
              <select id="pago-metodo" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="TARJETA">Tarjeta de Crédito / Débito</option>
                <option value="PAYPAL">PayPal</option>
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'transparent', color: '#666', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                Cancelar
              </button>
              {isAdmin ? (
                <div style={{ padding: '10px', background: '#f8d7da', color: '#721c24', borderRadius: '4px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  Los administradores no pueden pagar.
                </div>
              ) : (
                <>
                  <button onClick={procesarPagoYReserva} disabled={loading} style={{ background: '#006ce4', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                    {loading ? 'Procesando...' : 'Pagar y Reservar'}
                  </button>

                  {/* Modal offline: aparece cuando se pulsa el botón sin internet */}
                  {showOfflineModal && (
                    <OfflineReservaModal
                      onContinuar={() => {
                        setShowOfflineModal(false);
                        procesarPagoYReserva();
                      }}
                      onCancelar={() => {
                        setShowOfflineModal(false);
                        setPendingOfflinePay(false);
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showInstructionsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowInstructionsModal(false)}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', maxWidth: '600px', width: '90%', textAlign: 'left', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowInstructionsModal(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>&times;</button>
            <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>Instrucciones para la {instructionsType}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: supplierInfo.bg, color: supplierInfo.color, padding: '4px 8px', borderRadius: '2px', fontWeight: 'bold', fontSize: '0.8rem' }}>{supplierInfo.label}</div>
              <span style={{ fontSize: '0.95rem' }}>Proveedor: <strong>{supplierInfo.label} By Europcar</strong></span>
            </div>
            
            <h3 style={{ fontSize: '1rem', marginBottom: '5px' }}>Lugar de {instructionsType}</h3>
            <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: '20px' }}>Aeropuerto Internacional Mariscal Sucre, Planta Baja, Tababela, Quito, Ecuador, 170907</p>
            
            <h3 style={{ fontSize: '1rem', marginBottom: '5px' }}>Horario de apertura</h3>
            <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: '20px' }}>Lun - Dom 00:00 - 23:59</p>

            <div style={{ width: '100%', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #006ce4', position: 'relative' }}>
              <iframe
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=-78.36151123046876%2C-0.12634354274996906%2C-78.35121154785158%2C-0.11604344487431268&amp;layer=mapnik&amp;marker=-0.12119350410499645%2C-78.35636138916016`}
                allowFullScreen
              ></iframe>
              <div style={{ position: 'absolute', bottom: '20px', left: '0', right: '0', textAlign: 'center', pointerEvents: 'none' }}>
                <span style={{ background: 'white', color: '#006ce4', padding: '6px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>📍 Mostrar en el Mapa</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportantInfoModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportantInfoModal(false)}>
          <div style={{ background: 'white', padding: '0', borderRadius: '8px', maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ position: 'sticky', top: 0, background: 'white', padding: '20px 30px', borderBottom: '1px solid #e7e7e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Información importante</h2>
              <button onClick={() => setShowImportantInfoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>&times;</button>
            </div>
            
            <div style={{ padding: '30px' }}>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                <div style={{ width: '150px', fontWeight: 'bold', fontSize: '0.95rem' }}>👤 Documentación necesaria</div>
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#333' }}>
                  <p style={{ margin: '0 0 10px 0' }}>A la hora de recoger el vehículo, necesitarás:</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}><span style={{ color: '#006ce4' }}>✓</span> Pasaporte o documento nacional de identidad</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}><span style={{ color: '#006ce4' }}>✓</span> Permiso de conducir</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#006ce4' }}>✓</span> Tarjeta de crédito</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderTop: '1px solid #e7e7e7', paddingTop: '20px' }}>
                <div style={{ width: '150px', fontWeight: 'bold', fontSize: '0.95rem' }}>💳 Depósito de seguridad<br/><span style={{ fontWeight: 'normal', fontSize: '0.85rem', color: '#666' }}>1750,00 US$</span></div>
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#333' }}>
                  <p style={{ margin: '0 0 15px 0' }}>En el momento de la recogida, el conductor principal dejará un depósito de seguridad reembolsable de 1750,00 US$ en su tarjeta de crédito. No se acepta efectivo ni tarjetas de débito. El personal del mostrador confirmará cuánto será.</p>
                  <strong>Tarjetas aceptadas</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                     <span style={{ border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>MasterCard</span>
                     <span style={{ border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: '#1a1f71' }}>VISA</span>
                     <span style={{ border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: '#006fcf' }}>AMEX</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderTop: '1px solid #e7e7e7', paddingTop: '20px' }}>
                <div style={{ width: '150px', fontWeight: 'bold', fontSize: '0.95rem' }}>🚗 Franquicia por daños<br/><span style={{ fontWeight: 'normal', fontSize: '0.85rem', color: '#666' }}>2000,00 US$</span></div>
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#333' }}>
                  Si se daña la carrocería del coche, lo máximo que pagarás por las reparaciones cubiertas por la cobertura parcial por colisión es la franquicia por daños (2000,00 US$). La cobertura solo será válida si se cumplen las condiciones del contrato de alquiler.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderTop: '1px solid #e7e7e7', paddingTop: '20px' }}>
                <div style={{ width: '150px', fontWeight: 'bold', fontSize: '0.95rem' }}>🛣️ Kilometraje<br/><span style={{ fontWeight: 'normal', fontSize: '0.85rem', color: '#666' }}>Ilimitado</span></div>
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#333' }}>
                  El alquiler incluye kilómetro sin límites gratis.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderTop: '1px solid #e7e7e7', paddingTop: '20px' }}>
                <div style={{ width: '150px', fontWeight: 'bold', fontSize: '0.95rem' }}>🌍 Cruce de fronteras</div>
                <div style={{ flex: 1, fontSize: '0.9rem', color: '#333' }}>
                  Esta compañía de alquiler no permite los viajes transfronterizos.
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid #e7e7e7', paddingTop: '20px', fontSize: '0.85rem', color: '#666', lineHeight: '1.5' }}>
                Aquí abajo puedes consultar los términos y condiciones completos del Proveedor de servicios, que incluyen el nombre completo y el domicilio social del Proveedor de servicios, así como información y cargos de los productos y servicios extra que se pueden adquirir en el mostrador o derivados del uso que hagas del alquiler, como el cruce de fronteras y, si los hubiera, los periodos de gracia de recogida y devolución.
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid #e7e7e7', padding: '20px 30px', background: '#f9f9f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}>
              <span>Términos completos del alquiler</span>
              <span style={{ fontSize: '1.2rem' }}>⌄</span>
            </div>
          </div>
        </div>
      )}
      <ReportModal 
        isOpen={showReportModal} 
        onClose={() => setShowReportModal(false)} 
        entityName={`${make} ${model} (${supplierInfo.label})`} 
        pnrOrId={auto?.id || 'AUTO'} 
        type="Auto" 
      />
      <AutoVoucherModal
        isOpen={showVoucherModal}
        onClose={() => setShowVoucherModal(false)}
        reserva={reservaConfirmada}
      />
    </main>
  );
}
