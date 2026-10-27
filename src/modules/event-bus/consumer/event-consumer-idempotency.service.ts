import { Injectable, Logger } from '@nestjs/common';

export interface IdempotencyRecord {
  eventId: string;
  processedAt: Date;
  expiresAt: Date;
  metadata?: any;
}

@Injectable()
export class EventConsumerIdempotencyService {
  private readonly logger = new Logger(EventConsumerIdempotencyService.name);
  private readonly processedEvents = new Map<string, IdempotencyRecord>();
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 horas

  /**
   * Verifica si un evento con el ID de CloudEvent ya fue procesado y no ha expirado.
   */
  isDuplicate(eventId: string): boolean {
    if (!eventId) return false;
    const record = this.processedEvents.get(eventId);
    if (!record) return false;

    if (Date.now() > record.expiresAt.getTime()) {
      this.processedEvents.delete(eventId);
      return false;
    }

    return true;
  }

  /**
   * Registra un CloudEvent ID como procesado con tiempo de vida (TTL).
   */
  markProcessed(eventId: string, metadata?: any, ttlMs: number = this.defaultTtlMs): void {
    if (!eventId) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    this.processedEvents.set(eventId, {
      eventId,
      processedAt: now,
      expiresAt,
      metadata,
    });
    this.logger.debug(`[Idempotencia] CloudEvent ID '${eventId}' registrado como procesado hasta ${expiresAt.toISOString()}`);
  }

  /**
   * Limpia registros vencidos del mapa en memoria.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [id, record] of this.processedEvents.entries()) {
      if (now > record.expiresAt.getTime()) {
        this.processedEvents.delete(id);
      }
    }
  }

  /**
   * Reinicia la caché (útil para pruebas unitarias).
   */
  clear(): void {
    this.processedEvents.clear();
  }
}
