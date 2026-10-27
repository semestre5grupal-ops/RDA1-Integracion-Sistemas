import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SagaTransaccion, SagaPasoJournal } from '../entities';
import { PagosService } from '../../pagos/pagos.service';
import { FinanzasService } from '../../finanzas/finanzas.service';
import { AtraccionesService } from '../../atracciones/atracciones.service';
import { AutosService } from '../../autos/autos.service';
import { WinstonPhysicalLoggerService } from '../../../core/logger/winston-logger.service';
import { KafkaRabbitBridgeService } from '../../event-bus/bridge/kafka-rabbit-bridge.service';
import * as crypto from 'crypto';

export interface CheckoutSagaInput {
  cliente_id?: string;
  cliente_email: string;
  cliente_nombre: string;
  metodo_pago?: string;
  numero_tarjeta?: string;
  items: Array<{
    vertical: 'ATRACCIONES' | 'AUTOS' | 'ALOJAMIENTOS' | 'VUELOS' | 'PAQUETES';
    item_id: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    detalles_reserva?: any;
  }>;
  simular_fallo_en_paso?: 'PAGO_RECHAZADO' | 'PAGO_TIMEOUT' | 'INVENTARIO_AGOTADO' | 'COMPENSACION_ERROR';
}

@Injectable()
export class SagaOrchestratorService {
  private readonly logger = new Logger(SagaOrchestratorService.name);

  // Almacén en memoria para cuando SAGA_STORE=memory o no hay base de datos conectada
  private readonly memorySagas = new Map<string, any>();
  private readonly memoryJournals = new Map<string, any[]>();

  constructor(
    @InjectRepository(SagaTransaccion)
    @Optional()
    private readonly sagaRepo?: Repository<SagaTransaccion>,
    @InjectRepository(SagaPasoJournal)
    @Optional()
    private readonly journalRepo?: Repository<SagaPasoJournal>,
    @Optional() private readonly pagosService?: PagosService,
    @Optional() private readonly finanzasService?: FinanzasService,
    @Optional() private readonly atraccionesService?: AtraccionesService,
    @Optional() private readonly autosService?: AutosService,
    @Optional() private readonly winstonLogger?: WinstonPhysicalLoggerService,
    @Optional() private readonly bridgeService?: KafkaRabbitBridgeService,
  ) {}

  /**
   * Helper para persistir entidad Saga en BD o memoria según SAGA_STORE
   */
  private async persistirSaga(saga: any): Promise<any> {
    const storeMode = (process.env.SAGA_STORE || 'db').toLowerCase();
    this.memorySagas.set(saga.correlationId, { ...saga });

    if (storeMode === 'db' && this.sagaRepo) {
      try {
        return await this.sagaRepo.save(saga);
      } catch (e) {
        this.logger.warn(`No se pudo persistir saga en BD (${e.message}); operando en memoria.`);
      }
    }
    return saga;
  }

  /**
   * Helper para persistir paso journal en BD o memoria según SAGA_STORE
   */
  private async persistirJournal(journalEntry: any, correlationId: string): Promise<any> {
    const storeMode = (process.env.SAGA_STORE || 'db').toLowerCase();
    const list = this.memoryJournals.get(correlationId) || [];
    list.push(journalEntry);
    this.memoryJournals.set(correlationId, list);

    if (storeMode === 'db' && this.journalRepo) {
      try {
        return await this.journalRepo.save(journalEntry);
      } catch (e) {
        this.logger.warn(`No se pudo persistir journal en BD (${e.message}); operando en memoria.`);
      }
    }
    return journalEntry;
  }

  /**
   * Ejecuta una llamada asíncrona con límite de tiempo estricto de 5 segundos (Cátedra CE01)
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs = 5000,
    fallbackValue?: T,
  ): Promise<T> {
    let timer: any;
    const timeoutPromise = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        if (fallbackValue !== undefined) {
          resolve(fallbackValue);
        } else {
          reject(new Error(`Timeout perimetral excedido (${timeoutMs}ms) en conector vertical.`));
        }
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timer);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Orquestación Transaccional de Checkout Multidominio mediante el Patrón Saga (§8 Consideraciones).
   * Ejecuta transacciones distribuidas con bitácora relacional (`schema_auditoria`)
   * y compensación automática en orden inverso (LIFO) ante fallos.
   */
  async ejecutarCheckoutCompuesto(dto: CheckoutSagaInput, idempotencyKey: string): Promise<any> {
    const correlationId = `SAGA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const totalVenta = dto.items.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0);

    this.logger.log(`[SAGA ORCHESTRATOR] Iniciando Saga Checkout Compuesto [Correlation-ID: ${correlationId}] por $${totalVenta}`);

    // Emisión de evento saga.started a RabbitMQ
    if (this.bridgeService) {
      try {
        await this.bridgeService.bridgeEvent('SAGA_STARTED', correlationId, {
          correlation_id: correlationId,
          total_venta: totalVenta,
          cliente: dto.cliente_email,
        });
      } catch (e) {
        this.logger.warn(`No se pudo emitir SAGA_STARTED: ${e.message}`);
      }
    }

    // 1. Crear registro maestro de la Saga
    let sagaData: any = {
      id: crypto.randomUUID(),
      correlationId,
      sagaNombre: 'SAGA_CHECKOUT_MULTIDOMINIO',
      estado: 'IN_PROGRESS',
      pasosTotales: dto.items.length + 2, // Items + Pago + Facturación
      pasoActual: 1,
      iniciadaAt: new Date(),
    };
    if (this.sagaRepo) {
      sagaData = this.sagaRepo.create(sagaData);
    }
    let savedSaga = await this.persistirSaga(sagaData);

    const pasosEjecutadosConExito: Array<{
      paso_id: string;
      servicio: string;
      operacion: string;
      compensacion_fn: () => Promise<any>;
      datos: any;
    }> = [];

    try {
      // -----------------------------------------------------------------------
      // PASO 1 (HOLD / RESERVAS PREVIAS EN CADA VERTICAL CON TIMEOUT DE 5s)
      // -----------------------------------------------------------------------
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i];
        savedSaga.pasoActual = i + 1;
        savedSaga = await this.persistirSaga(savedSaga);

        if (dto.simular_fallo_en_paso === 'INVENTARIO_AGOTADO' && i === dto.items.length - 1) {
          throw new HttpException(
            {
              status: HttpStatus.CONFLICT,
              error: 'Stock agotado en socio externo durante reserva compuesta.',
              code: 'OUT_OF_STOCK',
            },
            HttpStatus.CONFLICT,
          );
        }

        let reservaGenerada: any = null;

        if (item.vertical === 'ATRACCIONES' && this.atraccionesService) {
          reservaGenerada = await this.executeWithTimeout(
            this.atraccionesService.reservar(
              item.item_id,
              {
                customer_name: dto.cliente_nombre,
                customer_email: dto.cliente_email,
                ticket_count: item.cantidad,
                date: item.detalles_reserva?.date || new Date().toISOString().split('T')[0],
                time: item.detalles_reserva?.time || '10:00 a.m.',
              },
              `idem-saga-${correlationId}-${i}`,
            ),
            5000,
            { reservation_id: `RES-FALLBACK-${item.item_id}`, status: 'CONFIRMED_FALLBACK', external_sync_pending: true },
          );

          pasosEjecutadosConExito.push({
            paso_id: `paso-${i + 1}`,
            servicio: 'MS_ATR',
            operacion: 'RESERVAR_ATRACCION',
            datos: reservaGenerada,
            compensacion_fn: async () => {
              this.logger.warn(`[Compensación LIFO] Cancelando reserva de atracción ${reservaGenerada.reservation_id}`);
              return this.atraccionesService!.cancelarReserva(
                reservaGenerada.reservation_id,
                { reason: 'Rollback compensatorio automático Saga' },
                `idem-comp-${correlationId}`,
                correlationId,
              );
            },
          });
        } else if (item.vertical === 'AUTOS' && this.autosService) {
          reservaGenerada = await this.executeWithTimeout(
            this.autosService.createOrder(
              {
                vehicle_id: item.item_id,
                conductor: { nombre: dto.cliente_nombre, email: dto.cliente_email },
                dias: item.cantidad || 1,
              },
              `idem-saga-${correlationId}-${i}`,
              correlationId,
            ),
            5000,
            { pnr: `PNR-FALLBACK-${item.item_id}`, status: 'CONFIRMED_FALLBACK', external_sync_pending: true },
          );

          pasosEjecutadosConExito.push({
            paso_id: `paso-${i + 1}`,
            servicio: 'MS_AUT',
            operacion: 'RESERVAR_AUTO',
            datos: reservaGenerada,
            compensacion_fn: async () => {
              this.logger.warn(`[Compensación LIFO] Cancelando renta de auto ${reservaGenerada.pnr}`);
              return this.autosService!.cancelOrder(
                reservaGenerada.pnr,
                { reason: 'Rollback compensatorio automático Saga' },
                `idem-comp-${correlationId}`,
              );
            },
          });
        } else {
          // Reservas genéricas (Alojamientos / Vuelos / Paquetes)
          reservaGenerada = {
            reserva_id: `RES-${item.vertical.slice(0, 3)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            vertical: item.vertical,
            total: item.precio_unitario * item.cantidad,
            status: 'CONFIRMED',
          };

          pasosEjecutadosConExito.push({
            paso_id: `paso-${i + 1}`,
            servicio: `MS_${item.vertical.slice(0, 3)}`,
            operacion: `RESERVAR_${item.vertical}`,
            datos: reservaGenerada,
            compensacion_fn: async () => {
              this.logger.warn(`[Compensación LIFO] Liberando cupo en vertical ${item.vertical} para reserva ${reservaGenerada.reserva_id}`);
              return { status: 'CANCELLED', reserva_id: reservaGenerada.reserva_id };
            },
          });
        }

        // Registrar paso en journal
        let journalEntry: any = {
          id: crypto.randomUUID(),
          sagaId: savedSaga.id,
          ordenEjecucion: i + 1,
          servicioNombre: `MS_${item.vertical.slice(0, 3)}`,
          operacion: `RESERVA_${item.vertical}`,
          endpointInvocado: `/api/v2/${item.vertical.toLowerCase()}/reservas`,
          payloadEnviado: item,
          respuestaRecibida: reservaGenerada,
          estadoPaso: reservaGenerada?.status === 'CONFIRMED_FALLBACK' ? 'CONFIRMED_FALLBACK' : 'SUCCESS',
          createdAt: new Date(),
        };
        if (this.journalRepo) {
          journalEntry = this.journalRepo.create(journalEntry);
        }
        await this.persistirJournal(journalEntry, correlationId);

        // Notificar paso completado
        if (this.bridgeService) {
          try {
            await this.bridgeService.bridgeEvent('SAGA_STEP_COMPLETED', correlationId, {
              correlation_id: correlationId,
              paso: i + 1,
              servicio: `MS_${item.vertical.slice(0, 3)}`,
            });
          } catch (e) {}
        }
      }

      // -----------------------------------------------------------------------
      // PASO 2 (COBRO SÍNCRONO SOA EN MS_PAG CON TIMEOUT DE 5s)
      // -----------------------------------------------------------------------
      const pasoPagoNumero = dto.items.length + 1;
      savedSaga.pasoActual = pasoPagoNumero;
      savedSaga = await this.persistirSaga(savedSaga);

      let escenarioPago: any = 'NORMAL';
      if (dto.simular_fallo_en_paso === 'PAGO_RECHAZADO') escenarioPago = 'RECHAZO_FONDOS';
      if (dto.simular_fallo_en_paso === 'PAGO_TIMEOUT') escenarioPago = 'TIMEOUT_RED';

      let pagoResultado: any = null;
      if (this.pagosService) {
        pagoResultado = await this.executeWithTimeout(
          this.pagosService.procesarPago(
            {
              monto: totalVenta,
              metodo_pago: dto.metodo_pago || 'TARJETA_CREDITO',
              numero_tarjeta: dto.numero_tarjeta,
              cliente_id: dto.cliente_id,
              simular_escenario: escenarioPago,
            },
            `idem-pay-${correlationId}`,
          ),
          5000,
        );
      } else {
        pagoResultado = { transaccion_id: `TRX-${Date.now()}`, status: 'APROBADO', monto: totalVenta };
      }

      pasosEjecutadosConExito.push({
        paso_id: `paso-${pasoPagoNumero}`,
        servicio: 'MS_PAG',
        operacion: 'PROCESAR_PAGO',
        datos: pagoResultado,
        compensacion_fn: async () => {
          this.logger.warn(`[Compensación LIFO] Emitiendo reembolso compensatorio de pago ${pagoResultado.transaccion_id}`);
          if (this.pagosService) {
            return this.pagosService.procesarReembolso(
              {
                transaccion_id: pagoResultado.transaccion_id,
                monto: totalVenta,
                motivo: 'Rollback compensatorio automático Saga LIFO',
              },
              `idem-ref-${correlationId}`,
            );
          }
          return { status: 'REFUNDED' };
        },
      });

      let journalPago: any = {
        id: crypto.randomUUID(),
        sagaId: savedSaga.id,
        ordenEjecucion: pasoPagoNumero,
        servicioNombre: 'MS_PAG',
        operacion: 'PROCESAR_PAGO',
        endpointInvocado: '/api/v2/pagos/procesar',
        payloadEnviado: { monto: totalVenta, cliente: dto.cliente_email },
        respuestaRecibida: pagoResultado,
        estadoPaso: 'SUCCESS',
        createdAt: new Date(),
      };
      if (this.journalRepo) {
        journalPago = this.journalRepo.create(journalPago);
      }
      await this.persistirJournal(journalPago, correlationId);

      // -----------------------------------------------------------------------
      // PASO 3 (FINANZAS Y LIQUIDACIÓN DEL 10%)
      // -----------------------------------------------------------------------
      const pasoFinanzasNumero = dto.items.length + 2;
      savedSaga.pasoActual = pasoFinanzasNumero;
      savedSaga = await this.persistirSaga(savedSaga);

      if (this.finanzasService) {
        await this.finanzasService.registrarVentaYCalcularComision({
          orden_id: correlationId,
          factura_id: crypto.randomUUID(),
          vertical: 'COMBO_MULTIDOMINIO',
          total_venta: totalVenta,
          proveedor_codigo: 'BOOKING_CENTRAL_COMMISSION',
        });
      }

      // -----------------------------------------------------------------------
      // FINALIZACIÓN EXITOSA DE LA SAGA
      // -----------------------------------------------------------------------
      savedSaga.estado = 'COMPLETED';
      savedSaga.finalizadaAt = new Date();
      savedSaga = await this.persistirSaga(savedSaga);

      if (this.winstonLogger) {
        this.winstonLogger.logAudit(
          'SAGA_CHECKOUT_COMPLETED',
          {
            correlation_id: correlationId,
            total_pasos: savedSaga.pasosTotales,
            total_venta: totalVenta,
            cliente: dto.cliente_email,
            estado: 'COMPLETED',
          },
          correlationId,
        );
      }

      // Emisión de evento order.confirmed a RabbitMQ
      if (this.bridgeService) {
        try {
          await this.bridgeService.bridgeEvent('ORDER_CONFIRMED', correlationId, {
            correlation_id: correlationId,
            total_pagado: totalVenta,
            cliente: dto.cliente_email,
            items: dto.items,
          });
        } catch (e) {}
      }

      return {
        success: true,
        correlation_id: correlationId,
        estado: 'COMPLETED',
        total_pagado: totalVenta,
        pago: pagoResultado,
        items_confirmados: pasosEjecutadosConExito
          .filter(p => p.servicio !== 'MS_PAG')
          .map(p => ({
            servicio: p.servicio,
            operacion: p.operacion,
            datos: p.datos,
          })),
        mensaje: 'Checkout compuesto finalizado exitosamente. Saga completada al 100%.',
      };
    } catch (error) {
      // -----------------------------------------------------------------------
      // FASE DE COMPENSACIÓN AUTOMÁTICA EN ORDEN INVERSO (LIFO)
      // -----------------------------------------------------------------------
      this.logger.error(`[SAGA ERROR] Fallo detectado: ${error.message}. Iniciando Rollback Compensatorio LIFO.`);
      savedSaga.estado = 'COMPENSATING';
      savedSaga.errorDetalle = error.message || JSON.stringify(error);
      const codigoCompensacion = `REF-SAGA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      savedSaga.codigoCompensacion = codigoCompensacion;
      savedSaga = await this.persistirSaga(savedSaga);

      // Emisión de evento saga.compensating
      if (this.bridgeService) {
        try {
          await this.bridgeService.bridgeEvent('SAGA_COMPENSATING', correlationId, {
            correlation_id: correlationId,
            codigo_compensacion: codigoCompensacion,
            error: error.message,
          });
        } catch (e) {}
      }

      const resultadosCompensacion: any[] = [];
      let hayCompensacionFallida = false;

      // Ejecutar compensaciones en orden estrictamente inverso (LIFO)
      while (pasosEjecutadosConExito.length > 0) {
        const paso = pasosEjecutadosConExito.pop();
        if (paso && paso.compensacion_fn) {
          let reintentos = 0;
          const maxReintentos = 2;
          let compensadoOk = false;
          let ultimoErrorComp: any = null;

          while (reintentos <= maxReintentos && !compensadoOk) {
            try {
              const resComp = await paso.compensacion_fn();
              resultadosCompensacion.push({
                servicio: paso.servicio,
                operacion: paso.operacion,
                estado: 'COMPENSATED',
                resultado: resComp,
              });
              compensadoOk = true;
            } catch (compErr) {
              ultimoErrorComp = compErr;
              reintentos++;
              if (reintentos <= maxReintentos) {
                this.logger.warn(`[Reintento Compensación ${reintentos}/${maxReintentos}] Paso ${paso.servicio}: ${compErr.message}`);
                await new Promise(r => setTimeout(r, 10));
              }
            }
          }

          if (!compensadoOk) {
            hayCompensacionFallida = true;
            this.logger.error(
              `[CRITICAL_ALERT] Compensación fallida en ${paso.servicio} tras ${maxReintentos} reintentos: ${ultimoErrorComp?.message}`,
            );
            resultadosCompensacion.push({
              servicio: paso.servicio,
              operacion: paso.operacion,
              estado: 'COMPENSATION_FAILED',
              error: ultimoErrorComp?.message || 'Fallo desconocido en compensación',
            });
            if (this.winstonLogger) {
              this.winstonLogger.logAudit(
                'SAGA_COMPENSATION_FAILED_CRITICAL',
                {
                  correlation_id: correlationId,
                  codigo_compensacion: codigoCompensacion,
                  servicio: paso.servicio,
                  error: ultimoErrorComp?.message,
                },
                correlationId,
              );
            }
          }
        }
      }

      savedSaga.estado = hayCompensacionFallida ? 'COMPENSATION_FAILED' : 'FAILED';
      savedSaga.finalizadaAt = new Date();
      savedSaga = await this.persistirSaga(savedSaga);

      if (this.winstonLogger) {
        this.winstonLogger.logAudit(
          hayCompensacionFallida ? 'SAGA_COMPENSATION_FAILED_ALERT' : 'SAGA_CHECKOUT_ROLLBACK_COMPENSADO',
          {
            correlation_id: correlationId,
            codigo_compensacion: codigoCompensacion,
            error_original: error.message,
            pasos_compensados: resultadosCompensacion.length,
            estado: savedSaga.estado,
          },
          correlationId,
        );
      }

      // Emisión de evento final de compensación a RabbitMQ
      if (this.bridgeService) {
        try {
          await this.bridgeService.bridgeEvent(
            hayCompensacionFallida ? 'SAGA_STEP_FAILED' : 'SAGA_COMPENSATED',
            correlationId,
            {
              correlation_id: correlationId,
              codigo_compensacion: codigoCompensacion,
              estado: savedSaga.estado,
              compensaciones: resultadosCompensacion,
            },
          );
        } catch (e) {}
      }

      throw new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/saga-rollback',
          title: 'Transacción Distribuida Cancelada y Compensada (Saga LIFO)',
          status: HttpStatus.CONFLICT,
          detail: `La compra no pudo completarse debido a un fallo en uno de los pasos (${error.message || 'Error transaccional'}). Se ejecutaron las acciones compensatorias automáticas.`,
          instance: '/api/v2/esb/checkout-saga',
          correlation_id: correlationId,
          codigo_compensacion: codigoCompensacion,
          compensaciones_ejecutadas: resultadosCompensacion,
          estado_saga: savedSaga.estado,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  async consultarEstadoSaga(correlationId: string): Promise<any> {
    const storeMode = (process.env.SAGA_STORE || 'db').toLowerCase();

    let saga: any = null;
    let journal: any[] = [];

    if (storeMode === 'db' && this.sagaRepo && this.journalRepo) {
      try {
        saga = await this.sagaRepo.findOne({ where: { correlationId } });
        if (saga) {
          journal = await this.journalRepo.find({
            where: { sagaId: saga.id },
            order: { ordenEjecucion: 'ASC' },
          });
        }
      } catch (e) {
        this.logger.warn(`Error al consultar saga en BD: ${e.message}`);
      }
    }

    if (!saga) {
      saga = this.memorySagas.get(correlationId);
      journal = this.memoryJournals.get(correlationId) || [];
    }

    if (!saga) {
      throw new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/not-found',
          title: 'Saga no encontrada',
          status: HttpStatus.NOT_FOUND,
          detail: `Saga con Correlation-ID '${correlationId}' no encontrada`,
          instance: `/api/v2/esb/sagas/${correlationId}`,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      saga,
      journal,
    };
  }

  async listarSagasRecientes(limit = 20): Promise<any[]> {
    const storeMode = (process.env.SAGA_STORE || 'db').toLowerCase();

    if (storeMode === 'db' && this.sagaRepo) {
      try {
        return await this.sagaRepo.find({
          order: { iniciadaAt: 'DESC' },
          take: limit,
        });
      } catch (e) {
        this.logger.warn(`Error al listar sagas en BD: ${e.message}`);
      }
    }

    return Array.from(this.memorySagas.values())
      .sort((a, b) => new Date(b.iniciadaAt).getTime() - new Date(a.iniciadaAt).getTime())
      .slice(0, limit);
  }
}
