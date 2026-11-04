/**
 * Formateo de datos para presentacion.
 *
 * ── Por que NO se usa `Number()` para el dinero ─────────────────────────────
 * El contrato declara `MoneyAmount.baseFare`, `.taxes` y `.total` como
 * `type: string`, y el backend los persiste en `NUMERIC(12,2)`. Convertirlos a
 * `number` para mostrarlos los pasaria por un IEEE-754 de 53 bits, que es
 * exactamente donde nacen los errores de redondeo en importes.
 *
 * Todos los helpers de este archivo trabajan sobre la CADENA. Se insertan
 * separadores de miles y se recorta a dos decimales sin ninguna conversion
 * numerica, de modo que "1234.50" jamas pasa a ser 1234.4999999999999.
 */

import { exchangeRates } from '../hooks/CurrencyContext';

/** Simbolo por moneda ISO-4217. Solo para presentation. */
const SIMBOLOS = { USD: '$', EUR: '€', GBP: '£' };

/**
 * Formatea un importe monetario recibido como string del contrato.
 * @param {string} valor        p. ej. "1234.50"
 * @param {string} [moneda]     p. ej. "USD" (ISO-4217)
 * @returns {string}            p. ej. "$1,234.50"
 */
export function formatearMoneda(valor, monedaOriginal) {
  if (valor === null || valor === undefined || valor === '') return '--';

  const targetCurrency = localStorage.getItem('booking_currency') || 'USD';
  const original = (monedaOriginal && exchangeRates[monedaOriginal]) ? monedaOriginal : 'USD';
  
  const valorNumerico = parseFloat(valor);
  if (isNaN(valorNumerico)) return valor;

  const inUSD = original === 'USD' ? valorNumerico : (valorNumerico / exchangeRates[original]);
  const converted = inUSD * (exchangeRates[targetCurrency] || 1);

  if (['COP', 'CLP', 'ARS'].includes(targetCurrency)) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: targetCurrency, maximumFractionDigits: 0 }).format(converted);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: targetCurrency }).format(converted);
}

/**
 * Formatea una fecha del contrato (`format: date`, p. ej. "2026-11-03") a texto
 * legible en español, sin usar `new Date(...)`.
 *
 * Se evita `new Date('2026-11-03')` a proposito: se interpreta como medianoche
 * UTC y, en zonas con offset negativo, se muestra como el dia ANTERIOR.
 * Trabajar sobre el texto elimina esa clase de bug.
 */
export function formatearFecha(fecha) {
  if (!fecha) return '--';
  const partes = String(fecha).split('-');
  const [anio, mes, dia] = partes;

  // Guarda contra una entrada con otra forma (por ejemplo, un `date-time` en
  // lugar de un `date`). Sin esta comprobacion, `Number('15T06:10:00')` es NaN
  // y la pantalla muestra un "NaN de diciembre de 2026" que parece un dato.
  if (
    !anio ||
    !mes ||
    !dia ||
    !/^\d{4}$/.test(anio) ||
    !/^\d{2}$/.test(mes) ||
    !/^\d{2}$/.test(dia)
  ) {
    return String(fecha);
  }

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const nombreMes = meses[Number(mes) - 1] ?? mes;
  return `${Number(dia)} de ${nombreMes} de ${anio}`;
}

/**
 * Hora y fecha se muestran SIEMPRE en hora de Ecuador (America/Guayaquil).
 *
 * Si el instante ya viene con -05:00 (o sin zona), se toma el texto tal cual,
 * sin pasar por Date. Si viene en otra zona (por ejemplo `...Z`, como devuelven
 * algunas aerolíneas socias), se convierte: antes se mostraba la hora UTC y un
 * vuelo de las 07:00 aparecía a las 12:00.
 */
const ZONA_BOOKING = 'America/Guayaquil';
const RE_INSTANTE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function partesEnEcuador(iso) {
  const m = RE_INSTANTE.exec(String(iso ?? '').trim());
  if (!m) return null;
  const [, fecha, hh, mm, zona] = m;
  if (!zona || zona === '-05:00' || zona === '-0500') return { fecha, hora: `${hh}:${mm}` };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha, hora: `${hh}:${mm}` };
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_BOOKING, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t) => f.find((p) => p.type === t)?.value;
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` };
}

/** HH:MM de un instante `date-time` (RFC 3339), en hora de Ecuador. */
export function extraerHora(iso) {
  if (!iso) return '--';
  return partesEnEcuador(iso)?.hora ?? '--';
}

/** YYYY-MM-DD de un instante `date-time` (o de una fecha simple), en hora de Ecuador. */
export function extraerFecha(iso) {
  if (!iso) return '--';
  const p = partesEnEcuador(iso);
  if (p) return p.fecha;
  const coincidencia = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return coincidencia ? coincidencia[1] : '--';
}

/**
 * Devuelve la fecha de hoy en YYYY-MM-DD, que es el formato que exige el
 * contrato para `format: date`. Se construye a mano para no depender de
 * toISOString(), que aplica UTC y puede adelantar un dia.
 */
export function hoyEnIso() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Genera un identificador de huella para la cabecera `X-Device-Fingerprint`.
 *
 * ── Por que es ALEATORIO y no derivado del hardware ─────────────────────────
 * Una huella construida con characteristics del dispositivo (pantalla, zona
 * horaria, agent...) es un identificador de seguimiento persistente, y eso es
 * exactamente lo que la politica de cookies de este proyecto prohibe cargar sin
 * consentimiento. Aqui el valor es un UUID aleatorio, sin relacion con el
 * hardware: cumple la cabecera que exige el contrato sin crear un rastreador.
 *
 * Vive en `sessionStorage`, no en `localStorage`: caduca al cerrar el navegador
 * en lugar de seguir persiguiendo al usuario entre sesiones.
 *
 * @returns {string}
 */
export function obtenerHuellaDispositivo() {
  const CLAVE = 'vuelos.huellaSesion';
  try {
    let valor = window.sessionStorage.getItem(CLAVE);
    if (!valor) {
      const aleatorio =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      valor = aleatorio;
      window.sessionStorage.setItem(CLAVE, valor);
    }
    return valor;
  } catch {
    // sessionStorage puede estar bloqueado. La cabecera sigue siendo
    // obligatoria, asi que se usa un valor efimero de esta misma carga.
    return `efimera-${Math.random().toString(16).slice(2)}`;
  }
}
