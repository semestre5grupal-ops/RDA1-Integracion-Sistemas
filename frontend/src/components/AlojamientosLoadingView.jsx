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

export function AlojamientosLoadingView({ destino = 'Ecuador', frases = FRASES_LOADING, subtitulo }) {
  const [fraseIndex, setFraseIndex] = useState(0);
  const [activoIcono, setActivoIcono] = useState(0);

  useEffect(() => {
    const fraseTimer = setInterval(() => {
      setFraseIndex((prev) => (prev + 1) % frases.length);
    }, 2400);

    const iconTimer = setInterval(() => {
      setActivoIcono((prev) => (prev + 1) % ICONOS_CARACTERISTICAS.length);
    }, 1200);

    return () => {
      clearInterval(fraseTimer);
      clearInterval(iconTimer);
    };
  }, [frases.length]);

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
        {frases[fraseIndex]}
      </h2>

      <p style={{ color: '#595959', fontSize: '1.05rem', margin: '0 0 32px 0', textAlign: 'center' }}>
        {subtitulo || `Conectando con la red hotelera${destino ? ` en ${destino}` : ''}`}
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

      {/* Conjunto de iconos vectoriales SVG oficiales (limpios, sin bordes ni pastillas) */}
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
                gap: '10px',
                padding: '8px 4px',
                background: 'transparent',
                border: 'none',
                transition: 'transform 0.3s ease',
                transform: isHighlight ? 'translateY(-2px)' : 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.3s ease',
                  transform: isHighlight ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                <IconComp size={28} color={isHighlight ? '#006ce4' : '#64748b'} />
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: isHighlight ? '#003580' : '#64748b',
                  fontWeight: isHighlight ? 700 : 500,
                  textAlign: 'center',
                  lineHeight: '1.25',
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Indicador de confianza minimalista (limpio, sin pastilla ni bordes) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#475569',
        }}
      >
        <CheckmarkIcon size={16} color="#008009" />
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
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
