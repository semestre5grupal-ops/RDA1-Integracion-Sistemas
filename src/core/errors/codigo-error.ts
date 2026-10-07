import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Catalogo de errores de `ProblemDetails`, espejo de la tabla `codigo_error`.
 *
 * ── Por que NO se deduce el estado HTTP ──────────────────────────────────────
 * La primera version de este archivo traia un mapa escrito a mano
 * (`BOARDING_PASS_NOT_AVAILABLE -> 404`, `CHECK_IN_NOT_AVAILABLE -> 422`, ...)
 * y se equivocaba en 7 de los 24 codigos. La tabla `codigo_error` del DDL ya
 * dice el estado de cada uno, y `vuelos_schema.sql` es la fuente de verdad, asi
 * que aqui se copia. `probar-fase11.cjs` verifica la paridad y falla si divergen.
 *
 * ── Por que NO se consulta la tabla en caliente ───────────────────────────────
 * `codigo_error` es un catalogo estatico de 24 filas y el filtro de excepciones
 * se ejecuta en la ruta de error, donde una consulta fallida produciria un 500
 * en lugar del error que se queria reportar. El coste de un `SELECT` ahi no
 * compensa: el mapa de aqui es una copia verificada por test.
 *
 * ── `type` y `title` tambien salen de la tabla ───────────────────────────────
 * `cer_tipouri` (`urn:gds:error:seat-taken`) es el `type` que pide el contrato, y
 * `cer_titulo` ("Seat Already Taken") el `title`. Antes de la Fase 11 el filtro
 * emitia `https://httpstatuses.com/409`, que es un placeholder generico: dos
 * errores distintos con el mismo estado salian indistinguibles.
 *
 * ── Por que se llama `CodigoProblema` y no `CodigoError` ──────────────────────
 * `entities/codigo_error.entity.ts` ya exporta una clase `CodigoError` (la fila
 * de la tabla). Dos `enum`/clases con el mismo nombre en el mismo proyecto
 * obligan a_aliasar el import en cada archivo, que es como se mezclan dos
 * cosas distintas: la FILA del catalogo y el VALOR que se lanza.
 */
export enum CodigoProblema {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SEAT_TAKEN = 'SEAT_TAKEN',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  BOOKING_NOT_CONFIRMED = 'BOOKING_NOT_CONFIRMED',
  BAGGAGE_LIMIT_EXCEEDED = 'BAGGAGE_LIMIT_EXCEEDED',
  CUTOFF_PASSED = 'CUTOFF_PASSED',
  FARE_NOT_CHANGEABLE = 'FARE_NOT_CHANGEABLE',
  FLIGHT_ALREADY_DEPARTED = 'FLIGHT_ALREADY_DEPARTED',
  CHANGE_OFFER_EXPIRED = 'CHANGE_OFFER_EXPIRED',
  OFFER_NO_LONGER_AVAILABLE = 'OFFER_NO_LONGER_AVAILABLE',
  QUOTE_EXPIRED = 'QUOTE_EXPIRED',
  ALREADY_CANCELLED = 'ALREADY_CANCELLED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INFANT_SEAT_NOT_ALLOWED = 'INFANT_SEAT_NOT_ALLOWED',
  PAYMENT_REFERENCE_INVALID = 'PAYMENT_REFERENCE_INVALID',
  PAYMENT_NOT_AUTHORIZED = 'PAYMENT_NOT_AUTHORIZED',
  PNR_CREATION_FAILED = 'PNR_CREATION_FAILED',
  TICKET_ISSUANCE_FAILED = 'TICKET_ISSUANCE_FAILED',
  TICKET_ALREADY_ISSUED = 'TICKET_ALREADY_ISSUED',
  CHECK_IN_NOT_AVAILABLE = 'CHECK_IN_NOT_AVAILABLE',
  CHECK_IN_FAILED = 'CHECK_IN_FAILED',
  BOARDING_PASS_NOT_AVAILABLE = 'BOARDING_PASS_NOT_AVAILABLE',
  SEAT_CABIN_MISMATCH = 'SEAT_CABIN_MISMATCH',
  FLIGHT_STATUS_NOT_AVAILABLE = 'FLIGHT_STATUS_NOT_AVAILABLE',
  ROOM_NO_LONGER_AVAILABLE = 'ROOM_NO_LONGER_AVAILABLE',
  PRICE_CHANGED = 'PRICE_CHANGED',
  CANCELLATION_NOT_ALLOWED = 'CANCELLATION_NOT_ALLOWED',
}

/** Una fila de `codigo_error`: estado HTTP, `title` y `type` del contrato. */
interface EntradaCatalogo {
  estado: number;
  titulo: string;
  tipoUri: string;
}

/**
 * Estado, `title` y `type` de cada codigo, copiados de `codigo_error`.
 *
 * Se declara ANTES de `ApiProblemException` porque el constructor la consulta, y
 * una `const` de nivel de modulo todavia no existe cuando se ejecuta una clase
 * declarada por encima.
 */
export const CATALOGO_ERROR: Record<CodigoProblema, EntradaCatalogo> = {
  [CodigoProblema.VALIDATION_FAILED]: {
    estado: 400,
    titulo: 'Validation Failed',
    tipoUri: 'urn:gds:error:validation-failed',
  },
  [CodigoProblema.SEAT_TAKEN]: {
    estado: 409,
    titulo: 'Seat Already Taken',
    tipoUri: 'urn:gds:error:seat-taken',
  },
  [CodigoProblema.AMOUNT_MISMATCH]: {
    estado: 409,
    titulo: 'Amount Mismatch',
    tipoUri: 'urn:gds:error:amount-mismatch',
  },
  [CodigoProblema.BOOKING_NOT_CONFIRMED]: {
    estado: 409,
    titulo: 'Booking Not Confirmed',
    tipoUri: 'urn:gds:error:booking-not-confirmed',
  },
  [CodigoProblema.BAGGAGE_LIMIT_EXCEEDED]: {
    estado: 409,
    titulo: 'Baggage Limit Exceeded',
    tipoUri: 'urn:gds:error:baggage-limit-exceeded',
  },
  [CodigoProblema.CUTOFF_PASSED]: {
    estado: 409,
    titulo: 'Check-in Cutoff Passed',
    tipoUri: 'urn:gds:error:cutoff-passed',
  },
  [CodigoProblema.FARE_NOT_CHANGEABLE]: {
    estado: 409,
    titulo: 'Fare Not Changeable',
    tipoUri: 'urn:gds:error:fare-not-changeable',
  },
  [CodigoProblema.FLIGHT_ALREADY_DEPARTED]: {
    estado: 409,
    titulo: 'Flight Already Departed',
    tipoUri: 'urn:gds:error:flight-already-departed',
  },
  [CodigoProblema.CHANGE_OFFER_EXPIRED]: {
    estado: 410,
    titulo: 'Change Offer Expired',
    tipoUri: 'urn:gds:error:change-offer-expired',
  },
  [CodigoProblema.OFFER_NO_LONGER_AVAILABLE]: {
    estado: 410,
    titulo: 'Offer No Longer Available',
    tipoUri: 'urn:gds:error:offer-no-longer-available',
  },
  [CodigoProblema.QUOTE_EXPIRED]: {
    estado: 410,
    titulo: 'Cancellation Quote Expired',
    tipoUri: 'urn:gds:error:quote-expired',
  },
  [CodigoProblema.ALREADY_CANCELLED]: {
    estado: 409,
    titulo: 'Booking Already Cancelled',
    tipoUri: 'urn:gds:error:already-cancelled',
  },
  [CodigoProblema.RATE_LIMIT_EXCEEDED]: {
    estado: 429,
    titulo: 'Rate Limit Exceeded',
    tipoUri: 'urn:gds:error:rate-limit-exceeded',
  },
  [CodigoProblema.INFANT_SEAT_NOT_ALLOWED]: {
    estado: 422,
    titulo: 'Infant Seat Not Allowed',
    tipoUri: 'urn:gds:error:infant-seat-not-allowed',
  },
  [CodigoProblema.PAYMENT_REFERENCE_INVALID]: {
    estado: 422,
    titulo: 'Payment Reference Invalid',
    tipoUri: 'urn:gds:error:payment-reference-invalid',
  },
  [CodigoProblema.PAYMENT_NOT_AUTHORIZED]: {
    estado: 422,
    titulo: 'Payment Not Authorized',
    tipoUri: 'urn:gds:error:payment-not-authorized',
  },
  [CodigoProblema.PNR_CREATION_FAILED]: {
    estado: 422,
    titulo: 'PNR Creation Failed',
    tipoUri: 'urn:gds:error:pnr-creation-failed',
  },
  [CodigoProblema.TICKET_ISSUANCE_FAILED]: {
    estado: 422,
    titulo: 'Ticket Issuance Failed',
    tipoUri: 'urn:gds:error:ticket-issuance-failed',
  },
  [CodigoProblema.TICKET_ALREADY_ISSUED]: {
    estado: 409,
    titulo: 'Ticket Already Issued',
    tipoUri: 'urn:gds:error:ticket-already-issued',
  },
  [CodigoProblema.CHECK_IN_NOT_AVAILABLE]: {
    estado: 409,
    titulo: 'Check-in Not Available',
    tipoUri: 'urn:gds:error:checkin-not-available',
  },
  [CodigoProblema.CHECK_IN_FAILED]: {
    estado: 422,
    titulo: 'Check-in Failed',
    tipoUri: 'urn:gds:error:checkin-failed',
  },
  [CodigoProblema.BOARDING_PASS_NOT_AVAILABLE]: {
    estado: 409,
    titulo: 'Boarding Pass Not Available',
    tipoUri: 'urn:gds:error:boarding-pass-not-available',
  },
  [CodigoProblema.SEAT_CABIN_MISMATCH]: {
    estado: 422,
    titulo: 'Seat Cabin Mismatch',
    tipoUri: 'urn:gds:error:seat-cabin-mismatch',
  },
  [CodigoProblema.FLIGHT_STATUS_NOT_AVAILABLE]: {
    estado: 404,
    titulo: 'Flight Status Not Available',
    tipoUri: 'urn:gds:error:flight-status-not-available',
  },
  [CodigoProblema.ROOM_NO_LONGER_AVAILABLE]: {
    estado: 409,
    titulo: 'Room No Longer Available',
    tipoUri: 'urn:gds:error:room-no-longer-available',
  },
  [CodigoProblema.PRICE_CHANGED]: {
    estado: 409,
    titulo: 'Price Changed',
    tipoUri: 'urn:gds:error:price-changed',
  },
  [CodigoProblema.CANCELLATION_NOT_ALLOWED]: {
    estado: 409,
    titulo: 'Cancellation Not Allowed',
    tipoUri: 'urn:gds:error:cancellation-not-allowed',
  },
};

/** Un campo que fallo, con su motivo. Alimenta `invalidParams` del contrato. */
export interface InvalidParam {
  name: string;
  reason: string;
}

/**
 * Excepcion que conoce su `code`, y con el `type` y el `title` que le
 * corresponden.
 *
 * Se apoya en `HttpException`, asi que NestJS la sigue tratando como error
 * controlado y el filtro global la reconoce sin cambiar la arquitectura. El
 * estado se deduce del catalogo y se pasa al `super`, porque dentro del
 * constructor no se puede usar `this` y `getStatus()` no alcanza para que NestJS
 * serialice la respuesta.
 */
export class ProblemaApi extends HttpException {
  constructor(
    readonly codigo: CodigoProblema,
    detail: string,
    readonly invalidParams: InvalidParam[] = [],
  ) {
    const entrada = CATALOGO_ERROR[codigo];
    super({ message: detail, code: codigo, invalidParams }, entrada.estado);
  }

  /** El `type` del contrato, para que el filtro no tenga que buscarlo. */
  get tipoUri(): string {
    return CATALOGO_ERROR[this.codigo].tipoUri;
  }
}

/**
 * `code` por defecto para una excepcion que no lo trae.
 *
 * Una peticion que llego a una validacion de DTO es `VALIDATION_FAILED`, y un
 * 429 sin codigo es `RATE_LIMIT_EXCEEDED`. Un 404 y un 500 se quedan SIN `code`:
 * `codigo_error` no tiene un miembro generico "NOT_FOUND" ni uno de error
 * interno, y emitir un valor inventado haria que un cliente que valida el
 * esquema rechazase la respuesta, que es peor que no mandar el campo.
 */
export function codigoPorDefecto(status: number): CodigoProblema | null {
  if (status === HttpStatus.BAD_REQUEST) return CodigoProblema.VALIDATION_FAILED;
  if (status === HttpStatus.TOO_MANY_REQUESTS) return CodigoProblema.RATE_LIMIT_EXCEEDED;
  return null;
}

/**
 * `type` y `title` de un `code`, o `null` si la excepcion no lo trae.
 *
 * El filtro los usa para no repetir el catalogo: si la excepcion no tiene
 * `code`, se conservan los valores genericos por estado.
 */
export function presentacionDe(
  codigo: string | undefined,
): { tipoUri: string; titulo: string } | null {
  if (!codigo) return null;
  const entrada = CATALOGO_ERROR[codigo as CodigoProblema];
  if (!entrada) return null;
  return { tipoUri: entrada.tipoUri, titulo: entrada.titulo };
}

/** Constructores cortos para los `throw`, con la intencion a la vista. */
export const validacion = (detail: string, invalidParams: InvalidParam[] = []) =>
  new ProblemaApi(CodigoProblema.VALIDATION_FAILED, detail, invalidParams);

export const conflicto = (
  codigo: CodigoProblema,
  detail: string,
  invalidParams: InvalidParam[] = [],
) => new ProblemaApi(codigo, detail, invalidParams);

export const noProcesable = (codigo: CodigoProblema, detail: string) =>
  new ProblemaApi(codigo, detail);
