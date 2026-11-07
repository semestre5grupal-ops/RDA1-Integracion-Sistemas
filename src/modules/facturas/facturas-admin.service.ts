import { Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface FacturaResumen {
  id: string;
  numero_factura: string;
  nombre_cliente: string;
  cedula_ruc_cliente: string;
  email_cliente: string;
  subtotal: number;
  iva_porcentaje: number;
  iva_valor: number;
  total: number;
  metodo_pago: string;
  estado: string;
  transaccion_pago_id: string | null;
  emitida_at: string;
}

const ESTADOS = ['EMITIDA', 'PAGADA', 'ANULADA_POR_COMPENSACION'];

/**
 * Consulta de facturas para el Panel 5 (Consola Fiscal) del administrador.
 * Lee `schema_facturacion.facturas_encabezado` en solo lectura.
 */
@Injectable()
export class FacturasAdminService {
  private readonly logger = new Logger(FacturasAdminService.name);

  constructor(@Optional() private readonly dataSource?: DataSource) {}

  async listar(opts: { limit?: number; estado?: string; q?: string }) {
    if (!this.dataSource?.isInitialized) {
      throw new ServiceUnavailableException('La base de datos de facturación no está disponible.');
    }
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
    const where: string[] = [];
    const params: any[] = [];
    if (opts.estado && ESTADOS.includes(opts.estado)) {
      params.push(opts.estado);
      where.push(`estado = $${params.length}`);
    }
    if (opts.q && opts.q.trim()) {
      params.push(`%${opts.q.trim()}%`);
      const i = params.length;
      where.push(`(numero_factura ILIKE $${i} OR nombre_cliente ILIKE $${i} OR cedula_ruc_cliente ILIKE $${i} OR email_cliente ILIKE $${i})`);
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const filas: any[] = await this.dataSource.query(
      `SELECT id, numero_factura, nombre_cliente, cedula_ruc_cliente, email_cliente,
              subtotal, iva_porcentaje, iva_valor, total, metodo_pago, estado,
              transaccion_pago_id, emitida_at
         FROM schema_facturacion.facturas_encabezado
         ${filtro}
        ORDER BY emitida_at DESC
        LIMIT ${limit}`,
      params,
    );
    const [tot] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cantidad,
              COALESCE(SUM(subtotal),0)::float AS subtotal,
              COALESCE(SUM(iva_valor),0)::float AS iva,
              COALESCE(SUM(total),0)::float AS total
         FROM schema_facturacion.facturas_encabezado
         ${filtro}`,
      params,
    );

    const items: FacturaResumen[] = filas.map((f) => ({
      ...f,
      subtotal: Number(f.subtotal),
      iva_porcentaje: Number(f.iva_porcentaje),
      iva_valor: Number(f.iva_valor),
      total: Number(f.total),
      emitida_at: f.emitida_at instanceof Date ? f.emitida_at.toISOString() : f.emitida_at,
    }));

    return { items, total: tot?.cantidad ?? items.length, totales: tot ?? null };
  }

  /** Una factura con sus líneas y sus notas de crédito (si la tabla existe). */
  async detalle(id: string) {
    if (!this.dataSource?.isInitialized) {
      throw new ServiceUnavailableException('La base de datos de facturación no está disponible.');
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException('Factura no encontrada.');
    const [f] = await this.dataSource.query(
      `SELECT id, numero_factura, nombre_cliente, cedula_ruc_cliente, email_cliente,
              subtotal, iva_porcentaje, iva_valor, total, metodo_pago, estado,
              transaccion_pago_id, emitida_at
         FROM schema_facturacion.facturas_encabezado WHERE id = $1`,
      [id],
    );
    if (!f) throw new NotFoundException('Factura no encontrada.');
    const lineas = await this.dataSource.query(
      `SELECT vertical, item_id, descripcion, cantidad, precio_unitario, subtotal
         FROM schema_facturacion.facturas_detalle WHERE factura_id = $1`,
      [id],
    );
    const notas = await this.dataSource
      .query(
        `SELECT numero_nota, monto, motivo, emitida_at FROM schema_facturacion.notas_credito
          WHERE factura_id = $1 ORDER BY emitida_at`,
        [id],
      )
      .catch(() => [] as any[]); // la tabla solo existe si ya hubo ventas de vuelos con socios
    const n = (v: any) => (v === null || v === undefined ? null : Number(v));
    return {
      ...f,
      subtotal: n(f.subtotal),
      iva_porcentaje: n(f.iva_porcentaje),
      iva_valor: n(f.iva_valor),
      total: n(f.total),
      lineas: lineas.map((l: any) => ({ ...l, cantidad: n(l.cantidad), precio_unitario: n(l.precio_unitario), subtotal: n(l.subtotal) })),
      notas_credito: notas.map((c: any) => ({ ...c, monto: n(c.monto) })),
    };
  }
}
