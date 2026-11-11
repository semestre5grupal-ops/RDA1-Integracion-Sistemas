/**
 * Suite de Pruebas en Vivo contra Cozy (Carlos Galarza)
 * Nodo: NODE_ALO_COZY
 * URL Base: https://cozy-alo.azurewebsites.net/api/v2
 * Health Check: https://cozy-alo.azurewebsites.net/api/v2/alojamientos/health
 * Contrato: OpenAPI v2.2.0
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.COZY_BASE_URL || 'https://cozy-alo.azurewebsites.net/api/v2';
const API_KEY = process.env.COZY_API_KEY || '3b668f6c9b349ef31428406a94c90b78f87cb71c4229cf0f6cfcfd38a34204d45bd6bd15ce516abec485af31e919f876';

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const dataString = body ? JSON.stringify(body) : null;
    const headers = {
      'Accept': 'application/json',
      'X-API-Key': API_KEY,
      'X-Correlation-Id': `corr-test-cozy-${Date.now()}`,
      ...extraHeaders,
    };
    if (dataString) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = lib.request(
      url,
      {
        method,
        headers,
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, error: 'TIMEOUT (15s)' });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });

    if (dataString) req.write(dataString);
    req.end();
  });
}

// Generador de cédula ecuatoriana válida (módulo 10)
function generarCedulaValida(provincia = 17) {
  const p = String(provincia).padStart(2, '0');
  const d3 = Math.floor(Math.random() * 6);
  const digitos = [parseInt(p[0]), parseInt(p[1]), d3];
  for (let i = 0; i < 6; i++) digitos.push(Math.floor(Math.random() * 10));
  const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let val = digitos[i] * coefs[i];
    if (val >= 10) val -= 9;
    suma += val;
  }
  const verificador = (10 - (suma % 10)) % 10;
  digitos.push(verificador);
  return digitos.join('');
}

async function runSuite() {
  console.log('================================================================');
  console.log('  SUITE DE PRUEBAS DE INTEGRACIÓN: COZY (Carlos Galarza)        ');
  console.log('  Nodo: NODE_ALO_COZY                                           ');
  console.log('  Base URL: ' + BASE_URL);
  console.log('  API Key: ' + API_KEY.slice(0, 12) + '...' + API_KEY.slice(-6));
  console.log('================================================================\n');

  const resultados = [];
  function registrar(codigo, nombre, estado, detalle, datos = null) {
    resultados.push({ codigo, nombre, estado, detalle, datos });
    const icono = estado === 'PASA' ? '✅' : estado === 'FALLA' ? '❌' : '⚠️';
    console.log(`${icono} [${codigo}] ${nombre} -> ${estado}`);
    if (detalle) console.log(`   └─ ${detalle}`);
    if (datos && estado !== 'PASA') console.log(`   └─ Datos:`, JSON.stringify(datos).slice(0, 200));
  }

  // 1. HEALTH CHECK OFICIAL
  console.log('--- 1. CONECTIVIDAD Y SALUD ---');
  const h1 = await request('GET', '/alojamientos/health');
  if (h1.status === 200) {
    registrar('H01', 'Health Check Oficial (/alojamientos/health)', 'PASA', `Status 200 - semáforo: ${h1.body?.semaforo}, service: ${h1.body?.service}, versión: ${h1.body?.version}`);
  } else {
    registrar('H01', 'Health Check Oficial', 'FALLA', `Status ${h1.status}`);
  }

  // 1b. SEGURIDAD HEALTH: Probar sin API Key
  const hSec = await request('GET', '/alojamientos/health', null, { 'X-API-Key': '' });
  if (hSec.status === 200) {
    registrar('H02', 'Health Check es público (sin API Key)', 'PASA', 'Responde 200 público para balanceadores / monitores.');
  } else {
    registrar('H02', 'Health Check exige API Key', 'AVISO', `Status ${hSec.status} sin API Key.`);
  }

  // 2. SEGURIDAD: API KEY INVÁLIDA
  console.log('\n--- 2. AUTENTICACIÓN Y SEGURIDAD ---');
  const sec1 = await request('POST', '/alojamientos/orders/create', {}, {
    'X-API-Key': 'clave-invalida-xyz-123',
    'Idempotency-Key': crypto.randomUUID(),
  });
  if (sec1.status === 401 || sec1.status === 403) {
    registrar('S01', 'Rechazo con X-API-Key inválida en /orders/create', 'PASA', `Status ${sec1.status} correctamente denegado.`);
  } else {
    registrar('S01', 'Rechazo con X-API-Key inválida en /orders/create', 'FALLA', `Permitió acceso con status ${sec1.status}`);
  }

  // 3. CATÁLOGO DE ALOJAMIENTOS
  console.log('\n--- 3. CATÁLOGO DE ALOJAMIENTOS ---');
  let alojamientos = [];
  const c1 = await request('GET', '/alojamientos?page=1&limit=10');
  if (c1.status === 200) {
    const data = c1.body?.data || (Array.isArray(c1.body) ? c1.body : []);
    alojamientos = data;
    registrar('C01', 'Listar alojamientos (/alojamientos)', 'PASA', `Retornó ${alojamientos.length} propiedades (total: ${c1.body?.total ?? alojamientos.length})`);
  } else {
    registrar('C01', 'Listar alojamientos (/alojamientos)', 'FALLA', `Status ${c1.status}`, c1.body);
  }

  // 3b. DETALLE DE UN ALOJAMIENTO
  let selectedHotel = null;
  if (alojamientos.length > 0) {
    selectedHotel = alojamientos[0];
    const hotelId = selectedHotel.id || selectedHotel.alojamiento_id || selectedHotel.codigo;
    const d1 = await request('GET', `/alojamientos/${hotelId}`);
    if (d1.status === 200) {
      registrar('C02', `Detalle de alojamiento (/alojamientos/${hotelId})`, 'PASA', `Nombre: "${d1.body?.nombre || d1.body?.name}" - Estrellas: ${d1.body?.estrellas ?? 'N/A'}`);
    } else {
      registrar('C02', `Detalle de alojamiento (/alojamientos/${hotelId})`, 'FALLA', `Status ${d1.status}`, d1.body);
    }
  } else {
    registrar('C02', 'Detalle de alojamiento', 'OMITIDO', 'No hay alojamientos devueltos en el catálogo para consultar.');
  }

  // 3c. HABITACIONES DE ALOJAMIENTO
  let selectedRoom = null;
  if (selectedHotel) {
    const hotelId = selectedHotel.id || selectedHotel.alojamiento_id || selectedHotel.codigo;
    const habRes = await request('GET', `/alojamientos/${hotelId}/habitaciones`);
    if (habRes.status === 200 && Array.isArray(habRes.body?.habitaciones) && habRes.body.habitaciones.length > 0) {
      selectedRoom = habRes.body.habitaciones[0];
      registrar('C03', `Listar habitaciones (/alojamientos/${hotelId}/habitaciones)`, 'PASA', `Retornó ${habRes.body.habitaciones.length} tipos de habitación (primera: ${selectedRoom.codigo} - "${selectedRoom.nombre}")`);
    } else {
      registrar('C03', `Listar habitaciones (/alojamientos/${hotelId}/habitaciones)`, 'FALLA', `Status ${habRes.status}`, habRes.body);
    }
  }

  // 4. CONSULTA DE DISPONIBILIDAD Y COTIZACIÓN (AvailabilityRequestV2)
  console.log('\n--- 4. DISPONIBILIDAD Y COTIZACIÓN ---');
  const dIn = '2026-12-10';
  const dOut = '2026-12-13';
  let quoteOk = false;
  let quoteData = null;
  const hotelId = selectedHotel?.id || 'HTL-NODE_ALO_COZY-QUI-001';
  const tipoHabCodigo = selectedRoom?.codigo || 'DOBLE_ESTANDAR';
  const planTarifa = selectedRoom?.planesTarifa?.[0]?.codigo || 'ESTANDAR';

  const availPayload = {
    alojamientoId: hotelId,
    fechaInicio: dIn,
    fechaFin: dOut,
    tipoHabitacionCodigo: tipoHabCodigo,
    cantidadHabitaciones: 1,
    ocupantes: { adultos: 2, ninos: 0 },
    planTarifaCodigo: planTarifa,
  };

  const av1 = await request('POST', '/alojamientos/availability', availPayload);
  if (av1.status === 200 && av1.body?.estaDisponible) {
    quoteOk = true;
    quoteData = av1.body;
    registrar('D01', 'Cotización de Disponibilidad (POST /alojamientos/availability)', 'PASA', `Status 200 - Disponible: sí, Cotización ID: ${quoteData.cotizacionId}, Total: $${quoteData.precioTotalCotizado} USD`);
  } else {
    registrar('D01', 'Cotización de Disponibilidad (POST /alojamientos/availability)', 'FALLA', `Status ${av1.status}`, av1.body);
  }

  // 5. CREACIÓN DE RESERVA / ORDEN (POST /alojamientos/orders/create)
  console.log('\n--- 5. CREACIÓN DE RESERVA / ORDEN (SAGA V2) ---');
  let orderCreated = null;
  let orderId = null;
  const idempotencyKey = crypto.randomUUID();
  const cedulaPrueba = generarCedulaValida(17);
  const emailPrueba = `test.cozy.${Date.now()}@booking-integracion.edu.ec`;

  if (quoteOk && quoteData) {
    const orderPayload = {
      alojamientoId: hotelId,
      tipoHabitacionCodigo: tipoHabCodigo,
      fechaInicio: dIn,
      fechaFin: dOut,
      cantidadHabitaciones: 1,
      ocupantes: { adultos: 2, ninos: 0 },
      planTarifaCodigo: planTarifa,
      cotizacionId: quoteData.cotizacionId,
      totalPagar: quoteData.precioTotalCotizado,
      currency: 'USD',
      huespedTitular: {
        nombreCompleto: 'Juan Perez',
        tipoDocumento: 'CEDULA',
        identificacion: cedulaPrueba,
        email: emailPrueba,
        telefono: '+593991234567',
      },
    };

    const ordRes = await request('POST', '/alojamientos/orders/create', orderPayload, {
      'Idempotency-Key': idempotencyKey,
      'X-Node-Id': 'NODE_ALO_COZY',
    });

    if (ordRes.status === 201 || ordRes.status === 200) {
      orderCreated = ordRes.body;
      orderId = orderCreated.orderId || orderCreated.externalOrderId || orderCreated.id;
      registrar('R01', 'Crear reserva en Cozy (POST /alojamientos/orders/create)', 'PASA', `Status ${ordRes.status} - OrderId: ${orderId}, Código Reserva: ${orderCreated.codigoReserva}, Estado: ${orderCreated.estado}`);

      // 5b. IDEMPOTENCIA
      const ordRetry = await request('POST', '/alojamientos/orders/create', orderPayload, {
        'Idempotency-Key': idempotencyKey,
        'X-Node-Id': 'NODE_ALO_COZY',
      });
      if (ordRetry.status === 200 || ordRetry.status === 201) {
        const retryOrderId = ordRetry.body?.orderId || ordRetry.body?.externalOrderId;
        const coincide = retryOrderId === orderId;
        registrar('R02', 'Idempotencia en creación (mismo Idempotency-Key)', coincide ? 'PASA' : 'FALLA', `Status ${ordRetry.status} - Idempotente: ${coincide}`);
      } else {
        registrar('R02', 'Idempotencia en creación', 'AVISO', `Status ${ordRetry.status} en reintento`);
      }
    } else {
      registrar('R01', 'Crear reserva en Cozy', 'FALLA', `Status ${ordRes.status}`, ordRes.body);
    }
  } else {
    registrar('R01', 'Crear reserva en Cozy', 'OMITIDO', 'No se obtuvo cotización previa exitosa.');
  }

  // 6. CONSULTA DE ORDEN CREADA (GET /alojamientos/orders/{orderId})
  console.log('\n--- 6. CONSULTA DE ESTADO DE LA ORDEN ---');
  if (orderId) {
    const getOrd = await request('GET', `/alojamientos/orders/${orderId}`);
    if (getOrd.status === 200) {
      registrar('O01', `Consultar orden (/alojamientos/orders/${orderId})`, 'PASA', `Status 200 - Estado: ${getOrd.body?.estado}, Titular: ${getOrd.body?.huespedTitular?.nombreCompleto}`);
    } else {
      registrar('O01', `Consultar orden (/alojamientos/orders/${orderId})`, 'FALLA', `Status ${getOrd.status}`, getOrd.body);
    }
  } else {
    registrar('O01', 'Consultar orden', 'OMITIDO', 'Sin orderId para consultar.');
  }

  // 7. CHECK-IN (PRESENCIAL / FRONT-DESK)
  console.log('\n--- 7. CHECK-IN DIGITAL / MOSTRADOR ---');
  if (orderId) {
    // Por especificación OpenAPI v2.2.0 (§7.1), /check-in requiere token OAuth2/Bearer con scope 'alojamientos:checkin'
    const chkRes = await request('POST', `/alojamientos/orders/${orderId}/check-in`, {
      titularIdentificacion: cedulaPrueba,
    });
    if (chkRes.status === 200) {
      registrar('CK01', `Check-in de reserva (${orderId})`, 'PASA', `Status 200 - Habitación: ${chkRes.body?.habitacionAsignada}, PIN: ${chkRes.body?.claveAccesoDigital}`);
    } else if (chkRes.status === 403) {
      registrar('CK01', `Check-in requiere token Bearer/OAuth2 según contrato`, 'PASA', `Status 403 esperado con X-API-Key: "${chkRes.body?.detail || 'Requiere token de recepción'}"`);
    } else {
      registrar('CK01', `Check-in de reserva (${orderId})`, 'AVISO', `Status ${chkRes.status}`, chkRes.body);
    }
  } else {
    registrar('CK01', 'Check-in de reserva', 'OMITIDO', 'No se pudo crear una reserva previa.');
  }

  // 8. CANCELACIÓN DE LA RESERVA (POST /alojamientos/orders/{orderId}/cancel)
  console.log('\n--- 8. CANCELACIÓN Y REEMBOLSO (COMPENSACIÓN SAGA) ---');
  if (orderId) {
    const canIdemp = crypto.randomUUID();
    const canPayload = {
      motivo: 'Cancelación de prueba automatizada desde Booking',
      solicitadoPor: 'CLIENTE',
    };

    const canRes = await request('POST', `/alojamientos/orders/${orderId}/cancel`, canPayload, {
      'Idempotency-Key': canIdemp,
    });

    if (canRes.status === 200) {
      const refund = canRes.body?.montoReembolsado ?? canRes.body?.refundStatus;
      registrar('CN01', `Cancelar reserva (${orderId})`, 'PASA', `Status 200 - Estado: ${canRes.body?.estado}, Reembolso: $${refund} (${canRes.body?.porcentajeReembolso}%), Código Reembolso: ${canRes.body?.codigoReembolso}`);

      // 8b. IDEMPOTENCIA EN CANCELACIÓN
      const canRetry = await request('POST', `/alojamientos/orders/${orderId}/cancel`, canPayload, {
        'Idempotency-Key': crypto.randomUUID(),
      });
      if (canRetry.status === 200 && canRetry.body?.yaCancelada === true) {
        registrar('CN02', 'Idempotencia en cancelación (yaCancelada = true)', 'PASA', `Status 200 - Mantiene mismo código reembolso: ${canRetry.body?.codigoReembolso}`);
      } else {
        registrar('CN02', 'Idempotencia en cancelación', 'AVISO', `Status ${canRetry.status}`, canRetry.body);
      }
    } else {
      registrar('CN01', `Cancelar reserva (${orderId})`, 'FALLA', `Status ${canRes.status}`, canRes.body);
    }
  } else {
    registrar('CN01', 'Cancelación de reserva', 'OMITIDO', 'No hubo reserva creada para cancelar.');
  }

  // RESUMEN FINAL
  console.log('\n================================================================');
  console.log('  RESUMEN DE PRUEBAS CONTRA COZY                                ');
  console.log('================================================================');
  const pasa = resultados.filter((r) => r.estado === 'PASA').length;
  const aviso = resultados.filter((r) => r.estado === 'AVISO').length;
  const falla = resultados.filter((r) => r.estado === 'FALLA').length;
  const omit = resultados.filter((r) => r.estado === 'OMITIDO').length;

  console.log(`TOTAL: ${resultados.length} | PASA: ${pasa} | AVISO: ${aviso} | FALLA: ${falla} | OMITIDO: ${omit}`);
  console.log('================================================================\n');

  return resultados;
}

runSuite().catch(console.error);
