/**
 * Barras tipo Gantt para una compra (semana 10: "el cuello de botella es la
 * barra más larga"). Cada paso de la traza se guarda al TERMINAR, con su
 * duración en `ms`; por eso la barra va de (ts - ms) a ts.
 * Función pura: se puede probar sin navegador.
 */
export function barrasGantt(eventos = []) {
  const barras = eventos
    .filter((e) => e.paso !== 'consulta' && Number.isFinite(e.ms) && e.ms > 0 && Number.isFinite(Date.parse(e.ts)))
    .map((e) => {
      const fin = Date.parse(e.ts);
      return { id: e.seq ?? `${e.paso}-${e.ts}`, paso: e.paso, nodo: e.nodo ?? null, resultado: e.resultado, durMs: e.ms, inicio: fin - e.ms, fin };
    })
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  if (!barras.length) return { total: 0, barras: [], masLarga: null };
  const t0 = Math.min(...barras.map((b) => b.inicio));
  const total = Math.max(...barras.map((b) => b.fin)) - t0;
  const conPos = barras.map((b) => ({ ...b, desdeMs: b.inicio - t0 }));
  const masLarga = conPos.reduce((m, b) => (b.durMs > m.durMs ? b : m), conPos[0]);
  return {
    total,
    barras: conPos,
    masLarga: { ...masLarga, pctDelTotal: total > 0 ? Math.round((masLarga.durMs / total) * 100) : 100 },
  };
}
