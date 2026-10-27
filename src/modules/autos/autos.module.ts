import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutosService } from './autos.service';
import { AutosController } from './autos.controller';
import { Auto } from './entities/auto.entity';
import { OrderAuto } from './entities/order-auto.entity';
import { MantenimientoAuto } from './entities/mantenimiento-auto.entity';
import { CommonModule } from '../../common/common.module';
import { PagoService } from '../atracciones/pago.service';
import { AutosCircuitBreakerAdapter } from './acl/autos-circuit-breaker.adapter';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [
    CommonModule,
    CoreModule,
    HttpModule,
    TypeOrmModule.forFeature([Auto, OrderAuto, MantenimientoAuto]),
    CacheModule.register({ ttl: 60 * 1000 })
  ],
  controllers: [AutosController],
  providers: [
    AutosService,
    PagoService,
    AutosCircuitBreakerAdapter,
    WinstonPhysicalLoggerService,
    SupabaseAuthGuard,
    RolesGuard,
  ],
  exports: [AutosService]
})
export class AutosModule {}
