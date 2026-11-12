import React from 'react';

const OPERADORES_LOADING = [
  { nombre: 'Descubre EC', bg: '#003580', color: 'white', label: 'Descubre EC' },
  { nombre: 'Ecuatravel', bg: '#00805a', color: 'white', label: 'Ecuatravel' },
  { nombre: 'TourGirls', bg: '#0d47a1', color: 'white', label: 'TourGirls' },
  { nombre: 'Andes Explora', bg: '#f25c05', color: 'white', label: 'Andes Explora' },
  { nombre: 'Vívelo Ecuador', bg: '#c62828', color: 'white', label: 'Vívelo Ecuador' },
  { nombre: 'Mitad del Mundo', bg: '#fdd306', color: '#000', label: 'Mitad Mundo' },
  { nombre: 'Baños Adventure', bg: '#0288d1', color: 'white', label: 'Baños Adv.' },
  { nombre: 'Galápagos Safari', bg: '#00897b', color: 'white', label: 'Galápagos' },
  { nombre: 'Mindo Forest', bg: '#2e7d32', color: 'white', label: 'Mindo Forest' },
  { nombre: 'Cotopaxi Trek', bg: '#37474f', color: 'white', label: 'Cotopaxi' },
  { nombre: 'Otavalo Cultural', bg: '#7b1fa2', color: 'white', label: 'Otavalo' },
  { nombre: 'Amazonía Tours', bg: '#d84315', color: 'white', label: 'Amazonía' },
];

export function AtraccionesLoadingView({ titulo = 'Buscando las mejores ofertas entre cientos de experiencias' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 20px', minHeight: '80vh', background: 'white' }}>
      <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333', marginBottom: '40px', textAlign: 'center' }}>
        {titulo}
      </h2>

      {/* Barra de progreso animada */}
      <div style={{ width: '100%', maxWidth: '800px', height: '8px', background: '#f0f0f0', borderRadius: '4px', marginBottom: '60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: '#006ce4', width: '40%', animation: 'loading-slide 1.5s infinite ease-in-out' }}></div>
      </div>

      {/* Grilla de operadores oficiales y destinos ecuatorianos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '20px', maxWidth: '800px', marginBottom: '80px' }}>
        {OPERADORES_LOADING.map((op, i) => (
          <div
            key={`load-op-${i}`}
            style={{
              width: '110px',
              height: '50px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: op.bg,
              color: op.color,
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
            {op.label}
          </div>
        ))}
      </div>

      {/* Indicador inferior descriptivo */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <span style={{ fontSize: '2.4rem' }}>🎟️</span>
        <div>
          <h4 style={{ fontWeight: 'bold', color: '#333', margin: 0, fontSize: '1.1rem' }}>
            Experiencias y tours para todos los gustos
          </h4>
          <p style={{ color: '#666', margin: 0, fontSize: '1rem' }}>
            para todo tipo de viajeros
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

export default AtraccionesLoadingView;

