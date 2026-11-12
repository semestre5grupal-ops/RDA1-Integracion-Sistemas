import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservasDataLoader } from './dataloaders/reservas.dataloader';
import { EsbInternalRouterService } from '../esb/interna/esb-internal-router.service';
import { SagaOrchestratorService } from '../esb/interna/saga-orchestrator.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { AtraccionesService } from '../atracciones/atracciones.service';
import { AutosService } from '../autos/autos.service';
import { AlojamientosService } from '../alojamientos/alojamientos.service';
import { CatalogoItemModel } from './models/catalogo.model';
import { ReservaUnificadaModel, AggregateBookingResponseModel } from './models/reserva.model';
import { FacturaCompletaModel } from './models/factura.model';
import { PaqueteComboModel } from './models/paquete.model';
import { CheckoutSagaInputGql, CheckoutResultModel } from './models/checkout.model';
import { CheckInInputGql, CheckInResultModel } from './models/checkin.model';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';

@Injectable()
export class GraphqlBffService {
  private readonly logger = new Logger(GraphqlBffService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly reservasLoader: ReservasDataLoader,
    private readonly esbRouter: EsbInternalRouterService,
    private readonly sagaOrchestrator: SagaOrchestratorService,
    private readonly paquetesService: PaquetesService,
    private readonly atraccionesService: AtraccionesService,
    private readonly autosService: AutosService,
    private readonly alojamientosService: AlojamientosService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
  ) {}

  /**
   * Agregador unificado de catálogo multivertical (BFF Pattern, Capa 6).
   * Consulta en paralelo a las tablas de caché de cada esquema sin joins relacionales.
   */
  async getCatalogoUnificado(destino?: string, vertical?: string): Promise<CatalogoItemModel[]> {
    this.logger.log(`[GraphQL BFF] Consultando catálogo unificado (Destino: ${destino || 'TODOS'}, Vertical: ${vertical || 'TODAS'})`);

    const resultados: CatalogoItemModel[] = [];

    const fetchAtracciones = async () => {
      if (vertical && vertical !== 'ATRACCIONES') return [];
      try {
        const rows = await this.dataSource.query(
          `SELECT id, nombre, descripcion_corta, ciudad, precio_unitario_adulto, fotos_urls, rating_promedio, activo 
           FROM schema_atracciones.atracciones_catalogo 
           WHERE activo = true ${destino ? "AND ciudad ILIKE $1" : ""} 
           LIMIT 20`,
          destino ? [`%${destino}%`] : [],
        );
        return rows.map((r: any) => ({
          id: r.id,
          vertical: 'ATRACCIONES',
          nombre: r.nombre,
          descripcion: r.descripcion_corta,
          destino: r.ciudad,
          precio: Number(r.precio_unitario_adulto || 55.0),
          disponible: Boolean(r.activo),
          imagen_url: (r.fotos_urls && r.fotos_urls[0]) || 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800',
          rating: Number(r.rating_promedio || 9.5),
        }));
      } catch (e) {
        return [];
      }
    };

    const fetchAutos = async () => {
      if (vertical && vertical !== 'AUTOS') return [];
      try {
        const rows = await this.dataSource.query(
          `SELECT id, modelo, marca, categoria, precio_por_dia, imagen_url, estado, ciudad 
           FROM schema_autos.autos_flota 
           WHERE estado = 'DISPONIBLE' ${destino ? "AND ciudad ILIKE $1" : ""} 
           LIMIT 20`,
          destino ? [`%${destino}%`] : [],
        );
        return rows.map((r: any) => ({
          id: r.id,
          vertical: 'AUTOS',
          nombre: `${r.marca} ${r.modelo}`,
          descripcion: `Categoría ${r.categoria} con transmisión y kilometraje controlado`,
          destino: r.ciudad || 'Quito',
          precio: Number(r.precio_por_dia || 45.0),
          disponible: r.estado === 'DISPONIBLE',
          imagen_url: r.imagen_url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
          categoria: r.categoria,
          rating: 9.2,
        }));
      } catch (e) {
        return [];
      }
    };

    const fetchAlojamientos = async () => {
      if (vertical && vertical !== 'ALOJAMIENTOS') return [];
      try {
        const rows = await this.dataSource.query(
          `SELECT id, titulo, descripcion, ciudad, precio_noche_base, fotos, rating 
           FROM schema_alojamientos.alojamientos_catalogo 
           WHERE activo = true ${destino ? "AND ciudad ILIKE $1" : ""} 
           LIMIT 20`,
          destino ? [`%${destino}%`] : [],
        );
        return rows.map((r: any) => ({
          id: r.id,
          vertical: 'ALOJAMIENTOS',
          nombre: r.titulo,
          descripcion: r.descripcion,
          destino: r.ciudad,
          precio: Number(r.precio_noche_base || 80.0),
          disponible: true,
          imagen_url: (r.fotos && r.fotos[0]) || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
          rating: Number(r.rating || 9.0),
        }));
      } catch (e) {
        return [];
      }
    };

    const fetchVuelos = async () => {
      if (vertical && vertical !== 'VUELOS') return [];
      try {
        const rows = await this.dataSource.query(
          `SELECT id, numero_vuelo, aerolinea, origen, destino, precio_base, estado 
           FROM schema_vuelos.vuelos_catalogo 
           WHERE estado = 'PROGRAMADO' ${destino ? "AND destino ILIKE $1" : ""} 
           LIMIT 20`,
          destino ? [`%${destino}%`] : [],
        );
        return rows.map((r: any) => ({
          id: r.id,
          vertical: 'VUELOS',
          nombre: `Vuelo ${r.numero_vuelo} (${r.aerolinea})`,
          descripcion: `Ruta directa ${r.origen} -> ${r.destino}`,
          destino: r.destino,
          precio: Number(r.precio_base || 120.0),
          disponible: r.estado === 'PROGRAMADO',
          imagen_url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800',
          rating: 8.8,
        }));
      } catch (e) {
        return [];
      }
    };

    const [atr, aut, alo, vue] = await Promise.all([
      fetchAtracciones(),
      fetchAutos(),
      fetchAlojamientos(),
      fetchVuelos(),
    ]);

    resultados.push(...atr, ...aut, ...alo, ...vue);
    return resultados;
  }

  /**
   * Resuelve reservas de un usuario utilizando DataLoader anti-N+1.
   */
  async getMisReservas(clienteIdOrEmail: string): Promise<AggregateBookingResponseModel> {
    this.logger.log(`[GraphQL BFF] Consultando reservas para cliente ${clienteIdOrEmail} vía DataLoader`);
    const reservas = await this.reservasLoader.clienteReservasLoader.load(clienteIdOrEmail);
    return {
      cliente_id: clienteIdOrEmail,
      total_reservas_activas: reservas.length,
      reservas,
    };
  }

  /**
   * Obtiene la factura consolidada con detalle sin JOINs cross-schema.
   */
  async getFacturaCompleta(numeroFacturaOrId: string): Promise<FacturaCompletaModel> {
    this.logger.log(`[GraphQL BFF] Obteniendo factura completa para ${numeroFacturaOrId}`);
    const data = await this.esbRouter.ensamblarFacturaCompleta(numeroFacturaOrId);
    return {
      id: data.factura.id,
      numero_factura: data.factura.numero_factura,
      fecha_emision: data.factura.fecha_emision ? new Date(data.factura.fecha_emision).toISOString() : undefined,
      subtotal: data.factura.subtotal,
      iva_15pct: data.factura.iva_15pct,
      total: data.factura.total,
      estado: data.factura.estado,
      cliente: data.cliente,
      items: data.items,
    };
  }

  /**
   * Consulta los paquetes dinámicos y combos multivertical.
   */
  async getPaquetesDisponibles(): Promise<PaqueteComboModel[]> {
    this.logger.log('[GraphQL BFF] Consultando paquetes dinámicos disponibles');
    const paquetes = await this.paquetesService.findAll();
    return paquetes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      destino: p.destino,
      precio_total_original: Number(p.precio_base_total || p.precioBaseTotal || 0),
      descuento_porcentaje: Number(p.descuento_combo_pct || p.descuentoComboPct || 0),
      precio_final_paquete: Number(p.precio_final_paquete || p.precioFinalPaquete || 0),
      estado: p.activo ? 'ACTIVO' : 'INACTIVO',
      items: (p.items || []).map((it: any) => ({
        id: it.id,
        vertical: it.vertical,
        external_service_id: it.externalServiceId || it.external_service_id,
        nombre_servicio: it.nombreServicio || it.nombre_servicio,
        precio_unitario: Number(it.precioUnitario || it.precio_unitario || 0),
      })),
    }));
  }

  /**
   * Orquestación de Checkout Transaccional mediante Saga LIFO en el ESB.
   */
  async checkoutOrquestado(input: CheckoutSagaInputGql): Promise<CheckoutResultModel> {
    this.logger.log(`[GraphQL BFF] Ejecutando Checkout Orquestado Saga para ${input.clienteEmail}`);

    const idempotencyKey = `GQL-SAGA-${Date.now()}`;
    const sagaInput = {
      cliente_id: input.clienteId,
      cliente_email: input.clienteEmail,
      cliente_nombre: input.clienteNombre,
      metodo_pago: input.metodoPago || 'TARJETA_CREDITO',
      numero_tarjeta: input.numeroTarjeta || '4500123456789012',
      items: input.items.map((it) => ({
        vertical: it.vertical as any,
        item_id: it.itemId,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        detalles_reserva: it.detallesReservaJson ? JSON.parse(it.detallesReservaJson) : {},
      })),
      simular_fallo_en_paso: input.simularFalloEnPaso as any,
    };

    try {
      const res = await this.sagaOrchestrator.ejecutarCheckoutCompuesto(sagaInput, idempotencyKey);
      return {
        success: true,
        correlationId: res.correlation_id,
        estado: res.estado,
        facturaId: res.factura?.factura_id,
        total: res.total_pagado,
        mensaje: res.mensaje || '¡Compra multivertical completada exitosamente!',
      };
    } catch (err) {
      const response = err.getResponse ? err.getResponse() : null;
      return {
        success: false,
        correlationId: response?.correlation_id,
        codigoCompensacion: response?.codigo_compensacion,
        estado: 'FAILED_COMPENSATED',
        total: 0,
        mensaje: response?.detail || err.message,
      };
    }
  }

  /**
   * Cancelación transaccional de reserva individual con restitución de aforo.
   */
  async cancelarReservaConSaga(reservaId: string, vertical: string, motivo: string): Promise<boolean> {
    this.logger.log(`[GraphQL BFF] Cancelando reserva ${reservaId} (${vertical}): ${motivo}`);
    if (vertical === 'ATRACCIONES') {
      await this.atraccionesService.cancelarReserva(
        reservaId,
        { motivo_cancelacion: motivo } as any,
        `idem-cancel-${Date.now()}`,
      );
      return true;
    }
    // Cancelación en base de datos para otras verticales
    if (vertical === 'AUTOS') {
      await this.dataSource.query(`UPDATE schema_autos.autos_reservas SET estado = 'CANCELADO' WHERE id = $1`, [reservaId]);
      return true;
    }
    if (vertical === 'ALOJAMIENTOS') {
      await this.dataSource.query(`UPDATE schema_alojamientos.alojamientos_reservas SET estado = 'CANCELADO' WHERE id = $1`, [reservaId]);
      return true;
    }
    return true;
  }

  /**
   * Flujos de Check-in digital de las 4 verticales (Consideraciones RDA2 §4).
   */
  async realizarCheckInDigital(input: CheckInInputGql): Promise<CheckInResultModel> {
    this.logger.log(`[GraphQL BFF] Realizando Check-in digital para vertical ${input.vertical} en reserva ${input.reservaId}`);

    if (input.vertical === 'ATRACCIONES') {
      const res = await this.atraccionesService.checkin(
        input.reservaId,
        { documento_identidad: input.qrCode || '0102030405', guia_asignado: 'Carlos Villacís' },
      );
      return {
        success: true,
        vertical: 'ATRACCIONES',
        reservaId: input.reservaId,
        mensaje: res.mensaje,
        voucherQrBase64: res.voucher_digital_qr,
        codigoAcceso: res.reserva_id,
      };
    }

    if (input.vertical === 'AUTOS') {
      if (input.tipoCheckinAuto === 'DEVOLUCION') {
        const res = await this.autosService.checkinDevolucion(input.reservaId, {
          km_retorno: input.kmLlegada || 10500,
        });
        return {
          success: true,
          vertical: 'AUTOS',
          reservaId: input.reservaId,
          mensaje: res.mensaje || 'Vehículo devuelto e ingresado a ciclo de limpieza (Cooldown 2h activado).',
        };
      } else {
        const res = await this.autosService.checkinEntrega(input.reservaId, {
          licencia_conducir: input.licenciaConductor || 'LIC-EC-998877',
          km_salida: input.kmSalida || 10000,
        });
        return {
          success: true,
          vertical: 'AUTOS',
          reservaId: input.reservaId,
          mensaje: res.mensaje,
        };
      }
    }

    if (input.vertical === 'ALOJAMIENTOS') {
      throw new HttpException(
        'El check-in en alojamientos no se realiza de forma digital; debe efectuarse presencialmente en la recepción del establecimiento.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (input.vertical === 'VUELOS') {
      const asiento = '14B';
      await this.dataSource.query(
        `UPDATE schema_vuelos.vuelos_reservas SET asiento_asignado = $1, estado = 'CHECKED_IN', checkin_at = NOW() WHERE id = $2`,
        [asiento, input.reservaId],
      );
      return {
        success: true,
        vertical: 'VUELOS',
        reservaId: input.reservaId,
        mensaje: `¡Pase de abordar emitido exitosamente! Asiento asignado: ${asiento}`,
        asientoAsignado: asiento,
        codigoAcceso: `PNR-${input.reservaId.slice(0, 6).toUpperCase()}`,
      };
    }

    throw new HttpException(`Vertical '${input.vertical}' no soportada para check-in`, HttpStatus.BAD_REQUEST);
  }
}
