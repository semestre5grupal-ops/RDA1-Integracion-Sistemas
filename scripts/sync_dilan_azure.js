const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function syncDilan() {
  await client.connect();
  console.log('Fetching Dilan tours from Azure Container App...');
  const res = await axios.get('https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3/atracciones?limit=50', {
    headers: { 'x-api-key': '40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568' }
  });

  const items = Array.isArray(res.data) ? res.data : (res.data.items || res.data.data || []);
  console.log(`Fetched ${items.length} items from Dilan`);

  await client.query(`DELETE FROM schema_atracciones.atracciones_items WHERE proveedor_codigo = 'NODE_ATR_DILAN'`);
  console.log('Cleared old NODE_ATR_DILAN records for clean import');
  let synced = 0;
  for (const raw of items) {
    const rawId = String(raw.id || raw.slug);
    const slug = String(raw.slug || rawId.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    const nombre = raw.nombre || raw.name || 'Atracción Turística';
    let precio = 55.0;
    if (raw.price && typeof raw.price === 'object') {
      precio = Number(raw.price.adult || raw.price.adulto || 55.0);
    } else if (raw.precio && typeof raw.precio === 'object') {
      precio = Number(raw.precio.adulto || raw.precio.adult || 55.0);
    }
    const ciudad = raw.ciudad || raw.city || 'Ecuador';
    const duracion = String(raw.duracion || raw.duration || '2 horas');
    const fotos = Array.isArray(raw.photos) ? raw.photos : (Array.isArray(raw.fotos_urls) ? raw.fotos_urls : []);
    const descCorta = raw.descripcion_corta || raw.short_description || nombre;
    const descLarga = raw.descripcion_larga || raw.description || descCorta;
    const puntoEncuentro = raw.punto_encuentro || raw.meeting_point || ciudad;

    await client.query(`
      INSERT INTO schema_atracciones.atracciones_items (
        id, slug, nombre, descripcion_corta, descripcion_larga, ciudad, pais,
        precio_unitario_adulto, moneda, duracion_estimada, cancelacion_gratis,
        punto_encuentro, fotos_urls, activo, proveedor_codigo, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'Ecuador', $7, 'USD', $8, true, $9, $10, true, 'NODE_ATR_DILAN', NOW())
      ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        descripcion_corta = EXCLUDED.descripcion_corta,
        descripcion_larga = EXCLUDED.descripcion_larga,
        ciudad = EXCLUDED.ciudad,
        precio_unitario_adulto = EXCLUDED.precio_unitario_adulto,
        duracion_estimada = EXCLUDED.duracion_estimada,
        punto_encuentro = EXCLUDED.punto_encuentro,
        fotos_urls = EXCLUDED.fotos_urls,
        activo = true,
        proveedor_codigo = 'NODE_ATR_DILAN',
        updated_at = NOW();
    `, [
      rawId,
      slug,
      nombre,
      descCorta,
      descLarga,
      ciudad,
      precio,
      duracion,
      puntoEncuentro,
      fotos
    ]);
    synced++;
  }

  console.log(`✅ Successfully synced ${synced} tours from Dilan to schema_atracciones.atracciones_items!`);

  const summary = await client.query(`
    SELECT proveedor_codigo, COUNT(*) as total_items
    FROM schema_atracciones.atracciones_items
    GROUP BY proveedor_codigo
    ORDER BY total_items DESC;
  `);
  console.table(summary.rows);

  await client.end();
}

syncDilan().catch(err => {
  console.error('Error syncing Dilan:', err);
  process.exit(1);
});
