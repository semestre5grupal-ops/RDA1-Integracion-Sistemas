import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface AggregateBookingView {
  cliente_id: string;
  cliente_email?: string;
  reservas_atracciones: any[];
  reservas_autos: any[];
  reservas_alojamientos: any[];
  reservas_vuelos: any[];
  total_reservas_activas: number;
}

@Injectable()
export class EsbInternalRouterService {
  private readonly logger = new Logger(EsbInternalRouterService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Sustituto oficial de SQL JOINs cross-schema (Cátedra RDA2 CE02 / CE06).
   * Consulta en paralelo a los microservicios y esquemas independientes sin
   * ejecutar JOINs relacionales prohibidos entre bases de datos distintas.
   */
  async ensamblarVistaMisReservas(clienteIdOrEmail: string): Promise<AggregateBookingView> {
    this.logger.log(`[ESB Capa Interna] Ensamblando vista agregada multivertical para ${clienteIdOrEmail} sin SQL JOINs`);

    // Consultas paralelas desacopladas a cada esquema independiente
    const [atracciones, autos, alojamientos, vuelos] = await Promise.all([
      this.dataSource.query(
        `SELECT id, status, total_price, date, time, customer_name, customer_email, voucher_qr_payload 
         FROM schema_atracciones.atracciones_reservas 
         WHERE customer_email = $1 OR cliente_id::text = $1
         ORDER BY created_at DESC LIMIT 20`,
        [clienteIdOrEmail],
      ).catch(() => []),

      this.dataSource.query(
        `SELECT id, pnr, external_order_id, estado, total, fecha_recogida, fecha_devolucion, nombre_conductor, licencia_conducir, km_salida, km_retorno, checkin_at 
         FROM schema_autos.autos_reservas 
         WHERE cliente_id::text = $1 
            OR licencia_conducir = $1 
            OR id = $1 
            OR pnr = $1 
            OR external_order_id = $1 
            OR nombre_conductor ILIKE $2
         ORDER BY created_at DESC LIMIT 20`,
        [clienteIdOrEmail, `%${clienteIdOrEmail}%`],
      ).catch(() => []),

      this.dataSource.query(
        `SELECT id, estado, precio_total, fecha_checkin, fecha_checkout, nombre_titular, habitacion_asignada, clave_acceso_digital 
         FROM schema_alojamientos.alojamientos_reservas 
         WHERE email_titular = $1 OR cliente_id::text = $1
         ORDER BY creado_en DESC LIMIT 20`,
        [clienteIdOrEmail],
      ).catch(() => []),

      this.dataSource.query(
        `SELECT id, estado, precio_total, pasajero_nombre, asiento_asignado, checkin_at 
         FROM schema_vuelos.vuelos_reservas 
         WHERE cliente_id::text = $1 OR pasajero_nombre ILIKE $2
         ORDER BY created_at DESC LIMIT 20`,
        [clienteIdOrEmail, `%${clienteIdOrEmail}%`],
      ).catch(() => []),
    ]);

    const totalActivas =
      atracciones.length + autos.length + alojamientos.length + vuelos.length;

    return {
      cliente_id: clienteIdOrEmail,
      cliente_email: clienteIdOrEmail.includes('@') ? clienteIdOrEmail : undefined,
      reservas_atracciones: atracciones,
      reservas_autos: autos,
      reservas_alojamientos: alojamientos,
      reservas_vuelos: vuelos,
      total_reservas_activas: totalActivas,
    };
  }

  /**
   * Resuelve vista unificada de factura con su detalle sin recurrir a JOINs cross-schema.
   */
  async ensamblarFacturaCompleta(facturaId: string): Promise<any> {
    const encabezados = await this.dataSource.query(
      `SELECT * FROM schema_facturacion.facturas_encabezado WHERE id = $1 LIMIT 1`,
      [facturaId],
    );

    if (!encabezados || encabezados.length === 0) {
      throw new HttpException('Factura no encontrada', HttpStatus.NOT_FOUND);
    }

    const factura = encabezados[0];
    const detalles = await this.dataSource.query(
      `SELECT * FROM schema_facturacion.facturas_detalle WHERE factura_id = $1`,
      [facturaId],
    );

    let cliente = null;
    if (factura.cliente_id) {
      const clientes = await this.dataSource.query(
        `SELECT id, nombre, email, cedula_ruc, telefono, direccion FROM schema_clientes.clientes WHERE id = $1 LIMIT 1`,
        [factura.cliente_id],
      );
      if (clientes && clientes.length > 0) {
        cliente = clientes[0];
      }
    }

    return {
      factura: {
        id: factura.id,
        numero_factura: factura.numero_factura,
        fecha_emision: factura.fecha_emision,
        subtotal: Number(factura.subtotal),
        iva_15pct: Number(factura.iva_15pct),
        total: Number(factura.total),
        estado: factura.estado,
        transaccion_pago_id: factura.transaccion_pago_id,
      },
      cliente: cliente || {
        nombre: 'Consumidor Final',
        email: 'consumidor.final@sri.gob.ec',
        cedula_ruc: '9999999999999',
      },
      items: detalles.map((d: any) => ({
        id: d.id,
        vertical: d.vertical,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: Number(d.precio_unitario),
        subtotal: Number(d.subtotal),
      })),
    };
  }
}
