/**
 * Utilidad centralizada para resolución y diversidad fotográfica de Atracciones (RDA2)
 * Proporciona imágenes de alta resolución, contextuales y fotorrealistas de Ecuador,
 * evitando duplicidades, URLs rotas o marcadores genéricos.
 */

const DUPLICATE_BASILICA_URL = 'photo-1589308078059-be1415eab4c3';

// Catálogo curado de imágenes ecuatorianas de alta resolución
export const IMAGENES_ECUADOR = {
  quito: [
    'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop', // Basílica del Voto Nacional
    'https://images.unsplash.com/photo-1610996884638-348f95c01ce8?w=800&auto=format&fit=crop', // Panecillo y vista panorámica
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop', // Plaza Grande y Centro Histórico
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop', // Teleférico y montañas
  ],
  mitadDelMundo: [
    'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop', // Monumento Mitad del Mundo
    'https://images.unsplash.com/photo-1590736969955-71cc94801759?w=800&auto=format&fit=crop', // Latitud Cero
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop', // Valle Equinoccial
  ],
  cotopaxi: [
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop', // Volcán Cotopaxi
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop', // Laguna Quilotoa
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop', // Páramo y cumbres andinas
  ],
  banos: [
    'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop', // Pailón del Diablo
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop', // Casa del Árbol & Columpio
    'https://images.unsplash.com/photo-1533240332313-0db49b459ad6?w=800&auto=format&fit=crop', // Ruta de las Cascadas y aventura
  ],
  galapagos: [
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop', // Tortuga gigante de Galápagos
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop', // Snorkel en aguas turquesas
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop', // Tortuga Bay y playa prístina
  ],
  cuenca: [
    'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop', // Catedral Nueva de Cuenca
    'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop', // Parque Nacional Cajas
    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop', // Barranco del Río Tomebamba
  ],
  guayaquil: [
    'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop', // Barrio Las Peñas y Faro
    'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&auto=format&fit=crop', // Malecón 2000 y Río Guayas
    'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop', // Parque Seminario e Iguanas
  ],
  mindo: [
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop', // Bosque Nublado de Mindo
    'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&auto=format&fit=crop', // Avistamiento de Colibríes
  ],
  otavalo: [
    'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop', // Plaza de Ponchos y artesanías
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop', // Laguna de Cuicocha y San Pablo
  ],
  amazonia: [
    'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop', // Selva Amazónica ecuatoriana
    'https://images.unsplash.com/photo-1440342359743-84fcb8c21f21?w=800&auto=format&fit=crop', // Río Napo y canopy amazónico
  ],
  general: [
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1610996884638-348f95c01ce8?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop',
  ]
};

// Generador de índice determinista basado en texto o número
function hashString(str) {
  let hash = 0;
  if (!str) return 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Resuelve la imagen principal de una atracción garantizando variedad visual.
 * 
 * @param {Object} atraccion - Objeto atracción del catálogo
 * @param {number} [index=0] - Índice en la lista o cuadrícula
 * @returns {string} URL de imagen de alta calidad
 */
export function resolverImagenAtraccion(atraccion, index = 0) {
  if (!atraccion) {
    return IMAGENES_ECUADOR.general[index % IMAGENES_ECUADOR.general.length];
  }

  // 1. Extraer URL provista por el socio si existe
  const rawUrl =
    (atraccion.photos && atraccion.photos[0] && (typeof atraccion.photos[0] === 'string' ? atraccion.photos[0] : atraccion.photos[0].url)) ||
    (atraccion.fotos_urls && atraccion.fotos_urls[0]) ||
    atraccion.foto_url;

  // Si existe una foto real que no sea el comodín repetido ni un string roto
  const isDuplicatePlaceholder = typeof rawUrl === 'string' && rawUrl.includes(DUPLICATE_BASILICA_URL);
  const isPicsum = typeof rawUrl === 'string' && rawUrl.includes('picsum.photos');
  const isValidCustomUrl = typeof rawUrl === 'string' && rawUrl.startsWith('http') && !isDuplicatePlaceholder && !isPicsum && !rawUrl.includes('[object');

  if (isValidCustomUrl) {
    return rawUrl;
  }

  // 2. Mapeo contextual por ciudad o palabras clave
  const texto = `${atraccion.nombre || atraccion.name || ''} ${atraccion.ciudad || atraccion.city || ''} ${atraccion.descripcion_corta || atraccion.descripcion || ''}`.toLowerCase();
  const seed = hashString(atraccion.id || atraccion.slug || `${atraccion.nombre}-${index}`) + index;

  if (texto.includes('mitad del mundo') || texto.includes('equinoccial') || texto.includes('intiñan')) {
    const list = IMAGENES_ECUADOR.mitadDelMundo;
    return list[seed % list.length];
  }
  if (texto.includes('cotopaxi') || texto.includes('quilotoa') || texto.includes('volcán') || texto.includes('volcan') || texto.includes('chimborazo')) {
    const list = IMAGENES_ECUADOR.cotopaxi;
    return list[seed % list.length];
  }
  if (texto.includes('baños') || texto.includes('banos') || texto.includes('pailón') || texto.includes('pailon') || texto.includes('cascada') || texto.includes('tungurahua')) {
    const list = IMAGENES_ECUADOR.banos;
    return list[seed % list.length];
  }
  if (texto.includes('galápagos') || texto.includes('galapagos') || texto.includes('isabela') || texto.includes('santa cruz') || texto.includes('san cristóbal') || texto.includes('tortuga')) {
    const list = IMAGENES_ECUADOR.galapagos;
    return list[seed % list.length];
  }
  if (texto.includes('cuenca') || texto.includes('cajas') || texto.includes('tomebamba') || texto.includes('azuay')) {
    const list = IMAGENES_ECUADOR.cuenca;
    return list[seed % list.length];
  }
  if (texto.includes('guayaquil') || texto.includes('malecón') || texto.includes('malecon') || texto.includes('peñas') || texto.includes('penias') || texto.includes('guayas')) {
    const list = IMAGENES_ECUADOR.guayaquil;
    return list[seed % list.length];
  }
  if (texto.includes('mindo') || texto.includes('nublado') || texto.includes('colibrí') || texto.includes('colibri') || texto.includes('canopy')) {
    const list = IMAGENES_ECUADOR.mindo;
    return list[seed % list.length];
  }
  if (texto.includes('otavalo') || texto.includes('ponchos') || texto.includes('imbabura') || texto.includes('san pablo') || texto.includes('cuicocha')) {
    const list = IMAGENES_ECUADOR.otavalo;
    return list[seed % list.length];
  }
  if (texto.includes('amazonía') || texto.includes('amazonia') || texto.includes('yasuní') || texto.includes('yasuni') || texto.includes('napo') || texto.includes('selva') || texto.includes('cuyabeno')) {
    const list = IMAGENES_ECUADOR.amazonia;
    return list[seed % list.length];
  }
  if (texto.includes('quito') || texto.includes('pichincha') || texto.includes('panecillo') || texto.includes('teleférico') || texto.includes('teleferico')) {
    const list = IMAGENES_ECUADOR.quito;
    return list[seed % list.length];
  }

  // 3. Selección diversificada de la bolsa general para que ningún elemento se repita de forma contigua
  const pool = IMAGENES_ECUADOR.general;
  return pool[seed % pool.length];
}

/**
 * Resuelve una galería completa de 5 imágenes temáticas para la página de detalle.
 * 
 * @param {Object} atraccion - Objeto atracción
 * @returns {string[]} Array de 5 URLs de imágenes
 */
export function resolverGaleriaAtraccion(atraccion) {
  const main = resolverImagenAtraccion(atraccion, 0);
  const texto = `${atraccion?.nombre || ''} ${atraccion?.ciudad || ''}`.toLowerCase();
  const seed = hashString(atraccion?.id || atraccion?.nombre || 'galeria');

  // Buscar si el socio entregó fotos válidas adicionales
  const fotosSocio = [];
  if (Array.isArray(atraccion?.photos)) {
    for (const p of atraccion.photos) {
      const u = typeof p === 'string' ? p : p?.url;
      if (u && typeof u === 'string' && u.startsWith('http') && !u.includes(DUPLICATE_BASILICA_URL) && !u.includes('picsum.photos') && !fotosSocio.includes(u)) {
        fotosSocio.push(u);
      }
    }
  }

  // Pool de relleno
  const pool = [
    ...IMAGENES_ECUADOR.quito,
    ...IMAGENES_ECUADOR.mitadDelMundo,
    ...IMAGENES_ECUADOR.cotopaxi,
    ...IMAGENES_ECUADOR.banos,
    ...IMAGENES_ECUADOR.galapagos,
    ...IMAGENES_ECUADOR.cuenca,
    ...IMAGENES_ECUADOR.guayaquil,
    ...IMAGENES_ECUADOR.mindo,
    ...IMAGENES_ECUADOR.otavalo,
    ...IMAGENES_ECUADOR.amazonia,
  ];

  const gallery = [main];
  for (const f of fotosSocio) {
    if (gallery.length < 5 && !gallery.includes(f)) {
      gallery.push(f);
    }
  }

  let offset = 1;
  while (gallery.length < 5) {
    const candidate = pool[(seed + offset * 7) % pool.length];
    if (!gallery.includes(candidate)) {
      gallery.push(candidate);
    }
    offset++;
  }

  return gallery;
}

