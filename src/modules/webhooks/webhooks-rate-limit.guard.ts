import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';

@Injectable()
export class WebhooksRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: InMemoryRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      params?: { vertical?: string };
    }>();
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';
    const vertical = request.params?.vertical || 'unknown';
    const configuredLimit = Number(process.env.WEBHOOK_RATE_LIMIT_MAX);
    const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 60;
    const result = this.rateLimit.check(`webhook:${vertical}:${clientIp}`, limit, 60_000);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Límite de recepción de webhooks excedido.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
