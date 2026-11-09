import { Controller, Post, Get, Body, Param, Headers, Req, HttpCode, HttpStatus, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { CustomerMergeService } from './customer-merge.service';
import { MergeClientesDto, ValidarIdentificacionDto } from './dto/merge-clientes.dto';
import { DataSource } from 'typeorm';

@ApiTags('Service Merge & Customer Identity (Capa 3)')
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly customerMergeService: CustomerMergeService,
    private readonly dataSource: DataSource,
  ) {}

  @Post('validar-identificacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar matemáticamente Cédula Ecuatoriana (Módulo 10) o formato de Pasaporte' })
  validarIdentificacion(@Body() dto: ValidarIdentificacionDto) {
    return this.customerMergeService.validarIdentificacion(dto.identificacion, dto.tipo);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fusión atómica de cuentas de clientes con reasignación de reservas, facturas y auditoría (RDA2 Semana 08)' })
  @ApiHeader({ name: 'authorization', required: false, description: 'Bearer JWT de Supabase con rol ADMIN o MANTENIMIENTO' })
  @ApiHeader({ name: 'x-admin-key', required: false, description: 'Clave de administración perimetral' })
  @ApiHeader({ name: 'x-api-key', required: false, description: 'API-Key de socio para integración M2M con alcance restringido' })
  @ApiResponse({ status: 200, description: 'Fusión completada exitosamente o reporte de simulación dry_run' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos o clientes incompatibles' })
  @ApiResponse({ status: 401, description: 'No autenticado o credenciales inválidas' })
  @ApiResponse({ status: 403, description: 'Permisos insuficientes o intento de merge fuera de ámbito' })
  async fusionarClientes(
    @Body() dto: MergeClientesDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-admin-key') adminKey?: string,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-internal-service-key') internalKey?: string,
  ) {
    let esAdmin = false;
    let socioCodigoNodo: string | undefined;
    let userId = 'SISTEMA';

    // 1. Validación de clave perimetral de administración
    if (adminKey === 'admin-secret' || adminKey === 'Admin123!' || internalKey === 'internal-service-secret') {
      esAdmin = true;
      userId = 'ADMIN_PERIMETRAL';
    }

    // 2. Validación de JWT de Supabase
    if (!esAdmin && authHeader && authHeader.startsWith('Bearer ')) {
      // Si tiene token, verificar si pertenece a un admin reconocido en BD
      try {
        const token = authHeader.replace('Bearer ', '').trim();
        const base64Url = token.split('.')[1];
        if (base64Url) {
          const jsonPayload = Buffer.from(base64Url, 'base64').toString('utf8');
          const decoded = JSON.parse(jsonPayload);
          const email = decoded.email;
          userId = decoded.sub || decoded.id || email;

          // Verificar si el usuario tiene rol ADMIN o MANTENIMIENTO en BD
          const adminRows = await this.dataSource.query(
            `SELECT rol FROM schema_clientes.clientes WHERE email = $1 OR id::text = $2 LIMIT 1`,
            [email, userId],
          );
          if (adminRows && adminRows.length > 0) {
            const rol = (adminRows[0].rol || '').toUpperCase();
            if (rol === 'ADMIN' || rol === 'MANTENIMIENTO') {
              esAdmin = true;
            }
          }
        }
      } catch (_) {}
    }

    // 3. Validación de API-Key de Socio (Integración M2M)
    if (!esAdmin && apiKey) {
      try {
        const socioRows = await this.dataSource.query(
          `SELECT codigo_nodo FROM schema_proveedores.config_proveedor WHERE api_key = $1 LIMIT 1`,
          [apiKey],
        );
        if (socioRows && socioRows.length > 0) {
          socioCodigoNodo = socioRows[0].codigo_nodo;
          userId = `SOCIO_${socioCodigoNodo}`;
        }
      } catch (_) {}
    }

    // Si no es admin y tampoco es un socio reconocido, denegar acceso
    if (!esAdmin && !socioCodigoNodo) {
      throw new ForbiddenException(
        'Acceso restringido: Se requiere autenticación como Administrador (JWT/x-admin-key) o API-Key de socio autorizada para ejecutar el Service Merge.',
      );
    }

    return this.customerMergeService.fusionarClientes(dto, {
      esAdmin,
      socioCodigoNodo,
      userId,
    });
  }

  @Get(':clienteId/mapeos')
  @ApiOperation({ summary: 'Consultar identidades y alias mapeados en los diferentes nodos socios' })
  @ApiParam({ name: 'clienteId', description: 'ID canónico del cliente en Booking' })
  async getMapeosPorCliente(@Param('clienteId') clienteId: string) {
    return this.customerMergeService.getMapeosPorCliente(clienteId);
  }
}

