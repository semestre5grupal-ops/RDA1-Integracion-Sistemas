import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AlojamientosSociosService, OpcionSocio } from './alojamientos-socios.service';
import { CodigoProblema, conflicto, validacion } from '../../../core/errors/codigo-error';
import { ConfigProveedor } from '../../nodes/entities/config-proveedor.entity';

/**
 * Reservas de alojamientos de SOCIOS hechas desde Booking (Saga hacia el socio).
 *
 * El socio es la fuente de verdad: la reserva existe cuando el socio la confirma
 * (`POST /alojamientos/orders/create` → 201). Booking guarda una COPIA para Mis
 * Reservas, la cancelación y el check-in, en estado `RESERVADO` (pendiente de
 * asistencia física) hasta que el socio notifica el check-in
 * (`CONFIRMADO_ASISTIDO`).
 *
 * ── Concurrencia e idempotencia ─────────────────────────────────────────────
 *  - La Idempotency-Key del cliente es la MISMA que se envía al socio: un doble
 *    clic o un reintento devuelve la misma orden del socio (Idempotent-Replayed).
 *  - Dentro de una instancia, las peticiones con la misma clave se serializan.
 *    Entre instancias, `idempotency_key` es UNIQUE en la copia: si dos llegan a
 *    guardar, la segunda lee la primera.
 *  - «La última habitación» la decide el socio (409 OUT_OF_STOCK → 409 aquí).
 *  - Timeout o 5xx: antes de dar la compra por fallida se pregunta al socio
 *    (`GET /alojamientos/orders?idempotency_key=…`, contrato §3).
 *  - Si el socio confirmó pero la copia no se pudo guardar, se compensa
 *    cancelando en el socio (SAGA_ORCHESTRATOR, reembolso 100 %).
 */

export const ESTADO_RESERVADO = 'RESERVADO';
export const ESTADO_CANCELADO = 'CANCELADO';
export const ESTADO_ASISTIDO = 'CONFIRMADO_ASISTIDO';

const TABLA = 'schema_alojamientos.alojamientos_reservas_socio';

export const SQL_TABLA_RESERVAS_SOCIO = `
CREATE TABLE IF NOT EXISTS ${TABLA} (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_reserva        varchar(20) UNIQUE NOT NULL,
  codigo_nodo           varchar(60) NOT NULL,
  alojamiento_id_socio  varchar(100) NOT NULL,
  alojamiento_nombre    varchar(255),
  destino               varchar(150),
  foto_url              text,
  tipo_codigo           varchar(80) NOT NULL,
  tipo_nombre           varchar(150),
  plan_tarifa           varchar(60),
  checkin               date NOT NULL,
  checkout              date NOT NULL,
  noches                int NOT NULL,
  habitaciones          int NOT NULL DEFAULT 1,
  adultos               int NOT NULL DEFAULT 1,
  ninos                 int NOT NULL DEFAULT 0,
  total                 numeric(10,2),
  moneda                varchar(3) DEFAULT 'USD',
  estado                varchar(30) NOT NULL DEFAULT '${ESTADO_RESERVADO}',
  order_id_socio        varchar(100),
  external_order_id     varchar(100),
  codigo_reserva_socio  varchar(100),
  idempotency_key       varchar(255) UNIQUE NOT NULL,
  usuario_id            uuid,
  cliente_nombre        varchar(150) NOT NULL,
  cliente_email         varchar(150),
  cliente_telefono      varchar(40),
  documento_tipo        varchar(20),
  documento_numero      varchar(30),
  external_client_id    varchar(120),
  peticiones_especiales text,
  motivo_cancelacion    varchar(500),
  codigo_reembolso      varchar(60),
  monto_reembolsado     numeric(10,2),
  cancelada_en          timestamptz,
  checkin_at            timestamptz,
  checkin_admin         varchar(120),
  correlation_id        varchar(120),
  respuesta_socio       jsonb,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alo_res_socio_usuario ON ${TABLA}(usuario_id);
CREATE INDEX IF NOT EXISTS idx_alo_res_socio_email   ON ${TABLA}(lower(cliente_email));
CREATE INDEX IF NOT EXISTS idx_alo_res_socio_orden   ON ${TABLA}(codigo_nodo, order_id_socio);`;

export interface DatosReservaSocio {
  idCompuesto: string;
  checkin: string;
  checkout: string;
  habitaciones: number;
  adultos: number;
  ninos: number;
  productId?: string | null;
  nombre: string;
  email: string;
  telefono?: string | null;
  documentoTipo?: string | null;
  documentoNumero?: string | null;
  peticiones?: string | null;
  idempotencyKey: string;
  usuarioId?: string | null;
  correlationId?: string;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const desempacar = (b: any) => (b && typeof b === 'object' && b.data && !Array.isArray(b.data) ? b.data : b);
const dinero = (v: unknown): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
};
const fecha = (v: any): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

@Injectable()
export class AlojamientosSociosReservasService implements OnModuleInit {
  private readonly logger = new Logger(AlojamientosSociosReservasService.name);
  private tablaLista = false;
  /** Peticiones en curso por Idempotency-Key (serializa el doble clic en esta instancia). */
  private readonly enCurso = new Map<string, Promise<any>>();

  constructor(
    private readonly socios: AlojamientosSociosService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.asegurarTabla();
  }

  async asegurarTabla(): Promise<boolean> {
    if (this.tablaLista) return true;
    try {
      if (!this.dataSource?.isInitialized) return false;
      await this.dataSource.query(SQL_TABLA_RESERVAS_SOCIO);
      this.tablaLista = true;
    } catch (e: any) {
      this.logger.error(`[alojamientos-socios] No se pudo crear ${TABLA}: ${e?.message}`);
    }
    return this.tablaLista;
  }

  private async q(sql: string, params: any[] = []): Promise<any[]> {
    if (!(await this.asegurarTabla())) {
      throw new HttpException('Las reservas de socios no están disponibles (base de datos).', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.dataSource!.query(sql, params);
  }

  // ───────────────────────────── Consultas ─────────────────────────────

  async porId(id: string): Promise<any | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    if (!(await this.asegurarTabla())) return null;
    const [fila] = await this.dataSource!.query(`SELECT * FROM ${TABLA} WHERE id = $1`, [id]);
    return fila ?? null;
  }

  private async porClave(clave: string): Promise<any | null> {
    const [fila] = await this.q(`SELECT * FROM ${TABLA} WHERE idempotency_key = $1`, [clave]);
    return fila ?? null;
  }

  /** Mis Reservas: por cuenta, o por correo si se reservó sin sesión. Admin ve todas. */
  async listar(usuario: { id?: string | null; email?: string | null } | null, verTodas: boolean): Promise<any[]> {
    if (!(await this.asegurarTabla())) return [];
    if (verTodas) return this.dataSource!.query(`SELECT * FROM ${TABLA} ORDER BY creado_en DESC LIMIT 500`);
    const email = (usuario?.email || '').trim().toLowerCase();
    if (!usuario?.id && !email) return [];
    return this.dataSource!.query(
      `SELECT * FROM ${TABLA}
        WHERE ($1::uuid IS NOT NULL AND usuario_id = $1::uuid)
           OR (usuario_id IS NULL AND $2 <> '' AND lower(cliente_email) = $2)
        ORDER BY creado_en DESC`,
      [usuario?.id || null, email],
    );
  }

  // ───────────────────────────── Reservar ─────────────────────────────

  async reservar(d: DatosReservaSocio): Promise<any> {
    const previa = this.enCurso.get(d.idempotencyKey);
    if (previa) {
      await previa.catch(() => undefined);
      const hecha = await this.porClave(d.idempotencyKey);
      if (hecha) return { ...this.respuesta(hecha), idempotent_replayed: true };
    }
    const p = this.reservarSinCandado(d);
    this.enCurso.set(d.idempotencyKey, p);
    try {
      return await p;
    } finally {
      if (this.enCurso.get(d.idempotencyKey) === p) this.enCurso.delete(d.idempotencyKey);
    }
  }

  private validar(d: DatosReservaSocio): void {
    const errores: { name: string; reason: string }[] = [];
    if (!d.nombre?.trim()) errores.push({ name: 'customer_name', reason: 'Nombre del titular obligatorio.' });
    if (!d.email || !RE_EMAIL.test(d.email.trim())) errores.push({ name: 'customer_email', reason: 'El hotel necesita un correo válido del titular.' });
    if (!d.documentoNumero?.trim()) {
      errores.push({ name: 'documento_numero', reason: 'El hotel exige el número de documento del titular (cédula, pasaporte o RUC).' });
    }
    if (d.documentoTipo && !['CEDULA', 'PASAPORTE', 'RUC'].includes(d.documentoTipo)) {
      errores.push({ name: 'documento_tipo', reason: 'Debe ser CEDULA, PASAPORTE o RUC.' });
    }
    if (errores.length) throw validacion('Faltan datos del titular para reservar en el hotel.', errores);
  }

  private async reservarSinCandado(d: DatosReservaSocio): Promise<any> {
    // 0. Reintento con la misma clave: la misma reserva (no se vuelve a pedir al socio).
    const existente = await this.porClave(d.idempotencyKey);
    if (existente) return { ...this.respuesta(existente), idempotent_replayed: true };

    this.validar(d);
    const correlationId = d.correlationId || `corr-alo-${randomUUID()}`;

    // 1. Disponibilidad real del socio y elección del tipo (el más barato que cabe si no se indica).
    const disp = await this.socios.opciones(d.idCompuesto, d.checkin, d.checkout, d.adultos);
    if (!disp) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    const { nodo, idSocio, opciones, respuesta } = disp;
    if (respuesta.status !== 200) this.errorDelSocio(respuesta, nodo, 'consultar la disponibilidad');
    const opcion = this.elegirOpcion(opciones, d);

    // 2. Cliente cross-platform (Flujo 2): ficha del huésped en el socio, sin duplicarla.
    const identificacion = d.documentoNumero!.trim();
    const cliente = await this.socios.sincronizarCliente(
      nodo,
      { nombre: d.nombre.trim(), email: d.email.trim().toLowerCase(), identificacion, telefono: d.telefono },
      correlationId,
    );
    await this.guardarMapeoCliente(d.usuarioId, nodo.codigoNodo, cliente.clientId, cliente.origen);

    // 3. Cotización con precio congelado.
    const ocupantes = { adultos: d.adultos, ninos: d.ninos };
    const cot = await this.socios.llamar(nodo, 'POST', '/alojamientos/availability', {
      correlationId,
      body: {
        alojamientoId: idSocio,
        tipoHabitacionCodigo: opcion.codigo,
        fechaInicio: d.checkin,
        fechaFin: d.checkout,
        cantidadHabitaciones: d.habitaciones,
        ocupantes,
        ...(opcion.plan ? { planTarifaCodigo: opcion.plan } : {}),
      },
    });
    if (cot.status !== 200) this.errorDelSocio(cot, nodo, 'cotizar');
    const c = desempacar(cot.body) || {};
    const total = dinero(c.precioTotalCotizado ?? c.totalPagar ?? c.desglosePrecio?.totalPagar);
    if (!total) throw new HttpException(`El hotel ${nodo.nombreProveedor} no devolvió un precio.`, HttpStatus.BAD_GATEWAY);

    // 4. Orden en el socio con la MISMA Idempotency-Key del cliente.
    const cuerpoOrden: Record<string, any> = {
      alojamientoId: idSocio,
      tipoHabitacionCodigo: opcion.codigo,
      fechaInicio: d.checkin,
      fechaFin: d.checkout,
      cantidadHabitaciones: d.habitaciones,
      ocupantes,
      totalPagar: total,
      ...(c.cotizacionId ? { cotizacionId: c.cotizacionId } : {}),
      ...(opcion.plan ? { planTarifaCodigo: opcion.plan } : {}),
      huespedTitular: {
        nombreCompleto: d.nombre.trim(),
        tipoDocumento: d.documentoTipo || 'CEDULA',
        identificacion,
        email: d.email.trim().toLowerCase(),
        ...(d.telefono ? { telefono: d.telefono.replace(/[^\d+]/g, '') } : {}),
      },
      ...(d.peticiones ? { peticionesEspeciales: d.peticiones.slice(0, 1000) } : {}),
    };
    const extra: Record<string, string> = cliente.clientId ? { 'X-Client-Id': cliente.clientId } : {};
    let orden = await this.socios.llamar(nodo, 'POST', '/alojamientos/orders/create', {
      body: cuerpoOrden,
      idempotencyKey: d.idempotencyKey,
      correlationId,
      extra,
    });

    // 4b. Sin respuesta o 5xx: ¿llegó a crearse? (contrato §3, recuperación tras timeout)
    if (orden.status === 0 || orden.status >= 500) {
      const rec = await this.socios.llamar(nodo, 'GET', `/alojamientos/orders?idempotency_key=${encodeURIComponent(d.idempotencyKey)}`, { correlationId });
      const lista = rec.status === 200 ? (Array.isArray(rec.body) ? rec.body : rec.body?.data || rec.body?.orders || []) : [];
      const viva = lista.find((o: any) => String(o?.estado || o?.status || '').toUpperCase() !== 'CANCELLED');
      if (viva) orden = { ...orden, status: 201, body: viva };
    }
    if (orden.status !== 200 && orden.status !== 201) this.errorDelSocio(orden, nodo, 'crear la reserva');

    const o = desempacar(orden.body) || {};
    const ref = {
      orderId: o.orderId ?? o.ordenId ?? o.id ?? null,
      externalOrderId: o.external_order_id ?? o.externalOrderId ?? null,
      codigoReserva: o.codigoReserva ?? o.codigo_reserva ?? null,
      total: dinero(o.total ?? o.totalPagar) ?? total,
    };
    if (!ref.orderId && !ref.externalOrderId && !ref.codigoReserva) {
      throw new HttpException(`El hotel ${nodo.nombreProveedor} confirmó sin identificador de reserva.`, HttpStatus.BAD_GATEWAY);
    }

    // 5. Copia local. Si falla, se compensa en el socio para no dejar una reserva huérfana.
    const hotel = await this.socios.detalle(d.idCompuesto).catch(() => null);
    try {
      const fila = await this.insertarCopia(d, nodo, idSocio, opcion, ref, cliente.clientId, correlationId, hotel, o);
      this.socios.invalidarCatalogo();
      this.logger.log(`[alojamientos-socios] ${nodo.codigoNodo} confirmó ${ref.codigoReserva || ref.orderId} → Booking ${fila.codigo_reserva} (RESERVADO)`);
      return this.respuesta(fila);
    } catch (e: any) {
      // Carrera entre instancias con la misma clave: la otra ya guardó la copia.
      const ganadora = await this.porClave(d.idempotencyKey).catch(() => null);
      if (ganadora) return { ...this.respuesta(ganadora), idempotent_replayed: true };
      this.logger.error(`[alojamientos-socios] Copia local falló (${e?.message}); compensando en ${nodo.codigoNodo}`);
      const ref2 = ref.orderId || ref.externalOrderId || ref.codigoReserva;
      const comp = await this.socios.llamar(nodo, 'POST', `/alojamientos/orders/${encodeURIComponent(ref2)}/cancel`, {
        idempotencyKey: randomUUID(),
        correlationId,
        body: { motivo: 'Compensación Saga: Booking no pudo registrar la reserva', solicitadoPor: 'SAGA_ORCHESTRATOR' },
      });
      throw new HttpException(
        comp.status === 200
          ? 'No se pudo registrar la reserva; se anuló en el hotel y no se cobró nada. Inténtalo de nuevo.'
          : 'No se pudo registrar la reserva y la anulación en el hotel falló: contacta a soporte.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private elegirOpcion(opciones: OpcionSocio[], d: DatosReservaSocio): OpcionSocio {
    const pedido = AlojamientosSociosService.separarProducto(d.productId);
    const caben = (o: OpcionSocio) =>
      (o.capacidadAdultos === null || d.adultos <= o.capacidadAdultos * d.habitaciones) &&
      (o.capacidadNinos === null || d.ninos === 0 || d.ninos <= o.capacidadNinos * d.habitaciones);
    let candidatas = opciones;
    if (pedido) {
      candidatas = opciones.filter((o) => o.codigo === pedido.codigo && (!pedido.plan || o.plan === pedido.plan));
      if (!candidatas.length) {
        throw validacion('Ese tipo de habitación no está a la venta en este alojamiento.', [
          { name: 'tipo_habitacion_id', reason: `'${d.productId}' no es una opción del hotel para esas fechas.` },
        ]);
      }
    }
    const conCapacidad = candidatas.filter(caben);
    if (!conCapacidad.length) {
      throw validacion('La ocupación no cabe en las habitaciones elegidas.', [
        { name: 'adultos', reason: 'Elige más habitaciones u otro tipo con más capacidad.' },
      ]);
    }
    const conCupo = conCapacidad.filter((o) => o.disponible && o.remanentes >= d.habitaciones).sort((a, b) => (a.precioTotal ?? 0) - (b.precioTotal ?? 0));
    if (!conCupo.length) {
      const libres = Math.max(0, ...conCapacidad.map((o) => o.remanentes));
      throw conflicto(
        CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
        `El hotel ya no tiene suficientes habitaciones para esas fechas. Disponibles: ${libres}, solicitadas: ${d.habitaciones}.`,
      );
    }
    return conCupo[0];
  }

  /** Traduce la respuesta de error del socio al contrato de Booking. Nunca devuelve. */
  private errorDelSocio(r: { status: number; body: any; error?: string }, nodo: ConfigProveedor, accion: string): never {
    const code = String(r.body?.code || r.body?.codigo || '').toUpperCase();
    const detalle = r.body?.detail || r.body?.message || r.body?.title || '';
    const quien = nodo.nombreProveedor;
    if (r.status === 0) throw new HttpException(`El hotel ${quien} no respondió al ${accion} (${r.error}). No se reservó nada.`, HttpStatus.GATEWAY_TIMEOUT);
    if (r.status === 404) throw new HttpException(`El hotel ${quien} no encontró el alojamiento o la habitación.`, HttpStatus.NOT_FOUND);
    if (r.status === 409) {
      if (code === 'PRICE_MISMATCH' || code === 'QUOTE_EXPIRED') {
        throw conflicto(CodigoProblema.PRICE_CHANGED, `El precio cambió en el hotel ${quien}. Vuelve a consultar la disponibilidad.`);
      }
      if (code.startsWith('IDEMPOTENCY')) {
        throw conflicto(CodigoProblema.BOOKING_NOT_CONFIRMED, 'Esta reserva ya se está procesando; espera unos segundos.');
      }
      throw conflicto(CodigoProblema.ROOM_NO_LONGER_AVAILABLE, `El hotel ${quien} ya no tiene esa habitación para esas fechas.${detalle ? ` (${detalle})` : ''}`);
    }
    if (r.status === 400 || r.status === 422) {
      const params = Array.isArray(r.body?.invalidParams) ? r.body.invalidParams : [];
      throw validacion(`El hotel ${quien} rechazó los datos: ${detalle || code || 'datos inválidos'}.`, params);
    }
    if (r.status === 401 || r.status === 403) {
      this.logger.error(`[alojamientos-socios] ${nodo.codigoNodo} rechazó las credenciales de Booking (HTTP ${r.status}) al ${accion}`);
      throw new HttpException(`El hotel ${quien} rechazó las credenciales de Booking. No se reservó nada.`, HttpStatus.BAD_GATEWAY);
    }
    if (r.status === 429) throw new HttpException(`El hotel ${quien} está saturado; inténtalo en unos segundos.`, HttpStatus.SERVICE_UNAVAILABLE);
    throw new HttpException(`El hotel ${quien} falló al ${accion} (HTTP ${r.status}). No se reservó nada.`, HttpStatus.BAD_GATEWAY);
  }

  private async insertarCopia(
    d: DatosReservaSocio,
    nodo: ConfigProveedor,
    idSocio: string,
    opcion: OpcionSocio,
    ref: { orderId: any; externalOrderId: any; codigoReserva: any; total: string | null },
    clientId: string | null,
    correlationId: string,
    hotel: any,
    crudo: any,
  ): Promise<any> {
    const noches = Math.round((Date.parse(`${d.checkout}T12:00:00Z`) - Date.parse(`${d.checkin}T12:00:00Z`)) / 86_400_000);
    const codigo = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
    const [fila] = await this.q(
      `INSERT INTO ${TABLA} (
         codigo_reserva, codigo_nodo, alojamiento_id_socio, alojamiento_nombre, destino, foto_url,
         tipo_codigo, tipo_nombre, plan_tarifa, checkin, checkout, noches, habitaciones, adultos, ninos,
         total, moneda, estado, order_id_socio, external_order_id, codigo_reserva_socio, idempotency_key,
         usuario_id, cliente_nombre, cliente_email, cliente_telefono, documento_tipo, documento_numero,
         external_client_id, peticiones_especiales, correlation_id, respuesta_socio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
       RETURNING *`,
      [
        codigo, nodo.codigoNodo, idSocio, hotel?.nombre ?? null, hotel?.destino ?? null, hotel?.photos?.[0]?.url ?? null,
        opcion.codigo, opcion.nombre, opcion.plan, d.checkin, d.checkout, noches, d.habitaciones, d.adultos, d.ninos,
        ref.total, crudo?.currency || 'USD', ESTADO_RESERVADO, ref.orderId, ref.externalOrderId, ref.codigoReserva, d.idempotencyKey,
        d.usuarioId || null, d.nombre.trim(), d.email.trim().toLowerCase(), d.telefono || null, d.documentoTipo || 'CEDULA',
        d.documentoNumero, clientId, d.peticiones || null, correlationId, JSON.stringify(crudo ?? {}),
      ],
    );
    return fila;
  }

  /** Mapeo Booking ↔ socio (schema_clientes.clientes_socios_mapeo). Nunca rompe la reserva. */
  private async guardarMapeoCliente(usuarioId: string | null | undefined, codigoNodo: string, clientId: string | null, origen: string) {
    if (!usuarioId || !clientId || !this.dataSource?.isInitialized) return;
    try {
      await this.dataSource.query(
        `INSERT INTO schema_clientes.clientes_socios_mapeo (cliente_id, codigo_nodo, external_client_id, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cliente_id, codigo_nodo) DO UPDATE SET external_client_id = EXCLUDED.external_client_id, updated_at = now()`,
        [usuarioId, codigoNodo, clientId, JSON.stringify({ origen, vertical: 'ALOJAMIENTOS' })],
      );
    } catch (e: any) {
      this.logger.warn(`[alojamientos-socios] No se guardó el mapeo de cliente con ${codigoNodo}: ${e?.message}`);
    }
  }

  // ───────────────────────────── Cancelar ─────────────────────────────

  async cancelar(id: string, motivo?: string, correlationId?: string): Promise<any> {
    const fila = await this.porId(id);
    if (!fila) return null;
    if (fila.estado === ESTADO_CANCELADO) return { ...this.respuesta(fila), ya_cancelada: true };
    if (fila.estado === ESTADO_ASISTIDO) {
      throw conflicto(CodigoProblema.CANCELLATION_NOT_ALLOWED, 'La reserva ya tiene check-in en el hotel: no se puede cancelar.');
    }
    const nodo = await this.socios.nodoPorCodigo(fila.codigo_nodo);
    if (!nodo) throw new HttpException('El hotel de esta reserva ya no está disponible en Booking.', HttpStatus.BAD_GATEWAY);
    const ref = fila.order_id_socio || fila.external_order_id || fila.codigo_reserva_socio;
    const r = await this.socios.llamar(nodo, 'POST', `/alojamientos/orders/${encodeURIComponent(ref)}/cancel`, {
      idempotencyKey: randomUUID(),
      correlationId,
      body: { motivo: (motivo || 'Cancelada por el cliente desde Booking').slice(0, 500), solicitadoPor: 'CLIENTE' },
    });
    if (r.status !== 200) {
      if (r.status === 409) {
        throw conflicto(CodigoProblema.CANCELLATION_NOT_ALLOWED, `El hotel ${nodo.nombreProveedor} no permite cancelar esta reserva en su estado actual.`);
      }
      this.errorDelSocio(r, nodo, 'cancelar');
    }
    const b = desempacar(r.body) || {};
    const [act] = await this.q(
      `UPDATE ${TABLA}
          SET estado = $2, motivo_cancelacion = $3, cancelada_en = now(), actualizado_en = now(),
              codigo_reembolso = $4, monto_reembolsado = $5
        WHERE id = $1
        RETURNING *`,
      [fila.id, ESTADO_CANCELADO, motivo || null, b.codigoReembolso ?? null, dinero(b.montoReembolsado)],
    );
    this.socios.invalidarCatalogo();
    return this.respuesta(act);
  }

  // ───────────────────────────── Check-in (Flujo 2) ─────────────────────────────

  /**
   * El socio confirma la llegada física del huésped. `ref` puede ser el id de la
   * copia, el código BKG-…, o el orderId / external_order_id / código del socio.
   * Solo el socio dueño de la reserva puede marcarla (su X-API-Key).
   */
  async marcarCheckin(ref: string, clave: string | undefined, datos: { admin?: string | null; fecha?: string | null }): Promise<any | null> {
    if (!ref || !(await this.asegurarTabla())) return null;
    const [fila] = await this.dataSource!.query(
      `SELECT * FROM ${TABLA}
        WHERE id::text = $1 OR codigo_reserva = $1 OR order_id_socio = $1
           OR external_order_id = $1 OR codigo_reserva_socio = $1
        LIMIT 1`,
      [ref],
    );
    if (!fila) return null;
    const nodo = await this.socios.nodoPorClave(clave);
    if (!nodo || nodo.codigoNodo !== fila.codigo_nodo) {
      throw new HttpException('X-API-Key ausente o de otro socio: solo el hotel dueño de la reserva puede confirmar el check-in.', HttpStatus.UNAUTHORIZED);
    }
    if (fila.estado === ESTADO_CANCELADO) {
      throw conflicto(CodigoProblema.CHECK_IN_NOT_AVAILABLE, 'La reserva está cancelada: no admite check-in.');
    }
    if (fila.estado === ESTADO_ASISTIDO) return { ...fila, ya_registrado: true };
    const [act] = await this.dataSource!.query(
      `UPDATE ${TABLA}
          SET estado = $2, checkin_at = COALESCE($3::timestamptz, now()), checkin_admin = $4, actualizado_en = now()
        WHERE id = $1
        RETURNING *`,
      [fila.id, ESTADO_ASISTIDO, datos.fecha || null, datos.admin || null],
    );
    return act;
  }

  // ───────────────────────────── Formato ─────────────────────────────

  /** Copia → mismo formato que `buildReservaResponse` de alojamientos (Mis Reservas). */
  respuesta(f: any): any {
    const idAloj = AlojamientosSociosService.idCompuesto(f.codigo_nodo, f.alojamiento_id_socio);
    const total = f.total !== null && f.total !== undefined ? Number(f.total) : null;
    return {
      reservation_id: f.id,
      alojamiento_id: idAloj,
      codigo_reserva: f.codigo_reserva,
      status: f.estado,
      customer_name: f.cliente_nombre,
      customer_email: f.cliente_email,
      checkin: fecha(f.checkin),
      checkout: fecha(f.checkout),
      noches: f.noches,
      huespedes: Number(f.adultos) + Number(f.ninos),
      adultos: f.adultos,
      ninos: f.ninos,
      habitaciones_count: f.habitaciones,
      tipo_habitacion: { id: f.tipo_codigo, codigo: f.tipo_codigo, nombre: f.tipo_nombre, plan_tarifa: f.plan_tarifa },
      precio_noche: total !== null && f.noches ? Number((total / f.noches / Math.max(1, f.habitaciones)).toFixed(2)) : null,
      total_price: { currency: f.moneda || 'USD', total },
      telefono: f.cliente_telefono ?? null,
      peticiones_especiales: f.peticiones_especiales ?? null,
      cuenta_vinculada: Boolean(f.usuario_id),
      cancelada_en: f.cancelada_en ?? null,
      motivo_cancelacion: f.motivo_cancelacion ?? null,
      reembolso: f.codigo_reembolso ? { codigo: f.codigo_reembolso, monto: f.monto_reembolsado !== null ? Number(f.monto_reembolsado) : null } : null,
      checkin_at: f.checkin_at ?? null,
      huespedes_detalle: [],
      created_at: f.creado_en,
      nombre_alojamiento: f.alojamiento_nombre,
      destino: f.destino,
      photo_url: f.foto_url,
      socio: {
        codigo_nodo: f.codigo_nodo,
        order_id: f.order_id_socio,
        external_order_id: f.external_order_id,
        codigo_reserva: f.codigo_reserva_socio,
        client_id: f.external_client_id,
      },
      _links: {
        self: { href: `/api/v1/alojamientos/reservations/${f.id}`, type: 'GET' },
        cancelar: { href: `/api/v1/alojamientos/reservations/${f.id}/cancel`, type: 'POST' },
        alojamiento: { href: `/api/v1/alojamientos/${encodeURIComponent(idAloj)}`, type: 'GET' },
      },
    };
  }
}

