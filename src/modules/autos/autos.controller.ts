import { Controller, Get, Post, Put, Body, Param, Query, Headers, UseInterceptors, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AutosService, SearchAutosDto } from './autos.service';
import { CreateAutoOrderDto } from './dto/create-auto-order.dto';
import { CheckinAutoDto } from './dto/checkin-auto.dto';
import { CheckinEntregaDto } from './dto/checkin-entrega.dto';
import { CheckinDevolucionDto } from './dto/checkin-devolucion.dto';
import { CancelAutoOrderDto } from './dto/cancel-auto-order.dto';
import { UpdateContratoPromocionesAutosDto } from './dto/contrato-promociones.dto';
import { RegistroMantenimientoDto } from './dto/registro-mantenimiento.dto';
import { ApiTags, ApiOperation, ApiHeader, ApiParam, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';

@ApiTags('Autos (BFF Integrador v2)')
@Controller('autos')
export class AutosController {
  constructor(private readonly autosService: AutosService) {}

  // 1. Healthcheck y Telemetría de Nodo (CE01)
  @Get('health')
  @ApiOperation({ summary: 'Healthcheck y telemetría de nodo de Autos (Semáforo 🟢/🔴 RDA2 CE01)' })
  @ApiResponse({ status: 200, description: 'Estado de salud operativo y telemetría de nodo' })
  getHealth() {
    return this.autosService.getHealth();
  }

  // 2. Acuerdo Comercial B2B Promociones y Combos (RDA2 §9)
  @Get('promociones/contrato')
  @ApiOperation({ summary: 'Consultar acuerdo comercial B2B para combos y promociones (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Acuerdo comercial vigente de promociones y combos' })
  getPromocionesContrato() {
    return this.autosService.getPromocionesContrato();
  }

  @Put('promociones/contrato')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar o formalizar acuerdo B2B de promociones y combos (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Acuerdo de promociones actualizado exitosamente' })
  updatePromocionesContrato(@Body() dto: UpdateContratoPromocionesAutosDto) {
    return this.autosService.updatePromocionesContrato(dto);
  }

  // 3. Feed Outbox de Eventos Asíncronos (EDA)
  @Get('eventos')
  @ApiOperation({ summary: 'Feed Outbox de eventos asíncronos para streaming EDA (RabbitMQ / Kafka)' })
  @ApiResponse({ status: 200, description: 'Lista de eventos asíncronos CloudEvents' })
  getEventos(@Query('limit') limit?: number) {
    return this.autosService.getEventos({ limit });
  }

  // 4. Catálogo y Búsqueda
  @Get()
  @ApiOperation({ summary: 'Listar catálogo general de vehículos disponibles' })
  @ApiResponse({ status: 200, description: 'Catálogo de vehículos disponibles (excluye autos en limpieza)' })
  getCatalog(@Query() query: any) {
    return this.autosService.getCatalog(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Búsqueda de vehículos (Catálogo Híbrido GET)' })
  searchGet(
    @Query() query: any,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    return this.autosService.search(query || {}, correlationId);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Búsqueda avanzada de vehículos (Catálogo Híbrido v2 con Cooldown de 2h)' })
  @ApiResponse({ status: 200, description: 'Catálogo de vehículos disponibles (excluye autos en limpieza/cooldown)' })
  search(
    @Body() dto: SearchAutosDto,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    return this.autosService.search(dto, correlationId);
  }

  // 5. Estado de la Flota (Panel 2 - Cooldown 2h y Alertas de Odómetro)
  @Get('flota')
  @ApiOperation({ summary: 'Consultar estado operativo de toda la flota con cronómetro de cooldown en vivo (Panel 2)' })
  @ApiResponse({ status: 200, description: 'Flota completa con conteo regresivo de 2 horas y alertas de kilometraje.' })
  getFlota() {
    return this.autosService.getFlota();
  }

  // 6. Órdenes y Reservas (Gestión Admin)
  @Get('orders')
  @ApiOperation({ summary: 'Obtener historial de órdenes (Admin)' })
  getOrders() {
    return this.autosService.getOrders();
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Obtener detalles de la orden por ID o PNR' })
  @ApiParam({ name: 'orderId', description: 'ID o PNR de la orden' })
  getOrderById(@Param('orderId') orderId: string) {
    return this.autosService.getOrderById(orderId);
  }

  @Get('reservas/:orderId')
  @ApiOperation({ summary: 'Obtener detalles de la reserva por ID o PNR (Alias canónico v2)' })
  @ApiParam({ name: 'orderId', description: 'ID o PNR de la reserva' })
  getReservaById(@Param('orderId') orderId: string) {
    return this.autosService.getOrderById(orderId);
  }

  // 7. Cancelación y Compensación Saga LIFO con Reembolso 100%
  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una orden de renta (Compensación Saga LIFO con Reembolso 100%)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  cancelOrder(
    @Param('orderId') orderId: string,
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Body() cancelData: CancelAutoOrderDto
  ) {
    return this.autosService.cancelOrder(orderId, cancelData, idempotencyKey);
  }

  @Post('reservas/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva de auto (Alias v2 para orquestador Saga)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  cancelReserva(
    @Param('orderId') orderId: string,
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Body() cancelData: CancelAutoOrderDto
  ) {
    return this.autosService.cancelOrder(orderId, cancelData, idempotencyKey);
  }

  // 8. Creación de Reservas (Transacción Saga)
  @Post('orders/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear orden/reserva de vehículo con Idempotency-Key y Voucher Digital QR' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'X-Correlation-Id', required: false })
  createOrder(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId: string,
    @Body() orderData: CreateAutoOrderDto
  ) {
    const key = idempotencyKey || orderData.idempotency_key || `idem-${Date.now()}`;
    return this.autosService.createOrder(orderData, key, correlationId);
  }

  @Post('reservas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear reserva de vehículo (Alias canónico v2)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createReserva(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId: string,
    @Body() orderData: CreateAutoOrderDto
  ) {
    const key = idempotencyKey || orderData.idempotency_key || `idem-${Date.now()}`;
    return this.autosService.createOrder(orderData, key, correlationId);
  }

  // 9. Check-in Digital Anticipado (Fast-Track)
  @Post('reservas/:id/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in digital anticipado para retiro express de llaves (RDA2)' })
  @ApiParam({ name: 'id', description: 'ID o PNR de la reserva' })
  @ApiResponse({ status: 200, description: 'Check-in confirmado con voucher QR para mostrador' })
  checkin(
    @Param('id') id: string,
    @Body() dto: CheckinAutoDto
  ) {
    return this.autosService.checkin(id, dto);
  }

  @Post('orders/:id/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in digital anticipado (Alias de compatibilidad v2)' })
  @ApiParam({ name: 'id', description: 'ID o PNR de la orden' })
  checkinOrder(
    @Param('id') id: string,
    @Body() dto: CheckinAutoDto
  ) {
    return this.autosService.checkin(id, dto);
  }

  // 10. Check-in de Entrega en Mostrador (Licencia física y Odómetro Inicial)
  @Post('orders/:id/checkin-entrega')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in de Entrega en mostrador (Licencia y Odómetro Inicial) (Cátedra RDA2 §5)' })
  checkinEntrega(
    @Param('id') id: string,
    @Body() dto: CheckinEntregaDto
  ) {
    return this.autosService.checkinEntrega(id, dto);
  }

  // 11. Check-in de Devolución en Mostrador (Retorno, Odómetro Final y Activación Cooldown 2h)
  @Post('orders/:id/checkin-devolucion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in de Retorno y activación inmediata de Cooldown de Limpieza de 2h (Cátedra RDA2 §5)' })
  checkinDevolucion(
    @Param('id') id: string,
    @Body() dto: CheckinDevolucionDto
  ) {
    return this.autosService.checkinDevolucion(id, dto);
  }

  // 12. Devolución Directa del Vehículo
  @Post(':id/devolucion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar devolución del auto e iniciar Cooldown de Limpieza de 2 Horas (RDA2 §5)' })
  @ApiParam({ name: 'id', description: 'ID del vehículo devuelto' })
  @ApiResponse({ status: 200, description: 'Estado cambiado a EN_LIMPIEZA con timestamp de 2 horas' })
  registrarDevolucion(@Param('id') id: string) {
    return this.autosService.registrarDevolucion(id);
  }

  // 13. Registro Técnico de Mantenimiento y Odómetro (Rol MANTENIMIENTO / ADMIN)
  @Post(':id/mantenimiento/registro')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.MANTENIMIENTO, Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Role', description: 'Rol técnico para evaluación (MANTENIMIENTO o ADMIN)', required: false })
  @ApiOperation({ summary: 'Registro técnico de odómetro y alerta preventiva de kilometraje (Rol MANTENIMIENTO / ADMIN RDA2 §5)' })
  @ApiParam({ name: 'id', description: 'ID del vehículo' })
  @ApiResponse({ status: 200, description: 'Registro asentado con algoritmo de alerta preventiva' })
  @ApiResponse({ status: 401, description: 'No autenticado o credencial ausente' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (requiere MANTENIMIENTO o ADMIN)' })
  registrarMantenimiento(
    @Param('id') id: string,
    @Body() dto: RegistroMantenimientoDto
  ) {
    return this.autosService.registrarMantenimiento(id, dto);
  }

  // 14. Opciones de Cobertura (Protección Básica vs Cobertura Total)
  @Get(':id/coberturas')
  @ApiOperation({ summary: 'Consultar opciones de cobertura (Protección Básica vs Cobertura Total RDA2)' })
  @ApiParam({ name: 'id', description: 'ID del vehículo' })
  @ApiResponse({ status: 200, description: 'Desglose de franquicias, depósitos y coberturas' })
  getCoberturas(@Param('id') id: string) {
    return this.autosService.getCoberturas(id);
  }

  // 15. Detalle Técnico de Vehículo por ID
  @Get(':id')
  @ApiOperation({ summary: 'Consultar detalle técnico de un vehículo por ID' })
  @ApiParam({ name: 'id', description: 'ID del vehículo' })
  @ApiResponse({ status: 200, description: 'Detalle técnico y especificaciones del vehículo' })
  getAutoById(@Param('id') id: string) {
    return this.autosService.getAutoById(id);
  }

  // --- Endpoints de Catálogo y Compatibilidad Legacy --- //

  @Post('depots')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Consultar lista de agencias de renta' })
  getDepots() {
    return this.autosService.getDepots();
  }

  @Post('constants')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Consultar constantes del sistema' })
  getConstants() {
    return this.autosService.getConstants();
  }

  @Post('suppliers')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Listar proveedores de renta de autos' })
  getSuppliers() {
    return this.autosService.getSuppliers();
  }

  // --- Endpoints Administrativos para CRUD de Autos Locales --- //
  
  @Post()
  @ApiOperation({ summary: 'Crear auto local (Admin)' })
  createAutoLocal(@Body() autoData: any) {
    return this.autosService.createAutoLocal(autoData);
  }

  @Post(':id/delete')
  @ApiOperation({ summary: 'Eliminar auto local (Admin)' })
  deleteAutoLocal(@Param('id') id: string) {
    return this.autosService.deleteAutoLocal(id);
  }
}
