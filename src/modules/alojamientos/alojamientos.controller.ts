import { Controller, Get, Param, Query, UseInterceptors, Header, Headers, Post, Put, Patch, Delete, Body, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { AlojamientosService } from './alojamientos.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { AlojamientoResponseDto } from './dto/alojamiento-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAlojamientosRequestDto } from './dto/search-alojamientos.dto';
import { SearchAlojamientosResponseDto } from './dto/search-response.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { CreateAlojamientoDto } from './dto/create-alojamiento.dto';
import { UpdateAlojamientoDto } from './dto/update-alojamiento.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationResponseDto } from './dto/reservation.dto';

@ApiTags('Alojamientos (BFF Integrador)')
@Controller('alojamientos')
export class AlojamientosController {
  constructor(private readonly alojamientosService: AlojamientosService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Búsqueda de alojamientos (soporta paginación y filtros)' })
  @ApiResponse({ status: 200, description: 'Resultados de la búsqueda', type: SearchAlojamientosResponseDto })
  async search(@Body() dto: SearchAlojamientosRequestDto) {
    return this.alojamientosService.search(dto);
  }

  @Post('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener detalles de múltiples alojamientos (Batch)' })
  @ApiResponse({ status: 200, description: 'Detalles de alojamientos' })
  async getDetailsBatch(@Body() dto: DetailsRequestDto) {
    return this.alojamientosService.getDetailsBatch(dto);
  }

  @Get('health')
  @ApiOperation({ summary: 'Healthcheck del microservicio de Alojamientos' })
  @ApiResponse({ status: 200, description: 'Servicio operativo' })
  async health() {
    return this.alojamientosService.health();
  }

  @Get('reservations')
  @ApiOperation({ summary: 'Consultar el historial de reservas de alojamientos' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  async getReservas() {
    return this.alojamientosService.getReservas();
  }

  @Get('reservations/:reservationId')
  @ApiOperation({ summary: 'Obtener detalle de una reserva de alojamiento' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.', type: ReservationResponseDto })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async getReservaById(@Param('reservationId') reservationId: string) {
    return this.alojamientosService.getReservaById(reservationId);
  }

  @Post('reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una reserva existente (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva a cancelar', type: 'string' })
  @ApiResponse({ status: 200, description: 'Reserva cancelada exitosamente.', type: ReservationResponseDto })
  async cancelarReserva(
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CancelReservationRequestDto,
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.alojamientosService.cancelarReserva(reservationId, dto, idempotencyKey);
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Obtener el listado de alojamientos (Caché habilitado)' })
  @ApiResponse({ status: 200, description: 'Listado de alojamientos recuperado exitosamente.' })
  @ApiResponse({ status: 503, description: 'Servicio de Alojamientos Externo no disponible.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.alojamientosService.findAll(query);
    // Agregando HATEOAS (Nivel 3 Richardson)
    result._links = {
      self: { href: `/api/v1/alojamientos?page=${query.page || 1}&limit=${query.limit || 10}`, type: 'GET' },
      next: { href: `/api/v1/alojamientos?page=${(query.page || 1) + 1}&limit=${query.limit || 10}`, type: 'GET' },
    };
    return result;
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo alojamiento' })
  @ApiResponse({ status: 201, description: 'El alojamiento ha sido creado exitosamente.', type: AlojamientoResponseDto })
  async create(@Body() dto: CreateAlojamientoDto) {
    return this.alojamientosService.create(dto);
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
        catalogo: { href: `/api/v1/alojamientos`, type: 'GET' },
      },
    };
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar datos de un alojamiento' })
  async replace(@Param('id') id: string, @Body() dto: CreateAlojamientoDto) {
    return this.alojamientosService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente un alojamiento' })
  async update(@Param('id') id: string, @Body() dto: UpdateAlojamientoDto) {
    return this.alojamientosService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un alojamiento' })
  async delete(@Param('id') id: string) {
    return this.alojamientosService.delete(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Consultar disponibilidad de habitaciones' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento' })
  @ApiResponse({ status: 200, description: 'Disponibilidad recuperada exitosamente.', type: AvailabilityResponseDto })
  async getAvailability(@Param('id') id: string, @Query('date') date: string) {
    return this.alojamientosService.getAvailability(id, date);
  }

  @Post(':id/reservations')
  @Header('X-API-Deprecation-Date', '2027-12-31')
  @ApiOperation({ summary: 'Reservar un alojamiento (Requiere Idempotency-Key)' })
  @ApiParam({ name: 'id', description: 'ID del alojamiento', type: 'string' })
  @ApiBody({ type: ReservationRequestDto })
  @ApiResponse({ status: 201, description: 'Reserva confirmada', type: ReservationResponseDto })
  @ApiResponse({ status: 409, description: 'Conflicto de Idempotencia (Reserva ya procesada).' })
  async reservar(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ReservationRequestDto,
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }
    return this.alojamientosService.reservar(id, dto, idempotencyKey);
  }
}
