/**
 * Servicio de geocodificación usando el servicio público Nominatim de OpenStreetMap
 * Conforme a las condiciones de uso de OSM Nominatim:
 * - Se limita la frecuencia de consultas (mínimo 1000ms entre llamadas de red)
 * - Se implementa caché en memoria para evitar consultas duplicadas
 * - Se incluye la atribución obligatoria "© OpenStreetMap contributors"
 * - Coordenadas fallback para destinos frecuentes de Ecuador para alta disponibilidad y resiliencia offline.
 */

export const OSM_TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
export const OSM_ATTRIBUTION_TEXT = '© OpenStreetMap contributors';

// Fallback de coordenadas conocidas (Ecuador y destinos frecuentes)
export const DESTINOS_COORDENADAS_FALLBACK = {
  quito: { lat: -0.180653, lng: -78.467834, zoom: 13 },
  guayaquil: { lat: -2.189412, lng: -79.889066, zoom: 13 },
  cuenca: { lat: -2.900128, lng: -79.005896, zoom: 13 },
  galapagos: { lat: -0.743187, lng: -90.313454, zoom: 11 },
  'santa cruz': { lat: -0.743187, lng: -90.313454, zoom: 12 },
  'puerto ayora': { lat: -0.743187, lng: -90.313454, zoom: 14 },
  'san cristobal': { lat: -0.902263, lng: -89.609489, zoom: 13 },
  banos: { lat: -1.396389, lng: -78.424722, zoom: 14 },
  'baños': { lat: -1.396389, lng: -78.424722, zoom: 14 },
  manta: { lat: -0.967653, lng: -80.708910, zoom: 13 },
  salinas: { lat: -2.214472, lng: -80.951556, zoom: 13 },
  montanita: { lat: -1.828611, lng: -80.752778, zoom: 14 },
  'montañita': { lat: -1.828611, lng: -80.752778, zoom: 14 },
  otavalo: { lat: 0.234167, lng: -78.261944, zoom: 13 },
  ibarra: { lat: 0.351667, lng: -78.122222, zoom: 13 },
  loja: { lat: -3.993130, lng: -79.204224, zoom: 13 },
  ecuador: { lat: -1.831239, lng: -78.183406, zoom: 7 },
};

// Caché en memoria para evitar saturar el servicio público Nominatim
const geocodeCache = new Map();

// Cola de peticiones con limitación de frecuencia (1 req por segundo según condiciones de uso)
let ultimaPeticionTs = 0;
const MIN_INTERVALO_MS = 1000;

async function esperarTurno() {
  const ahora = Date.now();
  const transcurrido = ahora - ultimaPeticionTs;
  if (transcurrido < MIN_INTERVALO_MS) {
    const espera = MIN_INTERVALO_MS - transcurrido;
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
  ultimaPeticionTs = Date.now();
}

/**
 * Busca las coordenadas de una dirección o ciudad usando OpenStreetMap Nominatim.
 * @param {string} direccion - Dirección, lugar o ciudad a consultar
 * @returns {Promise<{ lat: number, lng: number, displayName?: string, error?: string }>}
 */
export async function buscarCoordenadasNominatim(direccion) {
  if (!direccion || typeof direccion !== 'string' || !direccion.trim()) {
    return { ...DESTINOS_COORDENADAS_FALLBACK.quito };
  }

  const queryLimpia = direccion.trim().toLowerCase();

  // 1. Revisar caché en memoria
  if (geocodeCache.has(queryLimpia)) {
    return geocodeCache.get(queryLimpia);
  }

  // 2. Verificar coincidencias en fallback local
  for (const [key, coords] of Object.entries(DESTINOS_COORDENADAS_FALLBACK)) {
    if (queryLimpia === key || queryLimpia.includes(key)) {
      geocodeCache.set(queryLimpia, coords);
      return coords;
    }
  }

  // 3. Consultar servicio público Nominatim con rate-limiting
  try {
    await esperarTurno();

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error en Nominatim: ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const resultado = {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        displayName: item.display_name,
        zoom: 14,
      };
      geocodeCache.set(queryLimpia, resultado);
      return resultado;
    }
  } catch (err) {
    console.warn('[Nominatim] Error o bloqueo al consultar dirección:', direccion, err);
  }

  // Si no se encuentra en Nominatim o hay fallo de red, fallback a Quito
  const fallback = DESTINOS_COORDENADAS_FALLBACK.quito;
  geocodeCache.set(queryLimpia, fallback);
  return fallback;
}

/**
 * Extrae o resuelve las coordenadas de un alojamiento.
 * Prioriza coordenadas ya presentes en el modelo de datos.
 */
export function obtenerCoordenadasAlojamiento(alojamiento) {
  if (!alojamiento) return { lat: -0.180653, lng: -78.467834 };

  // Formato ubicacion.coordinates.latitude / longitude (modelo TypeORM)
  const coordsObj = alojamiento.ubicacion?.coordinates;
  if (coordsObj?.latitude && coordsObj?.longitude) {
    return {
      lat: Number(coordsObj.latitude),
      lng: Number(coordsObj.longitude),
    };
  }

  // Formatos directos lat / lng
  if (alojamiento.lat && alojamiento.lng) {
    return { lat: Number(alojamiento.lat), lng: Number(alojamiento.lng) };
  }
  if (alojamiento.ubicacion?.lat && alojamiento.ubicacion?.lng) {
    return { lat: Number(alojamiento.ubicacion.lat), lng: Number(alojamiento.ubicacion.lng) };
  }

  // Determinar por destino
  const destinoKey = (alojamiento.destino || alojamiento.ubicacion?.city || alojamiento.ciudad || '').toLowerCase();
  for (const [key, coords] of Object.entries(DESTINOS_COORDENADAS_FALLBACK)) {
    if (destinoKey.includes(key)) {
      // Agregar un pequeño jitter para que los hoteles del mismo destino no se encimen exactamente en el mismo pixel
      const hash = String(alojamiento.id || alojamiento.nombre || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const deltaLat = ((hash % 100) - 50) * 0.0003;
      const deltaLng = (((hash * 7) % 100) - 50) * 0.0003;
      return {
        lat: coords.lat + deltaLat,
        lng: coords.lng + deltaLng,
      };
    }
  }

  return { lat: -0.180653, lng: -78.467834 };
}

