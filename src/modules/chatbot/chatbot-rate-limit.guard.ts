import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';

@Injectable()
export class ChatbotRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: InMemoryRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      body?: { sessionId?: unknown };
    }>();
    const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId : '';
    const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';
    const configuredLimit = Number(process.env.CHATBOT_RATE_LIMIT_MAX);
    const limit =
      Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20;
    const keys = [`chatbot:ip:${clientIp}`];
    if (sessionId) keys.push(`chatbot:session:${sessionId}`);

    for (const key of keys) {
      const result = this.rateLimit.check(key, limit, 60_000);
      if (!result.allowed) {
        context.switchToHttp().getResponse().setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          'Límite de mensajes del chatbot excedido; reintente más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
