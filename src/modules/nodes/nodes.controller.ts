import { Controller, Get, Post, Put, Patch, Delete, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiHeader, ApiBody } from '@nestjs/swagger';
import { NodesService } from './nodes.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';

@ApiTags('Monitoreo de Nodos y Kill-Switches (MS_PROV)')
@Controller()
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get('nodes')
  @ApiOperation({ summary: 'Consultar estado y semáforo LED de nodos de integración (Panel 1)' })
  @ApiResponse({ status: 200, description: 'Listado de nodos con semáforo LED (🟢/🟡/🔴), latencia y kill-switch.' })
  async listarNodos() {
    return this.nodesService.listarNodos();
  }

  @Post('nodes')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar nuevo socio / proveedor en el Gateway de Integración (RDA2)' })
  @ApiResponse({ status: 201, description: 'Proveedor registrado exitosamente en schema_proveedores.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async crearNodoPublic(@Body() body: any) {
    return this.nodesService.crearNodo(body);
  }

  @Put('nodes/:codigoNodo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar parámetros de conexión de un nodo socio' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async actualizarNodoPublic(
    @Param('codigoNodo') codigoNodo: string,
    @Body() body: any,
  ) {
    return this.nodesService.actualizarNodo(codigoNodo, body);
  }

  @Delete('nodes/:codigoNodo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar un nodo proveedor' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async eliminarNodoPublic(@Param('codigoNodo') codigoNodo: string) {
    return this.nodesService.eliminarNodo(codigoNodo);
  }

  @Post('nodes/:codigoNodo/ping')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disparar ping de diagnóstico HTTP a la URL del socio y medir latencia' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN o MANTENIMIENTO)' })
  async pingNodoPublic(@Param('codigoNodo') codigoNodo: string) {
    return this.nodesService.pingNodo(codigoNodo);
  }

  @Post('nodes/:codigoNodo/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sincronizar e importar catálogo de atracciones desde el microservicio socio (OpenAPI v2)' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo socio de atracciones' })
  @ApiResponse({ status: 200, description: 'Catálogo sincronizado exitosamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async sincronizarCatalogoPublic(@Param('codigoNodo') codigoNodo: string) {
    return this.nodesService.sincronizarCatalogo(codigoNodo);
  }

  @Post('nodes/:codigoNodo/toggle')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alternar switch de un nodo socio desde el Panel 1 de Administración' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN o MANTENIMIENTO)' })
  async toggleNodePublic(
    @Param('codigoNodo') codigoNodo: string,
    @Body() body?: { activar?: boolean },
  ) {
    return this.nodesService.toggleKillSwitch(codigoNodo, body?.activar);
  }

  @Get('admin/nodes')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración para pruebas automáticas', required: false })
  @ApiOperation({ summary: 'Consultar estado y semáforo LED de nodos (Admin Protegido)' })
  @ApiResponse({ status: 200, description: 'Listado completo de nodos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async listarNodosAdmin() {
    return this.nodesService.listarNodos();
  }

  @Put('admin/nodes/:codigoNodo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración para pruebas automáticas', required: false })
  @ApiOperation({ summary: 'Parametrizar en vivo las URLs oficiales de un nodo socio (Rol ADMIN - Cátedra RDA2 CE01)' })
  @ApiParam({ name: 'codigoNodo', description: 'Código o ID del nodo socio' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        baseUrlRest: { type: 'string', example: 'https://descubreec.com/api/v2' },
        endpointGrpc: { type: 'string', example: 'grpc://booking.epn.edu.ec:50051' },
        nombreProveedor: { type: 'string', example: 'Descubre EC (Dilan Mendoza Oficial)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Nodo socio parametrizado en vivo exitosamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  @ApiResponse({ status: 404, description: 'Nodo no encontrado' })
  async actualizarNodo(
    @Param('codigoNodo') codigoNodo: string,
    @Body() body: { baseUrlRest?: string; endpointGrpc?: string; nombreProveedor?: string },
  ) {
    return this.nodesService.actualizarNodo(codigoNodo, body);
  }

  @Patch('admin/nodes/:codigoNodo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración para pruebas automáticas', required: false })
  @ApiOperation({ summary: 'Actualización parcial en vivo de parámetros de red de un nodo (Rol ADMIN - CE01)' })
  async parchearNodo(
    @Param('codigoNodo') codigoNodo: string,
    @Body() body: { baseUrlRest?: string; endpointGrpc?: string; nombreProveedor?: string },
  ) {
    return this.nodesService.actualizarNodo(codigoNodo, body);
  }

  @Post('admin/nodes/:codigoNodo/toggle-killswitch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración para pruebas automáticas', required: false })
  @ApiOperation({ summary: 'Alternar en vivo el Kill-Switch de un nodo socio (Rol ADMIN - Cátedra RDA2 §2)' })
  @ApiParam({ name: 'codigoNodo', description: 'Código del nodo (ej. NODE_ATR_DILAN)' })
  @ApiResponse({ status: 200, description: 'Estado del Kill-Switch actualizado inmediatamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async toggleKillSwitch(
    @Param('codigoNodo') codigoNodo: string,
    @Body() body?: { activar?: boolean },
  ) {
    return this.nodesService.toggleKillSwitch(codigoNodo, body?.activar);
  }

  @Post('admin/nodes/:codigoNodo/ping')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración para pruebas automáticas', required: false })
  @ApiOperation({ summary: 'Disparar ping de diagnóstico de latencia y salud a un nodo (Rol ADMIN)' })
  @ApiParam({ name: 'codigoNodo', description: 'Código del nodo' })
  @ApiResponse({ status: 200, description: 'Diagnóstico de latencia completado.' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN)' })
  async pingNodo(@Param('codigoNodo') codigoNodo: string) {
    return this.nodesService.pingNodo(codigoNodo);
  }
}
