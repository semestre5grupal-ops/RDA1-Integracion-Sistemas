import { Global, Module } from '@nestjs/common';
import { InMemoryRateLimitService } from './in-memory-rate-limit.service';
import { IpAccessControlMiddleware } from './ip-access-control.middleware';
import { EdgeRateLimitMiddleware } from './edge-rate-limit.middleware';

@Global()
@Module({
  providers: [InMemoryRateLimitService, IpAccessControlMiddleware, EdgeRateLimitMiddleware],
  exports: [InMemoryRateLimitService, IpAccessControlMiddleware, EdgeRateLimitMiddleware],
})
export class SecurityModule {}
