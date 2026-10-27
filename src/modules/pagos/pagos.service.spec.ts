import { HttpException, HttpStatus } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { ReembolsoPago, ReservaPago, TransaccionPago } from './entities';

describe('PagosService', () => {
  let service: PagosService;
  let transactions: TransaccionPago[];
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let refunds: ReembolsoPago[];
  let refundRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let reservations: ReservaPago[];
  let reservationRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let logger: { logAudit: jest.Mock };
  let eventBus: { publish: jest.Mock };

  const transaction = (overrides: Partial<TransaccionPago> = {}): TransaccionPago => ({
    id: 'pay-1',
    idempotencyKey: 'charge-1',
    facturaId: null,
    carritoId: 'store-1',
    clienteId: null,
    montoTotal: 10,
    moneda: 'USD',
    metodoPago: 'TARJETA_CREDITO',
    numeroTarjetaEnmascarado: '•••• •••• •••• 4242',
    estado: 'APROBADO',
    montoReembolsado: 0,
    codigoAutorizacion: 'AUTH-PAG-1',
    codigoReembolso: null,
    mensajePasarela: null,
    createdAt: new Date('2026-10-25T12:00:00.000Z'),
    updatedAt: new Date('2026-10-25T12:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    transactions = [];
    repository = {
      findOne: jest.fn(async ({ where }: { where: Partial<TransaccionPago> | Partial<TransaccionPago>[] }) => {
        const conditions = Array.isArray(where) ? where : [where];
        return transactions.find((item) =>
          conditions.some((condition) =>
            Object.entries(condition).every(([key, value]) => item[key as keyof TransaccionPago] === value),
          ),
        ) ?? null;
      }),
      create: jest.fn((data: Partial<TransaccionPago>) => transaction(data)),
      save: jest.fn(async (item: TransaccionPago) => {
        const index = transactions.findIndex((existing) => existing.id === item.id);
        if (index === -1) transactions.push(item);
        else transactions[index] = item;
        return item;
      }),
      find: jest.fn(async () => transactions),
    };
    refunds = [];
    refundRepository = {
      create: jest.fn((data: Partial<ReembolsoPago>) => ({
        id: `refund-${refunds.length + 1}`,
        transaccionId: '',
        idempotencyKey: '',
        montoReembolsado: 0,
        codigoReembolso: '',
        createdAt: new Date('2026-10-25T12:01:00.000Z'),
        ...data,
      })),
      save: jest.fn(async (item: ReembolsoPago) => {
        refunds.push(item);
        return item;
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<ReembolsoPago> }) =>
        refunds.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null,
      ),
      manager: { transaction: jest.fn() },
    };
    const manager = {
      getRepository: jest.fn((entity: typeof TransaccionPago | typeof ReembolsoPago) =>
        entity === TransaccionPago ? repository : refundRepository,
      ),
    };
    refundRepository.manager.transaction.mockImplementation(
      async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager),
    );
    reservations = [];
    reservationRepository = {
      create: jest.fn((data: Partial<ReservaPago>) => ({ id: 'reservation-link-1', ...data })),
      save: jest.fn(async (item: ReservaPago) => {
        reservations.push(item);
        return item;
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<ReservaPago> }) =>
        reservations.find((item) => item.transaccionId === where.transaccionId && item.reservaId === where.reservaId) ?? null,
      ),
      find: jest.fn(async ({ where }: { where: Partial<ReservaPago> }) =>
        reservations.filter((item) => item.transaccionId === where.transaccionId),
      ),
    };
    logger = { logAudit: jest.fn() };
    eventBus = { publish: jest.fn().mockResolvedValue(true) };
    service = new PagosService(
      repository as never,
      logger as never,
      refundRepository as never,
      reservationRepository as never,
      eventBus as never,
    );
    service.updateConfigSimulador({ modo: 'NORMAL', latencia_ms: 0 });
  });

  it('does not replay a charge key when the request body changes', async () => {
    const existing = transaction();
    transactions.push(existing);

    await expect(
      service.procesarPago({ monto: 12, carrito_id: 'store-1' }, 'charge-1'),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('allows cumulative partial refunds without marking the payment fully refunded', async () => {
    const existing = transaction();
    transactions.push(existing);

    const first = await service.procesarReembolso({ transaccion_id: existing.id, monto: 4 }, 'refund-1');
    const second = await service.procesarReembolso({ transaccion_id: existing.id, monto: 3 }, 'refund-2');

    expect(first.monto_reembolsado).toBe(4);
    expect(second.monto_reembolsado).toBe(3);
    expect(existing.estado).toBe('REEMBOLSO_PARCIAL');
    expect((existing as TransaccionPago & { montoReembolsado?: number }).montoReembolsado).toBe(7);
  });

  it('rejects a refund that would exceed the captured amount', async () => {
    const existing = Object.assign(transaction(), { montoReembolsado: 8 });
    transactions.push(existing);

    await expect(
      service.procesarReembolso({ transaccion_id: existing.id, monto: 3 }, 'refund-excess'),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('requires an existing approved payment before refunding', async () => {
    await expect(
      service.procesarReembolso({ transaccion_id: 'missing', monto: 3 }, 'refund-missing'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('replays an approved charge with the same key without saving or publishing twice', async () => {
    const first = await service.procesarPago({ monto: 10, carrito_id: 'store-1' }, 'charge-repeat');
    const replay = await service.procesarPago({ monto: 10, carrito_id: 'store-1' }, 'charge-repeat');

    expect(first.estado).toBe('APROBADO');
    expect(replay.es_idempotente).toBe(true);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith('payment.completed', expect.objectContaining({
      status: 'APROBADO',
    }));
  });

  it('records a rejection once and never returns card data', async () => {
    await expect(
      service.procesarPago(
        { monto: 10, carrito_id: 'store-1', numero_tarjeta: '4111222233334444', simular_escenario: 'RECHAZO_FONDOS' },
        'charge-rejected',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

    const replay = await service.procesarPago(
      { monto: 10, carrito_id: 'store-1', numero_tarjeta: '4111222233334444', simular_escenario: 'RECHAZO_FONDOS' },
      'charge-rejected',
    );
    const history = await service.getHistorialTransacciones();

    expect(replay.estado).toBe('RECHAZADO');
    expect(replay.es_idempotente).toBe(true);
    expect(JSON.stringify([replay, history])).not.toContain('4111222233334444');
    expect(JSON.stringify(history)).toContain('•••• •••• ••••');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('returns a payment reference only to its store and omits card details', async () => {
    const existing = transaction();
    transactions.push(existing);
    reservations.push({ id: 'link-1', transaccionId: existing.id, reservaId: 'booking-1' });

    const response = await service.validarPaymentReference(existing.id, {
      type: 'store',
      carritoId: 'store-1',
    });
    expect(response.status).toBe('CAPTURED');
    expect(response.bookings).toEqual(['booking-1']);
    expect(JSON.stringify(response)).not.toContain('4242');
    await expect(
      service.validarPaymentReference(existing.id, { type: 'store', carritoId: 'another-store' }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('associates a reservation idempotently and rejects unknown references', async () => {
    const existing = transaction();
    transactions.push(existing);
    const access = { type: 'store' as const, carritoId: 'store-1' };

    expect(await service.asociarReserva(existing.id, 'booking-1', access)).toMatchObject({ associated: true });
    expect(await service.asociarReserva(existing.id, 'booking-1', access)).toMatchObject({ associated: false });
    await expect(
      service.validarPaymentReference('unknown-reference', { type: 'staff' }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(reservationRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not create a second refund for the same idempotency key', async () => {
    const existing = transaction();
    transactions.push(existing);

    const first = await service.procesarReembolso({ transaccion_id: existing.id, monto: 4 }, 'refund-replay');
    const replay = await service.procesarReembolso({ transaccion_id: existing.id, monto: 4 }, 'refund-replay');

    expect(first.codigo_reembolso).toBe(replay.codigo_reembolso);
    expect(replay.monto_reembolsado).toBe(4);
    expect(refundRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('blocks simulator activation in production unless the explicit feature flag is enabled', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSimulatorFlag = process.env.PAGOS_SIMULADOR_HABILITADO;
    process.env.NODE_ENV = 'production';
    delete process.env.PAGOS_SIMULADOR_HABILITADO;
    try {
      expect(() => service.updateConfigSimulador({ modo: 'FRAUDE' })).toThrow(
        expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
      );
      process.env.PAGOS_SIMULADOR_HABILITADO = 'true';
      expect(service.updateConfigSimulador({ modo: 'FRAUDE' }).modo_actual).toBe('FRAUDE');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSimulatorFlag === undefined) delete process.env.PAGOS_SIMULADOR_HABILITADO;
      else process.env.PAGOS_SIMULADOR_HABILITADO = previousSimulatorFlag;
    }
  });
});
