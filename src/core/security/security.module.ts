import { Global, Module } from '@nestjs/common';
import { InMemoryRateLimitService } from './in-memory-rate-limit.service';

@Global()
@Module({
  providers: [InMemoryRateLimitService],
  exports: [InMemoryRateLimitService],
})
export class SecurityModule {}
