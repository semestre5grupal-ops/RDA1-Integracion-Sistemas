import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AlmacenTraza, EventoVuelo, trazaVuelos } from './vuelos-traza';
import { evaluarSlo, SLOS_VUELOS, UMBRAL_BUSQUEDA_MS, VENTANA_SLO_DIAS, VentanasSli } from './vuelos-slo';

const COLUMNAS = 'id, ts, correlacion, paso, resultado, detalle, nodo, ms, monto, cliente, trace_id';

/**
 * Guarda la traza en vivo de vuelos en Postgres para que el panel del admin
 * muestre lo mismo en todas las computadoras y sobreviva a reinicios.
 * El detalle se conserva 7 días; el resumen diario (vuelos_sli_diario), 90.
 */
@Injectable()
export class VuelosTrazaPersistencia implements AlmacenTraza, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VuelosTrazaPersistencia.name);
  private lista = false;
  private guardados = 0;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS public.vuelos_traza (
          id bigserial PRIMARY KEY,
          ts timestamptz NOT NULL DEFAULT now(),
          correlacion text NOT NULL,
          paso text NOT NULL,
          resultado text NOT NULL,
          detalle text,
          nodo text,
          ms integer,
          monto numeric(12,2),
          cliente text
        )`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS vuelos_traza_ts_idx ON public.vuelos_traza (ts)`);
      // Semana 10: trace_id para unir cada paso con los logs y con Jaeger (aditivo, sin romper filas viejas).
      await this.dataSource.query(`ALTER TABLE public.vuelos_traza ADD COLUMN IF NOT EXISTS trace_id text`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS vuelos_traza_trace_idx ON public.vuelos_traza (trace_id) WHERE trace_id IS NOT NULL`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS vuelos_traza_corr_idx ON public.vuelos_traza (correlacion)`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS public.vuelos_sli_diario (
          dia date NOT NULL,
          sli text NOT NULL,
          total integer NOT NULL,
          malos integer NOT NULL,
          p50 integer,
          p95 integer,
          p99 integer,
          actualizado timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (dia, sli)
        )`);
      this.lista = true;
      trazaVuelos.conectar(this);
      void this.resumirDias();
      this.temporizador = setInterval(() => void this.resumirDias(), 60 * 60_000);
      this.temporizador.unref?.();
    } catch (e: any) {
      this.logger.warn(`Traza de vuelos solo en memoria: ${e?.message}`);
    }
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    trazaVuelos.conectar(null);
  }

  async guardar(e: EventoVuelo): Promise<void> {
    if (!this.lista) return;
    await this.dataSource.query(
      `INSERT INTO public.vuelos_traza (ts, correlacion, paso, resultado, detalle, nodo, ms, monto, cliente, trace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [e.ts, e.correlacion, e.paso, e.resultado, e.detalle ?? null, e.nodo ?? null, e.ms ?? null, e.monto ?? null, e.cliente ?? null, e.traceId ?? null],
    );
    if (++this.guardados % 500 === 0) {
      await this.dataSource.query(`DELETE FROM public.vuelos_traza WHERE ts < now() - interval '7 days'`).catch(() => undefined);
      await this.dataSource.query(`DELETE FROM public.vuelos_sli_diario WHERE dia < current_date - 90`).catch(() => undefined);
    }
  }

  async ventana(horas: number, limite: number) {
    const tope = Math.min(Math.max(limite, 1), 10_000);
    const filas: any[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT ${COLUMNAS}
           FROM public.vuelos_traza WHERE ts > now() - make_interval(hours => $1::int) ORDER BY id DESC LIMIT $2
       ) t ORDER BY id`,
      [Math.floor(horas), tope + 1],
    );
    const truncado = filas.length > tope;
    return { eventos: (truncado ? filas.slice(1) : filas).map((f) => this.aEvento(f)), truncado };
  }

  private aEvento(f: any): EventoVuelo {
    return {
      seq: Number(f.id),
      ts: new Date(f.ts).toISOString(),
      correlacion: f.correlacion,
      paso: f.paso,
      resultado: f.resultado,
      detalle: f.detalle ?? '',
      nodo: f.nodo,
      ms: f.ms,
      monto: f.monto != null ? Number(f.monto) : null,
      cliente: f.cliente,
      traceId: f.trace_id ?? null,
    } as EventoVuelo;
  }

  async consultar(desde: number, limite: number) {
    const filas: any[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT ${COLUMNAS}
           FROM public.vuelos_traza WHERE id > $1 ORDER BY id DESC LIMIT $2
       ) t ORDER BY id`,
      [Math.max(0, Math.floor(desde) || 0), Math.min(Math.max(limite, 1), 1000)],
    );
    const [{ max }] = await this.dataSource.query(`SELECT COALESCE(max(id), 0)::bigint AS max FROM public.vuelos_traza`);
    const conteos: any[] = await this.dataSource.query(
      `SELECT paso, resultado, count(*)::int AS n FROM public.vuelos_traza
        WHERE ts > now() - interval '24 hours' GROUP BY paso, resultado`,
    );
    const contadores: Record<string, { ok: number; error: number; aviso: number }> = {};
    for (const c of conteos) {
      const k = (contadores[c.paso] ??= { ok: 0, error: 0, aviso: 0 });
      if (c.resultado in k) (k as any)[c.resultado] = Number(c.n);
    }
    return {
      ultimoSeq: Number(max),
      contadores,
      eventos: filas.map((f) => this.aEvento(f)),
    };
  }

  /** Todos los pasos de una compra, buscando por X-Correlation-Id o por trace_id. */
  async porId(id: string): Promise<EventoVuelo[]> {
    const filas: any[] = await this.dataSource.query(
      `SELECT ${COLUMNAS} FROM public.vuelos_traza
        WHERE correlacion = $1 OR trace_id = lower($1)
        ORDER BY ts, id LIMIT 500`,
      [id],
    );
    return filas.map((f) => this.aEvento(f));
  }

  // ───────────────────────── SLI / SLO ─────────────────────────

  /**
   * Cada SLI se define como "total de eventos" y "eventos malos" sobre vuelos_traza.
   * Los fragmentos SQL son constantes del código (no vienen del usuario).
   */
  private readonly definiciones: Record<string, { desde: string; donde: string; malo: string }> = {
    busqueda_disponible: { desde: 'public.vuelos_traza e', donde: `e.paso = 'busqueda'`, malo: `e.resultado = 'error'` },
    busqueda_rapida: { desde: 'public.vuelos_traza e', donde: `e.paso = 'busqueda' AND e.ms IS NOT NULL`, malo: `e.ms > ${UMBRAL_BUSQUEDA_MS}` },
    compra_exitosa: {
      desde: 'public.vuelos_traza e',
      donde: `e.paso = 'cobro' AND e.resultado = 'ok'`,
      // Un cobro aprobado es malo si, en esa misma compra, la aerolínea no emitió la reserva.
      malo: `NOT EXISTS (SELECT 1 FROM public.vuelos_traza r WHERE r.correlacion = e.correlacion AND r.paso = 'reserva_aerolinea' AND r.resultado = 'ok' AND r.ts >= e.ts)
             AND EXISTS (SELECT 1 FROM public.vuelos_traza r WHERE r.correlacion = e.correlacion AND r.paso = 'reserva_aerolinea' AND r.resultado = 'error' AND r.ts >= e.ts)`,
    },
    reembolso_total: {
      desde: 'public.vuelos_traza e',
      donde: `e.paso = 'reserva_aerolinea' AND e.resultado = 'error'`,
      malo: `NOT EXISTS (SELECT 1 FROM public.vuelos_traza r WHERE r.correlacion = e.correlacion AND r.paso = 'reembolso' AND r.resultado = 'ok' AND r.ts >= e.ts)`,
    },
  };

  private async ventanasDe(id: string): Promise<VentanasSli> {
    const d = this.definiciones[id];
    const cols = [
      ['h1', '1 hour'],
      ['h6', '6 hours'],
      ['h24', '24 hours'],
      ['d7', `${VENTANA_SLO_DIAS} days`],
    ]
      .map(
        ([k, i]) =>
          `count(*) FILTER (WHERE e.ts > now() - interval '${i}')::int AS ${k}_t,
           count(*) FILTER (WHERE e.ts > now() - interval '${i}' AND (${d.malo}))::int AS ${k}_m`,
      )
      .join(',');
    const [f] = await this.dataSource.query(
      `SELECT ${cols} FROM ${d.desde} WHERE ${d.donde} AND e.ts > now() - interval '${VENTANA_SLO_DIAS} days'`,
    );
    const v = (k: string) => ({ total: Number(f[`${k}_t`]) || 0, malos: Number(f[`${k}_m`]) || 0 });
    return { h1: v('h1'), h6: v('h6'), h24: v('h24'), d7: v('d7') };
  }

  /** Percentiles exactos (p50/p95/p99) calculados en Postgres, por paso y por aerolínea. */
  private async latencias(horas: number) {
    const h = Math.min(Math.max(Math.floor(horas) || 24, 1), 168);
    const filas: any[] = await this.dataSource.query(
      `SELECT paso, nodo, count(*)::int AS n,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY ms)::int AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::int AS p95,
              percentile_cont(0.99) WITHIN GROUP (ORDER BY ms)::int AS p99,
              max(ms)::int AS max
         FROM public.vuelos_traza
        WHERE ms IS NOT NULL AND paso IN ('busqueda','hold','cobro','reserva_aerolinea','asiento')
          AND ts > now() - make_interval(hours => $1::int)
        GROUP BY paso, nodo
        ORDER BY paso, nodo NULLS FIRST`,
      [h],
    );
    return filas.map((f) => ({ paso: f.paso, nodo: f.nodo, n: Number(f.n), p50: f.p50, p95: f.p95, p99: f.p99, max: f.max }));
  }

  async informeSlo(horas = 24) {
    const slos = [];
    for (const def of SLOS_VUELOS) slos.push(evaluarSlo(def, await this.ventanasDe(def.id)));
    const historial: any[] = await this.dataSource.query(
      `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, sli, total, malos, p50, p95, p99
         FROM public.vuelos_sli_diario WHERE dia >= current_date - 30 ORDER BY dia, sli`,
    );
    return {
      generadoEn: new Date().toISOString(),
      ventanaDias: VENTANA_SLO_DIAS,
      slos,
      latencias: await this.latencias(horas),
      historial,
    };
  }

  /** Guarda el resumen de los últimos días (idempotente: se puede repetir sin duplicar). */
  private async resumirDias(): Promise<void> {
    if (!this.lista) return;
    try {
      for (const id of Object.keys(this.definiciones)) {
        const d = this.definiciones[id];
        const lat = id.startsWith('busqueda')
          ? `percentile_cont(0.5) WITHIN GROUP (ORDER BY e.ms)::int, percentile_cont(0.95) WITHIN GROUP (ORDER BY e.ms)::int, percentile_cont(0.99) WITHIN GROUP (ORDER BY e.ms)::int`
          : `NULL::int, NULL::int, NULL::int`;
        await this.dataSource.query(
          `INSERT INTO public.vuelos_sli_diario (dia, sli, total, malos, p50, p95, p99)
           SELECT (e.ts AT TIME ZONE 'UTC')::date, $1, count(*)::int,
                  count(*) FILTER (WHERE ${d.malo})::int, ${lat}
             FROM ${d.desde}
            WHERE ${d.donde}
              AND (e.ts AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date - ${VENTANA_SLO_DIAS - 2}
            GROUP BY 1
           ON CONFLICT (dia, sli) DO UPDATE
             SET total = EXCLUDED.total, malos = EXCLUDED.malos,
                 p50 = EXCLUDED.p50, p95 = EXCLUDED.p95, p99 = EXCLUDED.p99, actualizado = now()`,
          [id],
        );
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo guardar el resumen diario de SLO: ${e?.message}`);
    }
  }
}
