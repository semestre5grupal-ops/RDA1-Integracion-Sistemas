import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlojamientosService } from './alojamientos.service';
import { AlojamientosController } from './alojamientos.controller';
import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { ResenaAlojamiento } from './entities/resena.entity';
import { TipoHabitacion } from './entities/tipo-habitacion.entity';
import { HuespedReserva } from './entities/huesped-reserva.entity';
import { ProveedorAlojamiento } from './entities/proveedor-alojamiento.entity';
import { EventoOutboxAlojamiento } from './entities/evento-outbox.entity';
import { TiposHabitacionService } from './tipos-habitacion.service';
import { ProveedoresAlojamientoService } from './proveedores.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SesionSupabaseService } from '../../core/auth/sesion-supabase.service';
import { CoreModule } from '../../core/core.module';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { AlojamientosCircuitBreakerAdapter } from './acl/alojamientos-circuit-breaker.adapter';
import { AlojamientosSociosService } from './socios/alojamientos-socios.service';
import { AlojamientosSociosReservasService } from './socios/alojamientos-socios-reservas.service';
import { ConfigProveedor } from '../nodes/entities/config-proveedor.entity';
import {
  GestionAlojamientosGuard,
  ClienteAutenticadoGuard,
  SesionOpcionalGuard,
  SoloAdministradorGuard,
} from './guards/gestion-alojamientos.guard';

@Module({
  imports: [
    CoreModule,
    HttpModule,
    InventoryModule,
    CacheModule.register({ ttl: 60000 }),
    TypeOrmModule.forFeature([
      Alojamiento,
      ReservaAlojamiento,
      ResenaAlojamiento,
      TipoHabitacion,
      HuespedReserva,
      ProveedorAlojamiento,
      EventoOutboxAlojamiento,
      ConfigProveedor,
    ]),
    TelemetryModule,
  ],
  controllers: [AlojamientosController],
  providers: [
    AlojamientosService,
    TiposHabitacionService,
    ProveedoresAlojamientoService,
    SesionSupabaseService,
    WinstonPhysicalLoggerService,
    AlojamientosCircuitBreakerAdapter,
    AlojamientosSociosService,
    AlojamientosSociosReservasService,
    GestionAlojamientosGuard,
    ClienteAutenticadoGuard,
    SesionOpcionalGuard,
    SoloAdministradorGuard,
  ],
  exports: [
    AlojamientosService,
    AlojamientosCircuitBreakerAdapter,
    WinstonPhysicalLoggerService,
    AlojamientosSociosReservasService,
  ],
})
export class AlojamientosModule {}
