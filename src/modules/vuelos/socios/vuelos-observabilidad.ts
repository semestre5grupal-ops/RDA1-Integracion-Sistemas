/**
 * Observabilidad de vuelos (semana 10): trace_id por petición, spans manuales
 * de OpenTelemetry y traceparent hacia las aerolíneas.
 *
 * Todo es OPCIONAL y nunca rompe una compra:
 *  - Sin OTEL_ENABLED=true los spans no hacen nada (la API de OpenTelemetry es
 *    un no-op sin SDK), así que producción queda igual que antes.
 *  - El traceparent saliente va apagado salvo VUELOS_TRACEPARENT_SALIDA=true.
 *    Es un header estándar adicional: no cambia el contrato; una aerolínea que
 *    no lo use simplemente lo ignora.
 */
import { randomBytes } from 'node:crypto';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const CEROS_TRAZA = /^0{32}$/;
const CEROS_SPAN = /^0{16}$/;

let api: any;
function otel(): any {
  if (api === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      api = require('@opentelemetry/api');
    } catch {
      api = null;
    }
  }
  return api;
}

export const otelActivo = () => process.env.OTEL_ENABLED === 'true' && !!otel();

/** traceparent válido (W3C) o null. */
export function leerTraceparent(valor: unknown): { traceId: string; spanId: string; flags: string } | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const m = typeof v === 'string' ? TRACEPARENT.exec(v.trim()) : null;
  if (!m || CEROS_TRAZA.test(m[1]) || CEROS_SPAN.test(m[2])) return null;
  return { traceId: m[1].toLowerCase(), spanId: m[2].toLowerCase(), flags: m[3].toLowerCase() };
}

/** trace_id del span activo de OpenTelemetry (si el SDK está encendido). */
function traceIdActivo(): { traceId: string; spanId: string } | null {
  if (!otelActivo()) return null;
  const ctx = otel().trace.getActiveSpan?.()?.spanContext?.();
  if (!ctx || CEROS_TRAZA.test(ctx.traceId)) return null;
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/**
 * Garantiza que la petición de vuelos lleve un traceparent válido.
 * Las rutas de vuelos las atiende un middleware que corre ANTES del middleware
 * global de trazas, así que sin esto sus logs salían con trace_id vacío.
 */
export function asegurarTraceparent(headers: Record<string, any>, setHeaderRespuesta?: (k: string, v: string) => void): string {
  const activo = traceIdActivo();
  const entrante = leerTraceparent(headers['traceparent']);
  const traceId = activo?.traceId ?? entrante?.traceId ?? randomBytes(16).toString('hex');
  const spanId = activo?.spanId ?? randomBytes(8).toString('hex');
  const valor = `00-${traceId}-${spanId}-${entrante?.flags ?? '01'}`;
  headers['traceparent'] = valor;
  try {
    setHeaderRespuesta?.('traceparent', valor);
  } catch {
    /* cabeceras ya enviadas: no importa */
  }
  return traceId;
}

/** trace_id de la petición (para guardarlo junto a cada paso de la traza). */
export function traceIdDe(headers: Record<string, any>): string | null {
  return traceIdActivo()?.traceId ?? leerTraceparent(headers['traceparent'])?.traceId ?? null;
}

/** Header traceparent que se manda a la aerolínea, o null si está apagado. */
export function traceparentSaliente(headers: Record<string, any>): string | null {
  if (process.env.VUELOS_TRACEPARENT_SALIDA !== 'true') return null;
  const id = traceIdDe(headers);
  if (!id) return null;
  const spanId = traceIdActivo()?.spanId ?? randomBytes(8).toString('hex');
  return `00-${id}-${spanId}-01`;
}

/**
 * Ejecuta `fn` dentro de un span manual (unidad de trabajo con sentido de
 * negocio: búsqueda, hold, cobro, reserva en la aerolínea, reembolso).
 * Sin OTEL_ENABLED=true solo ejecuta `fn`.
 */
export async function spanVuelos<T>(nombre: string, atributos: Record<string, string | number | boolean | undefined>, fn: () => Promise<T>): Promise<T> {
  if (!otelActivo()) return fn();
  const o = otel();
  const limpios: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(atributos)) if (v !== undefined) limpios[k] = v;
  return o.trace.getTracer('booking-vuelos').startActiveSpan(nombre, { attributes: limpios }, async (span: any) => {
    try {
      const r = await fn();
      span.setStatus({ code: o.SpanStatusCode.OK });
      return r;
    } catch (e: any) {
      span.recordException(e);
      span.setStatus({ code: o.SpanStatusCode.ERROR, message: e?.message });
      throw e;
    } finally {
      span.end();
    }
  });
}
