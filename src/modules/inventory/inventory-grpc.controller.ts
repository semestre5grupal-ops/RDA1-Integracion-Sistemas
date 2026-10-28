import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod, RpcException } from '@nestjs/microservices';
import type { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';
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
  pushStockUpdate(data: StockUpdateMessage, metadata?: Metadata): StockUpdateAck {
    this.exigirOrigenValido(data, metadata);
    return this.inventoryService.processPushStockUpdate(data);
  }

  /** Lee un valor de la metadata gRPC sin romper si no viene. */
  private leerMetadata(metadata: Metadata | undefined, clave: string): string | undefined {
    const valor = metadata?.get?.(clave)?.[0];
    return valor === undefined ? undefined : String(valor);
  }

  /**
   * Rechaza el mensaje si el `service_id` es genérico/ausente o si la
   * `x-api-key` no corresponde al nodo (cuando GRPC_NODE_KEYS está definido).
   */
  private exigirOrigenValido(msg: any, metadata?: Metadata): void {
    const serviceId = msg?.service_id || msg?.serviceId;
    const apiKey = this.leerMetadata(metadata, 'x-api-key');
    const r = this.inventoryService.validarOrigen(serviceId, apiKey);
    if (!r.ok) {
      this.inventoryService.registrarRechazo(serviceId, r.motivo!);
      throw new RpcException({ code: r.grpcCode, message: r.motivo });
    }
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
  streamInventoryChanges(messages$: Observable<StockChangeEvent>, metadata?: Metadata): Observable<StreamSummary> {
    return new Observable<StreamSummary>((observer) => {
      let count = 0;
      messages$.subscribe({
        next: (event: any) => {
          try {
            this.exigirOrigenValido(event, metadata);
          } catch (err) {
            observer.error(err);
            return;
          }
          count++;
          this.inventoryService.applyStockDelta(event);
        },
        error: (err) => {
          observer.error(err);
        },
        complete: () => {
          const hash = `hash-sync-${Date.now().toString(36).toUpperCase()}`;
          this.inventoryService.registrarStreamCompletado(hash);
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
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración solo para pruebas no productivas', required: false })
  @ApiOperation({ summary: 'Consultar estado y telemetría del servidor gRPC Inbound' })
  @ApiResponse({ status: 200, description: 'Estado operativo del socket gRPC en puerto 50051' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN o MANTENIMIENTO)' })
  getStatus() {
    return this.inventoryService.getStatus();
  }

  @Get()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Admin-Key', description: 'Clave de administración solo para pruebas no productivas', required: false })
  @ApiOperation({ summary: 'Consultar inventario sincronizado recibido mediante gRPC' })
  @ApiResponse({ status: 200, description: 'Inventario sincronizado consultado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Acceso restringido (requiere rol ADMIN o MANTENIMIENTO)' })
  getInventory(
    @Query('item_id') itemId?: string,
    @Query('date') date?: string,
    @Query('service_id') serviceId?: string,
  ) {
    const data = this.inventoryService.getInventory(itemId, date, serviceId);
    return { status: 'success', total: data.length, data };
  }

  /**
   * Prueba manual desde el Panel 7: el admin inyecta un mensaje de stock
   * por REST con la misma validación de `service_id` que el canal gRPC
   * (la x-api-key no aplica porque el admin ya está autenticado).
   */
  @Post('push-stock')
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN, Rol.MANTENIMIENTO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inyectar manualmente un StockUpdateMessage (prueba del Panel 7)' })
  @ApiResponse({ status: 200, description: 'Stock registrado' })
  @ApiResponse({ status: 400, description: 'service_id ausente o genérico, o datos incompletos' })
  pushStockDesdeAdmin(@Body() body: Partial<StockUpdateMessage>) {
    const serviceId = body?.service_id;
    const valid = this.inventoryService.validarOrigen(serviceId, null);
    // En modo API_KEY la validación exige clave; para el admin solo importa el service_id.
    if (!valid.ok && valid.grpcCode === 3) {
      throw new BadRequestException(valid.motivo);
    }
    const units = Number(body?.available_units);
    if (!body?.item_id || !body?.date || !Number.isInteger(units) || units < 0) {
      throw new BadRequestException('item_id, date y available_units (entero >= 0) son obligatorios.');
    }
    return this.inventoryService.processPushStockUpdate(
      { ...body, available_units: units, timestamp: body.timestamp || Date.now() },
      'ADMIN_PANEL',
    );
  }

  /**
   * Respaldo HTTP REST para tiendas socias (Consideraciones RDA2 H-P12-04 y §1/§3)
   * Permite actualizar inventario/stock cuando los socios no pueden o no desean usar gRPC en la nube.
   * Expuesto automáticamente como:
   *  - POST /api/v3/inventory/stock (URL oficial consultada por Daniel y las tiendas)
   *  - POST /api/v2/inventory/stock
   *  - POST /api/v1/inventory/stock
   */
  @Post('stock')
  @HttpCode(200)
  @ApiOperation({ summary: 'Respaldo HTTP REST: Actualización de stock puntual de tiendas socias (equivalente a PushStockUpdate)' })
  @ApiHeader({ name: 'X-Api-Key', description: 'API Key del nodo socio registrado en Booking', required: false })
  @ApiResponse({ status: 200, description: 'Stock actualizado exitosamente vía REST' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o incompletos' })
  @ApiResponse({ status: 401, description: 'No autorizado / API Key inválida' })
  async pushStockHttp(@Body() body: any, @Req() req: any) {
    const rawKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['x-api_key'] || req.headers['authorization'];
    const apiKey = typeof rawKey === 'string' ? rawKey.replace(/^Bearer\s+/i, '').trim() : undefined;

    let serviceId = body?.service_id || body?.serviceId;
    const itemId = body?.item_id || body?.itemId || body?.vehicle_id || body?.auto_id;
    const rawUnits = body?.available_units !== undefined ? body.available_units : (body?.availableUnits !== undefined ? body.availableUnits : body?.units);
    const units = Number(rawUnits);
    const date = body?.date || new Date().toISOString().slice(0, 10);
    const timeSlot = body?.time_slot || body?.timeSlot || 'DEFAULT';

    if (!itemId) {
      throw new BadRequestException('El campo item_id (o vehicle_id) es obligatorio.');
    }
    if (rawUnits === undefined || isNaN(units) || units < 0) {
      throw new BadRequestException('El campo available_units (número entero >= 0) es obligatorio.');
    }

    if (!serviceId && apiKey) {
      serviceId = await this.inventoryService.resolverServiceIdPorApiKey(apiKey);
    }
    if (!serviceId) {
      if (String(itemId).toLowerCase().startsWith('auto-') || String(itemId).includes('sail') || String(itemId).includes('toyota')) {
        serviceId = 'NODE_AUT_DANIEL';
      } else {
        serviceId = 'NODE_ATR_DILAN';
      }
    }

    const valid = this.inventoryService.validarOrigen(serviceId, apiKey);
    if (!valid.ok && this.inventoryService.modoAutenticacion() === 'API_KEY') {
      throw new UnauthorizedException(valid.motivo);
    }

    const ack = this.inventoryService.processPushStockUpdate(
      {
        service_id: serviceId,
        item_id: itemId,
        date,
        time_slot: timeSlot,
        available_units: units,
        timestamp: body?.timestamp || Date.now(),
        slot_id: body?.slot_id || body?.slotId,
      },
      'HTTP_REST',
    );

    return {
      success: ack.success,
      acknowledged: true,
      message: ack.message || 'Stock actualizado correctamente vía canal HTTP REST',
      service_id: serviceId,
      item_id: itemId,
      date,
      available_units: units,
      processed_at: ack.processed_at || Date.now(),
      source: 'HTTP_REST',
    };
  }
}
