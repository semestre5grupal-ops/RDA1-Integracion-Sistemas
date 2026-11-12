import { fechaLarga, hora, horaEmbarque, matrizCodigo } from './formatoVuelo';

/** Código de embarque dibujado en SVG (patrón determinista a partir del texto). */
export function CodigoEmbarque({ texto, tam = 96 }) {
  const m = matrizCodigo(texto);
  const n = m.length;
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${n + 2} ${n + 2}`} role="img" aria-label={`Código de embarque ${texto}`} shapeRendering="crispEdges">
      <rect width={n + 2} height={n + 2} fill="#fff" />
      {m.flatMap((fila, y) => fila.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" fill="#0f172a" /> : null)))}
    </svg>
  );
}

/**
 * Un pase de abordar (pasajero × tramo). `pase` sale de la aerolínea si lo
 * entrega (GET /boarding-passes); si no, se arma con los datos de la reserva.
 */
export function PaseAbordar({ pase }) {
  return (
    <div className="pa">
      <div className="pa-cab">
        <span>✈ {pase.aerolinea}</span>
        <span className="pa-tipo">Pase de abordar</span>
      </div>
      <div className="pa-cuerpo">
        <div className="pa-info">
          <div className="pa-nombre">{pase.pasajero}</div>
          <div className="pa-ruta">
            <div><b>{pase.origen}</b><small>{hora(pase.salida)}</small></div>
            <span aria-hidden="true">✈</span>
            <div><b>{pase.destino}</b><small>{hora(pase.llegada)}</small></div>
          </div>
          <div className="pa-grid">
            <div><span>Vuelo</span><b>{pase.vuelo}</b></div>
            <div><span>Fecha</span><b>{fechaLarga(pase.salida)}</b></div>
            <div><span>Asiento</span><b className="pa-grande">{pase.asiento || '—'}</b></div>
            <div><span>Embarque</span><b>{horaEmbarque(pase.salida)}</b></div>
            <div><span>Grupo</span><b>{pase.grupo || '—'}</b></div>
            <div><span>PNR</span><b className="pa-mono">{pase.pnr}</b></div>
          </div>
        </div>
        <div className="pa-codigo">
          <CodigoEmbarque texto={pase.codigo} />
          <small>{pase.desdeAerolinea ? 'Código de la aerolínea' : 'Presenta tu documento'}</small>
        </div>
      </div>
    </div>
  );
}

export const CSS_PASE = `
.pa{border:1px solid #dbe3ee;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 2px 10px rgba(0,53,128,.08)}
.pa-cab{display:flex;justify-content:space-between;align-items:center;background:#003580;color:#fff;padding:10px 14px;font-weight:700;font-size:.9rem}
.pa-tipo{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#c7d8f2}
.pa-cuerpo{display:flex;gap:14px;padding:14px;align-items:center}
.pa-info{flex:1;min-width:0}
.pa-nombre{font-weight:800;font-size:1rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;overflow-wrap:anywhere}
.pa-ruta{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.pa-ruta b{font-size:1.4rem;display:block;line-height:1}
.pa-ruta small{color:#64748b;font-size:.78rem}
.pa-ruta span{color:#006ce4}
.pa-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 10px}
.pa-grid span{display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600}
.pa-grid b{font-size:.88rem}
.pa-grande{font-size:1.2rem!important;color:#003580}
.pa-mono{font-family:ui-monospace,Menlo,monospace}
.pa-codigo{display:flex;flex-direction:column;align-items:center;gap:4px;border-left:2px dashed #dbe3ee;padding-left:14px}
.pa-codigo small{font-size:.66rem;color:#94a3b8;text-align:center;max-width:96px}
@media (max-width:480px){.pa-cuerpo{flex-direction:column}.pa-codigo{border-left:0;border-top:2px dashed #dbe3ee;padding:10px 0 0;width:100%}}
`;

/** PDF con un pase por página (jsPDF ya está en el proyecto). */
export async function descargarPasesPdf(pases, pnr) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [210, 99] });
  pases.forEach((p, i) => {
    if (i) doc.addPage([210, 99], 'landscape');
    doc.setFillColor(0, 53, 128);
    doc.rect(0, 0, 210, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${p.aerolinea}`, 8, 10.5);
    doc.setFontSize(9);
    doc.text('PASE DE ABORDAR · Booking', 202, 10.5, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(15);
    doc.text(String(p.pasajero).toUpperCase(), 8, 27);
    doc.setFontSize(26);
    doc.text(p.origen, 8, 42);
    doc.text(p.destino, 62, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(hora(p.salida), 8, 48);
    doc.text(hora(p.llegada), 62, 48);
    doc.setDrawColor(0, 108, 228);
    doc.setLineWidth(0.6);
    doc.line(40, 38.5, 56, 38.5);
    doc.line(53, 36.5, 56, 38.5);
    doc.line(53, 40.5, 56, 38.5);
    doc.setLineWidth(0.2);
    const campos = [
      ['VUELO', p.vuelo], ['FECHA', fechaLarga(p.salida)], ['ASIENTO', p.asiento || '—'],
      ['EMBARQUE', horaEmbarque(p.salida)], ['GRUPO', p.grupo || '—'], ['PNR', p.pnr],
    ];
    campos.forEach(([k, v], j) => {
      const x = 8 + (j % 3) * 48;
      const y = 62 + Math.floor(j / 3) * 16;
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(k, x, y);
      doc.setFontSize(k === 'ASIENTO' ? 14 : 11);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(String(v), x, y + 6);
      doc.setFont('helvetica', 'normal');
    });
    // Código de embarque
    const m = matrizCodigo(p.codigo);
    const lado = 52 / m.length;
    doc.setDrawColor(219, 227, 238);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(150, 20, 150, 95);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(15, 23, 42);
    m.forEach((fila, y) => fila.forEach((on, x) => { if (on) doc.rect(154 + x * lado, 26 + y * lado, lado, lado, 'F'); }));
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Presenta este pase y tu documento', 180, 86, { align: 'center' });
  });
  doc.save(`pase-abordar-${pnr || 'vuelo'}.pdf`);
}
