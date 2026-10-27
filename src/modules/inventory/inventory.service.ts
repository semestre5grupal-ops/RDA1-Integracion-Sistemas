import { Injectable, Logger, Optional } from '@nestjs/common';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { KafkaRabbitBridgeService } from '../event-bus/bridge/kafka-rabbit-bridge.service';
import { DataSource } from 'typeorm';

export interface StockUpdateMessage {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  timestamp: number | string;
  slot_id?: string;
}

export interface StockUpdateAck {
  success: boolean;
  message: string;
  processed_at: number;
  processedAt?: number;
  error_code?: string;
  errorCode?: string;
  current_available?: number;
  currentAvailable?: number;
}

export interface StockChangeEvent {
  event_id: string;
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  delta: number;
  timestamp: number | string;
  slot_id?: string;
}

export interface StreamSummary {
  total_events_processed: number;
  is_synchronized: boolean;
  last_sync_hash: string;
}

export interface SlotAvailabilityRequest {
  service_id?: string;
  item_id: string;
  date?: string;
  time_slot?: string;
  slot_id?: string;
}

export interface SlotAvailabilityResponse {
  item_id: string;
  slot_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  status: string;
  last_updated_epoch: number;
}

export interface InventoryRecord {
  service_id: string;
  item_id: string;
  date: string;
  time_slot: string;
  available_units: number;
  last_updated: string;
  timestamp?: number;
  slot_id?: string;
  source: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  // Almacén en memoria sincronizado del inventario recibido por gRPC
  private readonly stockRegistry = new Map<string, InventoryRecord>();

  constructor(
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    @Optional() private readonly eventBridge?: KafkaRabbitBridgeService,
    @Optional() private readonly dataSource?: DataSource,
  ) {
    // Sembrar registros de ejemplo para arrancar sincronizado
    this.stockRegistry.set('PRhu4UBTWPBC_2026-10-25_10:00', {
      service_id: 'atracciones-dilan',
      item_id: 'PRhu4UBTWPBC',
      date: '2026-10-25',
      time_slot: '10:00',
      available_units: 12,
      last_updated: new Date().toISOString(),
      source: 'SEED_INITIAL'
    });
  }

  private buildKey(itemId: string, date: string, timeSlot: string): string {
    return `${itemId}_${date}_${timeSlot || 'DEFAULT'}`;
  }

  /**
   * Procesa la actualización de stock puntual enviada por una tienda externa vía gRPC.
   */
  processPushStockUpdate(msg: any): StockUpdateAck {
    const itemId = msg.item_id || msg.itemId;
    const serviceId = msg.service_id || msg.serviceId;
    const date = msg.date;
    const timeSlot = msg.time_slot || msg.timeSlot || 'DEFAULT';
    const availableUnits = msg.available_units !== undefined ? Number(msg.available_units) : Number(msg.availableUnits);
    const timestamp = Number(msg.timestamp || Date.now());
    const slotId = msg.slot_id || msg.slotId || `slot-${date?.replace(/-/g, '')}-${timeSlot?.replace(/[^0-9]/g, '').slice(0, 4) || '1000'}`;

    const key = this.buildKey(itemId, date, timeSlot);
    const existing = this.stockRegistry.get(key);

    // Protección contra Eventos Desordenados (Monotonic Timestamp Validation)
    if (existing && existing.timestamp && timestamp < existing.timestamp) {
      this.logger.warn(
        `[gRPC Inbound] Evento descartado para ${itemId}: Timestamp entrante (${timestamp}) es inferior al último procesado (${existing.timestamp}).`
      );
      return {
        success: false,
        message: `Evento descartado: el timestamp ${timestamp} es anterior al registro vigente (${existing.timestamp}).`,
        processed_at: Date.now(),
        processedAt: Date.now(),
        error_code: 'STALE_TIMESTAMP_IGNORED',
        errorCode: 'STALE_TIMESTAMP_IGNORED',
        current_available: existing.available_units,
        currentAvailable: existing.available_units,
      };
    }

    const prevUnits = existing?.available_units ?? null;

    const record: InventoryRecord = {
      service_id: serviceId,
      item_id: itemId,
      date,
      time_slot: timeSlot,
      available_units: availableUnits,
      last_updated: new Date().toISOString(),
      timestamp,
      slot_id: slotId,
      source: 'GRPC_PUSH'
    };

    this.stockRegistry.set(key, record);

    this.logger.log(
      `[gRPC Inbound] Stock actualizado para ${itemId} (${date} ${timeSlot} / ${slotId}): ${prevUnits ?? 'N/A'} -> ${availableUnits} cupos [Origen: ${serviceId}]`
    );

    // Actualizar tabla relacional en PostgreSQL si la base está conectada
    if (this.dataSource && this.dataSource.isInitialized) {
      const isAuto = (serviceId && serviceId.toLowerCase().includes('auto')) || (itemId && itemId.toLowerCase().startsWith('auto-')) || serviceId === 'NODE_AUT_LOCAL';
      if (isAuto) {
        const estadoAuto = availableUnits <= 0 ? 'RESERVADO' : 'DISPONIBLE';
        this.dataSource.query(
          `UPDATE schema_autos.autos_catalogo 
           SET estado_operativo = $1, updated_at = NOW() 
           WHERE id = $2`,
          [estadoAuto, itemId]
        ).catch((e: any) => {
          this.logger.debug?.(`No se pudo sincronizar autos_catalogo en BD para ${itemId}: ${e.message}`);
        });
      } else {
        const estado = availableUnits <= 0 ? 'AGOTADO' : (availableUnits <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE');
        const capacidad = Math.max(20, availableUnits);
        this.dataSource.query(
          `INSERT INTO schema_atracciones.atracciones_turnos_aforo 
             (atraccion_id, fecha, hora_inicio, capacidad_total, cupos_disponibles, estado)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (atraccion_id, fecha, hora_inicio) 
           DO UPDATE SET cupos_disponibles = EXCLUDED.cupos_disponibles, estado = EXCLUDED.estado`,
          [itemId, date, timeSlot, capacidad, availableUnits, estado]
        ).catch((e: any) => {
          this.logger.debug?.(`No se pudo sincronizar turnos_aforo en BD para ${itemId}: ${e.message}`);
        });
      }
    }

    // Auditoría física en archivo .log rotativo (Consideraciones RDA2 §2)
    this.winstonLogger.logAudit('GRPC_STOCK_UPDATE_RECEIVED', {
      service_id: serviceId,
      item_id: itemId,
      date,
      time_slot: timeSlot,
      slot_id: slotId,
      previous_units: prevUnits,
      new_available_units: availableUnits,
      timestamp
    });

    // Emisión hacia Broker Dual (RabbitMQ 'stock.updated' + Apache Kafka 'topic-catalogo-sync')
    if (this.eventBridge) {
      this.eventBridge.bridgeEvent('STOCK_UPDATED', itemId, record).catch(err => {
        this.logger.warn(`Error al propagar evento de stock a bus dual: ${err.message}`);
      });
    }

    const now = Date.now();
    return {
      success: true,
      message: `Stock sincronizado exitosamente en Booking Prototipo para ${itemId}: ${availableUnits} unidades disponibles.`,
      processed_at: now,
      processedAt: now,
      error_code: 'OK',
      errorCode: 'OK',
      current_available: availableUnits,
      currentAvailable: availableUnits,
    };
  }

  /**
   * Aplica un evento de delta (+/-) recibido a través de un stream de gRPC.
   */
  applyStockDelta(event: any): void {
    const eventId = event.event_id || event.eventId;
    const itemId = event.item_id || event.itemId;
    const serviceId = event.service_id || event.serviceId;
    const date = event.date;
    const timeSlot = event.time_slot || event.timeSlot || 'DEFAULT';
    const delta = event.delta;

    const key = this.buildKey(itemId, date, timeSlot);
    const current = this.stockRegistry.get(key);

    const currentUnits = current ? current.available_units : 10;
    const newUnits = Math.max(0, currentUnits + delta);

    this.stockRegistry.set(key, {
      service_id: serviceId,
      item_id: itemId,
      date,
      time_slot: timeSlot,
      available_units: newUnits,
      last_updated: new Date().toISOString(),
      source: 'GRPC_STREAM_DELTA'
    });

    this.logger.log(
      `[gRPC Stream Delta] Evento ${eventId}: delta ${delta} sobre ${itemId} -> Nuevo stock: ${newUnits}`
    );

    // Actualizar tabla relacional en PostgreSQL
    if (this.dataSource && this.dataSource.isInitialized) {
      const isAuto = (serviceId && serviceId.toLowerCase().includes('auto')) || (itemId && itemId.toLowerCase().startsWith('auto-')) || serviceId === 'NODE_AUT_LOCAL';
      if (isAuto) {
        const estadoAuto = newUnits <= 0 ? 'RESERVADO' : 'DISPONIBLE';
        this.dataSource.query(
          `UPDATE schema_autos.autos_catalogo 
           SET estado_operativo = $1, updated_at = NOW() 
           WHERE id = $2`,
          [estadoAuto, itemId]
        ).catch((e: any) => {
          this.logger.debug?.(`No se pudo sincronizar autos_catalogo en BD para delta ${itemId}: ${e.message}`);
        });
      } else {
        const estado = newUnits <= 0 ? 'AGOTADO' : (newUnits <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE');
        const capacidad = Math.max(20, newUnits);
        this.dataSource.query(
          `INSERT INTO schema_atracciones.atracciones_turnos_aforo 
             (atraccion_id, fecha, hora_inicio, capacidad_total, cupos_disponibles, estado)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (atraccion_id, fecha, hora_inicio) 
           DO UPDATE SET cupos_disponibles = EXCLUDED.cupos_disponibles, estado = EXCLUDED.estado`,
          [itemId, date, timeSlot, capacidad, newUnits, estado]
        ).catch((e: any) => {
          this.logger.debug?.(`No se pudo sincronizar turnos_aforo en BD para delta ${itemId}: ${e.message}`);
        });
      }
    }

    this.winstonLogger.logAudit('GRPC_STOCK_DELTA_STREAMED', {
      event_id: eventId,
      service_id: serviceId,
      item_id: itemId,
      delta,
      new_units: newUnits
    });

    if (this.eventBridge) {
      this.eventBridge.bridgeEvent('STOCK_DELTA_UPDATED', itemId, {
        service_id: serviceId,
        item_id: itemId,
        date,
        time_slot: timeSlot,
        new_units: newUnits,
        delta,
      }).catch(err => {
        this.logger.warn(`Error al propagar delta de stock a bus dual: ${err.message}`);
      });
    }
  }

  /**
   * Consulta el stock sincronizado actual para consulta REST o integración.
   */
  getInventory(itemId?: string, date?: string): InventoryRecord[] {
    const records = Array.from(this.stockRegistry.values());
    return records.filter(r => {
      if (itemId && r.item_id !== itemId) return false;
      if (date && r.date !== date) return false;
      return true;
    });
  }

  /**
   * Consulta puntual de disponibilidad de un turno (RPC gRPC: GetSlotAvailability).
   */
  getSlotAvailability(req: SlotAvailabilityRequest): SlotAvailabilityResponse {
    const itemId = req.item_id;
    const date = req.date || new Date().toISOString().split('T')[0];
    const timeSlot = req.time_slot || 'DEFAULT';
    const key = this.buildKey(itemId, date, timeSlot);

    const record = this.stockRegistry.get(key);
    const available = record ? record.available_units : 10;
    const slotId = req.slot_id || record?.slot_id || `slot-${date.replace(/-/g, '')}-${timeSlot.replace(/[^0-9]/g, '').slice(0, 4) || '1000'}`;
    const status = available <= 0 ? 'AGOTADO' : (available <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE');

    return {
      item_id: itemId,
      slot_id: slotId,
      date,
      time_slot: timeSlot,
      available_units: available,
      status,
      last_updated_epoch: record?.timestamp || Date.now(),
    };
  }

  /**
   * Métricas y estado del servicio de inventario para monitoreo.
   */
  getStatus() {
    return {
      status: 'OPERATIONAL',
      protocol: 'gRPC / HTTP/2 Multiplexed',
      port: 50051,
      total_items_in_registry: this.stockRegistry.size,
      last_sync: new Date().toISOString(),
      sample_records: Array.from(this.stockRegistry.values()).slice(-5)
    };
  }
}

