require('dotenv').config();
const { Client } = require('pg');

async function updateConstraints() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('--- Actualizando Check Constraints para permitir RESERVADO y CONFIRMADO_ASISTIDO ---');

  // 1. Atracciones reservas
  await client.query(`
    ALTER TABLE schema_atracciones.atracciones_reservas 
    DROP CONSTRAINT IF EXISTS atracciones_reservas_status_check;

    ALTER TABLE schema_atracciones.atracciones_reservas 
    ADD CONSTRAINT atracciones_reservas_status_check 
    CHECK ((status)::text = ANY ((ARRAY[
      'RESERVADO'::character varying,
      'CONFIRMED'::character varying, 
      'CHECKED_IN'::character varying, 
      'CONFIRMADO_ASISTIDO'::character varying,
      'COMPLETED'::character varying,
      'CANCELLED'::character varying, 
      'COMPENSATED'::character varying
    ])::text[]));
  `);
  console.log('✅ Constraint atracciones_reservas_status_check actualizado!');

  // 2. Autos reservas
  await client.query(`
    ALTER TABLE schema_autos.autos_reservas 
    DROP CONSTRAINT IF EXISTS autos_reservas_estado_check;

    ALTER TABLE schema_autos.autos_reservas 
    ADD CONSTRAINT autos_reservas_estado_check 
    CHECK ((estado)::text = ANY ((ARRAY[
      'RESERVADO'::character varying,
      'CONFIRMADA'::character varying, 
      'ACTIVA'::character varying, 
      'CONFIRMADO_ASISTIDO'::character varying,
      'ENTREGADO'::character varying,
      'COMPLETADA'::character varying, 
      'CANCELADA'::character varying
    ])::text[]));
  `);
  console.log('✅ Constraint autos_reservas_estado_check actualizado!');

  await client.end();
}

updateConstraints().catch(console.error);

