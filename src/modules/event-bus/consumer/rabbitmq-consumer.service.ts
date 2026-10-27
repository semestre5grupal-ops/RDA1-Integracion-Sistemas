import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMqEventBusService } from '../rabbitmq/rabbitmq-event-bus.service';
import { EventConsumerIdempotencyService } from './event-consumer-idempotency.service';
import { WinstonPhysicalLoggerService } from '../../../core/logger/winston-logger.service';

export interface ProcessEventResult<T = any> {
  processed: boolean;
  duplicate: boolean;
  sentToDlq?: boolean;
  result?: T;
  error?: any;
}

export interface RetryOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  backoffFactor?: number;
}

@Injectable()
export class RabbitMqConsumerService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqConsumerService.name);

  constructor(
    private readonly rabbitService: RabbitMqEventBusService,
    private readonly idempotencyService: EventConsumerIdempotencyService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
  ) {}

  async onModuleInit() {
    // Si el broker está activo en modo rabbitmq, podríamos inicializar listeners
    if (this.rabbitService.isBrokerActive()) {
      this.logger.log('Consumidor RabbitMQ listo para escuchar colas autoritativas.');
    }
  }

  /**
   * Procesa un evento con verificación estricta de idempotencia por ID de CloudEvent.
   */
  async processEvent<T = any>(
    event: any,
    handler: (data: any) => Promise<T>,
  ): Promise<ProcessEventResult<T>> {
    const eventId = event?.id || event?.event_id;

    if (eventId && this.idempotencyService.isDuplicate(eventId)) {
      this.logger.warn(`[Dedupe] Evento duplicado detectado (CloudEvent ID: ${eventId}). Descartando sin reprocesar.`);
      this.winstonLogger.logAudit('EVENTO_DUPLICADO_IGNORADO', {
        cloud_event_id: eventId,
        tipo_evento: event?.type,
      });
      return { processed: false, duplicate: true };
    }

    try {
      const result = await handler(event?.data || event?.payload || event);
      if (eventId) {
        this.idempotencyService.markProcessed(eventId, {
          tipo: event?.type,
          processed_at: new Date().toISOString(),
        });
      }
      return { processed: true, duplicate: false, result };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Procesa un evento con idempotencia y hasta 3 reintentos con backoff exponencial.
   * Si se agotan los reintentos, el mensaje se despacha a la cola DLQ ('q.dead_letter').
   */
  async processEventWithRetry<T = any>(
    event: any,
    handler: (data: any) => Promise<T>,
    options?: RetryOptions,
  ): Promise<ProcessEventResult<T>> {
    const maxRetries = options?.maxRetries ?? 3;
    const initialBackoff = options?.initialBackoffMs ?? 100;
    const factor = options?.backoffFactor ?? 2;

    const eventId = event?.id || event?.event_id;

    if (eventId && this.idempotencyService.isDuplicate(eventId)) {
      this.logger.warn(`[Dedupe] Evento duplicado ignorado antes de reintentos (ID: ${eventId})`);
      return { processed: false, duplicate: true };
    }

    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        const result = await handler(event?.data || event?.payload || event);
        if (eventId) {
          this.idempotencyService.markProcessed(eventId, {
            tipo: event?.type,
            processed_at: new Date().toISOString(),
          });
        }
        return { processed: true, duplicate: false, result };
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt <= maxRetries) {
          const delay = initialBackoff * Math.pow(factor, attempt - 1);
          this.logger.warn(
            `[Reintento ${attempt}/${maxRetries}] Fallo al procesar evento ${eventId || 'anónimo'}: ${err.message}. Esperando ${delay}ms...`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Reintentos agotados -> Despachar a Dead Letter Queue (DLQ)
    const dlqPayload = {
      original_event: event,
      death_count: maxRetries,
      reason: lastError?.message || 'Error desconocido tras agotar reintentos',
      failed_at: new Date().toISOString(),
    };

    this.logger.error(
      `[DLQ] Mensaje agotó ${maxRetries} reintentos. Enrutando a 'q.dead_letter': ${lastError?.message}`,
    );

    await this.rabbitService.publish('q.dead_letter', dlqPayload);

    this.winstonLogger.logAudit('RABBITMQ_EVENTO_ENVIADO_A_DLQ', {
      event_id: eventId,
      death_count: maxRetries,
      error: lastError?.message,
    });

    return {
      processed: false,
      duplicate: false,
      sentToDlq: true,
      error: lastError,
    };
  }
}
