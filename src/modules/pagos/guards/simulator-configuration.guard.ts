import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { esAdministrador } from '../../../core/auth/administradores';
import { SesionSupabaseService, tokenBearer } from '../../../core/auth/sesion-supabase.service';

@Injectable()
export class SimulatorConfigurationGuard implements CanActivate {
  constructor(private readonly sesion: SesionSupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const token = tokenBearer(request.headers.authorization);
    if (!token) throw new UnauthorizedException('En producción se requiere una sesión ADMIN para configurar el simulador.');
    const user = await this.sesion.obtenerUsuario(token);
    if (!user) throw new UnauthorizedException('Token inválido o expirado.');
    if (!esAdministrador(user)) throw new ForbiddenException('Solo un administrador puede configurar el simulador.');
    return true;
  }
}
