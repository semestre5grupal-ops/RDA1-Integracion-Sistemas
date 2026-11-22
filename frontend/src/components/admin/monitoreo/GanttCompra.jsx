import { barrasGantt } from './ganttCompra';
import { PASOS } from './modeloVuelos';

const T = { border: '#e3e6ea', text2: '#52514e', muted: '#898781', ok: '#0d7a2f', okBg: '#cfe9d6', bad: '#b42318', badBg: '#f9c9c4', warn: '#9a5b00', warnBg: '#fdf1dc' };
const seg = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

/**
 * Vista Gantt de una compra: el eje horizontal es el tiempo y cada fila un paso.
 * La barra más larga (roja) es el primer lugar donde buscar un cuello de botella.
 */
export function GanttCompra({ eventos, nombre = (c) => c, traceId }) {
  const { total, barras, masLarga } = barrasGantt(eventos);
  if (!barras.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }} aria-label="Gantt de la compra">
      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: T.text2 }}>⏱️ Dónde se fue el tiempo <span style={{ fontWeight: 500, color: T.muted }}>· total {seg(total)}</span></div>
      <div style={{ display: 'grid', gap: 4 }}>
        {barras.map((b) => {
          const esLarga = b.id === masLarga.id && barras.length > 1;
          const falla = b.resultado === 'error';
          const [fg, bg] = esLarga || falla ? [T.bad, T.badBg] : b.resultado === 'aviso' ? [T.warn, T.warnBg] : [T.ok, T.okBg];
          const izq = total > 0 ? (b.desdeMs / total) * 100 : 0;
          const ancho = Math.max(total > 0 ? (b.durMs / total) * 100 : 100, 1.5);
          return (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 190px) 1fr', gap: 8, alignItems: 'center', fontSize: '0.76rem' }}>
              <span style={{ color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {PASOS[b.paso]?.icon} {PASOS[b.paso]?.label ?? b.paso}{b.nodo ? ` · ${nombre(b.nodo)}` : ''}
              </span>
              <span style={{ position: 'relative', height: 18, background: '#f1f1ef', borderRadius: 4 }}>
                <span title={`${PASOS[b.paso]?.label ?? b.paso}: ${seg(b.durMs)}`}
                  style={{ position: 'absolute', left: `${Math.min(izq, 100 - ancho)}%`, width: `${ancho}%`, top: 0, bottom: 0, background: bg, border: `1px solid ${fg}`, borderRadius: 4, color: fg, fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 4, whiteSpace: 'nowrap', overflow: 'visible' }}>
                  {seg(b.durMs)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {barras.length > 1 && (
        <div style={{ fontSize: '0.76rem', color: T.bad }}>
          El paso más lento fue <b>{PASOS[masLarga.paso]?.label ?? masLarga.paso}</b>{masLarga.nodo ? ` (${nombre(masLarga.nodo)})` : ''}: {seg(masLarga.durMs)}, el {masLarga.pctDelTotal} % del tiempo total.
        </div>
      )}
      {traceId && <div style={{ fontSize: '0.7rem', color: T.muted, fontFamily: 'ui-monospace,Menlo,monospace', overflowWrap: 'anywhere' }}>trace_id: {traceId}</div>}
    </div>
  );
}
