import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { Carrito } from './entities/carrito.entity';
import { CarritoItem } from './entities/carrito-item.entity';
import { Factura } from './entities/factura.entity';
import { FacturaItem } from './entities/factura-item.entity';
import { EstadoServicio } from './entities/estado-servicio.entity';
import { Configuracion } from './entities/configuracion.entity';

import { WinstonPhysicalLoggerService } from './logger/winston-logger.service';
import { TraceContextService } from './tracing/trace-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      Carrito,
      CarritoItem,
      Factura,
      FacturaItem,
      EstadoServicio,
      Configuracion,
    ]),
  ],
  providers: [WinstonPhysicalLoggerService, TraceContextService],
  exports: [TypeOrmModule, WinstonPhysicalLoggerService, TraceContextService],
})
export class CoreModule {}
