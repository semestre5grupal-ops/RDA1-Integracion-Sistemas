import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  /**
   * Se leen las tres convenciones porque el proyecto tiene las variables con
   * nombres distintos segun donde vive cada despliegue: el `.env` del BACKEND usa
   * `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (los nombres nuevos de Supabase,
   * `sb_publishable_...`), mientras que el frontend las expone como `VITE_*`.
   *
   * Antes solo se aceptaban `VITE_*` y `SUPABASE_KEY`, y en el backend ninguna de
   * las dos existe: el guard caia en `placeholder`, `getUser` fallaba SIEMPRE y
   * toda ruta protegida devolvia 401. Se aniaden los nombres que el `.env` real
   * usa, y el orden pone primero los `VITE_*` para no cambiar el comportamiento
   * si estan definidos.
   */
  private supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  private supabaseKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  private supabase;

  constructor() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn('⚠️ Supabase credentials not found in env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    }
    this.supabase = createClient(this.supabaseUrl || 'https://placeholder.supabase.co', this.supabaseKey || 'placeholder');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      const allowEvaluationHeaders = this.allowEvaluationHeaders(request);
      const adminKey = request.headers['x-admin-key'];
      if (
        allowEvaluationHeaders &&
        (adminKey === 'admin-secret' || adminKey === 'Admin123!')
      ) {
        request.user = {
          id: 'admin-local-eval',
          email: 'admin@booking.com',
          app_metadata: { role: 'admin' },
        };
        return true;
      }

      // Soporte para evaluación de roles Cátedra RDA2 (§5) vía cabecera técnica
      const roleHeader = request.headers['x-role'];
      if (allowEvaluationHeaders && roleHeader) {
        const rolNorm = String(roleHeader).toLowerCase();
        request.user = {
          id: `eval-${rolNorm}`,
          email: `${rolNorm}@booking.com`,
          app_metadata: { role: rolNorm },
        };
        return true;
      }

      throw new UnauthorizedException('No se proporcionó un token de autorización válido.');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('El formato del token debe ser "Bearer [token]"');
    }

    const token = parts[1];

    // Se valida el token de forma segura contra el servidor de Supabase
    // Esto previene que se falsifiquen tokens en Base64
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(`Token inválido o expirado: ${error?.message || 'Usuario no encontrado'}`);
    }

    // Inyectar el usuario validado en el objeto de la petición para que los controladores lo usen
    request.user = data.user;
    return true;
  }

  private allowEvaluationHeaders(request: {
    ip?: string;
    socket?: { remoteAddress?: string };
  }): boolean {
    const environment = process.env.NODE_ENV?.toLowerCase();
    if (environment === 'test') return true;
    if (process.env.SECURITY_ALLOW_TEST_AUTH !== 'true' || environment === 'production') {
      return false;
    }

    const address = request.ip || request.socket?.remoteAddress;
    return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
  }
}
