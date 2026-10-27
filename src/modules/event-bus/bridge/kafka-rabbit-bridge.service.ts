import { Injectable, Logger } from '@nestjs/common';
import { RabbitMqEventBusService } from '../rabbitmq/rabbitmq-event-bus.service';
import { KafkaEventBusService } from '../kafka/kafka-event-bus.service';
import { WinstonPhysicalLoggerService } from '../../../core/logger/winston-logger.service';

@Injectable()
export class KafkaRabbitBridgeService {
  private readonly logger = new Logger(KafkaRabbitBridgeService.name);

  constructor(
    private readonly rabbitService: RabbitMqEventBusService,
    private readonly kafkaService: KafkaEventBusService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
  ) {}

  /**
   * Enruta eventos del Topic Exchange de RabbitMQ y tópicos de streaming en Apache Kafka
   * (Cátedra Semana 8 - RabbitMQ transaccional, Kafka solo telemetría y analítica).
   */
  async bridgeEvent(tipoEvento: string, aggregateId: string, payload: any): Promise<void> {
    this.logger.log(`[Dual Event Bridge] Enrutando evento '${tipoEvento}' [ID: ${aggregateId}]`);

    const upper = (tipoEvento || '').toUpperCase();

    // 1. Enviar eventos transaccionales autoritativos a RabbitMQ
    let routingKey = 'general.event';
    if (upper.includes('SEARCH')) routingKey = 'search.query';
    if (upper.includes('STOCK')) routingKey = 'stock.updated';
    if (upper.includes('ORDER') || upper.includes('RESERVA') || upper.includes('PAGO')) routingKey = 'order.confirmed';
    if (upper.includes('SAGA') || upper.includes('COMPENSATE')) routingKey = 'saga.compensate';

    await this.rabbitService.publish(routingKey, payload);

    // 2. Replicar a Apache Kafka SOLO telemetría y analítica de sincronización de catálogo.
    // Alcance I04: Quitar el reenvío de ORDER/RESERVA/PAGO/STOCK/COMPENSATE a Kafka.
    let kafkaTopic: string | null = null;
    if (upper.includes('CATALOGO')) {
      kafkaTopic = this.kafkaService.TOPICS.CATALOGO_SYNC;
    } else if (upper.includes('TELEMETRY')) {
      kafkaTopic = this.kafkaService.TOPICS.TELEMETRY_EVENTS;
    }

    if (kafkaTopic) {
      await this.kafkaService.emitB2BEvent(kafkaTopic, aggregateId, payload);
    }

    this.winstonLogger.logAudit('DUAL_EVENT_BUS_BRIDGED', {
      evento: tipoEvento,
      aggregate_id: aggregateId,
      rabbit_key: routingKey,
      kafka_topic: kafkaTopic,
    });
  }
}
