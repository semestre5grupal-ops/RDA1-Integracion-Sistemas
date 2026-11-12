import React, { useState, useEffect } from 'react';
import {
  BedIcon,
  PinIcon,
  CalendarIcon,
  CheckmarkIcon,
  HeartIcon,
  GeniusGiftIcon,
} from './BookingIcons';

const FRASES_LOADING = [
  'Estamos buscando los mejores hoteles...',
  'Verificando disponibilidad y tarifas en tiempo real...',
  'Comparando opciones para darte la mejor estadía...',
  'Estamos personalizando tu experiencia...',
  'Casi listo, organizando tus resultados...',
];

const ICONOS_CARACTERISTICAS = [
  { icon: BedIcon, label: 'Habitaciones y suites' },
  { icon: PinIcon, label: 'Ubicaciones céntricas' },
  { icon: CalendarIcon, label: 'Fechas flexibles' },
  { icon: CheckmarkIcon, label: 'Disponibilidad en vivo' },
  { icon: GeniusGiftIcon, label: 'Tarifas preferenciales' },
  { icon: HeartIcon, label: 'Alojamientos destacados' },
];

export function AlojamientosLoadingView({ destino = 'Ecuador' }) {
  const [fraseIndex, setFraseIndex] = useState(0);
  const [activoIcono, setActivoIcono] = useState(0);

  useEffect(() => {
    const fraseTimer = setInterval(() => {
      setFraseIndex((prev) => (prev + 1) % FRASES_LOADING.length);
    }, 2400);

    const iconTimer = setInterval(() => {
      setActivoIcono((prev) => (prev + 1) % ICONOS_CARACTERISTICAS.length);
    }, 1200);

    return () => {
      clearInterval(fraseTimer);
      clearInterval(iconTimer);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '90px 20px', minHeight: '75vh', background: '#ffffff' }}>
      {/* Título dinámico que rota con suavidad */}
      <h2
        key={fraseIndex}
        style={{
          fontSize: '1.9rem',
          fontWeight: 700,
          color: '#1a1a1a',
          marginBottom: '10px',
          textAlign: 'center',
          animation: 'fadeInText 0.4s ease-in-out',
        }}
      >
        {FRASES_LOADING[fraseIndex]}
      </h2>

      <p style={{ color: '#595959', fontSize: '1.05rem', margin: '0 0 32px 0', textAlign: 'center' }}>
        Conectando con la red hotelera{destino ? ` en ${destino}` : ''}
      </p>

      {/* Barra de progreso animada */}
      <div style={{ width: '100%', maxWidth: '680px', height: '6px', background: '#e5e7eb', borderRadius: '4px', marginBottom: '48px', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            background: '#006ce4',
            width: '40%',
            borderRadius: '4px',
            animation: 'loading-slide 1.5s infinite ease-in-out',
          }}
        />
      </div>

      {/* Conjunto de iconos vectoriales SVG oficiales (sin emojis ni rectángulos) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '16px',
          maxWidth: '720px',
          width: '100%',
          marginBottom: '48px',
        }}
      >
        {ICONOS_CARACTERISTICAS.map((item, idx) => {
          const IconComp = item.icon;
          const isHighlight = idx === activoIcono;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 10px',
                borderRadius: '12px',
                border: isHighlight ? '1.5px solid #006ce4' : '1px solid #f0f0f0',
                background: isHighlight ? '#eff6ff' : '#fafafa',
                transition: 'all 0.3s ease',
                transform: isHighlight ? 'translateY(-2px)' : 'none',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: isHighlight ? '#006ce4' : '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'background 0.3s ease',
                }}
              >
                <IconComp size={22} color={isHighlight ? '#ffffff' : '#003580'} />
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  color: isHighlight ? '#003580' : '#4b5563',
                  fontWeight: isHighlight ? 700 : 500,
                  textAlign: 'center',
                  lineHeight: '1.2',
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Indicador de confianza minimalista */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 18px',
          background: '#f8fafc',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
        }}
      >
        <CheckmarkIcon size={16} color="#008009" />
        <span style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 500 }}>
          Tarifas transparentes y confirmación inmediata
        </span>
      </div>

      <style>
        {`
          @keyframes loading-slide {
            0% { left: -40%; }
            100% { left: 100%; }
          }
          @keyframes fadeInText {
            from { opacity: 0.3; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (max-width: 640px) {
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
