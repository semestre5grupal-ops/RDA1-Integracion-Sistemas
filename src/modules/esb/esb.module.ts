import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsbController } from './esb.controller';
import { SagaOrchestratorService } from './interna/saga-orchestrator.service';
import { EsbInternalRouterService } from './interna/esb-internal-router.service';
import { SagaTransaccion, SagaPasoJournal } from './entities';
import { PagosModule } from '../pagos/pagos.module';
import { FinanzasModule } from '../finanzas/finanzas.module';
import { AtraccionesModule } from '../atracciones/atracciones.module';
import { AutosModule } from '../autos/autos.module';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { SecurityModule } from '../../core/security/security.module';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([SagaTransaccion, SagaPasoJournal]),
    PagosModule,
    FinanzasModule,
    AtraccionesModule,
    AutosModule,
    SecurityModule,
  ],
  controllers: [EsbController],
  providers: [
    SagaOrchestratorService,
    EsbInternalRouterService,
    WinstonPhysicalLoggerService,
    SupabaseAuthGuard,
    RolesGuard,
  ],
  exports: [
    SagaOrchestratorService,
    EsbInternalRouterService,
  ],
})
export class EsbModule {}
