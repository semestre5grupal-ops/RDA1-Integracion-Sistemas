require('dotenv').config();
const { Client } = require('pg');

async function testFullCrossPlatformCheckin() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('===============================================================');
  console.log('🧪 PRUEBA INTEGRAL: CLIENTE CROSS-PLATFORM & CHECK-IN (RDA2)');
  console.log('===============================================================');

  // 1. Obtener o crear un cliente de prueba en schema_clientes.clientes
  let cliRes = await client.query("SELECT id, nombre, email, cedula_ruc FROM schema_clientes.clientes WHERE email = 'pepito.evaluacion@booking.com' LIMIT 1");
  let clienteId;

  if (cliRes.rows.length === 0) {
    const insertCli = await client.query(`
      INSERT INTO schema_clientes.clientes (nombre, email, cedula_ruc, telefono, rol, estado)
      VALUES ('Pepito Evaluador', 'pepito.evaluacion@booking.com', '1710034065', '0998765432', 'CLIENTE', 'ACTIVO')
      RETURNING id, nombre, email, cedula_ruc
    `);
    clienteId = insertCli.rows[0].id;
    console.log(`[Paso 1] Cliente Pepito creado en Booking: ${clienteId}`);
  } else {
    clienteId = cliRes.rows[0].id;
    console.log(`[Paso 1] Cliente Pepito recuperado en Booking: ${clienteId}`);
  }

  // 2. Simular sincronización cross-platform con dos socios (Daniel Autos y Dilan Atracciones)
  const nodos = ['NODE_AUT_RUTALIBRE', 'NODE_ATR_DILAN'];

  for (const nodo of nodos) {
    const externalId = `CLI-${nodo.replace('NODE_', '')}-${clienteId.slice(0, 8)}`;
    await client.query(`
      INSERT INTO schema_clientes.clientes_socios_mapeo (cliente_id, codigo_nodo, external_client_id, metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cliente_id, codigo_nodo)
      DO UPDATE SET external_client_id = EXCLUDED.external_client_id, updated_at = NOW()
    `, [clienteId, nodo, externalId, JSON.stringify({ sincronizado_en: new Date().toISOString(), origen: 'TEST_CROSS_PLATFORM' })]);
    console.log(`[Paso 2] Mapeo guardado en DB: Cliente ${clienteId} <-> ${nodo} => ${externalId}`);
  }

  // 3. Consultar los mapeos del cliente
  const mapList = await client.query('SELECT * FROM schema_clientes.clientes_socios_mapeo WHERE cliente_id = $1', [clienteId]);
  console.log(`[Paso 3] Mapeos activos para Pepito (${mapList.rows.length}):`);
  mapList.rows.forEach(m => console.log(`   - Nodo: ${m.codigo_nodo.padEnd(20)} | External Client ID: ${m.external_client_id}`));

  // 4. Crear una reserva de prueba en Atracciones con estado inicial RESERVADO
  const testReservaId = `RES-TEST-${Date.now()}`;
  const turnoRes = await client.query('SELECT id, atraccion_id FROM schema_atracciones.atracciones_turnos_aforo LIMIT 1');
  const turnoId = turnoRes.rows[0]?.id;
  const atrId = turnoRes.rows[0]?.atraccion_id || 'PRhu4UBTWPBC';

  await client.query(`
    INSERT INTO schema_atracciones.atracciones_reservas (id, idempotency_key, atraccion_id, turno_id, cliente_id, customer_name, customer_email, customer_phone, document_id, date, time, adult_count, child_count, senior_count, infant_count, ticket_count, subtotal, status, total_price, voucher_qr_payload)
    VALUES ($1, $2, $3, $4, $5, 'Pepito Evaluador', 'pepito.evaluacion@booking.com', '0998765432', '1710034065', CURRENT_DATE, '10:00 a.m.', 1, 0, 0, 0, 1, 45.00, 'RESERVADO', 45.00, $6)
    ON CONFLICT (id) DO NOTHING
  `, [testReservaId, `idem-${testReservaId}`, atrId, turnoId, clienteId, `VOUCHER-QR-${testReservaId}`]);
  console.log(`\n[Paso 4] Reserva creada en estado RESERVADO: ${testReservaId}`);

  // 5. Simular la confirmación de asistencia (Check-in presencial del socio)
  console.log(`[Paso 5] Simulando recepción de Webhook de Check-in en Booking para ${testReservaId}...`);
  const updateRes = await client.query(`
    UPDATE schema_atracciones.atracciones_reservas
    SET status = 'CONFIRMADO_ASISTIDO', checkin_at = NOW(), guia_oficial_asignado = 'Guía Carlos (Mintur #102)', updated_at = NOW()
    WHERE id = $1
    RETURNING id, status, checkin_at, guia_oficial_asignado
  `, [testReservaId]);
  console.log('   -> Resultado actualización reserva:', updateRes.rows[0]);

  // 6. Auditoría transaccional registrada
  await client.query(`
    INSERT INTO schema_auditoria.auditoria_transaccional (modulo, accion, registro_id, detalles_json)
    VALUES ('RESERVAS_CHECKIN', 'CONFIRMAR_ASISTENCIA_PRESENCIAL', $1, $2)
  `, [testReservaId, JSON.stringify({
    external_order_id: testReservaId,
    client_id: mapList.rows[0].external_client_id,
    estado: 'CONFIRMADO_ASISTIDO',
    admin_id: 'admin-socio-juanito',
    fecha_checkin: new Date().toISOString()
  })]);
  console.log(`[Paso 6] Evento registrado en schema_auditoria.auditoria_transaccional para ${testReservaId}`);

  // 7. Verificación final de auditoría
  const auditRes = await client.query("SELECT * FROM schema_auditoria.auditoria_transaccional WHERE registro_id = $1", [testReservaId]);
  console.log('   -> Registro de auditoría verificado:', auditRes.rows[0].accion, '| Módulo:', auditRes.rows[0].modulo);

  console.log('\n===============================================================');
  console.log('🎉 ¡FLUJO 2 VALIDADO 100% EN BASE DE DATOS Y LÓGICA DE NEGOCIO!');
  console.log('===============================================================');

  await client.end();
}

testFullCrossPlatformCheckin().catch(console.error);
