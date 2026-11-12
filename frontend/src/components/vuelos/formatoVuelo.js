import { extraerHora, formatearMoneda } from '../../services/formato';

/** "vie, 13 nov 2026" en hora de Ecuador. */
export function fechaLarga(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function hora(iso) {
  return iso ? extraerHora(iso) : '--:--';
}

export function duracion(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Hora de embarque: 40 min antes de la salida. */
export function horaEmbarque(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '--:--';
  return extraerHora(new Date(Date.parse(iso) - 40 * 60_000).toISOString());
}

export function dinero(v, moneda) {
  return v == null ? '—' : formatearMoneda(v, moneda || 'USD');
}

export const ESTADOS_RESERVA = {
  CONFIRMED: { texto: 'Confirmada', color: '#0d7a2f', fondo: '#e8f5ee' },
  TICKETED: { texto: 'Emitida', color: '#0d7a2f', fondo: '#e8f5ee' },
  CHECKED_IN: { texto: 'Check-in realizado', color: '#1d4ed8', fondo: '#eff6ff' },
  CANCELLED: { texto: 'Cancelada', color: '#b42318', fondo: '#fde7e5' },
  PENDING: { texto: 'Pendiente', color: '#9a5b00', fondo: '#fdf1dc' },
};

/**
 * Patrón de código de embarque (decorativo, determinista) a partir de un texto:
 * una matriz de 21×21 con las tres esquinas de posicionamiento típicas de un QR.
 * El texto real (PNR, pasajero, vuelo, asiento) va impreso al lado.
 */
export function matrizCodigo(texto, n = 21) {
  let h = 2166136261;
  const bits = [];
  for (let i = 0; i < n * n; i++) {
    h ^= texto.charCodeAt(i % Math.max(1, texto.length)) + i;
    h = Math.imul(h, 16777619) >>> 0;
    bits.push((h >>> 7) & 1);
  }
  const m = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => bits[y * n + x] === 1));
  const ojo = (ox, oy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const borde = x === 0 || y === 0 || x === 6 || y === 6;
      const centro = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      m[oy + y][ox + x] = borde || centro;
    }
    for (let i = 0; i < 8; i++) {
      if (oy + 7 < n && ox + i < n) m[oy + 7][ox + i] = false;
      if (ox + 7 < n && oy + i < n) m[oy + i][ox + 7] = false;
    }
  };
  ojo(0, 0);
  ojo(n - 7, 0);
  ojo(0, n - 7);
  // los separadores de los ojos de la derecha/abajo
  for (let i = 0; i < 8; i++) {
    if (n - 8 >= 0) m[i < n ? i : 0][n - 8] = false;
    if (n - 8 >= 0) m[n - 8][i] = false;
  }
  return m;
}
