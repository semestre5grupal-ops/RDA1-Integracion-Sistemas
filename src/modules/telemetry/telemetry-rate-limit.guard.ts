import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';

@Injectable()
export class TelemetryRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: InMemoryRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      body?: { session_id?: unknown };
      headers?: Record<string, unknown>;
      res?: { setHeader(name: string, value: string): void };
    }>();
    const sessionId =
      typeof request.body?.session_id === 'string' ? request.body.session_id : '';
    const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';
    const limit = positiveInteger(process.env.TELEMETRY_RATE_LIMIT_MAX, 60);
    const keys = [`telemetry:ip:${clientIp}`];
    if (sessionId) keys.push(`telemetry:session:${sessionId}`);

    for (const key of keys) {
      const result = this.rateLimit.check(key, limit, 60_000);
      if (!result.allowed) {
        context.switchToHttp().getResponse().setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          'Límite de telemetría excedido; reintente más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
