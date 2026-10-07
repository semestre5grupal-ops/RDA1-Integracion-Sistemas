import {
  Controller,
  Get,
  Param,
  Query,
  UseInterceptors,
  Header,
  Headers,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  Inject,
} from '@nestjs/common';
import { CacheInterceptor, CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AlojamientosService } from './alojamientos.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import { AlojamientoResponseDto } from './dto/alojamiento-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAlojamientosRequestDto } from './dto/search-alojamientos.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { CreateAlojamientoDto } from './dto/create-alojamiento.dto';
import { UpdateAlojamientoDto } from './dto/update-alojamiento.dto';
import {
  ReservationRequestDto,
  CancelReservationRequestDto,
  ReservationResponseDto,
} from './dto/reservation.dto';

import {
  AvailabilityRequestDto,
  AvailabilityResponseDto as ContractAvailabilityResponseDto,
  BulkAvailabilityRequestDto,
  BulkAvailabilityResponseDto,
} from './dto/availability-contract.dto';

import {
  AccommodationDetailsRequestDto,
  AccommodationDetailsResponseDto,
  DetailsChangesRequestDto,
  DetailsChangesResponseDto,
  ChainsResponseDto,
  ConstantsRequestDto,
  ConstantsResponseDto,
  ReviewsRequestDto,
  ReviewsResponseDto,
  ReviewsScoresRequestDto,
  ReviewsScoresResponseDto,
} from './dto/catalog-extra.dto';

import {
  OrderPreviewRequestDto,
  OrderPreviewResponseDto,
  OrderCreateRequestDto,
  OrderDetailDto,
  OrderModifyRequestDto,
} from './dto/orders.dto';

import {
  CreateAccommodationWebhookDto,
  AccommodationWebhookSubscriptionDto,
} from './dto/webhooks.dto';

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirIdempotencyKey(valor: string | undefined): string {
  if (!valor) {
    throw new BadRequestException('La cabecera Idempotency-Key es obligatoria.');
  }
  if (!REGEX_UUID.test(valor)) {
    throw new BadRequestException('Idempotency-Key debe ser un UUID válido.');
  }
  return valor;
}

@ApiTags('Alojamientos (BFF Integrador)')
@Controller('alojamientos')
export class AlojamientosController {
  constructor(
    private readonly alojamientosService: AlojamientosService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * El catálogo (`GET /alojamientos` y `GET /alojamientos/:id`) se cachea 60 s.
   * Tras cualquier cambio de administración se vacía la caché: si no, el precio
   * o un alojamiento eliminado seguirían mostrándose hasta que caducara.
   */
  private async invalidarCatalogo(): Promise<void> {
    await this.cache.reset();
  }

  // =========================================================================
  // BÚSQUEDA Y CATÁLOGO (OpenAPI GDS Core)
  // =========================================================================

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Búsqueda de alojamientos (Filtros estándar y búsqueda por destino/fechas)',
    description: 'Endpoint de búsqueda conforme al contrato OpenAPI y compatible con el marketplace frontend.',
  })
  @ApiHeader({
    name: 'X-Device-Fingerprint',
    required: false,
    description: 'Huella de dispositivo para rate limiting y trazabilidad.',
  })
  @ApiResponse({ status: 200, description: 'Resultados de la búsqueda de alojamientos.' })
  @ApiResponse({ status: 400, description: 'Parámetros de búsqueda inválidos (RFC 7807).' })
  async search(
    @Body() dto: SearchAlojamientosRequestDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
  ) {
    return this.alojamientosService.search(dto);
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener detalles de múltiples alojamientos (Batch / Catálogo)' })
  @ApiResponse({ status: 200, description: 'Detalles de alojamientos recuperados exitosamente.' })
  async getDetailsBatch(@Body() dto: AccommodationDetailsRequestDto) {
    if (dto.extras || dto.city || dto.country) {
      return this.alojamientosService.getAccommodationDetailsExtended(dto);
    }
    return this.alojamientosService.getDetailsBatch(dto as any);
  }

  @Post('details/changes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar alojamientos modificados desde una fecha' })
  @ApiResponse({ status: 200, description: 'Listado de modificaciones por fecha.', type: DetailsChangesResponseDto })
  async getDetailsChanges(@Body() dto: DetailsChangesRequestDto): Promise<DetailsChangesResponseDto> {
    return this.alojamientosService.getDetailsChanges(dto);
  }

  @Post('chains')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar cadenas hoteleras y sus marcas' })
  @ApiResponse({ status: 200, description: 'Catálogo de cadenas hoteleras.', type: ChainsResponseDto })
  async getChains(): Promise<ChainsResponseDto> {
    return this.alojamientosService.getChains();
  }

  @Post('constants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar constantes del sistema (facilidades, tipos de cuartos, planes)' })
  @ApiResponse({ status: 200, description: 'Constantes de alojamientos.', type: ConstantsResponseDto })
  async getConstants(@Body() dto: ConstantsRequestDto): Promise<ConstantsResponseDto> {
    return this.alojamientosService.getConstants(dto);
  }

  @Post('reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener reseñas de alojamientos (Contrato OpenAPI)' })
  @ApiResponse({ status: 200, description: 'Reseñas detalladas de alojamientos.', type: ReviewsResponseDto })
  async getReviews(@Body() dto: ReviewsRequestDto): Promise<ReviewsResponseDto> {
    return this.alojamientosService.getReviewsContract(dto);
  }

  @Post('reviews/scores')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener puntuaciones y desgloses de reseñas' })
  @ApiResponse({ status: 200, description: 'Puntuaciones desglosadas.', type: ReviewsScoresResponseDto })
  async getReviewsScores(@Body() dto: ReviewsScoresRequestDto): Promise<ReviewsScoresResponseDto> {
    return this.alojamientosService.getReviewsScores(dto);
  }

  // =========================================================================
  // DISPONIBILIDAD Y PRECIOS
  // =========================================================================

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar disponibilidad y tarifas de productos de un alojamiento' })
  @ApiResponse({ status: 200, description: 'Disponibilidad y tarifas desglosadas.', type: ContractAvailabilityResponseDto })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  async getAvailabilityContract(
    @Body() dto: AvailabilityRequestDto,
  ): Promise<ContractAvailabilityResponseDto> {
    return this.alojamientosService.getAvailabilityContract(dto);
  }

  @Post('bulk-availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar disponibilidad múltiple de alojamientos' })
  @ApiResponse({ status: 200, description: 'Disponibilidad múltiple.', type: BulkAvailabilityResponseDto })
  async getBulkAvailability(
    @Body() dto: BulkAvailabilityRequestDto,
  ): Promise<BulkAvailabilityResponseDto> {
    return this.alojamientosService.getBulkAvailability(dto);
  }

  // =========================================================================
  // GESTIÓN DE ÓRDENES (RESERVAS)
  // =========================================================================

  @Post('orders/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Previsualizar orden antes de confirmar el pago' })
  @ApiResponse({ status: 200, description: 'Previsualización de orden calculada.', type: OrderPreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Alojamiento no encontrado.' })
  async previewOrder(
    @Body() dto: OrderPreviewRequestDto,
  ): Promise<OrderPreviewResponseDto> {
    return this.alojamientosService.previewOrder(dto);
  }

  @Post('orders/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear reserva formal de alojamiento (Requiere Idempotency-Key y payment_reference)',
    description: 'Formaliza la reserva confirmada en base al preview y valida la referencia de pago de la Payment API.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID de idempotencia. Evita transacciones y cobros duplicados.',
  })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente.', type: OrderDetailDto })
  @ApiResponse({ status: 400, description: 'Petición inválida o Idempotency-Key ausente/no UUID.' })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia (Orden ya procesada).' })
  @ApiResponse({ status: 422, description: 'Falta referencia de pago válida o es rechazada.' })
  async createOrder(
    @Body() dto: OrderCreateRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<OrderDetailDto> {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.createOrder(dto, keyValida);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Obtener detalles de una orden de alojamiento' })
  @ApiParam({ name: 'orderId', description: 'UUID de la orden', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la orden.', type: OrderDetailDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  async getOrderById(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderDetailDto> {
    return this.alojamientosService.getOrderById(orderId);
  }

  @Post('orders/:orderId/modify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modificar una orden existente (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'orderId', description: 'UUID de la orden', type: 'string' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID para evitar modificaciones duplicadas.',
  })
  @ApiResponse({ status: 200, description: 'Orden modificada exitosamente.', type: OrderDetailDto })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  @ApiResponse({ status: 409, description: 'Estado inválido de la orden para modificación.' })
  async modifyOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderModifyRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<OrderDetailDto> {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.modifyOrder(orderId, dto, keyValida);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una orden de alojamiento (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'orderId', description: 'UUID de la orden a cancelar', type: 'string' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID que garantiza idempotencia de la cancelación.',
  })
  @ApiResponse({ status: 200, description: 'Cancelación procesada exitosamente.' })
  @ApiResponse({ status: 404, description: 'Orden no encontrada.' })
  async cancelOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto?: CancelReservationRequestDto,
  ): Promise<any> {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.cancelOrder(orderId, keyValida, dto?.reason);
  }

  // =========================================================================
  // WEBHOOKS
  // =========================================================================

  @Get('webhooks')
  @ApiOperation({ summary: 'Listar suscripciones a webhooks de alojamientos' })
  @ApiResponse({ status: 200, description: 'Suscripciones activas.', type: [AccommodationWebhookSubscriptionDto] })
  async listWebhooks(
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
  ): Promise<AccommodationWebhookSubscriptionDto[]> {
    return this.alojamientosService.listWebhooks(deviceFingerprint || 'default-owner');
  }

  @Post('webhooks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar suscripción a webhook de alojamientos' })
  @ApiResponse({ status: 201, description: 'Suscripción registrada exitosamente.', type: AccommodationWebhookSubscriptionDto })
  @ApiResponse({ status: 400, description: 'URL no válida, no es https, o eventos no especificados.' })
  async createWebhook(
    @Body() dto: CreateAccommodationWebhookDto,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
  ): Promise<AccommodationWebhookSubscriptionDto> {
    return this.alojamientosService.createWebhook(dto, deviceFingerprint || 'default-owner');
  }

  @Delete('webhooks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una suscripción a webhooks' })
  @ApiParam({ name: 'id', description: 'UUID de la suscripción', type: 'string' })
  @ApiResponse({ status: 204, description: 'Suscripción eliminada exitosamente.' })
  @ApiResponse({ status: 404, description: 'Suscripción no encontrada.' })
  async deleteWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
  ): Promise<void> {
    await this.alojamientosService.deleteWebhook(id, deviceFingerprint || 'default-owner');
  }

  // =========================================================================
  // ENDPOINTS DE GESTIÓN Y MARKETPLACE FRONTEND (Preservados y Optimizados)
  // =========================================================================

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio de Alojamientos' })
  @ApiResponse({ status: 200, description: 'Servicio operativo' })
  async health() {
    return this.alojamientosService.health();
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Consultar el historial de reservas de alojamientos (Frontend MisReservas)' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  async getReservas() {
    return this.alojamientosService.getReservas();
  }

  @Get('reservations/:reservationId')
  @ApiOperation({ summary: 'Obtener detalle de una reserva de alojamiento' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.', type: ReservationResponseDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  @ApiResponse({ status: 400, description: 'El ID no es un UUID válido.' })
  async getReservaById(@Param('reservationId', ParseUUIDPipe) reservationId: string) {
    return this.alojamientosService.getReservaById(reservationId);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva a cancelar', type: 'string' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID para garantizar idempotencia de la cancelación.',
  })
  @ApiResponse({ status: 200, description: 'Reserva cancelada exitosamente.', type: ReservationResponseDto })
  async cancelarReserva(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CancelReservationRequestDto,
  ) {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.cancelarReserva(reservationId, dto, keyValida);
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Obtener el listado de alojamientos (Caché habilitado, HATEOAS Nivel 3)' })
  @ApiResponse({ status: 200, description: 'Listado de alojamientos recuperado exitosamente.' })
  @ApiResponse({ status: 503, description: 'Servicio de Alojamientos Externo no disponible.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.alojamientosService.findAll(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const hayMas = page * limit < (result.meta?.total ?? 0);
    result._links = {
      self: { href: `/api/v1/alojamientos?page=${page}&limit=${limit}`, type: 'GET' },
      // En la última página no hay `next`, y en la primera no hay `prev`.
      next: hayMas ? { href: `/api/v1/alojamientos?page=${page + 1}&limit=${limit}`, type: 'GET' } : null,
      prev: page > 1 ? { href: `/api/v1/alojamientos?page=${page - 1}&limit=${limit}`, type: 'GET' } : null,
    };
    return result;
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo alojamiento (Admin)' })
  @ApiResponse({ status: 201, description: 'El alojamiento ha sido creado exitosamente.', type: AlojamientoResponseDto })
  async create(@Body() dto: CreateAlojamientoDto) {
    const creado = await this.alojamientosService.create(dto);
    await this.invalidarCatalogo();
    return creado;
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Obtener el detalle de un alojamiento por su ID' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle del alojamiento.', type: AlojamientoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found. El alojamiento no existe.' })
  async findOne(@Param('id') id: string) {
    const result = await this.alojamientosService.findOne(id);
    return {
      ...result,
      _links: {
        self: { href: `/api/v1/alojamientos/${id}`, type: 'GET' },
        reservar: { href: `/api/v1/alojamientos/${id}/reservations`, type: 'POST' },
        preview: { href: `/api/v1/alojamientos/orders/preview`, type: 'POST' },
        catalogo: { href: `/api/v1/alojamientos`, type: 'GET' },
      },
    };
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos de un alojamiento (Admin)' })
  async replace(@Param('id') id: string, @Body() dto: CreateAlojamientoDto) {
    await this.alojamientosService.replace(id, dto);
    await this.invalidarCatalogo();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente un alojamiento (Admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateAlojamientoDto) {
    const actualizado = await this.alojamientosService.update(id, dto);
    await this.invalidarCatalogo();
    return actualizado;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un alojamiento (Admin)' })
  async delete(@Param('id') id: string) {
    await this.alojamientosService.delete(id);
    await this.invalidarCatalogo();
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad rápida de habitaciones por fecha (Frontend)' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento' })
  @ApiResponse({ status: 200, description: 'Disponibilidad recuperada exitosamente.', type: AvailabilityResponseDto })
  async getAvailability(
    @Param('id') id: string,
    @Query('date') date?: string,
    @Query('checkin') checkin?: string,
    @Query('checkout') checkout?: string,
  ) {
    return this.alojamientosService.getAvailability(id, checkin || date, checkout);
  }

  @Get(':id/resenas')
  @ApiOperation({ summary: 'Obtener reseñas de un alojamiento (Frontend)' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reseñas del alojamiento.' })
  async getResenas(@Param('id') id: string) {
    return this.alojamientosService.getResenas(id);
  }

  @Post(':id/reservations')
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Reservar un alojamiento directamente (Frontend - Requiere Idempotency-Key)' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento', type: 'string' })
  @ApiBody({ type: ReservationRequestDto })
  @ApiResponse({ status: 201, description: 'Reserva confirmada', type: ReservationResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia (Reserva ya procesada).' })
  async reservar(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ReservationRequestDto,
  ) {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.reservar(id, dto, keyValida);
  }
}
