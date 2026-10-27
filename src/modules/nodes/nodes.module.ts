import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { ConfigProveedor } from './entities';
import { Atraccion } from '../atracciones/entities/atraccion.entity';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [
    CoreModule,
    TypeOrmModule.forFeature([ConfigProveedor, Atraccion]),
  ],
  controllers: [NodesController],
  providers: [NodesService, WinstonPhysicalLoggerService, SupabaseAuthGuard, RolesGuard],
  exports: [NodesService],
})
export class NodesModule {}
