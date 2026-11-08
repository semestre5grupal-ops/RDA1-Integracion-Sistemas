/**
 * Ejecuta el CÓDIGO REAL del agregador del gateway (rama claude/hopeful-cray-sos1je, compilado)
 * contra los socios REALES. Lo único simulado es la base de datos de Booking (copia en memoria)
 * y el registro de socios (los 3 nodos de «Servicios & Prov.»).
 *
 * Uso: POSADA_API_KEY=<clave de Posada> node gateway-real.js
 */
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
// Código compilado del backend: `npx tsc -p tsconfig.build.json --outDir <carpeta>` y GATEWAY_DIST=<carpeta>.
const DIST = process.env.GATEWAY_DIST || require('path').resolve(__dirname, '../../../dist');
const { AlojamientosSociosService } = require(`${DIST}/modules/alojamientos/socios/alojamientos-socios.service`);
const { AlojamientosSociosReservasService } = require(`${DIST}/modules/alojamientos/socios/alojamientos-socios-reservas.service`);
const C = require('./cliente.js');

// ── Socios registrados (las claves de Kawsay y LuxeStays las pone el proxy) ──
const NODOS = [
  { codigoNodo: 'NODE_ALO_PEC', nombreProveedor: 'Posada EC', vertical: 'ALOJAMIENTOS', killSwitchActivo: false,
    baseUrlRest: 'https://posada-alojamientos-api.thankfulglacier-a27c5a77.northcentralus.azurecontainerapps.io/api/v2', apiKey: process.env.POSADA_API_KEY },
  { codigoNodo: 'NODE_ALO_KAWSAY_E_FCKP', nombreProveedor: 'Kawsay Estancias', vertical: 'ALOJAMIENTOS', killSwitchActivo: false,
    baseUrlRest: 'https://kawsay-alo-78f5556.azurewebsites.net/api/v2', apiKey: process.env.KAWSAY_API_KEY || 'proxy-injected-kawsay' },
  { codigoNodo: 'NODE_ALO_LUXESTAY_E5K3', nombreProveedor: 'LuxeStays', vertical: 'ALOJAMIENTOS', killSwitchActivo: false,
    baseUrlRest: 'https://posada-ec-alojamientos.azurewebsites.net/api/v2', apiKey: process.env.LUXE_API_KEY || 'proxy-injected-luxe' },
];
const repo = { find: async () => NODOS, findOne: async ({ where }) => NODOS.find((n) => n.apiKey === where.apiKey) ?? null };

// ── Base de Booking en memoria (solo las consultas de la copia de reservas) ──
class BaseMemoria {
  constructor() { this.filas = []; this.isInitialized = true; }
  async query(sql, p = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE') || s.includes('clientes_socios_mapeo')) return [];
    if (s.includes('WHERE idempotency_key = $1')) return this.filas.filter((f) => f.idempotency_key === p[0]);
    if (s.includes('WHERE id = $1') && s.startsWith('SELECT')) return this.filas.filter((f) => f.id === p[0]);
    if (s.includes('WHERE id::text = $1 OR codigo_reserva = $1')) return this.filas.filter((f) => [f.id, f.codigo_reserva, f.order_id_socio, f.external_order_id, f.codigo_reserva_socio].includes(p[0])).slice(0, 1);
    if (s.startsWith('INSERT INTO schema_alojamientos.alojamientos_reservas_socio')) {
      if (this.filas.some((f) => f.idempotency_key === p[21])) throw new Error('duplicate key (idempotency_key)');
      const n = ['codigo_reserva','codigo_nodo','alojamiento_id_socio','alojamiento_nombre','destino','foto_url','tipo_codigo','tipo_nombre','plan_tarifa','checkin','checkout','noches','habitaciones','adultos','ninos','total','moneda','estado','order_id_socio','external_order_id','codigo_reserva_socio','idempotency_key','usuario_id','cliente_nombre','cliente_email','cliente_telefono','documento_tipo','documento_numero','external_client_id','peticiones_especiales','correlation_id','respuesta_socio'];
      const f = { id: randomUUID(), creado_en: new Date() }; n.forEach((k, i) => (f[k] = p[i])); this.filas.push(f); return [f];
    }
    if (s.startsWith('UPDATE') && s.includes('motivo_cancelacion')) { const f = this.filas.find((x) => x.id === p[0]); Object.assign(f, { estado: p[1], motivo_cancelacion: p[2], codigo_reembolso: p[3], monto_reembolsado: p[4] }); return [f]; }
    if (s.startsWith('UPDATE') && s.includes('checkin_at')) { const f = this.filas.find((x) => x.id === p[0]); Object.assign(f, { estado: p[1], checkin_admin: p[3] }); return [f]; }
    throw new Error('consulta no simulada: ' + s.slice(0, 70));
  }
}

process.env.ALOJAMIENTOS_SOCIOS_CACHE_MS = '0';
const socios = new AlojamientosSociosService(repo);
const db = new BaseMemoria();
const reservas = new AlojamientosSociosReservasService(socios, db);
const resultados = [];
const creadasGateway = []; // reservation_id de Booking
const creadasDirecto = []; // { nodo, orderId } reservas hechas directo en la web del socio

function anotar(socio, id, titulo, ok, detalle) {
  resultados.push({ socio, id, titulo, resultado: ok === null ? 'BLOQUEADO' : ok ? 'PASA' : 'FALLA', detalle });
  console.log(`${ok === null ? '⛔' : ok ? '✅' : '❌'} [${socio}] ${id} ${titulo}\n      ${detalle}`);
}
const fecha = (d) => C.sumarDias(C.hoyGuayaquil(), d);
const huesped = (tag, doc) => ({ nombre: `Prueba Automatizada ${tag}`, email: `qa.posada+${tag}@booking-pruebas.ec`, telefono: '+593 99 123 4567', documentoTipo: 'CEDULA', documentoNumero: doc || C.cedulaValida() });
const err = (e) => `${e?.status ?? e?.getStatus?.() ?? '?'} ${(e?.response?.code || e?.codigo || e?.response?.message || e?.message || '').toString().slice(0, 140)}`;
async function libresSocio(idComp, ci, co, codigo) {
  const d = await socios.opciones(idComp, ci, co);
  return d?.opciones.find((o) => o.codigo === codigo)?.remanentes;
}
/** Hotel/tipo del socio con remanentes en [min,max] en una ventana de fechas. */
async function buscar(nodo, min, max, desdeDias) {
  const ci = fecha(desdeDias), co = fecha(desdeDias + 2);
  const hoteles = (await socios.catalogo()).hoteles.filter((h) => h.proveedor_id === nodo);
  for (const h of hoteles.slice(0, 15)) {
    const d = await socios.opciones(h.id, ci, co);
    const o = d?.opciones.find((x) => x.disponible && x.remanentes >= min && x.remanentes <= max);
    if (o) return { h, o, ci, co, d };
  }
  return null;
}
const datos = (v, tag, extra = {}) => ({ idCompuesto: v.h.id, checkin: v.ci, checkout: v.co, habitaciones: 1, adultos: 1, ninos: 0, productId: v.o.productId, ...huesped(tag), idempotencyKey: randomUUID(), usuarioId: null, ...extra });

async function porSocio(nodo, nombre, desde) {
  // G1: reserva normal por el gateway llega al hotel
  const v1 = await buscar(nodo, 2, 99, desde);
  if (!v1) return anotar(nombre, 'G1', 'Reserva por el gateway', null, 'Sin cupo en el socio');
  const antes = v1.o.remanentes;
  let r1;
  try { r1 = await reservas.reservar(datos(v1, `g1${nombre.slice(0, 3).toLowerCase()}`)); creadasGateway.push(r1.reservation_id); } catch (e) { return anotar(nombre, 'G1', 'Reserva por el gateway', false, `El gateway no pudo reservar: ${err(e)}`); }
  const d1 = await libresSocio(v1.h.id, v1.ci, v1.co, v1.o.codigo);
  anotar(nombre, 'G1', 'Reserva por el gateway llega al hotel', r1.status === 'RESERVADO' && d1 === antes - 1, `Booking ${r1.codigo_reserva} (${r1.status}) ↔ hotel ${r1.socio.external_order_id || r1.socio.order_id}; libres ${antes} → ${d1}; client_id ${r1.socio.client_id ?? '—'}`);

  // G2: reintento (misma clave) devuelve la misma reserva y no descuenta otra
  const d2 = await reservas.reservar({ ...datos(v1, 'x'), idempotencyKey: (db.filas.find((f) => f.id === r1.reservation_id) || {}).idempotency_key });
  const d2l = await libresSocio(v1.h.id, v1.ci, v1.co, v1.o.codigo);
  anotar(nombre, 'G2', 'Reintento con la misma clave', d2.reservation_id === r1.reservation_id && d2l === d1, `misma reserva: ${d2.reservation_id === r1.reservation_id}; libres ${d1} → ${d2l}`);

  // G3: 10 clics simultáneos (misma clave, mismo cuerpo)
  const v3 = await buscar(nodo, 2, 99, desde + 5);
  if (v3) {
    const a3 = v3.o.remanentes;
    const base = datos(v3, `g3${nombre.slice(0, 3).toLowerCase()}`);
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => reservas.reservar({ ...base })));
    const ok = rs.filter((r) => r.status === 'fulfilled').map((r) => r.value.reservation_id);
    new Set(ok).forEach((id) => creadasGateway.push(id));
    const d3 = await libresSocio(v3.h.id, v3.ci, v3.co, v3.o.codigo);
    anotar(nombre, 'G3', 'Doble clic ×10 por el gateway', new Set(ok).size === 1 && d3 === a3 - 1, `reservas distintas en Booking: ${new Set(ok).size}; libres en el hotel ${a3} → ${d3}; respuestas OK ${ok.length}/10`);
  } else anotar(nombre, 'G3', 'Doble clic ×10 por el gateway', null, 'Sin cupo');

  // G4: caso del compañero — se agota en la web del hotel y se intenta en Booking
  const v4 = await buscar(nodo, 1, 6, desde + 10);
  if (v4) {
    const nodoCfg = NODOS.find((n) => n.codigoNodo === nodo);
    let agotadas = 0;
    for (let i = 0; i < v4.o.remanentes; i++) {
      const out = await C.crearOrdenPosadaEn(nodoCfg, v4, i);
      if (out) { creadasDirecto.push({ nodo: nodoCfg, ref: out }); agotadas++; }
    }
    const quedan = await libresSocio(v4.h.id, v4.ci, v4.co, v4.o.codigo);
    let r4, e4;
    try { r4 = await reservas.reservar(datos(v4, `g4${nombre.slice(0, 3).toLowerCase()}`)); creadasGateway.push(r4.reservation_id); } catch (e) { e4 = e; }
    const status = e4 ? (e4.status ?? e4.getStatus?.()) : 201;
    anotar(nombre, 'G4', 'Caso del compañero: agotado en la web del hotel → Booking rechaza', quedan === 0 && !r4 && status === 409, `se reservaron ${agotadas} directo en el hotel (libres ahora ${quedan}); Booking respondió ${r4 ? `201 ${r4.codigo_reserva} (SOBREVENTA)` : err(e4)}`);
  } else anotar(nombre, 'G4', 'Caso del compañero', null, 'Sin un tipo con 1–6 libres');

  // G5: carrera de 6 clientes por la última habitación, por el gateway
  const v5 = await buscar(nodo, 1, 6, desde + 15);
  if (v5) {
    const nodoCfg = NODOS.find((n) => n.codigoNodo === nodo);
    for (let i = 0; i < v5.o.remanentes - 1; i++) { const out = await C.crearOrdenPosadaEn(nodoCfg, v5, i); if (out) creadasDirecto.push({ nodo: nodoCfg, ref: out }); }
    const una = await libresSocio(v5.h.id, v5.ci, v5.co, v5.o.codigo);
    const rs = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => reservas.reservar(datos(v5, `g5c${i}${nombre.slice(0, 2).toLowerCase()}`))));
    const ok = rs.filter((r) => r.status === 'fulfilled');
    ok.forEach((r) => creadasGateway.push(r.value.reservation_id));
    const rech = rs.filter((r) => r.status === 'rejected').map((r) => r.reason?.status ?? r.reason?.getStatus?.());
    const fin = await libresSocio(v5.h.id, v5.ci, v5.co, v5.o.codigo);
    anotar(nombre, 'G5', 'Carrera ×6 por la última habitación, por el gateway', una === 1 && ok.length === 1 && fin === 0, `libres antes ${una}; confirmadas ${ok.length}; rechazos ${JSON.stringify(rech)}; libres al final ${fin}`);
  } else anotar(nombre, 'G5', 'Carrera por la última habitación', null, 'Sin un tipo con 1–6 libres');

  // G6: sin documento → 400 sin llegar al hotel
  try { await reservas.reservar(datos(v1, 'g6', { documentoNumero: '' })); anotar(nombre, 'G6', 'Reserva sin documento', false, 'Se aceptó sin documento'); }
  catch (e) { anotar(nombre, 'G6', 'Reserva sin documento → 400', (e.status ?? e.getStatus?.()) === 400, err(e)); }

  // G7: check-in del hotel con clave ajena → 401; con la clave del dueño → CONFIRMADO_ASISTIDO
  const ext = r1.socio.external_order_id || r1.socio.order_id;
  let ajena;
  try { await reservas.marcarCheckin(ext, 'clave-de-otro-socio', {}); ajena = 'aceptada (MAL)'; } catch (e) { ajena = String(e.status ?? e.getStatus?.()); }
  const dueno = NODOS.find((n) => n.codigoNodo === nodo).apiKey;
  const ci = await reservas.marcarCheckin(ext, dueno, { admin: 'recepcionista-qa' }).catch((e) => ({ estado: 'ERROR ' + err(e) }));
  anotar(nombre, 'G7', 'Check-in avisado por el hotel (Flujo 2)', ajena === '401' && ci.estado === 'CONFIRMADO_ASISTIDO', `clave ajena → ${ajena}; clave del hotel → ${ci.estado}`);

  // G8: cancelar por el gateway (G3) libera en el hotel; una reserva con check-in no se cancela
  const g3 = db.filas.find((f) => f.codigo_nodo === nodo && f.cliente_email.includes('g3'));
  if (g3) {
    const ant = await libresSocio(socios.constructor.idCompuesto(nodo, g3.alojamiento_id_socio), C.sumarDias(String(g3.checkin), 0), String(g3.checkout), g3.tipo_codigo);
    const c = await reservas.cancelar(g3.id, 'Prueba QA').catch((e) => ({ status: 'ERROR ' + err(e) }));
    const des = await libresSocio(socios.constructor.idCompuesto(nodo, g3.alojamiento_id_socio), String(g3.checkin), String(g3.checkout), g3.tipo_codigo);
    anotar(nombre, 'G8', 'Cancelar en Booking libera la habitación en el hotel', c.status === 'CANCELADO' && des === ant + 1, `estado ${c.status}; reembolso ${c.reembolso?.codigo ?? '—'}; libres ${ant} → ${des}`);
  }
  let noCancela;
  try { await reservas.cancelar(r1.reservation_id); noCancela = 'se canceló (MAL)'; } catch (e) { noCancela = String(e.status ?? e.getStatus?.()); }
  anotar(nombre, 'G9', 'Una reserva con check-in no se puede cancelar', noCancela === '409', `respuesta ${noCancela}`);
}

// Reserva directa en la web del socio (para agotar), con el precio cotizado.
C.crearOrdenPosadaEn = async (nodo, v, i) => {
  const sep = AlojamientosSociosService.separarId(v.h.id);
  const base = nodo.baseUrlRest;
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': nodo.apiKey };
  const cot = await fetch(`${base}/alojamientos/availability`, { method: 'POST', headers: h, body: JSON.stringify({ alojamientoId: sep.id, tipoHabitacionCodigo: v.o.codigo, fechaInicio: v.ci, fechaFin: v.co, cantidadHabitaciones: 1, ocupantes: { adultos: 1, ninos: 0 } }) }).then((r) => r.json()).catch(() => ({}));
  const c = cot.data && !Array.isArray(cot.data) ? cot.data : cot;
  const body = { alojamientoId: sep.id, tipoHabitacionCodigo: v.o.codigo, fechaInicio: v.ci, fechaFin: v.co, ocupantes: { adultos: 1, ninos: 0 }, totalPagar: C.money(c.precioTotalCotizado) || C.money(v.o.precioTotal), huespedTitular: { ...C.titular(`directo${i}`) } };
  const r = await fetch(`${base}/alojamientos/orders/create`, { method: 'POST', headers: { ...h, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? (j.orderId || j.id || j.data?.orderId) : null;
};

(async () => {
  const { hoteles, fuentes } = await socios.catalogo();
  const por = hoteles.reduce((m, h) => ((m[h.proveedor_id] = (m[h.proveedor_id] || 0) + 1), m), {});
  anotar('Todos', 'G0', 'Catálogo agregado en vivo de los 3 socios', fuentes.every((f) => f.ok) && Object.keys(por).length === 3, `${hoteles.length} hoteles: ${JSON.stringify(por)} · fuentes ${fuentes.map((f) => `${f.codigoNodo}:${f.ok ? 'OK' : f.error}`).join(', ')}`);
  await Promise.all([
    porSocio('NODE_ALO_PEC', 'Posada EC', 170),
    porSocio('NODE_ALO_KAWSAY_E_FCKP', 'Kawsay', 175),
    porSocio('NODE_ALO_LUXESTAY_E5K3', 'LuxeStays', 180),
  ].map((p) => p.catch((e) => console.log('ERROR', e))));

  // Limpieza: todo lo creado (por el gateway y directo en el hotel).
  let ok = 0, total = 0;
  for (const f of db.filas) {
    total++;
    const nodo = NODOS.find((n) => n.codigoNodo === f.codigo_nodo);
    const ref = f.order_id_socio || f.external_order_id;
    const r = await fetch(`${nodo.baseUrlRest}/alojamientos/orders/${encodeURIComponent(ref)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': nodo.apiKey, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ motivo: 'Limpieza prueba QA' }) });
    if (r.status === 200) ok++; else console.log('  no se pudo cancelar', f.codigo_nodo, ref, r.status);
  }
  for (const d of creadasDirecto) {
    total++;
    const r = await fetch(`${d.nodo.baseUrlRest}/alojamientos/orders/${encodeURIComponent(d.ref)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': d.nodo.apiKey, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ motivo: 'Limpieza prueba QA' }) });
    if (r.status === 200) ok++; else console.log('  no se pudo cancelar', d.nodo.codigoNodo, d.ref, r.status);
  }
  console.log(`\nLimpieza: ${ok}/${total} reservas canceladas en los socios`);
  const cuenta = resultados.reduce((m, r) => ((m[r.resultado] = (m[r.resultado] || 0) + 1), m), {});
  console.log(JSON.stringify(cuenta));
  require('fs').writeFileSync(require('path').join(__dirname, 'resultados', `${new Date().toISOString().replace(/[:.]/g, '-')}-gateway-socios-reales.json`), JSON.stringify({ fecha: new Date().toISOString(), resultados, limpieza: `${ok}/${total}` }, null, 2));
})();
