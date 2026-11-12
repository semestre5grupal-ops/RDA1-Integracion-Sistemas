/**
 * Modelo del monitoreo de vuelos: a partir de los eventos de la traza
 * (GET /admin/procesos/vuelos/monitoreo) arma "casos" (una compra, la
 * post-venta de una reserva, un cambio de integración...) y calcula el
 * resumen: embudo, indicadores, alertas y la tabla por aerolínea.
 * Todo es puro (sin React) para poder probarlo.
 */

export const PASOS = {
  busqueda: { label: 'Búsqueda', icon: '🔎' },
  hold: { label: 'Hold', icon: '⏱️' },
  asiento: { label: 'Asiento', icon: '💺' },
  cobro: { label: 'Cobro', icon: '💳' },
  reserva_aerolinea: { label: 'Reserva', icon: '✈️' },
  copia: { label: 'Copia', icon: '🗂️' },
  factura: { label: 'Factura', icon: '🧾' },
  confirmada: { label: 'Confirmada', icon: '✅' },
  reembolso: { label: 'Reembolso', icon: '↩️' },
  cancelacion: { label: 'Cancelación', icon: '🛑' },
  checkin: { label: 'Check-in', icon: '🛂' },
  cambio_fecha: { label: 'Cambio de fecha', icon: '🗓️' },
  estado_vuelo: { label: 'Estado de vuelo', icon: '📡' },
  consulta: { label: 'Consulta', icon: '🔁' },
  boleto: { label: 'Boleto consultado', icon: '🎟️' },
  pase: { label: 'Pase de abordar', icon: '🎫' },
  cotizacion: { label: 'Cotización', icon: '🧮' },
  soltar: { label: 'Soltó', icon: '🔓' },
  webhook: { label: 'Webhook', icon: '📨' },
  integracion: { label: 'Integración', icon: '🔌' },
};

/** Pasos de la barra de una compra, en orden. */
export const BARRA_COMPRA = ['busqueda', 'hold', 'asiento', 'cobro', 'reserva_aerolinea', 'factura', 'confirmada'];
const POSVENTA = new Set(['checkin', 'cancelacion', 'cambio_fecha', 'reembolso', 'boleto', 'pase', 'cotizacion']);
export const MIN_ABANDONO = 16; // el hold dura 15 min

export const pnrDe = (e) => String(e?.detalle || '').match(/PNR ([A-Z0-9]{5,8})/)?.[1] ?? null;
const t = (e) => Date.parse(e.ts);

/** Tráfico de pruebas automáticas (no son clientes). */
export function esPrueba(c) {
  return /example\.com/i.test(c.cliente || '') || /^corr-e2e/.test(c.correlacion || '');
}

function mediana(v) {
  const a = v.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.floor((a.length - 1) / 2)] : null;
}
function p90(v) {
  const a = v.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : null;
}

function datosComunes(eventos) {
  const conCorreo = eventos.find((e) => e.cliente && e.cliente.includes('@'));
  return {
    cliente: conCorreo?.cliente ?? eventos.find((e) => e.cliente)?.cliente ?? null,
    nodo: eventos.find((e) => e.nodo)?.nodo ?? null,
    pnr: eventos.map(pnrDe).find(Boolean) ?? null,
    inicio: eventos[0]?.ts,
    fin: eventos[eventos.length - 1]?.ts,
  };
}

/** Estado de una compra (intento con hold). */
function estadoCompra(evs, ahora) {
  const pasos = new Set(evs.map((e) => e.paso));
  const fallo = evs.find((e) => e.resultado === 'error' && BARRA_COMPRA.includes(e.paso));
  if (evs.some((e) => e.paso === 'reembolso' && e.resultado === 'error')) {
    return { clave: 'critico', label: 'Cobrado sin reserva', tono: 'error', motivo: evs.find((e) => e.paso === 'reembolso' && e.resultado === 'error')?.detalle };
  }
  if (pasos.has('confirmada')) return { clave: 'completada', label: 'Completada', tono: 'ok' };
  if (fallo) {
    const devuelto = evs.some((e) => e.paso === 'reembolso' && e.resultado === 'ok');
    return { clave: 'fallo', label: `Falló en ${PASOS[fallo.paso]?.label ?? fallo.paso}${devuelto ? ' · cobro devuelto' : ''}`, tono: 'error', motivo: fallo.detalle, pasoFallo: fallo.paso };
  }
  const ultimo = evs[evs.length - 1];
  const soltoHold = evs.some((e) => e.paso === 'soltar' && /Hold liberado/.test(e.detalle || ''));
  const hold = evs.find((e) => e.paso === 'hold');
  const minutos = hold ? (ahora - t(hold)) / 60000 : 0;
  if (soltoHold || (!pasos.has('cobro') && minutos > MIN_ABANDONO)) {
    const hasta = pasos.has('asiento') ? 'eligió asiento' : 'tenía el hold';
    return { clave: 'abandonada', label: 'Abandonada', tono: 'neutro', motivo: `${soltoHold ? 'Cerró el formulario' : 'El hold venció sin pago'} (${hasta})` };
  }
  return { clave: 'curso', label: `En curso · ${PASOS[ultimo?.paso]?.label ?? ''}`, tono: 'curso' };
}

/** Estado de una operación de post-venta (sin compra en la ventana). */
function estadoPosventa(evs) {
  const ultimoDe = (p) => [...evs].reverse().find((e) => e.paso === p);
  const canc = ultimoDe('cancelacion');
  const reemb = ultimoDe('reembolso');
  if (reemb?.resultado === 'error') return { clave: 'critico', label: 'Reembolso falló', tono: 'error', motivo: reemb.detalle };
  if (canc) return canc.resultado === 'ok'
    ? { clave: 'posventa', label: reemb ? 'Cancelada · reembolsada' : 'Cancelada', tono: 'aviso' }
    : { clave: 'fallo', label: 'Cancelación rechazada', tono: 'aviso', motivo: canc.detalle };
  const ci = ultimoDe('checkin');
  if (ci) return ci.resultado === 'ok'
    ? { clave: 'posventa', label: 'Check-in hecho', tono: 'ok' }
    : { clave: 'fallo', label: 'Check-in rechazado', tono: 'aviso', motivo: ci.detalle };
  const cf = ultimoDe('cambio_fecha');
  if (cf) return { clave: 'posventa', label: 'Cambio de fecha', tono: cf.resultado === 'ok' ? 'aviso' : 'error', motivo: cf.resultado === 'ok' ? null : cf.detalle };
  const pase = ultimoDe('pase');
  if (pase) return { clave: 'posventa', label: pase.resultado === 'ok' ? 'Vio su pase' : 'Pase no disponible', tono: pase.resultado === 'ok' ? 'ok' : 'aviso', motivo: pase.resultado === 'ok' ? null : pase.detalle };
  if (ultimoDe('cotizacion')) return { clave: 'posventa', label: 'Cotizó cancelación', tono: 'neutro' };
  if (ultimoDe('boleto')) return { clave: 'posventa', label: 'Vio su boleto', tono: 'neutro' };
  return { clave: 'posventa', label: 'Post-venta', tono: 'neutro' };
}

/**
 * Casos del monitoreo, del más reciente al más antiguo:
 *  - tipo 'compra': un intento de compra (desde el hold), con su post-venta por PNR;
 *  - tipo 'posventa': operaciones sobre una reserva cuya compra no está en la ventana;
 *  - tipo 'busqueda': búsquedas sin hold;
 *  - tipo 'integracion' / 'webhook': eventos de fondo.
 */
export function armarCasos(eventos, ahora = Date.now()) {
  const evs = [...eventos].sort((a, b) => a.seq - b.seq);
  const porCorr = new Map();
  const posventa = [];
  const fondo = [];
  for (const e of evs) {
    if (e.paso === 'integracion' || e.paso === 'webhook') { fondo.push(e); continue; }
    if (POSVENTA.has(e.paso) && pnrDe(e)) { posventa.push(e); continue; }
    const k = e.correlacion || 'sin-correlacion';
    if (!porCorr.has(k)) porCorr.set(k, []);
    porCorr.get(k).push(e);
  }

  const compras = [];
  const busquedas = [];
  for (const [correlacion, lista] of porCorr) {
    const previos = [];
    let actual = null;
    let intento = 0;
    for (const e of lista) {
      if (e.paso === 'hold' && (!actual || actual.eventos.some((x) => x.paso === 'hold'))) {
        intento += 1;
        actual = { id: `${correlacion}#${intento}`, correlacion, intento, eventos: intento === 1 ? [...previos] : [] };
        compras.push(actual);
      }
      if (actual) actual.eventos.push(e); else previos.push(e);
    }
    if (!actual && previos.length) busquedas.push({ id: `${correlacion}#0`, correlacion, intento: 0, eventos: previos });
  }

  const casos = [];
  const compraPorPnr = new Map();
  for (const c of compras) {
    const comunes = datosComunes(c.eventos);
    const caso = { ...c, ...comunes, tipo: 'compra', estado: estadoCompra(c.eventos, ahora), posventa: [] };
    caso.consultas = c.eventos.filter((e) => e.paso === 'consulta').length;
    caso.monto = c.eventos.find((e) => e.paso === 'cobro' && e.resultado === 'ok' && e.monto)?.monto
      ?? c.eventos.find((e) => e.paso === 'hold' && e.monto)?.monto ?? null;
    const confirmada = c.eventos.find((e) => e.paso === 'confirmada');
    const hold = c.eventos.find((e) => e.paso === 'hold');
    caso.duracionMs = confirmada && hold ? t(confirmada) - t(hold) : null;
    if (caso.pnr) compraPorPnr.set(caso.pnr, caso);
    casos.push(caso);
  }

  // Post-venta: con su compra si está en la ventana; si no, como caso propio por PNR.
  const sueltas = new Map();
  for (const e of posventa) {
    const pnr = pnrDe(e);
    const compra = compraPorPnr.get(pnr);
    if (compra) { compra.posventa.push(e); continue; }
    if (!sueltas.has(pnr)) sueltas.set(pnr, []);
    sueltas.get(pnr).push(e);
  }
  for (const c of casos) {
    if (!c.posventa.length) continue;
    c.estadoPosventa = estadoPosventa(c.posventa);
    if (c.estadoPosventa.clave === 'critico') c.estado = c.estadoPosventa;
    c.fin = c.posventa[c.posventa.length - 1].ts;
  }
  // Reintentos de pago sobre un hold que ya se usó (la compra sí se completó): no son fallas.
  for (const c of casos) {
    if (c.tipo !== 'compra' || c.estado.clave !== 'fallo' || c.estado.pasoFallo !== 'hold' || !/CONSUMED|consumid/i.test(c.estado.motivo || '')) continue;
    const pagada = casos.some((x) => x !== c && x.tipo === 'compra' && x.correlacion === c.correlacion && x.estado.clave === 'completada');
    if (pagada) c.estado = { clave: 'reintento', label: 'Reintento · ya estaba pagada', tono: 'neutro', motivo: 'El cliente volvió a pulsar pagar sobre un hold que ya se había convertido en reserva.' };
  }
  for (const [pnr, lista] of sueltas) {
    casos.push({ id: `pnr-${pnr}`, tipo: 'posventa', eventos: lista, ...datosComunes(lista), pnr, estado: estadoPosventa(lista), posventa: [], consultas: 0, monto: lista.find((e) => e.monto)?.monto ?? null });
  }
  for (const b of busquedas) {
    const soloConsultas = b.eventos.every((e) => e.paso === 'consulta' || e.paso === 'estado_vuelo' || e.paso === 'soltar');
    casos.push({ ...b, ...datosComunes(b.eventos), tipo: 'busqueda', estado: { clave: 'busqueda', label: soloConsultas ? 'Consulta' : 'Solo búsqueda', tono: 'neutro' }, posventa: [], consultas: b.eventos.filter((e) => e.paso === 'consulta').length, monto: null });
  }
  for (const e of fondo) {
    casos.push({
      id: `fondo-${e.seq}`, tipo: e.paso, eventos: [e], posventa: [], consultas: 0, monto: null, correlacion: e.correlacion,
      cliente: null, nodo: e.nodo, pnr: pnrDe(e), inicio: e.ts, fin: e.ts,
      estado: { clave: 'fondo', label: e.paso === 'integracion' ? (e.resultado === 'ok' ? 'Integración recuperada' : e.resultado === 'error' ? 'Aerolínea caída' : 'Sin integración') : e.resultado === 'ok' ? 'Webhook recibido' : 'Webhook rechazado', tono: e.resultado === 'ok' ? 'ok' : e.resultado === 'error' ? 'error' : 'aviso' },
    });
  }
  return casos.sort((a, b) => Date.parse(b.fin) - Date.parse(a.fin));
}

/** Embudo, indicadores y alertas sobre los casos (ya filtrados por pruebas). */
export function resumen(casos, eventos, { aerolineas = [], nombre = (c) => c, ahora = Date.now() } = {}) {
  const compras = casos.filter((c) => c.tipo === 'compra');
  const ids = new Set(casos.flatMap((c) => [...c.eventos, ...c.posventa].map((e) => e.seq)));
  const evs = eventos.filter((e) => ids.has(e.seq));
  const tiene = (c, p) => c.eventos.some((e) => e.paso === p && e.resultado !== 'error');
  const busquedas = evs.filter((e) => e.paso === 'busqueda').length;
  const embudo = [
    { id: 'busqueda', label: 'Búsquedas', n: busquedas },
    { id: 'hold', label: 'Eligió tarifa (hold)', n: compras.length },
    { id: 'asiento', label: 'Eligió asiento', n: compras.filter((c) => tiene(c, 'asiento')).length },
    { id: 'cobro', label: 'Pagó', n: compras.filter((c) => c.eventos.some((e) => e.paso === 'cobro' && e.resultado === 'ok')).length },
    { id: 'confirmada', label: 'Confirmada', n: compras.filter((c) => c.estado.clave === 'completada' || c.eventos.some((e) => e.paso === 'confirmada')).length },
  ];
  const suma = (p) => evs.filter((e) => e.paso === p && e.resultado === 'ok' && e.monto).reduce((s, e) => s + Number(e.monto), 0);
  const conHold = compras.length || 1;
  const fallidas = compras.filter((c) => c.estado.clave === 'fallo' || c.estado.clave === 'critico').length;
  const kpis = {
    confirmadas: embudo[4].n,
    cobrado: suma('cobro'),
    reembolsado: suma('reembolso'),
    abandonadas: compras.filter((c) => c.estado.clave === 'abandonada').length,
    enCurso: compras.filter((c) => c.estado.clave === 'curso').length,
    tasaError: compras.length ? fallidas / conHold : 0,
    duracionMediana: mediana(compras.map((c) => c.duracionMs)),
    checkins: evs.filter((e) => e.paso === 'checkin' && e.resultado === 'ok').length,
    cancelaciones: evs.filter((e) => e.paso === 'cancelacion' && e.resultado === 'ok').length,
  };

  // ── Alertas ──
  const alertas = [];
  for (const c of casos.filter((x) => x.estado.clave === 'critico')) {
    alertas.push({ nivel: 'critico', titulo: c.estado.label, texto: `${c.pnr ? `PNR ${c.pnr} · ` : ''}${c.cliente ?? 'cliente'} · ${c.estado.motivo ?? ''}`, casoId: c.id });
  }
  for (const a of aerolineas) {
    if (a.estado === 'CAIDA') alertas.push({ nivel: 'critico', titulo: `${a.nombre} caída`, texto: 'No responde al ping de integración (token + contrato).' });
    else if (a.estado === 'SIN_INTEGRACION') alertas.push({ nivel: 'aviso', titulo: `${a.nombre} sin integración`, texto: 'Responde, pero falla el token o el contrato.' });
  }
  // Lentitud: mediana de los últimos 30 min por aerolínea y paso.
  const UMBRAL = { hold: 5000, reserva_aerolinea: 8000, consulta: 5000, asiento: 6000, cobro: 10000 };
  const recientes = eventos.filter((e) => ahora - Date.parse(e.ts) < 30 * 60_000 && e.nodo && Number.isFinite(e.ms));
  const grupos = new Map();
  for (const e of recientes) {
    if (!UMBRAL[e.paso]) continue;
    const k = `${e.nodo}|${e.paso}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e.ms);
  }
  for (const [k, ms] of grupos) {
    const [nodo, paso] = k.split('|');
    const m = mediana(ms);
    if (ms.length >= 3 && m > UMBRAL[paso]) {
      alertas.push({ nivel: 'aviso', titulo: `${nombre(nodo)}: ${PASOS[paso]?.label.toLowerCase() ?? paso} lento`, texto: `Mediana ${(m / 1000).toFixed(1)} s en los últimos 30 min (${ms.length} llamadas; lo normal es menos de ${(UMBRAL[paso] / 1000).toFixed(0)} s).` });
    }
  }
  // Rechazos seguidos de check-in o cancelación por aerolínea (última hora).
  const rechazos = new Map();
  for (const e of eventos.filter((x) => ahora - Date.parse(x.ts) < 3_600_000 && (x.paso === 'checkin' || x.paso === 'cancelacion') && x.resultado !== 'ok')) {
    const k = `${e.nodo}|${e.paso}`;
    rechazos.set(k, (rechazos.get(k) ?? 0) + 1);
  }
  for (const [k, n] of rechazos) {
    const [nodo, paso] = k.split('|');
    if (n >= 3) alertas.push({ nivel: 'aviso', titulo: `${nombre(nodo)}: ${n} ${paso === 'checkin' ? 'check-ins' : 'cancelaciones'} rechazados en 1 h`, texto: 'Revisa el motivo en Operaciones.' });
  }
  if (eventos.some((e) => e.paso === 'webhook' && e.resultado === 'error' && ahora - Date.parse(e.ts) < 3_600_000)) {
    alertas.push({ nivel: 'aviso', titulo: 'Webhook con firma inválida', texto: 'Una aerolínea envió un webhook que no se pudo verificar (última hora).' });
  }
  alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1));
  return { embudo, kpis, alertas };
}

/** Tabla por aerolínea: por paso, éxitos, problemas y tiempos (mediana / p90). */
export const COLUMNAS_AEROLINEA = ['hold', 'asiento', 'consulta', 'cobro', 'reserva_aerolinea', 'checkin', 'cancelacion'];
export function porAerolinea(eventos, aerolineas = []) {
  const filas = new Map(aerolineas.map((a) => [a.codigo, { codigo: a.codigo, nombre: a.nombre, estado: a.estado, latencia: a.latenciaMs, pasos: {}, errores: [], cambios: [] }]));
  for (const e of eventos) {
    if (!e.nodo) continue;
    if (!filas.has(e.nodo)) filas.set(e.nodo, { codigo: e.nodo, nombre: e.nodo, pasos: {}, errores: [], cambios: [] });
    const f = filas.get(e.nodo);
    if (e.paso === 'integracion') { f.cambios.push(e); continue; }
    if (!COLUMNAS_AEROLINEA.includes(e.paso)) continue;
    const p = (f.pasos[e.paso] ??= { ok: 0, problemas: 0, ms: [] });
    if (e.resultado === 'ok') p.ok += 1; else p.problemas += 1;
    if (Number.isFinite(e.ms)) p.ms.push(e.ms);
    if (e.resultado !== 'ok') f.errores.push(e);
  }
  return [...filas.values()].map((f) => ({
    ...f,
    pasos: Object.fromEntries(Object.entries(f.pasos).map(([k, v]) => [k, { ok: v.ok, problemas: v.problemas, mediana: mediana(v.ms), p90: p90(v.ms) }])),
    errores: f.errores.slice(-5).reverse(),
    cambios: f.cambios.slice(-5).reverse(),
  }));
}
