import { Controller, Get, Param, Query, UseInterceptors, Header, Headers, Post, Put, Patch, Delete, Body, HttpCode, HttpStatus, HttpException, UseGuards, Req } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { AtraccionesService } from './atracciones.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AtraccionResponseDto } from './dto/atraccion-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAtraccionesRequestDto } from './dto/search-atracciones.dto';
import { SearchAtraccionesResponseDto } from './dto/search-response.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationResponseDto, CheckinAtraccionDto } from './dto/reservation.dto';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';

@ApiTags('Atracciones (BFF Integrador)')
@Controller('atracciones')
export class AtraccionesController {
  constructor(private readonly atraccionesService: AtraccionesService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Búsqueda de atracciones (soporta paginación por tokens)' })
  @ApiResponse({ status: 200, description: 'Resultados de la búsqueda', type: SearchAtraccionesResponseDto })
  async search(@Body() dto: SearchAtraccionesRequestDto) {
    return this.atraccionesService.search(dto);
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener detalles de múltiples atracciones (Batch)' })
  @ApiResponse({ status: 200, description: 'Detalles de atracciones', type: SearchAtraccionesResponseDto })
  async getDetailsBatch(@Body() dto: DetailsRequestDto) {
    return this.atraccionesService.getDetailsBatch(dto);
  }

  @Get('categorias/arbol')
  @ApiOperation({ summary: 'Consultar el árbol jerárquico recursivo de categorías (RDA2)' })
  @ApiResponse({ status: 200, description: 'Estructura jerárquica padre-hija con indicadores de comida, guía y transporte.' })
  async getCategoriasArbol() {
    return this.atraccionesService.getCategoriasArbol();
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Consultar listado plano de categorías con indicadores de inclusión (RDA2)' })
  @ApiResponse({ status: 200, description: 'Listado de categorías con banderas de comida, guía y transporte.' })
  async getCategorias(@Query('padre_id') padreId?: string) {
    return this.atraccionesService.getCategorias(padreId);
  }

  @Post('categorias')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Crear una categoría en el árbol jerárquico (RDA2) — solo ADMIN (Panel 3)' })
  @ApiResponse({ status: 403, description: 'Requiere rol ADMIN' })
  async crearCategoria(@Body() dto: any) {
    return this.atraccionesService.crearCategoria(dto);
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio' })
  @ApiResponse({ status: 200, description: 'Servicio operativo' })
  async health() {
    return this.atraccionesService.health();
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Obtener el listado de atracciones (Caché habilitado)' })
  @ApiResponse({ status: 200, description: 'Listado de atracciones recuperado exitosamente.' })
  @ApiResponse({ status: 503, description: 'Servicio de Atracciones Externo no disponible.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.atraccionesService.findAll(query);
    // Agregando HATEOAS (Nivel 3 Richardson)
    result._links = {
      self: { href: `/api/v1/atracciones?page=${query.page || 1}&limit=${query.limit || 10}`, type: 'GET' },
      next: { href: `/api/v1/atracciones?page=${(query.page || 1) + 1}&limit=${query.limit || 10}`, type: 'GET' },
    };
    return result;
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una nueva atracción' })
  @ApiResponse({ status: 201, description: 'La atracción ha sido creada exitosamente.', type: AtraccionResponseDto })
  async create(@Body() dto: CreateAtraccionDto) {
    return this.atraccionesService.create(dto);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente con compensación Saga y reembolso' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva a cancelar', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reserva cancelada exitosamente.', type: ReservationResponseDto })
  async cancelarReserva(
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId: string,
    @Body() dto: CancelReservationRequestDto,
    @Req() req: any
  ) {
    const key = idempotencyKey || req.headers?.['idempotency-key'] || `idem-cancel-${Date.now()}`;
    const cId = correlationId || req.headers?.['x-correlation-id'] || `corr-cancel-${Date.now()}`;
    return this.atraccionesService.cancelarReserva(reservationId, dto, key, cId);
  }

  @Post('reservas/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente (Alias v2 OpenAPI)' })
  async cancelarReservaAlias(
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId: string,
    @Body() dto: CancelReservationRequestDto,
    @Req() req: any
  ) {
    const key = idempotencyKey || req.headers?.['idempotency-key'] || `idem-cancel-${Date.now()}`;
    const cId = correlationId || req.headers?.['x-correlation-id'] || `corr-cancel-${Date.now()}`;
    return this.atraccionesService.cancelarReserva(reservationId, dto, key, cId);
  }

  @Get('reservations')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Consultar el historial de reservas del usuario (Requiere autenticación JWT)' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  async getReservas(@Req() req: any) {
    return this.atraccionesService.getReservas(req.user?.email);
  }

  @Get('reservations/:reservationId')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Obtener detalle de una reserva específica (Requiere autenticación JWT)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.', type: ReservationResponseDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async getReservaById(@Param('reservationId') reservationId: string, @Req() req: any) {
    return this.atraccionesService.getReservaById(reservationId);
  }

  @Get('reservas/:reservationId')
  @ApiOperation({ summary: 'Obtener detalle de una reserva específica por ID o código (RDA2 OpenAPI v2)' })
  @ApiParam({ name: 'reservationId', description: 'ID o PNR de la reserva', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva recuperado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async getReservaByIdAlias(@Param('reservationId') reservationId: string) {
    return this.atraccionesService.getReservaById(reservationId);
  }

  @Post('reservas/:reservationId/checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Realizar Check-in presencial con QR y asignación de guía (RDA2)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Check-in exitoso con voucher digital verificado.' })
  async checkin(
    @Param('reservationId') reservationId: string,
    @Body() dto: CheckinAtraccionDto
  ) {
    return this.atraccionesService.checkin(reservationId, dto);
  }

  @Post('reservas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear reserva de atracción (Contrato OpenAPI v2 con 4 edades y QR)' })
  @ApiResponse({ status: 201, description: 'Reserva confirmada exitosamente con voucher QR y localizador PNR.' })
  @ApiResponse({ status: 409, description: 'Sin cupos disponibles (OUT_OF_STOCK) o conflicto de idempotencia.' })
  async reservarAlias(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: any,
  ) {
    const key = idempotencyKey || dto.idempotency_key || `idem-${Date.now()}`;
    const id = dto.atraccion_id || dto.atraccionId || dto.id_atraccion || dto.id || 'PRhu4UBTWPBC';
    return this.atraccionesService.reservar(id, dto, key);
  }

  @Get('promociones/contrato')
  @ApiOperation({ summary: 'Consultar el acuerdo B2B de promociones y combos pactado con el socio (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Términos del acuerdo comercial de promociones y combos.' })
  async getPromocionesContrato() {
    return this.atraccionesService.getPromocionesContrato();
  }

  @Put('promociones/contrato')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Formalizar o actualizar acuerdo comercial B2B para combos y descuentos máximos (Cátedra RDA2 §9)' })
  @ApiResponse({ status: 200, description: 'Acuerdo comercial actualizado exitosamente.' })
  async updatePromocionesContrato(@Body() dto: any) {
    return this.atraccionesService.updatePromocionesContrato(dto);
  }

  @Get('eventos')
  @ApiOperation({ summary: 'Consultar feed Outbox de eventos transaccionales para streaming RabbitMQ/Kafka' })
  @ApiResponse({ status: 200, description: 'Listado de eventos de dominio generados por la vertical.' })
  async getEventosOutbox(@Query('limit') limit: number) {
    return this.atraccionesService.getEventosOutbox(Number(limit) || 20);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad de cupos' })
  @ApiParam({ name: 'id', description: 'ID de la atracción' })
  @ApiResponse({ status: 200, description: 'Disponibilidad recuperada exitosamente.', type: AvailabilityResponseDto })
  async getAvailability(@Param('id') id: string, @Query('date') date: string) {
    return this.atraccionesService.getAvailability(id, date);
  }

  @Get(':id/disponibilidad')
  @ApiOperation({ summary: 'Consultar disponibilidad de turnos y cupos en tiempo real (RDA2)' })
  @ApiParam({ name: 'id', description: 'ID de la atracción' })
  @ApiResponse({ status: 200, description: 'Lista de turnos horarios con aforo disponible.' })
  async getDisponibilidadEs(@Param('id') id: string, @Query('date') date: string) {
    return this.atraccionesService.getAvailability(id, date);
  }

  @Post(':id/reservations')
  @UseGuards(SupabaseAuthGuard)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Reservar una atracción (Requiere autenticación JWT e Idempotency-Key)' })
  @ApiParam({ name: 'id', description: 'ID de la atracción', type: 'string' })
  @ApiBody({ type: ReservationRequestDto })
  @ApiResponse({ status: 201, description: 'Reserva confirmada', type: ReservationResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia (Reserva ya procesada).' })
  async reservar(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ReservationRequestDto,
    @Req() req: any
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.atraccionesService.reservar(id, dto, idempotencyKey);
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Obtener el detalle de una atracción por su ID' })
  @ApiParam({ name: 'id', description: 'ID de la atracción', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la atracción.', type: AtraccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe.' })
  async findOne(@Param('id') id: string) {
    const result = await this.atraccionesService.findOne(id);
    // Agregando HATEOAS
    return {
      ...result,
      _links: {
        self: { href: `/api/v1/atracciones/${id}`, type: 'GET' },
        reservar: { href: `/api/v1/atracciones/${id}/reservations`, type: 'POST' },
        catalogo: { href: `/api/v1/atracciones`, type: 'GET' }
      }
    };
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos de una atracción' })
  async replace(@Param('id') id: string, @Body() dto: CreateAtraccionDto) {
    return this.atraccionesService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente una atracción' })
  async update(@Param('id') id: string, @Body() dto: UpdateAtraccionDto) {
    return this.atraccionesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una atracción' })
  async delete(@Param('id') id: string) {
    return this.atraccionesService.delete(id);
  }
}

