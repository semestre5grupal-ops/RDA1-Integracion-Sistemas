import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export function Panel2_GestionFlotaAutos() {
  const [flota, setFlota] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAuto, setSelectedAuto] = useState(null);

  const fetchFlota = async () => {
    try {
      setLoading(true);
      const res = await api.get('/autos/flota');
      setFlota(Array.isArray(res) ? res : res.data || []);
    } catch (e) {
      // Mock con demostración del Cooldown de 2 horas y Alerta de kilometraje (Cátedra RDA2 §5)
      setFlota([
        {
          id: 'auto-toyota-01',
          marca: 'Toyota',
          modelo: 'RAV4 4x4 Hybrid',
          categoria: 'SUV',
          precio_diario: 75.0,
          estado_operativo: 'DISPONIBLE',
          cooldown_activo: false,
          segundos_restantes_cooldown: 0,
          kilometraje_actual: 12450,
          umbral_mantenimiento_km: 15000,
          mantenimiento_requerido: false,
        },
        {
          id: 'auto-chevrolet-02',
          marca: 'Chevrolet',
          modelo: 'Tracker Turbo Premier',
          categoria: 'SUV',
          precio_diario: 58.0,
          estado_operativo: 'EN_LIMPIEZA',
          cooldown_activo: true,
          segundos_restantes_cooldown: 5240, // ~1h 27m restantes
          kilometraje_actual: 8900,
          umbral_mantenimiento_km: 15000,
          mantenimiento_requerido: false,
        },
        {
          id: 'auto-kia-03',
          marca: 'Kia',
          modelo: 'Sportage X-Line',
          categoria: 'SUV',
          precio_diario: 68.0,
          estado_operativo: 'EN_MANTENIMIENTO',
          cooldown_activo: false,
          segundos_restantes_cooldown: 0,
          kilometraje_actual: 15420,
          umbral_mantenimiento_km: 15000,
          mantenimiento_requerido: true, // Alerta disparada
        },
        {
          id: 'auto-audi-04',
          marca: 'Audi',
          modelo: 'A4 Sedan Executive',
          categoria: 'PREMIUM',
          precio_diario: 110.0,
          estado_operativo: 'ENTREGADO',
          cooldown_activo: false,
          segundos_restantes_cooldown: 0,
          kilometraje_actual: 3400,
          umbral_mantenimiento_km: 15000,
          mantenimiento_requerido: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlota();
  }, []);

  // Tick local cada segundo para decrementar el temporizador del Cooldown en vivo
  useEffect(() => {
    const timer = setInterval(() => {
      setFlota((prev) =>
        prev.map((c) => {
          if (c.cooldown_activo && c.segundos_restantes_cooldown > 0) {
            const nextSec = c.segundos_restantes_cooldown - 1;
            return {
              ...c,
              segundos_restantes_cooldown: nextSec,
              estado_operativo: nextSec === 0 ? 'DISPONIBLE' : c.estado_operativo,
              cooldown_activo: nextSec > 0,
            };
          }
          return c;
        }),
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatCooldown = (segundos) => {
    if (segundos <= 0) return '00:00:00';
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getEstadoBadgeStyle = (estado) => {
    switch (estado) {
      case 'DISPONIBLE': return { bg: '#dcfce7', text: '#15803d' };
      case 'EN_LIMPIEZA': return { bg: '#fef3c7', text: '#b45309' };
      case 'EN_MANTENIMIENTO': return { bg: '#fee2e2', text: '#b91c1c' };
      case 'ENTREGADO': return { bg: '#e0f2fe', text: '#0369a1' };
      case 'RESERVADO': return { bg: '#ede9fe', text: '#6d28d9' };
      default: return { bg: '#f1f5f9', text: '#475569' };
    }
  };

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚗</span> Panel 2: Gestión de Flota de Autos y Cooldown de 2 Horas
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Máquina de estados de 6 fases, temporizador de cuarentena de limpieza y alertas por umbral de odómetro (Cátedra RDA2 §5).
          </p>
        </div>
        <button 
          onClick={fetchFlota}
          style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          🔄 Actualizar Flota
        </button>
      </div>

      {/* ALERTAS ACTIVAS POR KILOMETRAJE */}
      {flota.some((c) => (c.alerta_mantenimiento ?? c.mantenimiento_requerido)) && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '14px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>🚨</span>
          <div>
            <strong style={{ color: '#991b1b', fontSize: '0.95rem' }}>¡Alerta de Mantenimiento Preventivo Activada!</strong>
            <p style={{ margin: '2px 0 0 0', color: '#7f1d1d', fontSize: '0.85rem' }}>
              Uno o más vehículos han superado el umbral máximo de kilometraje ({'>'} 15,000 km) y han sido bloqueados automáticamente para alquiler hasta su servicio mecánico.
            </p>
          </div>
        </div>
      )}

      {/* GRID DE VEHÍCULOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '16px' }}>
        {flota.map((auto) => {
          const badge = getEstadoBadgeStyle(auto.estado_operativo);
          const kmRatio = Math.min(100, (auto.kilometraje_actual / auto.umbral_mantenimiento_km) * 100);

          return (
            <div 
              key={auto.id}
              style={{
                border: (auto.alerta_mantenimiento ?? auto.mantenimiento_requerido) ? '2px solid #ef4444' : '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '16px',
                background: auto.estado_operativo === 'EN_LIMPIEZA' ? '#fffbeb' : '#ffffff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{auto.marca} {auto.modelo}</strong>
                <span style={{ background: badge.bg, color: badge.text, padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                  {auto.estado_operativo}
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '12px' }}>
                Categoría: <strong>{auto.categoria}</strong> · Tarifa: <strong>${auto.precio_diario}/día</strong>
              </div>

              {/* CRONÓMETRO DE COOLDOWN DE 2 HORAS */}
              {auto.estado_operativo === 'EN_LIMPIEZA' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px', marginBottom: '14px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600, display: 'block' }}>
                    ⏳ Cuarentena de Limpieza (2 Horas Obligatorias)
                  </span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#b45309', fontFamily: 'monospace', marginTop: '4px' }}>
                    {formatCooldown(auto.segundos_restantes_cooldown)}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#78350f' }}>No disponible para renta hasta cumplir el ciclo</span>
                </div>
              )}

              {/* BARRA DE ODÓMETRO Y UMBRAL */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Odómetro: <strong>{auto.kilometraje_actual} km</strong></span>
                  <span style={{ color: (auto.alerta_mantenimiento ?? auto.mantenimiento_requerido) ? '#dc2626' : '#64748b' }}>
                    Umbral: {auto.umbral_mantenimiento_km} km
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${kmRatio}%`, 
                      height: '100%', 
                      background: (auto.alerta_mantenimiento ?? auto.mantenimiento_requerido) ? '#ef4444' : kmRatio > 80 ? '#f59e0b' : '#3b82f6',
                      transition: 'width 0.3s'
                    }} 
                  />
                </div>
              </div>

              {(auto.alerta_mantenimiento ?? auto.mantenimiento_requerido) && (
                <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600, background: '#fee2e2', padding: '6px', borderRadius: '4px', textAlign: 'center' }}>
                  ⚠️ Requiere cambio de aceite y filtros
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
