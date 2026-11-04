import { Controller, Get, Param, UseGuards, Version } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ObservabilidadService } from './observabilidad.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';

@ApiTags('Trazabilidad y Observabilidad Distribuida')
@Controller('observabilidad')
export class ObservabilidadController {
  constructor(private readonly observabilidadService: ObservabilidadService) {}

  @Get('trazas/:correlationId')
  @Version('2')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANTENIMIENTO')
  @ApiSecurity('SupabaseBearer')
  @ApiSecurity('AdminKey')
  @ApiOperation({
    summary: 'Consultar el grafo completo de ejecución y trazas de un proceso (Saga + REST + Eventos)',
    description:
      'Reconstruye el árbol jerárquico de ejecución distribuida (DAG) correspondiente a un correlation_id transaccional para renderizar en el frontend nodos en verde (OK) y rojo (fallido/compensado).',
  })
  @ApiParam({
    name: 'correlationId',
    description: 'Identificador de correlación universal del proceso de negocio',
    example: 'SAGA-F82B14',
  })
  @ApiResponse({
    status: 200,
    description: 'Grafo acíclico dirigido (DAG) de spans y eventos del proceso distribuido.',
  })
  @ApiResponse({ status: 401, description: 'No autenticado o token ausente.' })
  @ApiResponse({ status: 403, description: 'No autorizado para rol no ADMIN/MANTENIMIENTO.' })
  @ApiResponse({ status: 404, description: 'Traza no encontrada para el correlation_id indicado.' })
  async obtenerTrazaGrafo(@Param('correlationId') correlationId: string) {
    return this.observabilidadService.obtenerTrazaGrafo(correlationId);
  }
}
