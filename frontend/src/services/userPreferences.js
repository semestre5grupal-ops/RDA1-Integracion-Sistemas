/**
 * Gestion de preferencias y consentimiento de usuario.
 */

const CLAVE = 'booking.consentimientoCookies.v1';

const DECISIONES = ['all', 'essential'];

export const CATEGORIAS_COOKIES = [
  {
    id: 'esenciales',
    nombre: 'Cookies esenciales',
    obligatoria: true,
    descripcion:
      'Necesarias para el funcionamiento basico: mantener la sesion, conservar la seguridad mediante tokens y recordar tu decision sobre el consentimiento. No se pueden desactivar.',
  },
  {
    id: 'analiticas',
    nombre: 'Cookies de medicion',
    obligatoria: false,
    descripcion:
      'Permiten medir el uso de forma agregada para mejorar el servicio. Se cargan solo si las aceptas de forma explicita.',
  },
];

export function leerConsentimiento() {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const parsed = JSON.parse(crudo);
    return DECISIONES.includes(parsed?.decision) ? parsed.decision : null;
  } catch {
    return null;
  }
}

export function guardarConsentimiento(decision) {
  if (!DECISIONES.includes(decision)) {
    throw new Error(`Decision no valida: ${decision}`);
  }
  try {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify({ decision, fecha: new Date().toISOString(), version: 1 }),
    );
  } catch {}
}

export function borrarConsentimiento() {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {}
}

export function puedeCargar(categoriaId) {
  if (categoriaId === 'esenciales') return true;
  return leerConsentimiento() === 'all';
}

export function cargarScriptOpcional(src, opciones = {}) {
  const { categoria = 'analiticas', async = true, attrs = {} } = opciones;

  if (!puedeCargar(categoria)) {
    return false;
  }

  const el = document.createElement('script');
  el.src = src;
  if (async) el.async = true;
  for (const [clave, valor] of Object.entries(attrs)) {
    el.setAttribute(clave, valor);
  }
  document.head.appendChild(el);
  return true;
}

export function suscribirConsentimiento(listener) {
  const handler = (evento) => {
    if (evento.key === CLAVE) listener(leerConsentimiento());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
