/**
 * Objetivos de servicio (SLO) de vuelos y cálculo del presupuesto de error.
 *
 * SLI  = lo que se mide (p. ej. búsquedas que responden).
 * SLO  = la meta interna sobre ese SLI (p. ej. 99,5 % en 7 días).
 * Presupuesto de error = lo que se permite fallar sin incumplir la meta.
 * Burn rate = qué tan rápido se gasta ese presupuesto (1x = ritmo normal,
 * 14,4x = se agotaría en ~2 días de una ventana de 30; aquí la ventana es de 7).
 *
 * Funciones puras: sin base de datos, fáciles de probar.
 */

export interface DefinicionSlo {
  id: 'busqueda_disponible' | 'busqueda_rapida' | 'compra_exitosa' | 'reembolso_total';
  nombre: string;
  descripcion: string;
  /** Meta entre 0 y 1 (0,995 = 99,5 %). */
  objetivo: number;
  /** Texto corto de la meta para mostrar. */
  meta: string;
}

export const VENTANA_SLO_DIAS = 7;
/** Una búsqueda es "lenta" si tarda más de esto. */
export const UMBRAL_BUSQUEDA_MS = 3000;

export const SLOS_VUELOS: DefinicionSlo[] = [
  {
    id: 'busqueda_disponible',
    nombre: 'Búsquedas que responden',
    descripcion: 'Búsquedas en las que al menos una aerolínea respondió.',
    objetivo: 0.995,
    meta: '99,5 % en 7 días',
  },
  {
    id: 'busqueda_rapida',
    nombre: 'Búsquedas rápidas',
    descripcion: `Búsquedas que terminan en menos de ${UMBRAL_BUSQUEDA_MS / 1000} s.`,
    objetivo: 0.95,
    meta: `95 % bajo ${UMBRAL_BUSQUEDA_MS / 1000} s en 7 días`,
  },
  {
    id: 'compra_exitosa',
    nombre: 'Compras cobradas que se emiten',
    descripcion: 'Compras con cobro aprobado en las que la aerolínea sí emitió la reserva.',
    objetivo: 0.95,
    meta: '95 % en 7 días',
  },
  {
    id: 'reembolso_total',
    nombre: 'Fallos después del cobro que se reembolsan',
    descripcion: 'Si la aerolínea falla después de cobrar, el dinero siempre vuelve al cliente.',
    objetivo: 1,
    meta: '100 % (no se tolera ninguno)',
  },
];

/** Cuántos eventos hacen falta para opinar; con menos se dice "sin datos suficientes". */
export const MINIMO_EVENTOS = 5;

export interface Ventana {
  total: number;
  malos: number;
}
export interface VentanasSli {
  h1: Ventana;
  h6: Ventana;
  h24: Ventana;
  d7: Ventana;
}

export type EstadoSlo = 'ok' | 'atencion' | 'critico' | 'sin_datos';

export interface ResultadoSlo {
  id: DefinicionSlo['id'];
  nombre: string;
  descripcion: string;
  meta: string;
  objetivo: number;
  total: number;
  malos: number;
  /** 0–1 o null si no hay eventos. */
  cumplimiento: number | null;
  /** Cuántos fallos se permiten en la ventana de 7 días (con el volumen actual). */
  fallosPermitidos: number;
  /** % del presupuesto ya gastado (puede pasar de 100). */
  presupuestoConsumidoPct: number | null;
  burnRate: { h1: number | null; h6: number | null; h24: number | null };
  estado: EstadoSlo;
  mensaje: string;
}

/** Burn rate = (tasa de fallos observada) / (tasa de fallos permitida). */
export function burnRate(v: Ventana, objetivo: number): number | null {
  if (v.total <= 0) return null;
  const permitida = 1 - objetivo;
  const observada = v.malos / v.total;
  if (permitida <= 0) return v.malos > 0 ? Infinity : 0;
  return observada / permitida;
}

const redondear = (n: number | null, d = 2) => (n === null ? null : Number.isFinite(n) ? Number(n.toFixed(d)) : n);

export function evaluarSlo(def: DefinicionSlo, v: VentanasSli): ResultadoSlo {
  const { total, malos } = v.d7;
  const permitida = 1 - def.objetivo;
  const fallosPermitidos = Math.floor(total * permitida + 1e-9);
  const cumplimiento = total > 0 ? (total - malos) / total : null;
  const consumo =
    total <= 0 ? null : permitida <= 0 ? (malos > 0 ? Infinity : 0) : (malos / (total * permitida)) * 100;
  const b = { h1: burnRate(v.h1, def.objetivo), h6: burnRate(v.h6, def.objetivo), h24: burnRate(v.h24, def.objetivo) };

  let estado: EstadoSlo = 'ok';
  let mensaje = 'Dentro de la meta.';
  if (def.objetivo >= 1) {
    // Meta de "cero fallos" (dinero cobrado que no se devolvió): un solo caso ya es
    // crítico, aunque haya pocos datos. Por eso va antes de la regla de volumen mínimo.
    if (malos > 0) {
      estado = 'critico';
      mensaje = `${malos} fallo(s) sin resolver: hay que revisar de inmediato.`;
    } else if (total === 0) {
      estado = 'sin_datos';
      mensaje = 'Todavía no ha habido fallos de la aerolínea que reembolsar.';
    }
  } else if (total < MINIMO_EVENTOS) {
    estado = 'sin_datos';
    mensaje = 'Todavía hay muy pocos datos para opinar.';
  } else {
    const rapido = (b.h1 ?? 0) >= 14.4 && (b.h6 ?? 0) >= 6;
    const sostenido = (b.h6 ?? 0) >= 6 || (consumo ?? 0) >= 100;
    if (rapido) {
      estado = 'critico';
      mensaje = 'El presupuesto de error se está gastando muy rápido (más de 14 veces el ritmo normal).';
    } else if (sostenido) {
      estado = 'atencion';
      mensaje =
        (consumo ?? 0) >= 100
          ? 'El presupuesto de error de la semana se agotó: conviene frenar cambios no críticos.'
          : 'El presupuesto de error se gasta más rápido de lo normal (6 veces o más).';
    }
  }

  return {
    id: def.id,
    nombre: def.nombre,
    descripcion: def.descripcion,
    meta: def.meta,
    objetivo: def.objetivo,
    total,
    malos,
    cumplimiento: redondear(cumplimiento, 4),
    fallosPermitidos,
    presupuestoConsumidoPct: redondear(consumo, 1),
    burnRate: { h1: redondear(b.h1), h6: redondear(b.h6), h24: redondear(b.h24) },
    estado,
    mensaje,
  };
}
