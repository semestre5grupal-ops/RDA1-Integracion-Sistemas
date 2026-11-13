/**
 * Utilidades compartidas para mapas Leaflet con OpenStreetMap
 * - Teselas públicas: https://tile.openstreetmap.org/{z}/{x}/{y}.png
 * - Atribución obligatoria: © OpenStreetMap contributors
 */

import { OSM_TILES_URL, OSM_ATTRIBUTION, OSM_ATTRIBUTION_TEXT } from '../services/geocodificacionService';

export { OSM_TILES_URL, OSM_ATTRIBUTION, OSM_ATTRIBUTION_TEXT };

/**
 * Carga dinámica de Leaflet (script y CSS) en tiempo de ejecución
 * si no está cargado globalmente en window.L.
 */
let leafletLoadPromise = null;

export function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    // 1. Inyectar CSS si no está
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    // 2. Inyectar JS de Leaflet
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.async = true;

    script.onload = () => {
      if (window.L) {
        resolve(window.L);
      } else {
        reject(new Error('Leaflet cargado pero window.L no está definido'));
      }
    };

    script.onerror = () => {
      reject(new Error('No se pudo cargar la librería Leaflet'));
    };

    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

/**
 * Crea un icono HTML personalizado para hoteles con precio o símbolo.
 */
export function crearIconoPrecio(L, precioTexto, destacado = false) {
  return L.divIcon({
    className: 'custom-leaflet-price-pin',
    html: `
      <div style="
        background: ${destacado ? '#003580' : '#006ce4'};
        color: #ffffff;
        font-weight: 700;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        border: 2px solid #ffffff;
        white-space: nowrap;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease, background 0.15s ease;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display: block;"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/></svg>
        <span>${precioTexto}</span>
      </div>
    `,
    iconSize: [64, 24],
    iconAnchor: [32, 12],
  });
}

/**
 * Crea un icono de chincheta estándar para ubicación única de alojamiento.
 */
export function crearIconoHotelPrincipal(L) {
  return L.divIcon({
    className: 'custom-leaflet-main-pin',
    html: `
      <div style="
        position: relative;
        width: 36px;
        height: 36px;
        background: #d4111e;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        border: 2px solid #fff;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" style="transform: rotate(45deg);"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/></svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

