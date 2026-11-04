import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reserva } from '../vuelos/entities/reserva.entity';
import { OrderAuto } from '../autos/entities/order-auto.entity';
import { ReservaAtraccion } from '../atracciones/entities/reserva.entity';
import { ReservaAlojamiento } from '../alojamientos/entities/reserva.entity';
import { AdminConfigService } from './admin-config.service';

/** Estados que significan "el cliente ya pagó". */
// CHECKED_IN (atracciones), ACTIVA/COMPLETADA (autos en renta o devueltos) y
// CHECKED_OUT (hospedaje) también son reservas ya cobradas: antes quedaban fuera
// de los ingresos.
export const PAGADAS = new Set(['CONFIRMED', 'CONFIRMADA', 'PAGADA', 'PAID', 'TICKET_ISSUING', 'TICKETED', 'ISSUED', 'COMPLETED', 'CHECKED_IN', 'ACTIVA', 'COMPLETADA', 'CHECKED_OUT']);
/** Estados de reserva viva pendiente de cobro. */
export const PENDIENTES = new Set(['PENDING', 'PENDIENTE', 'PENDING_PAYMENT', 'RESERVED', 'HELD', 'CHANGE_PENDING']);
/** Estados anulados / reembolsados. */
export const ANULADAS = new Set(['CANCELLED', 'CANCELADA', 'CANCELED', 'FAILED', 'REJECTED', 'REFUNDED', 'CANCELLATION_PENDING', 'EXPIRED', 'COMPENSATED']);

export const VERTICALES: Record<string, string> = {
  vuelos: 'Aerolíneas (Vuelos)',
  autos: 'Rentadoras (Autos)',
  atracciones: 'Operadores (Atracciones)',
  hospedaje: 'Hoteles (Hospedaje)',
};

interface Mov {
  vertical: string;
  id: string;
  ref: string;
  estado: string;
  monto: number;
  fecha: Date;
  cliente: string | null;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const periodoDe = (d: Date) => {
  const f = new Date(d);
  return Number.isNaN(f.getTime()) ? 'sin-fecha' : `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Motor financiero del booking (BACKLOG_ADMIN §4).
 *
 * Fuente: las reservas REALES de la base (vuelos, autos, atracciones, hospedaje).
 *  - Cobrado      = suma de reservas pagadas/confirmadas.
 *  - Comisión     = cobrado × comisión base (tabla panel_config).
 *  - IVA incluido = cobrado − cobrado / (1 + IVA).
 *  - Neto proveedor = cobrado − comisión.
 *
 * Liquidaciones: se agrupan por vertical (tipo de proveedor) y mes. Al aprobar
 * un payout se guarda un registro en `liquidaciones` con el monto pagado; si en
 * ese mes entran reservas nuevas, la diferencia vuelve a quedar pendiente.
 */
@Injectable()
export class AdminFinanzasService {
  private readonly logger = new Logger(AdminFinanzasService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: AdminConfigService,
    @InjectRepository(Reserva) private readonly reservaRepo: Repository<Reserva>,
    @InjectRepository(OrderAuto) private readonly orderAutoRepo: Repository<OrderAuto>,
    @InjectRepository(ReservaAtraccion) private readonly reservaAtraccionRepo: Repository<ReservaAtraccion>,
    @InjectRepository(ReservaAlojamiento) private readonly reservaAlojamientoRepo: Repository<ReservaAlojamiento>,
  ) {}

  private async movimientos(): Promise<Mov[]> {
    const [vuelos, autos, atracciones, hospedaje] = await Promise.all([
      this.reservaRepo.find().catch((e) => { this.logger.error(`Finanzas vuelos: ${e.message}`); return [] as Reserva[]; }),
      this.orderAutoRepo.find().catch((e) => { this.logger.error(`Finanzas autos: ${e.message}`); return [] as OrderAuto[]; }),
      this.reservaAtraccionRepo.find().catch((e) => { this.logger.error(`Finanzas atracciones: ${e.message}`); return [] as ReservaAtraccion[]; }),
      this.reservaAlojamientoRepo.find().catch((e) => { this.logger.error(`Finanzas hospedaje: ${e.message}`); return [] as ReservaAlojamiento[]; }),
    ]);
    return [
      ...vuelos.map((v) => ({
        vertical: 'vuelos', id: v.idReserva, ref: v.pnr || v.idReserva.slice(0, 6).toUpperCase(),
        estado: String(v.estado || '').toUpperCase(), monto: Number(v.total || 0), fecha: v.fechaCreacion, cliente: null,
      })),
      ...autos.map((a) => ({
        vertical: 'autos', id: a.id, ref: a.id.slice(0, 6).toUpperCase(),
        estado: String(a.status || '').toUpperCase(), monto: Number(a.totalPrice?.total || 0), fecha: a.createdAt,
        cliente: a.booker?.email || a.booker?.name || null,
      })),
      ...atracciones.map((a) => ({
        vertical: 'atracciones', id: a.id, ref: a.id.slice(0, 6).toUpperCase(),
        estado: String(a.status || '').toUpperCase(), monto: Number(a.totalPrice?.total || 0), fecha: a.createdAt,
        cliente: a.customerEmail || a.customerName || null,
      })),
      ...hospedaje.map((h) => ({
        vertical: 'hospedaje', id: h.id, ref: h.codigoReserva || h.id.slice(0, 6).toUpperCase(),
        estado: String(h.status || '').toUpperCase(), monto: Number(h.totalPrice?.total ?? h.total ?? 0), fecha: h.createdAt,
        cliente: h.customerEmail || h.customerName || null,
      })),
    ];
  }

  private async pagosRegistrados() {
    await this.configService.asegurarEsquema();
    return this.dataSource.query(
      `SELECT vertical, periodo, SUM(monto_pagado)::float AS pagado, COUNT(*)::int AS pagos,
              MAX(aprobado_en) AS ultimo_pago, (ARRAY_AGG(aprobado_por ORDER BY aprobado_en DESC))[1] AS aprobado_por
       FROM panel_liquidaciones GROUP BY vertical, periodo`,
    ) as Promise<{ vertical: string; periodo: string; pagado: number; pagos: number; ultimo_pago: Date; aprobado_por: string }[]>;
  }

  /** Agrupa movimientos pagados por vertical+mes y cruza con los pagos ya hechos. */
  private calcularLiquidaciones(movs: Mov[], pct: number, pagos: Awaited<ReturnType<AdminFinanzasService['pagosRegistrados']>>) {
    const grupos = new Map<string, { vertical: string; periodo: string; reservas: number; bruto: number }>();
    for (const m of movs) {
      if (!PAGADAS.has(m.estado)) continue;
      const periodo = periodoDe(m.fecha);
      const k = `${m.vertical}:${periodo}`;
      const g = grupos.get(k) || { vertical: m.vertical, periodo, reservas: 0, bruto: 0 };
      g.reservas++;
      g.bruto += m.monto;
      grupos.set(k, g);
    }
    // Incluye también periodos que ya tienen pagos aunque hoy no haya reservas pagadas
    for (const p of pagos) {
      const k = `${p.vertical}:${p.periodo}`;
      if (!grupos.has(k)) grupos.set(k, { vertical: p.vertical, periodo: p.periodo, reservas: 0, bruto: 0 });
    }

    return [...grupos.values()]
      .map((g) => {
        const pago = pagos.find((p) => p.vertical === g.vertical && p.periodo === g.periodo);
        const bruto = r2(g.bruto);
        const comision = r2(bruto * pct / 100);
        const neto = r2(bruto - comision);
        const pagado = r2(pago?.pagado || 0);
        const pendiente = r2(Math.max(neto - pagado, 0));
        return {
          id: `${g.vertical}:${g.periodo}`,
          vertical: g.vertical,
          proveedor: VERTICALES[g.vertical] || g.vertical,
          periodo: g.periodo,
          reservas: g.reservas,
          bruto,
          comisionPct: pct,
          comision,
          neto,
          pagado,
          pendiente,
          estado: pendiente <= 0.009 ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
          ultimoPago: pago?.ultimo_pago ? new Date(pago.ultimo_pago).toISOString() : null,
          aprobadoPor: pago?.aprobado_por || null,
        };
      })
      .sort((a, b) => (a.periodo === b.periodo ? a.vertical.localeCompare(b.vertical) : b.periodo.localeCompare(a.periodo)));
  }

  async getFinanzas() {
    const cfg = await this.configService.getConfig();
    const pct = cfg.comisionBase;
    const iva = cfg.tasaImpuestos;
    const [movs, pagos] = await Promise.all([this.movimientos(), this.pagosRegistrados()]);

    const sum = (f: (m: Mov) => boolean) => r2(movs.filter(f).reduce((s, m) => s + m.monto, 0));
    const cobrado = sum((m) => PAGADAS.has(m.estado));
    const porCobrar = sum((m) => PENDIENTES.has(m.estado));
    const anulado = sum((m) => ANULADAS.has(m.estado));
    const nPagadas = movs.filter((m) => PAGADAS.has(m.estado)).length;
    const comisiones = r2(cobrado * pct / 100);
    const netoProveedores = r2(cobrado - comisiones);
    const ivaIncluido = r2(cobrado - cobrado / (1 + iva / 100));

    const liquidaciones = this.calcularLiquidaciones(movs, pct, pagos);
    const pagadoProveedores = r2(pagos.reduce((s, p) => s + Number(p.pagado || 0), 0));
    const pendientePago = r2(liquidaciones.reduce((s, l) => s + l.pendiente, 0));

    const porVertical = Object.keys(VERTICALES)
      .map((v) => {
        const vm = movs.filter((m) => m.vertical === v);
        const c = r2(vm.filter((m) => PAGADAS.has(m.estado)).reduce((s, m) => s + m.monto, 0));
        return {
          vertical: v,
          proveedor: VERTICALES[v],
          reservas: vm.length,
          pagadas: vm.filter((m) => PAGADAS.has(m.estado)).length,
          cobrado: c,
          comision: r2(c * pct / 100),
          neto: r2(c - c * pct / 100),
          porCobrar: r2(vm.filter((m) => PENDIENTES.has(m.estado)).reduce((s, m) => s + m.monto, 0)),
          anulado: r2(vm.filter((m) => ANULADAS.has(m.estado)).reduce((s, m) => s + m.monto, 0)),
        };
      });

    // Últimos 6 meses (incluye meses en cero para que la serie sea continua)
    const hoy = new Date();
    const porMes = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
      const periodo = periodoDe(d);
      const c = sum((m) => PAGADAS.has(m.estado) && periodoDe(m.fecha) === periodo);
      return { periodo, cobrado: c, comision: r2(c * pct / 100) };
    });

    const ultimosMovimientos = [...movs]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 25)
      .map((m) => ({
        ...m,
        fecha: m.fecha ? new Date(m.fecha).toISOString() : null,
        monto: r2(m.monto),
        comision: PAGADAS.has(m.estado) ? r2(m.monto * pct / 100) : 0,
        clase: PAGADAS.has(m.estado) ? 'cobrado' : PENDIENTES.has(m.estado) ? 'pendiente' : ANULADAS.has(m.estado) ? 'anulado' : 'otro',
      }));

    return {
      generadoEn: new Date().toISOString(),
      config: { comisionBase: pct, tasaImpuestos: iva },
      resumen: {
        cobrado, porCobrar, anulado, comisiones, ivaIncluido, netoProveedores,
        pagadoProveedores, pendientePago,
        reservasPagadas: nPagadas,
        reservasTotales: movs.length,
        ticketPromedio: nPagadas ? r2(cobrado / nPagadas) : 0,
      },
      porVertical,
      porMes,
      liquidaciones,
      ultimosMovimientos,
    };
  }

  /**
   * Aprueba (paga) lo pendiente de una liquidación vertical+periodo,
   * calculada con las reservas reales de la base.
   */
  async aprobarPayout(
    body: { vertical: string; periodo: string; referencia?: string; bruto?: number; reservas?: number },
    actor: string | null,
  ) {
    const { vertical, periodo } = body || ({} as any);
    if (!VERTICALES[vertical]) throw new BadRequestException(`Vertical inválida: ${vertical}`);
    if (!/^\d{4}-\d{2}$/.test(periodo || '')) throw new BadRequestException('periodo debe tener formato YYYY-MM');

    const fin = await this.getFinanzas();
    const liq = fin.liquidaciones.find((l) => l.vertical === vertical && l.periodo === periodo);
    if (!liq) throw new BadRequestException(`No hay reservas pagadas para ${vertical} en ${periodo}`);

    if (liq.pendiente <= 0.009) throw new BadRequestException('Esta liquidación ya está pagada por completo.');

    const referencia = (body.referencia || `PAYOUT-${vertical.toUpperCase()}-${periodo}-${Date.now().toString(36).toUpperCase()}`).slice(0, 120);
    const [row] = await this.dataSource.query(
      `INSERT INTO panel_liquidaciones (vertical, periodo, reservas, monto_bruto, comision_pct, comision, monto_pagado, referencia, aprobado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, aprobado_en`,
      [vertical, periodo, liq.reservas, liq.bruto, liq.comisionPct, liq.comision, liq.pendiente, referencia, actor],
    );

    return {
      success: true,
      id: row?.id,
      referencia,
      vertical,
      periodo,
      montoPagado: liq.pendiente,
      aprobadoEn: row?.aprobado_en,
      message: `Payout de $${liq.pendiente.toFixed(2)} aprobado para ${VERTICALES[vertical]} (${periodo}).`,
    };
  }

  async historialPayouts() {
    await this.configService.asegurarEsquema();
    const rows = await this.dataSource.query(
      `SELECT id, vertical, periodo, reservas, monto_bruto::float AS bruto, comision_pct::float AS "comisionPct",
              comision::float AS comision, monto_pagado::float AS pagado, referencia, aprobado_por AS "aprobadoPor", aprobado_en AS "aprobadoEn"
       FROM panel_liquidaciones ORDER BY aprobado_en DESC LIMIT 100`,
    );
    return rows.map((r: any) => ({ ...r, proveedor: VERTICALES[r.vertical] || r.vertical }));
  }
}
