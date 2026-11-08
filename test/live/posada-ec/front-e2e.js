/**
 * Pruebas de punta a punta por el FRONTEND del Booking (código de main, el que está en producción),
 * con un navegador real, contra el gateway DESPLEGADO y Posada EC real.
 */
const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const C = require('./cliente.js');
const S = require('path').join(__dirname, 'resultados', 'front');
require('fs').mkdirSync(S, { recursive: true });
const FRONT = process.env.FRONT_URL || 'http://localhost:5173';
const HOTEL_B = 'pec-htl-1001';
const HOTEL_P = 'HTL-1001';
const TIPO_P = 'HABITACION_ESTANDAR';
const resultados = [];
const reservasBooking = new Set();
const ordenesPosada = [];

const anotar = (id, titulo, ok, detalle) => {
  resultados.push({ id, titulo, resultado: ok === null ? 'BLOQUEADO' : ok ? 'PASA' : 'FALLA', detalle });
  console.log(`${ok === null ? '⛔' : ok ? '✅' : '❌'} ${id} ${titulo}\n      ${detalle}`);
};
const libresPosada = async (ci, co) => (await C.posada.disponibilidad(HOTEL_P, ci, co)).opciones.find((o) => o.codigo === TIPO_P)?.remanentes;
const libresBooking = async (ci, co) => (await C.booking.disponibilidad(HOTEL_B, ci, co)).body?.available_rooms;

/** Abre la ficha, llena los dos pasos y pulsa «Completar reserva» (clics = 1 o 2). */
async function reservarPorFront(browser, { ci, co, tag, clics = 1, emailConfirm, telefono = '0991234567', captura }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const posts = [];
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' && /\/alojamientos\/[^/]+\/reservations$/.test(r.url())) {
      let body = null;
      try { body = await r.json(); } catch {}
      posts.push({ status: r.status(), body, key: r.request().headers()['idempotency-key'] });
      if (body?.reservation_id) reservasBooking.add(body.reservation_id);
    }
  });
  await page.goto(`${FRONT}/alojamientos/${HOTEL_B}?checkin=${ci}&checkout=${co}&group_adults=1&no_rooms=1`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: 'Aceptar todas' }).click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: /Reservaré/ }).first().click();
  const email = `qa.posada+${tag}@booking-pruebas.ec`;
  await page.fill('#chk-nombre', 'Prueba');
  await page.fill('#chk-apellidos', `Automatizada ${tag}`);
  await page.fill('#chk-email', email);
  await page.fill('#chk-confirm-email', emailConfirm ?? email);
  await page.fill('#chk-telefono', telefono);
  await page.getByRole('button', { name: /Siguiente: últimos datos/ }).click();
  await page.waitForTimeout(800);
  const enPaso2 = await page.locator('#chk-numero-tarjeta').isVisible().catch(() => false);
  if (!enPaso2) {
    const error = await page.locator('text=/coinciden|teléfono|introduce|completa/i').first().innerText().catch(() => '');
    if (captura) await page.screenshot({ path: `${S}/${captura}` });
    await page.close();
    return { paso2: false, error, posts };
  }
  await page.fill('#chk-titular', `Prueba Automatizada ${tag}`);
  await page.fill('#chk-numero-tarjeta', '4111 1111 1111 1111');
  await page.fill('#chk-caducidad', '12 / 30');
  await page.fill('#chk-cvc', '123');
  const boton = page.getByRole('button', { name: /Completar reserva/ });
  if (clics === 2) await boton.dblclick();
  else await boton.click();
  await page.waitForTimeout(6000);
  const pantalla = await page.locator('body').innerText();
  const codigo = (pantalla.match(/BKG-\d{6}/) || [])[0] || null;
  if (captura) await page.screenshot({ path: `${S}/${captura}` });
  await page.close();
  return { paso2: true, posts, codigo, confirmada: /confirmad|Reserva confirmada|¡Listo|Gracias/i.test(pantalla) };
}

(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });

  // U1 — Reserva normal por el front: ¿llega al hotel?
  {
    const ci = C.sumarDias(C.hoyGuayaquil(), 190), co = C.sumarDias(ci, 2);
    const p0 = await libresPosada(ci, co), b0 = await libresBooking(ci, co);
    const r = await reservarPorFront(browser, { ci, co, tag: 'u1front', captura: 'u1-confirmacion.png' });
    const p1 = await libresPosada(ci, co), b1 = await libresBooking(ci, co);
    const ok201 = r.posts.filter((p) => p.status === 201 || p.status === 200);
    anotar('U1a', 'El usuario reserva por el front y ve su confirmación', ok201.length === 1 && !!r.codigo, `POST /reservations → ${r.posts.map((p) => p.status).join(', ')}; código en pantalla ${r.codigo ?? '—'}; Booking libres ${b0} → ${b1}`);
    anotar('U1b', 'Esa reserva llega al hotel (Posada descuenta 1)', p1 === p0 - 1, `Posada libres ${p0} → ${p1}${p1 === p0 ? ' — el hotel NO se enteró' : ''}`);
  }

  // U2 — Caso del compañero por el front: se agota en la web del hotel y luego se reserva en el front
  {
    const ci = C.sumarDias(C.hoyGuayaquil(), 195), co = C.sumarDias(ci, 2);
    const p0 = await libresPosada(ci, co);
    const opc = (await C.posada.disponibilidad(HOTEL_P, ci, co)).opciones.find((o) => o.codigo === TIPO_P);
    const out = await C.crearOrdenPosada({ id: HOTEL_P, codigo: TIPO_P, checkin: ci, checkout: co, habitaciones: p0, adultos: p0, opcion: opc });
    if (out.ref?.orderId) ordenesPosada.push(out.ref.orderId);
    const p1 = await libresPosada(ci, co), bMuestra = await libresBooking(ci, co);
    const r = await reservarPorFront(browser, { ci, co, tag: 'u2front', captura: 'u2-sobreventa.png' });
    const vendio = r.posts.some((p) => p.status === 201 || p.status === 200);
    anotar('U2', 'Caso del compañero por el front: agotado en el hotel → el front no debe vender', p1 === 0 && !vendio, `hotel agotado (${p0} → ${p1}); el front mostraba ${bMuestra} libres; reserva por el front → ${r.posts.map((p) => p.status).join(', ') || 'sin POST'}${vendio ? ` → SOBREVENTA (${r.codigo})` : ''}`);
  }

  // U3 — Doble clic real en «Completar reserva»
  {
    const ci = C.sumarDias(C.hoyGuayaquil(), 200), co = C.sumarDias(ci, 2);
    const b0 = await libresBooking(ci, co);
    const r = await reservarPorFront(browser, { ci, co, tag: 'u3front', clics: 2, captura: 'u3-dobleclic.png' });
    const ok = r.posts.filter((p) => p.status === 201 || p.status === 200);
    const ids = new Set(ok.map((p) => p.body?.reservation_id));
    const b1 = await libresBooking(ci, co);
    anotar('U3', 'Doble clic en «Completar reserva» → una sola reserva', ids.size === 1, `peticiones enviadas ${r.posts.length} (claves distintas: ${new Set(r.posts.map((p) => p.key)).size}); reservas creadas ${ids.size}; Booking libres ${b0} → ${b1}`);
  }

  // U4 — Validaciones del formulario (sin llegar al backend)
  {
    const ci = C.sumarDias(C.hoyGuayaquil(), 205), co = C.sumarDias(ci, 2);
    const a = await reservarPorFront(browser, { ci, co, tag: 'u4a', emailConfirm: 'otro@correo.ec', captura: 'u4-correo.png' });
    anotar('U4a', 'Correos que no coinciden → el front no avanza', !a.paso2 && a.posts.length === 0, `avanzó al pago: ${a.paso2}; mensaje: «${(a.error || '').slice(0, 80)}»`);
    const b = await reservarPorFront(browser, { ci, co, tag: 'u4b', telefono: '', captura: 'u4-telefono.png' });
    anotar('U4b', 'Sin teléfono → el front no avanza', !b.paso2 && b.posts.length === 0, `avanzó al pago: ${b.paso2}; mensaje: «${(b.error || '').slice(0, 80)}»`);
  }

  // U5 — Reserva pasada por el front con fechas en el pasado (URL manipulada)
  {
    const ci = C.sumarDias(C.hoyGuayaquil(), -10), co = C.sumarDias(ci, 2);
    const r = await reservarPorFront(browser, { ci, co, tag: 'u5front', captura: 'u5-pasado.png' });
    const vendio = r.posts.some((p) => p.status === 201 || p.status === 200);
    anotar('U5', 'Fechas en el pasado (URL manipulada) → se rechaza', !vendio, `POST → ${r.posts.map((p) => `${p.status} ${p.body?.detail ?? ''}`.trim()).join(', ') || 'sin POST'}`);
  }

  await browser.close();

  // Limpieza: reservas de Booking (API) y órdenes directas en Posada
  let ok = 0;
  for (const id of reservasBooking) { const r = await C.booking.cancelar(id); if (r.status === 200) ok++; else console.log('  no se canceló en Booking', id, r.status); }
  for (const o of ordenesPosada) { const r = await C.posada.cancelar(o); if (r.status === 200) ok++; else console.log('  no se canceló en Posada', o, r.status); }
  console.log(`\nLimpieza: ${ok}/${reservasBooking.size + ordenesPosada.length} canceladas`);
  require('fs').writeFileSync(`${S}/${new Date().toISOString().replace(/[:.]/g, '-')}-front-e2e.json`, JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));
})();
