/**
 * Ping de integración de las aerolíneas socias.
 *
 * No basta con que el servidor de la aerolínea conteste: se comprueba que la
 * integración funciona de punta a punta.
 *   1. Token OAuth (o API key) aceptado por la aerolínea.
 *   2. Llamada del contrato v2 con ese token: GET /eventos?limit=1&after=<último>.
 *      Pedir desde el último evento hace que la aerolínea devuelva casi nada.
 *   3. Respuesta JSON con la forma del contrato (`events` o `items`).
 *
 * Estados:
 *   INTEGRADO        token + contrato + respuesta válida
 *   SIN_INTEGRACION  el servidor responde, pero falla el token o el contrato
 *   CAIDO            no responde (2 intentos seguidos)
 */
export type EstadoIntegracion = 'INTEGRADO' | 'SIN_INTEGRACION' | 'CAIDO';

export interface SaludIntegracion {
  estado: EstadoIntegracion;
  /** Mediana de las últimas mediciones correctas (ms de la llamada autenticada). */
  ms: number;
  /** Desglose de la última comprobación. */
  pasos: { tokenMs: number; llamadaMs: number; http: number | null };
  detalle: string;
  en: string;
  fallosSeguidos: number;
}

/** Resultado crudo de una comprobación, antes de suavizarlo con el historial. */
export interface Comprobacion {
  estado: EstadoIntegracion;
  llamadaMs: number;
  tokenMs: number;
  http: number | null;
  detalle: string;
}

/** ¿El cuerpo es una respuesta del feed de eventos del contrato? */
export function esFeedDelContrato(cuerpo: unknown): boolean {
  if (!cuerpo || typeof cuerpo !== 'object') return false;
  const c = cuerpo as Record<string, unknown>;
  return Array.isArray(c.events) || Array.isArray(c.items);
}

/** ¿Contestó como API (JSON) aunque sea con error de validación? */
export function respondeComoApi(status: number, cuerpo: unknown): boolean {
  return (status >= 200 && status < 300) || ([400, 422].includes(status) && !!cuerpo && typeof cuerpo === 'object');
}

export function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.floor((v.length - 1) / 2)];
}

/**
 * Combina una comprobación nueva con la anterior:
 *  - la latencia es la mediana de las últimas 3 correctas (evita picos aislados);
 *  - un solo fallo de red no marca "Caído": hacen falta 2 seguidos.
 */
export function acumular(
  anterior: (SaludIntegracion & { muestras?: number[] }) | undefined,
  c: Comprobacion,
  ahora = new Date(),
): SaludIntegracion & { muestras: number[] } {
  const muestras = [...(anterior?.muestras ?? [])];
  if (c.estado === 'INTEGRADO') {
    muestras.push(c.llamadaMs);
    while (muestras.length > 3) muestras.shift();
  }
  const fallosSeguidos = c.estado === 'INTEGRADO' ? 0 : (anterior?.fallosSeguidos ?? 0) + 1;
  let estado = c.estado;
  if (c.estado === 'CAIDO' && fallosSeguidos < 2 && anterior) estado = anterior.estado;
  return {
    estado,
    ms: c.estado === 'INTEGRADO' ? mediana(muestras) : c.llamadaMs,
    pasos: { tokenMs: c.tokenMs, llamadaMs: c.llamadaMs, http: c.http },
    detalle: c.estado === 'CAIDO' && estado !== 'CAIDO' ? `${c.detalle} (1 fallo, se confirma en el próximo intento)` : c.detalle,
    en: ahora.toISOString(),
    fallosSeguidos,
    muestras,
  };
}

/** Valor de `health_status` que se guarda en la tabla de proveedores. */
export function healthStatusDe(estado: EstadoIntegracion): 'HEALTHY' | 'DEGRADED' | 'DOWN' {
  return estado === 'INTEGRADO' ? 'HEALTHY' : estado === 'SIN_INTEGRACION' ? 'DEGRADED' : 'DOWN';
}
