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
import { TiposHabitacionService } from './tipos-habitacion.service';
import { ProveedoresAlojamientoService } from './proveedores.service';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { SesionSupabaseService } from '../../core/auth/sesion-supabase.service';
import { CoreModule } from '../../core/core.module';
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
    CacheModule.register({ ttl: 60000 }),
    TypeOrmModule.forFeature([
      Alojamiento,
      ReservaAlojamiento,
      ResenaAlojamiento,
      TipoHabitacion,
      HuespedReserva,
      ProveedorAlojamiento,
    ]),
    TelemetryModule,
  ],
  controllers: [AlojamientosController],
  providers: [
    AlojamientosService,
    TiposHabitacionService,
    ProveedoresAlojamientoService,
    SesionSupabaseService,
    GestionAlojamientosGuard,
    ClienteAutenticadoGuard,
    SesionOpcionalGuard,
    SoloAdministradorGuard,
  ],
  exports: [AlojamientosService],
})
export class AlojamientosModule {}
