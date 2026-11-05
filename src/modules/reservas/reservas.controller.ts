import { Controller, Post, Get, Body, Param, Headers, Req, HttpCode, HttpStatus, Version } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { ReservasService } from './reservas.service';
import { CheckinNotificationDto } from './dto/checkin-notification.dto';
import { SincronizarClienteDto } from './dto/sincronizar-cliente.dto';

@ApiTags('Reservas y Check-in Cross-Platform (RDA2)')
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  /**
   * Endpoint Receptor de Check-in Presencial
   * Soporta tanto v2 (Alojamientos, Vuelos) como v3 (Autos, Atracciones)
   * Disparado por la web del socio cuando el administrador confirma la asistencia.
   */
  @Post(':id/checkin')
  @Version(['1', '2', '3'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Notificar confirmación de asistencia presencial (Check-in) desde la web del socio',
    description: 'Recibe la confirmación física de llegada del cliente emitida por el administrador del socio, transicionando la reserva a CONFIRMADO_ASISTIDO.',
  })
  @ApiParam({ name: 'id', description: 'ID de reserva o localizador externo', example: 'CAR532X9' })
  @ApiHeader({ name: 'X-API-Key', required: false, description: 'API Key del socio para autenticación B2B' })
  @ApiHeader({ name: 'X-Correlation-Id', required: false, description: 'ID de correlación para trazabilidad W3C' })
  @ApiResponse({ status: 200, description: 'Asistencia presencial confirmada exitosamente en Booking Central.' })
  async notificarCheckin(
    @Param('id') id: string,
    @Body() dto: CheckinNotificationDto,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Req() req?: any,
  ) {
    const rawApiKey = apiKey || req?.headers?.['X-Api-Key'] || req?.headers?.['x_api_key'];
    const safeCorrId = correlationId || req?.headers?.['x-correlation-id'];
    return this.reservasService.confirmarCheckin(id, dto, rawApiKey, safeCorrId);
  }

  @Post('notificar-checkin')
  @Version(['1', '2', '3'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Notificar confirmación de asistencia presencial (Check-in Body Payload)' })
  async notificarCheckinAlias(
    @Body() dto: CheckinNotificationDto,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
    @Req() req?: any,
  ) {
    const rawApiKey = apiKey || req?.headers?.['X-Api-Key'] || req?.headers?.['x_api_key'];
    const safeCorrId = correlationId || req?.headers?.['x-correlation-id'];
    const targetId = dto.reserva_id || dto.pnr || dto.codigo_reserva || dto.localizador || (dto as any).id || 'UNKNOWN';
    return this.reservasService.confirmarCheckin(targetId, dto, rawApiKey, safeCorrId);
  }

  /**
   * Sincronización previa del cliente con el socio (Fase 1)
   * Evita duplicados consultando o creando al cliente en la base del socio.
   */
  @Post('clientes/sincronizar')
  @Version(['2', '3'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar cliente local con la base del socio (Cross-Platform)' })
  @ApiResponse({ status: 200, description: 'Mapeo verificado o generado exitosamente.' })
  async sincronizarCliente(@Body() dto: SincronizarClienteDto) {
    return this.reservasService.sincronizarClienteConSocio(dto);
  }

  /**
   * Consultar todos los socios con los que un cliente está sincronizado
   */
  @Get('clientes/:clienteId/mapeos')
  @Version(['2', '3'])
  @ApiOperation({ summary: 'Consultar mapeos de identidades cross-platform de un cliente' })
  @ApiParam({ name: 'clienteId', description: 'ID del cliente en Booking (UUID)' })
  async getMapeos(@Param('clienteId') clienteId: string) {
    return this.reservasService.getMapeosPorCliente(clienteId);
  }

  /**
   * Consultar estado en tiempo real de una reserva
   */
  @Get(':id/estado')
  @Version(['2', '3'])
  @ApiOperation({ summary: 'Consultar el estado del ciclo de vida de una reserva (RESERVADO / CONFIRMADO_ASISTIDO)' })
  @ApiParam({ name: 'id', description: 'ID o localizador de la reserva' })
  async getEstado(@Param('id') id: string) {
    return this.reservasService.getEstadoReserva(id);
  }
}

