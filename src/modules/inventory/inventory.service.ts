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

/** Resultado de validar quién envía un mensaje de stock. */
export interface OrigenValidado {
  ok: boolean;
  /** Código gRPC sugerido cuando ok = false (3 INVALID_ARGUMENT, 7 PERMISSION_DENIED, 16 UNAUTHENTICATED). */
  grpcCode?: number;
  motivo?: string;
}

/** Valores genéricos de vertical que NO identifican a un proveedor concreto. */
const SERVICE_IDS_GENERICOS = new Set(['vuelos', 'autos', 'atracciones', 'alojamientos', 'hoteles']);

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

  // Telemetría real para el Panel 7 (antes eran valores fijos en el frontend)
  private readonly arranque = Date.now();
  private readonly marcasRecientes: number[] = [];
  private totalRecibidos = 0;
  private totalRechazados = 0;
  private ultimoMensajeAt: string | null = null;
  private ultimoStreamHash: string | null = null;
  private readonly rechazosRecientes: Array<{ at: string; service_id: string | null; motivo: string }> = [];
  private readonly mensajesPorNodo = new Map<string, number>();

  constructor(
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    @Optional() private readonly eventBridge?: KafkaRabbitBridgeService,
    @Optional() private readonly dataSource?: DataSource,
  ) {
    // Sembrar registros de ejemplo para arrancar sincronizado
    this.stockRegistry.set(this.buildKey('atracciones-dilan', 'PRhu4UBTWPBC', '2026-10-25', '10:00'), {
      service_id: 'atracciones-dilan',
      item_id: 'PRhu4UBTWPBC',
      date: '2026-10-25',
      time_slot: '10:00',
      available_units: 12,
      last_updated: new Date().toISOString(),
      source: 'SEED_INITIAL'
    });
  }

  /**
   * La clave incluye el proveedor: dos aerolíneas pueden enviar el mismo
   * `AV1632-ECONOMY` y no deben pisarse entre sí.
   */
  private buildKey(serviceId: string, itemId: string, date: string, timeSlot: string): string {
    return `${serviceId || 'SIN_NODO'}|${itemId}_${date}_${timeSlot || 'DEFAULT'}`;
  }

  /**
   * Mapa nodo -> clave leído de GRPC_NODE_KEYS (JSON), p. ej.
   * {"NODE_VUE_ECOAIRLINES":"k-123","atracciones-dilan":"k-456"}.
   * Vacío = modo abierto (desarrollo): se acepta cualquier clave.
   */
  private clavesPorNodo(): Record<string, string> {
    const raw = process.env.GRPC_NODE_KEYS;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.logger.error('GRPC_NODE_KEYS no es un JSON válido; se rechazarán todos los mensajes gRPC.');
      return { __invalido__: '__invalido__' };
    }
  }

  modoAutenticacion(): 'API_KEY' | 'ABIERTO' {
    return Object.keys(this.clavesPorNodo()).length > 0 ? 'API_KEY' : 'ABIERTO';
  }

  /**
   * Valida el origen de un mensaje de stock (contrato de vuelos v2 §9 y
   * acuerdo con las aerolíneas): `service_id` obligatorio y específico del
   * nodo, y `x-api-key` emitida por Booking que corresponda a ese nodo.
   */
  validarOrigen(serviceId: string | undefined | null, apiKey: string | undefined | null): OrigenValidado {
    const sid = (serviceId || '').trim();
    if (!sid) {
      return { ok: false, grpcCode: 3, motivo: 'service_id es obligatorio.' };
    }
    if (SERVICE_IDS_GENERICOS.has(sid.toLowerCase())) {
      return { ok: false, grpcCode: 3, motivo: `service_id "${sid}" es genérico; envíe el código de su nodo (ej. NODE_VUE_<NOMBRE>).` };
    }
    const claves = this.clavesPorNodo();
    if (Object.keys(claves).length === 0) {
      return { ok: true };
    }
    if (!apiKey) {
      return { ok: false, grpcCode: 16, motivo: 'Falta x-api-key en la metadata gRPC.' };
    }
    const esperada = claves[sid];
    if (!esperada) {
      return { ok: false, grpcCode: 7, motivo: `El nodo "${sid}" no está registrado en Booking.` };
    }
    if (esperada !== apiKey) {
      return { ok: false, grpcCode: 7, motivo: `La x-api-key no corresponde al nodo "${sid}".` };
    }
    return { ok: true };
  }

  /** Registra un rechazo para que el admin lo vea en el Panel 7. */
  registrarRechazo(serviceId: string | null | undefined, motivo: string): void {
    this.totalRechazados++;
    this.rechazosRecientes.unshift({ at: new Date().toISOString(), service_id: serviceId || null, motivo });
    if (this.rechazosRecientes.length > 20) this.rechazosRecientes.length = 20;
    this.logger.warn(`[gRPC Inbound] Mensaje rechazado (${serviceId || 'sin service_id'}): ${motivo}`);
    this.winstonLogger.logAudit('GRPC_STOCK_UPDATE_REJECTED', { service_id: serviceId || null, motivo });
  }

  private registrarRecepcion(serviceId: string): void {
    const ahora = Date.now();
    this.totalRecibidos++;
    this.ultimoMensajeAt = new Date(ahora).toISOString();
    this.marcasRecientes.push(ahora);
    while (this.marcasRecientes.length && this.marcasRecientes[0] < ahora - 60_000) {
      this.marcasRecientes.shift();
    }
    this.mensajesPorNodo.set(serviceId, (this.mensajesPorNodo.get(serviceId) || 0) + 1);
  }

  registrarStreamCompletado(hash: string): void {
    this.ultimoStreamHash = hash;
  }

  /**
   * Procesa la actualización de stock puntual enviada por una tienda externa vía gRPC.
   */
  processPushStockUpdate(msg: any, source: 'GRPC_PUSH' | 'ADMIN_PANEL' = 'GRPC_PUSH'): StockUpdateAck {
    const itemId = msg.item_id || msg.itemId;
    const serviceId = msg.service_id || msg.serviceId;
    const date = msg.date;
    const timeSlot = msg.time_slot || msg.timeSlot || 'DEFAULT';
    const availableUnits = msg.available_units !== undefined ? Number(msg.available_units) : Number(msg.availableUnits);
    const timestamp = Number(msg.timestamp || Date.now());
    const slotId = msg.slot_id || msg.slotId || `slot-${date?.replace(/-/g, '')}-${timeSlot?.replace(/[^0-9]/g, '').slice(0, 4) || '1000'}`;

    const key = this.buildKey(serviceId, itemId, date, timeSlot);
    const existing = this.stockRegistry.get(key);
    this.registrarRecepcion(serviceId);

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
      source
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

    const key = this.buildKey(serviceId, itemId, date, timeSlot);
    const current = this.stockRegistry.get(key);
    this.registrarRecepcion(serviceId);

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
  getInventory(itemId?: string, date?: string, serviceId?: string): InventoryRecord[] {
    const records = Array.from(this.stockRegistry.values());
    return records.filter(r => {
      if (serviceId && r.service_id !== serviceId) return false;
      if (itemId && r.item_id !== itemId) return false;
      if (date && r.date !== date) return false;
      return true;
    });
  }

  /**
   * Consulta puntual de disponibilidad de un turno (RPC gRPC: GetSlotAvailability).
   */
  getSlotAvailability(req: SlotAvailabilityRequest): SlotAvailabilityResponse {
    const serviceId = req.service_id || '';
    const itemId = req.item_id;
    const date = req.date || new Date().toISOString().split('T')[0];
    const timeSlot = req.time_slot || 'DEFAULT';
    
    // Si viene service_id buscamos la clave exacta; si no viene, buscamos el primer registro coincidente por itemId, date y timeSlot
    let record = serviceId ? this.stockRegistry.get(this.buildKey(serviceId, itemId, date, timeSlot)) : undefined;
    if (!record) {
      for (const r of this.stockRegistry.values()) {
        if (r.item_id === itemId && r.date === date && (r.time_slot === timeSlot || timeSlot === 'DEFAULT')) {
          record = r;
          break;
        }
      }
    }

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
    const ahora = Date.now();
    const ultimoMinuto = this.marcasRecientes.filter(t => t >= ahora - 60_000).length;
    const registros = Array.from(this.stockRegistry.values())
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());

    const porNodo = new Map<string, { service_id: string; items: number; unidades_disponibles: number; mensajes: number; ultima_actualizacion: string }>();
    for (const r of registros) {
      const n = porNodo.get(r.service_id) || {
        service_id: r.service_id, items: 0, unidades_disponibles: 0,
        mensajes: this.mensajesPorNodo.get(r.service_id) || 0, ultima_actualizacion: r.last_updated,
      };
      n.items++;
      n.unidades_disponibles += Number(r.available_units) || 0;
      if (r.last_updated > n.ultima_actualizacion) n.ultima_actualizacion = r.last_updated;
      porNodo.set(r.service_id, n);
    }

    return {
      status: 'OPERATIONAL',
      protocol: 'gRPC / HTTP/2',
      port: Number(process.env.GRPC_PORT || 50051),
      auth_mode: this.modoAutenticacion(),
      uptime_seconds: Math.round((ahora - this.arranque) / 1000),
      total_items_in_registry: this.stockRegistry.size,
      total_messages_received: this.totalRecibidos,
      total_messages_rejected: this.totalRechazados,
      messages_last_minute: ultimoMinuto,
      throughput_msg_sec: Math.round((ultimoMinuto / 60) * 100) / 100,
      last_message_at: this.ultimoMensajeAt,
      last_sync_hash: this.ultimoStreamHash,
      nodes: Array.from(porNodo.values()),
      recent_rejections: this.rechazosRecientes,
      sample_records: registros.slice(0, 50),
    };
  }
}

