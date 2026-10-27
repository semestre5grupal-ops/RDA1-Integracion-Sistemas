import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createClient } from '@supabase/supabase-js';
import { KafkaEventBusService } from '../event-bus/kafka/kafka-event-bus.service';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corto = (v: any, max: number) => (v === undefined || v === null ? null : String(v).slice(0, max));

/**
 * Guarda la telemetría del frontend (embudo de conversión, tráfico por vertical).
 * Emite a Apache Kafka en streaming (tópico booking.telemetry.events) conforme a Cátedra Semana 8 / I04.
 *
 * Se escribe directo en Postgres (misma conexión que el resto del backend), así
 * no depende de SUPABASE_SECRET_KEY. Si la escritura SQL falla se intenta con
 * el cliente de Supabase como respaldo.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly supabase;
  private esquemaListo: Promise<void> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly kafkaService?: KafkaEventBusService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
  }

  /** Crea las tablas si aún no existen (no toca tablas ya creadas). */
  private asegurarEsquema() {
    if (!this.esquemaListo) {
      const sentencias = [
        `CREATE TABLE IF NOT EXISTS telemetry_events (
           id BIGSERIAL PRIMARY KEY,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           event_name VARCHAR(80) NOT NULL,
           session_id VARCHAR(80),
           user_id VARCHAR(80),
           vertical VARCHAR(40),
           device VARCHAR(20),
           properties JSONB DEFAULT '{}'::jsonb
         )`,
        `CREATE TABLE IF NOT EXISTS provider_api_calls (
           id BIGSERIAL PRIMARY KEY,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           provider VARCHAR(80),
           vertical VARCHAR(40),
           operation VARCHAR(80),
           status_code INT,
           latency_ms INT,
           success BOOLEAN,
           error_type VARCHAR(80),
           error_message TEXT,
           session_id VARCHAR(80)
         )`,
      ];
      // Supabase en modo pooler no acepta varias sentencias en una sola consulta
      this.esquemaListo = (async () => {
        for (const sql of sentencias) {
          await this.dataSource.query(sql).catch((e) => this.logger.warn(`Telemetría: no se pudo preparar tabla (${e.message})`));
        }
      })();
    }
    return this.esquemaListo;
  }

  async trackEvent(data: any) {
    const fila = {
      event_name: corto(data?.event_name, 80),
      session_id: corto(data?.session_id || 'anonymous', 80),
      user_id: data?.user_id && ES_UUID.test(String(data.user_id)) ? String(data.user_id) : null,
      vertical: corto(data?.vertical, 40),
      device: corto(data?.device, 20),
      properties: data?.properties && typeof data.properties === 'object' ? data.properties : {},
    };
    if (!fila.event_name) return { success: false, error: 'event_name es obligatorio' };

    // Cátedra Semana 8: Kafka exclusivo para telemetría de navegación y analítica masiva
    if (this.kafkaService) {
      try {
        const topic = this.kafkaService.TOPICS?.TELEMETRY_EVENTS || 'booking.telemetry.events';
        await this.kafkaService.emitB2BEvent(topic, fila.session_id, {
          ...fila,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Telemetría hacia Kafka falló (${err.message})`);
      }
    }

    try {
      await this.asegurarEsquema();
      await this.dataSource.query(
        `INSERT INTO telemetry_events (event_name, session_id, user_id, vertical, device, properties)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [fila.event_name, fila.session_id, fila.user_id, fila.vertical, fila.device, JSON.stringify(fila.properties)],
      );
      return { success: true };
    } catch (e) {
      this.logger.warn(`Telemetría por SQL falló (${e.message}); probando Supabase...`);
    }

    const { error } = await this.supabase.from('telemetry_events').insert(fila);
    if (error) this.logger.error('Error guardando evento de telemetría: ' + error.message);
    return { success: !error };
  }

  async trackApiCall(data: any) {
    const valores = [
      corto(data?.provider, 80), corto(data?.vertical, 40), corto(data?.operation, 80),
      Number.isFinite(Number(data?.status_code)) ? Number(data.status_code) : null,
      Number.isFinite(Number(data?.latency_ms)) ? Math.round(Number(data.latency_ms)) : null,
      typeof data?.success === 'boolean' ? data.success : null,
      corto(data?.error_type, 80), data?.error_message ? String(data.error_message) : null, corto(data?.session_id, 80),
    ];
    try {
      await this.asegurarEsquema();
      await this.dataSource.query(
        `INSERT INTO provider_api_calls (provider, vertical, operation, status_code, latency_ms, success, error_type, error_message, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        valores,
      );
      return;
    } catch (e) {
      this.logger.warn(`Telemetría de API por SQL falló (${e.message}); probando Supabase...`);
    }
    const { error } = await this.supabase.from('provider_api_calls').insert({
      provider: data.provider, vertical: data.vertical, operation: data.operation, status_code: data.status_code,
      latency_ms: data.latency_ms, success: data.success, error_type: data.error_type, error_message: data.error_message,
      session_id: data.session_id,
    });
    if (error) this.logger.error('Error guardando telemetría de API: ' + error.message);
  }
}
