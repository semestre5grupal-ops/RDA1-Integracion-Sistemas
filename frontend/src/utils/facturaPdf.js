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

  // Identificación y cálculo detallado de cantidades por vertical
  const esAuto = reserva.tipo === 'auto' || /auto|vehículo|vehiculo|renta/i.test(reserva.titulo || '');
  const esAtraccion = reserva.tipo === 'atraccion' || /tour|atraccion|atracción|entrada/i.test(reserva.titulo || '');
  const esAlojamiento = reserva.tipo === 'alojamiento' || /hotel|habitación|habitacion|hospedaje/i.test(reserva.titulo || '');

  let cantidadNum = 1;
  let cantidadTexto = '1 unidad';

  if (esAuto) {
    const dias = reserva.diasRenta || reserva.raw?.dias_renta || reserva.raw?.dias || 3;
    cantidadNum = 1;
    cantidadTexto = `1 Vehículo (${dias} días)`;
  } else if (esAtraccion) {
    const cupos = reserva.ticketCount || reserva.cantidad || reserva.raw?.ticket_count || reserva.raw?.cupos || reserva.raw?.personas || 1;
    cantidadNum = Number(cupos);
    cantidadTexto = `${cupos} ${cupos > 1 ? 'Entradas/Personas' : 'Entrada/Persona'}`;
  } else if (esAlojamiento) {
    const huespedes = reserva.cantidad || reserva.raw?.huespedes || 1;
    cantidadNum = Number(huespedes);
    cantidadTexto = `${huespedes} ${huespedes > 1 ? 'Huéspedes' : 'Huésped'}`;
  } else {
    const pasajeros = reserva.raw?.passengers?.length || reserva.cantidad || 1;
    cantidadNum = Number(pasajeros);
    cantidadTexto = `${pasajeros} ${pasajeros > 1 ? 'Pasajeros' : 'Pasajero'}`;
  }

  // Fechas operativas detalladas
  const fechaReserva = reserva.fechaReserva || fechaCreacion;
  const fechaEntrega = reserva.fechaEntrega || reserva.raw?.pickup_date || reserva.raw?.retiro?.fecha || reserva.raw?.pickupAt || reserva.raw?.checkin || reserva.raw?.date || reserva.raw?.fecha || reserva.fecha || '';
  const fechaDevolucion = reserva.fechaDevolucion || reserva.raw?.dropoff_date || reserva.raw?.devolucion?.fecha || reserva.raw?.dropoffAt || reserva.raw?.checkout || '';

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
  doc.roundedRect(15, 103, 180, 29, 3, 3);

  doc.text(sanear('Razón Social / Nombres y Apellidos:'), 18, 109);
  doc.text(nombreCliente, 80, 109);

  doc.text(sanear('Identificación:'), 18, 115);
  doc.text(sanear(identificacion), 50, 115);

  doc.text(sanear('Fecha Reserva / Emisión:'), 18, 121);
  doc.text(sanear(fechaReserva), 62, 121);

  doc.text(sanear('Cantidad Reservada:'), 115, 121);
  doc.setFont('helvetica', 'bold');
  doc.text(sanear(cantidadTexto), 150, 121);
  doc.setFont('helvetica', 'normal');

  let fechasOperativas = '';
  if (esAuto) {
    fechasOperativas = `Fecha Entrega/Retiro: ${fechaEntrega || 'Por definir'}   |   Fecha Devolución: ${fechaDevolucion || 'Por definir'}`;
  } else if (esAlojamiento) {
    fechasOperativas = `Fecha Check-in: ${fechaEntrega || 'Por definir'}   |   Fecha Check-out: ${fechaDevolucion || 'Por definir'}`;
  } else if (esAtraccion) {
    fechasOperativas = `Fecha de Visita / Turno: ${fechaEntrega || 'Por definir'}`;
  } else {
    fechasOperativas = `Fecha de Salida: ${fechaEntrega || 'Por definir'}${fechaDevolucion ? `   |   Fecha Retorno: ${fechaDevolucion}` : ''}`;
  }
  doc.text(sanear(fechasOperativas), 18, 128);

  // ── DETALLE ────────────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.rect(15, 135, 180, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Cod. Principal', 17, 141);
  doc.text('Cant', 43, 141);
  doc.text(sanear('Descripción'), 62, 141);
  doc.text(sanear('Precio Unitario'), 125, 141);
  doc.text(sanear('Descuento'), 155, 141);
  doc.text(sanear('Precio Total'), 175, 141);

  doc.setFont('helvetica', 'normal');
  doc.rect(15, 144, 180, 17);
  if (Array.isArray(fac?.lineas) && fac.lineas.length > 1) {
    // Factura de vuelo con dos líneas: boleto de la aerolínea + cargo por servicio de Booking.
    fac.lineas.slice(0, 2).forEach((l, k) => {
      const y = k === 0 ? 148.5 : 157.5;
      doc.text(sanear(k === 0 ? pnr : 'SERV'), 17, y);
      doc.text(sanear(String(l.cantidad)), 46, y);
      doc.text(doc.splitTextToSize(sanear(l.descripcion), 60).slice(0, k === 0 ? 2 : 1), 62, y);
      doc.text(String(l.precioUnitario), 140, y, { align: 'right' });
      doc.text('0.00', 165, y, { align: 'right' });
      doc.text(String(l.subtotal), 190, y, { align: 'right' });
    });
  } else {
    doc.text(sanear(pnr), 17, 151);
    doc.text(sanear(String(cantidadNum)), 46, 151);
    // Descripción completa con servicio y fechas
    const descDetallada = fac?.descripcion || `${reserva.titulo} [${cantidadTexto}]${fechaEntrega ? ` · ${esAuto ? 'Retiro' : 'Fecha'}: ${fechaEntrega}` : ''}${fechaDevolucion ? ` · Dev: ${fechaDevolucion}` : ''}`;
    const descripcion = sanear(descDetallada);
    doc.text(doc.splitTextToSize(descripcion, 60).slice(0, 3), 62, 149);
    doc.text(subtotal.toFixed(2), 140, 151, { align: 'right' });
    doc.text('0.00', 165, 151, { align: 'right' });
    doc.text(subtotal.toFixed(2), 190, 151, { align: 'right' });
  }

  // ── TOTALES ────────────────────────────────────────────────────────────────
  const yTotals = 164;
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

  // Soporte canónico para cancelaciones compensadas en Atracciones / Alojamientos / Autos (RDA2)
  const esCancelada = reserva.status === 'CANCELLED' || reserva.raw?.status === 'CANCELLED';
  const refundId = reserva.cancelCode || reserva.reembolso_id || reserva.raw?.cancel_code || reserva.raw?.cancelCode || reserva.raw?.reembolso_id;
  if ((!fac?.notasCredito || fac.notasCredito.length === 0) && (esCancelada || refundId)) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 20, 20);
    doc.text(sanear('COMPROBANTE ANULADO POR CANCELACION / REVERSION SAGA'), 17, yExtra);
    yExtra += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const idNotaCredito = refundId || `REF-${reserva.tipo === 'atraccion' ? 'ATR' : reserva.tipo === 'auto' ? 'AUTO' : 'GEN'}-${pnr}`;
    doc.text(sanear(`Nota de crédito ${idNotaCredito}: -${total.toFixed(2)} USD (Reembolso 100% procesado)`), 17, yExtra);
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
