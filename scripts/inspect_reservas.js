require('dotenv').config();
const { Client } = require('pg');

async function inspectReservas() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const atrCols = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'schema_atracciones' AND table_name = 'atracciones_reservas'");
  console.log('Atracciones reservas columns:', atrCols.rows.map(r => `${r.column_name} (${r.data_type}/${r.udt_name})`));

  const autCols = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'schema_autos' AND table_name = 'autos_reservas'");
  console.log('Autos reservas columns:', autCols.rows.map(r => `${r.column_name} (${r.data_type}/${r.udt_name})`));

  await client.end();
}

inspectReservas().catch(console.error);

