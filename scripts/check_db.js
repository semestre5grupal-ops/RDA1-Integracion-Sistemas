require('dotenv').config();
const { Client } = require('pg');

async function testConn() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('No DATABASE_URL in .env');
    return;
  }
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log('Connected to database successfully!');
    const res = await client.query('SELECT current_database(), current_schema()');
    console.log('DB Info:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('Connection error:', err.message);
  }
}

testConn();

