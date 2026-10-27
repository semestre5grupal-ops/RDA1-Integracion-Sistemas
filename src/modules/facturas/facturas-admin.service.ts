import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
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
}
