const { Client } = require('pg');
const https = require('https');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5432/booking_db'
});

async function main() {
  await client.connect();

  https.get('https://ecuatravel-atracciones-api.azurewebsites.net/api/v3/atracciones?limit=100', {
    headers: { 'X-API-Key': 'atr-ariel-ecua-travel-2026' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const parsed = JSON.parse(data);
      const items = Array.isArray(parsed) ? parsed : (parsed.data || []);
      console.log('Received items from Ariel:', items.length);

      for (const item of items) {
        const slug = (item.nombre || 'atr')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');

        const photo = item.foto_url || 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800';
        const inclusiones = item.incluye && item.incluye.length > 0 ? item.incluye : ['Transporte', 'Guía'];

        const query = `
          INSERT INTO schema_atracciones.atracciones_items (
            id, nombre, slug, ciudad, pais, descripcion_corta, descripcion_larga,
            duracion_estimada, precio_unitario_adulto, moneda, cancelacion_gratis,
            adicion_animales_servicio, accesible_silla_ruedas, idiomas_soportados,
            punto_encuentro, latitud, longitud, fotos_urls, inclusiones,
            rating_general, reviews_count, activo, proveedor_codigo, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'USD', true, true, true,
            ARRAY['Español', 'Inglés'], 'Punto de Encuentro Central',
            $10, $11, $12, $13, 9.8, 120, true, 'NODE_ATR_ARIEL', NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            descripcion_larga = EXCLUDED.descripcion_larga,
            precio_unitario_adulto = EXCLUDED.precio_unitario_adulto,
            ciudad = EXCLUDED.ciudad,
            updated_at = NOW()
        `;

        await client.query(query, [
          item.id,
          item.nombre,
          slug + '-' + item.id.slice(0, 6),
          item.ciudad || (item.codigo_aeropuerto === 'UIO' ? 'Quito' : item.codigo_aeropuerto === 'GYE' ? 'Guayaquil' : 'Quito'),
          'Ecuador',
          (item.descripcion || item.nombre).slice(0, 100),
          item.descripcion || item.nombre,
          item.duracion_horas ? `${item.duracion_horas} hora(s)` : '2 horas',
          Number(item.precio || item.precio_base || 10),
          Number(item.latitud) || -0.1807,
          Number(item.longitud) || -78.4842,
          [photo],
          inclusiones
        ]);
      }

      console.log('Successfully synced all Ariel items into schema_atracciones.atracciones_items!');
      const countRes = await client.query('SELECT count(*) FROM schema_atracciones.atracciones_items');
      console.log('Total attractions in database now:', countRes.rows[0].count);
      await client.end();
    });
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
