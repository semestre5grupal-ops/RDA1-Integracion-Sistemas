import { Controller, Get, Post, Body, Param, Headers, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { AutosService } from './autos.service';
import { ApiTags, ApiOperation, ApiHeader, ApiParam } from '@nestjs/swagger';
import { CacheInterceptor } from '@nestjs/cache-manager';

@ApiTags('Autos')
@Controller('autos')
export class AutosController {
  constructor(private readonly autosService: AutosService) {}

  @Post('search')
  @ApiOperation({ summary: 'Búsqueda de renta de vehículos (Catálogo Híbrido)' })
  search(@Body() dto: any) {
    return this.autosService.search(dto);
  }

  @Post('depots')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Consultar lista de agencias de renta' })
  getDepots() {
    return this.autosService.getDepots();
  }

  @Post('constants')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Consultar constantes del sistema' })
  getConstants() {
    return this.autosService.getConstants();
  }

  @Post('suppliers')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'Listar proveedores de renta de autos' })
  getSuppliers() {
    return this.autosService.getSuppliers();
  }

  @Post('orders/create')
  @ApiOperation({ summary: 'Crear orden/reserva de renta de vehículo' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createOrder(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Body() orderData: any
  ) {
    return this.autosService.createOrder(orderData, idempotencyKey);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Obtener historial de órdenes (Admin)' })
  getOrders() {
    return this.autosService.getOrders();
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Obtener detalles de la orden' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  getOrderById(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.autosService.getOrderById(orderId);
  }

  @Post('orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancelar una orden de renta' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  cancelOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Body() cancelData: any
  ) {
    return this.autosService.cancelOrder(orderId, cancelData, idempotencyKey);
  }

  // --- Endpoints Administrativos para CRUD de Autos Locales --- //
  
  @Post()
  @ApiOperation({ summary: 'Crear auto local (Admin)' })
  createAutoLocal(@Body() autoData: any) {
    return this.autosService.createAutoLocal(autoData);
  }

  @Post(':id/delete')
  @ApiOperation({ summary: 'Eliminar auto local (Admin)' })
  deleteAutoLocal(@Param('id', ParseUUIDPipe) id: string) {
    return this.autosService.deleteAutoLocal(id);
  }
}
