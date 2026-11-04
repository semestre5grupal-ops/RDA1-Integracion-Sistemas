require('dotenv').config();
const { Client } = require('pg');

async function inspectAuditoria() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'schema_auditoria' AND table_name = 'auditoria_transaccional'");
  console.log('Auditoria cols:', res.rows.map(r => `${r.column_name} (${r.data_type})`));
  await client.end();
}

inspectAuditoria().catch(console.error);

