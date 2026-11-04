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
  Req,
  UseGuards,
  Optional,
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
  ApiBearerAuth,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import {
  GestionAlojamientosGuard,
  ClienteAutenticadoGuard,
  SesionOpcionalGuard,
  SoloAdministradorGuard,
} from './guards/gestion-alojamientos.guard';
import { ProveedoresAlojamientoService } from './proveedores.service';
import { CreateTipoHabitacionDto, UpdateTipoHabitacionDto } from './dto/tipo-habitacion.dto';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';
import { SincronizarAlojamientosDto } from './dto/sincronizar.dto';
import { AdminAuditService, actorDesdeRequest } from '../admin/admin-audit.service';
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
    private readonly proveedoresService: ProveedoresAlojamientoService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Optional() private readonly audit?: AdminAuditService,
  ) {}

  /**
   * Deja constancia en la auditoría del panel de cada cambio del catálogo, sea
   * de un administrador o del sistema de un proveedor (API key).
   */
  private async auditar(req: any, accion: string, entidadId: string | null, detalle?: any, entidad = 'alojamiento') {
    if (!this.audit) return;
    const actor = actorDesdeRequest(req);
    if (req?.actorCatalogo?.tipo === 'proveedor') {
      actor.id = null;
      actor.email = `proveedor:${req.actorCatalogo.proveedorId}`;
    }
    await this.audit.registrar(actor, accion, entidad, entidadId, detalle).catch(() => undefined);
  }

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
  @UseGuards(SesionOpcionalGuard)
  @ApiBearerAuth()
  async createOrder(
    @Body() dto: OrderCreateRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: any,
  ): Promise<OrderDetailDto> {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.createOrder(dto, keyValida, req.user);
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

  @Post('orders/:orderId/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in Digital y liberación de clave de acceso a las 14:00 (Cátedra RDA2 §4)' })
  @ApiParam({ name: 'orderId', description: 'UUID o Código de la orden' })
  @ApiResponse({ status: 200, description: 'Estado del check-in y clave de cerradura digital si es >= 14:00.' })
  async checkinDigital(
    @Param('orderId') orderId: string,
    @Body() body?: { forzar_liberacion?: boolean }
  ) {
    return this.alojamientosService.checkinDigital(orderId, body?.forzar_liberacion);
  }

  @Post('reservas/:orderId/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in Digital y liberación de clave de acceso a las 14:00 (Alias)' })
  async checkinDigitalAlias(
    @Param('orderId') orderId: string,
    @Body() body?: { forzar_liberacion?: boolean }
  ) {
    return this.alojamientosService.checkinDigital(orderId, body?.forzar_liberacion);
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

  @Get('promociones/contrato')
  @ApiOperation({ summary: 'Consultar el acuerdo B2B de promociones y combos pactado con el socio hotelero (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Términos del acuerdo comercial de promociones y combos de Alojamientos.' })
  async getPromocionesContrato() {
    return this.alojamientosService.getPromocionesContrato();
  }

  @Put('promociones/contrato')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Formalizar o actualizar acuerdo comercial B2B para combos y descuentos máximos de Alojamientos (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Acuerdo comercial de Alojamientos actualizado exitosamente.' })
  async updatePromocionesContrato(@Body() dto: any) {
    return this.alojamientosService.updatePromocionesContrato(dto);
  }

  @Get('eventos')
  @ApiOperation({ summary: 'Feed de eventos de Alojamientos en formato CloudEvents v1.0 (Transactional Outbox / RabbitMQ)' })
  @ApiResponse({ status: 200, description: 'Listado de eventos emitidos por el microservicio MS_ALO.' })
  async getEventos(@Query('limit') limit?: string) {
    return this.alojamientosService.getEventosOutbox(limit ? Number(limit) : 20);
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio de Alojamientos' })
  @ApiResponse({ status: 200, description: 'Servicio operativo' })
  async health() {
    return this.alojamientosService.health();
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Consultar el historial de reservas de alojamientos (Frontend MisReservas)' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  @UseGuards(ClienteAutenticadoGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Sin sesión iniciada.' })
  async getReservas(@Req() req: any) {
    // Cada cliente ve solo sus reservas; un administrador ve todas.
    return this.alojamientosService.getReservas(req.user);
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

  // =========================================================================
  // GESTIÓN E INTEGRACIÓN CON PROVEEDORES
  // =========================================================================

  @Post('sincronizar')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar el inventario de un proveedor (lote idempotente)',
    description:
      'Crea o actualiza por (proveedorId, idExterno). Reenviar el mismo lote no duplica. ' +
      'Para retirar un alojamiento, envíalo con estado INACTIVO. Cada elemento devuelve su resultado (CREADO, ACTUALIZADO o ERROR con el campo exacto).',
  })
  @ApiResponse({ status: 200, description: 'Resultado por elemento y resumen del lote.' })
  async sincronizar(@Body() dto: SincronizarAlojamientosDto, @Req() req: any) {
    const resultado = await this.alojamientosService.sincronizar(dto.alojamientos, req.actorCatalogo, dto.proveedorId);
    if (resultado.resumen.creados || resultado.resumen.actualizados) await this.invalidarCatalogo();
    await this.auditar(req, 'Sincronizó catálogo de alojamientos', resultado.proveedor_id, resultado.resumen);
    return resultado;
  }

  @Get('gestion/proveedores')
  @UseGuards(SoloAdministradorGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Proveedores de alojamientos registrados (sin sus claves)' })
  async listarProveedores() {
    return this.proveedoresService.listar();
  }

  @Post('gestion/proveedores')
  @UseGuards(SoloAdministradorGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar un proveedor y generar su API key (se muestra UNA sola vez)' })
  @ApiResponse({ status: 201, description: 'Proveedor creado; `api_key` solo aparece en esta respuesta.' })
  @ApiResponse({ status: 409, description: 'Ya existe un proveedor con ese id.' })
  async crearProveedor(@Body() dto: CreateProveedorDto, @Req() req: any) {
    const creado = await this.proveedoresService.crear(dto);
    await this.auditar(req, 'Registró proveedor de alojamientos', creado.id, { nombre: creado.nombre }, 'proveedor');
    return creado;
  }

  @Patch('gestion/proveedores/:proveedorId')
  @UseGuards(SoloAdministradorGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar un proveedor o activarlo/desactivarlo (desactivado, su API key deja de funcionar)' })
  async actualizarProveedor(@Param('proveedorId') proveedorId: string, @Body() dto: UpdateProveedorDto, @Req() req: any) {
    const actualizado = await this.proveedoresService.actualizar(proveedorId, dto);
    const accion = dto.activo === false ? 'Desactivó proveedor' : dto.activo === true ? 'Activó proveedor' : 'Editó proveedor';
    await this.auditar(req, accion, proveedorId, { campos: Object.keys(dto) }, 'proveedor');
    return actualizado;
  }

  @Post('gestion/proveedores/:proveedorId/rotar-clave')
  @UseGuards(SoloAdministradorGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar una API key nueva (la anterior deja de funcionar al instante)' })
  async rotarClaveProveedor(@Param('proveedorId') proveedorId: string, @Req() req: any) {
    const resultado = await this.proveedoresService.rotarClave(proveedorId);
    await this.auditar(req, 'Rotó la API key de un proveedor', proveedorId, undefined, 'proveedor');
    return resultado;
  }

  @Delete('gestion/proveedores/:proveedorId')
  @UseGuards(SoloAdministradorGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un proveedor sin alojamientos' })
  @ApiResponse({ status: 409, description: 'Tiene alojamientos: desactivarlo en su lugar.' })
  async eliminarProveedor(@Param('proveedorId') proveedorId: string, @Req() req: any) {
    await this.proveedoresService.eliminar(proveedorId);
    await this.auditar(req, 'Eliminó proveedor', proveedorId, undefined, 'proveedor');
  }

  @Get('gestion/catalogo')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Catálogo completo para el panel de gestión (incluye inactivos, origen y reservas pendientes)' })
  @ApiQuery({ name: 'estado', required: false, enum: ['ACTIVO', 'INACTIVO'] })
  @ApiQuery({ name: 'proveedor', required: false, description: 'Id de proveedor, o "manual" para altas del panel' })
  @ApiQuery({ name: 'q', required: false, description: 'Texto en nombre, destino, id o idExterno' })
  async catalogoGestion(
    @Req() req: any,
    @Query('estado') estado?: string,
    @Query('proveedor') proveedor?: string,
    @Query('q') q?: string,
  ) {
    return this.alojamientosService.catalogoGestion({ estado, proveedor, q }, req.actorCatalogo);
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
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Registrar un nuevo alojamiento (Admin o proveedor con API key)' })
  @ApiResponse({ status: 201, description: 'El alojamiento ha sido creado exitosamente.', type: AlojamientoResponseDto })
  @ApiResponse({ status: 401, description: 'Sin token de admin ni API key de proveedor.' })
  @ApiResponse({ status: 403, description: 'El usuario no es administrador.' })
  @ApiResponse({ status: 409, description: 'El proveedor ya tiene un alojamiento con ese idExterno.' })
  async create(@Body() dto: CreateAlojamientoDto, @Req() req: any) {
    const creado = await this.alojamientosService.create(dto, req.actorCatalogo);
    await this.auditar(req, 'Creó alojamiento', creado.id, { nombre: creado.nombre, proveedor: creado.proveedorId ?? null });
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
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos de un alojamiento (Admin o su proveedor)' })
  async replace(@Param('id') id: string, @Body() dto: CreateAlojamientoDto, @Req() req: any) {
    await this.alojamientosService.replace(id, dto, req.actorCatalogo);
    await this.auditar(req, 'Reemplazó alojamiento', id);
    await this.invalidarCatalogo();
  }

  @Patch(':id')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Actualizar parcialmente un alojamiento, p. ej. precio o estado (Admin o su proveedor)' })
  async update(@Param('id') id: string, @Body() dto: UpdateAlojamientoDto, @Req() req: any) {
    const actualizado = await this.alojamientosService.update(id, dto, req.actorCatalogo);
    await this.auditar(req, dto.estado ? `Cambió estado de alojamiento a ${dto.estado}` : 'Editó alojamiento', id, { campos: Object.keys(dto) });
    await this.invalidarCatalogo();
    return actualizado;
  }

  @Delete(':id')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un alojamiento (Admin o su proveedor)' })
  @ApiResponse({ status: 409, description: 'Tiene reservas confirmadas pendientes: desactivarlo en su lugar.' })
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.alojamientosService.delete(id, req.actorCatalogo);
    await this.auditar(req, 'Eliminó alojamiento', id);
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
  @UseGuards(SesionOpcionalGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 401, description: 'Se envió un token, pero no es válido (sin token se reserva como invitado).' })
  async reservar(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ReservationRequestDto,
    @Req() req: any,
  ) {
    const keyValida = exigirIdempotencyKey(idempotencyKey);
    return this.alojamientosService.reservar(id, dto, keyValida, req.user);
  }

  // =========================================================================
  // TIPOS DE HABITACIÓN
  // =========================================================================

  @Get(':id/tipos-habitacion')
  @ApiOperation({ summary: 'Tipos de habitación a la venta de un alojamiento (precio, capacidad, régimen, cancelación)' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento' })
  async tiposHabitacion(@Param('id') id: string) {
    return this.alojamientosService.tiposPublicos(id);
  }

  @Post(':id/tipos-habitacion')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Crear un tipo de habitación (Admin o el proveedor del alojamiento)' })
  @ApiResponse({ status: 201, description: 'Tipo creado. El precio "desde" y las habitaciones del alojamiento se recalculan.' })
  @ApiResponse({ status: 409, description: 'Ya existe un tipo con ese código.' })
  async crearTipo(@Param('id') id: string, @Body() dto: CreateTipoHabitacionDto, @Req() req: any) {
    const tipo = await this.alojamientosService.crearTipo(id, dto, req.actorCatalogo);
    await this.auditar(req, 'Creó tipo de habitación', id, { tipo: tipo.codigo, precio: tipo.precio_noche });
    await this.invalidarCatalogo();
    return tipo;
  }

  @Patch(':id/tipos-habitacion/:tipoId')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Editar un tipo de habitación: precio, cupo, capacidad, régimen, activo… (id o código)' })
  @ApiResponse({ status: 409, description: 'Es el único tipo a la venta y se intenta desactivar.' })
  async actualizarTipo(@Param('id') id: string, @Param('tipoId') tipoId: string, @Body() dto: UpdateTipoHabitacionDto, @Req() req: any) {
    const tipo = await this.alojamientosService.actualizarTipo(id, tipoId, dto, req.actorCatalogo);
    await this.auditar(req, 'Editó tipo de habitación', id, { tipo: tipo.codigo, campos: Object.keys(dto) });
    await this.invalidarCatalogo();
    return tipo;
  }

  @Delete(':id/tipos-habitacion/:tipoId')
  @UseGuards(GestionAlojamientosGuard)
  @ApiBearerAuth()
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Eliminar un tipo de habitación (con reservas se desactiva para conservar el historial)' })
  @ApiResponse({ status: 200, description: '{ desactivado: true } si tenía reservas; { desactivado: false } si se borró.' })
  @ApiResponse({ status: 409, description: 'Es el único tipo a la venta.' })
  async eliminarTipo(@Param('id') id: string, @Param('tipoId') tipoId: string, @Req() req: any) {
    const resultado = await this.alojamientosService.eliminarTipo(id, tipoId, req.actorCatalogo);
    await this.auditar(req, resultado.desactivado ? 'Desactivó tipo de habitación' : 'Eliminó tipo de habitación', id, { tipo: tipoId });
    await this.invalidarCatalogo();
    return resultado;
  }
}
