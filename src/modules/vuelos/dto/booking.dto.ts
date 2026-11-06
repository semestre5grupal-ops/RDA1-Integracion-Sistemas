/**
 * DTOs de `POST /vuelos/bookings` (Reservas y Emisión de tickets).
 *
 * Reflejan `BookingRequest`, `PassengerItem` y `PaymentReference` del contrato
 * v1.5.0.0.
 *
 * ── Lo que el contrato prohíbe explícitamente ────────────────────────────────
 * La descripción del endpoint dice: *"El ownerId/customerId se extrae
 * exclusivamente del JWT y no es aceptado como dato controlado por el cliente"*,
 * y `BookingRequest` declara `additionalProperties: false`. Por eso NO existe un
 * campo de propietario en el DTO: el `ValidationPipe` global corre con
 * `forbidNonWhitelisted: true`, así que un cliente que envíe `ownerId` recibe un
 * 400 en lugar de que el valor se ignore en silencio.
 *
 * ── `PaymentReference` es solo una REFERENCIA ────────────────────────────────
 * Esta API "no procesa tarjetas, 3DS, autorización ni captura": el
 * `paymentReference` es el identificador que devolvió otra API de pagos. No hay
 * ningún campo de número de tarjeta en el contrato, y añadirlo aquí sería
 * inventar un endpoint de cobro que no existe y, de paso, meter datos
 * financieros en este servicio.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const TIPOS_PASAJERO = ['ADULT', 'YOUTH', 'CHILD', 'INFANT'] as const;
export const TIPOS_DOCUMENTO = ['PASSPORT', 'NATIONAL_ID'] as const;
export const GENEROS = ['M', 'F', 'X'] as const;

/** `NATIONAL_ID` solo tiene sentido con un numero de documento propio. */
const REGEX_DOCUMENTO = /^[A-Z0-9][A-Z0-9-]{3,19}$/;

/** Telefono: 7 a 20 digitos, con `+` opcional. El DDL solo exige no-vacio. */
const REGEX_TELEFONO = /^\+?[0-9]{7,20}$/;

/** Nacionalidad en formato ISO-3166-1 alfa-3. El DDL exige `^[A-Z]{3}$`. */
const REGEX_NACIONALIDAD = /^[A-Z]{2,3}$/; // contrato v2: ISO alfa-2 (EC); se acepta alfa-3 por compatibilidad

/**
 * `PassengerItem.assignedSeats[]` y `SeatAssignment` del contrato: un par
 * segmento/asiento por pasajero.
 *
 * El nombre lo fija `postventa.dto.ts` (que la importa para los endpoints de
 * equipajes), de modo que esta clase es la fuente unica para ambos DTO.
 *
 * Va declarada ANTES que `PassengerDetailDto` a proposito: los decoradores de
 * Swagger se evaluan al declarar la clase, no de forma perezosa, y si esta
 * estuviera mas abajo `@ApiProperty({ type: [SeatAssignmentDto] })` receberia
 * `undefined` y la app no arrancaria con
 * `A circular dependency has been detected (property key: "segmentId")`.
 */
export class SeatAssignmentDto {
  @ApiProperty({ example: 'SG-770de505' })
  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @ApiProperty({ example: '1A' })
  @IsString()
  @IsNotEmpty()
  seatNumber: string;
}

/**
 * `PassengerItem.contact`.
 *
 * El DDL de `pasajero` hace `pas_email` y `pas_telefono` **NOT NULL**, y
 * `pas_email` tiene ademas un `CHECK (~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')`. Por eso
 * no son opcionales aqui: se pedirian en el contrato y fallarian en la base con
 * un 500, cuando el error correcto es un 400.
 */
export class ContactInfoDto {
  @ApiProperty({ example: 'ana.perez@example.com' })
  @IsEmail({}, { message: 'El correo no tiene un formato valido.' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '+593991234567' })
  @Matches(REGEX_TELEFONO, { message: 'El telefono debe tener entre 7 y 20 digitos.' })
  phone: string;
}

/**
 * `PassengerItem`.
 *
 * `passengerId` es un identificador de NEGOCIO elegido por el cliente (permite
 * reintentar la misma reserva sin duplicarla a nivel de passengers), mientras
 * que `id_pasajero` es la PK `uuid` que genera PostgreSQL. No se confunden.
 */
export class PassengerDetailDto {
  @ApiProperty({ example: 'pax-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  passengerId: string;

  @ApiProperty({ enum: TIPOS_PASAJERO, example: 'ADULT' })
  @IsIn(TIPOS_PASAJERO)
  passengerType: string;

  /**
   * `associatedAdultId` es OBLIGATORIO para `INFANT` y PROHIBIDO para el resto.
   *
   * No se valida con un `@ValidateIf` porque el DDL lo impone como equivalencia
   * bidireccional:
   *     CHECK ((pas_tipo = 'INFANT') = (pas_adultoasociadoid IS NOT NULL))
   * Es decir, no basta con exigirlo cuando es INFANT: tambien prohibe mandarlo
   * en un ADULT. Cualquier otra forma deja que la validacion pase y reviente la
   * base con un 500.
   */
  @ApiPropertyOptional({ example: 'pax-1', description: 'Obligatorio solo si passengerType es INFANT' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  associatedAdultId?: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'Perez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @ApiProperty({ enum: TIPOS_DOCUMENTO, example: 'NATIONAL_ID' })
  @IsIn(TIPOS_DOCUMENTO)
  documentType: string;

  @ApiProperty({ example: '1712345678' })
  @Matches(REGEX_DOCUMENTO, {
    message: 'El documento debe tener entre 4 y 20 caracteres alfanumericos.',
  })
  documentNumber: string;

  @ApiProperty({ example: 'ECU' })
  @Matches(REGEX_NACIONALIDAD, {
    message: 'La nacionalidad debe ser un codigo ISO de 2 letras en mayusculas (ej. EC).',
  })
  nationality: string;

  @ApiPropertyOptional({ example: '2031-05-14', description: 'format: date' })
  @IsOptional()
  @IsISO8601({ strict: false })
  documentExpiryDate?: string;

  /** `format: date` (YYYY-MM-DD). El DDL exige que sea <= CURRENT_DATE. */
  @ApiProperty({ example: '1990-03-22', description: 'format: date' })
  @IsISO8601({ strict: false })
  birthDate: string;

  @ApiProperty({ enum: GENEROS, example: 'F' })
  @IsIn(GENEROS)
  gender: string;

  @ApiProperty({ type: ContactInfoDto })
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contact: ContactInfoDto;

  /**
   * `assignedSeats[]` se PERSISTE desde la Fase 11: se ocupa el asiento en
   * `asiento_vuelo` y se guarda la fila en `asiento_asignado` dentro de la misma
   * transaccion que crea la reserva.
   *
   * Antes se aceptaba y se ignoraba, con la nota de que "la asignacion es un
   * endpoint posterior". Eso dejaba el boarding pass inalcanzable por el flujo
   * normal: `pase_abordar.pab_asiento` es NOT NULL y el check-in lee el asiento de
   * `asiento_asignado`, asi que sin estas filas `GET /bookings/{id}/boarding-passes`
   * solo podia devolver una lista vacia.
   *
   * `extraBaggage[]` sigue sin persistirse: `equipaje_pasajero` necesita la
   * reserva emitida y la compra de maletas tiene su propio endpoint
   * (`POST /bookings/{id}/baggage`), que es donde se compra de verdad.
   *
   * `type: [SeatAssignmentDto]` lleva la CLASE, no un objeto literal. Poner
   * `type: [{ segmentId: 'string', seatNumber: 'string' }]` parece equivalente y
   * no lo es: Swagger interpreta cada elemento del array como un constructor de
   * tipo, recibe un objeto plano e intenta "construir" `segmentId`, se mete en un
   * bucle y la APLICACION NO ARRANCA con
   * `A circular dependency has been detected (property key: "segmentId")`.
   * Ni `tsc` ni `npm run build` lo detectan; solo se ve al construir `/api/docs`.
   */
  @ApiPropertyOptional({
    type: [SeatAssignmentDto],
    description: 'Se ocupa el asiento en la misma transaccion que crea la reserva.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatAssignmentDto)
  assignedSeats?: SeatAssignmentDto[];
}

/** `PaymentReference`: solo el identificador, devuelto por la Payment API. */
export class PaymentReferenceDto {
  @ApiProperty({ example: 'pay_01HZX9K2QWERTY' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  paymentReference: string;
}

export class BookingRequestDto {
  /** `format: uuid` del contrato: es el `id_bloqueo_cupo`. */
  @ApiProperty({ format: 'uuid', example: '34564f95-03c7-4374-aa4a-04b097baff84' })
  @IsUUID('4', { message: 'holdId debe ser un UUID.' })
  holdId: string;

  @ApiProperty({ type: [PassengerDetailDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un pasajero.' })
  // 9 es el maximo de plazas de un Boeing 777-300; es el techo comercial, no
  // uno arbitrario.
  @ArrayMaxSize(9, { message: 'No se admiten mas de 9 pasajeros por reserva.' })
  @ValidateNested({ each: true })
  @Type(() => PassengerDetailDto)
  passengers: PassengerDetailDto[];

  @ApiProperty({ type: PaymentReferenceDto })
  @ValidateNested()
  @Type(() => PaymentReferenceDto)
  payment: PaymentReferenceDto;
}

// ===========================================================================
// RESPUESTA
// ===========================================================================

/**
 * `BookingDetail` del contrato, en la forma que devuelve `POST /bookings`.
 *
 * `tickets[]` se devuelve VACIO a proposito: la emision de tickets es el
 * endpoint siguiente (`POST /bookings/{bookingId}/tickets`) y el propio contrato
 * admite respuesta `202` cuando la emision continua en segundo plano. Anadir
 * aqui un `ticketId` inventado seria peor que devolverlo vacio.
 */
export class BookingPassengerDto {
  @ApiProperty({ example: 'pax-1' })
  passengerId: string;

  @ApiProperty({ enum: TIPOS_PASAJERO })
  passengerType: string;

  @ApiProperty({ example: 'Ana' })
  firstName: string;

  @ApiProperty({ example: 'Perez' })
  lastName: string;

  @ApiProperty({ enum: TIPOS_DOCUMENTO })
  documentType: string;

  @ApiProperty({ example: '1712345678' })
  documentNumber: string;

  @ApiProperty({ example: 'ECU' })
  nationality: string;

  @ApiProperty({ example: '1990-03-22' })
  birthDate: string;

  @ApiProperty({ enum: GENEROS })
  gender: string;

  @ApiProperty({ type: ContactInfoDto })
  contact: ContactInfoDto;
}

export class BookingSegmentDto {
  @ApiProperty({ example: 'SG-770de505' })
  segmentId: string;

  @ApiProperty({ example: 'LA4041' })
  flightNumber: string;

  @ApiProperty({ example: 'GYE' })
  departureIataCode: string;

  @ApiProperty({ format: 'date-time' })
  departureAt: string;

  @ApiProperty({ example: 'LIM' })
  arrivalIataCode: string;

  @ApiProperty({ format: 'date-time' })
  arrivalAt: string;

  @ApiPropertyOptional({ nullable: true })
  status?: string | null;
}

export class BookingItineraryDto {
  @ApiProperty({ example: 'IT-0-770de505' })
  itineraryId: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: 235 })
  totalDurationMinutes: number;

  @ApiProperty({ example: 0 })
  stopsCount: number;

  @ApiProperty({ type: [BookingSegmentDto] })
  segments: BookingSegmentDto[];
}

export class BookingDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookingId: string;

  /**
   * `res_pnr`, `UNIQUE` y con `CHECK (~ '^[A-Z0-9]{6}$')`. Este es el
   * identificador que ve el usuario.
   */
  @ApiProperty({ example: 'K7QX2M' })
  pnr: string;

  @ApiProperty({ enum: ['PENDING', 'PENDING_PAYMENT', 'TICKET_ISSUING', 'CONFIRMED', 'FAILED', 'CHANGE_PENDING', 'CANCELLATION_PENDING', 'CANCELLED'] })
  status: string;

  @ApiProperty({ example: { currency: 'USD', baseFare: '0.00', taxes: '0.00', total: '0.00' } })
  grandTotal: {
    currency: string;
    baseFare?: string;
    taxes?: string;
    total: string;
  };

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;

  @ApiProperty({ type: [BookingPassengerDto] })
  passengers: BookingPassengerDto[];

  /**
   * `ItineraryOption[]` reconstruido desde `reserva_itinerario` y
   * `reserva_segmento`, para que la respuesta sea autocontenida y el frontend no
   * tenga que volver a pedir la oferta.
   */
  @ApiPropertyOptional({ type: [BookingItineraryDto] })
  itineraries?: BookingItineraryDto[];

  /** Vacio: la emision es un endpoint posterior. */
  @ApiProperty({ type: [], description: 'Vacio: la emision es un endpoint posterior.' })
  tickets: [];
}
