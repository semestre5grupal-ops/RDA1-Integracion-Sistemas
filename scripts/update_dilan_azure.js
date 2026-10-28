const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateDilan() {
  await client.connect();
  const query = `
    UPDATE schema_proveedores.config_proveedor
    SET base_url_rest = 'https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3',
        api_key = '40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568',
        nombre_proveedor = 'Descubre EC (Dilan Mendoza)',
        equipo = 'Atracciones – Dilan Mendoza',
        descripcion = 'Descubre EC — Sistema de Atracciones Turísticas del Ecuador (Azure Container Apps Chile Central)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0,
        health_status = 'HEALTHY'
    WHERE codigo_nodo = 'NODE_ATR_DILAN';
  `;
  const res = await client.query(query);
  console.log('✅ NODE_ATR_DILAN updated in database, rows affected:', res.rowCount);

  const check = await client.query(`
    SELECT codigo_nodo, nombre_proveedor, base_url_rest, api_key, health_status
    FROM schema_proveedores.config_proveedor
    WHERE codigo_nodo = 'NODE_ATR_DILAN';
  `);
  console.table(check.rows);
  await client.end();
}

updateDilan().catch(err => {
  console.error('Error updating Dilan:', err);
  process.exit(1);
});
