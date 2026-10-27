import { Test, TestingModule } from '@nestjs/testing';
import { KafkaRabbitBridgeService } from './bridge/kafka-rabbit-bridge.service';
import { RabbitMqEventBusService } from './rabbitmq/rabbitmq-event-bus.service';
import { KafkaEventBusService } from './kafka/kafka-event-bus.service';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { EventConsumerIdempotencyService } from './consumer/event-consumer-idempotency.service';
import { RabbitMqConsumerService } from './consumer/rabbitmq-consumer.service';
import { DataSource } from 'typeorm';

describe('I04 — Mensajería: RabbitMQ transaccional y Kafka solo telemetría', () => {
  let bridgeService: KafkaRabbitBridgeService;
  let rabbitService: RabbitMqEventBusService;
  let kafkaService: KafkaEventBusService;
  let telemetryService: TelemetryService;
  let idempotencyService: EventConsumerIdempotencyService;
  let consumerService: RabbitMqConsumerService;

  const mockWinstonLogger = {
    logAudit: jest.fn(),
    logError: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    rabbitService = {
      publish: jest.fn().mockResolvedValue(true),
      isBrokerActive: jest.fn().mockReturnValue(false),
      TOPOLOGY: {
        EXCHANGE: 'booking.events',
        QUEUES: {
          ORDENES: 'q.ordenes.confirmadas',
          SAGAS: 'q.sagas.compensacion',
          STOCK: 'q.stock.actualizado',
          DEAD_LETTER: 'q.dead_letter',
        },
      },
    } as any;

    kafkaService = {
      emitB2BEvent: jest.fn().mockResolvedValue(true),
      isBrokerActive: jest.fn().mockReturnValue(false),
      TOPICS: {
        CATALOGO_SYNC: 'topic-catalogo-sync',
        TELEMETRY_EVENTS: 'booking.telemetry.events',
      },
    } as any;

    bridgeService = new KafkaRabbitBridgeService(
      rabbitService,
      kafkaService,
      mockWinstonLogger as any,
    );

    telemetryService = new TelemetryService(
      mockDataSource as any,
      kafkaService,
    );

    idempotencyService = new EventConsumerIdempotencyService();
    consumerService = new RabbitMqConsumerService(
      rabbitService,
      idempotencyService,
      mockWinstonLogger as any,
    );
  });

  describe('Criterio 1: Separación de canales de publicación (RabbitMQ vs Kafka)', () => {
    it('un evento transaccional de orden/pago se publica en RabbitMQ y NO llega al publisher de Kafka', async () => {
      const orderPayload = {
        order_id: 'ORD-2026-99',
        monto: 350.0,
        cliente: 'test@epn.edu.ec',
      };

      await bridgeService.bridgeEvent('ORDER_CONFIRMED', 'ORD-2026-99', orderPayload);

      // Debe llegar a RabbitMQ (q.ordenes.confirmadas / order.confirmed)
      expect(rabbitService.publish).toHaveBeenCalledTimes(1);
      expect(rabbitService.publish).toHaveBeenCalledWith('order.confirmed', orderPayload);

      // Criterio de aceptación: NO debe llegar al publisher de Kafka
      expect(kafkaService.emitB2BEvent).not.toHaveBeenCalled();
    });

    it('un evento transaccional de compensación de saga se publica en RabbitMQ y NO llega a Kafka', async () => {
      const sagaPayload = {
        saga_id: 'SAGA-TEST-1',
        motivo: 'RECHAZO_FONDOS',
      };

      await bridgeService.bridgeEvent('SAGA_COMPENSATE', 'SAGA-TEST-1', sagaPayload);

      expect(rabbitService.publish).toHaveBeenCalledWith('saga.compensate', sagaPayload);
      expect(kafkaService.emitB2BEvent).not.toHaveBeenCalled();
    });

    it('un evento de telemetría se envía a Kafka y NO llega a RabbitMQ', async () => {
      const telemetryEvent = {
        event_name: 'checkout_started',
        session_id: 'sess-abc-123',
        vertical: 'vuelos',
        device: 'desktop',
        properties: { step: 1 },
      };

      await telemetryService.trackEvent(telemetryEvent);

      // Debe emitirse hacia Kafka topic 'booking.telemetry.events'
      expect(kafkaService.emitB2BEvent).toHaveBeenCalledTimes(1);
      expect(kafkaService.emitB2BEvent).toHaveBeenCalledWith(
        'booking.telemetry.events',
        expect.any(String),
        expect.objectContaining({ event_name: 'checkout_started' }),
      );

      // Criterio de aceptación: NO debe llegar a RabbitMQ
      expect(rabbitService.publish).not.toHaveBeenCalled();
    });
  });

  describe('Criterio 2: Idempotencia del consumidor', () => {
    it('el mismo evento dos veces se procesa una sola vez (dedupe por id del CloudEvent)', async () => {
      const eventId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const handlerMock = jest.fn().mockResolvedValue({ processed: true });

      const cloudEvent = {
        specversion: '1.0',
        id: eventId,
        source: 'booking-prototipo-central',
        type: 'com.booking.order.confirmed',
        time: new Date().toISOString(),
        datacontenttype: 'application/json',
        data: { order_id: 'ORD-123' },
      };

      // Primera entrega del evento
      const res1 = await consumerService.processEvent(cloudEvent, handlerMock);
      expect(res1.duplicate).toBe(false);
      expect(res1.processed).toBe(true);
      expect(handlerMock).toHaveBeenCalledTimes(1);

      // Segunda entrega del mismo evento (duplicado)
      const res2 = await consumerService.processEvent(cloudEvent, handlerMock);
      expect(res2.duplicate).toBe(true);
      expect(res2.processed).toBe(false);

      // El handler de negocio NO debe ejecutarse de nuevo
      expect(handlerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Criterio 3: DLQ y 3 reintentos con backoff', () => {
    it('reintenta hasta 3 veces ante error del handler y luego despacha a DLQ', async () => {
      const failingEvent = {
        specversion: '1.0',
        id: 'fail-event-999',
        source: 'booking-test',
        type: 'com.booking.order.confirmed',
        time: new Date().toISOString(),
        data: { test: true },
      };

      const failingHandler = jest.fn().mockRejectedValue(new Error('Fallo simulado en tienda'));

      // Intentar procesar: debe reintentar 3 veces y luego enviar a DLQ (q.dead_letter)
      const res = await consumerService.processEventWithRetry(failingEvent, failingHandler, {
        maxRetries: 3,
        initialBackoffMs: 5,
      });

      expect(failingHandler).toHaveBeenCalledTimes(4); // Intento 0 + 3 reintentos = 4
      expect(res.sentToDlq).toBe(true);
      expect(rabbitService.publish).toHaveBeenCalledWith('q.dead_letter', expect.objectContaining({
        original_event: failingEvent,
        death_count: 3,
        reason: 'Fallo simulado en tienda',
      }));
    });
  });

  describe('Criterio 4: Modo desarrollo sin brokers (EVENT_BUS_MODE=memory)', () => {
    it('en modo memory opera sin broker externo y no lanza error', async () => {
      const oldEnv = process.env.EVENT_BUS_MODE;
      try {
        process.env.EVENT_BUS_MODE = 'memory';
        const standaloneRabbit = new RabbitMqEventBusService(mockWinstonLogger as any, {
          createCloudEvent: jest.fn().mockReturnValue({ specversion: '1.0', id: '1' }),
        } as any);

        await standaloneRabbit.onModuleInit();
        expect(standaloneRabbit.isBrokerActive()).toBe(false);

        const published = await standaloneRabbit.publish('order.confirmed', { ok: true });
        expect(published).toBe(true);
        expect(mockWinstonLogger.logAudit).toHaveBeenCalledWith(
          'RABBITMQ_EVENTO_EMITIDO_IN_MEMORY',
          expect.any(Object),
        );
      } finally {
        process.env.EVENT_BUS_MODE = oldEnv;
      }
    });
  });
});
