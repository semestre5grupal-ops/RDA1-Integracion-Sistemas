import { BadRequestException, UseInterceptors, Controller, Get, Put, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminErrorsInterceptor } from './admin-errors.interceptor';
import { AdminConfigService, PlatformConfig } from './admin-config.service';
import { AdminFinanzasService } from './admin-finanzas.service';
import { AdminAuditService, actorDesdeRequest } from './admin-audit.service';
import { AdminProveedoresService } from './admin-proveedores.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(SupabaseAuthGuard)
@UseInterceptors(AdminErrorsInterceptor)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: AdminConfigService,
    private readonly finanzasService: AdminFinanzasService,
    private readonly auditService: AdminAuditService,
    private readonly proveedoresService: AdminProveedoresService,
  ) {}

  // ── Observabilidad ────────────────────────────────────────────────────────
  @Get('stats')
  @ApiOperation({ summary: 'KPIs globales del sistema (requiere Auth)' })
  @ApiResponse({ status: 200, description: 'Estadísticas globales.' })
  async getStats() {
    return this.adminService.getStats();
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  @Get('users')
  @ApiOperation({ summary: 'Lista de usuarios registrados (auth.users)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios.' })
  @ApiResponse({ status: 503, description: 'No se pudo leer auth.users ni la Admin API de Supabase.' })
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Put('users/:id/action')
  @ApiOperation({ summary: 'Acción sobre un usuario (bloquear, desbloquear, promover_admin, quitar_admin, cambiar_password)' })
  async userAction(@Param('id') id: string, @Body() body: { action: string; password?: string }, @Req() req: any) {
    if (body?.action === 'quitar_admin' && req?.user?.id === id) {
      throw new BadRequestException('No puedes quitarte a ti mismo el rol de administrador.');
    }
    const res = await this.adminService.executeUserAction(id, body?.action, body?.password);
    const etiquetas: Record<string, string> = {
      bloquear: 'Bloqueó usuario', desbloquear: 'Desbloqueó usuario', promover_admin: 'Promovió a administrador',
      quitar_admin: 'Quitó rol de administrador', cambiar_password: 'Cambió la contraseña',
    };
    await this.auditService.registrar(actorDesdeRequest(req), etiquetas[body.action] || body.action, 'usuario', res.email || id, { userId: id });
    return res;
  }

  @Get('users/:id/historial')
  @ApiOperation({ summary: 'Ver historial de compras de un usuario' })
  async getUserHistorial(@Param('id') id: string) {
    return this.adminService.getUserHistorial(id);
  }

  // ── Reservas ──────────────────────────────────────────────────────────────
  @Get('reservas')
  @ApiOperation({ summary: 'Todas las reservas del sistema (requiere Auth)' })
  @ApiResponse({ status: 200, description: 'Reservas globales por tipo.' })
  async getReservasGlobales() {
    return this.adminService.getReservasGlobales();
  }

  @Put('reservas/:tipo/:id/cancelar')
  @ApiOperation({ summary: 'Cancelar una reserva' })
  async cancelarReserva(@Param('tipo') tipo: string, @Param('id') id: string, @Req() req: any) {
    const res = await this.adminService.cancelarReserva(tipo, id);
    await this.auditService.registrar(actorDesdeRequest(req), 'Canceló reserva', `reserva-${tipo}`, id);
    return res;
  }

  @Get('reservas/:tipo/:id/detalles')
  @ApiOperation({ summary: 'Obtener detalles técnicos de una reserva' })
  async getReservaDetalles(@Param('tipo') tipo: string, @Param('id') id: string) {
    return this.adminService.getReservaDetalles(tipo, id);
  }

  @Put('reservas/:tipo/:id/reenviar')
  @ApiOperation({ summary: 'Reenviar comprobante al cliente' })
  async reenviarComprobante(@Param('tipo') tipo: string, @Param('id') id: string, @Req() req: any) {
    const res = await this.adminService.reenviarComprobante(tipo, id);
    await this.auditService.registrar(actorDesdeRequest(req), 'Reenvió comprobante', `reserva-${tipo}`, id);
    return res;
  }

  // ── Finanzas ──────────────────────────────────────────────────────────────
  @Get('finanzas')
  @ApiOperation({ summary: 'Finanzas reales del booking: cobrado, comisiones, IVA, neto a proveedores y liquidaciones' })
  async getFinanzas() {
    return this.finanzasService.getFinanzas();
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Historial de payouts aprobados (tabla liquidaciones)' })
  async getPayouts() {
    return this.finanzasService.historialPayouts();
  }

  @Post('payouts/aprobar')
  @ApiOperation({ summary: 'Aprobar el payout pendiente de una vertical en un periodo (YYYY-MM)' })
  @ApiBody({ schema: { example: { vertical: 'autos', periodo: '2026-10', referencia: 'TRX-123' } } })
  async aprobarPayout(
    @Body() body: { vertical: string; periodo: string; referencia?: string; bruto?: number; reservas?: number },
    @Req() req: any,
  ) {
    const actor = actorDesdeRequest(req);
    const res = await this.finanzasService.aprobarPayout(body, actor.email);
    await this.auditService.registrar(actor, 'Aprobó payout', 'liquidacion', `${body.vertical}:${body.periodo}`, {
      monto: res.montoPagado, referencia: res.referencia,
    });
    return res;
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────
  @Get('auditoria')
  @ApiOperation({ summary: 'Registro de auditoría real (acciones del panel + eventos del sistema)' })
  @ApiQuery({ name: 'limit', required: false, example: 300 })
  async getAuditoria(@Query('limit') limit?: string) {
    return this.auditService.listar(Number(limit) || 300);
  }

  @Post('auditoria')
  @ApiOperation({ summary: 'Registrar manualmente una acción administrativa desde el panel' })
  async registrarAuditoria(@Body() body: { accion: string; entidadTipo?: string; entidadId?: string; detalle?: any }, @Req() req: any) {
    await this.auditService.registrar(actorDesdeRequest(req), body?.accion || 'Acción', body?.entidadTipo || 'panel', body?.entidadId || null, body?.detalle);
    return { success: true };
  }

  // ── Solicitudes de proveedores ("Quiero ser proveedor") ─────────────────
  @Get('proveedores/solicitudes')
  @ApiOperation({ summary: 'Solicitudes de nuevos proveedores (pendientes primero)' })
  @ApiQuery({ name: 'estado', required: false, enum: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] })
  async getSolicitudesProveedor(@Query('estado') estado?: string) {
    return this.proveedoresService.listar(estado);
  }

  @Put('proveedores/solicitudes/:id')
  @ApiOperation({ summary: 'Aprobar o rechazar una solicitud de proveedor (queda en auditoría)' })
  @ApiBody({ schema: { example: { accion: 'rechazar', nota: 'El RUC no corresponde a la empresa.' } } })
  async revisarSolicitudProveedor(@Param('id') id: string, @Body() body: { accion: string; nota?: string }, @Req() req: any) {
    const actor = actorDesdeRequest(req);
    const sol = await this.proveedoresService.revisar(id, body?.accion, actor.email, body?.nota);
    await this.auditService.registrar(
      actor,
      sol.estado === 'APROBADA' ? 'Aprobó proveedor' : 'Rechazó proveedor',
      'proveedor',
      `${sol.codigo} · ${sol.empresa}`,
      { tipo: sol.tipo, ruc: sol.ruc, email: sol.email, nota: sol.notaAdmin },
    );
    return sol;
  }

  // ── Ajustes globales ──────────────────────────────────────────────────────
  @Get('config')
  @ApiOperation({ summary: 'Configuración global (comisión, IVA, pasarela, emails, mantenimiento)' })
  async getConfig() {
    return this.configService.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Actualizar configuración global' })
  @ApiBody({ schema: { example: { comisionBase: 15, tasaImpuestos: 15, stripeEnabled: true, emailsEnabled: true, maintenanceMode: false } } })
  async updateConfig(@Body() body: Partial<PlatformConfig>, @Req() req: any) {
    const actor = actorDesdeRequest(req);
    const { config, cambios } = await this.configService.updateConfig(body, actor.email);
    if (cambios.length) {
      await this.auditService.registrar(actor, 'Modificó ajustes globales', 'config', cambios.map((c) => c.campo).join(','), { cambios });
    }
    return { ...config, cambios };
  }
}
