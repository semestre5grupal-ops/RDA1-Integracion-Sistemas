import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from '../../core/core.module';
import { SecurityModule } from '../../core/security/security.module';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { EventBusModule } from '../event-bus/event-bus.module';
import { WebhookEntrega } from './entities';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRateLimitGuard } from './webhooks-rate-limit.guard';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    CoreModule,
    SecurityModule,
    EventBusModule,
    TypeOrmModule.forFeature([WebhookEntrega]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksRateLimitGuard, SupabaseAuthGuard, RolesGuard],
})
export class WebhooksModule {}
