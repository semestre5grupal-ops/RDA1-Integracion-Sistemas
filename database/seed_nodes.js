/**
 * Ya no siembra proveedores de ejemplo.
 *
 * Antes insertaba NODE_AUT_LOCAL, NODE_ALO_LOCAL, NODE_VUE_LOCAL y NODE_STK_GRPC
 * apuntando a http://localhost:3000: no existen y en el panel parecían socios
 * reales. Los socios se registran desde Admin → Servicios & Prov.
 *
 * La cadena de conexión ya no va escrita aquí: se lee de DATABASE_URL.
 * Uso: DATABASE_URL=... node database/seed_nodes.js   (solo muestra el conteo)
 */
const { Client } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('Define DATABASE_URL para consultar los proveedores registrados.');
    return;
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM schema_proveedores.config_proveedor');
    console.log(`Proveedores registrados: ${rows[0].n}. No se siembran proveedores de ejemplo.`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
