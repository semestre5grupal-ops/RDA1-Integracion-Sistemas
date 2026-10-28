const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateAutosNodes() {
  await client.connect();
  console.log('Connected to PostgreSQL DB');

  // Upsert NODE_AUT_MATEO
  await client.query(`
    INSERT INTO schema_proveedores.config_proveedor (
      codigo_nodo, nombre_proveedor, vertical, base_url_rest, endpoint_grpc, api_key,
      health_status, latencia_ms, kill_switch_activo, circuit_breaker_estado, tasa_fallos_pct,
      equipo, contacto, emoji, descripcion
    ) VALUES (
      'NODE_AUT_MATEO',
      'MANEJA DE UNA (Mateo Morales)',
      'AUTOS',
      'https://maneja-de-una-v3-api.onrender.com/api/v3',
      '100.93.143.85:50051',
      'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=',
      'HEALTHY',
      15,
      false,
      'CLOSED',
      0.00,
      'Autos – Mateo Morales',
      'mateo@universidad.edu.ec',
      '🚗',
      'MANEJA DE UNA v3 (Render & Tailscale 100.107.107.48:3000)'
    )
    ON CONFLICT (codigo_nodo) DO UPDATE SET
      nombre_proveedor = EXCLUDED.nombre_proveedor,
      base_url_rest = EXCLUDED.base_url_rest,
      api_key = EXCLUDED.api_key,
      equipo = EXCLUDED.equipo,
      contacto = EXCLUDED.contacto,
      emoji = EXCLUDED.emoji,
      descripcion = EXCLUDED.descripcion,
      kill_switch_activo = false,
      circuit_breaker_estado = 'CLOSED',
      health_status = 'HEALTHY';
  `);
  console.log('Upserted NODE_AUT_MATEO');

  // Also update NODE_AUT_2 to point to Mateo Morales
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'MANEJA DE UNA — Socio 2 (Mateo Morales)',
        base_url_rest = 'https://maneja-de-una-v3-api.onrender.com/api/v3',
        api_key = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=',
        equipo = 'Autos – Mateo Morales',
        descripcion = 'Flota MANEJA DE UNA (Render & Tailscale 100.107.107.48:3000)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0,
        health_status = 'HEALTHY'
    WHERE codigo_nodo = 'NODE_AUT_2';
  `);
  console.log('Updated NODE_AUT_2');

  // Update Daniel González nodes to Azure App Service
  await client.query(`
    UPDATE schema_proveedores.config_proveedor
    SET nombre_proveedor = 'RutaLibre Renta de Autos (Daniel González)',
        base_url_rest = 'https://rutalibre-autos-api.azurewebsites.net/api/v3',
        api_key = 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA',
        equipo = 'Autos – Daniel González',
        descripcion = 'RutaLibre API v3 en Azure App Service (https://rutalibre-autos-api.azurewebsites.net)',
        kill_switch_activo = false,
        circuit_breaker_estado = 'CLOSED',
        tasa_fallos_pct = 0,
        health_status = 'HEALTHY'
    WHERE codigo_nodo IN ('NODE_AUT_DANIEL', 'NODE_AUT_RUTALIBRE');
  `);
  console.log('Updated Daniel (RutaLibre) Azure nodes');

  const res = await client.query(`
    SELECT codigo_nodo, nombre_proveedor, base_url_rest, api_key, health_status
    FROM schema_proveedores.config_proveedor
    WHERE vertical = 'AUTOS'
    ORDER BY codigo_nodo;
  `);
  console.log('Current AUTOS Nodes in DB:');
  console.table(res.rows);

  await client.end();
}

updateAutosNodes().catch(e => {
  console.error(e);
  process.exit(1);
});
