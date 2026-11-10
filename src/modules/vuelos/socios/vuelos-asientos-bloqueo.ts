import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Bloqueo de asientos en tiempo real dentro de Booking.
 *
 * El contrato v2 bloquea el CUPO en el hold, pero el asiento concreto se asigna
 * recién al reservar (las aerolíneas no aceptan `assignedSeats` en el hold o lo
 * ignoran). Para que dos clientes de Booking no elijan el mismo asiento, Booking
 * guarda aquí qué asiento tiene elegido cada compra en curso:
 *
 *  - al elegir un asiento se bloquea para esa compra (su `holdId`);
 *  - los demás clientes lo ven ocupado en el mapa a los pocos segundos;
 *  - se libera al cambiar de asiento, salir del formulario, vencer el hold
 *    (15 min por defecto) o comprar (desde ahí lo marca ocupado la aerolínea).
 *
 * Es una capa propia de Booking: a la aerolínea no se le pide nada nuevo. Si
 * alguien compra el mismo asiento en la web de la aerolínea, ella lo rechaza al
 * reservar (409) y Booking devuelve el cobro, como hasta ahora.
 *
 * Se guarda en Postgres (lo ven todas las instancias); si la base no responde
 * se usa memoria, y ante cualquier error NO se bloquea la compra.
 */

export const SQL_BLOQUEO_ASIENTOS = `
CREATE TABLE IF NOT EXISTS public.vuelos_asientos_bloqueo (
  codigo_nodo  varchar(50)  NOT NULL,
  segmento_id  varchar(120) NOT NULL,
  asiento      varchar(8)   NOT NULL,
  hold_id      varchar(200) NOT NULL,
  expira_at    timestamptz  NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_nodo, segmento_id, asiento)
);
CREATE INDEX IF NOT EXISTS ix_vuelos_asientos_bloqueo_hold ON public.vuelos_asientos_bloqueo (hold_id);
-- Cómo se creó cada hold en la aerolínea (para rehacerlo con los asientos
-- elegidos: contrato v2, HoldRequest.assignedSeats) y qué asientos tiene allá.
CREATE TABLE IF NOT EXISTS public.vuelos_holds_booking (
  hold_id     varchar(200) PRIMARY KEY,
  codigo_nodo varchar(50)  NOT NULL,
  cuerpo      jsonb        NOT NULL,
  asientos    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
`;

export interface HoldGuardado {
  nodo: string;
  cuerpo: any;
  /** Asientos que la aerolínea ya tiene apartados en este hold. */
  asientos: AsientoRef[];
}

export interface AsientoRef {
  segmentId: string;
  seatNumber: string;
}

const MAX_ASIENTOS = 24;

export function minutosBloqueo(): number {
  const m = Number(process.env.VUELOS_BLOQUEO_ASIENTO_MIN);
  return Number.isFinite(m) && m >= 1 && m <= 60 ? m : 15;
}

/** Deja solo asientos válidos, sin repetidos, con el número en mayúsculas. */
export function limpiarAsientos(lista: unknown): AsientoRef[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: AsientoRef[] = [];
  for (const a of lista) {
    const segmentId = String(a?.segmentId ?? '').trim();
    const seatNumber = String(a?.seatNumber ?? '').trim().toUpperCase();
    if (!segmentId || segmentId.length > 120 || !/^[0-9A-Z]{2,6}$/.test(seatNumber)) continue;
    const k = `${segmentId}|${seatNumber}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ segmentId, seatNumber });
    if (out.length >= MAX_ASIENTOS) break;
  }
  return out;
}

@Injectable()
export class VuelosAsientosBloqueo {
  private readonly logger = new Logger(VuelosAsientosBloqueo.name);
  private tablaLista = false;
  /** Respaldo en memoria: clave `nodo|segmento|asiento`. */
  private readonly memoria = new Map<string, { holdId: string; expira: number }>();
  private readonly holds = new Map<string, HoldGuardado & { t: number }>();

  constructor(@Optional() private readonly dataSource?: DataSource) {}

  private async base(): Promise<DataSource | null> {
    const ds = this.dataSource;
    if (!ds?.isInitialized) return null;
    if (this.tablaLista) return ds;
    try {
      await ds.query(SQL_BLOQUEO_ASIENTOS);
      this.tablaLista = true;
      return ds;
    } catch (e: any) {
      this.logger.error(`[asientos] No se pudo crear vuelos_asientos_bloqueo: ${e?.message}`);
      return null;
    }
  }

  /**
   * Deja bloqueados para `holdId` exactamente los asientos de `asientos`
   * (suelta los que ya no elige). Devuelve los que consiguió y los que ya tiene
   * otra compra.
   */
  async fijar(nodo: string, holdId: string, asientos: AsientoRef[], expira: Date): Promise<{ locked: AsientoRef[]; taken: AsientoRef[] }> {
    const locked: AsientoRef[] = [];
    const taken: AsientoRef[] = [];
    const ds = await this.base();
    if (!ds) return this.fijarEnMemoria(nodo, holdId, asientos, expira);
    try {
      await ds.query(`DELETE FROM public.vuelos_asientos_bloqueo WHERE expira_at < now()`);
      const propios: Array<{ segmento_id: string; asiento: string }> = await ds.query(
        `SELECT segmento_id, asiento FROM public.vuelos_asientos_bloqueo WHERE codigo_nodo = $1 AND hold_id = $2`,
        [nodo, holdId],
      );
      const quiere = new Set(asientos.map((a) => `${a.segmentId}|${a.seatNumber}`));
      for (const p of propios) {
        if (!quiere.has(`${p.segmento_id}|${p.asiento}`)) {
          await ds.query(
            `DELETE FROM public.vuelos_asientos_bloqueo WHERE codigo_nodo = $1 AND segmento_id = $2 AND asiento = $3 AND hold_id = $4`,
            [nodo, p.segmento_id, p.asiento, holdId],
          );
        }
      }
      for (const a of asientos) {
        // Una sola sentencia: entra si está libre, vencido o ya es de esta compra.
        const filas = await ds.query(
          `INSERT INTO public.vuelos_asientos_bloqueo (codigo_nodo, segmento_id, asiento, hold_id, expira_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (codigo_nodo, segmento_id, asiento) DO UPDATE
             SET hold_id = EXCLUDED.hold_id, expira_at = EXCLUDED.expira_at
             WHERE public.vuelos_asientos_bloqueo.hold_id = EXCLUDED.hold_id
                OR public.vuelos_asientos_bloqueo.expira_at < now()
           RETURNING asiento`,
          [nodo, a.segmentId, a.seatNumber, holdId, expira],
        );
        (filas.length ? locked : taken).push(a);
      }
      return { locked, taken };
    } catch (e: any) {
      this.logger.warn(`[asientos] fijar falló (${e?.message}): no se bloquea, la compra sigue`);
      return { locked: asientos, taken: [] };
    }
  }

  /** Asientos bloqueados por OTRAS compras (para pintar el mapa y antes de cobrar). */
  async deOtros(nodo: string, holdId: string | null, segmentId?: string | null): Promise<AsientoRef[]> {
    const ds = await this.base();
    if (!ds) {
      const ahora = Date.now();
      const out: AsientoRef[] = [];
      for (const [k, v] of this.memoria) {
        const [n, seg, asiento] = k.split('|');
        if (v.expira < ahora) { this.memoria.delete(k); continue; }
        if (n === nodo && v.holdId !== holdId && (!segmentId || seg === segmentId)) out.push({ segmentId: seg, seatNumber: asiento });
      }
      return out;
    }
    try {
      const filas: Array<{ segmento_id: string; asiento: string }> = await ds.query(
        `SELECT segmento_id, asiento FROM public.vuelos_asientos_bloqueo
          WHERE codigo_nodo = $1 AND expira_at >= now() AND hold_id <> $2
            AND ($3::text IS NULL OR segmento_id = $3)`,
        [nodo, holdId ?? '', segmentId || null],
      );
      return filas.map((f) => ({ segmentId: f.segmento_id, seatNumber: f.asiento }));
    } catch (e: any) {
      this.logger.warn(`[asientos] consulta falló: ${e?.message}`);
      return [];
    }
  }

  /** De `asientos`, los que tiene bloqueados otra compra. */
  async tomadosPorOtros(nodo: string, holdId: string, asientos: AsientoRef[]): Promise<AsientoRef[]> {
    if (!asientos.length) return [];
    const otros = new Set((await this.deOtros(nodo, holdId)).map((a) => `${a.segmentId}|${a.seatNumber}`));
    return asientos.filter((a) => otros.has(`${a.segmentId}|${a.seatNumber}`));
  }

  /** Suelta todo lo que tenía bloqueado una compra (salió, venció o ya compró). */
  async liberar(holdId: string): Promise<void> {
    for (const [k, v] of this.memoria) if (v.holdId === holdId) this.memoria.delete(k);
    const ds = await this.base();
    if (!ds) return;
    await ds.query(`DELETE FROM public.vuelos_asientos_bloqueo WHERE hold_id = $1`, [holdId]).catch((e: any) =>
      this.logger.warn(`[asientos] liberar falló: ${e?.message}`),
    );
  }

  // ───────────── Holds: cómo se crearon y qué asientos tienen en la aerolínea ─────────────

  async guardarHold(holdId: string, nodo: string, cuerpo: any, asientos: AsientoRef[] = []): Promise<void> {
    if (!holdId || !cuerpo || typeof cuerpo !== 'object') return;
    const limpio = { ...cuerpo };
    delete limpio.assignedSeats;
    if (this.holds.size > 2_000) {
      const viejo = Date.now() - 2 * 3_600_000;
      for (const [k, v] of this.holds) if (v.t < viejo) this.holds.delete(k);
    }
    this.holds.set(holdId, { nodo, cuerpo: limpio, asientos, t: Date.now() });
    const ds = await this.base();
    if (!ds) return;
    await ds.query(
      `INSERT INTO public.vuelos_holds_booking (hold_id, codigo_nodo, cuerpo, asientos) VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (hold_id) DO UPDATE SET cuerpo = EXCLUDED.cuerpo, asientos = EXCLUDED.asientos`,
      [holdId, nodo, JSON.stringify(limpio), JSON.stringify(asientos)],
    ).catch((e: any) => this.logger.warn(`[asientos] guardar hold falló: ${e?.message}`));
    if (Math.random() < 0.02) {
      void ds.query(`DELETE FROM public.vuelos_holds_booking WHERE created_at < now() - interval '1 day'`).catch(() => undefined);
    }
  }

  async hold(holdId: string): Promise<HoldGuardado | null> {
    const m = this.holds.get(holdId);
    if (m) return { nodo: m.nodo, cuerpo: m.cuerpo, asientos: m.asientos };
    const ds = await this.base();
    if (!ds) return null;
    try {
      const [f] = await ds.query(`SELECT codigo_nodo, cuerpo, asientos FROM public.vuelos_holds_booking WHERE hold_id = $1`, [holdId]);
      return f ? { nodo: f.codigo_nodo, cuerpo: f.cuerpo, asientos: Array.isArray(f.asientos) ? f.asientos : [] } : null;
    } catch {
      return null;
    }
  }

  async olvidarHold(holdId: string): Promise<void> {
    this.holds.delete(holdId);
    const ds = await this.base();
    if (ds) await ds.query(`DELETE FROM public.vuelos_holds_booking WHERE hold_id = $1`, [holdId]).catch(() => undefined);
  }

  private fijarEnMemoria(nodo: string, holdId: string, asientos: AsientoRef[], expira: Date) {
    const ahora = Date.now();
    const quiere = new Set(asientos.map((a) => `${nodo}|${a.segmentId}|${a.seatNumber}`));
    for (const [k, v] of this.memoria) {
      if (v.expira < ahora || (v.holdId === holdId && k.startsWith(`${nodo}|`) && !quiere.has(k))) this.memoria.delete(k);
    }
    const locked: AsientoRef[] = [];
    const taken: AsientoRef[] = [];
    for (const a of asientos) {
      const k = `${nodo}|${a.segmentId}|${a.seatNumber}`;
      const actual = this.memoria.get(k);
      if (actual && actual.holdId !== holdId) { taken.push(a); continue; }
      this.memoria.set(k, { holdId, expira: expira.getTime() });
      locked.push(a);
    }
    return { locked, taken };
  }
}
