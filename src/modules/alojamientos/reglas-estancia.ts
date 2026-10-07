import { InvalidParam, validacion } from '../../core/errors/codigo-error';

/**
 * Reglas de negocio de una estancia, alineadas con cómo trabaja Booking.com:
 *
 * - Las fechas son días de calendario `YYYY-MM-DD` (sin hora): el check-in y el
 *   check-out los fija la política del alojamiento, no el cliente.
 * - El check-out debe ser POSTERIOR al check-in (mínimo 1 noche).
 * - Una reserva no puede superar las 30 noches (límite de Booking.com por
 *   reserva; estancias más largas se tratan como alquiler mensual).
 * - No se puede reservar ni cotizar una llegada que ya pasó (con un día de
 *   tolerancia por zona horaria: el "hoy" del alojamiento no es el de UTC).
 * - No se acepta una llegada a más de 500 días vista (Booking abre el inventario
 *   con ~16 meses de antelación).
 *
 * Las violaciones son errores del cliente: 400 `VALIDATION_FAILED` con
 * `invalidParams`, igual que el resto de errores de esquema de la API.
 */
export const MAX_NOCHES_POR_RESERVA = 30;
export const MAX_DIAS_ANTELACION = 500;

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_POR_DIA = 86_400_000;

/** `true` si `valor` es una fecha real en formato `YYYY-MM-DD` (rechaza 2026-02-30). */
export function esFechaCalendario(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !REGEX_FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/** Hoy como `YYYY-MM-DD` (UTC), desplazado `dias` días. */
export function fechaRelativa(dias = 0, base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Noches entre dos fechas `YYYY-MM-DD` válidas. */
export function calcularNoches(checkin: string, checkout: string): number {
  const inicio = Date.parse(`${checkin}T00:00:00Z`);
  const fin = Date.parse(`${checkout}T00:00:00Z`);
  return Math.round((fin - inicio) / MS_POR_DIA);
}

export interface OpcionesEstancia {
  /** Permite llegadas en el pasado (consultas de historial). Por defecto no. */
  permitirPasado?: boolean;
  /** Prefijo para `invalidParams` cuando las fechas van anidadas (`dates.checkin`). */
  prefijo?: string;
}

/**
 * Valida un par check-in/check-out y devuelve el número de noches.
 * Lanza 400 `VALIDATION_FAILED` con el campo exacto que falló.
 */
export function validarEstancia(
  checkin: unknown,
  checkout: unknown,
  opciones: OpcionesEstancia = {},
): number {
  const nombre = (campo: string) => (opciones.prefijo ? `${opciones.prefijo}.${campo}` : campo);
  const errores: InvalidParam[] = [];

  if (!esFechaCalendario(checkin)) {
    errores.push({ name: nombre('checkin'), reason: 'Debe ser una fecha válida con formato YYYY-MM-DD.' });
  }
  if (!esFechaCalendario(checkout)) {
    errores.push({ name: nombre('checkout'), reason: 'Debe ser una fecha válida con formato YYYY-MM-DD.' });
  }
  if (errores.length > 0) {
    throw validacion('Las fechas de la estancia no son válidas.', errores);
  }

  const llegada = checkin as string;
  const salida = checkout as string;
  const noches = calcularNoches(llegada, salida);

  if (noches < 1) {
    throw validacion('La fecha de salida debe ser posterior a la fecha de entrada.', [
      { name: nombre('checkout'), reason: 'Debe ser al menos un día después del check-in.' },
    ]);
  }
  if (noches > MAX_NOCHES_POR_RESERVA) {
    throw validacion(`La estancia no puede superar las ${MAX_NOCHES_POR_RESERVA} noches.`, [
      { name: nombre('checkout'), reason: `Máximo ${MAX_NOCHES_POR_RESERVA} noches por reserva.` },
    ]);
  }

  // "Hoy" depende de la zona horaria del alojamiento: en Ecuador (UTC-5) a las
  // 20:00 en UTC ya es mañana. Se tolera un día para no rechazar una llegada que
  // para el cliente es HOY; dos días atrás ya es pasado en cualquier zona.
  if (!opciones.permitirPasado && llegada < fechaRelativa(-1)) {
    throw validacion('La fecha de entrada no puede estar en el pasado.', [
      { name: nombre('checkin'), reason: 'Debe ser hoy o una fecha futura.' },
    ]);
  }
  if (llegada > fechaRelativa(MAX_DIAS_ANTELACION)) {
    throw validacion(`Solo se aceptan llegadas dentro de los próximos ${MAX_DIAS_ANTELACION} días.`, [
      { name: nombre('checkin'), reason: `Máximo ${MAX_DIAS_ANTELACION} días de antelación.` },
    ]);
  }

  return noches;
}

/**
 * Comprueba que el grupo cabe en las habitaciones pedidas. Booking no deja
 * reservar más huéspedes de los que admite la unidad: el alojamiento simplemente
 * no aparece como opción.
 */
export function validarCapacidad(
  alojamiento: { capacidadAdultos?: number; capacidadNinos?: number; habitaciones?: number },
  adultos: number,
  ninos: number,
  habitaciones: number,
): void {
  const errores: InvalidParam[] = [];
  const maxAdultos = (alojamiento.capacidadAdultos || 2) * habitaciones;
  const maxNinos = (alojamiento.capacidadNinos ?? 0) * habitaciones;

  if (adultos > maxAdultos) {
    errores.push({
      name: 'adultos',
      reason: `Máximo ${maxAdultos} adultos para ${habitaciones} habitación(es).`,
    });
  }
  if (ninos > 0 && ninos > maxNinos + Math.max(0, maxAdultos - adultos)) {
    errores.push({
      name: 'ninos',
      reason: `El alojamiento no tiene capacidad para ${ninos} niño(s) con ${habitaciones} habitación(es).`,
    });
  }
  if (errores.length > 0) {
    throw validacion('El número de huéspedes supera la capacidad del alojamiento.', errores);
  }
}
