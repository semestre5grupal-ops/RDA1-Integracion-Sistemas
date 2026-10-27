import { Module, Global } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryRateLimitGuard } from './telemetry-rate-limit.guard';
import { TelemetryBodySizeInterceptor } from './telemetry-body-size.interceptor';
import { SecurityModule } from '../../core/security/security.module';

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryRateLimitGuard, TelemetryBodySizeInterceptor],
  exports: [TelemetryService],
})
export class TelemetryModule {}
