import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { esAdministrador } from './administradores';

/**
 * Comprueba contra Supabase (no solo decodificando el JWT) que el token del
 * `Authorization: Bearer ...` pertenece a un administrador.
 *
 * Lo usan rutas que no pasan por los guards de Nest (p. ej. el middleware de
 * vuelos con aerolíneas socias) para que el panel de administración pueda ver
 * y cancelar reservas de otros usuarios. El resultado se guarda 60 s por token
 * para no consultar Supabase en cada petición.
 */
let cliente: SupabaseClient | null = null;
const cache = new Map<string, { admin: boolean; hasta: number }>();
const TTL_MS = 60_000;

function supabase(): SupabaseClient | null {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

export async function esAdminPorToken(authHeader?: string | string[]): Promise<boolean> {
  const valor = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!valor || !valor.startsWith('Bearer ')) return false;
  const token = valor.slice(7).trim();
  if (!token) return false;

  const ahora = Date.now();
  const guardado = cache.get(token);
  if (guardado && guardado.hasta > ahora) return guardado.admin;

  const sb = supabase();
  if (!sb) return false;
  let admin = false;
  try {
    const { data, error } = await sb.auth.getUser(token);
    admin = !error && esAdministrador(data?.user);
  } catch {
    admin = false;
  }
  if (cache.size > 500) cache.clear();
  cache.set(token, { admin, hasta: ahora + TTL_MS });
  return admin;
}
