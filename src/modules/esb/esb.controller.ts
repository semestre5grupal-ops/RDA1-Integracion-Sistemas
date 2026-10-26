import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';
import { SagaOrchestratorService, CheckoutSagaInput } from './interna/saga-orchestrator.service';
import { EsbInternalRouterService } from './interna/esb-internal-router.service';

@ApiTags('Enterprise Service Bus & Sagas LIFO (Capa 3 ESB)')
@Controller('esb')
export class EsbController {
  private readonly idempotencyStore = new Map<string, any>();

  constructor(
    private readonly sagaOrchestrator: SagaOrchestratorService,
    private readonly internalRouter: EsbInternalRouterService,
  ) {}

  @Post('checkout-saga')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Orquestar compra compuesta multivertical con transacciones Saga y compensación LIFO (RDA2 §8)' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiResponse({ status: 200, description: 'Saga finalizada exitosamente. Todos los servicios confirmados.' })
  @ApiResponse({ status: 409, description: 'Fallo transaccional: Compensación LIFO ejecutada (código REF-SAGA-...).' })
  async checkoutSaga(
    @Body() dto: CheckoutSagaInput,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    if (idempotencyKey && this.idempotencyStore.has(idempotencyKey)) {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Idempotent-Replayed', 'true');
      }
      return this.idempotencyStore.get(idempotencyKey);
    }

    const key = idempotencyKey || `idem-saga-${Date.now()}`;
    const result = await this.sagaOrchestrator.ejecutarCheckoutCompuesto(dto, key);

    if (idempotencyKey) {
      this.idempotencyStore.set(idempotencyKey, result);
    }

    return result;
  }

  @Get('sagas/:correlationId')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiResponse({ status: 403, description: 'Requiere rol ADMIN o MANTENIMIENTO (contiene datos de compras)' })
  @ApiOperation({ summary: 'Consultar bitácora y pasos ejecutados de una transacción Saga por Correlation-ID' })
  @ApiParam({ name: 'correlationId', description: 'Correlation-ID de la Saga (ej. SAGA-A1B2C3D4)' })
  async getSaga(@Param('correlationId') correlationId: string) {
    return this.sagaOrchestrator.consultarEstadoSaga(correlationId);
  }

  @Get('sagas')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiResponse({ status: 403, description: 'Requiere rol ADMIN o MANTENIMIENTO (contiene datos de compras)' })
  @ApiOperation({ summary: 'Listar transacciones Saga recientes para el Panel 8 de Auditoría y Sagas' })
  async listarSagas(@Query('limit') limit: number) {
    return this.sagaOrchestrator.listarSagasRecientes(Math.min(Math.max(Number(limit) || 20, 1), 200));
  }

  @Get('aggregate/mis-reservas/:cliente')
  @ApiOperation({ summary: 'Sustituto oficial de SQL JOINs: Agregación en memoria de reservas multivertical (Cátedra CE02)' })
  @ApiParam({ name: 'cliente', description: 'ID o Email del cliente' })
  async getMisReservasAgregadas(@Param('cliente') cliente: string) {
    return this.internalRouter.ensamblarVistaMisReservas(cliente);
  }

  @Get('aggregate/facturas/:facturaId')
  @ApiOperation({ summary: 'Ensamblar factura y detalle de ítems sin cross-schema SQL JOINs' })
  @ApiParam({ name: 'facturaId', description: 'UUID de la factura' })
  async getFacturaCompleta(@Param('facturaId') facturaId: string) {
    return this.internalRouter.ensamblarFacturaCompleta(facturaId);
  }
}
