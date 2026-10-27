import { SagaOrchestratorService, CheckoutSagaInput } from '../src/modules/esb/interna/saga-orchestrator.service';
import { EsbController } from '../src/modules/esb/esb.controller';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('I05 — Saga de checkout: robustez, orden LIFO y compensaciones', () => {
  let orchestrator: SagaOrchestratorService;
  let esbController: EsbController;

  // Spies y mocks
  let mockAtraccionesService: any;
  let mockAutosService: any;
  let mockPagosService: any;
  let mockFinanzasService: any;
  let mockBridgeService: any;
  let mockLogger: any;
  let mockSagaRepo: any;
  let mockJournalRepo: any;

  // Registro para verificar el orden exacto de llamadas de compensación
  let executionOrderLog: string[];

  beforeEach(() => {
    executionOrderLog = [];

    mockAtraccionesService = {
      reservar: jest.fn().mockImplementation(async (id, dto) => {
        executionOrderLog.push(`EXEC:RESERVA_ATRACCION:${id}`);
        return { reservation_id: `RES-ATR-${id}`, status: 'CONFIRMED' };
      }),
      cancelarReserva: jest.fn().mockImplementation(async (id) => {
        executionOrderLog.push(`COMP:CANCELAR_ATRACCION:${id}`);
        return { status: 'CANCELLED_ATRACCION_OK', reservation_id: id };
      }),
    };

    mockAutosService = {
      createOrder: jest.fn().mockImplementation(async (dto) => {
        executionOrderLog.push(`EXEC:RESERVA_AUTO:${dto.vehicle_id}`);
        return { pnr: `PNR-AUT-${dto.vehicle_id}`, status: 'CONFIRMED' };
      }),
      cancelOrder: jest.fn().mockImplementation(async (pnr) => {
        executionOrderLog.push(`COMP:CANCELAR_AUTO:${pnr}`);
        return { status: 'CANCELLED_AUTO_OK', pnr };
      }),
    };

    mockPagosService = {
      procesarPago: jest.fn().mockImplementation(async (dto) => {
        if (dto.simular_escenario === 'RECHAZO_FONDOS') {
          throw new HttpException({ message: 'Fondos insuficientes' }, HttpStatus.PAYMENT_REQUIRED);
        }
        if (dto.simular_escenario === 'TIMEOUT_RED') {
          throw new HttpException({ message: 'Timeout en gateway de pagos' }, HttpStatus.GATEWAY_TIMEOUT);
        }
        executionOrderLog.push('EXEC:PROCESAR_PAGO');
        return { transaccion_id: 'TRX-PAY-12345', status: 'APROBADO', monto: dto.monto };
      }),
      procesarReembolso: jest.fn().mockImplementation(async (dto) => {
        executionOrderLog.push(`COMP:REEMBOLSAR_PAGO:${dto.transaccion_id}`);
        return { reembolso_id: `REF-PAY-${dto.transaccion_id}`, status: 'REEMBOLSADO' };
      }),
    };

    mockFinanzasService = {
      registrarVentaYCalcularComision: jest.fn().mockResolvedValue({ comision: 22.0 }),
    };

    mockBridgeService = {
      bridgeEvent: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      logAudit: jest.fn(),
      logError: jest.fn(),
    };

    // Almacén en memoria simulado para pruebas de sagas y journal
    const sagasStorage = new Map<string, any>();
    const journalStorage: any[] = [];

    mockSagaRepo = {
      create: (data: any) => ({ id: `saga-uuid-${Date.now()}`, iniciadaAt: new Date(), ...data }),
      save: jest.fn().mockImplementation(async (saga: any) => {
        sagasStorage.set(saga.correlationId, { ...saga });
        return { ...saga };
      }),
      findOne: jest.fn().mockImplementation(async (query: any) => {
        if (query?.where?.correlationId) {
          return sagasStorage.get(query.where.correlationId) || null;
        }
        return null;
      }),
      find: jest.fn().mockImplementation(async () => Array.from(sagasStorage.values())),
    };

    mockJournalRepo = {
      create: (data: any) => ({ id: `journal-uuid-${Date.now()}`, createdAt: new Date(), ...data }),
      save: jest.fn().mockImplementation(async (entry: any) => {
        journalStorage.push(entry);
        return entry;
      }),
      find: jest.fn().mockImplementation(async (query: any) => {
        return journalStorage.filter(j => j.sagaId === query?.where?.sagaId);
      }),
    };

    orchestrator = new SagaOrchestratorService(
      mockSagaRepo,
      mockJournalRepo,
      mockPagosService,
      mockFinanzasService,
      mockAtraccionesService,
      mockAutosService,
      mockLogger,
      mockBridgeService,
    );

    esbController = new EsbController(orchestrator, {} as any);
  });

  const baseInput: CheckoutSagaInput = {
    cliente_email: 'turista@epn.edu.ec',
    cliente_nombre: 'Turista Ejemplo',
    metodo_pago: 'TARJETA_CREDITO',
    numero_tarjeta: '4111222233334444',
    items: [
      {
        vertical: 'ATRACCIONES',
        item_id: 'ATR-001',
        nombre: 'Tour Mitad del Mundo',
        cantidad: 2,
        precio_unitario: 30.0,
      },
      {
        vertical: 'AUTOS',
        item_id: 'AUT-002',
        nombre: 'Chevrolet Sail',
        cantidad: 3,
        precio_unitario: 40.0,
      },
    ],
  };

  it('1. Camino feliz completo: ejecuta reservas, pago y finaliza en COMPLETED emitiendo eventos', async () => {
    const res = await orchestrator.ejecutarCheckoutCompuesto(baseInput, 'idem-happy-1');

    expect(res.success).toBe(true);
    expect(res.estado).toBe('COMPLETED');
    expect(res.total_pagado).toBe(180.0); // 2*30 + 3*40
    expect(res.items_confirmados).toHaveLength(2);

    expect(mockAtraccionesService.reservar).toHaveBeenCalledTimes(1);
    expect(mockAutosService.createOrder).toHaveBeenCalledTimes(1);
    expect(mockPagosService.procesarPago).toHaveBeenCalledTimes(1);
    expect(mockFinanzasService.registrarVentaYCalcularComision).toHaveBeenCalledTimes(1);

    // Eventos publicados hacia RabbitMQ
    expect(mockBridgeService.bridgeEvent).toHaveBeenCalledWith(
      'SAGA_STARTED',
      expect.any(String),
      expect.any(Object),
    );
    expect(mockBridgeService.bridgeEvent).toHaveBeenCalledWith(
      'ORDER_CONFIRMED',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('2. Fallo en el paso de pago -> ejecuta compensaciones en ORDEN ESTRICTAMENTE INVERSO (LIFO)', async () => {
    const inputConFalloPago: CheckoutSagaInput = {
      ...baseInput,
      simular_fallo_en_paso: 'PAGO_RECHAZADO',
    };

    let errorCapturado: any;
    try {
      await orchestrator.ejecutarCheckoutCompuesto(inputConFalloPago, 'idem-fail-pay');
    } catch (err) {
      errorCapturado = err;
    }

    expect(errorCapturado).toBeDefined();
    expect(errorCapturado.getStatus()).toBe(HttpStatus.CONFLICT);

    const body = errorCapturado.getResponse();
    expect(body.codigo_compensacion).toMatch(/^REF-SAGA-[A-Z0-9]{6}$/);
    expect(body.compensaciones_ejecutadas).toBeDefined();

    // Verificación de orden LIFO:
    // Reservas se ejecutaron: ATR-001 -> AUT-002
    // Compensación debe revertir primero AUT-002 y después ATR-001 (LIFO)
    const compensaciones = executionOrderLog.filter(entry => entry.startsWith('COMP:'));
    expect(compensaciones).toEqual([
      'COMP:CANCELAR_AUTO:PNR-AUT-AUT-002',
      'COMP:CANCELAR_ATRACCION:RES-ATR-ATR-001',
    ]);
  });

  it('3. Falla una compensación -> reintenta y transiciona a COMPENSATION_FAILED con alerta', async () => {
    // Forzar fallo en la función compensatoria de atracciones
    mockAtraccionesService.cancelarReserva = jest.fn().mockRejectedValue(new Error('Socio atracciones no responde'));

    const inputConFalloPago: CheckoutSagaInput = {
      ...baseInput,
      simular_fallo_en_paso: 'PAGO_RECHAZADO',
    };

    let errorCapturado: any;
    try {
      await orchestrator.ejecutarCheckoutCompuesto(inputConFalloPago, 'idem-fail-comp');
    } catch (err) {
      errorCapturado = err;
    }

    expect(errorCapturado).toBeDefined();
    expect(errorCapturado.getStatus()).toBe(HttpStatus.CONFLICT);

    const body = errorCapturado.getResponse();
    expect(body.estado_saga).toBe('COMPENSATION_FAILED');
    expect(body.compensaciones_ejecutadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          servicio: 'MS_ATR',
          estado: 'COMPENSATION_FAILED',
        }),
      ]),
    );

    // Debe reintentar la compensación antes de darla por fallida
    expect(mockAtraccionesService.cancelarReserva.mock.calls.length).toBeGreaterThan(1);
  });

  it('4. Idempotencia: misma Idempotency-Key dos veces -> devuelve la misma respuesta con Idempotent-Replayed', async () => {
    const mockRes1: any = { setHeader: jest.fn() };
    const mockRes2: any = { setHeader: jest.fn() };

    const firstResult = await esbController.checkoutSaga(baseInput, 'key-idem-unique-100', mockRes1);
    expect(firstResult.success).toBe(true);
    expect(mockRes1.setHeader).not.toHaveBeenCalledWith('Idempotent-Replayed', 'true');

    const totalLlamadasPago = mockPagosService.procesarPago.mock.calls.length;

    // Segunda invocación con la misma clave de idempotencia
    const secondResult = await esbController.checkoutSaga(baseInput, 'key-idem-unique-100', mockRes2);

    expect(secondResult).toEqual(firstResult);
    expect(mockRes2.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');

    // No se debió volver a cobrar
    expect(mockPagosService.procesarPago).toHaveBeenCalledTimes(totalLlamadasPago);
  });

  it('5. Vertical con timeout / contingencia -> aplica fallback (CONFIRMED_FALLBACK / external_sync_pending)', async () => {
    // Simular que el adaptador de autos devuelve respuesta en modo contingencia (Circuit Breaker OPEN o timeout de 5s)
    mockAutosService.createOrder = jest.fn().mockResolvedValue({
      pnr: 'AUT-FALLBACK-99',
      status: 'CONFIRMED_FALLBACK',
      external_sync_pending: true,
      circuit_breaker_open: true,
    });

    const res = await orchestrator.ejecutarCheckoutCompuesto(baseInput, 'idem-fallback-1');

    expect(res.success).toBe(true);
    expect(res.estado).toBe('COMPLETED');
    expect(res.items_confirmados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          servicio: 'MS_AUT',
          datos: expect.objectContaining({
            status: 'CONFIRMED_FALLBACK',
            external_sync_pending: true,
          }),
        }),
      ]),
    );
  });
});
