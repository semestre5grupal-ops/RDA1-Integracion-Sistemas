import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { AtraccionesService } from './atracciones.service';
import { AtraccionesController } from './atracciones.controller';
import { PagoService } from './pago.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    CommonModule, 
    HttpModule,
    CacheModule.register({ ttl: 60 * 1000 }) // Caché en memoria de 60 segundos
  ],
  controllers: [AtraccionesController],
  providers: [AtraccionesService, PagoService],
})
export class AtraccionesModule {}
