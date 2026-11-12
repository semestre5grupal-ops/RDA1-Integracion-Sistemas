import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InMemoryRateLimitService } from './in-memory-rate-limit.service';

@Injectable()
export class EdgeRateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimitService: InMemoryRateLimitService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Si la ruta es estática o de documentación swagger/redoc, permitir paso libre
    const path = req.originalUrl || req.url || '';
    if (path.startsWith('/api/docs') || path.startsWith('/api/redoc') || path.includes('/favicon.ico')) {
      return next();
    }

    const clientIp = this.extractClientIp(req);
    const windowMs = 60_000; // 1 minuto

    // Las consultas del panel de administración (GET con sesión) se recargan solas
    // cada pocos segundos: tienen su propio cupo, para no gastar el de las
    // búsquedas públicas (en la universidad muchos usuarios comparten la misma IP).
    const esConsultaAdmin = req.method === 'GET' && /^\/api\/v\d+\/admin\//.test(path) && !!req.headers['authorization'];
    const maxRequests = esConsultaAdmin
      ? parseInt(process.env.SECURITY_RATE_LIMIT_ADMIN_PER_MINUTE || '1200', 10)
      : parseInt(process.env.SECURITY_RATE_LIMIT_MAX_PER_MINUTE || '600', 10);
    const clave = esConsultaAdmin ? `edge:admin:${clientIp}` : `edge:ip:${clientIp}`;

    const result = this.rateLimitService.check(clave, maxRequests, windowMs);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds);
      return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        type: 'https://httpstatuses.com/429',
        title: 'Too Many Requests (Rate Limit Exceeded)',
        status: HttpStatus.TOO_MANY_REQUESTS,
        detail: `Límite de peticiones excedido para la dirección IP ${clientIp}. Reintente en ${result.retryAfterSeconds} segundos.`,
        instance: req.originalUrl,
        retry_after_seconds: result.retryAfterSeconds,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  }

  private extractClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }
}

