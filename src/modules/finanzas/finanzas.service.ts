import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LiquidacionProveedor, LibroMayorComisiones } from './entities';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';

@Injectable()
export class FinanzasService {
  private readonly logger = new Logger(FinanzasService.name);

  constructor(
    @InjectRepository(LiquidacionProveedor)
    private readonly liquidacionRepo: Repository<LiquidacionProveedor>,
    @InjectRepository(LibroMayorComisiones)
    private readonly libroMayorRepo: Repository<LibroMayorComisiones>,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
  ) {}

  /**
   * Registra un asiento contable formal: 10% de comisión para Booking Prototipo
   * y 90% neto a liquidar para el proveedor externo (Rúbrica RDA2 CE05).
   */
  async registrarVentaYCalcularComision(params: {
    orden_id: string;
    factura_id: string;
    vertical: string;
    total_venta: number;
    proveedor_codigo?: string;
  }): Promise<any> {
    const total = Number(params.total_venta || 0);
    const comision10 = Number((total * 0.10).toFixed(2));
    const neto90 = Number((total * 0.90).toFixed(2));
    const proveedor = params.proveedor_codigo || `NODE_${params.vertical.slice(0, 3).toUpperCase()}_PARTNER`;

    this.logger.log(`[Finanzas] Registrando comisión 10% ($${comision10}) para orden ${params.orden_id} (Total: $${total})`);

    // 1. Asiento en Libro Mayor
    const asiento = this.libroMayorRepo.create({
      ordenId: params.orden_id,
      facturaId: params.factura_id,
      vertical: params.vertical,
      totalVenta: total,
      comisionBooking10pct: comision10,
      netoSocio90pct: neto90,
    });
    const savedAsiento = await this.libroMayorRepo.save(asiento);

    // 2. Acumular o crear período de liquidación quincenal
    const now = new Date();
    const dia = now.getDate();
    const quincena = dia <= 15 ? 'Q1' : 'Q2';
    const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${quincena}`;

    let liquidacion = await this.liquidacionRepo.findOne({
      where: { proveedorCodigo: proveedor, periodo, estado: 'PENDIENTE' },
    });

    if (liquidacion) {
      liquidacion.totalRecaudado = Number(liquidacion.totalRecaudado) + total;
      liquidacion.comisionBooking10pct = Number(liquidacion.comisionBooking10pct) + comision10;
      liquidacion.montoLiquidarSocio90pct = Number(liquidacion.montoLiquidarSocio90pct) + neto90;
      await this.liquidacionRepo.save(liquidacion);
    } else {
      liquidacion = this.liquidacionRepo.create({
        proveedorCodigo: proveedor,
        vertical: params.vertical,
        periodo,
        totalRecaudado: total,
        comisionBooking10pct: comision10,
        montoLiquidarSocio90pct: neto90,
        estado: 'PENDIENTE',
      });
      await this.liquidacionRepo.save(liquidacion);
    }

    // 3. Trazabilidad física Winston
    this.winstonLogger.logAudit('COMISION_FINANCIERA_LIQUIDADA', {
      orden_id: params.orden_id,
      factura_id: params.factura_id,
      vertical: params.vertical,
      proveedor: proveedor,
      total_venta: total,
      comision_booking_10pct: comision10,
      neto_socio_90pct: neto90,
      periodo_liquidacion: periodo,
    });

    return {
      asiento_id: savedAsiento.id,
      orden_id: params.orden_id,
      total_venta: total,
      comision_booking_10pct: comision10,
      neto_socio_90pct: neto90,
      periodo_liquidacion: periodo,
    };
  }

  async getLiquidaciones(periodo?: string, estado?: string): Promise<any[]> {
    const whereClause: any = {};
    if (periodo) whereClause.periodo = periodo;
    if (estado) whereClause.estado = estado;

    const list = await this.liquidacionRepo.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
    });

    return list.map(l => ({
      id: l.id,
      numero_liquidacion: l.numeroLiquidacion,
      porcentaje_comision: Number(l.porcentajeComision ?? 10),
      proveedor_codigo: l.proveedorCodigo,
      vertical: l.vertical,
      periodo: l.periodo,
      total_recaudado: Number(l.totalRecaudado),
      comision_booking_10pct: Number(l.comisionBooking10pct),
      monto_liquidar_socio_90pct: Number(l.montoLiquidarSocio90pct),
      estado: l.estado,
      comprobante_transferencia_url: l.comprobanteTransferenciaUrl,
      fecha_pago: l.fechaPago,
      created_at: l.createdAt,
    }));
  }

  async marcarLiquidacionPagada(id: string, dto: { comprobante_url: string; notas?: string }): Promise<any> {
    const liquidacion = await this.liquidacionRepo.findOne({ where: { id } });
    if (!liquidacion) {
      throw new HttpException('Liquidación no encontrada', HttpStatus.NOT_FOUND);
    }

    // El comprobante es la prueba del pago: sin él no se marca como pagada.
    const comprobante = String(dto?.comprobante_url ?? '').trim();
    if (!comprobante) {
      throw new HttpException('Indica el comprobante o la referencia de la transferencia.', HttpStatus.BAD_REQUEST);
    }
    liquidacion.estado = 'PAGADO';
    liquidacion.comprobanteTransferenciaUrl = comprobante.slice(0, 500);
    liquidacion.fechaPago = new Date();
    const updated = await this.liquidacionRepo.save(liquidacion);

    this.winstonLogger.logAudit('LIQUIDACION_SOCIO_PAGADA', {
      liquidacion_id: liquidacion.id,
      proveedor: liquidacion.proveedorCodigo,
      monto_pagado: Number(liquidacion.montoLiquidarSocio90pct),
      comprobante_url: liquidacion.comprobanteTransferenciaUrl,
      fecha_pago: liquidacion.fechaPago.toISOString(),
    });

    return {
      success: true,
      mensaje: `Liquidación ${liquidacion.periodo} para ${liquidacion.proveedorCodigo} marcada como PAGADA.`,
      liquidacion: updated,
    };
  }

  async getResumenFinanciero(): Promise<any> {
    const all = await this.liquidacionRepo.find();
    let totalRecaudadoGlobal = 0;
    let totalComisionesBooking = 0;
    let totalLiquidadoPagado = 0;
    let totalPendienteLiquidar = 0;

    all.forEach(l => {
      const rec = Number(l.totalRecaudado || 0);
      const com = Number(l.comisionBooking10pct || 0);
      const socio = Number(l.montoLiquidarSocio90pct || 0);
      totalRecaudadoGlobal += rec;
      totalComisionesBooking += com;
      if (l.estado === 'PAGADO') {
        totalLiquidadoPagado += socio;
      } else {
        totalPendienteLiquidar += socio;
      }
    });

    return {
      total_recaudado_global: Number(totalRecaudadoGlobal.toFixed(2)),
      total_comisiones_booking_10pct: Number(totalComisionesBooking.toFixed(2)),
      total_liquidado_a_socios: Number(totalLiquidadoPagado.toFixed(2)),
      total_pendiente_de_pago: Number(totalPendienteLiquidar.toFixed(2)),
      moneda: 'USD',
      regla_comision: '10% Booking Prototipo / 90% Socio Externo',
      fecha_corte: new Date().toISOString(),
    };
  }

  async getLibroMayor(limit = 20): Promise<any[]> {
    return this.libroMayorRepo.find({
      order: { fechaAsiento: 'DESC' },
      take: limit,
    });
  }
}
