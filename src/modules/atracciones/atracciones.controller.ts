import { Controller, Get, Param, Query, UseInterceptors, Header, Headers, Post, Put, Patch, Delete, Body, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
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
import { ReservationRequestDto, CancelReservationRequestDto, ReservationResponseDto } from './dto/reservation.dto';

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

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad de cupos' })
  @ApiParam({ name: 'id', description: 'ID de la atracción' })
  @ApiResponse({ status: 200, description: 'Disponibilidad recuperada exitosamente.', type: AvailabilityResponseDto })
  async getAvailability(@Param('id') id: string, @Query('date') date: string) {
    return this.atraccionesService.getAvailability(id, date);
  }

  @Post(':id/reservations')
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Reservar una atracción (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'id', description: 'ID de la atracción', type: 'string' })
  @ApiBody({ type: ReservationRequestDto })
  @ApiResponse({ status: 201, description: 'Reserva confirmada', type: ReservationResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia (Reserva ya procesada).' })
  async reservar(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ReservationRequestDto
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.atraccionesService.reservar(id, dto, idempotencyKey);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva a cancelar', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reserva cancelada exitosamente.', type: ReservationResponseDto })
  async cancelarReserva(
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CancelReservationRequestDto
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.atraccionesService.cancelarReserva(reservationId, dto, idempotencyKey);
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Consultar el historial de reservas del usuario' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  async getReservas() {
    return this.atraccionesService.getReservas();
  }

  @Get('reservations/:reservationId')
  @ApiOperation({ summary: 'Obtener detalle de una reserva específica' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.', type: ReservationResponseDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async getReservaById(@Param('reservationId') reservationId: string) {
    return this.atraccionesService.getReservaById(reservationId);
  }
}
