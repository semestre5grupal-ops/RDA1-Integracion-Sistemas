import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../hooks/CurrencyContext';
import { HeartIcon, BookingGeniusBadge } from './BookingIcons';

export function AlojamientoCard({ alojamiento, nights = 2, showDealBadge = true, isGenius = true }) {
  const navigate = useNavigate();
  const { convertPrice, currency } = useCurrency();
  const [isSaved, setIsSaved] = useState(false);
  const id = alojamiento?.id || '';

  const pricePerNight = parseFloat(
    alojamiento?.precioPorNoche || alojamiento?.price?.total || alojamiento?.price || 45
  );
  const totalPrice = Math.round(pricePerNight * nights);
  const originalPrice = Math.round(totalPrice * 1.18);

  const rawScore = Number(
    alojamiento?.ratings?.score || (8.5 + (Math.abs(String(id).charCodeAt(0) || 5) % 12) / 10)
  ).toFixed(1);
  const reviewCount = alojamiento?.ratings?.number_of_reviews || (120 + (Math.abs(String(id).charCodeAt(1) || 3) * 7));

  const getScoreLabel = (score) => {
    const s = Number(score);
    if (s >= 9.0) return 'Excelente';
    if (s >= 8.5) return 'Fantástico';
    if (s >= 8.0) return 'Muy bien';
    return 'Bien';
  };

  const rawFoto = alojamiento?.photos?.[0]?.url;
  const foto = (rawFoto && !rawFoto.includes('example.com'))
    ? rawFoto
    : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600';

  const destinoStr = alojamiento?.destino
    ? `${alojamiento.destino}, Ecuador`
    : 'Quito, Ecuador';

  return (
    <div
      onClick={() => navigate(`/alojamientos/${id}`)}
      style={{
        background: '#ffffff',
        border: '1px solid #e7e7e7',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* 1. Image Header with 5:4 aspect ratio & Wishlist Heart */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '5 / 4',
          backgroundColor: '#f3f4f6',
          overflow: 'hidden',
        }}
      >
        <img
          src={foto}
          alt={alojamiento?.nombre || 'Alojamiento'}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600';
          }}
        />

        {/* Wishlist Circle Button */}
        <button
          type="button"
          aria-label="Guardar alojamiento en la lista"
          onClick={(e) => {
            e.stopPropagation();
            setIsSaved(!isSaved);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <HeartIcon size={18} filled={isSaved} color="#e11d48" outlineColor="#1a1a1a" />
        </button>
      </div>

      {/* 2. Content Details */}
      <div
        style={{
          padding: '10px 12px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <div>
          {/* Genius badge if applicable */}
          {isGenius && (
            <div style={{ marginBottom: '4px' }}>
              <BookingGeniusBadge width={60} height={24} />
            </div>
          )}

          {/* Property Title */}
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#1a1a1a',
              margin: '0 0 2px 0',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {alojamiento?.nombre}
          </h3>

          {/* Location */}
          <div style={{ fontSize: '0.85rem', color: '#595959', marginBottom: '6px' }}>
            {destinoStr}
          </div>

          {/* Rating Block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#008009' }}>
              {getScoreLabel(rawScore)}
            </span>
          </div>

          {/* Late Escape Deal badge */}
          {showDealBadge && (
            <div style={{ marginTop: '4px' }}>
              <span
                style={{
                  background: '#008009',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  display: 'inline-block',
                }}
              >
                Oferta de escapada
              </span>
            </div>
          )}
        </div>

        {/* 3. Price Block */}
        <div style={{ marginTop: '8px', textAlign: 'right' }}>
          <div style={{ fontSize: '0.78rem', color: '#595959' }}>
            {nights} noches
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '6px' }}>
            <s style={{ color: '#d4111e', fontSize: '0.85rem', textDecoration: 'line-through' }}>
              {currency} {convertPrice(originalPrice)}
            </s>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1a1a1a' }}>
              {currency} {convertPrice(totalPrice)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
