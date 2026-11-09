import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class IpAccessControlMiddleware implements NestMiddleware {
  private blacklist: Set<string> = new Set();
  private whitelist: Set<string> = new Set();

  constructor() {
    this.reloadRules();
  }

  reloadRules() {
    const rawBlacklist = process.env.SECURITY_IP_BLACKLIST || '';
    this.blacklist = new Set(
      rawBlacklist.split(',').map((ip) => ip.trim()).filter(Boolean),
    );

    const rawWhitelist = process.env.SECURITY_IP_WHITELIST || '';
    this.whitelist = new Set(
      rawWhitelist.split(',').map((ip) => ip.trim()).filter(Boolean),
    );
  }

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = this.extractClientIp(req);

    // 1. IP Blacklisting check (Semana 08)
    if (this.blacklist.has(clientIp)) {
      return res.status(HttpStatus.FORBIDDEN).json({
        type: 'https://httpstatuses.com/403',
        title: 'IP Address Blocked (Blacklist)',
        status: HttpStatus.FORBIDDEN,
        detail: `La dirección IP ${clientIp} está bloqueada por políticas de seguridad perimetral.`,
        instance: req.originalUrl,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. IP Whitelisting check (si está configurada)
    if (this.whitelist.size > 0 && !this.whitelist.has(clientIp)) {
      return res.status(HttpStatus.FORBIDDEN).json({
        type: 'https://httpstatuses.com/403',
        title: 'IP Address Not Whitelisted',
        status: HttpStatus.FORBIDDEN,
        detail: `Acceso restringido: La dirección IP ${clientIp} no está en la lista de acceso autorizada.`,
        instance: req.originalUrl,
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

