import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminErrorsInterceptor } from './admin-errors.interceptor';
import { AdminProveedoresService, SolicitudProveedorInput } from './admin-proveedores.service';
import { actorDesdeRequest } from './admin-audit.service';

/**
 * Formulario público "Quiero ser proveedor". No requiere sesión: cualquier
 * empresa puede postularse; el administrador decide si la aprueba.
 */
@ApiTags('Proveedores')
@Controller('proveedores')
@UseInterceptors(AdminErrorsInterceptor)
export class ProveedoresPublicController {
  constructor(private readonly proveedores: AdminProveedoresService) {}

  @Post('solicitudes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enviar solicitud para ser proveedor',
    description: 'Guarda la postulación como PENDIENTE. El administrador la aprueba o rechaza desde el panel (Soporte → Moderación).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['empresa', 'ruc', 'tipo', 'contactoNombre', 'email', 'telefono'],
      properties: {
        empresa: { type: 'string', example: 'Hostal La Costa S.A.' },
        ruc: { type: 'string', example: '1790012345001', description: '13 dígitos' },
        tipo: { type: 'string', enum: ['vuelos', 'autos', 'atracciones', 'hospedaje'] },
        contactoNombre: { type: 'string', example: 'María Pérez' },
        email: { type: 'string', format: 'email', example: 'contacto@hostallacosta.ec' },
        telefono: { type: 'string', example: '+593 99 123 4567' },
        ciudad: { type: 'string', example: 'Montañita' },
        sitioWeb: { type: 'string', example: 'https://hostallacosta.ec' },
        descripcion: { type: 'string', example: '12 habitaciones frente al mar.' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Solicitud registrada (estado PENDIENTE).' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 409, description: 'Ya hay una solicitud pendiente con ese RUC o correo.' })
  async crear(@Body() body: SolicitudProveedorInput, @Req() req: any) {
    return this.proveedores.crear(body, actorDesdeRequest(req).ip);
  }
}
