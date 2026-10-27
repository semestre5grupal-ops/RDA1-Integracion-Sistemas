import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, logLevel, Partitioners } from 'kafkajs';
import { WinstonPhysicalLoggerService } from '../../../core/logger/winston-logger.service';
import { TraceContextService } from '../../../core/tracing/trace-context.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KafkaEventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaEventBusService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private isConnected = false;

  public readonly TOPICS = {
    CATALOGO_SYNC: 'topic-catalogo-sync',
    TELEMETRY_EVENTS: 'booking.telemetry.events',
    // Mantenidos por retrocompatibilidad hacia contratos v1 pero no usados para transaccional en I04
    ORDENES_B2B: 'topic-ordenes-b2b',
    AUDITORIA_SAGAS: 'topic-auditoria-sagas',
  };

  constructor(
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    private readonly traceContext: TraceContextService,
  ) {}

  async onModuleInit() {
    process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
    const sink = (process.env.TELEMETRY_SINK || 'none').toLowerCase();
    if (sink === 'kafka') {
      await this.conectarKafka();
    } else {
      this.logger.log(`ℹ️ [Apache Kafka] Modo TELEMETRY_SINK='${sink}': operando sin broker externo.`);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.producer) await this.producer.disconnect();
    } catch (e) {}
  }

  private async conectarKafka(): Promise<void> {
    const brokersStr = process.env.KAFKA_BROKERS || 'localhost:9092';
    const brokers = brokersStr.split(',').map(b => b.trim());

    try {
      this.logger.log(`[Apache Kafka] Inicializando cliente con brokers: ${brokers.join(', ')}`);
      this.kafka = new Kafka({
        clientId: 'booking-prototipo-aggregator',
        brokers,
        connectionTimeout: 1000,
        retry: { retries: 0 },
        logLevel: logLevel.NOTHING,
      });

      this.producer = this.kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
      });
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('✅ [Apache Kafka] Productor conectado exitosamente para streaming de telemetría.');
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(`⚠️ [Apache Kafka] Broker no disponible en ${brokers.join(', ')} (${err.message}). Operando en modo Fallback en memoria.`);
    }
  }

  async emitB2BEvent(topic: string, key: string, payload: any): Promise<boolean> {
    const event = this.traceContext?.createCloudEvent
      ? this.traceContext.createCloudEvent(`com.booking.${topic}`, 'booking-prototipo-central', payload)
      : {
          specversion: '1.0',
          id: 'gen-' + Date.now(),
          type: `com.booking.${topic}`,
          source: 'booking-prototipo-central',
          time: new Date().toISOString(),
          datacontenttype: 'application/json',
          data: payload,
          correlationid: payload?.correlation_id || 'corr-default',
          traceparent: '00-00000000000000000000000000000000-0000000000000000-01',
          node_id: 'BOOKING_CENTRAL',
        };

    const value = JSON.stringify({
      ...event,
      payload,
      emitted_at: event.time,
    });

    const sink = (process.env.TELEMETRY_SINK || 'none').toLowerCase();

    // Si TELEMETRY_SINK=file, escribir a logs/telemetry.jsonl
    if (sink === 'file') {
      try {
        const logsDir = path.resolve(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.appendFileSync(path.join(logsDir, 'telemetry.jsonl'), value + '\n', 'utf8');
      } catch (e) {
        this.logger.warn(`Error al escribir telemetría a archivo: ${e.message}`);
      }
    }

    if (this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic,
          messages: [{
            key,
            value,
            headers: {
              correlationid: event.correlationid,
              'x-correlation-id': event.correlationid,
              traceparent: event.traceparent,
              node_id: event.node_id,
            },
          }],
        });
        this.winstonLogger.logAudit('KAFKA_EVENTO_B2B_ENVIADO', {
          topic,
          key,
        });
        return true;
      } catch (err) {
        this.logger.warn(`Fallo al enviar a Kafka: ${err.message}.`);
      }
    }

    // Fallback de observabilidad
    this.winstonLogger.logAudit('KAFKA_EVENTO_B2B_IN_MEMORY', {
      topic,
      key,
      payload,
      cloud_event: event,
    });
    return true;
  }

  async emitTelemetryEvent(key: string, payload: any): Promise<boolean> {
    return this.emitB2BEvent(this.TOPICS.TELEMETRY_EVENTS, key, payload);
  }

  isBrokerActive(): boolean {
    return this.isConnected;
  }
}
