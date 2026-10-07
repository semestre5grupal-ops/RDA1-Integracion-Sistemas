import { Controller, Post, Body } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';

@ApiTags('Telemetría')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('events')
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
  async trackEvent(@Body() body: any) {
    return this.telemetryService.trackEvent(body);
  }
}
