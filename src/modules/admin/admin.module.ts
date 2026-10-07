import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminConfigService } from './admin-config.service';
import { AdminFinanzasService } from './admin-finanzas.service';
import { AdminAuditService } from './admin-audit.service';
import { PublicConfigController } from './public-config.controller';
import { AdminProveedoresService } from './admin-proveedores.service';
import { ProveedoresPublicController } from './proveedores-public.controller';
import { Reserva } from '../vuelos/entities/reserva.entity';
import { OrderAuto } from '../autos/entities/order-auto.entity';
import { ReservaAtraccion } from '../atracciones/entities/reserva.entity';
import { ReservaAlojamiento } from '../alojamientos/entities/reserva.entity';
import { Alojamiento } from '../alojamientos/entities/alojamiento.entity';
import { CoreModule } from '../../core/core.module';

/**
 * Global para que otros módulos (p. ej. Facturas) puedan leer la configuración
 * de la plataforma (`AdminConfigService`) sin importar este módulo.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Reserva, OrderAuto, ReservaAtraccion, ReservaAlojamiento, Alojamiento]),
    CoreModule,
  ],
  controllers: [AdminController, PublicConfigController, ProveedoresPublicController],
  providers: [AdminService, AdminConfigService, AdminFinanzasService, AdminAuditService, AdminProveedoresService],
  exports: [AdminConfigService, AdminAuditService],
})
export class AdminModule { }
