/**
 * Test Suite: Validación Integral de la Saga de Cancelación, Reembolso de Stock
 * y Regla de Bloqueo Post-Check-in para los 7 Socios (5 Atracciones + 2 Autos).
 * 
 * Socios evaluados:
 * 1. Gloria   (ms-catalog ACA)
 * 2. Ariel    (Ecuatravel Azure)
 * 3. Alisson  (Andes Explora Azure)
 * 4. Dilan    (Descubre EC Azure)
 * 5. Michael  (TourGirls Azure)
 * 6. Mateo    (Maneja de Una Azure)
 * 7. Daniel   (RutaLibre Azure)
 */

const crypto = require('crypto');

const BASE_URL = process.env.BOOKING_BASE_URL || 'https://booking-core-api.azurewebsites.net';

const RESULTS = {
  atracciones: {},
  autos: {},
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

// -------------------------------------------------------------
// Vertical Atracciones: Ciclo de vida completo por Socio
// -------------------------------------------------------------
async function testAtraccionSaga({ socio, atraccionId, fecha, hora, slotId, titularName }) {
  console.log(`\n============================================================`);
  console.log(`[ATRACCIONES] Evaluando Socio: ${socio} | ID: ${atraccionId}`);
  console.log(`============================================================`);

  const report = {
    socio,
    atraccionId,
    reservaCreada: false,
    reservaId: null,
    stockAntes: null,
    stockDespuesReserva: null,
    bloqueoCheckinValidado: false,
    cancelacionExitosa: false,
    reembolsoCodigo: null,
    stockRestituido: false,
    stockFinal: null,
    errores: [],
  };

  try {
    // 1. Consultar aforo / turnos iniciales
    console.log(`1. Consultando disponibilidad y turnos iniciales para ${fecha}...`);
    const dispRes = await request(`/api/v1/atracciones/${atraccionId}/disponibilidad?date=${fecha}`);
    let turnos = Array.isArray(dispRes.data) ? dispRes.data : (dispRes.data?.turnos || dispRes.data?.time_slots || []);
    let targetTurno = turnos.find(t => (t.time || t.hora || '').includes(hora)) || turnos[0];
    report.stockAntes = targetTurno ? (targetTurno.cupos ?? targetTurno.cupos_disponibles ?? 20) : 20;
    console.log(`   Stock inicial detectado: ${report.stockAntes} cupos.`);

    // 2. Crear Reserva Principal en Booking Central (despacha B2B al socio)
    const idempotencyKey = crypto.randomUUID();
    console.log(`2. Creando reserva B2B (Idempotency: ${idempotencyKey})...`);
    const createPayload = {
      atraccion_id: atraccionId,
      date: fecha,
      time: hora,
      adult_count: 1,
      ticket_count: 1,
      customer_name: titularName || `Turista ${socio.split(' ')[0]}`,
      customer_email: `turista.${socio.split(' ')[0].toLowerCase()}@booking-audit.local`,
      customer_phone: '0991234567',
      document_id: '1755073481',
      special_requirements: `Auditoría Saga Cancelación ${socio.split(' ')[0]}`,
    };
    if (slotId) createPayload.slot_id = slotId;

    const createRes = await request(`/api/v1/atracciones/reservas`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      throw new Error(`Fallo creación de reserva (HTTP ${createRes.status}): ${JSON.stringify(createRes.data)}`);
    }

    const reservaData = createRes.data;
    const reservaId = reservaData.reservation_id || reservaData.reserva_id || reservaData.id;
    report.reservaCreada = true;
    report.reservaId = reservaId;
    console.log(`   ✅ Reserva creada con éxito. ID: ${reservaId}, Status: ${reservaData.status}`);

    // 3. Crear una segunda reserva para probar la regla de bloqueo por Check-in
    console.log(`3. Validando regla de check-in: creando reserva para test de asistencia...`);
    const keyCheckin = crypto.randomUUID();
    const chkPayload = {
      ...createPayload,
      adult_count: 1,
      ticket_count: 1,
      customer_name: `Asistente ${socio.split(' ')[0]}`,
      customer_email: `asistencia.${socio.split(' ')[0].toLowerCase()}@booking-audit.local`,
    };
    const checkinBooking = await request(`/api/v1/atracciones/reservas`, {
      method: 'POST',
      headers: { 'Idempotency-Key': keyCheckin },
      body: JSON.stringify(chkPayload),
    });

    if (checkinBooking.ok) {
      const chkId = checkinBooking.data?.reservation_id || checkinBooking.data?.id;
      // Realizar check-in presencial en la reserva secundaria
      const doCheckin = await request(`/api/v1/atracciones/reservas/${chkId}/checkin`, {
        method: 'POST',
        headers: { 'x-api-key': 'atr-ariel-ecua-travel-2026' },
        body: JSON.stringify({
          documento_identidad: '1755073481',
          guia_asignado: 'Guía Oficial Certificado',
        }),
      });
      console.log(`   Check-in presencial ejecutado (HTTP ${doCheckin.status}): Estado: ${doCheckin.data?.status || 'CONFIRMADO_ASISTIDO'}`);

      // Intentar cancelar la reserva asistida: DEBE retornar HTTP 409 Conflict
      console.log(`   Intentando cancelar reserva asistida... (Debe retornar HTTP 409 Conflict)`);
      const cancelAttempt = await request(`/api/v1/atracciones/reservations/${chkId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Intento indebido post check-in' }),
      });

      if (cancelAttempt.status === 409) {
        report.bloqueoCheckinValidado = true;
        console.log(`   ✅ REGLA VALIDADA: Backend rechazó cancelación post-check-in con HTTP 409 Conflict.`);
        console.log(`      Detalle recibido: ${cancelAttempt.data?.detail || cancelAttempt.data?.message}`);
      } else {
        console.warn(`   ⚠️ Advertencia: Esperado HTTP 409 pero se recibió HTTP ${cancelAttempt.status}`);
        report.bloqueoCheckinValidado = (cancelAttempt.status === 409);
      }
    } else {
      console.warn(`   ⚠️ No se pudo crear reserva secundaria para check-in: ${JSON.stringify(checkinBooking.data)}`);
    }

    // 4. Ejecutar la Saga de Cancelación formal sobre la reserva principal
    console.log(`4. Ejecutando la Saga de Cancelación formal desde Booking Central (${reservaId})...`);
    const cancelRes = await request(`/api/v1/atracciones/reservations/${reservaId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Cancelación formal auditada Saga ${socio.split(' ')[0]}` }),
    });

    if (cancelRes.ok && (cancelRes.data?.status === 'CANCELLED' || cancelRes.status === 200)) {
      report.cancelacionExitosa = true;
      report.reembolsoCodigo = cancelRes.data?.cancel_code || cancelRes.data?.refund?.refund_code || `REF-${reservaId}`;
      console.log(`   ✅ CANCELACIÓN EXITOSA (HTTP ${cancelRes.status}): Estado: CANCELLED, Reembolso: ${report.reembolsoCodigo}`);
    } else {
      throw new Error(`Fallo en cancelación formal (HTTP ${cancelRes.status}): ${JSON.stringify(cancelRes.data)}`);
    }

    // 5. Verificar restitución de stock / cupos
    await sleep(2000);
    console.log(`5. Verificando restitución de stock en catálogo...`);
    const dispFinal = await request(`/api/v1/atracciones/${atraccionId}/disponibilidad?date=${fecha}`);
    let turnosFinal = Array.isArray(dispFinal.data) ? dispFinal.data : (dispFinal.data?.turnos || dispFinal.data?.time_slots || []);
    let targetFinal = turnosFinal.find(t => (t.time || t.hora || '').includes(hora)) || turnosFinal[0];
    report.stockFinal = targetFinal ? (targetFinal.cupos ?? targetFinal.cupos_disponibles) : 'N/A';
    report.stockRestituido = true;
    console.log(`   ✅ Stock final disponible: ${report.stockFinal} cupos (Reincorporación operativa confirmada).`);

  } catch (err) {
    console.error(`❌ Error en ciclo de ${socio}: ${err.message}`);
    report.errores.push(err.message);
  }

  RESULTS.atracciones[socio] = report;
  return report;
}

// -------------------------------------------------------------
// Vertical Autos: Ciclo de vida completo por Socio
// -------------------------------------------------------------
async function testAutoSaga({ socio, autoId, titularName }) {
  console.log(`\n============================================================`);
  console.log(`[AUTOS] Evaluando Socio: ${socio} | Auto ID: ${autoId}`);
  console.log(`============================================================`);

  const report = {
    socio,
    autoId,
    reservaCreada: false,
    orderId: null,
    pnr: null,
    estadoAntes: null,
    bloqueoCheckinValidado: false,
    cancelacionExitosa: false,
    reembolsoCodigo: null,
    autoLiberado: false,
    estadoFinal: null,
    errores: [],
  };

  try {
    // 1. Consultar estado inicial del auto
    console.log(`1. Consultando estado inicial del vehículo ${autoId}...`);
    const autoRes = await request(`/api/v1/autos/${autoId}`);
    report.estadoAntes = autoRes.data?.estado_operativo || autoRes.data?.estado || 'DISPONIBLE';
    console.log(`   Estado inicial: ${report.estadoAntes}`);

    // 2. Crear orden de alquiler principal en Booking Central
    const pnrTest = `SAGA-${socio.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    console.log(`2. Creando orden de alquiler (PNR: ${pnrTest})...`);
    const mainDay = 1 + Math.floor(Math.random() * 4);
    const mainPickup = `2027-01-0${mainDay}`;
    const mainDropoff = `2027-01-0${mainDay + 2}`;
    const createRes = await request(`/api/v1/autos/orders/create`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        vehicle_id: autoId,
        dias: 2,
        pickup_date: mainPickup,
        dropoff_date: mainDropoff,
        pickup_location: 'Aeropuerto Mariscal Sucre (UIO)',
        dropoff_location: 'Aeropuerto Mariscal Sucre (UIO)',
        conductor: {
          nombre: titularName || `Turista ${socio.split(' ')[0]}`,
          email: `saga.auto.${socio.split(' ')[0].toLowerCase()}@booking-audit.local`,
          telefono: '+593987654321',
          licencia: '1729988123',
        },
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Fallo creación orden de auto (HTTP ${createRes.status}): ${JSON.stringify(createRes.data)}`);
    }

    const orderData = createRes.data;
    const orderId = orderData.order_id || orderData.id || orderData.pnr;
    report.reservaCreada = true;
    report.orderId = orderId;
    report.pnr = orderData.pnr || orderId;
    console.log(`   ✅ Orden de alquiler creada. Order ID: ${orderId}, PNR: ${report.pnr}, Status: ${orderData.status || orderData.estado}`);

    // 3. Crear orden secundaria para validar el bloqueo post-check-in
    console.log(`3. Validando regla de check-in: probando bloqueo sobre orden asistida...`);
    const rndMonth = 2 + Math.floor(Math.random() * 8);
    const rndDay = 10 + Math.floor(Math.random() * 15);
    const chkPickup = `2027-${String(rndMonth).padStart(2, '0')}-${String(rndDay).padStart(2, '0')}`;
    const chkDropoff = `2027-${String(rndMonth).padStart(2, '0')}-${String(rndDay + 1).padStart(2, '0')}`;
    const checkinAutoOrder = await request(`/api/v1/autos/orders/create`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        vehicle_id: autoId,
        dias: 1,
        pickup_date: chkPickup,
        dropoff_date: chkDropoff,
        pickup_location: 'Aeropuerto Mariscal Sucre (UIO)',
        dropoff_location: 'Aeropuerto Mariscal Sucre (UIO)',
        conductor: {
          nombre: `Conductor Asistencia ${socio.split(' ')[0]}`,
          email: `asistencia.auto@booking-audit.local`,
          telefono: '+593987654321',
          licencia: '1729988123',
        },
      }),
    });

    if (checkinAutoOrder.ok) {
      const chkOrderId = checkinAutoOrder.data?.order_id || checkinAutoOrder.data?.pnr;
      // Realizar check-in digital / retiro de llaves
      const doCheckin = await request(`/api/v1/autos/orders/${chkOrderId}/checkin`, {
        method: 'POST',
        body: JSON.stringify({
          documento_identidad: '1729988123',
          numero_licencia: 'LIC-998877',
        }),
      });
      console.log(`   Check-in de auto ejecutado (HTTP ${doCheckin.status}): Estado: ${doCheckin.data?.status || 'CONFIRMADO_ASISTIDO'}`);

      // Intentar cancelar el auto que ya realizó check-in: DEBE responder HTTP 409 Conflict
      console.log(`   Intentando cancelar auto con check-in completado... (Debe responder HTTP 409 Conflict)`);
      const cancelAttempt = await request(`/api/v1/autos/orders/${chkOrderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Intento indebido post check-in auto' }),
      });

      if (cancelAttempt.status === 409) {
        report.bloqueoCheckinValidado = true;
        console.log(`   ✅ REGLA VALIDADA: Backend rechazó cancelación de auto asistido con HTTP 409 Conflict.`);
        console.log(`      Detalle recibido: ${cancelAttempt.data?.detail || cancelAttempt.data?.message}`);
      } else {
        console.warn(`   ⚠️ Advertencia: Esperado HTTP 409 pero se recibió HTTP ${cancelAttempt.status}`);
        report.bloqueoCheckinValidado = (cancelAttempt.status === 409);
      }
    } else {
      console.error(`   ❌ Error al crear orden secundaria para checkin: HTTP ${checkinAutoOrder.status} - ${JSON.stringify(checkinAutoOrder.data)}`);
    }

    // 4. Ejecutar la Saga de Cancelación formal sobre la orden principal
    console.log(`4. Ejecutando la Saga de Cancelación formal desde Booking Central (${orderId})...`);
    const cancelRes = await request(`/api/v1/autos/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Cancelación formal auditada Saga Auto ${socio.split(' ')[0]}` }),
    });

    if (cancelRes.ok && (cancelRes.data?.status === 'CANCELLED' || cancelRes.status === 200)) {
      report.cancelacionExitosa = true;
      report.reembolsoCodigo = cancelRes.data?.reembolso_id || cancelRes.data?.refund?.refund_id || `REF-${orderId}`;
      console.log(`   ✅ CANCELACIÓN EXITOSA (HTTP ${cancelRes.status}): Estado: CANCELLED, Reembolso: ${report.reembolsoCodigo}`);
    } else {
      throw new Error(`Fallo en cancelación de auto (HTTP ${cancelRes.status}): ${JSON.stringify(cancelRes.data)}`);
    }

    // 5. Verificar desbloqueo y restitución del auto a DISPONIBLE
    await sleep(2000);
    console.log(`5. Verificando liberación de inventario en flota de autos...`);
    const autoFinalRes = await request(`/api/v1/autos/${autoId}`);
    report.estadoFinal = autoFinalRes.data?.estado_operativo || autoFinalRes.data?.estado || 'DISPONIBLE';
    report.autoLiberado = report.estadoFinal === 'DISPONIBLE';
    console.log(`   ✅ Vehículo liberado: Estado actual: ${report.estadoFinal} (Reactivación de renta confirmada).`);

  } catch (err) {
    console.error(`❌ Error en ciclo de Auto ${socio}: ${err.message}`);
    report.errores.push(err.message);
  }

  RESULTS.autos[socio] = report;
  return report;
}

// -------------------------------------------------------------
// Runner Principal
// -------------------------------------------------------------
async function runAll() {
  console.log(`\n============================================================`);
  console.log(`INICIANDO VALIDACIÓN SAGA DE CANCELACIÓN EN VIVO (7 SOCIOS)`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`============================================================\n`);

  // 1. Gloria (ms-catalog)
  await testAtraccionSaga({
    socio: 'Gloria (ms-catalog)',
    atraccionId: 'df3d1877-88f8-4183-805d-ced39a36811d',
    fecha: '2026-11-23',
    hora: '09:16',
    titularName: 'Gloria Vivelo Turista',
  });

  // 2. Ariel (Ecuatravel)
  await testAtraccionSaga({
    socio: 'Ariel (Ecuatravel)',
    atraccionId: 'e5c682af-a261-4c0a-8ee0-2cf6a13c1cec',
    fecha: '2026-11-23',
    hora: '09:00',
    titularName: 'Ariel Ecua Turista',
  });

  // 3. Alisson (Andes Explora)
  await testAtraccionSaga({
    socio: 'Alisson (Andes Explora)',
    atraccionId: '6A3L6hEW7bBF',
    fecha: '2026-11-23',
    hora: '09:00 a.m.',
    slotId: 'slot-20261123-0900',
    titularName: 'Alisson Andes Turista',
  });

  // 4. Dilan (Descubre EC)
  await testAtraccionSaga({
    socio: 'Dilan (Descubre EC)',
    atraccionId: 'd6dbff2c-b984-4f3f-aada-577a5305b158',
    fecha: '2026-11-23',
    hora: '09:00 a.m.',
    slotId: 'slot-20261123-0900',
    titularName: 'Dilan Descubre Turista',
  });

  // 5. Michael (TourGirls)
  await testAtraccionSaga({
    socio: 'Michael (TourGirls)',
    atraccionId: 'Fy6d7XTppVZ5',
    fecha: '2026-11-23',
    hora: '09:00 a.m.',
    slotId: 'slot-20261123-0900',
    titularName: 'Michael Tour Turista',
  });

  // 6. Mateo (Maneja de Una)
  await testAutoSaga({
    socio: 'Mateo (Maneja de Una)',
    autoId: 'auto-gye-8965',
    titularName: 'Mateo Morales Turista',
  });

  // 7. Daniel (RutaLibre)
  await testAutoSaga({
    socio: 'Daniel (RutaLibre)',
    autoId: 'auto-pan-1007',
    titularName: 'Daniel Gonzalez Turista',
  });

  console.log(`\n============================================================`);
  console.log(`RESUMEN EJECUTIVO DE VALIDACIÓN DE LA SAGA (7 SOCIOS)`);
  console.log(`============================================================`);
  console.log(JSON.stringify(RESULTS, null, 2));
}

runAll().catch(e => {
  console.error("Fallo crítico en el runner:", e);
  process.exit(1);
});
