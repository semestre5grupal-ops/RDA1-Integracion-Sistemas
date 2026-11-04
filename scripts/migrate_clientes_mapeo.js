require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('--- Creando tabla schema_clientes.clientes_socios_mapeo ---');
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS schema_clientes;

    CREATE TABLE IF NOT EXISTS schema_clientes.clientes_socios_mapeo (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id UUID NOT NULL REFERENCES schema_clientes.clientes(id) ON DELETE CASCADE,
      codigo_nodo VARCHAR(60) NOT NULL,
      external_client_id VARCHAR(120) NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_cliente_nodo UNIQUE (cliente_id, codigo_nodo)
    );

    CREATE INDEX IF NOT EXISTS idx_clientes_mapeo_cliente_id ON schema_clientes.clientes_socios_mapeo(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_clientes_mapeo_nodo ON schema_clientes.clientes_socios_mapeo(codigo_nodo);
    CREATE INDEX IF NOT EXISTS idx_clientes_mapeo_external_id ON schema_clientes.clientes_socios_mapeo(external_client_id);
  `);
  console.log('✅ Migración ejecutada con éxito!');

  const check = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'schema_clientes' AND table_name = 'clientes_socios_mapeo'");
  console.log('Verificación tabla:', check.rows[0]);

  await client.end();
}

migrate().catch(console.error);

