import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UsuarioSupabase } from './administradores';
import { getCachedSupabaseUser, setCachedSupabaseUser } from './supabase-token-cache';

/**
 * Valida un JWT de Supabase contra el servidor de Supabase y devuelve el usuario.
 *
 * Es un servicio inyectable (y no código dentro de un guard) para que las pruebas
 * puedan sustituirlo por uno falso sin depender de la red.
 */
@Injectable()
export class SesionSupabaseService {
  private readonly logger = new Logger(SesionSupabaseService.name);
  private cliente: SupabaseClient | null = null;

  private obtenerCliente(): SupabaseClient {
    if (!this.cliente) {
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const key =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_KEY ||
        process.env.SUPABASE_SECRET_KEY;
      if (!url || !key) this.logger.warn('Faltan SUPABASE_URL / clave de Supabase: ninguna sesión será válida.');
      this.cliente = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
    }
    return this.cliente;
  }

  /** Usuario dueño del token, o `null` si el token no es válido o caducó. */
  async obtenerUsuario(token: string): Promise<UsuarioSupabase | null> {
    const cached = getCachedSupabaseUser<UsuarioSupabase>(token);
    if (cached) return cached;

    try {
      const { data, error } = await this.obtenerCliente().auth.getUser(token);
      if (error || !data?.user) return null;
      const user = data.user as UsuarioSupabase;
      setCachedSupabaseUser(token, user);
      return user;
    } catch (e: any) {
      this.logger.warn(`No se pudo validar la sesión: ${e?.message}`);
      return null;
    }
  }
}

/** Extrae el token de una cabecera `Authorization: Bearer <token>`. */
export function tokenBearer(cabecera: unknown): string | null {
  if (typeof cabecera !== 'string') return null;
  const [tipo, token] = cabecera.split(' ');
  return tipo === 'Bearer' && token ? token : null;
}
