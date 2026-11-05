const { DataSource } = require('typeorm');
require('dotenv').config();
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  await ds.initialize();
  const rows = await ds.query("SELECT codigo_nodo, api_key FROM schema_proveedores.config_proveedor WHERE codigo_nodo = 'NODE_ATR_ARIEL'");
  console.log('Ariel config:', rows);
  await ds.destroy();
}
run();

