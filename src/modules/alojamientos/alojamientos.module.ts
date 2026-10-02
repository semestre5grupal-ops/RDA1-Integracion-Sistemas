import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlojamientosService } from './alojamientos.service';
import { AlojamientosController } from './alojamientos.controller';
import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { Host } from './entities/host.entity';
import { Amenidad } from './entities/amenidad.entity';
import { FotoAlojamiento } from './entities/foto.entity';
import { ResenaAlojamiento } from './entities/resena.entity';
import { Huesped } from './entities/huesped.entity';
import { DisponibilidadCalendario } from './entities/calendario.entity';

@Module({
  imports: [
    HttpModule,
    CacheModule.register({ ttl: 60000 }),
    TypeOrmModule.forFeature([
      Alojamiento,
      ReservaAlojamiento,
      Host,
      Amenidad,
      FotoAlojamiento,
      ResenaAlojamiento,
      Huesped,
      DisponibilidadCalendario,
    ]),
  ],
  controllers: [AlojamientosController],
  providers: [AlojamientosService],
  exports: [AlojamientosService],
})
export class AlojamientosModule {}
