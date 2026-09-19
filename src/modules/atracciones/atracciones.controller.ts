import { Controller, Get, Param, Query } from '@nestjs/common';
import { AtraccionesService } from './atracciones.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Atracciones (BFF Integrador)')
@Controller('atracciones')
export class AtraccionesController {
  constructor(private readonly atraccionesService: AtraccionesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener el listado de atracciones (Consumiendo API externa)' })
  @ApiResponse({ status: 200, description: 'Listado de atracciones recuperado exitosamente desde el microservicio externo.' })
  @ApiResponse({ status: 503, description: 'Servicio de Atracciones Externo no disponible.' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.atraccionesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el detalle de una atracción por su ID (Consumiendo API externa)' })
  @ApiParam({ name: 'id', description: 'ID de la atracción', type: 'string' })
  @ApiResponse({ status: 200, description: 'Detalle de la atracción.' })
  @ApiResponse({ status: 404, description: 'Not Found. La atracción no existe en el sistema externo.' })
  @ApiResponse({ status: 503, description: 'Servicio de Atracciones Externo no disponible.' })
  findOne(@Param('id') id: string) {
    return this.atraccionesService.findOne(id);
  }
}
