import { useState, useEffect } from 'react';
import { getAtracciones, crearAtraccion, eliminarAtraccion, getReservas } from '../services/atraccionesApi';
import { searchAutos, createAutoLocal, deleteAutoLocal, getOrdersAuto } from '../services/autosApi';

export function AdminDashboard() {
  const [moduleSelected, setModuleSelected] = useState('atracciones'); // 'atracciones' | 'autos'
  const [tab, setTab] = useState('catalogo'); // 'catalogo' | 'reservas'
  const [loading, setLoading] = useState(true);

  // Atracciones State
  const [atracciones, setAtracciones] = useState([]);
  const [reservasAtracciones, setReservasAtracciones] = useState([]);
  const [formAtraccion, setFormAtraccion] = useState({ name: '', long_description: '', price: 0, duration: 'PT2H' });

  // Autos State
  const [autos, setAutos] = useState([]);
  const [reservasAutos, setReservasAutos] = useState([]);
  const [formAuto, setFormAuto] = useState({ supplier_name: '', price: 0, category: 'SUV' });

  const fetchData = async () => {
    setLoading(true);
    try {
      if (moduleSelected === 'atracciones') {
        const [resAttr, resResv] = await Promise.all([
          getAtracciones({ limit: 50 }),
          getReservas()
        ]);
        setAtracciones(resAttr.data || resAttr);
        setReservasAtracciones(resResv);
      } else {
        const [resAutos, resOrders] = await Promise.all([
          searchAutos({ booker: { country: 'EC' }, currency: 'USD', driver: { age: 30 }, route: { dropoff: {}, pickup: {} } }),
          getOrdersAuto()
        ]);
        setAutos(resAutos.data || []);
        setReservasAutos(resOrders || []);
      }
    } catch (error) {
      console.error('Error fetching admin data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [moduleSelected]);

  // --- Atracciones Logic ---
  const handleCreateAtraccion = async (e) => {
    e.preventDefault();
    try {
      await crearAtraccion({
        name: formAtraccion.name,
        long_description: formAtraccion.long_description,
        duration: formAtraccion.duration,
        price: { currency: 'USD', total: parseFloat(formAtraccion.price) },
        categories: ['general']
      });
      setFormAtraccion({ name: '', long_description: '', price: 0, duration: 'PT2H' });
      fetchData();
      alert('Atracción creada localmente');
    } catch (error) {
      alert('Error creando atracción');
    }
  };

  const handleDeleteAtraccion = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar esta atracción local?')) return;
    try {
      await eliminarAtraccion(id);
      fetchData();
    } catch (error) {
      alert('No se puede eliminar. Probablemente sea externa.');
    }
  };

  // --- Autos Logic ---
  const handleCreateAuto = async (e) => {
    e.preventDefault();
    try {
      await createAutoLocal({
        supplier_name: formAuto.supplier_name,
        price: parseFloat(formAuto.price),
        vehicle_info: { category: formAuto.category, transmission: 'AUTOMATIC' }
      });
      setFormAuto({ supplier_name: '', price: 0, category: 'SUV' });
      fetchData();
      alert('Auto creado localmente');
    } catch (error) {
      alert('Error creando auto');
    }
  };

  const handleDeleteAuto = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar este auto local?')) return;
    try {
      await deleteAutoLocal(id);
      fetchData();
    } catch (error) {
      alert('No se puede eliminar. Probablemente sea externo.');
    }
  };

  if (loading && atracciones.length === 0 && autos.length === 0) {
    return <div className="state-container"><div className="spinner" /></div>;
  }

  return (
    <main className="main-content">
      {/* Top Level Module Switcher */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '2px solid #eee', paddingBottom: 16 }}>
        <button 
          onClick={() => { setModuleSelected('atracciones'); setTab('catalogo'); }} 
          style={{ fontSize: '1.2rem', padding: '8px 16px', border: 'none', background: moduleSelected === 'atracciones' ? '#003580' : '#eee', color: moduleSelected === 'atracciones' ? 'white' : 'black', borderRadius: 8, cursor: 'pointer' }}
        >
          Módulo Atracciones
        </button>
        <button 
          onClick={() => { setModuleSelected('autos'); setTab('catalogo'); }} 
          style={{ fontSize: '1.2rem', padding: '8px 16px', border: 'none', background: moduleSelected === 'autos' ? '#003580' : '#eee', color: moduleSelected === 'autos' ? 'white' : 'black', borderRadius: 8, cursor: 'pointer' }}
        >
          Módulo Autos
        </button>
      </div>

      {/* Second Level Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.8rem' }}>Administración - {moduleSelected === 'atracciones' ? 'Atracciones' : 'Autos'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTab('catalogo')} className={tab === 'catalogo' ? 'card-btn' : 'retry-btn'}>Catálogo Híbrido</button>
          <button onClick={() => setTab('reservas')} className={tab === 'reservas' ? 'card-btn' : 'retry-btn'}>Historial de Reservas</button>
        </div>
      </div>

      {/* --- CONTENT AREA --- */}

      {/* CATALOGO */}
      {tab === 'catalogo' && moduleSelected === 'atracciones' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)' }}>
            <h2>Lista de Atracciones</h2>
            <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>ID</th>
                  <th style={{ padding: 8 }}>Nombre</th>
                  <th style={{ padding: 8 }}>Precio</th>
                  <th style={{ padding: 8 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {atracciones.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8, fontSize: '0.8rem', color: '#666' }}>{String(a.id).substring(0, 8)}...</td>
                    <td style={{ padding: 8 }}>{a.nombre || a.name || a.title}</td>
                    <td style={{ padding: 8 }}>${parseFloat(a.precio_unitario || a.price?.total || 0).toFixed(2)}</td>
                    <td style={{ padding: 8 }}><button onClick={() => handleDeleteAtraccion(a.id)} style={{ color: 'red', cursor: 'pointer', background: 'none', border: 'none' }}>🗑️ Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)', height: 'fit-content' }}>
            <h2>Crear Atracción</h2>
            <form onSubmit={handleCreateAtraccion} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <input required name="name" value={formAtraccion.name} onChange={(e) => setFormAtraccion({...formAtraccion, name: e.target.value})} placeholder="Nombre" style={{ padding: 8, border: '1px solid #ccc' }} />
              <textarea required name="long_description" value={formAtraccion.long_description} onChange={(e) => setFormAtraccion({...formAtraccion, long_description: e.target.value})} placeholder="Descripción" rows={3} style={{ padding: 8, border: '1px solid #ccc' }} />
              <input required type="number" name="price" value={formAtraccion.price} onChange={(e) => setFormAtraccion({...formAtraccion, price: e.target.value})} placeholder="Precio" style={{ padding: 8, border: '1px solid #ccc' }} />
              <button type="submit" className="card-btn">Guardar</button>
            </form>
          </div>
        </div>
      )}

      {tab === 'catalogo' && moduleSelected === 'autos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)' }}>
            <h2>Lista de Autos</h2>
            <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>ID</th>
                  <th style={{ padding: 8 }}>Agencia</th>
                  <th style={{ padding: 8 }}>Categoría</th>
                  <th style={{ padding: 8 }}>Precio/Día</th>
                  <th style={{ padding: 8 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {autos.map(a => (
                  <tr key={a.vehicle_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8, fontSize: '0.8rem', color: '#666' }}>{String(a.vehicle_id).substring(0, 8)}...</td>
                    <td style={{ padding: 8 }}>{a.supplier_id === 1 ? 'GDS Local' : 'Hertz Mock'}</td>
                    <td style={{ padding: 8 }}>{a.vehicle_info?.category}</td>
                    <td style={{ padding: 8 }}>${parseFloat(a.price || 0).toFixed(2)}</td>
                    <td style={{ padding: 8 }}><button onClick={() => handleDeleteAuto(a.vehicle_id)} style={{ color: 'red', cursor: 'pointer', background: 'none', border: 'none' }}>🗑️ Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)', height: 'fit-content' }}>
            <h2>Crear Auto</h2>
            <form onSubmit={handleCreateAuto} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <input required value={formAuto.supplier_name} onChange={(e) => setFormAuto({...formAuto, supplier_name: e.target.value})} placeholder="Nombre Agencia Local" style={{ padding: 8, border: '1px solid #ccc' }} />
              <input required value={formAuto.category} onChange={(e) => setFormAuto({...formAuto, category: e.target.value})} placeholder="Categoría (ej. SUV, Sedan)" style={{ padding: 8, border: '1px solid #ccc' }} />
              <input required type="number" value={formAuto.price} onChange={(e) => setFormAuto({...formAuto, price: e.target.value})} placeholder="Precio por día" style={{ padding: 8, border: '1px solid #ccc' }} />
              <button type="submit" className="card-btn">Guardar</button>
            </form>
          </div>
        </div>
      )}

      {/* RESERVAS */}
      {tab === 'reservas' && moduleSelected === 'atracciones' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)' }}>
          <h2>Reservas de Atracciones</h2>
          <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>ID Reserva</th>
                <th style={{ padding: 8 }}>Tickets</th>
                <th style={{ padding: 8 }}>Total</th>
                <th style={{ padding: 8 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservasAtracciones.map(r => (
                <tr key={r.reservation_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8, fontSize: '0.8rem', color: '#666' }}>{r.reservation_id}</td>
                  <td style={{ padding: 8 }}>{r.ticket_count}</td>
                  <td style={{ padding: 8 }}>${parseFloat(r.total_price?.total || 0).toFixed(2)}</td>
                  <td style={{ padding: 8 }}><span style={{ padding: '4px 8px', borderRadius: 4, fontSize: '0.85rem', background: r.status === 'CONFIRMED' ? '#e6f4ea' : '#fce8e6', color: r.status === 'CONFIRMED' ? '#137333' : '#c5221f' }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reservas' && moduleSelected === 'autos' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: 'var(--card-shadow)' }}>
          <h2>Órdenes de Autos</h2>
          <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>ID Orden</th>
                <th style={{ padding: 8 }}>Días Renta</th>
                <th style={{ padding: 8 }}>Total</th>
                <th style={{ padding: 8 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservasAutos.map(r => (
                <tr key={r.order_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8, fontSize: '0.8rem', color: '#666' }}>{r.order_id}</td>
                  <td style={{ padding: 8 }}>{r.dias_renta}</td>
                  <td style={{ padding: 8 }}>${parseFloat(r.total_price?.total || 0).toFixed(2)}</td>
                  <td style={{ padding: 8 }}><span style={{ padding: '4px 8px', borderRadius: 4, fontSize: '0.85rem', background: r.status === 'CONFIRMED' ? '#e6f4ea' : '#fce8e6', color: r.status === 'CONFIRMED' ? '#137333' : '#c5221f' }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
