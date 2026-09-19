import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './entities/usuario.entity';
import { Carrito } from './entities/carrito.entity';
import { CarritoItem } from './entities/carrito-item.entity';
import { Factura } from './entities/factura.entity';
import { FacturaItem } from './entities/factura-item.entity';
import { ApiRequestLog } from './entities/api-request-log.entity';
import { EstadoServicio } from './entities/estado-servicio.entity';
import { Configuracion } from './entities/configuracion.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      Carrito,
      CarritoItem,
      Factura,
      FacturaItem,
      ApiRequestLog,
      EstadoServicio,
      Configuracion,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CoreModule {}
