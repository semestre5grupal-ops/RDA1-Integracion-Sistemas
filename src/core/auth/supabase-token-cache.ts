import { createHash } from 'crypto';

interface CachedEntry<T> {
  user: T;
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, CachedEntry<unknown>>();

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function jwtExpirationMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Obtiene un usuario previamente validado contra Supabase si el JWT sigue vigente
 * y dentro del TTL en memoria (60 s), evitando repetir llamadas HTTP idénticas
 * por cada petición de polling y protegiendo la cuota de egress de Supabase.
 */
export function getCachedSupabaseUser<T>(token: string): T | null {
  if (!token) return null;
  const key = tokenKey(token);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAtMs) {
    cache.delete(key);
    return null;
  }
  return entry.user as T;
}

/**
 * Almacena en memoria el resultado exitoso de `supabase.auth.getUser(token)`
 * respetando la expiración real del JWT (`exp`) y un tope máximo de 60 segundos.
 */
export function setCachedSupabaseUser<T>(token: string, user: T, ttlMs = DEFAULT_TTL_MS): void {
  if (!token || !user) return;
  const now = Date.now();
  const jwtExp = jwtExpirationMs(token);
  if (jwtExp !== null && jwtExp <= now) return;

  const expiresAtMs = jwtExp !== null ? Math.min(now + ttlMs, jwtExp) : now + ttlMs;
  if (expiresAtMs <= now) return;

  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(tokenKey(token), { user, expiresAtMs });
}

export function clearSupabaseTokenCache(): void {
  cache.clear();
}
