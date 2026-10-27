import { TraceContextService } from '../../core/tracing/trace-context.service';
import { RabbitMqEventBusService } from './rabbitmq/rabbitmq-event-bus.service';
import { KafkaEventBusService } from './kafka/kafka-event-bus.service';

describe('event tracing metadata', () => {
  it('does not log event payloads when RabbitMQ is unavailable', async () => {
    const traceContext = new TraceContextService();
    const logger = { logAudit: jest.fn() };
    const rabbit = new RabbitMqEventBusService(logger as any, traceContext);
    const payload = { webhook_secret: 'secret-value-that-must-not-be-logged' };

    await rabbit.publish('booking.webhooks.inbound.vuelos', payload);

    expect(logger.logAudit).toHaveBeenCalledWith(
      'RABBITMQ_EVENTO_EMITIDO_IN_MEMORY',
      expect.objectContaining({ routing_key: 'booking.webhooks.inbound.vuelos' }),
    );
    expect(JSON.stringify(logger.logAudit.mock.calls)).not.toContain('secret-value-that-must-not-be-logged');
  });

  it('publishes CloudEvents tracing attributes to RabbitMQ and Kafka', async () => {
    const traceContext = new TraceContextService();
    const logger = { logAudit: jest.fn() };
    const rabbit = new RabbitMqEventBusService(logger as any, traceContext) as any;
    const kafka = new KafkaEventBusService(logger as any, traceContext) as any;
    const rabbitPublish = jest.fn().mockReturnValue(true);
    const kafkaSend = jest.fn().mockResolvedValue(undefined);
    rabbit.traceContext = traceContext;
    rabbit.isConnected = true;
    rabbit.channel = { publish: rabbitPublish };
    kafka.traceContext = traceContext;
    kafka.isConnected = true;
    kafka.producer = { send: kafkaSend };

    const context = traceContext.createContext(
      'corr-event',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );
    const payload = { booking_id: 'booking-1' };
    await traceContext.run(context, async () => {
      await rabbit.publish('order.confirmed', payload);
      await kafka.emitB2BEvent('booking.telemetry.events', 'booking-1', payload);
    });

    const rabbitMessage = JSON.parse(rabbitPublish.mock.calls[0][2].toString());
    const kafkaMessage = kafkaSend.mock.calls[0][0].messages[0];
    const kafkaEvent = JSON.parse(kafkaMessage.value);

    for (const event of [rabbitMessage, kafkaEvent]) {
      expect(event.specversion).toBe('1.0');
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(event.correlationid).toBe('corr-event');
      expect(event.traceparent).toMatch(
        /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/,
      );
      expect(event.source).toMatch(/^booking-prototipo/);
      expect(event.type).toMatch(/^com\.booking\./);
      expect(event.node_id).toBe(context.nodeId);
      expect(event.data).toEqual(payload);
    }
    expect(rabbitPublish.mock.calls[0][3].headers['x-correlation-id']).toBe('corr-event');
    expect(rabbitPublish.mock.calls[0][3].headers.traceparent).toBe(
      rabbitMessage.traceparent,
    );
    expect(kafkaMessage.headers['x-correlation-id'].toString()).toBe('corr-event');
    expect(kafkaMessage.headers.traceparent.toString()).toBe(kafkaEvent.traceparent);
  });
});
