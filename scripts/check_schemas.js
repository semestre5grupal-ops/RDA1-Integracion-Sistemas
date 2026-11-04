require('dotenv').config();
const { Client } = require('pg');

async function inspectDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const schemas = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'schema_%'");
  console.log('Schemas:', schemas.rows.map(r => r.schema_name));

  const tables = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema LIKE 'schema_%' ORDER BY table_schema, table_name");
  console.log('Tables:', tables.rows);
  await client.end();
}

inspectDb().catch(console.error);

