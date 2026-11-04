/**
 * Clientes HTTP y utilidades para las pruebas reales contra Posada EC (Samantha Nuñez,
 * NODE_ALO_PEC) y contra el Booking desplegado.
 *
 * Sin dependencias: usa el `fetch` nativo de Node >= 22.
 *
 * Los adaptadores son tolerantes a pequeñas diferencias entre el contrato
 * `contracts/alojamientos-openapi-v2.yaml` (v2.2.0) y lo que realmente expone el socio
 * (por ejemplo `/disponibilidad` vs `/availability`, `opciones` vs `tipos`), porque lo que
 * se quiere probar es el comportamiento de negocio, no el nombre exacto de un campo.
 */
'use strict';

const crypto = require('crypto');

const CONFIG = {
  posadaBase: (process.env.POSADA_BASE_URL ||
    'https://posada-alojamientos-api.thankfulglacier-a27c5a77.northcentralus.azurecontainerapps.io/api/v2').replace(/\/$/, ''),
  posadaKey: process.env.POSADA_API_KEY || '',
  bookingBase: (process.env.BOOKING_BASE_URL || 'https://booking-core-api.azurewebsites.net/api/v1').replace(/\/$/, ''),
  timeoutMs: Number(process.env.PRUEBAS_TIMEOUT_MS || 15000),
  /** Como mucho se reservan estas habitaciones de golpe para "agotar" un tipo. */
  maxAgotar: Number(process.env.PRUEBAS_MAX_AGOTAR || 8),
};

const uuid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Fechas (calendario de America/Guayaquil, UTC-5 sin horario de verano) ──────────
function hoyGuayaquil() {
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function nochesEntre(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

// ─── Documentos ecuatorianos ─────────────────────────────────────────────────────
/** Dígito verificador de cédula (módulo 10). */
function digitoCedula(nueve) {
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(nueve[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    suma += p;
  }
  return (10 - (suma % 10)) % 10;
}
/** Cédula válida aleatoria de Pichincha (17). */
function cedulaValida() {
  const nueve = '17' + String(Math.floor(Math.random() * 6)) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  return nueve + digitoCedula(nueve);
}
/** Misma cédula con el dígito verificador alterado (debe fallar el módulo 10). */
function cedulaInvalida() {
  const c = cedulaValida();
  return c.slice(0, 9) + String((Number(c[9]) + 1) % 10);
}

function titular(sufijo = '') {
  const tag = (sufijo || uuid().slice(0, 6)).toLowerCase().replace(/[^a-z0-9]/g, '');
  return {
    nombreCompleto: `Prueba Automatizada ${tag}`,
    email: `qa.posada+${tag}@booking-pruebas.ec`,
    telefono: '+593991234567',
    tipoDocumento: 'CEDULA',
    identificacion: cedulaValida(),
  };
}

// ─── Dinero ──────────────────────────────────────────────────────────────────────
function money(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────────
/** Bitácora de TODAS las llamadas, para el reporte. */
const bitacora = [];

async function http(method, url, { headers = {}, body, timeoutMs = CONFIG.timeoutMs, crudo = false } = {}) {
  const h = { Accept: 'application/json', ...headers };
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = h['Content-Type'] || 'application/json';
    payload = crudo ? body : JSON.stringify(body);
  }
  const t0 = Date.now();
  const entrada = { t: ahora(), method, url, status: null, ms: null };
  try {
    const res = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(timeoutMs) });
    const texto = await res.text();
    let datos = texto;
    try { datos = texto ? JSON.parse(texto) : null; } catch { /* no es JSON */ }
    const cabeceras = Object.fromEntries(res.headers.entries());
    Object.assign(entrada, { status: res.status, ms: Date.now() - t0 });
    bitacora.push(entrada);
    return { status: res.status, headers: cabeceras, body: datos, ms: Date.now() - t0, error: null };
  } catch (err) {
    const causa = err?.cause?.message || err?.cause?.code || '';
    Object.assign(entrada, { status: 0, ms: Date.now() - t0, error: `${err.name}: ${err.message} ${causa}`.trim() });
    bitacora.push(entrada);
    return { status: 0, headers: {}, body: null, ms: Date.now() - t0, error: entrada.error };
  }
}

/** Código RFC 7807 (`code`) de una respuesta de error, si lo trae. */
function codigo(r) {
  const b = r?.body;
  if (!b || typeof b !== 'object') return null;
  return b.code || b.codigo || b.error_code || b.errorCode || b?.error?.code || null;
}
const codigoProblema = (r) => codigo(r);
function resumen(r) {
  if (!r) return '—';
  if (r.status === 0) return `sin respuesta (${r.error})`;
  const c = codigo(r);
  const det = r.body && typeof r.body === 'object' ? (r.body.detail || r.body.message || r.body.title || '') : String(r.body || '').slice(0, 120);
  return `HTTP ${r.status}${c ? ` ${c}` : ''}${det ? ` — ${String(Array.isArray(det) ? det.join('; ') : det).slice(0, 180)}` : ''}`;
}

// ─── Posada EC (proveedor) ───────────────────────────────────────────────────────
const posada = {
  h(extra = {}, conClave = true) {
    const base = { 'X-Correlation-ID': `qa-posada-${uuid()}`, ...extra };
    if (conClave && CONFIG.posadaKey) base['X-API-Key'] = CONFIG.posadaKey;
    return base;
  },
  url: (p) => `${CONFIG.posadaBase}${p}`,

  health() {
    return http('GET', posada.url('/alojamientos/health'), { headers: posada.h() });
  },

  async listarHoteles(max = 200) {
    const todos = [];
    for (let page = 1; page <= 20 && todos.length < max; page++) {
      const r = await http('GET', posada.url(`/alojamientos?page=${page}&limit=50`), { headers: posada.h() });
      if (r.status !== 200) {
        if (page === 1) return { ok: false, r, hoteles: [] };
        break;
      }
      const b = r.body || {};
      const items = Array.isArray(b) ? b : b.data || b.items || b.alojamientos || b.resultados || [];
      todos.push(...items);
      const meta = b.metadata || b.meta || {};
      if (!items.length || meta.has_next === false || items.length < 50) break;
    }
    return { ok: true, hoteles: todos.map(normalizarHotelPosada) };
  },

  /**
   * Disponibilidad por tipo de habitación para un rango. Prueba primero la ruta del
   * contrato (`/availability`) y luego el alias (`/disponibilidad`).
   */
  async disponibilidad(id, checkin, checkout, adultos = 1, habitaciones = 1) {
    const q1 = `checkin=${checkin}&checkout=${checkout}&adults=${adultos}&rooms=${habitaciones}&adultos=${adultos}`;
    let r = await http('GET', posada.url(`/alojamientos/${encodeURIComponent(id)}/availability?${q1}`), { headers: posada.h() });
    if (r.status === 404 || r.status === 405 || r.status === 400) {
      const r2 = await http('GET', posada.url(`/alojamientos/${encodeURIComponent(id)}/disponibilidad?${q1}`), { headers: posada.h() });
      if (r2.status === 200 || r.status !== 400) r = r2;
    }
    return { r, opciones: r.status === 200 ? normalizarOpciones(r.body) : [] };
  },

  /** Cotización con precio congelado (POST /alojamientos/availability). */
  cotizar({ id, codigo, checkin, checkout, adultos = 1, ninos = 0, habitaciones = 1 }) {
    return http('POST', posada.url('/alojamientos/availability'), {
      headers: posada.h(),
      body: {
        alojamientoId: id,
        tipoHabitacionCodigo: codigo,
        fechaInicio: checkin,
        fechaFin: checkout,
        cantidadHabitaciones: habitaciones,
        ocupantes: { adultos, ninos },
      },
    });
  },

  /** Cuerpo base de una orden (mismo formato que la certificación 6/6 de scripts/test_posada_integration.js). */
  cuerpoOrden({ id, codigo, checkin, checkout, adultos = 1, ninos = 0, habitaciones = 1, total, cotizacionId, huesped }) {
    const b = {
      alojamientoId: id,
      tipoHabitacionCodigo: codigo,
      fechaInicio: checkin,
      fechaFin: checkout,
      ocupantes: { adultos, ninos },
      totalPagar: total,
      huespedTitular: huesped || titular(),
    };
    if (habitaciones !== 1) b.cantidadHabitaciones = habitaciones;
    if (cotizacionId) b.cotizacionId = cotizacionId;
    return b;
  },

  crearOrden(body, { idem = uuid(), headers = {}, conClave = true } = {}) {
    return http('POST', posada.url('/alojamientos/orders/create'), {
      headers: posada.h({ 'Idempotency-Key': idem, ...headers }, conClave),
      body,
    });
  },

  obtenerOrden(ref, { conClave = true } = {}) {
    return http('GET', posada.url(`/alojamientos/orders/${encodeURIComponent(ref)}`), { headers: posada.h({}, conClave) });
  },

  listarOrdenes(query, { conClave = true } = {}) {
    return http('GET', posada.url(`/alojamientos/orders?${query}`), { headers: posada.h({}, conClave) });
  },

  cancelar(ref, { idem = uuid(), body = { motivo: 'Limpieza de prueba automatizada (Booking QA)' }, conClave = true } = {}) {
    return http('POST', posada.url(`/alojamientos/orders/${encodeURIComponent(ref)}/cancel`), {
      headers: posada.h(idem ? { 'Idempotency-Key': idem } : {}, conClave),
      body,
    });
  },

  checkin(ref, body = {}) {
    return http('POST', posada.url(`/alojamientos/orders/${encodeURIComponent(ref)}/check-in`), { headers: posada.h(), body });
  },
};

function normalizarHotelPosada(h) {
  return {
    id: h.id || h.alojamientoId || h.codigo,
    nombre: h.nombre || h.name || '',
    ciudad: h.ciudad || h.destino || h.city || h?.ubicacion?.ciudad || '',
    estado: h.estado || h.status || 'ACTIVO',
    crudo: h,
  };
}

function normalizarOpciones(body) {
  const b = body?.data && !Array.isArray(body.data) ? body.data : body;
  const lista = b?.opciones || b?.options || b?.tipos || b?.habitaciones || (Array.isArray(b) ? b : []);
  return lista.map((o) => ({
    codigo: o.tipoHabitacionCodigo || o.codigo || o.tipo || o.room_type,
    nombre: o.nombre || o.tipoHabitacion || '',
    remanentes: Number(o.habitacionesRemanentes ?? o.available_rooms ?? o.disponibles ?? o.cupo ?? NaN),
    disponible: o.estaDisponible ?? (Number(o.habitacionesRemanentes ?? 1) > 0),
    precioNoche: money(o.precioNoche ?? o.precio_noche ?? o.precioPorNoche),
    precioTotal: money(o.precioTotalEstancia ?? o.precioTotal ?? o.total),
    plan: o.planTarifaCodigo || null,
    capAdultos: Number(o.capacidadAdultos ?? o.capacidad?.adultos ?? NaN),
  })).filter((o) => o.codigo);
}

/**
 * Crea una orden en Posada resolviendo el precio: cotiza primero y, si el socio no
 * cotiza, usa el total de la opción de disponibilidad. Si responde PRICE_MISMATCH con
 * un total esperado, reintenta una vez con ese total.
 */
async function crearOrdenPosada({ id, codigo, checkin, checkout, adultos, ninos = 0, habitaciones = 1, opcion, huesped, idem }) {
  adultos = adultos || habitaciones;
  let total = null;
  let cotizacionId;
  const cot = await posada.cotizar({ id, codigo, checkin, checkout, adultos, ninos, habitaciones });
  if (cot.status === 200 && cot.body) {
    const c = cot.body.data && !Array.isArray(cot.body.data) ? cot.body.data : cot.body;
    total = money(c.precioTotalCotizado ?? c.total ?? c.precioTotal);
    cotizacionId = c.cotizacionId || undefined;
  }
  if (!total && opcion?.precioTotal) total = money(Number(opcion.precioTotal) * habitaciones);
  if (!total) total = '0.00';
  const body = posada.cuerpoOrden({ id, codigo, checkin, checkout, adultos, ninos, habitaciones, total, cotizacionId, huesped });
  let r = await posada.crearOrden(body, { idem: idem || uuid() });
  if (r.status === 409 && codigoProblema(r) === 'PRICE_MISMATCH') {
    const p = r.body || {};
    const esperado = money(p.totalEsperado ?? p.esperado ?? p.expected ?? p.precioEsperado ?? p?.extensions?.esperado);
    if (esperado) {
      body.totalPagar = esperado;
      delete body.cotizacionId;
      r = await posada.crearOrden(body, { idem: uuid() });
    }
  }
  return { r, body, cot, ref: refDeOrden(r) };
}

function refDeOrden(r) {
  const b = r?.body?.data && !Array.isArray(r.body.data) ? r.body.data : r?.body;
  if (!b || typeof b !== 'object') return null;
  return {
    orderId: b.orderId || b.id || null,
    externalOrderId: b.external_order_id || b.externalOrderId || null,
    codigoReserva: b.codigoReserva || b.codigo_reserva || null,
    estado: b.estado || b.status || null,
    total: money(b.total ?? b.totalPagar),
    crudo: b,
  };
}

// ─── Booking (nuestro sistema) ───────────────────────────────────────────────────
const booking = {
  url: (p) => `${CONFIG.bookingBase}${p}`,
  h: (extra = {}) => ({ 'X-Correlation-ID': `qa-booking-${uuid()}`, ...extra }),

  ping() {
    return http('GET', booking.url('/alojamientos?page=1&limit=1'), { headers: booking.h() });
  },

  async catalogo() {
    const todos = [];
    for (let page = 1; page <= 40; page++) {
      const r = await http('GET', booking.url(`/alojamientos?page=${page}&limit=50`), { headers: booking.h() });
      if (r.status !== 200) {
        if (page === 1) return { ok: false, r, hoteles: [] };
        break;
      }
      const items = r.body?.data || [];
      todos.push(...items);
      if (items.length < 50) break;
    }
    return { ok: true, hoteles: todos };
  },

  tipos(id) {
    return http('GET', booking.url(`/alojamientos/${encodeURIComponent(id)}/tipos-habitacion`), { headers: booking.h() });
  },

  disponibilidad(id, checkin, checkout) {
    return http('GET', booking.url(`/alojamientos/${encodeURIComponent(id)}/availability?checkin=${checkin}&checkout=${checkout}`), {
      headers: booking.h(),
    });
  },

  reservar(id, { checkin, checkout, habitaciones = 1, adultos, tipo, etiqueta, confirmarDuplicado = true, idem = uuid() }) {
    const t = titular(etiqueta);
    return http('POST', booking.url(`/alojamientos/${encodeURIComponent(id)}/reservations`), {
      headers: booking.h({ 'Idempotency-Key': idem }),
      body: {
        checkin,
        checkout,
        habitaciones_count: habitaciones,
        adultos: adultos || habitaciones,
        ninos: 0,
        customer_name: t.nombreCompleto,
        customer_email: t.email,
        phone: t.telefono,
        ...(tipo ? { tipo_habitacion_id: tipo } : {}),
        ...(confirmarDuplicado ? { confirmar_duplicado: true } : {}),
      },
    });
  },

  cancelar(reservationId) {
    return http('POST', booking.url(`/alojamientos/reservations/${encodeURIComponent(reservationId)}/cancel`), {
      headers: booking.h({ 'Idempotency-Key': uuid() }),
      body: { reason: 'Limpieza de prueba automatizada (Booking QA)' },
    });
  },
};

/** "SUITE_FAMILIAR" ≈ "suite-familiar" ≈ "Suite Familiar". */
const normCodigo = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Tipos de Booking (disponibilidad) indexados por código normalizado. */
function tiposBooking(r) {
  const tipos = r?.body?.tipos || [];
  return tipos.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    nombre: t.nombre,
    libres: Number(t.available_rooms),
    total: Number(t.total_rooms),
    precioNoche: money(t.precio_noche),
  }));
}
function emparejarTipo(tiposB, codigoPosada, nombrePosada) {
  const c = normCodigo(codigoPosada);
  return (
    tiposB.find((t) => normCodigo(t.codigo) === c) ||
    tiposB.find((t) => normCodigo(t.nombre) === c || (nombrePosada && normCodigo(t.nombre) === normCodigo(nombrePosada))) ||
    tiposB.find((t) => normCodigo(t.codigo).endsWith(c) || c.endsWith(normCodigo(t.codigo))) ||
    (tiposB.length === 1 ? tiposB[0] : null)
  );
}

module.exports = {
  CONFIG, uuid, esperar, ahora, bitacora,
  hoyGuayaquil, sumarDias, nochesEntre,
  cedulaValida, cedulaInvalida, digitoCedula, titular, money,
  http, codigo, resumen,
  posada, crearOrdenPosada, refDeOrden,
  booking, tiposBooking, emparejarTipo, normCodigo,
};
