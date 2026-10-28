const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('=== VERIFICACIÓN DE ATRACCIONES EN BD POR PROVEEDOR ===');
  const counts = await client.query(`
    SELECT proveedor_codigo, COUNT(*) as total
    FROM schema_atracciones.atracciones_items
    GROUP BY proveedor_codigo
    ORDER BY total DESC;
  `);
  console.table(counts.rows);

  const michaelItems = await client.query(`
    SELECT id, nombre, ciudad, precio_unitario_adulto, proveedor_codigo
    FROM schema_atracciones.atracciones_items
    WHERE proveedor_codigo = 'NODE_ATR_MICHAEL'
    LIMIT 10;
  `);
  console.log('=== ÍTEMS DE TOURGIRLS (MICHAEL MOLINA) ===');
  console.table(michaelItems.rows);

  await client.end();
}

main().catch(console.error);
