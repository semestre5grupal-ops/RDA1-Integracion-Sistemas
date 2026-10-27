import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { esAdministrador } from '../../../core/auth/administradores';
import { SesionSupabaseService, tokenBearer } from '../../../core/auth/sesion-supabase.service';

export type PaymentReferenceAccess =
  | { type: 'staff' }
  | { type: 'store'; carritoId: string };

type PaymentRequest = Request & { paymentReferenceAccess?: PaymentReferenceAccess };

function hashKey(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function storeForApiKey(apiKey: string): string | null {
  const actualHash = hashKey(apiKey);
  for (const entry of (process.env.PAGOS_STORE_API_KEYS || '').split(',')) {
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;
    const carritoId = entry.slice(0, separator).trim();
    const configuredKey = entry.slice(separator + 1).trim();
    if (!carritoId || configuredKey.length < 16) continue;
    if (timingSafeEqual(actualHash, hashKey(configuredKey))) return carritoId;
  }
  return null;
}

@Injectable()
export class PaymentReferenceAccessGuard implements CanActivate {
  constructor(private readonly sesion: SesionSupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PaymentRequest>();
    const apiKey = request.headers['x-api-key'];

    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const carritoId = storeForApiKey(apiKey);
      if (!carritoId) throw new UnauthorizedException('API key de tienda no válida.');
      request.paymentReferenceAccess = { type: 'store', carritoId };
      return true;
    }

    const token = tokenBearer(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Se requiere una sesión ADMIN/SERVICE o X-Api-Key de tienda.');
    const usuario = await this.sesion.obtenerUsuario(token);
    if (!usuario) throw new UnauthorizedException('Token inválido o expirado.');

    const role = String(usuario.app_metadata?.role || '').toUpperCase();
    if (!esAdministrador(usuario) && role !== 'SERVICE') {
      throw new ForbiddenException('Solo ADMIN, SERVICE o la tienda propietaria pueden consultar este pago.');
    }

    request.paymentReferenceAccess = { type: 'staff' };
    return true;
  }
}
