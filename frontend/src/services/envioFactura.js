import emailjs from '@emailjs/browser';
import { supabase } from './supabase';
import { api } from './api';
import { facturaComoBase64 } from '../utils/facturaPdf';

/**
 * Envío automático de la factura al completar una compra.
 *
 * ── Por qué un servicio y no llamar a `enviarFacturaPorCorreo` en cada flujo ──
 * Los tres puntos de compra (vuelos, autos, atracciones) tenían su propio bloque
 * de EmailJS, y cada uno construía el correo a su manera. Al sustituirlo por la
 * factura en PDF, si cada flujo montara su propio payload, volvería a haber tres
 * versiones de "qué es una factura" que divergen con el tiempo.
 *
 * Este módulo es el ÚNICO sitio que sabe traducir "una compra" a "una factura", y
 * los tres flujos solo describen lo que compraron.
 *
 * ── Por qué NO se espera al resultado ─────────────────────────────────────────
 * La compra ya está confirmada cuando aquí se llama. Si el envío se.awaitara y
 * fallara, el usuario vería un error sobre una compra que SÍ se hizo, y
 *相对于 su it'd podría cancelarla: el peor resultado posible. Peor aún, Gmail
 * tarda 1-3 s y ese tiempo se sumaría al spinner de "reservando…".
 *
 * Por eso NO se espera al resultado con `await`: la compra ya está confirmada
 * cuando esta función se invoca. Si el envío se esperara y fallara, el usuario
 * vería un error sobre una compra que SÍ se hizo, y desde ahí podría cancelarla:
 * el peor resultado posible. Gmail tarda 1-3 s y ese tiempo además se sumaría al
 * spinner de "reservando…".
 *
 * Se genera el PDF, se manda y se registra el resultado. Un fallo de SMTP no
 * revierte la compra ni interrumpe la navegación.
 *
 * ── Por qué se genera el PDF AQUÍ y no en el servidor ─────────────────────────
 * El layout vive en el navegador (`utils/facturaPdf.js`) y es el mismo que usa
 * el botón de descarga de Mis Reservas. Reconstruirlo en Node exigiría portar
 * jsPDF con sus fuentes embebidas, y el archivo que descarga el usuario dejaría
 * de ser idéntico al que llega por correo.
 */

/** Nombre legible del servicio, para el `concepto` del correo. */
const ETIQUETA_SERVICIO = {
  vuelo: 'Vuelo',
  auto: 'Renta de auto',
  atraccion: 'Atracción',
  alojamiento: 'Alojamiento',
};

/**
 * Convierte el importe de una compra a `number`.
 *
 * Los tres flujos entregan el total en formatos legibles pero distintos: los
 * endpoints de vuelos lo mandan como `number`, el contrato lo declara `string`
 * (`MoneyAmount.total`) y autos y atracciones usan `.toFixed(2)`. Todos son
 * formatos de MÁQUINA, así que basta con quitar cualquier carácter no numérico
 * y usar el punto como separador decimal.
 *
 * ── Lo que NO hace, a propósito ───────────────────────────────────────────────
 * No interpreta cadenas formateadas para personas. `"$1.234,56"` devuelve `1.234`,
 * no `1234.56`: un separador de miles se confundiría con un decimal y el importe
 * sería 1000 veces menor. La alternativa (detectar cuál de `.` o `,` es el decimal
 * según cuál aparezca último) es la correcta para texto de la interfaz, pero ese
 * texto no llega aquí: quien formatea es `formato.js` para PINTAR, y el PDF usa
 * el importe crudo.
 *
 * Si algún día un flujo empezara a pasar el total ya formateado, el síntoma sería
 * una factura con un importe mil veces menor, y lo correcto sería arreglar el
 * origen del flujo, no ampliar este parser.
 */
function aNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (valor == null) return 0;

  const n = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Arma el objeto que `construirFacturaPdf` espera, a partir de los datos de la
 * compra.
 *
 * El generador lee `reserva.pnr`, `reserva.titulo`, `reserva.totalRaw` y
 * `reserva.raw.{createdAt, passengers}` — la misma forma que normaliza
 * `MisReservasPage` al listar. Se construye aquí con esos nombres para que el PDF
 * sea idéntico en ambos caminos.
 *
 * @param {object} datos
 * @param {'vuelo'|'auto'|'atraccion'|'alojamiento'} datos.tipo
 * @param {string} datos.pnr      Código de reserva (o el id si no hay PNR).
 * @param {string} [datos.titulo] Concepto; si falta se usa la etiqueta del tipo.
 * @param {number|string} datos.total Importe pagado.
 * @param {Array}  [datos.pasajeros] Para el bloque "Razón Social" del PDF.
 * @param {string} [datos.creadaEn] ISO de creación, para la fecha del comprobante.
 *
 * Se exporta para que se pueda probar sin levantar el navegador: es la parte que
 * decide si el PDF sale con los datos correctos, y eso no necesita ni React ni
 * la red.
 */
export function normalizar(datos) {
  const etiqueta = ETIQUETA_SERVICIO[datos.tipo] ?? 'Reserva';

  return {
    pnr: datos.pnr || '000000',
    titulo: datos.titulo || etiqueta,
    // Factura real emitida por el backend (número, cliente, subtotal, impuestos).
    factura: datos.factura ?? null,
    totalRaw: aNumero(datos.total),
    raw: {
      createdAt: datos.creadaEn || new Date().toISOString(),
      passengers: (datos.pasajeros ?? []).map((p) => ({
        firstName: p.firstName ?? p.nombre ?? '',
        lastName: p.lastName ?? p.apellido ?? '',
        documentNumber: p.documentNumber ?? p.documento ?? p.cedula ?? '',
      })),
    },
  };
}

/**
 * Genera la factura y la envía al correo del usuario. No lanza nunca.
 *
 * @param {object} datos Misma forma que `normalizar`.
 * @returns {Promise<{enviado: boolean, motivo?: string}>} Para registrar o
 *   mostrar el resultado. Nunca rechaza.
 */
export async function enviarFacturaTrasCompra(datos) {
  try {
    const reserva = normalizar(datos);
    
    // Extraer correo del usuario actual para el envío
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email || datos.pasajeros?.[0]?.email;
    const userName = session?.user?.user_metadata?.nombre || session?.user?.user_metadata?.full_name || datos.pasajeros?.[0]?.firstName || 'Cliente';

    if (!userEmail) {
      console.warn('[Factura] No hay correo destino disponible para enviar la confirmación.');
      return { enviado: false, motivo: 'No hay correo destino' };
    }

    // 1) Factura en PDF adjunta, enviada por el backend al correo de la sesión.
    //    Si el servidor no tiene SMTP configurado (503) o no hay sesión (401),
    //    se manda la confirmación por EmailJS como antes.
    try {
      await api.post('/facturas/enviar', {
        pdfBase64: facturaComoBase64(reserva),
        pnr: String(reserva.pnr).slice(0, 40),
        concepto: String(reserva.factura?.descripcion || reserva.titulo).slice(0, 200),
      });
      console.log(`[Factura] PDF ${reserva.factura?.numero ?? ''} enviado a ${userEmail} (PNR ${reserva.pnr})`);
      return { enviado: true, via: 'pdf' };
    } catch (e) {
      console.warn(`[Factura] Envío del PDF no disponible (HTTP ${e?.response?.status ?? '?'}); se usa EmailJS.`);
    }

    const templateParams = {
      to_email: userEmail,
      to_name: userName,
      pnr: reserva.pnr,
      service_name: reserva.titulo,
      total_price: `$${reserva.totalRaw.toFixed(2)} USD`,
    };

    const response = await emailjs.send(
      'service_gc9gkdc',
      'template_nlbgw3v',
      templateParams,
      'vZyuTrdLeGeWrTWLe'
    );

    console.log(
      `[Factura] Confirmación enviada a ${userEmail} por EmailJS (PNR ${reserva.pnr})`, response.status, response.text
    );
    return { enviado: true, via: 'emailjs' };
  } catch (err) {
    console.warn(
      `[Factura] No se pudo enviar el comprobante por EmailJS (PNR ${datos?.pnr}). ` +
      `La reserva sigue confirmada. Error:`, err
    );
    return { enviado: false, motivo: err?.message };
  }
}
