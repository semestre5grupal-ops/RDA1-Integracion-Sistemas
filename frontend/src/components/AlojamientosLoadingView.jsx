import React from 'react';
import { BedIcon } from './BookingIcons';

const HOTELES_LOADING = [
  { nombre: 'Marriott', bg: '#1c1c1c', color: '#b9975b', label: 'Marriott' },
  { nombre: 'Hilton', bg: '#00266b', color: '#ffffff', label: 'Hilton' },
  { nombre: 'Hyatt', bg: '#2b2d42', color: '#ffffff', label: 'HYATT' },
  { nombre: 'Sheraton', bg: '#00263e', color: '#c5a96f', label: 'Sheraton' },
  { nombre: 'Holiday Inn', bg: '#008542', color: '#ffffff', label: 'Holiday Inn' },
  { nombre: 'Radisson', bg: '#0f2027', color: '#4aa0dc', label: 'Radisson' },
  { nombre: 'Ibis', bg: '#e2001a', color: '#ffffff', label: 'ibis' },
  { nombre: 'Wyndham', bg: '#003366', color: '#00a3e0', label: 'WYNDHAM' },
  { nombre: 'Best Western', bg: '#00386b', color: '#eaaa00', label: 'Best Western' },
  { nombre: 'NH Hotels', bg: '#002b49', color: '#c19b66', label: 'NH Hotels' },
  { nombre: 'Accor', bg: '#1b365d', color: '#bfa75d', label: 'ACCOR' },
  { nombre: 'Posadas', bg: '#003580', color: '#ffffff', label: 'Posadas' },
];

export function AlojamientosLoadingView({ destino = 'Ecuador' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 20px', minHeight: '80vh', background: 'white' }}>
      <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '12px', textAlign: 'center' }}>
        Estamos personalizando tu experiencia
      </h2>
      <p style={{ color: '#595959', fontSize: '1.05rem', margin: '0 0 36px 0', textAlign: 'center' }}>
        Buscando las mejores ofertas y disponibilidad en tiempo real{destino ? ` en ${destino}` : ''}...
      </p>

      {/* Barra de progreso animada */}
      <div style={{ width: '100%', maxWidth: '800px', height: '8px', background: '#f0f0f0', borderRadius: '4px', marginBottom: '60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: '#006ce4', width: '40%', animation: 'loading-slide 1.5s infinite ease-in-out' }}></div>
      </div>

      {/* Grilla de cadenas y partners hoteleros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', maxWidth: '800px', marginBottom: '80px' }}>
        {HOTELES_LOADING.map((h, i) => (
          <div
            key={`load-hotel-${i}`}
            style={{
              width: '110px',
              height: '50px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: h.bg,
              color: h.color,
              fontWeight: '900',
              borderRadius: '4px',
              fontSize: '0.95rem',
              border: '1px solid #e7e7e7',
              letterSpacing: '-0.5px',
              textAlign: 'center',
              padding: '0 4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}
          >
            {h.label}
          </div>
        ))}
      </div>

      {/* Indicador inferior descriptivo SIN emojis */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BedIcon size={24} color="#006ce4" />
        </div>
        <div>
          <h4 style={{ fontWeight: 'bold', color: '#1a1a1a', margin: 0, fontSize: '1.1rem' }}>
            Alojamientos de todas las categorías
          </h4>
          <p style={{ color: '#595959', margin: 0, fontSize: '0.95rem' }}>
            Hoteles, departamentos y villas para todo tipo de viajes
          </p>
        </div>
      </div>

      <style>
        {`
          @keyframes loading-slide {
            0% { left: -40%; }
            100% { left: 100%; }
          }
          @media (max-width: 768px) {
            div[style*="gridTemplateColumns: repeat(6, 1fr)"] {
              grid-template-columns: repeat(3, 1fr) !important;
            }
          }
        `}
      </style>
    </div>
  );
}

export default AlojamientosLoadingView;
