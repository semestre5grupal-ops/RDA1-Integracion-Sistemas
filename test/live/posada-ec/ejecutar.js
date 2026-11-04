#!/usr/bin/env node
/**
 * Suite de pruebas REALES contra lo desplegado de Posada EC (Samantha Nuñez, NODE_ALO_PEC)
 * y contra el Booking desplegado.
 *
 *   POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js            # todo (crea y cancela reservas)
 *   POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js --solo-lectura
 *   POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js --solo=A02,B01
 *
 * Variables opcionales: POSADA_BASE_URL, BOOKING_BASE_URL, PRUEBAS_ESPERA_SYNC_MS (def. 5000),
 * PRUEBAS_MAX_AGOTAR (def. 8), PRUEBAS_TIMEOUT_MS (def. 15000).
 *
 * Toda reserva que se crea se cancela al final (sección «Limpieza» del reporte).
 * El reporte queda en test/live/posada-ec/resultados/<fecha>.md y .json.
 * Catálogo y explicación: docs/PRUEBAS_REALES_POSADA_EC.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./cliente');
const { CONFIG, posada, booking, uuid, esperar, resumen, codigo, titular, money } = C;

const args = process.argv.slice(2);
const SOLO_LECTURA = args.includes('--solo-lectura');
const SOLO = (args.find((a) => a.startsWith('--solo=')) || '').replace('--solo=', '').split(',').filter(Boolean);
const ESPERA_SYNC = Number(process.env.PRUEBAS_ESPERA_SYNC_MS || 5000);

// ─── Contexto compartido ─────────────────────────────────────────────────────────
const ctx = {
  hotelesPosada: [],
  hotelesBooking: [],
  mapeados: [], // [{ posada, booking }]
  proveedorEnBooking: null,
  base: null, // orden "base" creada en Posada para las pruebas de ciclo de vida
  ref: null, // un hotel/tipo con cupo para las pruebas de validación
  creadasPosada: [], // { ref, etiqueta, cancelada }
  creadasBooking: [], // { id, etiqueta, cancelada }
  posadaOk: false,
  bookingOk: false,
};

/** Ventanas de fechas separadas para que unas pruebas no interfieran con otras. */
function ventana(n, noches = 2) {
  const checkin = C.sumarDias(C.hoyGuayaquil(), 40 + n * 5);
  return { checkin, checkout: C.sumarDias(checkin, noches) };
}

function registrarPosada(r, etiqueta) {
  const ref = C.refDeOrden(r);
  if ((r.status === 200 || r.status === 201) && ref && (ref.orderId || ref.externalOrderId || ref.codigoReserva)) {
    const ya = ctx.creadasPosada.find((x) => x.ref.orderId && x.ref.orderId === ref.orderId);
    if (!ya) ctx.creadasPosada.push({ ref, etiqueta, cancelada: false });
    return ref;
  }
  return null;
}
function registrarBooking(r, etiqueta) {
  const id = r?.body?.reservation_id || r?.body?.order_id || r?.body?.id;
  if ((r.status === 200 || r.status === 201) && id) {
    ctx.creadasBooking.push({ id, codigo: r.body.codigo_reserva, etiqueta, cancelada: false });
    return id;
  }
  return null;
}
function marcarCancelada(ref) {
  const x = ctx.creadasPosada.find((o) => o.ref === ref || (ref?.orderId && o.ref.orderId === ref.orderId));
  if (x) x.cancelada = true;
}
const idOrden = (ref) => ref?.orderId || ref?.externalOrderId || ref?.codigoReserva;

/** Busca un hotel/tipo con cupo dentro de un rango (y presente en Booking si se pide). */
async function buscarTipo({ n, minRem = 1, maxRem = Infinity, conBooking = true, maxRemBooking, exacto = false }) {
  const { checkin, checkout } = ventana(n);
  if (conBooking && !ctx.mapeados.length) return null;
  const candidatos = conBooking ? ctx.mapeados : ctx.hotelesPosada.map((h) => ({ posada: h, booking: null }));
  for (const c of candidatos.slice(0, 25)) {
    if (String(c.posada.estado).toUpperCase().startsWith('INACT')) continue;
    const { opciones } = await posada.disponibilidad(c.posada.id, checkin, checkout);
    let tiposB = [];
    if (conBooking) tiposB = C.tiposBooking(await booking.disponibilidad(c.booking.id, checkin, checkout));
    const validas = opciones
      .filter((o) => (Number.isFinite(o.remanentes) ? o.remanentes >= minRem && o.remanentes <= maxRem : !exacto && maxRem === Infinity && o.disponible))
      .sort((a, b) => (a.remanentes || 99) - (b.remanentes || 99));
    for (const o of validas) {
      const tb = conBooking ? C.emparejarTipo(tiposB, o.codigo, o.nombre) : null;
      if (conBooking && !tb) continue;
      if (maxRemBooking !== undefined && !(tb.libres >= 1 && tb.libres <= maxRemBooking)) continue;
      return { hotel: c.posada, hotelBooking: c.booking, opcion: o, tipoBooking: tb, checkin, checkout };
    }
  }
  return null;
}

async function remanentesPosada(hotelId, codigoTipo, checkin, checkout) {
  const { r, opciones } = await posada.disponibilidad(hotelId, checkin, checkout);
  if (r.status !== 200) return { valor: null, r };
  const o = opciones.find((x) => C.normCodigo(x.codigo) === C.normCodigo(codigoTipo));
  return { valor: o ? o.remanentes : 0, r, opcion: o };
}
async function libresBooking(hotelBookingId, codigoTipo, checkin, checkout) {
  const r = await booking.disponibilidad(hotelBookingId, checkin, checkout);
  if (r.status !== 200) return { valor: null, r };
  const t = C.emparejarTipo(C.tiposBooking(r), codigoTipo);
  return { valor: t ? t.libres : null, r, tipo: t };
}

/** Reserva N habitaciones de un tipo en Posada: primero en una sola orden; si no, de una en una. */
async function agotarEnPosada(v, n, etiqueta, t) {
  const creadas = [];
  if (n > 1) {
    const { r } = await C.crearOrdenPosada({ id: v.hotel.id, codigo: v.opcion.codigo, checkin: v.checkin, checkout: v.checkout, habitaciones: n, opcion: v.opcion });
    t.evidencia(`Posada orders/create ×${n} habitaciones en una orden`, r);
    if (registrarPosada(r, etiqueta)) return { ok: true, ordenes: 1 };
  }
  for (let i = 0; i < n; i++) {
    const { r } = await C.crearOrdenPosada({ id: v.hotel.id, codigo: v.opcion.codigo, checkin: v.checkin, checkout: v.checkout, habitaciones: 1, opcion: v.opcion });
    if (i === 0 || r.status !== 201) t.evidencia(`Posada orders/create habitación ${i + 1}/${n}`, r);
    if (!registrarPosada(r, etiqueta)) return { ok: false, ordenes: creadas.length };
    creadas.push(r);
  }
  return { ok: true, ordenes: creadas.length };
}

/**
 * Veredicto típico de "esto se debe rechazar".
 * - 2xx → FALLA (aceptó algo inválido)   - 5xx/sin respuesta → FALLA (error del servidor)
 * - status y code esperados → PASA      - otro 4xx → AVISO (rechaza, pero no como dice el contrato)
 */
function veredictoRechazo(t, r, { estados, codigos = [], etiqueta }) {
  t.evidencia(etiqueta || 'Respuesta', r);
  if (r.status >= 200 && r.status < 300) {
    const ref = registrarPosada(r, `aceptada por error: ${t.id}`);
    // Se cancela en el acto para que la habitación ocupada no altere otras pruebas.
    if (ref) posada.cancelar(idOrden(ref)).then((rc) => rc.status === 200 && marcarCancelada(ref));
    return t.falla(`Lo aceptó (HTTP ${r.status}${ref ? `, orden ${idOrden(ref)}` : ''}). Debía rechazarlo con ${estados.join('/')}${codigos.length ? ` ${codigos.join('/')}` : ''}.`);
  }
  if (r.status === 0 || r.status >= 500) return t.falla(`Error del servidor en vez de un rechazo controlado: ${resumen(r)}.`);
  const c = codigo(r);
  if (estados.includes(r.status) && (!codigos.length || codigos.includes(c))) return t.pasa(`Rechazado correctamente: ${resumen(r)}.`);
  if (estados.includes(r.status)) return t.aviso(`Rechaza con el HTTP correcto pero el code es «${c ?? 'ninguno'}» (contrato: ${codigos.join('/')}).`);
  return t.aviso(`Rechaza, pero con ${resumen(r)} (contrato: ${estados.join('/')}${codigos.length ? ` ${codigos.join('/')}` : ''}).`);
}

/** Cuerpo de orden válido sobre el hotel/tipo de referencia, con cambios. */
function cuerpoRef(cambios = {}, n = 9) {
  const { checkin, checkout } = ventana(n);
  const total = ctx.ref?.opcion?.precioTotal || '100.00';
  const b = posada.cuerpoOrden({ id: ctx.ref.hotel.id, codigo: ctx.ref.opcion.codigo, checkin, checkout, total });
  return { ...b, ...cambios };
}

// ─── Catálogo de escenarios ──────────────────────────────────────────────────────
// requiere: 'posada' | 'booking' | 'escritura' | 'base' (orden base) | 'ref' (hotel de referencia)
const ESCENARIOS = [
  // ── S · Salud y catálogo ──────────────────────────────────────────────────────
  {
    id: 'S01', grupo: 'S · Salud y catálogo', requiere: [],
    titulo: 'El sistema de Posada está en línea',
    historia: 'Antes de vender, Booking verifica que el hotel responde.',
    esperado: 'GET /alojamientos/health → 200, status HEALTHY/UP y devuelve el X-Correlation-ID.',
    async run(t) {
      const corr = `qa-corr-${uuid()}`;
      const r = await C.http('GET', posada.url('/alojamientos/health'), { headers: { 'X-Correlation-ID': corr, ...(CONFIG.posadaKey ? { 'X-API-Key': CONFIG.posadaKey } : {}) } });
      t.evidencia('Posada health', r);
      if (r.status !== 200) return t.falla(`No responde sano: ${resumen(r)}.`);
      ctx.posadaOk = true;
      const st = String(r.body?.status || r.body?.estado || '').toUpperCase();
      const eco = r.headers['x-correlation-id'];
      const notas = [];
      if (!['HEALTHY', 'UP', 'OK'].includes(st)) notas.push(`status «${st}»`);
      if (eco !== corr) notas.push(`X-Correlation-ID devuelto: «${eco ?? 'ninguno'}» (se envió ${corr})`);
      if (notas.length) return t.aviso(`Responde 200 (${r.ms} ms) pero: ${notas.join('; ')}.`);
      return t.pasa(`HEALTHY en ${r.ms} ms y devuelve el X-Correlation-ID.`);
    },
  },
  {
    id: 'S02', grupo: 'S · Salud y catálogo', requiere: [],
    titulo: 'El Booking desplegado está en línea',
    historia: 'Las pruebas de doble canal necesitan nuestro propio sistema.',
    esperado: 'GET /alojamientos → 200.',
    async run(t) {
      const r = await booking.ping();
      t.evidencia('Booking GET /alojamientos', r);
      if (r.status !== 200) return t.falla(`Booking no responde: ${resumen(r)}.`);
      ctx.bookingOk = true;
      return t.pasa(`Responde en ${r.ms} ms.`);
    },
  },
  {
    id: 'S03', grupo: 'S · Salud y catálogo', requiere: ['posada', 'booking'],
    titulo: 'Los hoteles de Posada aparecen en Booking',
    historia: 'Un viajero busca en Booking un hotel que Posada sí ofrece.',
    esperado: 'Cada hotel ACTIVO de Posada existe en Booking (emparejado por id_externo).',
    async run(t) {
      const p = await posada.listarHoteles();
      const b = await booking.catalogo();
      if (!p.ok) return t.bloqueado(`No se pudo leer el catálogo de Posada: ${resumen(p.r)}.`);
      if (!b.ok) return t.bloqueado(`No se pudo leer el catálogo de Booking: ${resumen(b.r)}.`);
      ctx.hotelesPosada = p.hoteles;
      ctx.hotelesBooking = b.hoteles;
      const porExterno = new Map();
      for (const h of b.hoteles) {
        if (h.id_externo) porExterno.set(String(h.id_externo), h);
        porExterno.set(String(h.id), porExterno.get(String(h.id)) || h);
      }
      ctx.mapeados = p.hoteles.map((h) => ({ posada: h, booking: porExterno.get(String(h.id)) })).filter((m) => m.booking);
      const conteo = {};
      for (const m of ctx.mapeados) conteo[m.booking.proveedor_id || '(sin proveedor)'] = (conteo[m.booking.proveedor_id || '(sin proveedor)'] || 0) + 1;
      ctx.proveedorEnBooking = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const activos = p.hoteles.filter((h) => !String(h.estado).toUpperCase().startsWith('INACT'));
      const faltan = activos.filter((h) => !ctx.mapeados.some((m) => m.posada.id === h.id));
      t.dato('Hoteles en Posada', p.hoteles.length);
      t.dato('Hoteles en Booking (todos los proveedores)', b.hoteles.length);
      t.dato('Emparejados', `${ctx.mapeados.length} (proveedor en Booking: ${ctx.proveedorEnBooking ?? '—'})`);
      if (!ctx.mapeados.length) return t.falla('Ningún hotel de Posada está en Booking: el viajero no puede encontrarlos. Las pruebas de doble canal quedan bloqueadas.');
      if (faltan.length) return t.falla(`${faltan.length} de ${activos.length} hoteles activos de Posada NO están en Booking: ${faltan.slice(0, 8).map((h) => h.id).join(', ')}${faltan.length > 8 ? '…' : ''}.`);
      return t.pasa(`Los ${activos.length} hoteles activos de Posada están en Booking.`);
    },
  },
  {
    id: 'S04', grupo: 'S · Salud y catálogo', requiere: ['posada', 'booking'],
    titulo: 'Booking no vende hoteles que Posada ya retiró',
    historia: 'Posada da de baja un hotel; un viajero lo sigue viendo en Booking y lo reserva.',
    esperado: 'Ningún hotel de Posada inactivo o inexistente aparece activo en Booking.',
    async run(t) {
      if (!ctx.hotelesPosada.length) return t.bloqueado('Depende de S03.');
      const idsPosada = new Set(ctx.hotelesPosada.map((h) => String(h.id)));
      const inactivos = new Set(ctx.hotelesPosada.filter((h) => String(h.estado).toUpperCase().startsWith('INACT')).map((h) => String(h.id)));
      const delProveedor = ctx.proveedorEnBooking ? ctx.hotelesBooking.filter((h) => h.proveedor_id === ctx.proveedorEnBooking) : [];
      const fantasmas = delProveedor.filter((h) => h.id_externo && !idsPosada.has(String(h.id_externo)));
      const retiradosVisibles = ctx.mapeados.filter((m) => inactivos.has(String(m.posada.id)));
      t.dato('Hoteles del proveedor en Booking', delProveedor.length);
      if (fantasmas.length || retiradosVisibles.length) {
        return t.falla(`Booking muestra ${fantasmas.length} hotel(es) que Posada ya no tiene (${fantasmas.slice(0, 6).map((h) => h.id_externo).join(', ')}) y ${retiradosVisibles.length} que Posada marcó inactivos.`);
      }
      return t.pasa('No hay hoteles fantasma ni retirados a la venta.');
    },
  },

  {
    id: 'S05', grupo: 'S · Salud y catálogo', requiere: ['booking', 'escritura'],
    titulo: 'Un cliente puede reservar en Booking un hotel de Posada',
    historia: 'Un viajero elige un hotel de Posada en Booking y pulsa «Reservar».',
    esperado: 'POST /alojamientos/{id}/reservations → 201 (o 409 si no hay cupo). Nunca 500.',
    async run(t) {
      const m = ctx.mapeados[0];
      if (!m) return t.bloqueado('Depende de S03.');
      const { checkin, checkout } = ventana(13);
      const tb = C.tiposBooking(await booking.disponibilidad(m.booking.id, checkin, checkout))[0];
      const rb = await booking.reservar(m.booking.id, { checkin, checkout, tipo: tb?.id, etiqueta: 's05' });
      t.evidencia(`Booking reserva ${m.booking.id} ${checkin} → ${checkout}`, rb);
      if (registrarBooking(rb, 'S05')) return t.pasa(`Reserva ${rb.body?.codigo_reserva} creada.`);
      if (rb.status === 0 || rb.status >= 500) return t.falla(`El cliente NO puede reservar: ${resumen(rb)} (correlation_id ${rb.body?.correlation_id ?? '—'}).`);
      return t.aviso(`No se pudo reservar: ${resumen(rb)}.`);
    },
  },

  // ── A · Doble canal (el caso del compañero y sus variantes) ─────────────────────
  {
    id: 'A01', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking', 'escritura'],
    titulo: 'Una reserva hecha en Booking llega al hotel',
    historia: 'Reservo en Booking, llego a Posada y en recepción no tienen mi reserva.',
    esperado: 'Tras reservar 1 habitación en Booking, Posada muestra 1 habitación menos de ese tipo (o la orden existe en Posada).',
    async run(t) {
      const v = await buscarTipo({ n: 1, minRem: 1, exacto: true });
      if (!v) return t.bloqueado('No se encontró un hotel/tipo con cupo presente en ambos sistemas.');
      t.dato('Hotel / tipo / fechas', `${v.hotel.id} (${v.hotel.nombre}) · ${v.opcion.codigo} · ${v.checkin} → ${v.checkout}`);
      const antes = v.opcion.remanentes;
      const rb = await booking.reservar(v.hotelBooking.id, { checkin: v.checkin, checkout: v.checkout, tipo: v.tipoBooking.id, etiqueta: 'a01' });
      t.evidencia('Booking reserva 1 habitación', rb);
      if (!registrarBooking(rb, 'A01')) return t.bloqueado(`Booking no aceptó la reserva de prueba: ${resumen(rb)}.`);
      await esperar(ESPERA_SYNC);
      const d = await remanentesPosada(v.hotel.id, v.opcion.codigo, v.checkin, v.checkout);
      t.evidencia('Posada disponibilidad después', d.r);
      t.dato('Habitaciones libres en Posada antes → después', `${antes} → ${d.valor}`);
      if (d.valor === antes - 1) return t.pasa('Posada descontó la habitación vendida por Booking.');
      return t.falla(`Posada sigue mostrando ${d.valor} habitaciones libres (antes ${antes}): la reserva de Booking (${rb.body?.codigo_reserva}) NO llegó al hotel. El huésped llegaría sin reserva y el hotel puede vender esa habitación a otro.`);
    },
  },
  {
    id: 'A02', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking', 'escritura'],
    titulo: 'Caso del compañero: reservar en Posada y luego la misma habitación en Booking',
    historia: 'Un cliente reserva directo en la página de Posada la última habitación; otro intenta reservarla en Booking.',
    esperado: 'Booking muestra 0 disponibles para ese tipo y rechaza la reserva (409).',
    async run(t) {
      const v = await buscarTipo({ n: 2, minRem: 1, maxRem: CONFIG.maxAgotar, exacto: true });
      if (!v) return t.bloqueado(`No hay un tipo con 1–${CONFIG.maxAgotar} habitaciones libres en un hotel presente en ambos sistemas (ajusta PRUEBAS_MAX_AGOTAR).`);
      const n = v.opcion.remanentes;
      t.dato('Hotel / tipo / fechas', `${v.hotel.id} · ${v.opcion.codigo} · ${v.checkin} → ${v.checkout}`);
      t.dato('Libres antes: Posada / Booking', `${n} / ${v.tipoBooking.libres}`);
      const ag = await agotarEnPosada(v, n, 'A02 (agotar en Posada)', t);
      if (!ag.ok) return t.bloqueado('No se pudo agotar el tipo en Posada (ver evidencias).');
      const dp = await remanentesPosada(v.hotel.id, v.opcion.codigo, v.checkin, v.checkout);
      t.dato('Libres en Posada tras agotar', dp.valor);
      await esperar(ESPERA_SYNC);
      const db = await libresBooking(v.hotelBooking.id, v.opcion.codigo, v.checkin, v.checkout);
      t.dato('Libres que muestra Booking tras agotar', db.valor);
      const rb = await booking.reservar(v.hotelBooking.id, { checkin: v.checkin, checkout: v.checkout, tipo: v.tipoBooking.id, etiqueta: 'a02' });
      t.evidencia('Booking intenta reservar la misma habitación', rb);
      if (registrarBooking(rb, 'A02 (sobreventa)')) {
        return t.falla(`SOBREVENTA: Posada ya no tiene habitaciones (${dp.valor} libres) y Booking aceptó la reserva ${rb.body?.codigo_reserva} y le mostraba ${db.valor} libres al cliente.`);
      }
      const muestra = Number.isFinite(db.valor) && db.valor > 0 ? ` y le sigue mostrando al cliente ${db.valor} habitación(es) libre(s) que no existen` : '';
      if (rb.status === 0 || rb.status >= 500) return t.falla(`Booking no vendió la habitación, pero sólo porque falló con ${resumen(rb)}, no porque supiera que estaba agotada${muestra}.`);
      if (muestra) return t.falla(`Booking rechazó la reserva (${resumen(rb)})${muestra}.`);
      if (rb.status === 409) return t.pasa(`Booking muestra 0 libres y rechazó la reserva (${resumen(rb)}).`);
      return t.aviso(`Booking no la aceptó, pero respondió ${resumen(rb)} en vez de 409.`);
    },
  },
  {
    id: 'A03', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking', 'escritura'],
    titulo: 'Inverso: agotar en Booking y luego reservar en la página de Posada',
    historia: 'Las últimas habitaciones se venden por Booking; un cliente intenta reservar directo en Posada.',
    esperado: 'Posada responde 409 OUT_OF_STOCK.',
    async run(t) {
      const v = await buscarTipo({ n: 3, minRem: 1, maxRemBooking: CONFIG.maxAgotar });
      if (!v) return t.bloqueado(`No hay un tipo con 1–${CONFIG.maxAgotar} libres en Booking.`);
      const L = v.tipoBooking.libres;
      t.dato('Hotel / tipo / fechas', `${v.hotel.id} · ${v.opcion.codigo} · ${v.checkin} → ${v.checkout}`);
      t.dato('Libres antes: Booking / Posada', `${L} / ${v.opcion.remanentes}`);
      const rb = await booking.reservar(v.hotelBooking.id, { checkin: v.checkin, checkout: v.checkout, habitaciones: L, tipo: v.tipoBooking.id, etiqueta: 'a03' });
      t.evidencia(`Booking reserva ${L} habitación(es)`, rb);
      if (!registrarBooking(rb, 'A03 (agotar en Booking)')) return t.bloqueado(`Booking no aceptó la reserva: ${resumen(rb)}.`);
      await esperar(ESPERA_SYNC);
      const dp = await remanentesPosada(v.hotel.id, v.opcion.codigo, v.checkin, v.checkout);
      t.dato('Libres en Posada tras vender todo en Booking', dp.valor);
      const { r } = await C.crearOrdenPosada({ id: v.hotel.id, codigo: v.opcion.codigo, checkin: v.checkin, checkout: v.checkout, opcion: dp.opcion || v.opcion });
      t.evidencia('Posada orders/create 1 habitación', r);
      if (registrarPosada(r, 'A03 (sobreventa)')) {
        return t.falla(`SOBREVENTA: Booking ya vendió las ${L} habitaciones y Posada aceptó otra reserva (${C.refDeOrden(r)?.codigoReserva}).`);
      }
      if (r.status === 409) return t.pasa(`Posada la rechazó: ${resumen(r)}.`);
      return t.aviso(`Posada no la aceptó, pero respondió ${resumen(r)}.`);
    },
  },
  {
    id: 'A04', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking', 'escritura'],
    titulo: 'Cancelar en Posada libera el cupo también en Booking',
    historia: 'Un cliente cancela directo con el hotel; esa habitación debe volver a venderse en Booking.',
    esperado: 'Booking baja 1 al reservar en Posada y vuelve al valor inicial al cancelar.',
    async run(t) {
      const v = await buscarTipo({ n: 4, minRem: 1, exacto: true });
      if (!v) return t.bloqueado('No se encontró un hotel/tipo con cupo presente en ambos sistemas.');
      t.dato('Hotel / tipo / fechas', `${v.hotel.id} · ${v.opcion.codigo} · ${v.checkin} → ${v.checkout}`);
      const b0 = v.tipoBooking.libres;
      const { r } = await C.crearOrdenPosada({ id: v.hotel.id, codigo: v.opcion.codigo, checkin: v.checkin, checkout: v.checkout, opcion: v.opcion });
      t.evidencia('Posada reserva 1 habitación', r);
      const ref = registrarPosada(r, 'A04');
      if (!ref) return t.bloqueado('No se pudo crear la reserva en Posada.');
      await esperar(ESPERA_SYNC);
      const b1 = (await libresBooking(v.hotelBooking.id, v.opcion.codigo, v.checkin, v.checkout)).valor;
      const rc = await posada.cancelar(idOrden(ref));
      t.evidencia('Posada cancela', rc);
      if (rc.status === 200) marcarCancelada(ref);
      await esperar(ESPERA_SYNC);
      const b2 = (await libresBooking(v.hotelBooking.id, v.opcion.codigo, v.checkin, v.checkout)).valor;
      t.dato('Libres en Booking: inicio → tras reservar en Posada → tras cancelar', `${b0} → ${b1} → ${b2}`);
      if (b1 === b0 - 1 && b2 === b0) return t.pasa('Booking reflejó la reserva y la liberación.');
      if (b1 === b0 && b2 === b0) return t.falla('Booking no se enteró ni de la reserva ni de la cancelación hechas en Posada (no hay sincronización de stock).');
      if (b2 < b0) return t.falla('El cupo quedó bloqueado en Booking después de cancelar: el hotel pierde ventas.');
      return t.aviso('Comportamiento parcial (ver datos).');
    },
  },
  {
    id: 'A05', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking'],
    titulo: 'La disponibilidad coincide en ambos canales',
    historia: 'Un viajero compara: en Booking dice «quedan 3», en la web del hotel «queda 1».',
    esperado: 'Para las mismas fechas y tipo, Booking muestra las mismas habitaciones libres que Posada.',
    async run(t) {
      if (!ctx.mapeados.length) return t.bloqueado('Depende de S03.');
      const { checkin, checkout } = ventana(5);
      const difs = [];
      let comparados = 0;
      for (const m of ctx.mapeados.slice(0, 6)) {
        const { opciones } = await posada.disponibilidad(m.posada.id, checkin, checkout);
        const tb = C.tiposBooking(await booking.disponibilidad(m.booking.id, checkin, checkout));
        for (const o of opciones) {
          const b = C.emparejarTipo(tb, o.codigo, o.nombre);
          comparados++;
          if (!b) difs.push(`${m.posada.id}/${o.codigo}: no existe en Booking`);
          else if (Number.isFinite(o.remanentes) && b.libres !== o.remanentes) difs.push(`${m.posada.id}/${o.codigo}: Posada ${o.remanentes} vs Booking ${b.libres}`);
        }
      }
      t.dato('Tipos comparados', `${comparados} (${checkin} → ${checkout})`);
      if (!comparados) return t.bloqueado('Posada no devolvió opciones de disponibilidad.');
      if (difs.length) return t.falla(`${difs.length} diferencia(s): ${difs.slice(0, 10).join('; ')}${difs.length > 10 ? '…' : ''}.`);
      return t.pasa('Coinciden todos los tipos comparados.');
    },
  },
  {
    id: 'A06', grupo: 'A · Doble canal Booking ⇄ Posada', requiere: ['posada', 'booking'],
    titulo: 'El precio por noche coincide en ambos canales',
    historia: 'Booking anuncia $45 la noche y el hotel cobra $60 (o al revés).',
    esperado: 'Mismo precio por noche para el mismo tipo y fechas.',
    async run(t) {
      if (!ctx.mapeados.length) return t.bloqueado('Depende de S03.');
      const { checkin, checkout } = ventana(5);
      const difs = [];
      let comparados = 0;
      for (const m of ctx.mapeados.slice(0, 6)) {
        const { opciones } = await posada.disponibilidad(m.posada.id, checkin, checkout);
        const tb = C.tiposBooking(await booking.disponibilidad(m.booking.id, checkin, checkout));
        for (const o of opciones) {
          const b = C.emparejarTipo(tb, o.codigo, o.nombre);
          if (!b || !o.precioNoche || !b.precioNoche) continue;
          comparados++;
          if (Math.abs(Number(o.precioNoche) - Number(b.precioNoche)) > 0.009) difs.push(`${m.posada.id}/${o.codigo}: Posada $${o.precioNoche} vs Booking $${b.precioNoche}`);
        }
      }
      if (!comparados) return t.bloqueado('No hubo tipos con precio por noche en ambos lados.');
      t.dato('Tipos comparados', comparados);
      if (difs.length) return t.falla(`${difs.length} precio(s) distinto(s): ${difs.slice(0, 10).join('; ')}.`);
      return t.pasa('Precios por noche iguales.');
    },
  },

  // ── Preparación de la orden base (Posada) ─────────────────────────────────────
  {
    id: 'P01', grupo: 'P · Reserva normal en Posada', requiere: ['posada', 'escritura'],
    titulo: 'Camino feliz: cotizar y reservar 1 habitación',
    historia: 'Un cliente normal reserva una habitación para dos noches.',
    esperado: '201 con orderId, external_order_id (ORD-HTL-…), codigoReserva (BK-HOTEL-…) y estado CONFIRMED.',
    async run(t) {
      if (!ctx.hotelesPosada.length) {
        const p = await posada.listarHoteles();
        ctx.hotelesPosada = p.hoteles;
      }
      ctx.ref = await buscarTipo({ n: 9, minRem: 2, conBooking: false });
      if (!ctx.ref) return t.bloqueado('No se encontró un hotel con al menos 2 habitaciones libres.');
      const v = ventana(8);
      const opc = (await remanentesPosada(ctx.ref.hotel.id, ctx.ref.opcion.codigo, v.checkin, v.checkout));
      const idem = uuid();
      const out = await C.crearOrdenPosada({ id: ctx.ref.hotel.id, codigo: ctx.ref.opcion.codigo, checkin: v.checkin, checkout: v.checkout, opcion: opc.opcion || ctx.ref.opcion, idem });
      t.evidencia('Cotización POST /availability', out.cot);
      t.evidencia('orders/create', out.r);
      const ref = registrarPosada(out.r, 'P01 (orden base)');
      if (!ref) return t.falla(`No se pudo reservar: ${resumen(out.r)}.`);
      ctx.base = { ref, body: out.body, idem, cot: out.cot, ventana: v, remAntes: opc.valor, hotel: ctx.ref.hotel, codigo: ctx.ref.opcion.codigo, r: out.r };
      t.dato('Orden', `${ref.orderId} · ${ref.externalOrderId} · ${ref.codigoReserva} · ${ref.estado} · $${ref.total}`);
      const malos = [];
      if (!/^ORD-HTL-[A-Z0-9]{3,20}$/.test(ref.externalOrderId || '')) malos.push(`external_order_id «${ref.externalOrderId}»`);
      if (!/^BK-HOTEL-[A-Z0-9]{3,20}$/.test(ref.codigoReserva || '')) malos.push(`codigoReserva «${ref.codigoReserva}»`);
      if (ref.estado !== 'CONFIRMED') malos.push(`estado «${ref.estado}»`);
      if (out.r.status !== 201) malos.push(`HTTP ${out.r.status} (contrato: 201)`);
      if (malos.length) return t.aviso(`Reservó, pero no cumple el contrato en: ${malos.join(', ')}.`);
      return t.pasa('Reserva confirmada con los tres identificadores del contrato.');
    },
  },
  {
    id: 'P02', grupo: 'P · Reserva normal en Posada', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Reservar descuenta el cupo en Posada',
    historia: 'Después de mi reserva, el hotel debe tener una habitación menos.',
    esperado: 'habitacionesRemanentes baja exactamente 1.',
    async run(t) {
      const { ventana: v, remAntes } = ctx.base;
      const d = await remanentesPosada(ctx.base.hotel.id, ctx.base.codigo, v.checkin, v.checkout);
      t.dato('Libres antes → después', `${remAntes} → ${d.valor}`);
      if (!Number.isFinite(remAntes) || !Number.isFinite(d.valor)) return t.bloqueado('Posada no informa habitacionesRemanentes numéricas.');
      if (d.valor === remAntes - 1) return t.pasa('Descontó 1.');
      return t.falla(`Esperado ${remAntes - 1}, Posada muestra ${d.valor}.`);
    },
  },
  {
    id: 'P03', grupo: 'P · Reserva normal en Posada', requiere: ['posada', 'escritura', 'base'],
    titulo: 'La cotización se respeta y los totales cuadran',
    historia: 'Me cotizan $X; al pagar me cobran exactamente $X y el desglose suma.',
    esperado: 'total de la orden = precioTotalCotizado y subtotal + IVA + tasa − descuento = total (tolerancia 0).',
    async run(t) {
      const { cot, ref } = ctx.base;
      const notas = [];
      if (cot.status !== 200) notas.push(`el socio no cotiza por POST /availability (${resumen(cot)})`);
      else {
        const c = cot.body?.data && !Array.isArray(cot.body.data) ? cot.body.data : cot.body;
        const cotizado = money(c.precioTotalCotizado);
        if (cotizado !== ref.total) return t.falla(`Cotizó $${cotizado} y la orden quedó en $${ref.total}.`);
      }
      const d = ref.crudo.desgloseFiscal || ref.crudo.desglosePrecio || {};
      const sub = Number(d.subtotal ?? NaN);
      const iva = Number(d.ivaValor ?? d.iva ?? d.iva15Pct ?? NaN);
      const tasa = Number(d.tasaMunicipal ?? 0);
      const desc = Number(d.descuentoCombo ?? d.descuento ?? 0);
      if (!Number.isFinite(sub) || !Number.isFinite(iva)) notas.push('la orden no trae desgloseFiscal con subtotal/ivaValor');
      else {
        const calc = (sub + iva + tasa - desc).toFixed(2);
        t.dato('Desglose', `subtotal ${sub} + IVA ${iva} + tasa ${tasa} − desc ${desc} = ${calc} (total ${ref.total})`);
        if (calc !== ref.total) return t.falla(`El desglose suma $${calc} pero el total es $${ref.total}.`);
        const noches = C.nochesEntre(ctx.base.ventana.checkin, ctx.base.ventana.checkout);
        if (tasa && Math.abs(tasa - 2 * noches) > 0.001) notas.push(`tasa municipal ${tasa} (contrato: USD 2 × ${noches} noches = ${2 * noches})`);
      }
      if (notas.length) return t.aviso(notas.join('; ') + '.');
      return t.pasa('Precio cotizado respetado y desglose exacto.');
    },
  },

  // ── B · Concurrencia e idempotencia ───────────────────────────────────────────
  {
    id: 'B01', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura'],
    titulo: 'Dos clientes compiten por la última habitación al mismo tiempo',
    historia: 'Queda 1 habitación; dos personas pulsan «Reservar» en el mismo segundo.',
    esperado: 'Exactamente una reserva 201 y la otra 409 OUT_OF_STOCK.',
    async run(t) {
      const v = await buscarTipo({ n: 6, minRem: 1, maxRem: CONFIG.maxAgotar + 1, conBooking: false, exacto: true });
      if (!v) return t.bloqueado(`No hay un tipo con ≤ ${CONFIG.maxAgotar + 1} libres.`);
      const n = v.opcion.remanentes;
      t.dato('Hotel / tipo / libres', `${v.hotel.id} · ${v.opcion.codigo} · ${n}`);
      if (n > 1) {
        const ag = await agotarEnPosada(v, n - 1, 'B01 (dejar 1 libre)', t);
        if (!ag.ok) return t.bloqueado('No se pudo dejar una sola habitación libre.');
      }
      const [r1, r2] = await Promise.all([1, 2].map((i) => C.crearOrdenPosada({ id: v.hotel.id, codigo: v.opcion.codigo, checkin: v.checkin, checkout: v.checkout, opcion: v.opcion, huesped: titular(`b01c${i}`) }).then((x) => x.r)));
      t.evidencia('Cliente 1', r1);
      t.evidencia('Cliente 2', r2);
      const ok = [r1, r2].filter((r) => registrarPosada(r, 'B01 (carrera)')).length;
      if (ok === 2) return t.falla('SOBREVENTA POR CONCURRENCIA: las dos reservas se confirmaron sobre una sola habitación.');
      if (ok === 1 && [r1, r2].some((r) => r.status === 409)) return t.pasa('Una confirmada y la otra rechazada con 409.');
      if (ok === 1) return t.aviso(`Una confirmada; la otra respondió ${resumen([r1, r2].find((r) => r.status !== 201))}.`);
      return t.falla(`Ninguna se confirmó aunque había 1 libre: ${resumen(r1)} / ${resumen(r2)}.`);
    },
  },
  {
    id: 'B02', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Doble clic: la misma petición enviada dos veces a la vez',
    historia: 'El cliente impaciente pulsa dos veces «Pagar»; el navegador manda la misma petición (misma Idempotency-Key).',
    esperado: 'Se crea UNA sola reserva; la segunda respuesta es la misma orden (Idempotent-Replayed) o 409 IDEMPOTENCY_IN_PROGRESS.',
    async run(t) {
      const v = ventana(7);
      const antes = await remanentesPosada(ctx.ref.hotel.id, ctx.ref.opcion.codigo, v.checkin, v.checkout);
      const opc = antes.opcion || ctx.ref.opcion;
      const cot = await posada.cotizar({ id: ctx.ref.hotel.id, codigo: opc.codigo, checkin: v.checkin, checkout: v.checkout });
      const c = cot.body?.data && !Array.isArray(cot.body?.data) ? cot.body.data : cot.body || {};
      const body = posada.cuerpoOrden({ id: ctx.ref.hotel.id, codigo: opc.codigo, checkin: v.checkin, checkout: v.checkout, total: money(c.precioTotalCotizado) || opc.precioTotal, cotizacionId: c.cotizacionId });
      const idem = uuid();
      const [r1, r2] = await Promise.all([posada.crearOrden(body, { idem }), posada.crearOrden(body, { idem })]);
      t.evidencia('Clic 1', r1);
      t.evidencia('Clic 2', r2);
      const ids = new Set([r1, r2].map((r) => registrarPosada(r, 'B02 (doble clic)')?.orderId).filter(Boolean));
      const despues = await remanentesPosada(ctx.ref.hotel.id, opc.codigo, v.checkin, v.checkout);
      t.dato('Libres antes → después', `${antes.valor} → ${despues.valor}`);
      if (ids.size > 1 || (Number.isFinite(antes.valor) && despues.valor < antes.valor - 1)) return t.falla(`Se crearon ${ids.size} reservas / se descontaron ${antes.valor - despues.valor} habitaciones por un doble clic.`);
      if (ids.size === 1) return t.pasa('Una sola reserva; la otra petición fue repetición o quedó en espera.');
      return t.aviso(`No se creó ninguna: ${resumen(r1)} / ${resumen(r2)}.`);
    },
  },
  {
    id: 'B03', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Reintento tras un corte de red (misma clave, mismo cuerpo)',
    historia: 'Se cae el wifi justo al pagar; la app reintenta la misma petición.',
    esperado: 'Devuelve la MISMA orden (mismo orderId), no descuenta otra habitación, con cabecera Idempotent-Replayed: true.',
    async run(t) {
      const r = await posada.crearOrden(ctx.base.body, { idem: ctx.base.idem });
      t.evidencia('Reintento', r);
      const ref = C.refDeOrden(r);
      if (r.status >= 200 && r.status < 300 && ref?.orderId && ref.orderId !== ctx.base.ref.orderId) {
        registrarPosada(r, 'B03 (duplicada)');
        return t.falla(`Creó una reserva NUEVA (${ref.orderId}) en vez de devolver la original (${ctx.base.ref.orderId}): doble cobro.`);
      }
      if (!(r.status >= 200 && r.status < 300)) return t.falla(`El reintento legítimo fue rechazado: ${resumen(r)} (el ESB creería que falló y compensaría).`);
      const replay = String(r.headers['idempotent-replayed'] || '').toLowerCase() === 'true';
      if (!replay) return t.aviso('Devuelve la misma orden, pero sin la cabecera Idempotent-Replayed: true.');
      return t.pasa('Misma orden y cabecera Idempotent-Replayed: true.');
    },
  },
  {
    id: 'B04', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Misma clave de idempotencia con otro contenido',
    historia: 'Un error del cliente reutiliza la clave de una compra anterior para una compra distinta.',
    esperado: '422 IDEMPOTENCY_KEY_REUSED.',
    async run(t) {
      const otro = { ...ctx.base.body, huespedTitular: titular('b04') };
      const r = await posada.crearOrden(otro, { idem: ctx.base.idem });
      const ref = C.refDeOrden(r);
      if (r.status >= 200 && r.status < 300 && ref?.orderId === ctx.base.ref.orderId) {
        t.evidencia('Respuesta', r);
        return t.aviso('Devolvió la orden original ignorando que el cuerpo cambió (debía ser 422 IDEMPOTENCY_KEY_REUSED).');
      }
      return veredictoRechazo(t, r, { estados: [422], codigos: ['IDEMPOTENCY_KEY_REUSED'] });
    },
  },
  {
    id: 'B05', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reserva sin Idempotency-Key o con una clave inválida',
    historia: 'Un integrador mal configurado no envía la cabecera.',
    esperado: '400 en ambos casos (la cabecera es obligatoria y debe ser UUID).',
    async run(t) {
      const sin = await C.http('POST', posada.url('/alojamientos/orders/create'), { headers: posada.h(), body: cuerpoRef() });
      const mala = await posada.crearOrden(cuerpoRef(), { idem: 'no-soy-un-uuid' });
      const a = veredictoRechazo({ ...t, pasa: (m) => ({ r: 'PASA', m }), falla: (m) => ({ r: 'FALLA', m }), aviso: (m) => ({ r: 'AVISO', m }) }, sin, { estados: [400], etiqueta: 'Sin cabecera' });
      const b = veredictoRechazo({ ...t, pasa: (m) => ({ r: 'PASA', m }), falla: (m) => ({ r: 'FALLA', m }), aviso: (m) => ({ r: 'AVISO', m }) }, mala, { estados: [400], etiqueta: 'Clave no UUID' });
      const peor = [a, b].find((x) => x.r === 'FALLA') || [a, b].find((x) => x.r === 'AVISO');
      const msg = `Sin cabecera: ${a.m} · Clave no UUID: ${b.m}`;
      if (!peor) return t.pasa(msg);
      return peor.r === 'FALLA' ? t.falla(msg) : t.aviso(msg);
    },
  },
  {
    id: 'B06', grupo: 'B · Concurrencia e idempotencia', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Recuperar una reserva tras un timeout (consulta por idempotency_key)',
    historia: 'Booking no recibió respuesta; antes de cobrar o compensar pregunta al hotel si la reserva existe.',
    esperado: 'GET /alojamientos/orders?idempotency_key=… devuelve la orden.',
    async run(t) {
      const r = await posada.listarOrdenes(`idempotency_key=${ctx.base.idem}`);
      t.evidencia('Consulta', r);
      if (r.status !== 200) return t.falla(`No se puede consultar: ${resumen(r)}. Tras un timeout Booking no sabría si la reserva existe.`);
      const lista = r.body?.data || r.body?.items || r.body?.ordenes || (Array.isArray(r.body) ? r.body : []);
      if (lista.some((o) => (o.orderId || o.id) === ctx.base.ref.orderId)) return t.pasa('Encuentra la orden por su clave de idempotencia.');
      return t.falla(`Responde 200 pero no incluye la orden ${ctx.base.ref.orderId} (${lista.length} resultados).`);
    },
  },

  // ── C · Fechas ────────────────────────────────────────────────────────────────
  ...[
    ['C01', 'Reservar con fechas en el pasado', 'Un usuario deja el calendario en una fecha que ya pasó.', () => ({ fechaInicio: C.sumarDias(C.hoyGuayaquil(), -10), fechaFin: C.sumarDias(C.hoyGuayaquil(), -8) }), [422], ['VALIDATION_FAILED']],
    ['C02', 'Salida el mismo día que la llegada (0 noches)', 'Elige la misma fecha de entrada y salida.', () => { const d = C.sumarDias(C.hoyGuayaquil(), 240); return { fechaInicio: d, fechaFin: d }; }, [422, 400], []],
    ['C03', 'Salida antes de la llegada', 'Invierte las fechas por error.', () => ({ fechaInicio: C.sumarDias(C.hoyGuayaquil(), 252), fechaFin: C.sumarDias(C.hoyGuayaquil(), 250) }), [422, 400], []],
    ['C04', 'Estancia de 31 noches (máximo 30)', 'Reserva un mes entero y un día.', () => ({ fechaInicio: C.sumarDias(C.hoyGuayaquil(), 200), fechaFin: C.sumarDias(C.hoyGuayaquil(), 231) }), [422], []],
    ['C05', 'Fecha con formato incorrecto (dd/mm/aaaa)', 'Un cliente envía la fecha en formato local.', () => ({ fechaInicio: '20/12/2026', fechaFin: '22/12/2026' }), [400], ['VALIDATION_FAILED']],
    ['C06', 'Fecha que no existe (30 de febrero)', 'Un formulario sin validación permite 2027-02-30.', () => ({ fechaInicio: '2027-02-30', fechaFin: '2027-03-02' }) /* fuera de las ventanas 1-12 */, [400, 422], []],
  ].map(([id, titulo, historia, fechas, estados, codigos]) => ({
    id, grupo: 'C · Fechas', requiere: ['posada', 'escritura', 'ref'], titulo, historia,
    esperado: `${estados.join('/')}${codigos.length ? ` ${codigos.join('/')}` : ''} — nunca 201.`,
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef(fechas())), { estados, codigos }); },
  })),

  // ── D · Ocupación y cupo ──────────────────────────────────────────────────────
  ...[
    ['D01', 'Más personas de las que caben (20 adultos en 1 habitación)', 'Un grupo intenta meterse en una sola habitación.', { ocupantes: { adultos: 20, ninos: 0 } }, [422], ['CAPACITY_EXCEEDED']],
    ['D02', 'Reserva con 0 adultos', 'Un menor intenta reservar solo / formulario vacío.', { ocupantes: { adultos: 0, ninos: 1 } }, [400, 422], []],
    ['D03', 'Número de niños negativo', 'Petición manipulada.', { ocupantes: { adultos: 2, ninos: -1 } }, [400], []],
    ['D04', '0 habitaciones', 'Petición manipulada.', { cantidadHabitaciones: 0 }, [400], []],
  ].map(([id, titulo, historia, cambios, estados, codigos]) => ({
    id, grupo: 'D · Ocupación y cupo', requiere: ['posada', 'escritura', 'ref'], titulo, historia,
    esperado: `${estados.join('/')}${codigos.length ? ` ${codigos.join('/')}` : ''} — nunca 201.`,
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef(cambios)), { estados, codigos }); },
  })),
  {
    id: 'D05', grupo: 'D · Ocupación y cupo', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Pedir más habitaciones de las que quedan',
    historia: 'Quedan 3 habitaciones y una empresa pide 4.',
    esperado: '409 OUT_OF_STOCK (no se reserva parcialmente).',
    async run(t) {
      const v = ventana(9);
      const d = await remanentesPosada(ctx.ref.hotel.id, ctx.ref.opcion.codigo, v.checkin, v.checkout);
      if (!Number.isFinite(d.valor)) return t.bloqueado('Posada no informa habitacionesRemanentes.');
      const n = d.valor + 1;
      t.dato('Libres / pedidas', `${d.valor} / ${n}`);
      const precio = d.opcion?.precioTotal ? money(Number(d.opcion.precioTotal) * n) : '100.00';
      return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ cantidadHabitaciones: n, ocupantes: { adultos: n, ninos: 0 }, totalPagar: precio })), { estados: [409], codigos: ['OUT_OF_STOCK'] });
    },
  },

  // ── E · Datos del huésped ─────────────────────────────────────────────────────
  {
    id: 'E01', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Cédula con dígito verificador incorrecto',
    historia: 'El usuario se equivoca en un número de su cédula.',
    esperado: '422 INVALID_DOCUMENT (módulo 10).',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ huespedTitular: { ...titular('e01'), identificacion: C.cedulaInvalida() } })), { estados: [422], codigos: ['INVALID_DOCUMENT'] }); },
  },
  {
    id: 'E02', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Cédula de 9 dígitos',
    historia: 'Falta un dígito.',
    esperado: '400/422 — nunca 201.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ huespedTitular: { ...titular('e02'), identificacion: '171003406' } })), { estados: [400, 422] }); },
  },
  {
    id: 'E03', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Turista extranjero con pasaporte',
    historia: 'Un turista sin cédula reserva con su pasaporte.',
    esperado: '201 (PASAPORTE de 6–12 alfanuméricos es válido).',
    async run(t) {
      const v = ventana(10);
      const d = await remanentesPosada(ctx.ref.hotel.id, ctx.ref.opcion.codigo, v.checkin, v.checkout);
      const out = await C.crearOrdenPosada({ id: ctx.ref.hotel.id, codigo: ctx.ref.opcion.codigo, checkin: v.checkin, checkout: v.checkout, opcion: d.opcion || ctx.ref.opcion, huesped: { ...titular('e03'), tipoDocumento: 'PASAPORTE', identificacion: 'XK7741203', nacionalidad: 'Colombiana' } });
      t.evidencia('orders/create', out.r);
      const ref = registrarPosada(out.r, 'E03 (pasaporte)');
      if (ref) { ctx.ordenPasaporte = ref; return t.pasa(`Aceptada (${ref.codigoReserva}).`); }
      return t.falla(`Un turista con pasaporte válido no puede reservar: ${resumen(out.r)}.`);
    },
  },
  {
    id: 'E04', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Correo electrónico inválido',
    historia: 'El usuario escribe «juan@» y la confirmación nunca le llegaría.',
    esperado: '400 VALIDATION_FAILED.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ huespedTitular: { ...titular('e04'), email: 'juan@' } })), { estados: [400, 422], codigos: ['VALIDATION_FAILED'] }); },
  },
  {
    id: 'E05', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reserva sin datos del huésped',
    historia: 'Llega una reserva «anónima»: el hotel no sabe a quién esperar.',
    esperado: 'Rechazo 400/422. (El contrato no marca huespedTitular como obligatorio: si se acepta se reporta como AVISO.)',
    async run(t) {
      const b = cuerpoRef();
      delete b.huespedTitular;
      const r = await posada.crearOrden(b);
      if (r.status >= 200 && r.status < 300) {
        t.evidencia('Respuesta', r);
        const ref = registrarPosada(r, 'E05 (sin huésped)');
        if (ref && (await posada.cancelar(idOrden(ref))).status === 200) marcarCancelada(ref);
        return t.aviso('Aceptó una reserva sin titular. Conviene exigir huespedTitular o customer_contact en el contrato.');
      }
      return veredictoRechazo(t, r, { estados: [400, 422] });
    },
  },
  {
    id: 'E06', grupo: 'E · Datos del huésped', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Nombre con HTML / script (inyección)',
    historia: 'Un atacante pone <script> en su nombre esperando que se ejecute en el panel del hotel.',
    esperado: 'No debe dar 500. Se acepta 201 (texto plano) o 400.',
    async run(t) {
      const r = await posada.crearOrden(cuerpoRef({ huespedTitular: { ...titular('e06'), nombreCompleto: '<script>alert(1)</script> O\'Brien; DROP TABLE reservas;--' } }, 11));
      t.evidencia('Respuesta', r);
      const ref = registrarPosada(r, 'E06 (inyección)');
      if (ref && (await posada.cancelar(idOrden(ref))).status === 200) marcarCancelada(ref);
      if (r.status === 0 || r.status >= 500) return t.falla(`Error del servidor ante caracteres especiales: ${resumen(r)}.`);
      return t.pasa(`Controlado: HTTP ${r.status}.`);
    },
  },

  // ── F · Precio, moneda y contrato ─────────────────────────────────────────────
  {
    id: 'F01', grupo: 'F · Precio, moneda y contrato', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Precio manipulado: pagar $1.00 por la estancia',
    historia: 'Un usuario edita la petición desde las herramientas del navegador y cambia el total.',
    esperado: '409 PRICE_MISMATCH. Si se acepta, es un fallo crítico.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ totalPagar: '1.00' })), { estados: [409], codigos: ['PRICE_MISMATCH'] }); },
  },
  {
    id: 'F02', grupo: 'F · Precio, moneda y contrato', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Total enviado como número en vez de texto Money',
    historia: 'Un integrador envía 153.5 en lugar de "153.50".',
    esperado: '400 (el contrato v2.2.0 exige Money como string).',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ totalPagar: Number(ctx.ref.opcion.precioTotal || 100) })), { estados: [400] }); },
  },
  {
    id: 'F03', grupo: 'F · Precio, moneda y contrato', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Pagar en euros',
    historia: 'Un turista europeo intenta pagar en EUR.',
    esperado: '422 UNSUPPORTED_CURRENCY.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ currency: 'EUR' })), { estados: [422], codigos: ['UNSUPPORTED_CURRENCY'] }); },
  },
  {
    id: 'F04', grupo: 'F · Precio, moneda y contrato', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Cotización inexistente o vencida',
    historia: 'El usuario deja la pestaña abierta una hora y paga con una cotización vieja.',
    esperado: '409 QUOTE_EXPIRED (o 404).',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ cotizacionId: uuid() })), { estados: [409, 404], codigos: ['QUOTE_EXPIRED', 'NOT_FOUND'] }); },
  },
  {
    id: 'F05', grupo: 'F · Precio, moneda y contrato', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Campo desconocido en el cuerpo',
    historia: 'Un cliente envía "descuentoVIP": 100 esperando que se aplique.',
    esperado: '400 (el contrato obliga a rechazar campos desconocidos).',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ descuentoVIP: 100 })), { estados: [400], codigos: ['VALIDATION_FAILED'] }); },
  },

  // ── G · Recursos inexistentes ─────────────────────────────────────────────────
  {
    id: 'G01', grupo: 'G · Recursos inexistentes', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reservar un hotel que no existe',
    historia: 'Un enlace viejo apunta a un hotel eliminado.',
    esperado: '404 HOTEL_NOT_FOUND / NOT_FOUND.',
    async run(t) { const r = await posada.crearOrden(cuerpoRef({ alojamientoId: 'HTL-NO-EXISTE-999' })); ctx.error404 = r; return veredictoRechazo(t, r, { estados: [404], codigos: ['HOTEL_NOT_FOUND', 'NOT_FOUND'] }); },
  },
  {
    id: 'G02', grupo: 'G · Recursos inexistentes', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reservar un tipo de habitación que el hotel no tiene',
    historia: 'Booking tiene un tipo que el hotel ya eliminó.',
    esperado: '404/422/409 — nunca 201.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef({ tipoHabitacionCodigo: 'TIPO_INEXISTENTE_QA' })), { estados: [404, 422, 409, 400] }); },
  },
  {
    id: 'G03', grupo: 'G · Recursos inexistentes', requiere: ['posada'],
    titulo: 'Consultar y cancelar una reserva que no existe',
    historia: 'El usuario escribe mal su código de reserva.',
    esperado: '404 en GET y en cancel.',
    async run(t) {
      const id = uuid();
      const g = await posada.obtenerOrden(id);
      const c = SOLO_LECTURA ? null : await posada.cancelar(id);
      t.evidencia('GET', g);
      if (c) t.evidencia('cancel', c);
      const malos = [g, c].filter(Boolean).filter((r) => r.status !== 404);
      if (malos.some((r) => r.status === 0 || r.status >= 500 || (r.status >= 200 && r.status < 300))) return t.falla(`Respuesta incorrecta: ${malos.map(resumen).join(' / ')}.`);
      if (malos.length) return t.aviso(`Rechaza, pero no con 404: ${malos.map(resumen).join(' / ')}.`);
      return t.pasa('404 en ambos.');
    },
  },

  // ── H · Ciclo de vida de la reserva ───────────────────────────────────────────
  {
    id: 'H01', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Buscar la reserva por cualquiera de sus tres identificadores',
    historia: 'El huésped da su código BK-HOTEL-…; Booking usa ORD-HTL-…; el sistema usa el UUID.',
    esperado: 'GET /orders/{x} → 200 con orderId, external_order_id y codigoReserva.',
    async run(t) {
      const { orderId, externalOrderId, codigoReserva } = ctx.base.ref;
      const res = [];
      for (const [n, v] of [['orderId', orderId], ['external_order_id', externalOrderId], ['codigoReserva', codigoReserva]]) {
        if (!v) { res.push(`${n}: no viene en la orden`); continue; }
        const r = await posada.obtenerOrden(v);
        t.evidencia(`GET por ${n}`, r);
        if (r.status !== 200 || C.refDeOrden(r)?.orderId !== orderId) res.push(`${n}: ${resumen(r)}`);
      }
      if (res.length) return t.falla(`No resuelve: ${res.join('; ')}.`);
      return t.pasa('Los tres identificadores devuelven la misma reserva.');
    },
  },
  {
    id: 'H02', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Check-in antes de la hora permitida',
    historia: 'El huésped intenta hacer check-in digital semanas antes de su llegada.',
    esperado: '422 CHECKIN_TIME_NOT_REACHED (si exige token de usuario, 401/403 se reporta como no evaluable).',
    async run(t) {
      const r = await posada.checkin(idOrden(ctx.base.ref), { titularIdentificacion: ctx.base.body.huespedTitular.identificacion });
      if (r.status === 401 || r.status === 403) { t.evidencia('Respuesta', r); return t.bloqueado('El check-in exige token de usuario (BearerAuth); con la X-API-Key de Booking no se puede evaluar.'); }
      return veredictoRechazo(t, r, { estados: [422], codigos: ['CHECKIN_TIME_NOT_REACHED'] });
    },
  },
  {
    id: 'H03', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Cancelar la reserva devuelve el cupo',
    historia: 'El cliente cancela y la habitación vuelve a estar a la venta.',
    esperado: '200, estado CANCELLED, codigoReembolso REF-HTL-…, cuposRestaurados true y habitacionesRemanentes vuelve al valor inicial.',
    async run(t) {
      const idem = uuid();
      const r = await posada.cancelar(idOrden(ctx.base.ref), { idem });
      t.evidencia('cancel', r);
      if (r.status !== 200) return t.falla(`No se pudo cancelar: ${resumen(r)}.`);
      marcarCancelada(ctx.base.ref);
      ctx.base.cancel = { r, idem };
      const b = r.body?.data && !Array.isArray(r.body.data) ? r.body.data : r.body;
      const { ventana: v, remAntes } = ctx.base;
      const d = await remanentesPosada(ctx.base.hotel.id, ctx.base.codigo, v.checkin, v.checkout);
      t.dato('Respuesta', `estado ${b.estado} · ${b.codigoReembolso} · ${b.porcentajeReembolso}% · $${b.montoReembolsado} · cuposRestaurados ${b.cuposRestaurados}`);
      t.dato('Libres inicial → tras cancelar', `${remAntes} → ${d.valor}`);
      const malos = [];
      if (b.estado !== 'CANCELLED') malos.push(`estado ${b.estado}`);
      if (!/^REF-HTL-[0-9]{5,10}$/.test(b.codigoReembolso || '')) malos.push(`codigoReembolso «${b.codigoReembolso}»`);
      if (Number.isFinite(remAntes) && d.valor !== remAntes) return t.falla(`El cupo no volvió: ${remAntes} → ${d.valor}.`);
      if (malos.length) return t.aviso(`Cancela y libera, pero: ${malos.join(', ')}.`);
      return t.pasa('Cancelada y cupo restaurado.');
    },
  },
  {
    id: 'H04', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Cancelar dos veces (el usuario pulsa «Cancelar» otra vez)',
    historia: 'La primera cancelación tardó y el usuario vuelve a pulsar (con otra clave).',
    esperado: '200 con yaCancelada: true y el MISMO codigoReembolso (sin reembolsar dos veces).',
    async run(t) {
      if (!ctx.base.cancel) return t.bloqueado('Depende de H03.');
      const r = await posada.cancelar(idOrden(ctx.base.ref));
      t.evidencia('Segunda cancelación', r);
      const b = r.body?.data && !Array.isArray(r.body?.data) ? r.body.data : r.body || {};
      const primero = (ctx.base.cancel.r.body?.data || ctx.base.cancel.r.body || {}).codigoReembolso;
      if (r.status === 0 || r.status >= 500) return t.falla(resumen(r));
      if (r.status !== 200) return t.aviso(`Responde ${resumen(r)} (contrato: 200 idempotente con yaCancelada: true).`);
      if (b.codigoReembolso && primero && b.codigoReembolso !== primero) return t.falla(`Generó otro reembolso (${b.codigoReembolso} ≠ ${primero}): se devolvería el dinero dos veces.`);
      if (b.yaCancelada !== true) return t.aviso('200 con el mismo reembolso, pero sin yaCancelada: true.');
      return t.pasa('Idempotente: yaCancelada true y mismo codigoReembolso.');
    },
  },
  {
    id: 'H05', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura', 'base'],
    titulo: 'Check-in de una reserva cancelada',
    historia: 'Alguien intenta usar una reserva que ya canceló.',
    esperado: '409 INVALID_STATE_TRANSITION (o 422).',
    async run(t) {
      if (!ctx.base.cancel) return t.bloqueado('Depende de H03.');
      const r = await posada.checkin(idOrden(ctx.base.ref), { titularIdentificacion: ctx.base.body.huespedTitular.identificacion });
      if (r.status === 401 || r.status === 403) { t.evidencia('Respuesta', r); return t.bloqueado('El check-in exige token de usuario; no evaluable con la API key.'); }
      return veredictoRechazo(t, r, { estados: [409, 422], codigos: ['INVALID_STATE_TRANSITION', 'CHECKIN_TIME_NOT_REACHED'] });
    },
  },
  {
    id: 'H06', grupo: 'H · Ciclo de vida', requiere: ['posada', 'escritura'],
    titulo: 'Compensación de Saga: reembolso del 100 %',
    historia: 'El pago de un paquete falla en otro proveedor y Booking deshace la reserva del hotel.',
    esperado: 'cancel con solicitadoPor = SAGA_ORCHESTRATOR → 200, porcentajeReembolso 100.',
    async run(t) {
      if (!ctx.ordenPasaporte) return t.bloqueado('Depende de E03.');
      const r = await posada.cancelar(idOrden(ctx.ordenPasaporte), { body: { motivo: 'Compensación Saga (prueba QA)', solicitadoPor: 'SAGA_ORCHESTRATOR' } });
      t.evidencia('cancel SAGA', r);
      if (r.status === 200) marcarCancelada(ctx.ordenPasaporte);
      if (r.status !== 200) return t.falla(`La compensación no funcionó: ${resumen(r)}.`);
      const b = r.body?.data && !Array.isArray(r.body.data) ? r.body.data : r.body;
      if (Number(b.porcentajeReembolso) !== 100) return t.falla(`Reembolsó ${b.porcentajeReembolso}% (debe ser 100%).`);
      return t.pasa(`Reembolso 100% (${b.codigoReembolso}, $${b.montoReembolsado}).`);
    },
  },

  // ── I · Seguridad ─────────────────────────────────────────────────────────────
  {
    id: 'I01', grupo: 'I · Seguridad', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reservar sin credenciales',
    historia: 'Un bot anónimo intenta crear reservas falsas para bloquear el hotel.',
    esperado: '401 (no hay mutaciones anónimas).',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef(), { conClave: false }), { estados: [401], codigos: ['UNAUTHORIZED'] }); },
  },
  {
    id: 'I02', grupo: 'I · Seguridad', requiere: ['posada', 'escritura', 'ref'],
    titulo: 'Reservar con una API key falsa',
    historia: 'Alguien prueba claves al azar.',
    esperado: '401.',
    async run(t) { return veredictoRechazo(t, await posada.crearOrden(cuerpoRef(), { conClave: false, headers: { 'X-API-Key': 'clave-falsa-' + uuid() } }), { estados: [401], codigos: ['UNAUTHORIZED'] }); },
  },
  {
    id: 'I03', grupo: 'I · Seguridad', requiere: ['posada'],
    titulo: 'Ver reservas ajenas sin credenciales (datos personales)',
    historia: 'Un curioso intenta listar reservas para obtener nombres, cédulas y teléfonos.',
    esperado: 'GET /orders y GET /orders/{id} sin clave → 401.',
    async run(t) {
      const l = await posada.listarOrdenes('page=1&limit=5', { conClave: false });
      t.evidencia('GET /orders sin clave', l);
      let g = null;
      if (ctx.base?.ref) { g = await posada.obtenerOrden(idOrden(ctx.base.ref), { conClave: false }); t.evidencia('GET /orders/{id} sin clave', g); }
      const expuestos = [l, g].filter(Boolean).filter((r) => r.status === 200);
      if (expuestos.length) {
        const texto = JSON.stringify(expuestos.map((r) => r.body));
        const pii = /identificacion|cedula|telefono|email/i.test(texto);
        return t.falla(`Sin credenciales se obtienen reservas (HTTP 200)${pii ? ' CON datos personales (LOPDP)' : ''}.`);
      }
      if ([l, g].filter(Boolean).every((r) => r.status === 401)) return t.pasa('401 sin credenciales.');
      return t.aviso(`No expone datos, pero responde ${[l, g].filter(Boolean).map(resumen).join(' / ')}.`);
    },
  },
  {
    id: 'I04', grupo: 'I · Seguridad', requiere: ['posada'],
    titulo: 'El health no filtra secretos',
    historia: 'El endpoint público de salud expone cadenas de conexión o claves.',
    esperado: 'Sin contraseñas, cadenas de conexión, claves ni nombre de esquema.',
    async run(t) {
      const r = await C.http('GET', posada.url('/alojamientos/health'));
      t.evidencia('health sin clave', r);
      const texto = JSON.stringify(r.body || '');
      const hall = [/password|passwd|pwd/i, /postgres(ql)?:\/\//i, /connection.?string/i, /api[_-]?key/i, /secret/i, /"schema"/i].filter((re) => re.test(texto)).map(String);
      if (hall.length) return t.falla(`El health contiene: ${hall.join(', ')}.`);
      return t.pasa('No se encontraron secretos.');
    },
  },
  {
    id: 'I05', grupo: 'I · Seguridad', requiere: ['posada'],
    titulo: 'Los errores siguen RFC 7807 con un code del contrato',
    historia: 'Booking decide si compensa o reintenta leyendo el code; si no viene, no sabe qué hacer.',
    esperado: 'Content-Type application/problem+json y code dentro del enum ErrorCode.',
    async run(t) {
      const r = ctx.error404 || (await posada.obtenerOrden(uuid()));
      t.evidencia('Error de muestra', r);
      const ENUM = ['VALIDATION_FAILED', 'INVALID_DOCUMENT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'HOTEL_NOT_FOUND', 'CONFLICT', 'OUT_OF_STOCK', 'ROOM_NO_LONGER_AVAILABLE', 'QUOTE_EXPIRED', 'PRICE_MISMATCH', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'INVALID_STATE_TRANSITION', 'CHECKIN_TIME_NOT_REACHED', 'CAPACITY_EXCEEDED', 'DISCOUNT_EXCEEDS_CONTRACT', 'PROMOTIONS_NOT_ALLOWED', 'RATE_LIMITED', 'PROVIDER_DISABLED', 'GATEWAY_TIMEOUT', 'INTERNAL_ERROR', 'RESTRICTION_VIOLATED', 'UNSUPPORTED_CURRENCY', 'INSUFFICIENT_SCOPE'];
      const ct = r.headers['content-type'] || '';
      const c = codigo(r);
      const notas = [];
      if (!ct.includes('problem+json')) notas.push(`Content-Type «${ct}»`);
      if (!ENUM.includes(c)) notas.push(`code «${c ?? 'ninguno'}»`);
      if (notas.length) return t.aviso(`No sigue el formato del contrato: ${notas.join(', ')}.`);
      return t.pasa(`problem+json con code ${c}.`);
    },
  },

  // ── J · Rendimiento ───────────────────────────────────────────────────────────
  {
    id: 'J01', grupo: 'J · Rendimiento', requiere: ['posada'],
    titulo: 'Varias búsquedas de disponibilidad a la vez',
    historia: 'Hora pico: 10 viajeros consultan el mismo hotel al mismo tiempo.',
    esperado: 'Ninguna respuesta 5xx ni timeout (429 con Retry-After es aceptable).',
    async run(t) {
      const h = ctx.ref?.hotel || ctx.hotelesPosada[0];
      if (!h) return t.bloqueado('Sin hotel de referencia.');
      const v = ventana(12);
      const rs = await Promise.all(Array.from({ length: 10 }, () => posada.disponibilidad(h.id, v.checkin, v.checkout).then((x) => x.r)));
      const cuenta = rs.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
      const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
      t.dato('Estados', JSON.stringify(cuenta));
      t.dato('Latencia p50 / máx', `${ms[4]} ms / ${ms[9]} ms`);
      if (rs.some((r) => r.status === 0 || r.status >= 500)) return t.falla('Hubo errores 5xx o timeouts con solo 10 consultas simultáneas.');
      return t.pasa('Sin errores.');
    },
  },
  {
    id: 'J02', grupo: 'J · Rendimiento', requiere: ['posada', 'escritura'],
    titulo: 'Crear una reserva tarda ≤ 3000 ms',
    historia: 'Si el hotel tarda más de 3 s, Booking da la compra por fallida y compensa… pero el hotel sí guardó la reserva.',
    esperado: 'Todas las orders/create exitosas de esta corrida ≤ 3000 ms.',
    async run(t) {
      const ms = C.bitacora.filter((b) => b.url.endsWith('/orders/create') && b.status === 201).map((b) => b.ms).sort((a, b) => a - b);
      if (!ms.length) return t.bloqueado('No hubo reservas exitosas en esta corrida.');
      const lentas = ms.filter((x) => x > 3000);
      t.dato('Reservas medidas', ms.length);
      t.dato('p50 / máx', `${ms[Math.floor(ms.length / 2)]} ms / ${ms[ms.length - 1]} ms`);
      if (lentas.length) return t.falla(`${lentas.length} reserva(s) tardaron más de 3000 ms (máx ${ms[ms.length - 1]} ms).`);
      return t.pasa('Todas dentro del SLA.');
    },
  },
];

// ─── Ejecución ───────────────────────────────────────────────────────────────────
function crearT(e) {
  const res = { id: e.id, grupo: e.grupo, titulo: e.titulo, historia: e.historia, esperado: e.esperado, resultado: null, detalle: '', datos: [], evidencias: [], ms: 0 };
  const fin = (r) => (m) => { res.resultado = r; res.detalle = m; return res; };
  return {
    id: e.id,
    res,
    pasa: fin('PASA'), falla: fin('FALLA'), aviso: fin('AVISO'), bloqueado: fin('BLOQUEADO'), omitido: fin('OMITIDO'),
    dato: (k, v) => res.datos.push([k, v]),
    evidencia: (k, r) => r && res.evidencias.push(`${k}: ${r.status === 0 ? 'sin respuesta' : `HTTP ${r.status}`} ${codigo(r) || ''} (${r.ms} ms) — ${resumen(r).replace(/^HTTP \d+ ?\S* ?— ?/, '').slice(0, 220)}`),
  };
}

function cumpleRequisitos(e) {
  for (const q of e.requiere) {
    if (q === 'escritura' && SOLO_LECTURA) return 'OMITIDO:Modo --solo-lectura (esta prueba crea reservas).';
    if (q === 'posada' && !ctx.posadaOk) return 'BLOQUEADO:Posada no respondió en S01.';
    if (q === 'booking' && !ctx.bookingOk) return 'BLOQUEADO:Booking no respondió en S02.';
    if (q === 'base' && !ctx.base) return 'BLOQUEADO:Depende de la orden base de P01.';
    if (q === 'ref' && !ctx.ref) return 'BLOQUEADO:Depende del hotel de referencia de P01.';
  }
  return null;
}

async function limpiar() {
  const out = [];
  for (const o of ctx.creadasPosada.filter((x) => !x.cancelada)) {
    const r = await posada.cancelar(idOrden(o.ref));
    o.cancelada = r.status === 200;
    out.push(`Posada ${idOrden(o.ref)} (${o.etiqueta}): ${resumen(r)}`);
  }
  for (const o of ctx.creadasBooking.filter((x) => !x.cancelada)) {
    const r = await booking.cancelar(o.id);
    o.cancelada = r.status === 200;
    out.push(`Booking ${o.codigo || o.id} (${o.etiqueta}): ${resumen(r)}`);
  }
  return out;
}

const ICONO = { PASA: '✅', FALLA: '❌', AVISO: '⚠️', BLOQUEADO: '⛔', OMITIDO: '⏭️' };

function reporteMd(resultados, limpieza, inicio, fin) {
  const cuenta = resultados.reduce((m, r) => ((m[r.resultado] = (m[r.resultado] || 0) + 1), m), {});
  const L = [];
  L.push(`# Resultados — pruebas reales Posada EC ⇄ Booking`);
  L.push('');
  L.push(`- Inicio: ${inicio} · Fin: ${fin}`);
  L.push(`- Posada: \`${CONFIG.posadaBase}\``);
  L.push(`- Booking: \`${CONFIG.bookingBase}\``);
  L.push(`- Modo: ${SOLO_LECTURA ? 'solo lectura' : 'completo (crea y cancela reservas)'}${SOLO.length ? ` · solo ${SOLO.join(',')}` : ''}`);
  L.push(`- Totales: ${Object.entries(cuenta).map(([k, v]) => `${ICONO[k]} ${k} ${v}`).join(' · ')}`);
  L.push('');
  L.push('| ID | Prueba | Resultado | Detalle |');
  L.push('|---|---|---|---|');
  for (const r of resultados) L.push(`| ${r.id} | ${r.titulo} | ${ICONO[r.resultado]} ${r.resultado} | ${String(r.detalle).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  L.push('');
  let grupo = '';
  for (const r of resultados) {
    if (r.grupo !== grupo) { grupo = r.grupo; L.push(`## ${grupo}`, ''); }
    L.push(`### ${r.id} · ${r.titulo} — ${ICONO[r.resultado]} ${r.resultado}`, '');
    L.push(`- **Situación real:** ${r.historia}`);
    L.push(`- **Esperado:** ${r.esperado}`);
    L.push(`- **Observado:** ${r.detalle}`);
    for (const [k, v] of r.datos) L.push(`- ${k}: ${v}`);
    if (r.evidencias.length) { L.push('- Evidencias:'); for (const e of r.evidencias) L.push(`  - ${e.replace(/\n/g, ' ')}`); }
    L.push(`- Duración: ${r.ms} ms`, '');
  }
  L.push('## Limpieza (reservas de prueba canceladas al final)', '');
  if (!limpieza.length) L.push('- No quedaban reservas abiertas.');
  for (const l of limpieza) L.push(`- ${l}`);
  const abiertas = [...ctx.creadasPosada, ...ctx.creadasBooking].filter((x) => !x.cancelada);
  if (abiertas.length) L.push('', `> ⚠️ ${abiertas.length} reserva(s) de prueba NO se pudieron cancelar; revisar a mano.`);
  return L.join('\n') + '\n';
}

async function main() {
  if (!CONFIG.posadaKey) {
    console.error('Falta POSADA_API_KEY (X-API-Key que Posada EC entregó al Booking). Ver docs/PRUEBAS_REALES_POSADA_EC.md');
    process.exit(2);
  }
  const inicio = new Date().toISOString();
  console.log(`Posada: ${CONFIG.posadaBase}\nBooking: ${CONFIG.bookingBase}\nModo: ${SOLO_LECTURA ? 'solo lectura' : 'completo'}\n`);
  const resultados = [];
  const imprescindibles = new Set(['S01', 'S02', 'S03', 'P01']);
  for (const e of ESCENARIOS) {
    if (SOLO.length && !SOLO.includes(e.id) && !imprescindibles.has(e.id)) continue;
    const t = crearT(e);
    const t0 = Date.now();
    const motivo = cumpleRequisitos(e);
    if (motivo) {
      const [r, m] = motivo.split(/:(.*)/s);
      t[r === 'OMITIDO' ? 'omitido' : 'bloqueado'](m);
    } else {
      try {
        await e.run(t);
        if (!t.res.resultado) t.aviso('La prueba terminó sin veredicto.');
      } catch (err) {
        t.falla(`Excepción del script: ${err.stack?.split('\n').slice(0, 2).join(' ')}`);
      }
    }
    t.res.ms = Date.now() - t0;
    resultados.push(t.res);
    console.log(`${ICONO[t.res.resultado]} ${e.id.padEnd(4)} ${t.res.resultado.padEnd(9)} ${e.titulo}\n       ${t.res.detalle}`);
  }
  console.log('\nLimpieza…');
  const limpieza = await limpiar();
  limpieza.forEach((l) => console.log('  ' + l));
  const fin = new Date().toISOString();

  const dir = path.join(__dirname, 'resultados');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = inicio.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `${nombre}.md`), reporteMd(resultados, limpieza, inicio, fin));
  fs.writeFileSync(path.join(dir, `${nombre}.json`), JSON.stringify({ inicio, fin, config: { ...CONFIG, posadaKey: '***' }, soloLectura: SOLO_LECTURA, resultados, limpieza, bitacora: C.bitacora }, null, 2));
  const cuenta = resultados.reduce((m, r) => ((m[r.resultado] = (m[r.resultado] || 0) + 1), m), {});
  console.log(`\n${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`Reporte: ${path.join(dir, `${nombre}.md`)}`);
  process.exit(cuenta.FALLA ? 1 : 0);
}

if (require.main === module) main();
module.exports = { ESCENARIOS };
