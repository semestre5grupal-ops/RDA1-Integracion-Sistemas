import { Controller, Get, Query } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  InventoryService,
  StockUpdateMessage,
  StockUpdateAck,
  StockChangeEvent,
  StreamSummary,
} from './inventory.service';

/**
 * Controlador Híbrido: Expone RPCs binarias gRPC sobre HTTP/2 (puerto 50051)
 * y consultas de estado REST sobre HTTP/1.1 para observabilidad en el frontend.
 * 
 * Normativa: Consideraciones RDA2 §1 ("gRPC y protocolos de comunicación") y §3 ("Integración con Booking")
 */
@ApiTags('Inventario gRPC (Inbound)')
@Controller('inventory')
export class InventoryGrpcController {
  constructor(private readonly inventoryService: InventoryService) {}

  // =========================================================================
  // SERVICIO gRPC INBOUND: InventoryStockService (src/proto/inventory.proto)
  // =========================================================================

  /**
   * RPC 1: PushStockUpdate
   * Las tiendas externas empujan actualizaciones puntuales de inventario hacia Booking.
   */
  @GrpcMethod('InventoryStockService', 'PushStockUpdate')
  pushStockUpdate(data: StockUpdateMessage): StockUpdateAck {
    return this.inventoryService.processPushStockUpdate(data);
  }

  /**
   * RPC 3: GetSlotAvailability
   * Consulta puntual de disponibilidad confirmada.
   */
  @GrpcMethod('InventoryStockService', 'GetSlotAvailability')
  getSlotAvailability(data: any): any {
    return this.inventoryService.getSlotAvailability(data);
  }

  /**
   * RPC 2: StreamInventoryChanges
   * Streaming continuo HTTP/2 multiplexado para propagación en ráfaga de cambios de stock.
   */
  @GrpcStreamMethod('InventoryStockService', 'StreamInventoryChanges')
  streamInventoryChanges(messages$: Observable<StockChangeEvent>): Observable<StreamSummary> {
    return new Observable<StreamSummary>((observer) => {
      let count = 0;
      messages$.subscribe({
        next: (event: any) => {
          count++;
          this.inventoryService.applyStockDelta(event);
        },
        error: (err) => {
          observer.error(err);
        },
        complete: () => {
          const hash = `hash-sync-${Date.now().toString(36).toUpperCase()}`;
          observer.next({
            total_events_processed: count,
            totalEventsProcessed: count,
            is_synchronized: true,
            isSynchronized: true,
            last_sync_hash: hash,
            lastSyncHash: hash,
          } as any);
          observer.complete();
        },
      });
    });
  }

  // =========================================================================
  // ENDPOINTS REST PARA MONITOREO Y OBSERVABILIDAD DEL INVENTARIO SINCRONIZADO
  // =========================================================================

  @Get('status')
  @ApiOperation({ summary: 'Consultar estado y telemetría del servidor gRPC Inbound' })
  @ApiResponse({ status: 200, description: 'Estado operativo del socket gRPC en puerto 50051' })
  getStatus() {
    return this.inventoryService.getStatus();
  }

  @Get()
  @ApiOperation({ summary: 'Consultar inventario sincronizado recibido mediante gRPC' })
  getInventory(
    @Query('item_id') itemId?: string,
    @Query('date') date?: string
  ) {
    return {
      status: 'success',
      total: this.inventoryService.getInventory(itemId, date).length,
      data: this.inventoryService.getInventory(itemId, date),
    };
  }
}
