/**
 * Cliente HTTP del Modulo de Vuelos.
 *
 * Consume los endpoints definidos en `contracts/vuelos-openapi.yaml` v1.5.0.0 a
 * traves de la instancia global `api` de `services/api.ts`, de modo que TODA
 * peticion hereda automaticamente el interceptor de JWT.
 *
 * Estado de implementacion: es el andamiaje de la Fase 4. Las firmas siguen el
 * contrato, pero la UI de busqueda, resultados y reserva todavia no existe.
 *
 * Reglas transversales respetadas aqui:
 *  · Los importes se reciben como `string` (el contrato declara
 *    `MoneyAmount` con `type: string`) y NO se convierten a `number`.
 *  · Los identificadores que el contrato declara como `format: uuid`
 *    (holdId, bookingId, quoteId, changeOfferId) se envian sin transformations.
 *  · Los que declara como `type: string` (offerId, itineraryId, segmentId,
 *    passengerId, ticketId) NO se tratan como UUID: son identificadores de
 *    negocio del GDS.
 */
import { api } from './api';
import { obtenerHuellaDispositivo } from './formato';

// ===========================================================================
// Un solo X-Correlation-Id por compra (trazabilidad RDA2)
// ===========================================================================
// Nace en la búsqueda y viaja en el mapa de asientos, el hold, el pago y la
// reserva: así Booking, MS_PAG y la aerolínea registran la MISMA compra con el
// mismo código, y el admin la sigue paso a paso en "Procesos → En vivo".
// Después de reservar se recuerda por bookingId (sessionStorage), para que la
// cancelación o los boletos de esa reserva sigan usando el mismo código.

let correlacionCompra: string | null = null;
const CLAVE_CORRELACIONES = 'booking.vuelos.correlaciones';

function nuevaCorrelacionCompra(): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  correlacionCompra = `corr-vuelo-${aleatorio}`;
  return correlacionCompra;
}

function leerCorrelaciones(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_CORRELACIONES) || '{}');
  } catch {
    return {};
  }
}

function recordarCorrelacion(bookingId: string, correlacion: string) {
  try {
    const mapa = leerCorrelaciones();
    mapa[bookingId] = correlacion;
    sessionStorage.setItem(CLAVE_CORRELACIONES, JSON.stringify(mapa));
  } catch {
    /* sin sessionStorage: la siguiente acción usará un código nuevo */
  }
}

function cabeceraCorrelacion(bookingId?: string): Record<string, string> {
  const id = (bookingId && leerCorrelaciones()[bookingId]) || correlacionCompra;
  return id ? { 'X-Correlation-Id': id } : {};
}

/** Correlation ID de la compra en curso (para mostrarlo al cliente o en soporte). */
export function correlacionDeCompraActual(): string | null {
  return correlacionCompra;
}

// ===========================================================================
// Tipos minimos del contrato
// ===========================================================================

export interface MoneyAmount {
  currency: string;
  baseFare?: string;
  taxes?: string;
  total: string;
}

export interface PassengerBreakdown {
  adults?: number;
  youths?: number;
  children?: number;
  infants?: number;
}

export interface SearchItinerary {
  origin: string;
  destination: string;
  departureDate: string;
}

export interface SearchRequest {
  itineraries: SearchItinerary[];
  passengers?: PassengerBreakdown;
}

/** Segmento de la respuesta de busqueda (`FlightSegment`). */
export interface FlightSegment {
  segmentId: string;
  flightNumber: string;
  departure: { iataCode: string; at: string; terminal: string | null };
  arrival: { iataCode: string; at: string; terminal: string | null };
  layoverMinutes?: number;
  marketingCarrier: string;
  operatingCarrier: string;
  aircraft?: string | null;
  durationMinutes?: number | null;
  status?: string | null;
}

/** Opcion de tarifa dentro de un itinerario (`CabinPricing`). */
export interface CabinPricing {
  cabinClass: string;
  fareBrand: string;
  availableSeats: number;
  fareRules: { isRefundable: boolean; isChangeable: boolean };
  baggageAllowance?: {
    personalItemIncluded?: boolean;
    carryOnIncluded?: number;
    checkedBaggageIncluded?: number;
  };
  pricePerPassengerType?: Array<{ passengerType: string; price: MoneyAmount }>;
}

export interface ItineraryOption {
  itineraryId: string;
  totalDurationMinutes: number;
  stopsCount: number;
  segments: FlightSegment[];
  pricingOptions: CabinPricing[];
}

export interface FlightOffer {
  offerId: string;
  airline: { code: string; name: string };
  itineraries: ItineraryOption[];
  grandTotal: MoneyAmount;
}

export interface SearchResponse {
  totalOffers: number;
  offers: FlightOffer[];
}

// ===========================================================================
// Busqueda (endpoint publico: `security: []`)
// ===========================================================================

/**
 * POST /search  —  NO existe `GET /offers` en el contrato.
 *
 * Se verificó en `contracts/vuelos-openapi.yaml` v1.5.0.0: las unicas rutas que
 * empiezan por `/offers` son `/offers/{offerId}/seatmap`, `/offers/hold` y
 * `/offers/hold/{holdId}`. La busqueda es `POST /search`, con cuerpo
 * `SearchRequest` y la cabecera obligatoria `X-Device-Fingerprint`.
 *
 * @param cuerpo       { itineraries: [{origin, destination, departureDate}], passengers }
 * @param fingerprint  valor de la cabecera X-Device-Fingerprint (ver
 *                     `formato.js` -> `obtenerHuellaDispositivo`)
 */
export async function buscarVuelos(cuerpo: SearchRequest, fingerprint: string) {
  // Cada búsqueda nueva empieza una compra nueva.
  const correlacion = nuevaCorrelacionCompra();
  const { data } = await api.post<SearchResponse>('/vuelos/search', cuerpo, {
    headers: { 'X-Device-Fingerprint': fingerprint, 'X-Correlation-Id': correlacion },
  });
  return data;
}

// ===========================================================================
// Mapa de asientos (endpoint publico)
// ===========================================================================

/**
 * GET /offers/{offerId}/seatmap?segmentId=...
 *
 * `offerId` y `segmentId` son `type: string` en el contrato: identificadores de
 * negocio, no UUID. Se interpolan sin validar como UUID.
 */
export async function obtenerMapaAsientos(offerId: string, segmentId: string, holdId?: string) {
  const { data } = await api.get(`/vuelos/offers/${encodeURIComponent(offerId)}/seatmap`, {
    // `holdId` lo usa Booking para no marcar como ocupados mis propios asientos; no va a la aerolínea.
    params: holdId ? { segmentId, holdId } : { segmentId },
    headers: cabeceraCorrelacion(),
  });
  return data;
}

// ---------------------------------------------------------------------------
// Bloqueo de asientos en tiempo real (propio de Booking, no es del contrato de
// la aerolínea): al elegir un asiento queda reservado para esta compra y los
// demás clientes lo ven ocupado.
// ---------------------------------------------------------------------------

export interface AsientoElegido {
  segmentId: string;
  seatNumber: string;
}

/**
 * PUT /offers/{offerId}/seat-locks — deja bloqueados exactamente estos asientos
 * para la compra `holdId` (los que ya no estén en la lista se sueltan).
 * Responde 409 `SEAT_TAKEN` con `taken` si alguno ya lo tiene otra compra.
 */
export async function bloquearAsientos(offerId: string, holdId: string, seats: AsientoElegido[], expiresAt?: string) {
  const { data } = await api.put(
    `/vuelos/offers/${encodeURIComponent(offerId)}/seat-locks`,
    { holdId, seats, expiresAt },
    { headers: cabeceraCorrelacion() },
  );
  return data as { locked: AsientoElegido[]; taken: AsientoElegido[]; expiresAt: string; ttlMinutes: number };
}

/** GET /offers/{offerId}/seat-locks — asientos que otras compras tienen bloqueados ahora. */
export async function consultarBloqueosAsientos(offerId: string, holdId: string) {
  const { data } = await api.get(`/vuelos/offers/${encodeURIComponent(offerId)}/seat-locks`, { params: { holdId } });
  return (data?.locks ?? []) as AsientoElegido[];
}

/** DELETE /offers/{offerId}/seat-locks — suelta los asientos de esta compra. */
export async function liberarAsientos(offerId: string, holdId: string) {
  await api.delete(`/vuelos/offers/${encodeURIComponent(offerId)}/seat-locks`, { params: { holdId } });
}

// ===========================================================================
// Hold (protegido: scope flights:hold)
// ===========================================================================

export interface HoldRequest {
  offerId: string;
  itinerarySelections: Array<{ itineraryId: string; cabinClass: string; fareBrand: string }>;
  passengersBreakdown?: PassengerBreakdown;
}

export interface HoldResponse {
  holdId: string;
  status: 'HELD';
  expiresAt: string;
  ttlMinutes: number;
  lockedPrice: MoneyAmount;
}

/**
 * POST /offers/hold
 *
 * El contrato exige la cabecera `Idempotency-Key` con `format: uuid`. El
 * generador se inyecta desde la capa de servicios para no acoplar este
 * archivo a una libreria concreta: la clave se genera una vez por intencion
 * de negocio, no por reintento.
 *
 * Se envia tambien `X-Device-Fingerprint` porque el backend la usa como
 * `blo_propietarioid` (el `sub` del JWT es de otro dominio). Sin ella, el
 * backend genera un propietario aleatorio y el hold quedaria sin dueno
 * recuperable.
 */
export async function crearHold(
  cuerpo: HoldRequest,
  idempotencyKey: string,
  fingerprint: string,
) {
  const { data } = await api.post<HoldResponse>('/vuelos/offers/hold', cuerpo, {
    headers: { 'Idempotency-Key': idempotencyKey, 'X-Device-Fingerprint': fingerprint, ...cabeceraCorrelacion() },
  });
  return data;
}

/** GET /offers/hold/{holdId} — `holdId` si es `format: uuid`. */
export async function consultarHold(holdId: string) {
  const { data } = await api.get(`/vuelos/offers/hold/${holdId}`);
  return data;
}

/** DELETE /offers/hold/{holdId} — libera el cupo antes de tiempo. */
export async function liberarHold(holdId: string) {
  await api.delete(`/vuelos/offers/hold/${holdId}`);
}

// ===========================================================================
// Reservas (protegido: scope flights:book)
// ===========================================================================

/**
 * POST /bookings
 *
 * Devuelve 201 (sincrono) o 202 (emision asincrona). En el caso 202 la reserva
 * existe pero el pasaje aun no: `status` llega como PENDING o TICKET_ISSUING y
 * `pnr` todavia es null. La UI debe reflejar ese estado, no un error.
 *
 * `Idempotency-Key` es OBLIGATORIA y se genera UNA vez por intencion de negocio,
 * no por reintento: sin ella, un doble clic en "Confirmar pago" crearia dos
 * reservas con dos PNR distintos sobre el mismo cupo. El backend la guarda 24h y
 * devuelve la reserva original si se repite.
 *
 * `X-Device-Fingerprint` se envia porque el backend la usa como propietario de
 * la reserva (el `sub` del JWT pertenece a otro dominio).
 */
export async function crearReserva(
  cuerpo: { holdId: string; passengers: unknown[]; payment: { paymentReference: string } },
  idempotencyKey: string,
  fingerprint: string,
) {
  const correlacion = cabeceraCorrelacion();
  const { data } = await api.post('/vuelos/bookings', cuerpo, {
    headers: {
      'Idempotency-Key': idempotencyKey,
      'X-Device-Fingerprint': fingerprint,
      ...correlacion,
    },
  });
  if (data?.bookingId && correlacion['X-Correlation-Id']) {
    recordarCorrelacion(data.bookingId, correlacion['X-Correlation-Id']);
  }
  return data;
}

// ===========================================================================
// Tipos de lectura de reservas
// ===========================================================================
// Van aqui, y no junto a cada funcion, porque los usan tanto las funciones de
// este archivo como las paginas que los importan.

export interface ReservaResumen {
  bookingId: string;
  pnr: string | null;
  status: string;
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  grandTotal: { currency: string; total: string };
}

export interface BookingSegment {
  segmentId: string;
  flightNumber: string;
  departureIataCode: string;
  departureAt: string;
  arrivalIataCode: string;
  arrivalAt: string;
  status?: string | null;
}

export interface BookingItinerary {
  itineraryId: string;
  order: number;
  totalDurationMinutes: number;
  stopsCount: number;
  segments: BookingSegment[];
}

export interface BookingPasajero {
  passengerId: string;
  passengerType: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  nationality: string;
  birthDate: string;
  gender: string;
  contact: { email: string; phone: string };
}

export interface TicketSegment {
  segmentId: string;
  status: string;
  couponNumber?: string | null;
  flightNumber?: string;
  departureIataCode?: string;
  departureAt?: string;
  arrivalIataCode?: string;
  arrivalAt?: string;
  /** Butaca asignada. Solo si la reserva se compro con `assignedSeats`. */
  seatNumber?: string | null;
}

export interface Ticket {
  ticketId: string;
  bookingId: string;
  /** Identificador de NEGOCIO del pasajero (`pax-1`), no el UUID de la fila. */
  passengerId: string;
  passengerName?: string;
  eTicketNumber?: string | null;
  status: string;
  issuedAt?: string | null;
  segments: TicketSegment[];
  failureReason?: string | null;
}

/**
 * Pase de abordar de `GET /bookings/{id}/boarding-passes`.
 *
 * NO es lo mismo que un `Ticket`: el ticket es el documento electronico y existe
 * desde la emision; el pase solo existe tras el check-in, y `pab_asiento` es NOT
 * NULL porque un pase sin butaca no sirve para nada. Por eso `checkedIn` viaja en la
 * respuesta: con la lista a solas, `[]` significaria "todavia no" y "el check-in
 * fallo" a la vez.
 *
 * `flightNumber`, las IATA y las horas son una extension documentada del contrato:
 * sin ellas la UI tiene que volver a `GET /bookings/{id}` para saber de donde sale
 * el vuelo.
 */
export interface BoardingPass {
  passengerId: string;
  segmentId: string;
  seat: string;
  boardingGroup?: string | null;
  boardingPosition?: string | null;
  barcode: string;
  barcodeType: 'AZTEC' | 'PDF417' | 'QR';
  flightNumber?: string;
  departureAt?: string;
  departureIataCode?: string;
  arrivalIataCode?: string;
  arrivalAt?: string;
  pnr?: string;
}

export interface BoardingPassList {
  bookingId: string;
  boardingPasses: BoardingPass[];
  checkedIn: boolean;
}

/** Un vuelo candidato del cambio de fecha. */
export interface DateChangeCandidate {
  segmentId: string;
  flightNumber: string;
  departureIataCode: string;
  arrivalIataCode: string;
  departureAt: string;
  arrivalAt: string;
  availableSeats: number;
}

/**
 * Importes del cambio de fecha. Todos `string`: el contrato declara `MoneyAmount`
 * con `type: string` y convertir a `number` meteria error de redondeo en el
 * display.
 */
export interface DateChangePriceDifference {
  fareDifference: string;
  taxDifference: string;
  changeFee: string;
  totalToPay: string;
}

export interface DateChangeOffer {
  changeOfferId: string;
  expiresAt: string;
  itineraryId: string;
  newDepartureDate: string;
  segments: DateChangeCandidate[];
  priceDifference: DateChangePriceDifference;
  currency: string;
}

/** Respuesta de la emision de boletos (`POST /bookings/{id}/tickets`). */
export interface TicketIssuance {
  bookingId: string;
  pnr: string;
  status: string;
  tickets: Ticket[];
  /**
   * Cuantos se crearon en ESTA llamada. Extension del endpoint de diseño: sin
   * ella, un reintento responderia 200 con la lista completa y el usuario no
   * distinguiria "ya estaban" de "se acaban de emitir".
   */
  issued: number;
}

export interface BaggageOption {
  passengerId: string;
  itineraryId: string;
  price: { currency: string; total: string };
  maxAllowed: number;
  alreadyPurchased: number;
}

/**
 * Cabecera de propietario para TODAS las llamadas, tambien las de lectura.
 *
 * `X-Device-Fingerprint` no es solo una cabecera de rate limit: el backend la
 * usa como `res_propietarioid` y `blo_propietarioid`, porque el `sub` del JWT
 * pertenece a otro dominio. **Sin ella la API responde 200 con la lista vacia**,
 * ya que genera un propietario aleatorio por peticion y no encuentra nada. Es el
 * fallo mas caro de esta API porque no parece un error: la pantalla dice
 * "todavia no tienes reservas" con total naturalidad.
 *
 * Se inyecta AQUI y no en las paginas para que ninguna llamada pueda olvidarla.
 * Pasarla como parametro obligaba a las tres funciones de lectura a recordarla, y
 * en la version anterior a esta linea no la recordaban: el listado salia vacio
 * mientras la reserva existia en la base.
 */
function cabecerasPropietario(bookingId?: string): Record<string, string> {
  return { 'X-Device-Fingerprint': obtenerHuellaDispositivo(), ...cabeceraCorrelacion(bookingId) };
}

/**
 * GET /bookings — listado paginado con cursor.
 *
 * Los filtros vacios se OMITEN del objeto antes de enviarlo. Sin esto, el
 * `select` de "Todos los estados" manda `?status=` y el backend lo trata como un
 * filtro presente (una cadena vacia que no casa con ninguna reserva) en lugar de
 * "sin filtro", y la lista sale vacia sin error visible.
 */
export async function listarReservas(params?: {
  pnr?: string;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  cursor?: string;
}) {
  // `Record<string, unknown>` y no `{}`: con `{}`, TypeScript no admite indexar
  // por una variable de tipo `string`, que es justo lo que hace este bucle.
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      limpio[clave] = valor;
    }
  }
  const { data } = await api.get('/vuelos/bookings', {
    params: limpio,
    headers: cabecerasPropietario(),
  });
  return data as { nextCursor: string | null; items: ReservaResumen[] };
}

/**
 * GET /bookings/{bookingId}/tickets
 *
 * Devuelve `tickets: []` cuando la reserva aun no tiene boletos emitidos. NO es
 * un error: "no emitido todavia" es un estado valido del flujo, y la UI tiene que
 * distinguirlo de "emitido y en PENDING" para no pintar un boarding pass vacio.
 */
export async function listarTickets(bookingId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/tickets`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as { bookingId: string; tickets: Ticket[] };
}

/**
 * GET /bookings/{bookingId}/baggage-options
 *
 * Un item por cada par pasajero x itinerario: el equipaje se compra por pasajero
 * y por trayecto, no por reserva.
 */
export async function listarOpcionesEquipaje(bookingId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/baggage-options`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as BaggageOption[];
}

/** GET /bookings/{bookingId} — detalle completo. */
export async function obtenerReserva(bookingId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as {
    bookingId: string;
    pnr: string;
    status: string;
    grandTotal: { currency: string; total: string };
    createdAt: string;
    updatedAt?: string;
    passengers: BookingPasajero[];
    itineraries?: BookingItinerary[];
    tickets: Ticket[];
  };
}

// ===========================================================================
// Estado de vuelo (endpoint publico)
// ===========================================================================

/**
 * GET /flights/{flightNumber}/status?date=YYYY-MM-DD
 *
 * Publico segun el contrato. `flightNumber` es `type: string`, no UUID.
 */
export async function consultarEstadoVuelo(flightNumber: string, fecha: string) {
  const { data } = await api.get(
    `/vuelos/flights/${encodeURIComponent(flightNumber)}/status`,
    { params: { date: fecha } },
  );
  return data;
}

// ===========================================================================
// Tipos de postventa (Fase 9)
// ===========================================================================

export interface CancellationQuote {
  quoteId: string;
  isRefundable: boolean;
  refundAmount: string;
  penaltyAmount: string;
  currency: string;
  expiresAt: string;
}

export interface CancelBookingResult {
  bookingId: string;
  pnr: string;
  status: 'CANCELLED' | 'CANCELLATION_PENDING';
  refundAmount: string;
  penaltyAmount: string;
  currency: string;
}

export interface CheckInResult {
  bookingId: string;
  status: string;
  checkedInPassengers: {
    passengerId: string;
    status: string;
    seatNumber?: string | null;
  }[];
}

export interface BaggageAdded {
  passengerId: string;
  itineraryId: string;
  totalBaggage: number;
  amountCharged?: string;
  currency?: string;
}

/**
 * GET /bookings/{bookingId}/cancellation-quote
 *
 * No altera el estado de la reserva, pero crea una cotizacion que caduca en 15
 * minutos. Pedirla dos veces seguidas devuelve dos `quoteId` distintos, y solo el
 * ultimo sirve para cancelar: cada uno queda en estado `VALID`, de modo que el
 * que se consuma deja al otro como huerfano. Por eso la UI la pide al MOSTRAR
 * el modal de confirmacion, no al enviarlo.
 */
export async function cotizarCancelacion(bookingId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/cancellation-quote`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as CancellationQuote;
}

/**
 * POST /bookings/{bookingId}/cancel
 *
 * `idempotencyKey` DEBE venir del llamador y ser el MISMO en los reintentos de
 * esa confirmacion. El backend guarda la respuesta de la primera llamada y la
 * reproduce en las siguientes, de modo que un doble clic no cancela dos veces.
 * Si la clave se generara dentro de esta funcion, cada clic seria una
 * operacion nueva y el doble clic cobraria dos veces.
 */
export async function cancelarReserva(
  bookingId: string,
  cuerpo: { quoteId: string; reason?: string },
  idempotencyKey: string,
) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/cancel`,
    cuerpo,
    {
      headers: { ...cabecerasPropietario(bookingId), 'Idempotency-Key': idempotencyKey },
    },
  );
  return data as CancelBookingResult;
}

/**
 * POST /bookings/{bookingId}/check-in
 *
 * No lleva `Idempotency-Key`: el `UNIQUE (chi_reservaid)` del DDL ya impide
 * dos check-ins por reserva, y el segundo intento responde 409 con un mensaje
 * claro. Anadir una clave de idempotencia aqui no aportaria nada.
 */
export async function hacerCheckIn(bookingId: string) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/check-in`,
    {},
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as CheckInResult;
}

/** POST /bookings/{bookingId}/baggage. Misma regla de idempotencia que `/cancel`. */
export async function agregarEquipaje(
  bookingId: string,
  cuerpo: {
    passengerId: string;
    itineraryId: string;
    quantity: number;
    payment: { paymentReference: string };
  },
  idempotencyKey: string,
) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/baggage`,
    cuerpo,
    {
      headers: { ...cabecerasPropietario(bookingId), 'Idempotency-Key': idempotencyKey },
    },
  );
  return data as BaggageAdded;
}

// ===========================================================================
// FASE 11 · Emision de billetes, ticket individual, pases y cambio de fecha
// ===========================================================================

/**
 * POST /bookings/{bookingId}/tickets — emite los boletos que falten.
 *
 * ── Ruta de DISEÑO, no del contrato ──────────────────────────────────────────
 * El contrato solo declara el `get` de `tickets`, pero sin emision nadie pasa de
 * `PENDING` a `CONFIRMED` con boleto, y el trigger `tg_reserva_transicion` no
 * admite volver a `TICKET_ISSUING` desde `CONFIRMED`: una reserva confirmada sin
 * boleto se queda sin boleto para siempre.
 *
 * ── Por que NO lleva `Idempotency-Key` ──────────────────────────────────────
 * El endpoint es idempotente por construccion (`UNIQUE (bol_reservaid,
 * bol_pasajeroid)`, y solo inserta los que faltan), asi que un doble clic
 * devuelve 200 con `issued: 0`. Exigir la cabecera obligaria al cliente a inventar
 * un UUID para conseguir un no-op. `issued` es lo que permite distinguirlo.
 */
export async function emitirTickets(bookingId: string) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/tickets`,
    {},
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as TicketIssuance;
}

/**
 * GET /bookings/{bookingId}/tickets/{ticketId}
 *
 * `ticketId` es el identificador de NEGOCIO del GDS (`TKT-A1B2C3D4E5F6`), NO un
 * UUID, y se manda con `encodeURIComponent` como cualquier `type: string` del
 * contrato.
 */
export async function obtenerTicket(bookingId: string, ticketId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/tickets/${encodeURIComponent(ticketId)}`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as Ticket;
}

/**
 * GET /bookings/{bookingId}/boarding-passes
 *
 * Devuelve 200 con `boardingPasses: []` y `checkedIn: false` cuando aun no hay
 * check-in. NO es un 404: "todavia no" es un estado valido del flujo, y la UI lo
 * pinta como una invitacion a hacer check-in, no como un error.
 */
export async function listarPases(bookingId: string) {
  const { data } = await api.get(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/boarding-passes`,
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as BoardingPassList;
}

/**
 * POST /bookings/{bookingId}/date-change/search
 *
 * NO muta la reserva: escribe una oferta `VALID` con 30 minutos de vigencia y
 * devuelve sus ids. Un array VACIO es una respuesta legitima (no hay vuelo con la
 * misma ruta en esa fecha, o no quedan asientos para todos los pasajeros), y la UI
 * tiene que distinguirlo de un error.
 */
export async function buscarCambioFecha(
  bookingId: string,
  cambios: { itineraryId: string; newDepartureDate: string }[],
) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/date-change/search`,
    { changes: cambios },
    { headers: cabecerasPropietario(bookingId) },
  );
  return data as DateChangeOffer[];
}

/**
 * POST /bookings/{bookingId}/date-change
 *
 * Si `cambioTotalAPagar > 0` el backend exige `payment.paymentReference` y
 * responde 422 `PAYMENT_REFERENCE_INVALID` si falta. Se manda SIEMPRE cuando hay
 * diferencia, aunque este modulo no la cobre: la referencia es de otra API de
 * pagos y mandarla evita el 422.
 *
 * `Idempotency-Key` es obligatoria: reapunta los segmentos y mueve la reserva dos
 * veces, y sin ella un doble clic aplicaria el cambio dos veces.
 */
export async function confirmarCambioFecha(
  bookingId: string,
  cuerpo: {
    changeOfferId: string;
    payment?: { paymentReference: string };
    assignedSeats?: { segmentId: string; seatNumber: string }[];
  },
  idempotencyKey: string,
) {
  const { data } = await api.post(
    `/vuelos/bookings/${encodeURIComponent(bookingId)}/date-change`,
    cuerpo,
    {
      headers: { ...cabecerasPropietario(bookingId), 'Idempotency-Key': idempotencyKey },
    },
  );
  return data as {
    bookingId: string;
    pnr: string;
    status: string;
    grandTotal: { currency: string; total: string };
    itineraries?: BookingItinerary[];
  };
}
