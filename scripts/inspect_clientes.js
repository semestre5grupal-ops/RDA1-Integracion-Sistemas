require('dotenv').config();
const { Client } = require('pg');

async function inspectClientes() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const cliCols = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'schema_clientes' AND table_name = 'clientes'");
  console.log('Clientes columns:', cliCols.rows.map(r => `${r.column_name} (${r.data_type}/${r.udt_name})`));
  await client.end();
}

inspectClientes().catch(console.error);

