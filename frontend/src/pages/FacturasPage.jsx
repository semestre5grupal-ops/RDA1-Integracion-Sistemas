import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';

export function FacturasPage() {
  const { user } = useAuth();
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarFacturas() {
      if (!user) return;
      
      let query = supabase
        .from('facturas')
        .select(`
          id,
          usuario_id,
          created_at,
          carritos (
            id,
            carrito_items (
              nombre_producto,
              precio_unitario,
              cantidad,
              tipo_producto
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (user.user_metadata?.role !== 'admin') {
        query = query.eq('usuario_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando facturas:', error);
      } else {
        setFacturas(data || []);
      }
      setLoading(false);
    }

    cargarFacturas();
  }, [user]);

  if (loading) {
    return <main className="main-content"><div className="state-container"><p>Cargando facturas...</p></div></main>;
  }

  return (
    <main className="main-content" id="contenido-principal">
      <div className="state-container" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
        <h1 className="state-title">Mis Facturas</h1>
        <p className="state-subtitle">Historial de pagos y facturación de la plataforma.</p>

        {facturas.length === 0 ? (
          <p style={{ marginTop: '2rem', textAlign: 'center' }}>No tienes facturas generadas todavía.</p>
        ) : (
          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {facturas.map((factura) => {
              const items = factura.carritos?.carrito_items || [];
              const total = items.reduce((acc, item) => acc + (item.precio_unitario * item.cantidad), 0);

              return (
                <div key={factura.id} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '8px' }}>
                    <strong>Factura #{factura.id.slice(0, 8).toUpperCase()}</strong>
                    <span style={{ color: '#4b5563', fontSize: '0.88rem', fontWeight: 600 }}>
                      📅 Fecha de reserva / emisión: {new Date(factura.created_at).toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                      <strong>{user.user_metadata?.role === 'admin' && factura.usuario_id !== user.id ? `Usuario ID: ${factura.usuario_id}` : 'Datos de facturación:'}</strong><br/>
                      {(!user.user_metadata?.role || factura.usuario_id === user.id) && (
                        <>
                          Nombre: {user.user_metadata?.nombre} {user.user_metadata?.apellido}<br/>
                          Cédula / RUC: {user.user_metadata?.cedula}<br/>
                          Teléfono: {user.user_metadata?.telefono}
                        </>
                      )}
                    </p>
                  </div>

                  <ul style={{ paddingLeft: '1.2rem', marginBottom: '1rem' }}>
                    {items.map((item, index) => {
                      const tipo = (item.tipo_producto || '').toLowerCase();
                      const unidadTexto = tipo === 'auto' ? 'Vehículo(s)' : tipo === 'atraccion' ? 'Entrada(s) / Persona(s)' : tipo === 'vuelo' ? 'Pasajero(s)' : 'Huésped(es) / Hab.';
                      return (
                        <li key={index} style={{ marginBottom: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{item.nombre_producto}</span> ({item.tipo_producto})
                          <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '3px' }}>
                            <span>Cantidad: <strong>{item.cantidad} {unidadTexto}</strong></span>
                            <span style={{ margin: '0 8px' }}>·</span>
                            <span>Precio unitario: ${Number(item.precio_unitario).toFixed(2)}</span>
                            <span style={{ margin: '0 8px' }}>·</span>
                            <span>Subtotal: ${(item.cantidad * item.precio_unitario).toFixed(2)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    Total: ${total.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
