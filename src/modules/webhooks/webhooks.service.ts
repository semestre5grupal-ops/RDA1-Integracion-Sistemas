import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { RabbitMqEventBusService } from '../event-bus/rabbitmq/rabbitmq-event-bus.service';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { InboundCloudEventDto } from './dto/inbound-cloud-event.dto';
import { ListWebhookDeliveriesDto } from './dto/list-webhook-deliveries.dto';
import { WebhookEntrega } from './entities';

const VERTICALES = ['vuelos', 'autos', 'atracciones', 'alojamientos'] as const;
type Vertical = (typeof VERTICALES)[number];

export interface WebhookReceiveResponse {
  success: true;
  status: 'ACCEPTED' | 'DEDUPLICATED';
  message: string;
  event_id: string;
  vertical: Vertical;
  queue_target?: string;
  received_at?: Date;
  original_processed_at?: Date;
  replayed: boolean;
}

function esVertical(vertical: string): vertical is Vertical {
  return VERTICALES.includes(vertical as Vertical);
}

function esUniqueViolation(error: unknown): boolean {
  return error instanceof QueryFailedError &&
    typeof error.driverError === 'object' &&
    error.driverError !== null &&
    'code' in error.driverError &&
    error.driverError.code === '23505';
}

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEntrega)
    private readonly entregaRepo: Repository<WebhookEntrega>,
    private readonly eventBus: RabbitMqEventBusService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
  ) {}

  async receive(
    verticalParam: string,
    rawBody: Buffer | undefined,
    signature: string | undefined,
    body: unknown,
    contentType?: string,
  ): Promise<WebhookReceiveResponse> {
    if (!esVertical(verticalParam)) {
      throw new NotFoundException(`La vertical '${verticalParam}' no está registrada.`);
    }
    if (!rawBody) throw new BadRequestException('No se pudo leer el cuerpo crudo del webhook.');
    if (rawBody.length > 1024 * 1024) {
      throw new HttpException('El cuerpo del webhook excede el máximo permitido de 1 MB.', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const secret = process.env[`WEBHOOK_SECRET_${verticalParam.toUpperCase()}`];
    if (!secret || secret.length < 16) {
      throw new ServiceUnavailableException(`El secreto del proveedor para '${verticalParam}' no está configurado.`);
    }
    if (!this.validarFirma(rawBody, signature, secret)) {
      this.winstonLogger.logAudit('WEBHOOK_FIRMA_INVALIDA', { vertical: verticalParam });
      throw new UnauthorizedException('La firma HMAC-SHA256 del webhook no es válida.');
    }
    if (!contentType || !/^application\/cloudevents\+json(?:\s*;|$)/i.test(contentType)) {
      throw new BadRequestException('Content-Type debe ser application/cloudevents+json.');
    }

    const event = this.validarCloudEvent(body);
    const existing = await this.entregaRepo.findOne({
      where: { eventId: event.id },
    });
    if (existing) return this.respuestaDuplicado(existing, verticalParam);

    const delivery = this.entregaRepo.create({
      eventId: event.id,
      vertical: verticalParam,
      eventType: event.type,
      source: event.source,
      status: 'EN_COLA',
      signatureValid: true,
      correlationId: event.correlationid || null,
      subject: event.subject || null,
      traceparent: event.traceparent || null,
      processedAt: null,
      errorMessage: null,
      payloadSummary: { subject: event.subject, bytes_size: rawBody.length },
    });

    try {
      await this.entregaRepo.save(delivery);
    } catch (error) {
      if (!esUniqueViolation(error)) throw error;
      const concurrent = await this.entregaRepo.findOne({
        where: { eventId: event.id },
      });
      if (!concurrent) throw error;
      return this.respuestaDuplicado(concurrent, verticalParam);
    }

    this.encolarProcesamiento(delivery, event, verticalParam);
    return {
      success: true,
      status: 'ACCEPTED',
      message: 'CloudEvent recibido, firma verificada y encolado para procesamiento asíncrono.',
      event_id: event.id,
      vertical: verticalParam,
      queue_target: `booking.webhooks.inbound.${verticalParam}`,
      received_at: delivery.receivedAt,
      replayed: false,
    };
  }

  async listDeliveries(
    verticalParam: string,
    query: ListWebhookDeliveriesDto,
  ): Promise<{
    total: number;
    vertical: Vertical;
    next_cursor: string | null;
    data: Array<Record<string, unknown>>;
  }> {
    if (!esVertical(verticalParam)) {
      throw new NotFoundException(`La vertical '${verticalParam}' no está registrada.`);
    }

    const offset = this.cursorOffset(query.cursor);
    const where: Partial<WebhookEntrega> = { vertical: verticalParam };
    if (query.status) where.status = query.status;
    if (query.correlationid) where.correlationId = query.correlationid;
    const limit = query.limit || 50;
    const [deliveries, total] = await Promise.all([
      this.entregaRepo.find({
        where,
        order: { receivedAt: 'DESC', id: 'DESC' },
        skip: offset,
        take: limit + 1,
      }),
      this.entregaRepo.count({ where }),
    ]);
    const hasNextPage = deliveries.length > limit;
    const page = deliveries.slice(0, limit);

    return {
      total,
      vertical: verticalParam,
      next_cursor: hasNextPage ? this.encodeCursor(offset + limit) : null,
      data: page.map((delivery) => ({
        id: delivery.id,
        event_id: delivery.eventId,
        vertical: delivery.vertical,
        event_type: delivery.eventType,
        source: delivery.source,
        status: delivery.status,
        signature_valid: delivery.signatureValid,
        correlationid: delivery.correlationId,
        traceparent: delivery.traceparent,
        received_at: delivery.receivedAt,
        processed_at: delivery.processedAt,
        error_message: delivery.errorMessage,
        payload_summary: delivery.payloadSummary,
      })),
    };
  }

  private validarFirma(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
    if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const actualBuffer = Buffer.from(signature, 'ascii');
    const expectedBuffer = Buffer.from(expected, 'ascii');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private validarCloudEvent(body: unknown): InboundCloudEventDto {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('El cuerpo debe ser un CloudEvent JSON.');
    }
    const event = plainToInstance(InboundCloudEventDto, body);
    const errors = validateSync(event, { whitelist: false });
    if (errors.length > 0) throw new BadRequestException('El cuerpo no cumple el esquema CloudEvents v1.0.');
    return event;
  }

  private respuestaDuplicado(delivery: WebhookEntrega, vertical: Vertical): WebhookReceiveResponse {
    return {
      success: true,
      status: 'DEDUPLICATED',
      message: 'Evento duplicado detectado por id; omitido según regla de idempotencia.',
      event_id: delivery.eventId,
      vertical,
      original_processed_at: delivery.receivedAt,
      replayed: true,
    };
  }

  private encolarProcesamiento(
    delivery: WebhookEntrega,
    event: InboundCloudEventDto,
    vertical: Vertical,
  ): void {
    setImmediate(() => {
      void this.procesarEntrega(delivery, event, vertical).catch((error: unknown) => {
        this.winstonLogger.logAudit('WEBHOOK_PROCESAMIENTO_ERROR', {
          delivery_id: delivery.id,
          event_id: delivery.eventId,
          vertical,
          error: mensajeError(error),
        }, delivery.correlationId || undefined);
      });
    });
  }

  private async procesarEntrega(
    delivery: WebhookEntrega,
    event: InboundCloudEventDto,
    vertical: Vertical,
  ): Promise<void> {
    try {
      const published = await this.eventBus.publish(`booking.webhooks.inbound.${vertical}`, event);
      if (!published) throw new Error('RabbitMQ no confirmó la publicación del webhook.');
      delivery.status = 'PROCESADO';
      delivery.processedAt = new Date();
      await this.entregaRepo.save(delivery);
      this.winstonLogger.logAudit('WEBHOOK_PROCESADO', {
        delivery_id: delivery.id,
        event_id: delivery.eventId,
        vertical,
        event_type: delivery.eventType,
      }, delivery.correlationId || undefined);
    } catch (error) {
      delivery.status = 'ERROR';
      delivery.errorMessage = 'No fue posible publicar el evento en el bus.';
      await this.entregaRepo.save(delivery);
      throw error;
    }
  }

  private cursorOffset(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const token = cursor.startsWith('cur_') ? cursor.slice(4) : '';
      const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('offset' in parsed) ||
        typeof parsed.offset !== 'number' ||
        !Number.isSafeInteger(parsed.offset) ||
        parsed.offset < 0 ||
        parsed.offset > 1_000_000
      ) {
        throw new Error('Invalid cursor');
      }
      return parsed.offset;
    } catch {
      throw new BadRequestException('El cursor de entregas no es válido.');
    }
  }

  private encodeCursor(offset: number): string {
    return `cur_${Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url')}`;
  }
}
