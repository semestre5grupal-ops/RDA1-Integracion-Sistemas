import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ReembolsoPago, ReservaPago, TransaccionPago } from './entities';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { RabbitMqEventBusService } from '../event-bus/rabbitmq/rabbitmq-event-bus.service';
import { PaymentReferenceAccess } from './guards/payment-reference-access.guard';

export type ModoSimuladorPago =
  | 'NORMAL'
  | 'RECHAZO_FONDOS'
  | 'TIMEOUT_RED'
  | 'ERROR_INTERNO'
  | 'FRAUDE';

export interface ProcesarPagoInput {
  monto: number;
  metodo_pago?: string;
  numero_tarjeta?: string;
  cliente_id?: string;
  factura_id?: string;
  carrito_id?: string;
  simular_escenario?: ModoSimuladorPago;
}

export interface ProcesarReembolsoInput {
  transaccion_id?: string;
  codigo_autorizacion?: string;
  monto?: number;
  motivo?: string;
}

export interface PagoProcesadoResponse {
  transaccion_id: string;
  codigo_autorizacion: string | null;
  estado: string;
  monto: number;
  moneda: string;
  fecha_procesamiento?: Date;
  mensaje: string;
  es_idempotente?: boolean;
}

export interface ReembolsoResponse {
  success: boolean;
  transaccion_id: string;
  codigo_reembolso: string;
  estado: 'REEMBOLSADO' | 'REEMBOLSO_PARCIAL';
  monto_reembolsado: number;
  monto_reembolsado_acumulado: number;
  fecha_reembolso: Date;
  mensaje: string;
}

export interface ConfigSimuladorResponse {
  modo_actual: ModoSimuladorPago;
  latencia_ms: number;
  modos_disponibles: ModoSimuladorPago[];
}

export interface ValidacionPagoResponse {
  payment_reference: string;
  status: 'CAPTURED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  amount: number;
  refunded_amount: number;
  currency: string;
  captured_at: Date;
  auth_code: string | null;
  bookings: string[];
}

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);
  private modoSimulador: ModoSimuladorPago = 'NORMAL';
  private latenciaSimuladaMs = 250;

  constructor(
    @InjectRepository(TransaccionPago)
    private readonly transaccionRepo: Repository<TransaccionPago>,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    @InjectRepository(ReembolsoPago)
    private readonly reembolsoRepo: Repository<ReembolsoPago>,
    @InjectRepository(ReservaPago)
    private readonly reservaRepo: Repository<ReservaPago>,
    @Optional()
    private readonly rabbitEventBus?: RabbitMqEventBusService,
  ) {}

  async procesarPago(dto: ProcesarPagoInput, idempotencyKey: string): Promise<PagoProcesadoResponse> {
    const safeKey = idempotencyKey || `idem-pay-${Date.now()}`;
    this.logger.log(`Procesando cobro [Idempotency-Key: ${safeKey}]`);

    const existente = await this.transaccionRepo.findOne({ where: { idempotencyKey: safeKey } });
    if (existente) {
      if (!this.mismaSolicitud(dto, existente)) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'La Idempotency-Key ya se utilizó con datos de cobro diferentes.',
        });
      }
      return this.respuestaPago(existente, true);
    }

    const simulatorEnabled = this.simulatorEnabled();
    const escenario = simulatorEnabled
      ? dto.simular_escenario || this.modoSimulador
      : 'NORMAL';

    if (dto.simular_escenario && !simulatorEnabled) {
      throw new ForbiddenException('El simulador está deshabilitado en producción.');
    }

    if (escenario === 'TIMEOUT_RED') {
      this.logger.error('Simulador de pagos: timeout de red');
      await new Promise((resolve) => setTimeout(resolve, 5500));
      this.winstonLogger.logAudit('PAGO_FALLO_TIMEOUT_SIMULADO', {
        idempotency_key: safeKey,
        escenario,
      });
      throw new HttpException({
        status: HttpStatus.GATEWAY_TIMEOUT,
        error: 'Gateway Timeout: La pasarela de pagos no respondió dentro del límite reglamentario.',
        code: 'PAYMENT_GATEWAY_TIMEOUT',
      }, HttpStatus.GATEWAY_TIMEOUT);
    }

    if (escenario === 'ERROR_INTERNO') {
      throw new HttpException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'La pasarela de pagos no pudo completar la operación.',
        code: 'PAYMENT_GATEWAY_ERROR',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (simulatorEnabled && this.latenciaSimuladaMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latenciaSimuladaMs));
    }

    const rechazado = escenario === 'RECHAZO_FONDOS' || escenario === 'FRAUDE';
    const authorizationCode = rechazado
      ? null
      : `AUTH-PAG-${randomBytes(4).toString('hex').toUpperCase()}`;
    const transaction = this.transaccionRepo.create({
      idempotencyKey: safeKey,
      clienteId: dto.cliente_id,
      facturaId: dto.factura_id,
      carritoId: dto.carrito_id,
      montoTotal: Number(dto.monto),
      montoReembolsado: 0,
      moneda: 'USD',
      metodoPago: dto.metodo_pago || 'TARJETA_CREDITO',
      numeroTarjetaEnmascarado: this.enmascararTarjeta(dto.numero_tarjeta),
      estado: rechazado ? (escenario === 'FRAUDE' ? 'FRAUDE' : 'RECHAZADO') : 'APROBADO',
      codigoAutorizacion: authorizationCode,
      mensajePasarela: rechazado
        ? escenario === 'FRAUDE'
          ? 'Transacción rechazada por el control de fraude.'
          : 'Transacción denegada: Fondos insuficientes.'
        : 'Cobro aprobado por la red adquirente.',
    });
    const guardada = await this.transaccionRepo.save(transaction);

    this.winstonLogger.logAudit(rechazado ? 'PAGO_RECHAZADO' : 'PAGO_APROBADO_EXITOSAMENTE', {
      transaccion_id: guardada.id,
      estado: guardada.estado,
      monto: Number(guardada.montoTotal),
      idempotency_key: safeKey,
    });
    await this.rabbitEventBus?.publish('payment.completed', {
      paymentReference: guardada.id,
      status: guardada.estado,
      amount: Number(guardada.montoTotal),
      currency: guardada.moneda,
    });

    if (rechazado) {
      const code = escenario === 'FRAUDE' ? 'FRAUD_SUSPECTED' : 'INSUFFICIENT_FUNDS';
      throw new HttpException({
        status: HttpStatus.PAYMENT_REQUIRED,
        error: escenario === 'FRAUDE'
          ? 'Transacción rechazada por el control de fraude.'
          : 'Transacción denegada: Fondos insuficientes.',
        code,
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    return this.respuestaPago(guardada, false);
  }

  async procesarReembolso(dto: ProcesarReembolsoInput, idempotencyKey: string): Promise<ReembolsoResponse> {
    const safeKey = idempotencyKey || `idem-ref-${Date.now()}`;
    if (!dto.transaccion_id && !dto.codigo_autorizacion) {
      throw new BadRequestException('Se requiere transaccion_id o codigo_autorizacion.');
    }

    const result = await this.reembolsoRepo.manager.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(TransaccionPago);
      const refundRepo = manager.getRepository(ReembolsoPago);
      const prior = await refundRepo.findOne({ where: { idempotencyKey: safeKey } });
      const transaction = await this.buscarTransaccion(manager, dto);

      if (!transaction) throw new NotFoundException('No existe la transacción de pago solicitada.');
      if (prior) {
        if (prior.transaccionId !== transaction.id || Number(prior.montoReembolsado) !== this.montoReembolso(dto, transaction)) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'La Idempotency-Key ya se utilizó con otro reembolso.',
          });
        }
        return this.respuestaReembolso(prior, transaction, true);
      }
      if (transaction.estado !== 'APROBADO' && transaction.estado !== 'REEMBOLSO_PARCIAL') {
        throw new BadRequestException('Solo se pueden reembolsar pagos aprobados o con reembolso parcial.');
      }

      const amount = this.montoReembolso(dto, transaction);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('El monto del reembolso debe ser mayor que cero.');
      }
      const refundedCents = Math.round(Number(transaction.montoReembolsado || 0) * 100);
      const amountCents = Math.round(amount * 100);
      const totalCents = Math.round(Number(transaction.montoTotal) * 100);
      if (refundedCents + amountCents > totalCents) {
        throw new BadRequestException('El reembolso excede el monto cobrado disponible.');
      }

      const refund = refundRepo.create({
        transaccionId: transaction.id,
        idempotencyKey: safeKey,
        montoReembolsado: amount,
        codigoReembolso: `REF-PAG-${randomBytes(4).toString('hex').toUpperCase()}`,
      });
      const savedRefund = await refundRepo.save(refund);
      transaction.montoReembolsado = (refundedCents + amountCents) / 100;
      transaction.estado = transaction.montoReembolsado >= totalCents / 100 ? 'REEMBOLSADO' : 'REEMBOLSO_PARCIAL';
      transaction.codigoReembolso = savedRefund.codigoReembolso;
      transaction.mensajePasarela = `Reembolso emitido: ${dto.motivo || 'Compensación Saga LIFO'}`;
      await transactionRepo.save(transaction);
      return this.respuestaReembolso(savedRefund, transaction, false);
    });

    if (!result.es_idempotente) {
      this.winstonLogger.logAudit('PAGO_REEMBOLSADO_COMPENSADO', {
        transaccion_id: result.transaccion_id,
        codigo_reembolso: result.codigo_reembolso,
        monto_reembolsado: result.monto_reembolsado,
        monto_reembolsado_acumulado: result.monto_reembolsado_acumulado,
        idempotency_key: safeKey,
      });
      await this.rabbitEventBus?.publish('payment.refunded', {
        paymentReference: result.transaccion_id,
        refundReference: result.codigo_reembolso,
        amount: result.monto_reembolsado,
        refundedAmount: result.monto_reembolsado_acumulado,
        status: result.estado,
      });
    }

    return {
      success: true,
      transaccion_id: result.transaccion_id,
      codigo_reembolso: result.codigo_reembolso,
      estado: result.estado,
      monto_reembolsado: result.monto_reembolsado,
      monto_reembolsado_acumulado: result.monto_reembolsado_acumulado,
      fecha_reembolso: result.fecha_reembolso,
      mensaje: result.es_idempotente
        ? 'Reembolso recuperado (Idempotent-Replayed).'
        : 'Reembolso compensatorio ejecutado exitosamente.',
    };
  }

  getConfigSimulador(): ConfigSimuladorResponse {
    const enabled = this.simulatorEnabled();
    return {
      modo_actual: enabled ? this.modoSimulador : 'NORMAL',
      latencia_ms: enabled ? this.latenciaSimuladaMs : 0,
      modos_disponibles: ['NORMAL', 'RECHAZO_FONDOS', 'TIMEOUT_RED', 'ERROR_INTERNO', 'FRAUDE'],
    };
  }

  updateConfigSimulador(dto: { modo: ModoSimuladorPago; latencia_ms?: number }): ConfigSimuladorResponse {
    if (!this.simulatorEnabled()) {
      throw new ForbiddenException('En producción se requiere PAGOS_SIMULADOR_HABILITADO=true para activar el simulador.');
    }
    this.modoSimulador = dto.modo;
    if (dto.latencia_ms !== undefined) {
      this.latenciaSimuladaMs = Math.max(0, Number(dto.latencia_ms));
    }
    this.logger.log(`Simulador configurado: modo=${this.modoSimulador}, latencia=${this.latenciaSimuladaMs}ms`);
    return this.getConfigSimulador();
  }

  async getHistorialTransacciones(limit = 20): Promise<TransaccionPago[]> {
    const transactions = await this.transaccionRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return transactions.map((transaction) => ({
      ...transaction,
      numeroTarjetaEnmascarado: '•••• •••• ••••',
    }));
  }

  async validarPaymentReference(
    paymentReference: string,
    access: PaymentReferenceAccess,
  ): Promise<ValidacionPagoResponse> {
    const transaction = await this.transaccionRepo.findOne({
      where: [{ id: paymentReference }, { codigoAutorizacion: paymentReference }],
    });
    if (!transaction) throw new NotFoundException('No se encontró el paymentReference solicitado.');
    this.exigirAccesoTienda(transaction, access);

    const bookings = await this.reservaRepo.find({ where: { transaccionId: transaction.id } });
    return {
      payment_reference: paymentReference,
      status: this.normalizarEstado(transaction.estado),
      amount: ['APROBADO', 'REEMBOLSO_PARCIAL', 'REEMBOLSADO'].includes(transaction.estado)
        ? Number(transaction.montoTotal)
        : 0,
      refunded_amount: Number(transaction.montoReembolsado || 0),
      currency: transaction.moneda,
      captured_at: transaction.createdAt,
      auth_code: transaction.codigoAutorizacion,
      bookings: bookings.map(({ reservaId }) => reservaId),
    };
  }

  async asociarReserva(
    paymentReference: string,
    reservaId: string,
    access: PaymentReferenceAccess,
  ): Promise<{ payment_reference: string; reserva_id: string; associated: boolean }> {
    const transaction = await this.transaccionRepo.findOne({
      where: [{ id: paymentReference }, { codigoAutorizacion: paymentReference }],
    });
    if (!transaction) throw new NotFoundException('No se encontró el paymentReference solicitado.');
    this.exigirAccesoTienda(transaction, access);
    if (transaction.estado !== 'APROBADO' && transaction.estado !== 'REEMBOLSO_PARCIAL') {
      throw new BadRequestException('Solo un pago capturado puede asociarse a una reserva.');
    }

    const existing = await this.reservaRepo.findOne({ where: { transaccionId: transaction.id, reservaId } });
    if (existing) {
      return { payment_reference: paymentReference, reserva_id: reservaId, associated: false };
    }
    await this.reservaRepo.save(this.reservaRepo.create({ transaccionId: transaction.id, reservaId }));
    return { payment_reference: paymentReference, reserva_id: reservaId, associated: true };
  }

  private async buscarTransaccion(manager: EntityManager, dto: ProcesarReembolsoInput): Promise<TransaccionPago | null> {
    const repository = manager.getRepository(TransaccionPago);
    const where = dto.transaccion_id
      ? { id: dto.transaccion_id }
      : { codigoAutorizacion: dto.codigo_autorizacion };
    return repository.findOne({ where, lock: { mode: 'pessimistic_write' } });
  }

  private montoReembolso(dto: ProcesarReembolsoInput, transaction: TransaccionPago): number {
    return Math.round(
      Number(dto.monto ?? (Number(transaction.montoTotal) - Number(transaction.montoReembolsado || 0))) * 100,
    ) / 100;
  }

  private respuestaReembolso(
    refund: ReembolsoPago,
    transaction: TransaccionPago,
    esIdempotente: boolean,
  ): ReembolsoResponse & { es_idempotente: boolean } {
    return {
      success: true,
      transaccion_id: transaction.id,
      codigo_reembolso: refund.codigoReembolso,
      estado: transaction.estado === 'REEMBOLSADO' ? 'REEMBOLSADO' : 'REEMBOLSO_PARCIAL',
      monto_reembolsado: Number(refund.montoReembolsado),
      monto_reembolsado_acumulado: Number(transaction.montoReembolsado || 0),
      fecha_reembolso: refund.createdAt,
      mensaje: 'Reembolso procesado.',
      es_idempotente: esIdempotente,
    };
  }

  private respuestaPago(transaction: TransaccionPago, esIdempotente: boolean): PagoProcesadoResponse {
    return {
      transaccion_id: transaction.id,
      codigo_autorizacion: transaction.codigoAutorizacion,
      estado: transaction.estado,
      monto: Number(transaction.montoTotal),
      moneda: transaction.moneda,
      fecha_procesamiento: transaction.createdAt,
      mensaje: esIdempotente
        ? 'Transacción recuperada exitosamente (Idempotente).'
        : transaction.estado === 'APROBADO'
          ? 'Pago procesado exitosamente. Código de autorización generado.'
          : 'La transacción fue rechazada.',
      es_idempotente: esIdempotente,
    };
  }

  private mismaSolicitud(dto: ProcesarPagoInput, transaction: TransaccionPago): boolean {
    return Number(dto.monto) === Number(transaction.montoTotal) &&
      (dto.metodo_pago || 'TARJETA_CREDITO') === transaction.metodoPago &&
      (dto.cliente_id || null) === (transaction.clienteId || null) &&
      (dto.factura_id || null) === (transaction.facturaId || null) &&
      (dto.carrito_id || null) === (transaction.carritoId || null);
  }

  private exigirAccesoTienda(transaction: TransaccionPago, access: PaymentReferenceAccess): void {
    if (access.type === 'store' && (!transaction.carritoId || transaction.carritoId !== access.carritoId)) {
      throw new ForbiddenException('La referencia de pago no pertenece al carrito/tienda autenticado.');
    }
  }

  private normalizarEstado(status: string): ValidacionPagoResponse['status'] {
    if (status === 'APROBADO') return 'CAPTURED';
    if (status === 'REEMBOLSO_PARCIAL') return 'PARTIALLY_REFUNDED';
    if (status === 'REEMBOLSADO') return 'REFUNDED';
    return 'FAILED';
  }

  private simulatorEnabled(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env.PAGOS_SIMULADOR_HABILITADO === 'true';
  }

  private enmascararTarjeta(numeroTarjeta?: string): string {
    if (!numeroTarjeta) return '•••• •••• •••• 4242';
    const clean = numeroTarjeta.replace(/\D/g, '');
    return clean.length >= 4 ? `•••• •••• •••• ${clean.slice(-4)}` : '•••• •••• •••• 4242';
  }
}
