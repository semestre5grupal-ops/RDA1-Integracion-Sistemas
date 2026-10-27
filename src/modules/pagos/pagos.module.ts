import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { ReembolsoPago, ReservaPago, TransaccionPago } from './entities';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { SesionSupabaseService } from '../../core/auth/sesion-supabase.service';
import { PaymentReferenceAccessGuard } from './guards/payment-reference-access.guard';
import { SimulatorConfigurationGuard } from './guards/simulator-configuration.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransaccionPago, ReembolsoPago, ReservaPago]),
  ],
  controllers: [PagosController],
  providers: [
    PagosService,
    WinstonPhysicalLoggerService,
    SesionSupabaseService,
    PaymentReferenceAccessGuard,
    SimulatorConfigurationGuard,
  ],
  exports: [PagosService],
})
export class PagosModule {}
