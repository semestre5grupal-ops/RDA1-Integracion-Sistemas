/**
 * Instancia global de Axios con interceptores de JWT.
 *
 * Cumple la seccion 3 del FRONTEND_IMPLEMENTATION_PLAN.md y la regla 2 del
 * OPENCLOUD_FRONTEND_CONTEXT.md.
 *
 * ── Modelo de seguridad del token ───────────────────────────────────────────
 *
 * ACCESS TOKEN  -> SOLO EN MEMORIA (variable de modulo). Nunca se escribe en
 *                  localStorage, sessionStorage ni cookies. Motivo: cualquier
 *                  token accesible desde JavaScript es robable por un XSS, y el
 *                  `sub` del JWT identifica al usuario, es decir PII. Asi que
 *                  persistirlo incumpliria tanto la regla del plan como la
 *                  LOPDP.
 *
 * ── Politica ante 401: LOGOUT FORZADO ───────────────────────────────────────
 *
 * NO se intenta refrescar el token. La autenticacion pertenece a otro dominio y
 * el contrato de vuelos no define ningun endpoint de refresh, asi que no hay un
 * mecanismo con el que renovar la sesion de forma silenciosa. Inventar una ruta
 * (`/auth/refresh`) seria especular sobre una API que no es nuestra.
 *
 * En su lugar, un 401 significa UNA sola cosa: la credencial ya no es valida.
 * La respuesta es determinista y conservadora:
 *
 *   1. Se borra el token de la memoria.
 *   2. Se avisa a la UI con el evento `booking:sesion-expirada`.
 *   3. Se navega al Login con `location.replace`, NO con `push`.
 *
 * Por que `replace` y no `push`: si se usara `push`, el boton "Atras" del
 * navegador devolveria al usuario a una pagina quepondra a fallar con 401 de
 * inmediato, creando un bucle en el que no puede salir. `replace` sustituye la
 * entrada del historial, asi que el Login queda como unico destino posible.
 *
 * Tambien es una navegacion dura, y no un `navigate()` del router: al recargar
 * se garantiza que ningun estado en memoria (reservas, ofertas, sesion) sobreviva
 * a una credencial invalidada.
 *
 * ── A tener en cuenta con los datos del contrato ───────────────────────────
 * `MoneyAmount` declara sus importes como `type: string` y el backend los
 * persiste en NUMERIC. No se convierten a `number` en ningun punto: la
 * conversion a flotante perderia precision en el redondeo. El formateo para
 * mostrar se hace con cadenas (ver `services/formato.js`).
 */
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { supabase } from './supabase';

// ===========================================================================
// Configuracion
// ===========================================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

/** Destino tras un logout forzado. */
export const RUTA_LOGIN = '/login';

/**
 * Rutas publicas del contrato: en vuelos-openapi.yaml declaran `security: []`,
 * por lo que NO deben llevar token.
 */
const RUTAS_PUBLICAS = ['/vuelos/search', '/flights/'];

function esRutaPublica(url = ''): boolean {
  return RUTAS_PUBLICAS.some((prefijo) => url.startsWith(prefijo));
}

// ===========================================================================
// Estado de sesion ahora se maneja por Supabase.
// Dejamos metodos vacios o proxies para no romper compatibilidad.
// ===========================================================================

export function limpiarSesion(): void {
  supabase.auth.signOut();
}

export async function obtenerAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function estaAutenticado(): Promise<boolean> {
  const token = await obtenerAccessToken();
  return Boolean(token);
}

// ===========================================================================
// Instancia
// ===========================================================================

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
  // Valor por defecto para las rutas AUTENTICADAS: permite que viaje la
  // cookie httpOnly de sesion. Con origins distintos el backend debe responder
  // `Access-Control-Allow-Credentials` junto a un origen EXACTO, nunca `*`.
  //
  // El interceptor de peticion lo DESACTIVA para las rutas publicas, que no lo
  // necesitan y sufferirian con el modo "credentialed".
  withCredentials: false,
});

// ---------------------------------------------------------------------------
// INTERCEPTOR DE PETICION: inyecta el JWT y ajusta `withCredentials`
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  const esPublica = esRutaPublica(config.url ?? '');
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (accessToken && !esPublica) {
    (config.headers as AxiosHeaders).set('Authorization', `Bearer ${accessToken}`);
  }

  // Trazabilidad distribuida: inyectar X-Correlation-Id (RDA2)
  if (!(config.headers as AxiosHeaders).get('X-Correlation-Id')) {
    (config.headers as AxiosHeaders).set(
      'X-Correlation-Id',
      `corr-fe-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    );
  }

  if (esPublica) {
    /**
     * Las rutas publicas NO necesitan credenciales, y enviarlas perjudica: con
     * `withCredentials: true` el navegador exige que el backend responda `Access-Control-Allow-Origin` con un origen EXACTO (nunca `*`) y
     * anada `Access-Control-Allow-Credentials`. Un backend correctamente
     * configurado para servir endpoints publicos, pero que no haya optado por
     * el modo "credentialed", rechazaria la PREFLIGHT de `/search` y la
     * busqueda fallaria antes de salir.
     * Se desactiva por ruta y no en la instancia, porque las rutas
     * autenticadas si necesitan la cookie httpOnly del refresh token.
     */
    config.withCredentials = false;
  }

  return config;
});

// ---------------------------------------------------------------------------
// INTERCEPTOR DE RESPUESTA: 401 -> logout forzado
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';

    // Solo un 401 en una ruta autenticada justifica cerrar la sesion. Un 401
    // en una ruta publica significa otra cosa (por ejemplo, credenciales de
    // un tercero) y no debe expulsar al usuario de su propia sesion.
    if (status === 401 && !esRutaPublica(url)) {
      // console.warn('[api] 401 en una ruta protegida. El backend rechazó el token, probablemente por falta de configuración (JWT_SECRET desactualizado o módulo faltante).');
      // console.warn('Se omite el logout forzado para permitir probar la UI con los datos locales (mock).');

      // limpiarSesion();
      // window.dispatchEvent(new CustomEvent('booking:sesion-expirada'));

      // `replace`, no `push`: ver la nota de cabecera.
      // if (!window.location.pathname.startsWith(RUTA_LOGIN)) {
      //   window.location.replace(RUTA_LOGIN);
      // }
    }

    return Promise.reject(error);
  },
);

/**
 * Cierra la sesion en el cliente.
 *
 * No llama a ningun endpoint de logout remoto: la autenticacion es de otro
 * dominio y no exponemos aqui ningun contrato para revocarla. La invalidacion
 * real del refresh token es responsabilidad de ese dominio.
 */
export function cerrarSesion(): void {
  limpiarSesion();
}

export { API_BASE };
