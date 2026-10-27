import { Controller, Post, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { TelemetryEventDto } from './dto/telemetry-event.dto';
import { TelemetryRateLimitGuard } from './telemetry-rate-limit.guard';
import { TelemetryBodySizeInterceptor } from './telemetry-body-size.interceptor';

@ApiTags('Telemetría')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('events')
  @UseGuards(TelemetryRateLimitGuard)
  @UseInterceptors(TelemetryBodySizeInterceptor)
  @ApiOperation({
    summary: 'Registrar un evento de telemetría del frontend',
    description: 'Guarda eventos del embudo de conversión (búsqueda, detalle, checkout, pago) usados por Observabilidad en el panel de administración.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['event_name'],
      properties: {
        event_name: { type: 'string', example: 'search_performed' },
        session_id: { type: 'string', example: 'sess-123' },
        user_id: { type: 'string', format: 'uuid', nullable: true },
        vertical: { type: 'string', example: 'vuelos' },
        device: { type: 'string', example: 'desktop' },
        properties: { type: 'object', example: { origen: 'UIO', destino: 'GYE' } },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Evento guardado ({ success: true }).' })
  @ApiResponse({ status: 400, description: 'El evento o el DTO no cumple la lista blanca.' })
  @ApiResponse({ status: 413, description: 'El cuerpo supera el tamaño máximo permitido.' })
  @ApiResponse({ status: 429, description: 'Límite de solicitudes excedido.' })
  async trackEvent(@Body() body: TelemetryEventDto) {
    return this.telemetryService.trackEvent(body);
  }
}
