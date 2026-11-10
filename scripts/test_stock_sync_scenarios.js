/**
 * Script de Verificación de Escenarios Exactos de Stock y Disponibilidad Bidireccional
 * 
 * Evalúa los 7 socios (5 atracciones: Dilan, Ariel, Gloria, Alisson, Michael;
 *                      2 autos: Daniel, Mateo)
 * en los 4 flujos solicitados por el usuario:
 *  1. Atracción Booking -> Socio: reserva parcial (ej. 6 de 10) deja cupos exactos (4),
 *     rechaza intento de sobreventa (>4) con HTTP 409 y permite reserva exacta (<=4).
 *  2. Atracción Socio -> Booking: agota turno en el socio, Booking ve 0 cupos y rechaza con 409.
 *  3. Auto Booking -> Socio: renta en fecha/hora desde Booking bloquea intento en la agencia (HTTP 409).
 *  4. Auto Socio -> Booking: renta en fecha/hora desde agencia bloquea intento desde Booking (HTTP 409).
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

function httpRequest(urlStr, options = {}, body = null) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'BookingCentral-StockAuditor/3.0',
        'X-Correlation-Id': `corr-stock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ...(options.headers || {})
      };

      if (body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const req = client.request(urlStr, {
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 35000,
        rejectUnauthorized: false
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch (e) {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: parsed });
        });
      });

      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 504, body: { error: 'TIMEOUT' } }); });
      req.on('error', (err) => resolve({ ok: false, status: 500, body: { error: err.message } }));

      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    } catch (e) {
      resolve({ ok: false, status: 500, body: { error: e.message } });
    }
  });
}

const CLIENTE_PEPITO = {
  nombre: 'Pepito Perez',
  email: 'pepito.perez@epn.edu.ec',
  telefono: '+593988776655',
  cedula: '1710034065'
};

const CLIENTE_JUANITO = {
  nombre: 'Juanito Gomez',
  email: 'juanito.gomez@epn.edu.ec',
  telefono: '+593988112233',
  cedula: '1714890314'
};

async function auditarAtraccion(p) {
  console.log(`\n====================================================================`);
  console.log(`🎡 AUDITORÍA DE STOCK: ${p.nombre} (${p.empresa}) - ${p.codigo}`);
  console.log(`====================================================================`);

  // Paso 0: Obtener catálogo y disponibilidad
  const dispoUrl = `${p.baseUrl}/atracciones/${p.itemPrueba}/disponibilidad?fecha=${p.fechaPrueba}`;
  console.log(`[Paso 0] Consultando disponibilidad en ${dispoUrl}...`);
  const dispoRes = await httpRequest(dispoUrl, { headers: p.headers });

  let slotId = `slot-${p.fechaPrueba.replace(/-/g, '')}-1030`;
  let hora = '10:30';
  let cupoInicial = 10;

  if (dispoRes.status === 200 && dispoRes.body) {
    const slots = dispoRes.body.time_slots || dispoRes.body.turnos || dispoRes.body.horarios || [];
    const valid = slots.find(s => (s.available_slots || s.cupos_disponibles || 0) > 0) || slots[0];
    if (valid) {
      slotId = valid.slot_id || valid.id || slotId;
      hora = valid.time || valid.hora || hora;
      cupoInicial = valid.available_slots || valid.cupos_disponibles || cupoInicial;
    }
  }

  console.log(`   -> Turno seleccionado: ${slotId} (${hora}) | Capacidad inicial detectada: ${cupoInicial}`);

  // --------------------------------------------------------------------------
  // ESCENARIO 1: BOOKING -> SOCIO (Pepito reserva parcial, Juanito en socio ve cupos exactos)
  // --------------------------------------------------------------------------
  console.log(`\n--- ESCENARIO 1: Booking -> Página del Socio (Reserva parcial y verificación de remanente) ---`);
  const cuposPepito = Math.min(6, Math.max(1, Math.floor(cupoInicial * 0.6)));
  const cuposSobrantes = cupoInicial - cuposPepito;
  console.log(`1.1 Pepito reserva ${cuposPepito} personas desde Booking...`);

  const payloadPepito = {
    item_id: p.itemPrueba,
    atraccion_id: p.itemPrueba,
    date: p.fechaPrueba,
    fecha: p.fechaPrueba,
    time_slot: hora,
    slot_id: slotId,
    tickets_count: cuposPepito,
    tickets: { general: cuposPepito },
    cantidad_personas: cuposPepito,
    customer: CLIENTE_PEPITO,
    cliente: CLIENTE_PEPITO,
    comprador: CLIENTE_PEPITO
  };

  const resPepito = await httpRequest(`${p.baseUrl}${p.reservaPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadPepito);

  const pepitoOk = (resPepito.status === 200 || resPepito.status === 201);
  const pepitoId = resPepito.body?.reservation_id || resPepito.body?.reserva_id || resPepito.body?.id;
  console.log(`   -> Respuesta Booking: HTTP ${resPepito.status} | Código: ${resPepito.body?.reservation_code || pepitoId || 'N/A'}`);

  // 1.2 Juanito intenta reservar en la página del socio MÁS cupos de los disponibles (sobreventa)
  console.log(`1.2 Juanito intenta reservar ${cuposPepito + 1} personas (mayor al remanente de ${cuposSobrantes}) en la web del socio...`);
  const payloadJuanitoExceso = { ...payloadPepito, tickets_count: cuposPepito + 1, customer: CLIENTE_JUANITO, cliente: CLIENTE_JUANITO };
  const resJuanitoExceso = await httpRequest(`${p.baseUrl}${p.reservaPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadJuanitoExceso);

  const bloqueoSobreventaPass = (resJuanitoExceso.status === 409 || resJuanitoExceso.status === 422 || resJuanitoExceso.status === 400);
  console.log(`   -> Resultado intento sobreventa en socio: HTTP ${resJuanitoExceso.status} (${bloqueoSobreventaPass ? '🟢 BLOQUEADO EXITOSAMENTE' : '🔴 FALLÓ: Permitió sobreventa'})`);

  // 1.3 Juanito reserva los cupos exactamente disponibles o menores (ej. cuposSobrantes)
  if (cuposSobrantes > 0) {
    console.log(`1.3 Juanito intenta reservar los ${cuposSobrantes} cupos válidos restantes en la web del socio...`);
    const payloadJuanitoValido = { ...payloadPepito, tickets_count: cuposSobrantes, customer: CLIENTE_JUANITO, cliente: CLIENTE_JUANITO };
    const resJuanitoValido = await httpRequest(`${p.baseUrl}${p.reservaPath}`, {
      method: 'POST',
      headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
    }, payloadJuanitoValido);

    const juanitoValidoOk = (resJuanitoValido.status === 200 || resJuanitoValido.status === 201);
    const juanitoId = resJuanitoValido.body?.reservation_id || resJuanitoValido.body?.reserva_id || resJuanitoValido.body?.id;
    console.log(`   -> Resultado reserva válida en socio: HTTP ${resJuanitoValido.status} (${juanitoValidoOk ? '🟢 PERMITIDO' : '🔴 ERROR'})`);

    if (juanitoId) {
      await httpRequest(`${p.baseUrl}${p.cancelPathPrefix}/${juanitoId}/cancel`, {
        method: 'POST', headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
      }, { reason: 'Limpieza Escenario 1' });
    }
  }

  // Limpiar reserva de Pepito
  if (pepitoId) {
    await httpRequest(`${p.baseUrl}${p.cancelPathPrefix}/${pepitoId}/cancel`, {
      method: 'POST', headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
    }, { reason: 'Limpieza Escenario 1 Pepito' });
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 2: SOCIO -> BOOKING (Socio agota aforo, Booking muestra 0 y bloquea)
  // --------------------------------------------------------------------------
  console.log(`\n--- ESCENARIO 2: Página del Socio -> Booking (Aforo agotado bloquea reserva central) ---`);
  console.log(`2.1 Usuario agota los ${cupoInicial} cupos directamente en la página del socio...`);
  const payloadAgotarSocio = { ...payloadPepito, tickets_count: cupoInicial, customer: CLIENTE_JUANITO, cliente: CLIENTE_JUANITO };
  const resAgotar = await httpRequest(`${p.baseUrl}${p.reservaPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadAgotarSocio);

  const agotarOk = (resAgotar.status === 200 || resAgotar.status === 201);
  const ordenAgotarId = resAgotar.body?.reservation_id || resAgotar.body?.reserva_id || resAgotar.body?.id;
  console.log(`   -> Socio orden creada: HTTP ${resAgotar.status}`);

  console.log(`2.2 Pepito entra a Booking Central y trata de reservar 2 cupos para el turno agotado...`);
  const payloadBookingCompra = { ...payloadPepito, tickets_count: 2, customer: CLIENTE_PEPITO, cliente: CLIENTE_PEPITO };
  const resBookingAgotado = await httpRequest(`${p.baseUrl}${p.reservaPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadBookingCompra);

  const bookingBloqueoOk = (resBookingAgotado.status === 409 || resBookingAgotado.status === 422 || resBookingAgotado.status === 400);
  console.log(`   -> Respuesta en Booking Central: HTTP ${resBookingAgotado.status} (${bookingBloqueoOk ? '🟢 RECHAZADO: OUT_OF_STOCK' : '🔴 ERROR: Permitió sobreventa'})`);

  if (ordenAgotarId) {
    await httpRequest(`${p.baseUrl}${p.cancelPathPrefix}/${ordenAgotarId}/cancel`, {
      method: 'POST', headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
    }, { reason: 'Limpieza Escenario 2' });
  }

  return {
    codigo: p.codigo,
    nombre: p.nombre,
    flujoBookingSocio: bloqueoSobreventaPass ? 'PASS' : 'FAIL',
    flujoSocioBooking: bookingBloqueoOk ? 'PASS' : 'FAIL'
  };
}

async function auditarAuto(p) {
  console.log(`\n====================================================================`);
  console.log(`🚗 AUDITORÍA DE DISPONIBILIDAD: ${p.nombre} (${p.empresa}) - ${p.codigo}`);
  console.log(`====================================================================`);

  // Paso 0: Obtener flota real
  console.log(`[Paso 0] Consultando catálogo de vehículos en ${p.baseUrl}/autos...`);
  const flotaRes = await httpRequest(`${p.baseUrl}/autos`, { headers: p.headers });
  let vehiculoId = p.itemPrueba;

  if (flotaRes.status === 200 && flotaRes.body) {
    const list = Array.isArray(flotaRes.body) ? flotaRes.body : flotaRes.body.data || flotaRes.body.autos || [];
    const disponible = list.find(v => v.estado === 'DISPONIBLE' || v.status === 'DISPONIBLE') || list[0];
    if (disponible) {
      vehiculoId = disponible.vehicle_id || disponible.auto_id || disponible.id || vehiculoId;
    }
  }

  console.log(`   -> Vehículo seleccionado: ${vehiculoId} para ${p.fechaPrueba} a las 10:30`);

  // --------------------------------------------------------------------------
  // ESCENARIO 1: AUTO BOOKING -> SOCIO
  // --------------------------------------------------------------------------
  console.log(`\n--- ESCENARIO 1: Booking -> Agencia (Renta desde Booking bloquea reserva en la agencia) ---`);
  console.log(`1.1 Juanito renta el auto ${vehiculoId} desde Booking Central para el ${p.fechaPrueba} 10:30 a ${p.fechaDropoff} 10:30...`);

  const payloadRentaBooking = {
    vehicle_id: vehiculoId,
    auto_id: vehiculoId,
    pickup_date: p.fechaPrueba,
    pickup_time: '10:30:00',
    dropoff_date: p.fechaDropoff,
    dropoff_time: '10:30:00',
    coverage: 'TOTAL',
    insurance_type: 'TOTAL',
    customer: CLIENTE_JUANITO,
    cliente: CLIENTE_JUANITO
  };

  const resRentaBooking = await httpRequest(`${p.baseUrl}${p.orderPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadRentaBooking);

  const rentaBookingOk = (resRentaBooking.status === 200 || resRentaBooking.status === 201);
  const ordenBookingId = resRentaBooking.body?.order_id || resRentaBooking.body?.id || resRentaBooking.body?.pnr;
  console.log(`   -> Booking Central: HTTP ${resRentaBooking.status} | PNR: ${resRentaBooking.body?.pnr || ordenBookingId || 'N/A'}`);

  console.log(`1.2 Pepito intenta rentar el MISMO auto desde la web individual de la agencia para la misma fecha y hora...`);
  const payloadPepitoAuto = { ...payloadRentaBooking, customer: CLIENTE_PEPITO, cliente: CLIENTE_PEPITO };
  const resPepitoAgencia = await httpRequest(`${p.baseUrl}${p.orderPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadPepitoAuto);

  const bloqueoAgenciaOk = (resPepitoAgencia.status === 409 || resPepitoAgencia.status === 422 || resPepitoAgencia.status === 400);
  console.log(`   -> Respuesta en página de la agencia: HTTP ${resPepitoAgencia.status} (${bloqueoAgenciaOk ? '🟢 BLOQUEADO: VEHICLE_UNAVAILABLE' : '🔴 FALLÓ: Permitió sobreventa'})`);

  if (ordenBookingId) {
    await httpRequest(`${p.baseUrl}${p.cancelPathPrefix}/${ordenBookingId}/cancel`, {
      method: 'POST', headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
    }, { reason: 'Limpieza Escenario 1 Auto' });
  }

  // --------------------------------------------------------------------------
  // ESCENARIO 2: AUTO SOCIO -> BOOKING
  // --------------------------------------------------------------------------
  console.log(`\n--- ESCENARIO 2: Agencia -> Booking (Renta directa en agencia bloquea reserva en Booking) ---`);
  console.log(`2.1 Pepito renta directamente en la web de la agencia...`);
  const resPepitoDirecto = await httpRequest(`${p.baseUrl}${p.orderPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadPepitoAuto);

  const directoOk = (resPepitoDirecto.status === 200 || resPepitoDirecto.status === 201);
  const ordenDirectaId = resPepitoDirecto.body?.order_id || resPepitoDirecto.body?.id || resPepitoDirecto.body?.pnr;
  console.log(`   -> Renta directa en agencia: HTTP ${resPepitoDirecto.status}`);

  console.log(`2.2 Juanito entra a Booking Central y trata de rentar ese mismo vehículo para la misma fecha y hora...`);
  const resJuanitoBooking = await httpRequest(`${p.baseUrl}${p.orderPath}`, {
    method: 'POST',
    headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
  }, payloadRentaBooking);

  const bloqueoBookingAutoOk = (resJuanitoBooking.status === 409 || resJuanitoBooking.status === 422 || resJuanitoBooking.status === 400);
  console.log(`   -> Respuesta en Booking Central: HTTP ${resJuanitoBooking.status} (${bloqueoBookingAutoOk ? '🟢 BLOQUEADO: VEHICLE_UNAVAILABLE' : '🔴 FALLÓ: Permitió sobreventa'})`);

  if (ordenDirectaId) {
    await httpRequest(`${p.baseUrl}${p.cancelPathPrefix}/${ordenDirectaId}/cancel`, {
      method: 'POST', headers: { ...p.headers, 'Idempotency-Key': crypto.randomUUID() }
    }, { reason: 'Limpieza Escenario 2 Auto' });
  }

  return {
    codigo: p.codigo,
    nombre: p.nombre,
    flujoBookingSocio: bloqueoAgenciaOk ? 'PASS' : 'FAIL',
    flujoSocioBooking: bloqueoBookingAutoOk ? 'PASS' : 'FAIL'
  };
}

async function main() {
  const sociosAtracciones = [
    {
      codigo: 'NODE_ATR_DILAN', nombre: 'Dilan Mendoza', empresa: 'Descubre EC',
      baseUrl: 'https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3',
      headers: { 'X-API-Key': '40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568' },
      itemPrueba: '4fcd5948-9325-4833-9eae-feaafe9c0e41', fechaPrueba: '2026-11-28',
      reservaPath: '/reservas', cancelPathPrefix: '/reservas'
    },
    {
      codigo: 'NODE_ATR_ARIEL', nombre: 'Ariel Chacha', empresa: 'Ecuatravel',
      baseUrl: 'https://ecuatravel-atracciones-api.azurewebsites.net/api/v3',
      headers: { 'X-API-Key': 'atr-ariel-ecua-travel-2026' },
      itemPrueba: '13d65765-c94f-4af8-bc29-305f70088251', fechaPrueba: '2026-12-06',
      reservaPath: '/atracciones/reservas', cancelPathPrefix: '/atracciones/reservas'
    },
    {
      codigo: 'NODE_ATR_GLORIA', nombre: 'Gloria Chushig', empresa: 'Vívelo Ecuador',
      baseUrl: 'https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3',
      headers: {},
      itemPrueba: '1bb26d24-f79d-4833-b9da-a35b8d5ef44d', fechaPrueba: '2026-12-30',
      reservaPath: '/atracciones/reservas', cancelPathPrefix: '/atracciones/reservas'
    },
    {
      codigo: 'NODE_ATR_ALISSON', nombre: 'Alisson Basantes', empresa: 'Atracciones Turísticas EC',
      baseUrl: 'https://alisson-atracciones-api.azurewebsites.net/api/v3',
      headers: { 'X-API-Key': 'atr-f575172d62a81d51e87fbc0a37952d984ce1c078' },
      itemPrueba: 'PRhu4UBTWPBC', fechaPrueba: '2026-11-15',
      reservaPath: '/reservas', cancelPathPrefix: '/reservas'
    },
    {
      codigo: 'NODE_ATR_MOLINA', nombre: 'Michael Molina', empresa: 'TourGirls',
      baseUrl: 'https://tourgirls-gateway-mm.azurewebsites.net/api/v3',
      headers: { 'X-API-Key': 'Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w' },
      itemPrueba: '3GdwkIAEDKjp', fechaPrueba: '2026-12-05',
      reservaPath: '/atracciones/reservas', cancelPathPrefix: '/atracciones/reservas'
    }
  ];

  const sociosAutos = [
    {
      codigo: 'NODE_AUT_RUTALIBRE', nombre: 'Daniel González', empresa: 'RutaLibre',
      baseUrl: 'https://rutalibre-autos-api.azurewebsites.net/api/v3',
      headers: { 'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA' },
      itemPrueba: 'auto-pan-1007', fechaPrueba: '2026-11-28', fechaDropoff: '2026-11-29',
      orderPath: '/autos/orders/create', cancelPathPrefix: '/autos/orders'
    },
    {
      codigo: 'NODE_AUT_MDU', nombre: 'Mateo Morales', empresa: 'MANEJA DE UNA',
      baseUrl: 'https://maneja-de-una-autos-api.azurewebsites.net/api/v3',
      headers: { 'X-API-Key': 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=' },
      itemPrueba: '10000000-0000-4000-8000-000000000118', fechaPrueba: '2026-12-20', fechaDropoff: '2026-12-21',
      orderPath: '/autos/orders/create', cancelPathPrefix: '/autos/orders'
    }
  ];

  const resultados = [];
  for (const s of sociosAtracciones) {
    try {
      resultados.push(await auditarAtraccion(s));
    } catch (e) {
      console.error(`Error auditando ${s.nombre}:`, e.message);
      resultados.push({ codigo: s.codigo, nombre: s.nombre, error: e.message });
    }
  }

  for (const s of sociosAutos) {
    try {
      resultados.push(await auditarAuto(s));
    } catch (e) {
      console.error(`Error auditando ${s.nombre}:`, e.message);
      resultados.push({ codigo: s.codigo, nombre: s.nombre, error: e.message });
    }
  }

  console.log(`\n====================================================================`);
  console.log(`📊 RESUMEN FINAL DE AUDITORÍA BIDIRECCIONAL`);
  console.log(`====================================================================`);
  console.table(resultados);
}

main();

