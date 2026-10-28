const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateNodes() {
  await client.connect();
  console.log('Connected to DB');

  // 1. Alisson
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'Atracciones Ecuador (Alisson Basantes)',
        base_url_rest = 'http://100.67.28.33:3000/api/v3',
        api_key = 'atr-f575172d62a81d51e87fbc0a37952d984ce1c078',
        equipo = 'Atracciones – Alisson Basantes',
        descripcion = 'Atracciones Ecuador v3 (Tailscale 100.67.28.33:3000)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0
    WHERE codigo_nodo = 'NODE_ATR_ALISSON';
  `);
  console.log('Updated NODE_ATR_ALISSON');

  // 2. Michael
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'TourGirls (Michael Molina)',
        base_url_rest = 'http://100.126.104.108:3000/api/v2',
        api_key = 'atr_PMaHffqZE4ao_bk1bMuqzA0xXzeAbr5nZ6qOcnV7gsAu_Vh7B65zWOYM',
        equipo = 'Atracciones – Michael Molina',
        descripcion = 'Tours de aventura y expedición TourGirls OpenAPI v2 (Tailscale 100.126.104.108:3000)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0
    WHERE codigo_nodo = 'NODE_ATR_MICHAEL';
  `);
  console.log('Updated NODE_ATR_MICHAEL');

  // 3. Ariel
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'EcuaTravel (Ariel Chacha)',
        base_url_rest = 'http://100.74.154.34:3001/api/v3',
        api_key = NULL,
        equipo = 'Atracciones – Ariel Chacha',
        descripcion = 'Catálogo de tours y expediciones turísticas EcuaTravel v3 (Tailscale 100.74.154.34:3001)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0
    WHERE codigo_nodo = 'NODE_ATR_ARIEL';
  `);
  console.log('Updated NODE_ATR_ARIEL');

  // 4. Gloria
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'Atracciones (Gloria Chushig)',
        base_url_rest = 'http://100.64.117.64:3000/api/v2',
        api_key = NULL,
        equipo = 'Atracciones – Gloria Chushig',
        descripcion = 'Catálogo de tours y experiencias Atracciones Gloria Chushig v2 (Tailscale 100.64.117.64:3000)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0
    WHERE codigo_nodo = 'NODE_ATR_GLORIA';
  `);
  console.log('Updated NODE_ATR_GLORIA');

  // Clean up any extraneous nodes
  await client.query(`
    DELETE FROM schema_proveedores.config_proveedor
    WHERE codigo_nodo IN ('NODE_ATR_TOURGIRL_H34J', 'NODE_ATR_AAAA_J66Q');
  `);
  console.log('Cleaned up duplicate nodes');

  const res = await client.query(`
    SELECT codigo_nodo, nombre_proveedor, base_url_rest, api_key, health_status
    FROM schema_proveedores.config_proveedor
    WHERE vertical = 'ATRACCIONES'
    ORDER BY codigo_nodo;
  `);
  console.log('Current Atracciones Nodes in DB:');
  console.table(res.rows);

  await client.end();
}

updateNodes().catch(e => {
  console.error(e);
  process.exit(1);
});
