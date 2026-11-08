// Prueba de estrés de idempotencia y concurrencia contra un socio (usa cliente.js de la suite).
// Uso: POSADA_BASE_URL=... POSADA_API_KEY=... node estres.js "<nombre>"
const C = require('./cliente.js');
const { posada, uuid, money } = C;
const nombre = process.argv[2] || 'socio';
const creadas = [];
const ref = (r) => C.refDeOrden(r);

async function opcionCon(rango, ventanaDias) {
  const checkin = C.sumarDias(C.hoyGuayaquil(), ventanaDias);
  const checkout = C.sumarDias(checkin, 2);
  const { hoteles } = await posada.listarHoteles(60);
  for (const h of hoteles.slice(0, 20)) {
    const { opciones } = await posada.disponibilidad(h.id, checkin, checkout);
    const o = opciones.find((x) => Number.isFinite(x.remanentes) && x.remanentes >= rango[0] && x.remanentes <= rango[1]);
    if (o) return { h, o, checkin, checkout };
  }
  return null;
}
async function cuerpo(v) {
  const cot = await posada.cotizar({ id: v.h.id, codigo: v.o.codigo, checkin: v.checkin, checkout: v.checkout });
  const c = cot.body?.data && !Array.isArray(cot.body.data) ? cot.body.data : cot.body || {};
  return posada.cuerpoOrden({ id: v.h.id, codigo: v.o.codigo, checkin: v.checkin, checkout: v.checkout, total: money(c.precioTotalCotizado) || v.o.precioTotal });
}
const libres = async (v) => (await posada.disponibilidad(v.h.id, v.checkin, v.checkout)).opciones.find((x) => x.codigo === v.o.codigo)?.remanentes;

(async () => {
  const res = { socio: nombre };
  // 1) 10 clics simultáneos con la MISMA clave y el MISMO cuerpo.
  const v1 = await opcionCon([2, 99], 150);
  if (!v1) res.dobleClic = 'BLOQUEADO: sin cupo';
  else {
    const antes = await libres(v1);
    const body = await cuerpo(v1);
    const idem = uuid();
    const rs = await Promise.all(Array.from({ length: 10 }, () => posada.crearOrden(body, { idem })));
    const ids = new Set(rs.map((r) => ref(r)?.orderId).filter(Boolean));
    rs.forEach((r) => { const x = ref(r); if (x?.orderId && !creadas.includes(x.orderId)) creadas.push(x.orderId); });
    const despues = await libres(v1);
    const estados = rs.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
    res.dobleClic = { ordenesDistintas: ids.size, habitacionesDescontadas: antes - despues, estados, veredicto: ids.size === 1 && antes - despues === 1 ? 'PASA' : 'FALLA' };
  }
  // 2) 6 clientes distintos a la vez por la ÚLTIMA habitación.
  const v2 = await opcionCon([1, 6], 160);
  if (!v2) res.carrera = 'BLOQUEADO: sin un tipo con 1–6 libres';
  else {
    let n = await libres(v2);
    for (let i = 0; i < n - 1; i++) {
      const r = await posada.crearOrden(await cuerpo(v2), { idem: uuid() });
      const x = ref(r);
      if (x?.orderId) creadas.push(x.orderId);
    }
    const quedaba = await libres(v2);
    const body = await cuerpo(v2);
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => posada.crearOrden({ ...body, huespedTitular: C.titular(`estres${i}`) }, { idem: uuid() })));
    const ok = rs.filter((r) => r.status === 201 || r.status === 200);
    ok.forEach((r) => { const x = ref(r); if (x?.orderId) creadas.push(x.orderId); });
    const final = await libres(v2);
    const estados = rs.reduce((m, r) => ((m[`${r.status}${C.codigo(r) ? ' ' + C.codigo(r) : ''}`] = (m[`${r.status}${C.codigo(r) ? ' ' + C.codigo(r) : ''}`] || 0) + 1), m), {});
    res.carrera = { libresAntesDeLaCarrera: quedaba, confirmadas: ok.length, libresAlFinal: final, estados, veredicto: quedaba === 1 && ok.length === 1 ? 'PASA' : 'FALLA' };
  }
  // Limpieza
  const limp = await Promise.all(creadas.map((id) => posada.cancelar(id).then((r) => r.status)));
  res.limpieza = `${limp.filter((s) => s === 200).length}/${creadas.length} canceladas`;
  console.log(JSON.stringify(res, null, 2));
})();
