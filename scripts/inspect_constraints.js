require('dotenv').config();
const { Client } = require('pg');

async function inspectConstraints() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'schema_atracciones' AND conname LIKE '%status%';
  `);
  console.log('Status constraints in schema_atracciones:', res.rows);
  await client.end();
}

inspectConstraints().catch(console.error);

