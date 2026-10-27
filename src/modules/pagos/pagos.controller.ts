import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PagosService } from './pagos.service';
import {
  AsociarReservaPagoDto,
  ProcesarPagoDto,
  ProcesarReembolsoDto,
  UpdateConfigSimuladorDto,
} from './dto/pago.dto';
import {
  PaymentReferenceAccess,
  PaymentReferenceAccessGuard,
} from './guards/payment-reference-access.guard';
import { SimulatorConfigurationGuard } from './guards/simulator-configuration.guard';

type RequestWithPaymentAccess = Request & { paymentReferenceAccess: PaymentReferenceAccess };

@ApiTags('Pagos SOA y Simulación (MS_PAG)')
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Post('procesar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Procesar cobro transaccional con Idempotency-Key e inyección de fallos (Cátedra §7)' })
  @ApiHeader({ name: 'idempotency-key', required: false, description: 'Reutilice la misma clave en cada reintento del cobro.' })
  @ApiResponse({ status: 200, description: 'Pago aprobado con código de autorización.' })
  @ApiResponse({ status: 402, description: 'Fondos insuficientes o fraude simulado.' })
  @ApiResponse({ status: 504, description: 'Gateway Timeout (Simulación de fallo para Circuit Breakers).' })
  async procesarPago(
    @Body() dto: ProcesarPagoDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const key = idempotencyKey || dto.idempotency_key || `idem-pay-${Date.now()}`;
    return this.pagosService.procesarPago(dto, key);
  }

  @Post('reembolsos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Emitir reembolso compensatorio parcial o total con Idempotency-Key' })
  @ApiHeader({ name: 'idempotency-key', required: false, description: 'Reutilice la misma clave en cada reintento del reembolso.' })
  @ApiResponse({ status: 200, description: 'Reembolso procesado con código REF-PAG-...' })
  async procesarReembolso(
    @Body() dto: ProcesarReembolsoDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const key = idempotencyKey || dto.idempotency_key || `idem-ref-${Date.now()}`;
    return this.pagosService.procesarReembolso(dto, key);
  }

  @Get('simulador/config')
  @ApiOperation({ summary: 'Consultar configuración del simulador de fallos de pagos SOA (Panel 6)' })
  @ApiResponse({ status: 200, description: 'Modo actual y latencia de pasarela bancaria.' })
  getConfigSimulador() {
    return this.pagosService.getConfigSimulador();
  }

  @Post('simulador/config')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SimulatorConfigurationGuard)
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Configurar escenarios deterministas de pago (incluye fraude)' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada.' })
  updateConfigSimulador(@Body() dto: UpdateConfigSimuladorDto) {
    return this.pagosService.updateConfigSimulador(dto);
  }

  @Get('transacciones')
  @ApiOperation({ summary: 'Listar historial de transacciones de pago para el Panel de Control' })
  @ApiResponse({ status: 200, description: 'Historial de pagos sin datos de tarjeta.' })
  async getTransacciones(@Query('limit') limit: number) {
    return this.pagosService.getHistorialTransacciones(Number(limit) || 20);
  }

  @Version('2')
  @Get(':paymentReference')
  @UseGuards(PaymentReferenceAccessGuard)
  @ApiSecurity('bearer')
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Validar estado y monto de un pago por paymentReference' })
  @ApiResponse({ status: 200, description: 'Referencia validada sin datos de tarjeta.' })
  @ApiResponse({ status: 403, description: 'La referencia no pertenece a la tienda autenticada.' })
  @ApiResponse({ status: 404, description: 'Referencia de pago no encontrada.' })
  validarPaymentReference(
    @Param('paymentReference') paymentReference: string,
    @Req() request: RequestWithPaymentAccess,
  ) {
    return this.pagosService.validarPaymentReference(paymentReference, request.paymentReferenceAccess);
  }

  @Version('2')
  @Post(':paymentReference/reservas')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PaymentReferenceAccessGuard)
  @ApiSecurity('bearer')
  @ApiSecurity('X-Api-Key')
  @ApiOperation({ summary: 'Asociar una reserva confirmada a un pago de la tienda' })
  @ApiResponse({ status: 200, description: 'Reserva asociada idempotentemente al pago.' })
  asociarReserva(
    @Param('paymentReference') paymentReference: string,
    @Body() dto: AsociarReservaPagoDto,
    @Req() request: RequestWithPaymentAccess,
  ) {
    return this.pagosService.asociarReserva(
      paymentReference,
      dto.reserva_id,
      request.paymentReferenceAccess,
    );
  }
}
