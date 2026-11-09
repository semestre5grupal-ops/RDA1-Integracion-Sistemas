import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AlmacenTraza, EventoVuelo, trazaVuelos } from './vuelos-traza';

/**
 * Guarda la traza en vivo de vuelos en Postgres para que el panel del admin
 * muestre lo mismo en todas las computadoras y sobreviva a reinicios.
 * Se conservan 7 días.
 */
@Injectable()
export class VuelosTrazaPersistencia implements AlmacenTraza, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VuelosTrazaPersistencia.name);
  private lista = false;
  private guardados = 0;

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
      this.lista = true;
      trazaVuelos.conectar(this);
    } catch (e: any) {
      this.logger.warn(`Traza de vuelos solo en memoria: ${e?.message}`);
    }
  }

  onModuleDestroy(): void {
    trazaVuelos.conectar(null);
  }

  async guardar(e: EventoVuelo): Promise<void> {
    if (!this.lista) return;
    await this.dataSource.query(
      `INSERT INTO public.vuelos_traza (ts, correlacion, paso, resultado, detalle, nodo, ms, monto, cliente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [e.ts, e.correlacion, e.paso, e.resultado, e.detalle ?? null, e.nodo ?? null, e.ms ?? null, e.monto ?? null, e.cliente ?? null],
    );
    if (++this.guardados % 500 === 0) {
      await this.dataSource.query(`DELETE FROM public.vuelos_traza WHERE ts < now() - interval '7 days'`).catch(() => undefined);
    }
  }

  async consultar(desde: number, limite: number) {
    const filas: any[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT id, ts, correlacion, paso, resultado, detalle, nodo, ms, monto, cliente
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
      eventos: filas.map((f) => ({
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
      })) as EventoVuelo[],
    };
  }
}
