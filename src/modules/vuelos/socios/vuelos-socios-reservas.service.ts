import { createHash } from 'crypto';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PagosService } from '../../pagos/pagos.service';
import { SEPARADOR_ID } from './vuelos-socios.service';
import {
  conciliacionVuelos,
  emitirFacturaVuelo,
  emitirNotaCredito,
  facturaDeReserva,
  FacturaVuelo,
  SQL_FACTURACION_VUELOS,
} from './vuelos-facturacion';

/**
 * Copia en Booking de las reservas hechas en aerolíneas socias (RDA2).
 *
 * La reserva "vive" en la aerolínea, pero Booking necesita su propia copia para:
 *  - Mis Reservas (listado del cliente sin preguntar a 5 aerolíneas),
 *  - saber quién es el dueño (protección IDOR en /bookings/{id}),
 *  - enlazar el cobro (transacción de MS_PAG) para reembolsar si algo falla.
 *
 * La tabla se crea sola al arrancar (`CREATE TABLE IF NOT EXISTS`, aditivo), y
 * el mismo SQL está en `database/migraciones/2026-11-01_vuelos_reservas_socio.sql`.
 */

export const SQL_TABLA_RESERVAS_SOCIO = `
CREATE TABLE IF NOT EXISTS public.vuelos_reservas_socio (
  booking_id        text PRIMARY KEY,
  codigo_nodo       varchar(50)  NOT NULL,
  booking_id_socio  text         NOT NULL,
  propietario_id    varchar(64)  NOT NULL,
  pnr               varchar(20),
  status            varchar(30)  NOT NULL DEFAULT 'CONFIRMED',
  origin            varchar(3),
  destination       varchar(3),
  departure_date    date,
  currency          varchar(3)   NOT NULL DEFAULT 'USD',
  grand_total       numeric(12,2) NOT NULL DEFAULT 0,
  transaccion_id    uuid,
  payment_reference varchar(80),
  reembolsado       numeric(12,2) NOT NULL DEFAULT 0,
  detalle           jsonb,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vuelos_reservas_socio_propietario
  ON public.vuelos_reservas_socio (propietario_id, created_at DESC);
`;

export interface ReservaSocio {
  bookingId: string;
  codigoNodo: string;
  propietarioId: string;
  pnr: string | null;
  status: string;
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  currency: string;
  grandTotal: number;
  transaccionId: string | null;
  paymentReference: string | null;
  reembolsado: number;
  createdAt: string;
}

export interface Cobro {
  ok: boolean;
  transaccionId?: string;
  paymentReference?: string;
  estado?: string;
  status?: number;
  detalle?: string;
  /** true si el cobro es un reintento tras un intento ya reembolsado. */
  reintento?: boolean;
}

/** Extrae datos de resumen de una reserva del contrato v2 (BookingDetail). */
export function resumenDeReserva(b: any): {
  pnr: string | null;
  status: string;
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  currency: string;
  total: number | null;
} {
  const segs: any[] = (b?.itineraries ?? []).flatMap((i: any) => i?.segments ?? []);
  const primero = segs[0];
  const ultimo = (b?.itineraries?.[0]?.segments ?? []).slice(-1)[0] ?? segs[segs.length - 1];
  const precio = b?.grandTotal ?? b?.totalPrice ?? b?.price ?? b?.lockedPrice ?? null;
  const total = parseFloat(String(precio?.total ?? ''));
  const salidaAt = primero?.departureAt ?? primero?.departure?.at;
  const salida = salidaAt ? String(salidaAt).slice(0, 10) : null;
  return {
    pnr: b?.pnr ?? null,
    status: String(b?.status ?? 'CONFIRMED'),
    origin: primero?.departureIataCode ?? primero?.departure?.iataCode ?? b?.origin ?? null,
    destination: ultimo?.arrivalIataCode ?? ultimo?.arrival?.iataCode ?? b?.destination ?? null,
    departureDate: salida ?? b?.departureDate ?? null,
    currency: precio?.currency ?? 'USD',
    total: Number.isFinite(total) ? total : null,
  };
}

@Injectable()
export class VuelosSociosReservasService implements OnModuleInit {
  private readonly logger = new Logger(VuelosSociosReservasService.name);
  private tablaLista = false;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly pagos?: PagosService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.asegurarTabla();
  }

  private async asegurarTabla(): Promise<boolean> {
    if (this.tablaLista) return true;
    try {
      if (!this.dataSource?.isInitialized) return false;
      await this.dataSource.query(SQL_TABLA_RESERVAS_SOCIO);
      this.tablaLista = true;
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] No se pudo crear vuelos_reservas_socio: ${e?.message}`);
    }
    return this.tablaLista;
  }

  // ─────────────────────────── Facturación ───────────────────────────
  private facturacionLista = false;

  /** Tablas de facturación aparte: si fallan, Mis Reservas sigue funcionando. */
  private async asegurarFacturacion(): Promise<boolean> {
    if (this.facturacionLista) return true;
    if (!(await this.asegurarTabla())) return false;
    try {
      await this.dataSource.query(SQL_FACTURACION_VUELOS);
      this.facturacionLista = true;
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] Facturación no disponible: ${e?.message}`);
    }
    return this.facturacionLista;
  }

  /** Factura + comisión + liquidación de una reserva confirmada. Nunca rompe la reserva. */
  async facturar(datos: Parameters<typeof emitirFacturaVuelo>[1]): Promise<FacturaVuelo | null> {
    if (!(await this.asegurarFacturacion())) return null;
    try {
      return await emitirFacturaVuelo(this.dataSource, datos);
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] No se emitió la factura de ${datos.bookingId}: ${e?.message}`);
      return null;
    }
  }

  async notaCredito(datos: Parameters<typeof emitirNotaCredito>[1]) {
    if (!(await this.asegurarFacturacion())) return null;
    try {
      return await emitirNotaCredito(this.dataSource, datos);
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] No se emitió la nota de crédito de ${datos.bookingId}: ${e?.message}`);
      return null;
    }
  }

  async factura(bookingId: string): Promise<FacturaVuelo | null> {
    if (!(await this.asegurarFacturacion())) return null;
    return facturaDeReserva(this.dataSource, bookingId).catch(() => null);
  }

  async conciliacion(filtros: { proveedor?: string; desde: string; hasta: string }) {
    if (!(await this.asegurarFacturacion())) return { desde: filtros.desde, hasta: filtros.hasta, totales: [], reservas: [] };
    return conciliacionVuelos(this.dataSource, filtros);
  }

  // ───────────────────────────── Pagos ─────────────────────────────
  // La referencia que viaja a la aerolínea usa el formato del contrato v2
  // (PAY-BKP-AAAAMMDD-NNNNNN): EcoAirlines la valida con ese patrón y RAM acepta
  // cualquier texto. El reembolso se hace con transaccion_id, no con este texto.

  /** Cobra en MS_PAG antes de confirmar en la aerolínea. Idempotente por clave. */
  async cobrar(monto: number, idempotencyKey: string, propietarioId: string): Promise<Cobro> {
    if (!this.pagos) return { ok: true, paymentReference: `pay_${idempotencyKey.slice(0, 18)}`, estado: 'SIN_MS_PAG' };
    try {
      const pedir = (clave: string) => this.pagos!.procesarPago(
        {
          monto: Math.round(monto * 100) / 100,
          metodo_pago: 'TARJETA_CREDITO',
          ...(/^[0-9a-f-]{36}$/i.test(propietarioId) ? { cliente_id: propietarioId } : {}),
        } as any,
        clave,
      );
      let r: any = await pedir(`vuelo-socio-${idempotencyKey}`);
      // Misma clave que un intento anterior que la aerolínea rechazó y ya se
      // reembolsó: ese intento terminó, así que el reintento es un cobro nuevo.
      // (Sin esto MS_PAG devuelve la transacción REEMBOLSADA y se respondía 402.)
      let reintento = false;
      if (r?.estado === 'REEMBOLSADO' || r?.estado === 'REEMBOLSO_PARCIAL') {
        reintento = true;
        r = await pedir(`vs-${idempotencyKey.slice(0, 40)}-r${Date.now().toString(36)}`); // <= 64 caracteres
      }
      if (r?.estado !== 'APROBADO') {
        return { ok: false, status: 402, estado: r?.estado, detalle: r?.mensaje || 'Pago rechazado.' };
      }
      return { ok: true, transaccionId: r.transaccion_id, paymentReference: referenciaPagoBooking(r.transaccion_id || idempotencyKey), estado: r.estado, reintento };
    } catch (e: any) {
      const status = e?.getStatus?.() ?? 502;
      const resp = e?.getResponse?.();
      return {
        ok: false,
        status,
        detalle: (typeof resp === 'object' ? resp?.message || resp?.detail : resp) || e?.message || 'Error en el cobro.',
      };
    }
  }

  /** Compensación (SAGA): devuelve el dinero si la aerolínea no confirmó o canceló. */
  async reembolsar(transaccionId: string, monto: number | null, motivo: string): Promise<number> {
    if (!this.pagos || !transaccionId) return 0;
    try {
      const r: any = await this.pagos.procesarReembolso(
        { transaccion_id: transaccionId, ...(monto && monto > 0 ? { monto: Math.round(monto * 100) / 100 } : {}), motivo } as any,
        `reembolso-vuelo-${transaccionId}-${monto ?? 'total'}`,
      );
      const devuelto = Number(r?.monto_reembolsado ?? r?.monto ?? monto ?? 0);
      this.logger.log(`[vuelos-socios] Reembolso ${transaccionId}: ${devuelto} (${motivo})`);
      return Number.isFinite(devuelto) ? devuelto : 0;
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] Reembolso FALLÓ ${transaccionId}: ${e?.message}`);
      return 0;
    }
  }

  // ───────────────────────────── Registro ─────────────────────────────

  async registrar(datos: {
    bookingId: string;
    codigoNodo: string;
    propietarioId: string;
    reserva: any;
    montoCobrado: number | null;
    cobro?: Cobro;
  }): Promise<void> {
    if (!(await this.asegurarTabla())) return;
    const r = resumenDeReserva(datos.reserva);
    const idSocio = datos.bookingId.split(SEPARADOR_ID).slice(1).join(SEPARADOR_ID);
    await this.dataSource.query(
      `INSERT INTO public.vuelos_reservas_socio
        (booking_id, codigo_nodo, booking_id_socio, propietario_id, pnr, status, origin, destination,
         departure_date, currency, grand_total, transaccion_id, payment_reference, detalle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (booking_id) DO UPDATE SET
         pnr = EXCLUDED.pnr, status = EXCLUDED.status, detalle = EXCLUDED.detalle, updated_at = now()`,
      [
        datos.bookingId,
        datos.codigoNodo,
        idSocio,
        datos.propietarioId,
        r.pnr,
        r.status,
        r.origin,
        r.destination,
        r.departureDate,
        r.currency,
        r.total ?? datos.montoCobrado ?? 0,
        datos.cobro?.transaccionId ?? null,
        datos.cobro?.paymentReference ?? null,
        JSON.stringify(datos.reserva ?? {}),
      ],
    );
  }

  async actualizarDesdeSocio(bookingId: string, reserva: any): Promise<void> {
    if (!(await this.asegurarTabla())) return;
    const r = resumenDeReserva(reserva);
    await this.dataSource.query(
      `UPDATE public.vuelos_reservas_socio
          SET status = $2, pnr = COALESCE($3, pnr), detalle = $4, updated_at = now()
        WHERE booking_id = $1`,
      [bookingId, r.status, r.pnr, JSON.stringify(reserva ?? {})],
    );
  }

  async marcarEstado(bookingId: string, status: string, reembolsado = 0): Promise<void> {
    if (!(await this.asegurarTabla())) return;
    await this.dataSource.query(
      `UPDATE public.vuelos_reservas_socio
          SET status = $2, reembolsado = reembolsado + $3, updated_at = now()
        WHERE booking_id = $1`,
      [bookingId, status, reembolsado],
    );
  }

  async obtener(bookingId: string): Promise<ReservaSocio | null> {
    if (!(await this.asegurarTabla())) return null;
    const filas = await this.dataSource.query(`${SELECT_BASE} WHERE booking_id = $1`, [bookingId]);
    return filas[0] ? mapear(filas[0]) : null;
  }

  async listar(propietarioId: string, filtros: { status?: string; pnr?: string; limit: number }): Promise<ReservaSocio[]> {
    if (!(await this.asegurarTabla())) return [];
    const params: any[] = [propietarioId];
    let where = 'WHERE propietario_id = $1';
    if (filtros.status) {
      params.push(filtros.status);
      where += ` AND status = $${params.length}`;
    }
    if (filtros.pnr) {
      params.push(filtros.pnr.toUpperCase());
      where += ` AND pnr = $${params.length}`;
    }
    params.push(filtros.limit);
    const filas = await this.dataSource.query(
      `${SELECT_BASE} ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return filas.map(mapear);
  }
}

const SELECT_BASE = `SELECT booking_id, codigo_nodo, propietario_id, pnr, status, origin, destination,
  to_char(departure_date, 'YYYY-MM-DD') AS departure_date, currency, grand_total, transaccion_id,
  payment_reference, reembolsado, created_at FROM public.vuelos_reservas_socio`;

function mapear(f: any): ReservaSocio {
  return {
    bookingId: f.booking_id,
    codigoNodo: f.codigo_nodo,
    propietarioId: f.propietario_id,
    pnr: f.pnr,
    status: f.status,
    origin: f.origin,
    destination: f.destination,
    departureDate: f.departure_date,
    currency: f.currency,
    grandTotal: Number(f.grand_total),
    transaccionId: f.transaccion_id,
    paymentReference: f.payment_reference,
    reembolsado: Number(f.reembolsado),
    createdAt: new Date(f.created_at).toISOString(),
  };
}

/**
 * Referencia de pago para la aerolínea: PAY-BKP-AAAAMMDD-NNNNNN (fecha de Ecuador).
 * Se deriva de la transacción de MS_PAG, así un reintento con la misma clave de
 * idempotencia produce la misma referencia.
 */
export function referenciaPagoBooking(semilla: string, ahora = new Date()): string {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ahora)
    .replace(/-/g, '');
  const numero = parseInt(createHash('sha256').update(String(semilla)).digest('hex').slice(0, 12), 16) % 1_000_000;
  return `PAY-BKP-${fecha}-${String(numero).padStart(6, '0')}`;
}
