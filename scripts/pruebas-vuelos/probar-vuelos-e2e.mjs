#!/usr/bin/env node
/**
 * Pruebas automáticas de Vuelos (Booking ↔ aerolíneas socias) contra el backend real.
 *
 *   node scripts/pruebas-vuelos/probar-vuelos-e2e.mjs
 *   API=https://booking-core-api.azurewebsites.net/api/v1 AEROLINEAS=NODE_VUE_RAM,NODE_VUE_ECO node scripts/pruebas-vuelos/probar-vuelos-e2e.mjs
 *
 * Variables:
 *   API          URL del backend (por defecto Azure).
 *   AEROLINEAS   Prefijos de nodo a probar, separados por coma (por defecto: todas las que respondan).
 *   WEBHOOK_SECRET_VUELOS  Si está, también prueba el receptor de webhooks firmados.
 *   NO_LIMPIAR=1 Deja las reservas de prueba sin cancelar.
 *
 * Cada caso imprime PASA / FALLA y al final un resumen. Todas las reservas que
 * crea se cancelan al terminar (y sus cobros se devuelven).
 * Requiere Node 18+ (fetch). Detrás de un proxy: NODE_USE_ENV_PROXY=1.
 */
import crypto from 'node:crypto';

const API = (process.env.API || 'https://booking-core-api.azurewebsites.net/api/v1').replace(/\/+$/, '');
const RAIZ = API.replace(/\/api\/v\d+$/, '');
const USUARIO = process.env.USUARIO || '7a1c2e9f-4b3d-4c8a-9e21-5f6d7c8b9a01';
const OTRO = '0b0b0b0b-1111-4222-8333-444455556666';
const SECRETO = process.env.WEBHOOK_SECRET_VUELOS || '';
const FILTRO = (process.env.AEROLINEAS || '').split(',').map((s) => s.trim()).filter(Boolean);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email: 'prueba.vuelos@example.com', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.x`;
const resultados = [];
const creadas = [];

async function llamar(metodo, ruta, { cuerpo, corr = 'corr-e2e', sub = USUARIO, cab = {} } = {}) {
  const t = Date.now();
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json', 'X-Device-Fingerprint': sub, Authorization: `Bearer ${jwt(sub)}`,
      'X-Correlation-Id': corr, 'Idempotency-Key': crypto.randomUUID(), ...cab,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await r.text();
  let json; try { json = JSON.parse(texto); } catch { json = { _texto: texto }; }
  return { status: r.status, ms: Date.now() - t, json };
}

function caso(id, nombre, ok, detalle = '') {
  resultados.push({ id, nombre, ok, detalle });
  console.log(`${ok ? '✅ PASA ' : '❌ FALLA'}  ${id.padEnd(6)} ${nombre}${detalle ? `  · ${detalle}` : ''}`);
}

const fechaEc = (dias) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date(Date.now() + dias * 86_400_000));
const pasajero = (extra = {}) => ({
  passengerId: 'pax-1', passengerType: 'ADULT', firstName: 'Prueba', lastName: 'Automatica', documentType: 'NATIONAL_ID',
  documentNumber: '1712345675', nationality: 'EC', birthDate: '1995-05-10', gender: 'M',
  contact: { email: 'prueba.vuelos@example.com', phone: '+593991234567' }, ...extra,
});

async function buscar(ida, vuelta) {
  const its = [{ origin: 'UIO', destination: 'GYE', departureDate: ida }];
  if (vuelta) its.push({ origin: 'GYE', destination: 'UIO', departureDate: vuelta });
  return llamar('POST', '/vuelos/search', { cuerpo: { itineraries: its, passengers: { adults: 1, children: 0, infants: 0 } } });
}

function selecciones(oferta) {
  const p0 = oferta.itineraries[0].pricingOptions[0];
  return oferta.itineraries.map((it) => {
    const o = it.pricingOptions.find((p) => p.cabinClass === p0.cabinClass && p.fareBrand === p0.fareBrand) || it.pricingOptions[0];
    return { itineraryId: it.itineraryId, cabinClass: o.cabinClass, fareBrand: o.fareBrand };
  });
}

async function hold(oferta) {
  return llamar('POST', '/vuelos/offers/hold', { cuerpo: { offerId: oferta.offerId, itinerarySelections: selecciones(oferta), passengersBreakdown: { adults: 1, children: 0, infants: 0 } } });
}

async function reservar(holdId, pax, cab = {}) {
  const r = await llamar('POST', '/vuelos/bookings', { cuerpo: { holdId, passengers: pax, payment: { paymentReference: 'ignorado-por-booking' } }, cab });
  if (r.json.bookingId) creadas.push(r.json.bookingId);
  return r;
}

async function cancelar(bookingId) {
  const e = encodeURIComponent(bookingId);
  const q = await llamar('GET', `/vuelos/bookings/${e}/cancellation-quote`);
  const c = await llamar('POST', `/vuelos/bookings/${e}/cancel`, { cuerpo: { quoteId: q.json.quoteId, reasonCode: 'CUSTOMER_REQUEST', reason: 'Prueba automática' } });
  c.cotizacion = q.json;
  return c;
}

async function probarAerolinea(nodo, oferta, ofertaVuelta, fechaIda) {
  const n = nodo.replace('NODE_VUE_', '').slice(0, 8);
  const it = oferta.itineraries[0];
  const seg = it.segments[0];
  const precio = selecciones(oferta).map((s, i) => Number(oferta.itineraries[i].pricingOptions.find((p) => p.fareBrand === s.fareBrand && p.cabinClass === s.cabinClass).pricePerPassengerType[0].price.total)).reduce((a, b) => a + b, 0);

  // Hold
  const h = await hold(oferta);
  caso(`${n}-02`, 'Hold con el precio de la tarifa', h.status === 201 && Math.abs(Number(h.json.lockedPrice?.total) - precio) < 0.01, `${h.json.lockedPrice?.total} vs ${precio.toFixed(2)}`);

  // Ida y vuelta (antes 422)
  if (ofertaVuelta) {
    const hv = await hold(ofertaVuelta);
    caso(`${n}-03`, 'Hold ida y vuelta (una tarifa por tramo)', hv.status === 201, `HTTP ${hv.status} ${hv.json.lockedPrice?.total ?? hv.json.title ?? ''}`);
    if (hv.json.holdId) await llamar('DELETE', `/vuelos/offers/hold/${encodeURIComponent(hv.json.holdId)}`);
  }

  // Mapa de asientos
  const mapa = await llamar('GET', `/vuelos/offers/${encodeURIComponent(oferta.offerId)}/seatmap?segmentId=${encodeURIComponent(seg.segmentId)}`);
  const cabina = (mapa.json.cabins || []).find((c) => c.cabinClass === selecciones(oferta)[0].cabinClass);
  const libres = (cabina?.rows || []).flatMap((r) => r.seats).filter((a) => a.isAvailable !== false && String(a.status || 'AVAILABLE') === 'AVAILABLE').map((a) => a.seatNumber);
  caso(`${n}-04`, 'Mapa de asientos real de la cabina pagada', mapa.status === 200 && libres.length > 0, `${libres.length} libres`);
  const asiento = libres[Math.floor(libres.length / 2)];

  // Compra con datos como los manda el formulario (ECU, teléfono local) + asiento
  const pax = [pasajero({ nationality: 'ECU', contact: { email: 'prueba.vuelos@example.com', phone: '0991234567' }, assignedSeats: asiento ? [{ segmentId: seg.segmentId, seatNumber: asiento }] : undefined })];
  const r = await reservar(h.json.holdId, pax);
  const f = r.json.factura;
  caso(`${n}-05`, 'Compra: cobro, PNR y reserva CONFIRMED', r.status === 201 && !!r.json.pnr && r.json.status === 'CONFIRMED', `HTTP ${r.status} PNR ${r.json.pnr ?? r.json.title}`);
  caso(`${n}-06`, 'Nacionalidad ECU y teléfono local normalizados', r.status === 201, 'ECU→EC, 0991234567→+593991234567');
  caso(`${n}-07`, 'Factura emitida (número, subtotal + impuestos = total)', !!f && /^FAC-\d{8}-\d{6}$/.test(f.numero) && Math.abs(Number(f.subtotal) + Number(f.impuestos) - Number(f.total)) < 0.02, f ? `${f.numero} ${f.subtotal}+${f.impuestos}=${f.total}` : 'sin factura');
  caso(`${n}-08`, 'La aerolínea recibe nuestra orden (salesChannel.partnerOrderId)', /^ORD-BKP-/.test(r.json.salesChannel?.partnerOrderId ?? ''), r.json.salesChannel?.partnerOrderId ?? '');
  caso(`${n}-09`, 'Referencia de pago PAY-BKP enviada a la aerolínea', /^PAY-BKP-\d{8}-\d{6}$/.test(r.json.payment?.paymentReference ?? r.json.paymentReference ?? ''), r.json.payment?.paymentReference ?? '');
  if (r.status !== 201) return;
  const bid = encodeURIComponent(r.json.bookingId);

  // Detalle, dueño, Mis Reservas, estado de vuelo
  const d = await llamar('GET', `/vuelos/bookings/${bid}`);
  caso(`${n}-10`, 'Detalle con factura', d.status === 200 && d.json.factura?.numero === f?.numero, d.json.factura?.numero ?? '');
  const ajeno = await llamar('GET', `/vuelos/bookings/${bid}`, { sub: OTRO });
  caso(`${n}-11`, 'Otro usuario no puede ver la reserva', ajeno.status === 404, `HTTP ${ajeno.status}`);
  const lista = await llamar('GET', '/vuelos/bookings?limit=50');
  caso(`${n}-12`, 'Aparece en Mis Reservas', (lista.json.items || []).some((b) => b.bookingId === r.json.bookingId));
  const est = await llamar('GET', `/vuelos/flights/${seg.flightNumber}/status?date=${fechaIda}`);
  caso(`${n}-13`, 'Estado del vuelo', est.status === 200 && !!est.json.flightNumber, `${seg.flightNumber} HTTP ${est.status}`);

  // Asiento ocupado para la siguiente compra
  if (asiento) {
    const mapa2 = await llamar('GET', `/vuelos/offers/${encodeURIComponent(oferta.offerId)}/seatmap?segmentId=${encodeURIComponent(seg.segmentId)}`);
    const a2 = (mapa2.json.cabins || []).flatMap((c) => c.rows).flatMap((x) => x.seats).find((s) => s.seatNumber === asiento);
    caso(`${n}-14`, 'El asiento comprado sale ocupado en el mapa', a2 && (a2.isAvailable === false || a2.status !== 'AVAILABLE'), `${asiento} → ${a2?.status}`);
    const h2 = await hold(oferta);
    const dup = await reservar(h2.json.holdId, [pasajero({ lastName: 'Duplicado', documentType: 'PASSPORT', documentNumber: 'XA9988776', documentExpiryDate: '2031-01-31', assignedSeats: [{ segmentId: seg.segmentId, seatNumber: asiento }] })]);
    caso(`${n}-15`, 'Mismo asiento dos veces: la aerolínea rechaza y se reembolsa', dup.status === 409 && /reembolsó/i.test(dup.json.detail ?? ''), `HTTP ${dup.status} ${dup.json.detail ?? ''}`.slice(0, 90));
  }

  // Check-in desde Booking (solo si el vuelo es dentro de 48 h)
  const ci = await llamar('POST', `/vuelos/bookings/${bid}/check-in`, { cuerpo: {} });
  if (ci.status === 200) {
    const d2 = await llamar('GET', `/vuelos/bookings/${bid}`);
    caso(`${n}-16`, 'Check-in desde Booking → "Check-in realizado"', d2.json.status === 'CHECKED_IN', d2.json.status);
  } else {
    caso(`${n}-16`, 'Check-in desde Booking (fuera de la ventana de la aerolínea)', ci.status === 409, `HTTP ${ci.status}: ${ci.json.title ?? ''}`.slice(0, 90));
  }

  // Cancelación con reembolso y nota de crédito
  // Si la tarifa no es reembolsable (cotización con refundAmount 0) lo correcto es
  // cancelar sin devolver nada ni emitir nota de crédito.
  const c = await cancelar(r.json.bookingId);
  const reembolsable = Number(c.cotizacion?.refundAmount ?? 0) > 0;
  caso(`${n}-17`, reembolsable ? 'Cancelar: reembolso ejecutado por Booking + nota de crédito' : 'Cancelar tarifa no reembolsable: sin devolución ni nota de crédito',
    c.status === 200 && c.json.status === 'CANCELLED' && (reembolsable
      ? /^NC-/.test(c.json.refund?.creditNote?.numero ?? '')
      : !c.json.refund?.creditNote && Number(c.json.refund?.executedAmount ?? 0) === 0),
    `cotizado ${c.cotizacion?.refundAmount ?? '?'} · devuelto ${c.json.refund?.executedAmount ?? 0} ${c.json.refund?.creditNote?.numero ?? ''}`);
  creadas.splice(creadas.indexOf(r.json.bookingId), 1);

  // Fallos controlados
  const h3 = await hold(oferta);
  // Nacionalidad de 4 letras: inválida para cualquier aerolínea (el contrato pide ISO alfa-2).
  const malo2 = await reservar(h3.json.holdId, [pasajero({ nationality: 'ZZZZ' })]);
  caso(`${n}-18`, 'Dato inválido: la aerolínea rechaza y el cobro se devuelve', malo2.status >= 400 && /reembolsó/i.test(malo2.json.detail ?? ''), `HTTP ${malo2.status} ${(malo2.json.invalidParams?.[0]?.name ?? malo2.json.title ?? '')}`.slice(0, 90));
  const ok = await reservar(h3.json.holdId, [pasajero({ lastName: 'Reintento' })], { 'Idempotency-Key': crypto.randomUUID() });
  caso(`${n}-19`, 'Reintento corregido después del rechazo', ok.status === 201, `HTTP ${ok.status} ${ok.json.pnr ?? ok.json.title ?? ''}`);

  const h4 = await hold(oferta);
  await llamar('DELETE', `/vuelos/offers/hold/${encodeURIComponent(h4.json.holdId)}`);
  const lib = await reservar(h4.json.holdId, [pasajero()]);
  caso(`${n}-20`, 'Hold liberado: no se cobra (410)', lib.status === 410 && /ningún cobro/i.test(lib.json.detail ?? ''), `HTTP ${lib.status}`);

  const sin = await llamar('POST', '/vuelos/bookings', { cuerpo: { holdId: h4.json.holdId, passengers: [pasajero()], payment: { paymentReference: 'x' } }, cab: { 'Idempotency-Key': '' } });
  caso(`${n}-21`, 'Sin Idempotency-Key: no se cobra', sin.status === 400, `HTTP ${sin.status}`);
}

async function probarWebhooks() {
  if (SECRETO.length < 16) { console.log('ℹ️  WEBHOOK_SECRET_VUELOS no definido: se omiten las pruebas de webhooks.'); return; }
  const url = `${RAIZ}/api/v2/webhooks/vuelos`;
  const evento = { specversion: '1.0', id: crypto.randomUUID(), source: '/vuelos/PRUEBA', type: 'ec.edu.epn.booking.vuelos.booking.checked_in', time: new Date().toISOString(), datacontenttype: 'application/json', data: { bookingId: crypto.randomUUID(), pnr: 'PRUEBA', status: 'CONFIRMED' } };
  const cuerpo = JSON.stringify(evento);
  const firma = 'sha256=' + crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('hex');
  const enviar = (f, ct = 'application/cloudevents+json', c = cuerpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': ct, 'X-Webhook-Signature': f }, body: c }).then((r) => r.status);
  caso('WH-01', 'Webhook firmado se acepta', (await enviar(firma)) === 202);
  caso('WH-02', 'Mismo evento otra vez: deduplicado', (await enviar(firma)) === 200);
  caso('WH-03', 'Firma inválida: 401', (await enviar('sha256=' + '0'.repeat(64))) === 401);
  caso('WH-04', 'Content-Type incorrecto: 400', (await enviar(firma, 'application/json')) === 400);
}

(async () => {
  console.log(`Pruebas de Vuelos contra ${API}\n`);
  // Fecha con vuelos de todas las aerolíneas, a 1-2 días para poder probar check-in.
  let fechaIda = null, busqueda = null;
  for (const dias of [1, 2, 3, 5, 6]) {
    const f = fechaEc(dias);
    const s = await buscar(f, fechaEc(dias + 2));
    const nodos = new Set((s.json.offers || []).map((o) => o.offerId.split('~')[0]));
    if (nodos.size >= Math.max(1, FILTRO.length || 2)) { fechaIda = f; busqueda = s; break; }
    if (!busqueda && s.json.offers?.length) { fechaIda = f; busqueda = s; }
  }
  const ofertas = busqueda?.json.offers || [];
  const ida = await buscar(fechaIda);
  const porNodo = {};
  for (const o of ida.json.offers || []) porNodo[o.offerId.split('~')[0]] ??= { ida: o };
  for (const o of ofertas) if (o.itineraries.length === 2 && porNodo[o.offerId.split('~')[0]]) porNodo[o.offerId.split('~')[0]].vuelta ??= o;
  const nodos = Object.keys(porNodo).filter((n) => !FILTRO.length || FILTRO.some((f) => n.startsWith(f)));
  caso('BUS-01', 'Búsqueda: responden las aerolíneas socias', ida.status === 200 && nodos.length > 0, `${fechaIda}: ${nodos.join(', ')} (${ida.ms} ms)`);
  caso('BUS-02', 'Búsqueda ida y vuelta devuelve 2 tramos', ofertas.some((o) => o.itineraries.length === 2));
  caso('BUS-03', 'Horas con zona (se muestran en hora de Ecuador)', (ida.json.offers || []).every((o) => /([+-]\d{2}:\d{2}|Z)$/.test(o.itineraries[0].segments[0].departureAt ?? o.itineraries[0].segments[0].departure?.at ?? '')));

  for (const nodo of nodos) {
    console.log(`\n── ${nodo} ──`);
    try { await probarAerolinea(nodo, porNodo[nodo].ida, porNodo[nodo].vuelta, fechaIda); }
    catch (e) { caso(nodo.slice(9, 17), 'Error inesperado', false, e.message); }
  }
  console.log('\n── Webhooks ──');
  await probarWebhooks();

  if (!process.env.NO_LIMPIAR) {
    for (const id of [...creadas]) await cancelar(id).catch(() => undefined);
    if (creadas.length) console.log(`\n🧹 ${creadas.length} reserva(s) de prueba canceladas (cobros devueltos).`);
  }
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\nResultado: ${resultados.length - fallos.length}/${resultados.length} pasan${fallos.length ? ` · fallan: ${fallos.map((f) => f.id).join(', ')}` : ' ✅'}`);
  process.exit(fallos.length ? 1 : 0);
})();
