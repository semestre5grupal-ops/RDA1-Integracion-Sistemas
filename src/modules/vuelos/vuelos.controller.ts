import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { Response } from 'express';
import { randomUUID } from 'crypto';

import { VuelosService } from './vuelos.service';
import { CreateVueloDto } from './dto/create-vuelo.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { VueloResponseDto } from './dto/vuelo-response.dto';
import { SearchRequestDto } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { HoldRequestDto, HoldResponseDto, HoldStatusResponseDto } from './dto/hold.dto';
import { SeatMapResponseDto } from './dto/seatmap.dto';
import { BookingRequestDto, BookingDetailResponseDto } from './dto/booking.dto';
import {
  BaggageOptionDto,
  ListarReservasQueryDto,
  ReservaListResponseDto,
} from './dto/booking-list.dto';
import {
  BoardingPassListResponseDto,
  DateChangeOfferDto,
  DateChangeRequestDto,
  DateChangeSearchRequestDto,
  TicketDetailDto,
  TicketIssuanceResponseDto,
  TicketListResponseDto,
  TicketRouteParamDto,
} from './dto/emision.dto';
import {
  AddBaggageRequestDto,
  BaggageAddedResponseDto,
  CancelBookingRequestDto,
  CancelBookingResponseDto,
  CancellationQuoteResponseDto,
  CheckInResponseDto,
} from './dto/postventa.dto';
import {
  CreateWebhookDto,
  FlightStatusDto,
  FlightStatusQueryDto,
  WebhookSubscriptionDto,
} from './dto/estado-vuelo.dto';

/** `format: uuid` del contrato, para `Idempotency-Key`. */
const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida la cabecera `Idempotency-Key`.
 *
 * Se valida a mano y no con un DTO porque `Idempotency-Key` es una CABECERA, no
 * un campo del cuerpo: `class-validator` solo valida el payload. El contrato la
 * declara `required: true` y `format: uuid`, y las dos cosas se comprueban aqui.
 *
 * Es un `BadRequestException` (400) y no un 500 porque una clave ausente o mal
 * formada es un error del cliente, y el contrato reserva el 400 para
 * `ProblemDetails400`. Un pipe de Nest haria lo mismo, pero aquí son cuatro
 * lineas y evita un `@UsePipes` con un pipe de un solo uso.
 */
function exigirIdempotencyKey(valor: string | undefined): string {
  if (!valor) {
    throw new BadRequestException('La cabecera Idempotency-Key es obligatoria.');
  }
  if (!REGEX_UUID.test(valor)) {
    throw new BadRequestException('Idempotency-Key debe ser un UUID.');
  }
  return valor;
}

/**
 * `blo_propietarioid` es `NOT NULL` y es el `sub` del JWT segun el DDL. Este
 * modulo no gestiona usuarios (decision de diseño del proyecto), asi que se usa
 * la huella de dispositivo, que es un UUID estable por navegador y es lo que
 * emplean las politicas RLS (`p_hold_owner`) para aislar los holds de cada
 * cliente. En cuanto exista el dominio de autenticacion, se cambia SOLO aqui.
 *
 * Si la huella no llega, se genera una aleatoria para esa peticion: es preferible
 * un hold que no se puede recuperar por su propietario a un 500 por una FK NOT
 * NULL. La consecuencia real es que ese hold concreto no se podra consultar luego
 * desde otra pestana, y el propio contrato no expone una forma de hacerlo sin
 * credenciales.
 */
export function propietarioDesde(huella: string | undefined, authHeader?: string): string {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payloadBase64 = token.split('.')[1];
      const payloadString = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadString);
      if (payload.sub && REGEX_UUID.test(payload.sub)) {
        return payload.sub;
      }
    } catch (e) {
      // Ignorar error de decodificacion y caer a huella
    }
  }

  if (huella && REGEX_UUID.test(huella)) return huella;
  return randomUUID();
}

@ApiTags('Vuelos')
@Controller('vuelos')
export class VuelosController {
  constructor(private readonly vuelosService: VuelosService) {}

  /**
   * POST /api/v1/vuelos/search
   *
   * Montado con el prefijo global `api/v1` (ver `main.ts`), la ruta completa es
   * `/api/v1/vuelos/search`.
   *
   * `HttpCode(200)`: en NestJS un `POST` devuelve 201 por defecto, pero el
   * contrato declara `200` para una busqueda.
   *
   * La cabecera `X-Device-Fingerprint` es obligatoria segun el contrato. Se
   * acepta para el rate limit contra `limite_dispositivo` (`RATE_LIMIT_EXCEEDED`,
   * 429), que ya tiene su tabla.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Busqueda de vuelos (Solo Ida / Ida y Vuelta, multidestino)' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Huella de dispositivo para el rate limit del endpoint publico.',
  })
  @ApiResponse({ status: 200, description: 'Ofertas de vuelos encontradas', type: SearchResponseDto })
  @ApiResponse({ status: 400, description: 'Peticion invalida' })
  @ApiResponse({ status: 429, description: 'Demasiadas peticiones' })
  searchFlights(
    @Body() body: SearchRequestDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<SearchResponseDto> {
    return this.vuelosService.searchFlights(body);
  }

  /**
   * POST /api/v1/vuelos/offers/hold
   *
   * Retiene inventario y congela el precio durante 15 o 30 minutos.
   *
   * `HttpCode(201)`: aqui SÍ es el codigo del contrato, y coincide con el
   * defecto de NestJS para POST. Se declara explicito para que no dependa de
   * ese comportamiento implicito.
   *
   * `Idempotency-Key` es obligatoria: sin ella, un reintento del navegador
   * crearia un SEGUNDO hold y consumiria el doble de inventario. Un endpoint de
   * retencion sin idempotencia es un bug de negocio, no una inconveniencia.
   *
   * `blo_propietarioid` es el `sub` del JWT segun el DDL. Este modulo no
   * gestiona usuarios (decision de diseño del proyecto), asi que se usa la
   * huella de dispositivo que ya viaja en `X-Device-Fingerprint`: es un UUID
   * estable por navegador y es lo que usan las politicas RLS (`p_hold_owner`)
   * para aislar los holds de cada cliente. En cuanto exista el dominio de
   * autenticacion, se cambia SOLO esta linea por el `sub` del token.
   */
  @Post('offers/hold')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bloquear inventario y congelar precio' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID de idempotencia. Reutilizarla devuelve la misma respuesta.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Se usa como propietario del hold (sustituto del sub del JWT).',
  })
  @ApiResponse({ status: 201, description: 'Inventario retenido', type: HoldResponseDto })
  @ApiResponse({ status: 400, description: 'Peticion invalida' })
  @ApiResponse({ status: 404, description: 'La oferta no existe' })
  createHold(
    @Body() body: HoldRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<HoldResponseDto> {
    return this.vuelosService.createHold(
      body,
      exigirIdempotencyKey(idempotencyKey),
      propietarioDesde(deviceFingerprint, authHeader),
    );
  }

  /** GET /api/v1/vuelos/offers/hold/{holdId} */
  @Get('offers/hold/:holdId')
  @ApiOperation({ summary: 'Consultar el estado de un hold' })
  @ApiParam({ name: 'holdId', description: 'UUID del hold' })
  @ApiResponse({ status: 200, description: 'Estado del hold', type: HoldStatusResponseDto })
  @ApiResponse({ status: 404, description: 'El hold no existe' })
  getHoldStatus(
    @Param('holdId') holdId: string,
  ): Promise<HoldStatusResponseDto> {
    return this.vuelosService.getHoldStatus(holdId);
  }

  @Delete('offers/hold/:holdId')
  @ApiOperation({ summary: 'Liberar hold anticipadamente' })
  @ApiParam({ name: 'holdId', description: 'UUID del hold' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Liberado exitosamente' })
  @ApiResponse({ status: 404, description: 'La oferta no existe' })
  async deleteHold(@Param('holdId') holdId: string): Promise<void> {
    await this.vuelosService.deleteHold(holdId);
  }

  /**
   * POST /api/v1/vuelos/bookings
   *
   * Convierte un hold `HELD` en una reserva y devuelve el `BookingDetail` con el
   * PNR generado.
   *
   * `Idempotency-Key` es OBLIGATORIA y aqui es todavia mas importante que en el
   * hold: sin ella, un doble clic en "Confirmar pago" crearia DOS reservas con
   * dos PNR distintos sobre el mismo cupo. El contrato la declara `required: true`
   * por ese motivo.
   *
   * Se devuelve **201** (no 202) porque la emision de tickets NO ocurre en esta
   * fase: `tickets[]` se devuelve vacio. El contrato reserva el 202 para cuando
   * el pago o la emision siguen en segundo plano, y ese no es el caso.
   *
   * El propietario NO se acepta en el cuerpo: el contrato lo dice explicitamente
   * ("se extrae exclusivamente del JWT y no es aceptado como dato controlado por
   * el cliente") y `BookingRequest` declara `additionalProperties: false`. El
   * `ValidationPipe` global corre con `forbidNonWhitelisted: true`, asi que un
   * `ownerId` enviado por el cliente produce un 400 en vez de ignorarse.
   */
  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear reserva a partir de un hold' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID de idempotencia. Reutilizarla devuelve la misma reserva.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Propietario de la reserva (sustituto del sub del JWT).',
  })
  @ApiResponse({ status: 201, description: 'Reserva creada', type: BookingDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Peticion invalida o hold no disponible' })
  @ApiResponse({ status: 404, description: 'El hold no existe' })
  createBooking(
    @Body() body: BookingRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<BookingDetailResponseDto> {
    return this.vuelosService.createBooking(
      body,
      exigirIdempotencyKey(idempotencyKey),
      propietarioDesde(deviceFingerprint, authHeader),
    );
  }

  /**
   * GET /api/v1/vuelos/offers/{offerId}/seatmap
   *
   * Mapa de asientos SIN precios, tal como lo describe el contrato. Alimenta el
   * modal de seleccion de asientos del frontend.
   */
  @Get('offers/:offerId/seatmap')
  @ApiOperation({ summary: 'Mapa de asientos de una oferta' })
  @ApiParam({ name: 'offerId', description: 'offerId devuelto por /search' })
  @ApiResponse({ status: 200, description: 'Mapa de asientos', type: SeatMapResponseDto })
  @ApiResponse({ status: 404, description: 'La oferta no existe' })
  getSeatMap(@Param('offerId') offerId: string): Promise<SeatMapResponseDto> {
    return this.vuelosService.getSeatMap(offerId);
  }

  /**
   * GET /api/v1/vuelos/bookings
   *
   * Listado paginado con cursor de las reservas del propietario.
   *
   * No lleva `@ApiHeader` de `Idempotency-Key`: es una lectura, y esa cabecera
   * es solo de escritura (crear hold, crear reserva, liberar).
   *
   * `limit` se limita a 50 en el DTO, que es el `maximum` del contrato: un
   * `?limit=1000` se rechaza con 400 en vez de escanear la tabla.
   */
  @Get('bookings')
  @ApiOperation({ summary: 'Listar reservas del usuario actual (paginado por cursor)' })
  @ApiResponse({ status: 200, description: 'Pagina de reservas', type: ReservaListResponseDto })
  @ApiResponse({ status: 400, description: 'Filtros o paginacion invalidos' })
  listarReservas(
    @Query() query: ListarReservasQueryDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<ReservaListResponseDto> {
    return this.vuelosService.listarReservas(query, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}
   *
   * Detalle exhaustivo: itinerarios con sus segmentos y vuelos, y pasajeros.
   * El orden de las collections (itinerarios por `orden`, pasajeros por `orden`)
   * se hace en el servicio: TypeORM no garantiza orden en un `find` con
   * `relations`, y el orden de salida es informacion, no decoración.
   */
  @Get('bookings/:bookingId')
  @ApiOperation({ summary: 'Detalle de una reserva' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva', type: BookingDetailResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  obtenerReserva(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<BookingDetailResponseDto> {
    return this.vuelosService.obtenerReserva(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}/tickets
   *
   * Devuelve 200 con `tickets: []` cuando la reserva aun no tiene boletos. NO es
   * un 404 ni un error: "no emitido todavia" es un estado valido del flujo, y
   * diferenciarlo de "emitido y en PENDING" es justo lo que necesita la UI para
   * pintar un boarding pass o un aviso de emision pendiente.
   */
  @Get('bookings/:bookingId/tickets')
  @ApiOperation({ summary: 'Consultar los tickets de una reserva' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiResponse({ status: 200, description: 'Tickets de la reserva', type: TicketListResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  listarTickets(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<TicketListResponseDto> {
    return this.vuelosService.listarTickets(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/tickets
   *
   * RUTA DE DISEÑO, no del contrato: el contrato solo declara el `get` de
   * `tickets`, pero sin una emision nadie puede pasar de `PENDING` a `CONFIRMED`
   * con boleto, y el boarding pass se siembra a mano.
   *
   * NO lleva `Idempotency-Key` a proposito. El endpoint es idempotente por
   * construccion —solo inserta los boletos que faltan y `UNIQUE
   * (bol_reservaid, bol_pasajeroid)` impide duplicar— asi que un doble clic o un
   * reintento devuelven 200 con `issued: 0` en vez de un error. Exigir la cabecera
   * obligaria al cliente a inventar un UUID para conseguir un no-op.
   */
  @Post('bookings/:bookingId/tickets')
  @ApiOperation({
    summary: 'Emitir los boletos de una reserva (ruta de diseño, no del contrato)',
    description:
      'Emite un boleto por pasajero y uno por segmento. Es idempotente: ' +
      'responde 200 con `issued: 0` si ya estaban todos emitidos.',
  })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Boletos emitidos o ya emitidos', type: TicketIssuanceResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  @ApiResponse({ status: 409, description: 'La reserva no admite emision (cancelada, fallida...)' })
  @ApiResponse({ status: 422, description: 'La reserva no tiene segmentos que emitir' })
  @HttpCode(HttpStatus.OK)
  emitirTickets(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<TicketIssuanceResponseDto> {
    return this.vuelosService.emitirBoletos(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}/tickets/{ticketId}
   *
   * `ticketId` NO es un UUID: es `bol_ticketId`, el identificador de NEGOCIO del
   * GDS. Por eso se declara un DTO con `@Matches` en vez de usar `ParseUUIDPipe`:
   * un numero como `TKT-A1B2C3D4E5F6` es valido y rechazarlo seria un error de
   * diseño, no de validacion.
   *
   * El DTO declara LOS DOS parametros de la ruta porque un `@Param()` sin nombre
   * recibe el objeto entero, y el `ValidationPipe` global va con
   * `forbidNonWhitelisted: true`.
   */
  @Get('bookings/:bookingId/tickets/:ticketId')
  @ApiOperation({ summary: 'Consultar el detalle de un ticket' })
  @ApiResponse({ status: 200, description: 'Detalle del boleto', type: TicketDetailDto })
  @ApiResponse({ status: 400, description: 'bookingId no es UUID o ticketId no tiene el formato admitido' })
  @ApiResponse({ status: 404, description: 'La reserva o el ticket no existen' })
  async obtenerTicket(
    @Param() params: TicketRouteParamDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<TicketDetailDto> {
    return this.vuelosService.obtenerTicket(
      params.bookingId,
      params.ticketId,
      propietarioDesde(deviceFingerprint, authHeader),
    );
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}/boarding-passes
   *
   * Devuelve 200 con `boardingPasses: []` y `checkedIn: false` cuando la reserva
   * aun no ha hecho check-in. NO es un 404: "no hay pase todavia" es un estado
   * valido del flujo, y la UI lo pinta como una invitation a hacer check-in, no
   * como un error.
   *
   * El `checkedIn` es una extension documentada: con el array a solas, `[]`
   * significaria "todavia no" y "el check-in fallo" a la vez.
   */
  @Get('bookings/:bookingId/boarding-passes')
  @ApiOperation({ summary: 'Listar los pases de abordar de la reserva' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiResponse({ status: 200, description: 'Pases de abordar', type: BoardingPassListResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  listarPases(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<BoardingPassListResponseDto> {
    return this.vuelosService.listarPases(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/date-change/search
   *
   * NO muta la reserva: escribe una `oferta_cambio_fecha` en `VALID` con 30 minutos
   * de vigencia y devuelve sus ids. El `segmentId` de cada segmento NO cambia al
   * mudar de vuelo, asi que boleto, pase y asiento siguen siendo validos.
   *
   * Un array VACIO es una respuesta legitima: no hay ningun vuelo con la misma
   * ruta en la fecha pedida, o no quedan asientos para todos los pasajeros.
   */
  @Post('bookings/:bookingId/date-change/search')
  @ApiOperation({ summary: 'Buscar disponibilidad para cambiar de fecha' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Opciones de cambio', type: [DateChangeOfferDto] })
  @ApiResponse({ status: 404, description: 'La reserva o el itinerario no existen' })
  @ApiResponse({ status: 409, description: 'La reserva no esta confirmada' })
  @HttpCode(HttpStatus.OK)
  buscarCambioFecha(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: DateChangeSearchRequestDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<DateChangeOfferDto[]> {
    return this.vuelosService.buscarCambioFecha(
      bookingId,
      dto,
      propietarioDesde(deviceFingerprint, authHeader),
    );
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/date-change
   *
   * Confirma el cambio contra la oferta mostrada. Requiere `Idempotency-Key`:
   * reapunta los segmentos y mueve la reserva dos veces, y un doble clic sin la
   * cabecera aplicaria el cambio dos veces sobre la misma oferta.
   *
   * Responde 200 con el `BookingDetail` actualizado. El 202 queda declarado porque
   * el contrato lo prevee, pero este modulo no lo alcanza: la transicion
   * `CONFIRMED -> CHANGE_PENDING -> CONFIRMED` se cierra siempre dentro de la
   * misma transaccion, asi que no hay un estado intermedio observable.
   */
  @Post('bookings/:bookingId/date-change')
  @ApiOperation({ summary: 'Confirmar el cambio de fecha' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID que evita aplicar el cambio dos veces.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Cambio aplicado', type: BookingDetailResponseDto })
  @ApiResponse({ status: 202, description: 'Cambio en proceso (CHANGE_PENDING)' })
  @ApiResponse({ status: 404, description: 'La reserva o la oferta no existen' })
  @ApiResponse({ status: 409, description: 'Estado invalido, oferta ajena o ya consumida' })
  @ApiResponse({ status: 410, description: 'La oferta de cambio ha caducado' })
  @ApiResponse({ status: 422, description: 'Hay importe a pagar y falta la referencia de pago' })
  async confirmarCambioFecha(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: DateChangeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-device-fingerprint') deviceFingerprint: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingDetailResponseDto> {
    const resultado = await this.vuelosService.confirmarCambioFecha(
      bookingId,
      dto,
      exigirIdempotencyKey(idempotencyKey),
      propietarioDesde(deviceFingerprint, authHeader),
    );
    res.status(resultado.codigo);
    return resultado.cuerpo;
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}/baggage-options
   *
   * Un item por cada par (pasajero, itinerario): el equipaje se compra por
   * pasajero y por trayecto, no por reserva.
   */
  @Get('bookings/:bookingId/baggage-options')
  @ApiOperation({ summary: 'Opciones y limites de equipaje post-emision' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiResponse({ status: 200, description: 'Opciones de equipaje', type: [BaggageOptionDto] })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  opcionesEquipaje(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<BaggageOptionDto[]> {
    return this.vuelosService.opcionesEquipaje(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/check-in
   *
   * Registra el check-in. Es la unica operacion de postventa que NO lleva
   * `Idempotency-Key`: el `UNIQUE (chi_reservaid)` del DDL ya garantiza que no
   * haya dos check-ins por reserva, y un segundo intento responde 409 con un
   * mensaje claro en vez de devolver en silencio el resultado del primero.
   *
   * El 409 tambien cubre la ventana de 48h: fuera de ella el mensaje dice CUANDO
   * abre, que es mas util que un 409 seco.
   */
  @Post('bookings/:bookingId/check-in')
  @ApiOperation({ summary: 'Realizar el check-in de la reserva' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Check-in realizado', type: CheckInResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  @ApiResponse({ status: 409, description: 'Estado invalido, ventana cerrada o check-in ya hecho' })
  @ApiResponse({ status: 422, description: 'Falta boleto emitido, o la reserva no tiene vuelos' })
  @HttpCode(HttpStatus.OK)
  checkIn(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<CheckInResponseDto> {
    return this.vuelosService.hacerCheckIn(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * GET /api/v1/vuelos/bookings/{bookingId}/cancellation-quote
   *
   * Cotiza la cancelacion SIN tocar el estado de la reserva. Inserta una fila en
   * `cotizacion_cancelacion` en estado `VALID` y devuelve su id: es el
   * `quoteId` que `POST /cancel` despues exige, y es lo que ata la confirmacion
   * al importe que el usuario vio.
   */
  @Get('bookings/:bookingId/cancellation-quote')
  @ApiOperation({ summary: 'Cotizar el reembolso de una cancelacion' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiResponse({ status: 200, description: 'Cotizacion vigente', type: CancellationQuoteResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva no existe' })
  cotizarCancelacion(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<CancellationQuoteResponseDto> {
    return this.vuelosService.cotizarCancelacion(bookingId, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/cancel
   *
   * Confirma la cancelacion contra la cotizacion mostrada. Requiere
   * `Idempotency-Key` porque es una operacion que mueve dinero y estado: sin
   * ella, un doble clic crearia dos cancelaciones.
   *
   * Responde 200 (CANCELLED, con reembolso) o 202 (CANCELLATION_PENDING, sin
   * reembolso). El codigo se fija en el servicio segun el resultado y se
   * reenvia con `@Res({ passthrough: true })`: NestJS no puede decidirlo a
   * partir del cuerpo de la respuesta.
   */
  @Post('bookings/:bookingId/cancel')
  @ApiOperation({ summary: 'Cancelar la reserva' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID que evita cancelaciones duplicadas.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Cancelada con reembolso', type: CancelBookingResponseDto })
  @ApiResponse({ status: 202, description: 'Cancelacion sin reembolso, pendiente de finanzas' })
  @ApiResponse({ status: 404, description: 'La reserva o la cotizacion no existen' })
  @ApiResponse({ status: 409, description: 'Estado invalido, cotizacion caducada o ajena' })
  async cancelar(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CancelBookingRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-device-fingerprint') deviceFingerprint: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CancelBookingResponseDto> {
    const resultado = await this.vuelosService.cancelarReserva(
      bookingId,
      dto,
      exigirIdempotencyKey(idempotencyKey),
      propietarioDesde(deviceFingerprint, authHeader),
    );
    res.status(resultado.codigo);
    return resultado.cuerpo;
  }

  /**
   * POST /api/v1/vuelos/bookings/{bookingId}/baggage
   *
   * Anade maletas extra. Requiere `Idempotency-Key` porque cobra: sin ella, un
   * reintento tras un timeout cobraria dos veces.
   */
  @Post('bookings/:bookingId/baggage')
  @ApiOperation({ summary: 'Agregar maleta extra post-emision' })
  @ApiParam({ name: 'bookingId', description: 'UUID de la reserva' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID que evita cobros duplicados.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al propietario de la reserva (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Maleta agregada', type: BaggageAddedResponseDto })
  @ApiResponse({ status: 404, description: 'La reserva, el pasajero o el itinerario no existen' })
  @ApiResponse({ status: 409, description: 'La reserva esta cancelada' })
  @ApiResponse({ status: 422, description: 'No hay tarifa de equipaje para el itinerario' })
  @HttpCode(HttpStatus.OK)
  agregarEquipaje(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: AddBaggageRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<BaggageAddedResponseDto> {
    return this.vuelosService.agregarEquipaje(
      bookingId,
      dto,
      exigirIdempotencyKey(idempotencyKey),
      propietarioDesde(deviceFingerprint, authHeader),
    );
  }

  /**
   * GET /api/v1/vuelos/flights/{flightNumber}/status
   *
   * ENDPOINT PUBLICO. El contrato declara `security: []`, asi que NO lleva
   * `X-Device-Fingerprint` ni `@ApiHeader`: no hay propietario, no hay RLS y no
   * hay datos personales. Es la replica del tablero de salidas del aeropuerto, y
   * por eso se documenta como publico en Swagger en lugar de aparecer bajo el
   * grupo de reservas.
   *
   * `date` es obligatoria y se valida con `FlightStatusQueryDto`; sin ella un
   * vuelo se repite cada dia y la respuesta seria ambigua.
   */
  @Get('flights/:flightNumber/status')
  @ApiOperation({
    summary: 'Consultar el estado operativo de un vuelo (endpoint publico)',
    description:
      'Publico: no requiere credenciales. Se representa por numero de vuelo y ' +
      'fecha de salida, no por un UUID de la base, porque es lo que conoce el ' +
      'pasajero.',
  })
  @ApiParam({ name: 'flightNumber', example: 'LA4041' })
  @ApiResponse({ status: 200, description: 'Estado del vuelo', type: FlightStatusDto })
  @ApiResponse({ status: 400, description: 'La fecha no tiene formato YYYY-MM-DD' })
  @ApiResponse({ status: 404, description: 'No hay ese vuelo en esa fecha' })
  estadoVuelo(
    @Param('flightNumber') flightNumber: string,
    @Query() query: FlightStatusQueryDto,
  ): Promise<FlightStatusDto> {
    return this.vuelosService.estadoVuelo(flightNumber, query);
  }

  /**
   * GET /api/v1/vuelos/webhooks
   *
   * El `swb_propietarioId` simula el `sub` del JWT con la huella de dispositivo,
   * igual que el resto del modulo. Cuando exista el dominio de autenticacion se
   * cambia SOLO aqui y en `crearWebhook`.
   */
  @Get('webhooks')
  @ApiOperation({ summary: 'Listar suscripciones a webhooks' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al cliente (RLS).',
  })
  @ApiResponse({ status: 200, description: 'Suscripciones activas', type: [WebhookSubscriptionDto] })
  listarWebhooks(
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<WebhookSubscriptionDto[]> {
    return this.vuelosService.listarWebhooks(propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * POST /api/v1/vuelos/webhooks
   *
   * `201` explicito: en NestJS un POST ya devuelve 201, pero se declara igual
   * para que el contrato y Swagger no dependan de ese comportamiento por
   * defecto.
   *
   * El secreto viaja solo en esta peticion. La respuesta lo devuelve ENMASCARADO
   * (`whsec_...a1b2`): el campo existe para cumplir el esquema, pero nunca
   * contiene el valor real.
   */
  @Post('webhooks')
  @ApiOperation({ summary: 'Registrar una suscripcion a webhooks' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al cliente (RLS).',
  })
  @ApiResponse({ status: 201, description: 'Suscripcion registrada', type: WebhookSubscriptionDto })
  @ApiResponse({ status: 400, description: 'URL no valida, no es https, o eventos vacios' })
  @HttpCode(HttpStatus.CREATED)
  crearWebhook(
    @Body() dto: CreateWebhookDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<WebhookSubscriptionDto> {
    return this.vuelosService.crearWebhook(dto, propietarioDesde(deviceFingerprint, authHeader));
  }

  /**
   * DELETE /api/v1/vuelos/webhooks/{id}
   *
   * `204`: borrado logico (`swb_activo = false`). No borra la fila para
   * conservar el historial de entregas; el servicio explica por que.
   */
  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Eliminar una suscripcion a webhooks' })
  @ApiParam({ name: 'id', description: 'UUID de la suscripcion' })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: true,
    description: 'Identifica al cliente (RLS).',
  })
  @ApiResponse({ status: 204, description: 'Suscripcion eliminada' })
  @ApiResponse({ status: 404, description: 'La suscripcion no existe' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<void> {
    await this.vuelosService.eliminarWebhook(id, propietarioDesde(deviceFingerprint, authHeader));
  }

}
