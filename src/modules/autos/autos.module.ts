import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutosService } from './autos.service';
import { AutosController } from './autos.controller';
import { Auto } from './entities/auto.entity';
import { OrderAuto } from './entities/order-auto.entity';
import { CommonModule } from '../../common/common.module';
import { PagoService } from '../atracciones/pago.service'; // We reuse PagoService or create a generic one

@Module({
  imports: [
    CommonModule,
    HttpModule,
    TypeOrmModule.forFeature([Auto, OrderAuto]),
    CacheModule.register({ ttl: 60 * 1000 })
  ],
  controllers: [AutosController],
  providers: [AutosService, PagoService],
})
export class AutosModule {}
