const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { data } = await axios.get(
    'https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3/atracciones?limit=50',
    { headers: { 'x-api-key': '40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568' } }
  );

  const items = Array.isArray(data) ? data : (data.items || data.data || []);
  console.log('Total fetched from Dilan:', items.length);

  for (const item of items) {
    const slug = (item.nombre || item.name || 'atr-dec')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    let precio = 50.0;
    if (item.price && typeof item.price === 'object') {
      precio = Number(item.price.adult || item.price.adulto || 50.0);
    } else if (item.precio && typeof item.precio === 'object') {
      precio = Number(item.precio.adulto || item.precio.adult || 50.0);
    } else if (item.precio_unitario_adulto) {
      precio = Number(item.precio_unitario_adulto);
    }

    const photo = (item.photos && item.photos[0]) || (item.fotos_urls && item.fotos_urls[0]) || 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800';
    const ciudad = item.ciudad || item.city || 'Quito';
    const duracion = item.duracion || item.duration || '2 horas';
    const puntoEncuentro = item.punto_encuentro || item.punto_encuentro_geo?.address || 'Quito Centro';
    const descCorta = (item.descripcion_corta || item.short_description || item.descripcion || item.description || item.nombre || item.name || '').slice(0, 250);
    const descLarga = item.descripcion_larga || item.description || item.descripcion || descCorta;
    const inclusiones = Array.isArray(item.inclusiones_list) ? item.inclusiones_list : (Array.isArray(item.inclusiones) ? item.inclusiones : ['Transporte', 'Guía']);

    await client.query(
      `INSERT INTO schema_atracciones.atracciones_items (
        id, nombre, slug, ciudad, pais, descripcion_corta, descripcion_larga,
        duracion_estimada, precio_unitario_adulto, moneda, cancelacion_gratis,
        adicion_animales_servicio, accesible_silla_ruedas, idiomas_soportados,
        punto_encuentro, latitud, longitud, fotos_urls, inclusiones,
        rating_general, reviews_count, activo, proveedor_codigo, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'Ecuador', $5, $6, $7, $8, 'USD', true, true, true,
        ARRAY['Español', 'Inglés'], $9, -0.220981, -78.514658, $10, $11,
        9.8, 120, true, 'NODE_ATR_DILAN', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        descripcion_corta = EXCLUDED.descripcion_corta,
        descripcion_larga = EXCLUDED.descripcion_larga,
        precio_unitario_adulto = EXCLUDED.precio_unitario_adulto,
        ciudad = EXCLUDED.ciudad,
        duracion_estimada = EXCLUDED.duracion_estimada,
        punto_encuentro = EXCLUDED.punto_encuentro,
        fotos_urls = EXCLUDED.fotos_urls,
        inclusiones = EXCLUDED.inclusiones,
        activo = true,
        proveedor_codigo = 'NODE_ATR_DILAN',
        updated_at = NOW()`,
      [
        item.id,
        item.nombre || item.name,
        `${slug}-${item.id.slice(0, 6)}`,
        ciudad,
        descCorta,
        descLarga,
        duracion,
        precio,
        puntoEncuentro,
        [photo],
        inclusiones,
      ]
    );
  }

  const check = await client.query(`SELECT id, nombre, ciudad, precio_unitario_adulto, proveedor_codigo FROM schema_atracciones.atracciones_items WHERE id = '6f035852-c8a8-49b1-a771-1b34b07e972d'`);
  console.log('Inserted item in DB:', check.rows);

  await client.end();
}
run().catch(console.error);

