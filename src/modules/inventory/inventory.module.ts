import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryGrpcController } from './inventory-grpc.controller';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { SecurityModule } from '../../core/security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [InventoryGrpcController],
  providers: [InventoryService, WinstonPhysicalLoggerService, SupabaseAuthGuard, RolesGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
