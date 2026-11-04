import { jsPDF } from 'jspdf';

/**
 * Generación de la factura en PDF (compartida por descarga y envío por correo).
 *
 * Antes de extraerla, el layout vivía dentro de `descargarPDF` en
 * `MisReservasPage.jsx` y terminaba en `doc.save(...)`. Eso hacia imposible
 * reutilizarlo para el correo: `save` dispara la descarga y no devuelve nada, y
 * el flujo de correo necesita el MISMO PDF en memoria.
 *
 * Por eso el layout no llama a `save` ni a `output`: construye el `doc` y lo
 * devuelve. Cada consumidor decide que hacer con el resultado:
 *
 *   descargarFactura(reserva)        -> doc.save(...)   (dispara la descarga)
 *   facturaComoBase64(reserva)       -> doc.output(...) (para enviar por correo)
 *
 * Un solo generador garantiza que el archivo que descarga el usuario y el que
 * llega por correo son idénticos.
 *
 * ── `sanear` y por qué existe ────────────────────────────────────────────────
 * La fuente embebida de jsPDF es Latin-1: cualquier carácter fuera de `\x00-\xFF`
 * (em dash, tildes en forma compuesta, emojis, la flecha `→` de los títulos de
 * vuelo) se dibuja como un cuadrado vacío o rompe el PDF. `sanear` los quita en
 * lugar de fallar, que es lo que hacía el `replace` inline original.
 */

/** Quita lo que la fuente de jsPDF no sabe dibujar, y colapsa a un solo espacio. */
function sanear(texto) {
  return (texto ?? '')
    .toString()
    .replace(/[^\x00-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rellena con ceros a la izquierda, como `String.padStart` pero sin depender de él. */
/** Clave de acceso de 49 dígitos que exige el SRI. */
function generarClaveAcceso() {
  const digitos = Math.floor(Math.random() * 1e10)
    .toString()
    .padStart(10, '0');
  return `${digitos}${Date.now().toString()}`.replace(/\D/g, '').slice(0, 49).padEnd(49, '0');
}

/**
 * Construye el PDF de la factura y lo devuelve SIN emitirlo.
 *
 * @param {object} reserva Fila normalizada de `MisReservasPage` (`pnr`, `titulo`,
 *   `totalRaw`, `raw`, ...).
 * @returns {jsPDF} Documento listo para `save()` u `output()`.
 */
export function construirFacturaPdf(reserva) {
  const doc = new jsPDF();

  // ── Datos de la factura ─────────────────────────────────────────────────────
  const pnr = reserva.pnr || '000000';
  // Si el backend emitió la factura (vuelos con aerolíneas socias), se usan sus
  // datos: número, cliente, subtotal e impuestos guardados en la base.
  const fac = reserva.factura || reserva.raw?.factura || null;
  const pasajero = reserva.raw?.passengers?.[0];
  const nombreCliente = fac?.cliente?.nombre
    ? sanear(fac.cliente.nombre).toUpperCase()
    : pasajero
      ? sanear(`${pasajero.firstName} ${pasajero.lastName}`).toUpperCase()
      : 'CONSUMIDOR FINAL';
  const identificacion = fac?.cliente?.documento || pasajero?.documentNumber || '9999999999';
  const fechaCreacion = fac?.emitidaAt
    ? new Date(fac.emitidaAt).toLocaleDateString('es-EC')
    : reserva.raw?.createdAt
    ? new Date(reserva.raw.createdAt).toLocaleDateString('es-EC')
    : new Date().toLocaleDateString('es-EC');
  const cantidadPasajeros = reserva.raw?.passengers?.length || 1;

  // El total llega como `number` desde los endpoints, pero desde el totalizador
  // local puede venir como texto con símbolo de moneda: `parseFloat` deja el
  // primer grupo de dígitos y descarta el resto, que es justo lo que se quiere.
  const total = fac ? Number(fac.total) : parseFloat(String(reserva.totalRaw).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
  const subtotal = fac ? Number(fac.subtotal) : total / 1.15;
  const iva = fac ? Number(fac.impuestos) : total - subtotal;
  const etiquetaImpuestos = fac ? `IMPUESTOS Y TASAS ${Number(fac.impuestosPorcentaje).toFixed(2)}%` : 'IVA 15%';

  // Número: el de la factura emitida; si no hay (otras verticales), uno de demo
  // con el formato 001-002-XXXXXXXXX que usa el SRI.
  const numFactura = fac?.numero || Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const numeroAutorizacion = generarClaveAcceso();

  doc.setFont('helvetica', 'bold');

  // ── HEADER IZQUIERDA: datos de la empresa ───────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.roundedRect(15, 15, 90, 85, 3, 3);

  doc.setFontSize(16);
  doc.setTextColor(200, 0, 0);
  doc.text('BOOKING ECUADOR S.A.', 20, 25);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección Matriz:', 20, 40);
  doc.setFont('helvetica', 'normal');
  doc.text(sanear('Av. Naciones Unidas y Shyris, Quito'), 20, 45);

  doc.setFont('helvetica', 'bold');
  doc.text('Dirección Sucursal:', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(sanear('Malecón 2000, Guayaquil'), 20, 60);

  doc.setFont('helvetica', 'bold');
  doc.text(sanear('OBLIGADO A LLEVAR CONTABILIDAD:'), 20, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(sanear('SÍ'), 85, 85);

  // ── HEADER DERECHA: datos del comprobante ───────────────────────────────────
  doc.roundedRect(110, 15, 85, 85, 3, 3);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('R.U.C.:\t1722418520001', 115, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('FACTURA', 115, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(fac ? `No.\t${numFactura}` : `No.\t001-002-${numFactura}`, 115, 40);

  doc.text(sanear('NÚMERO DE AUTORIZACIÓN'), 115, 48);
  doc.setFontSize(7);
  doc.text(numeroAutorizacion, 115, 53);

  doc.setFontSize(9);
  doc.text(sanear('FECHA Y HORA DE'), 115, 60);
  doc.text(sanear('AUTORIZACIÓN:'), 115, 64);
  doc.text(sanear(new Date().toLocaleString('es-EC')), 155, 64);

  doc.text(sanear('AMBIENTE:'), 115, 72);
  doc.text(sanear('PRODUCCIÓN'), 155, 72);

  doc.text(sanear('EMISIÓN:'), 115, 78);
  doc.text(sanear('NORMAL'), 155, 78);

  doc.text(sanear('CLAVE DE ACCESO'), 115, 85);
  doc.setFontSize(7);
  doc.text(numeroAutorizacion.substring(0, 49), 115, 90);
  doc.setFontSize(9);

  // ── CLIENTE ────────────────────────────────────────────────────────────────
  doc.roundedRect(15, 105, 180, 25, 3, 3);

  doc.text(sanear('Razón Social / Nombres y Apellidos:'), 18, 112);
  doc.text(nombreCliente, 80, 112);

  doc.text(sanear('Identificación:'), 18, 118);
  doc.text(sanear(identificacion), 50, 118);

  doc.text(sanear('Fecha:'), 18, 124);
  doc.text(sanear(fechaCreacion), 50, 124);

  // ── DETALLE ────────────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.rect(15, 135, 180, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Cod. Principal', 17, 141);
  doc.text('Cant', 45, 141);
  doc.text(sanear('Descripción'), 60, 141);
  doc.text(sanear('Precio Unitario'), 125, 141);
  doc.text(sanear('Descuento'), 155, 141);
  doc.text(sanear('Precio Total'), 175, 141);

  doc.setFont('helvetica', 'normal');
  doc.rect(15, 145, 180, 15);
  doc.text(sanear(pnr), 17, 152);
  doc.text(sanear(cantidadPasajeros), 46, 152);
  // Descripción de la factura emitida (vuelos, PNR, pasajeros) en varias líneas
  // para que no invada las columnas de precio.
  const descripcion = sanear(fac?.descripcion || reserva.titulo);
  doc.text(doc.splitTextToSize(descripcion, 62).slice(0, 3), 60, 152);
  doc.text(subtotal.toFixed(2), 140, 152, { align: 'right' });
  doc.text('0.00', 165, 152, { align: 'right' });
  doc.text(subtotal.toFixed(2), 190, 152, { align: 'right' });

  // ── TOTALES ────────────────────────────────────────────────────────────────
  const yTotals = 165;
  doc.rect(125, yTotals, 70, 50);

  const lineas = [
    { label: fac ? 'SUBTOTAL' : 'SUBTOTAL 15%', val: subtotal.toFixed(2) },
    { label: 'SUBTOTAL 0%', val: '0.00' },
    { label: 'SUBTOTAL NO OBJETO DE IVA', val: '0.00' },
    { label: 'SUBTOTAL SIN IMPUESTOS', val: subtotal.toFixed(2) },
    { label: 'TOTAL DESCUENTO', val: '0.00' },
    { label: 'ICE', val: '0.00' },
    { label: etiquetaImpuestos, val: iva.toFixed(2) },
    { label: 'VALOR TOTAL', val: total.toFixed(2) },
  ];

  lineas.forEach((linea, index) => {
    const yt = yTotals + 5 + index * 6;
    if (index > 0) {
      doc.line(125, yt - 4, 195, yt - 4);
    }
    if (index === lineas.length - 1) doc.setFont('helvetica', 'bold');
    doc.text(sanear(linea.label), 127, yt);
    doc.text(linea.val, 190, yt, { align: 'right' });
  });

  // Forma de pago
  doc.rect(15, yTotals, 90, 15);
  doc.setFont('helvetica', 'bold');
  doc.text(sanear('Forma de pago'), 35, yTotals + 5);
  doc.text(sanear('Valor'), 85, yTotals + 5);
  doc.line(15, yTotals + 7, 105, yTotals + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(sanear('01 - SIN UTILIZACION DEL SISTEMA FINANCIERO'), 17, yTotals + 12);
  doc.text(total.toFixed(2), 100, yTotals + 12, { align: 'right' });

  // Orden de Booking (la que recibe la aerolínea en salesChannel.partnerOrderId)
  // y notas de crédito emitidas por reembolsos.
  let yExtra = yTotals + 22;
  doc.setFontSize(8);
  if (fac?.partnerOrderId) {
    doc.text(sanear(`Orden Booking: ${fac.partnerOrderId}`), 17, yExtra);
    yExtra += 5;
  }
  for (const nc of fac?.notasCredito ?? []) {
    doc.text(sanear(`Nota de crédito ${nc.numero}: -${Number(nc.monto).toFixed(2)} USD`), 17, yExtra);
    yExtra += 5;
  }

  return doc;
}

/** Genera el PDF y lo descarga como `Factura_<PNR>.pdf`. */
export function descargarFactura(reserva) {
  construirFacturaPdf(reserva).save(`Factura_${reserva.pnr || 'reserva'}.pdf`);
}

/**
 * Genera el PDF y lo devuelve como Base64 pelado, SIN el prefijo `data:...`.
 *
 * `output('datauristring')` devuelve un data URL completo, y no el Base64 solo:
 *
 *     data:application/pdf;filename=undefined;base64,JVBERi0xLjQK...
 *
 * Ese prefijo es lo que uno esperaría de un `<img src>` en el navegador, no lo que
 * un endpoint de correo quiere: son 50 caracteres de ruido en el JSON, y su
 * `filename=undefined` es directamente engañoso. Se recorta buscando la primera
 * coma en lugar de por un literal exacto porque el prefijo lo compone jsPDF y
 * puede cambiar entre versiones; lo que no cambia es que el Base64 es lo que va
 * detrás de esa coma.
 *
 * El backend también recorta el prefijo si llega, así que el recorte del cliente no
 * es lo que hace que funcione: es para que el payload sea lo que dice ser.
 *
 * @param {object} reserva Misma forma que `construirFacturaPdf`.
 * @returns {string} Base64 del PDF. Medido: ~17 KB con el layout real de la app.
 */
export function facturaComoBase64(reserva) {
  const dataUrl = construirFacturaPdf(reserva).output('datauristring');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
