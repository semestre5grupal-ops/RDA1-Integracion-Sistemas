import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminConfigService } from './admin-config.service';
import { AdminFinanzasService } from './admin-finanzas.service';
import { AdminMetricasService } from './admin-metricas.service';
import { AdminAuditService } from './admin-audit.service';
import { PublicConfigController } from './public-config.controller';
import { AdminProveedoresService } from './admin-proveedores.service';
import { ProveedoresPublicController } from './proveedores-public.controller';
import { ConnectorHealthService } from './connector-health.service';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { Reserva } from '../vuelos/entities/reserva.entity';
import { OrderAuto } from '../autos/entities/order-auto.entity';
import { ReservaAtraccion } from '../atracciones/entities/reserva.entity';
import { ReservaAlojamiento } from '../alojamientos/entities/reserva.entity';
import { Alojamiento } from '../alojamientos/entities/alojamiento.entity';
import { CoreModule } from '../../core/core.module';
import { AlojamientosModule } from '../alojamientos/alojamientos.module';

/**
 * Global para que otros módulos (p. ej. Facturas, Adaptadores) puedan leer la configuración
 * de la plataforma (`AdminConfigService`) y el estado de conectores (`ConnectorHealthService`).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Reserva, OrderAuto, ReservaAtraccion, ReservaAlojamiento, Alojamiento]),
    CoreModule,
    HttpModule,
    // Las acciones del panel sobre hospedaje pasan por las reglas del propio módulo.
    AlojamientosModule,
  ],
  controllers: [AdminController, PublicConfigController, ProveedoresPublicController],
  providers: [
    AdminService,
    AdminConfigService,
    AdminFinanzasService,
    AdminMetricasService,
    AdminAuditService,
    AdminProveedoresService,
    ConnectorHealthService,
    WinstonPhysicalLoggerService,
  ],
  exports: [AdminConfigService, AdminAuditService, ConnectorHealthService],
})
export class AdminModule { }
