import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AlojamientosSociosService, OpcionSocio, inferirDescripcionCamas, extraerCamasNum } from './alojamientos-socios.service';
import { trazaAlojamientos, PasoAlojamiento, ResultadoPaso } from './alojamientos-traza';
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
/**
 * En Postgres, TypeORM devuelve `[filas, cantidad]` para UPDATE/DELETE y solo `filas` para
 * SELECT/INSERT. Devuelve la primera fila en ambos casos.
 */
export const primeraFila = (r: any): any => (Array.isArray(r) && Array.isArray(r[0]) ? r[0][0] : Array.isArray(r) ? r[0] : undefined);
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
      await this.dataSource.query(`
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS codigo_reembolso varchar(60);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS monto_reembolsado numeric(10,2);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS motivo_cancelacion varchar(500);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS cancelada_en timestamptz;
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS checkin_at timestamptz;
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS checkin_admin varchar(120);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS order_id_socio varchar(100);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS external_order_id varchar(100);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS codigo_reserva_socio varchar(100);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS estado_habitacion varchar(40) DEFAULT 'DISPONIBLE';
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS habitacion_asignada varchar(100);
        ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS checkout_at timestamptz;
      `).catch(() => undefined);

      this.tablaLista = true;
    } catch (e: any) {
      this.logger.error(`[alojamientos-socios] No se pudo crear o migrar ${TABLA}: ${e?.message}`);
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
    if (!id || typeof id !== 'string') return null;
    if (!(await this.asegurarTabla())) return null;
    const raw = decodeURIComponent(id.trim());
    const stripped = raw.includes('~') ? raw.split('~').pop()!.trim() : raw;
    const candidatos = Array.from(new Set([raw, stripped].filter(Boolean)));

    for (const cand of candidatos) {
      const sql = `SELECT * FROM ${TABLA} WHERE id::text = $1 OR codigo_reserva = $1 OR order_id_socio = $1 OR external_order_id = $1 OR codigo_reserva_socio = $1 LIMIT 1`;
      const [fila] = await this.dataSource!.query(sql, [cand]);
      if (fila) return fila;
    }
    return null;
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

  /** Deja un paso en la traza en vivo (telemetría; nunca rompe el flujo). */
  private traza(d: DatosReservaSocio, paso: PasoAlojamiento, resultado: ResultadoPaso, detalle: string, nodo?: string | null, monto?: number | string | null): void {
    trazaAlojamientos.registrar({
      correlacion: d.correlationId || 'sin-correlacion',
      paso,
      resultado,
      detalle,
      nodo: nodo ?? null,
      monto: monto != null && Number.isFinite(Number(monto)) ? Number(monto) : null,
      cliente: d.email?.trim().toLowerCase() || (d.usuarioId ? String(d.usuarioId) : 'invitado'),
    });
  }

  private async reservarSinCandado(d: DatosReservaSocio): Promise<any> {
    // 0. Reintento con la misma clave: la misma reserva (no se vuelve a pedir al socio).
    const existente = await this.porClave(d.idempotencyKey);
    if (existente) return { ...this.respuesta(existente), idempotent_replayed: true };

    this.validar(d);
    const correlationId = d.correlationId || `corr-alo-${randomUUID()}`;

    // 1. Disponibilidad real del socio y elección del tipo (el más barato que cabe si no se indica).
    const disp = await this.socios.opciones(d.idCompuesto, d.checkin, d.checkout, d.adultos, d.habitaciones);
    if (!disp) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    const { nodo, idSocio, opciones, respuesta } = disp;
    if (respuesta.status !== 200) {
      this.traza(d, 'busqueda', 'error', `El hotel ${nodo.nombreProveedor} no respondió la disponibilidad`, nodo.codigoNodo);
      this.errorDelSocio(respuesta, nodo, 'consultar la disponibilidad');
    }
    this.traza(d, 'busqueda', 'ok', `Disponibilidad en vivo de ${nodo.nombreProveedor}`, nodo.codigoNodo);
    let opcion: OpcionSocio;
    try {
      opcion = this.elegirOpcion(opciones, d);
    } catch (e: any) {
      this.traza(d, 'busqueda', 'error', e?.message || 'Sin cupo para esas fechas', nodo.codigoNodo);
      throw e;
    }

    // 2. Cliente cross-platform (Flujo 2): ficha del huésped en el socio, sin duplicarla.
    const identificacion = d.documentoNumero!.trim();
    const cliente = await this.socios.sincronizarCliente(
      nodo,
      { nombre: d.nombre.trim(), email: d.email.trim().toLowerCase(), identificacion, telefono: d.telefono },
      correlationId,
    );
    await this.guardarMapeoCliente(d.usuarioId, nodo.codigoNodo, cliente.clientId, cliente.origen);
    this.traza(
      d,
      'cliente',
      cliente.origen === 'NO_SOPORTADO' || cliente.origen === 'ERROR' ? 'aviso' : 'ok',
      cliente.origen === 'NO_SOPORTADO' ? `${nodo.nombreProveedor} aún no expone /clientes` : `Huésped ${cliente.origen === 'CREADO' ? 'creado' : 'sincronizado'} en el hotel`,
      nodo.codigoNodo,
    );

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
    if (cot.status !== 200) {
      this.traza(d, 'cotizar', 'error', `El hotel ${nodo.nombreProveedor} no cotizó`, nodo.codigoNodo);
      this.errorDelSocio(cot, nodo, 'cotizar');
    }
    const c = desempacar(cot.body) || {};
    const total = dinero(
      c.precioTotalCotizado ?? c.totalPagar ?? c.desglosePrecio?.totalPagar ??
      c.precioTotalEstancia ?? c.totalPrice ?? c.precioTotal ?? c.total ?? c.monto,
    );
    if (!total) throw new HttpException(`El hotel ${nodo.nombreProveedor} no devolvió un precio.`, HttpStatus.BAD_GATEWAY);
    this.traza(d, 'cotizar', 'ok', `Precio congelado en ${nodo.nombreProveedor}`, nodo.codigoNodo, total);

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
      this.traza(d, 'recuperar', 'aviso', `Timeout/5xx de ${nodo.nombreProveedor}: recuperando por idempotency_key`, nodo.codigoNodo);
      const rec = await this.socios.llamar(nodo, 'GET', `/alojamientos/orders?idempotency_key=${encodeURIComponent(d.idempotencyKey)}`, { correlationId });
      const lista = rec.status === 200 ? (Array.isArray(rec.body) ? rec.body : rec.body?.data || rec.body?.orders || []) : [];
      const viva = lista.find((o: any) => String(o?.estado || o?.status || '').toUpperCase() !== 'CANCELLED');
      if (viva) orden = { ...orden, status: 201, body: viva };
    }
    if (orden.status !== 200 && orden.status !== 201) {
      this.traza(d, 'crear_orden', 'error', `El hotel ${nodo.nombreProveedor} no confirmó la orden`, nodo.codigoNodo);
      this.errorDelSocio(orden, nodo, 'crear la reserva');
    }
    this.traza(d, 'crear_orden', 'ok', `Orden creada en ${nodo.nombreProveedor}`, nodo.codigoNodo, total);

    const o = desempacar(orden.body) || {};
    const ref = {
      orderId: o.orderId ?? o.ordenId ?? o.id ?? null,
      externalOrderId: o.external_order_id ?? o.externalOrderId ?? null,
      codigoReserva: o.codigoReserva ?? o.codigo_reserva ?? null,
      total: dinero(o.total ?? o.totalPagar ?? o.precioTotalEstancia ?? o.totalPrice ?? o.precioTotal) ?? total,
    };
    if (!ref.orderId && !ref.externalOrderId && !ref.codigoReserva) {
      throw new HttpException(`El hotel ${nodo.nombreProveedor} confirmó sin identificador de reserva.`, HttpStatus.BAD_GATEWAY);
    }

    // 5. Copia local. Si falla, se compensa en el socio para no dejar una reserva huérfana.
    const hotel = await this.socios.detalle(d.idCompuesto).catch(() => null);
    try {
      const fila = await this.insertarCopia(d, nodo, idSocio, opcion, ref, cliente.clientId, correlationId, hotel, o);
      this.socios.invalidarCatalogo();
      this.traza(d, 'copia', 'ok', `Copia guardada (RESERVADO) ${fila.codigo_reserva}`, nodo.codigoNodo, ref.total);
      this.traza(d, 'confirmada', 'ok', `Reserva confirmada ${fila.codigo_reserva}`, nodo.codigoNodo, ref.total);
      this.logger.log(`[alojamientos-socios] ${nodo.codigoNodo} confirmó ${ref.codigoReserva || ref.orderId} → Booking ${fila.codigo_reserva} (RESERVADO)`);
      return this.respuesta(fila);
    } catch (e: any) {
      // Carrera entre instancias con la misma clave: la otra ya guardó la copia.
      const ganadora = await this.porClave(d.idempotencyKey).catch(() => null);
      if (ganadora) return { ...this.respuesta(ganadora), idempotent_replayed: true };
      this.logger.error(`[alojamientos-socios] Copia local falló (${e?.message}); compensando en ${nodo.codigoNodo}`);
      this.traza(d, 'copia', 'error', 'La copia local falló; se compensa cancelando en el hotel', nodo.codigoNodo);
      const ref2 = ref.orderId || ref.externalOrderId || ref.codigoReserva;
      const comp = await this.socios.llamar(nodo, 'POST', `/alojamientos/orders/${encodeURIComponent(ref2)}/cancel`, {
        idempotencyKey: randomUUID(),
        correlationId,
        body: { motivo: 'Compensación Saga: Booking no pudo registrar la reserva', solicitadoPor: 'SAGA_ORCHESTRATOR' },
      });
      this.traza(d, 'compensar', comp.status === 200 ? 'aviso' : 'error', comp.status === 200 ? 'Orden anulada en el hotel (Saga)' : 'La anulación en el hotel falló', nodo.codigoNodo);
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

    // En Booking el consumidor fija las reglas: toda reserva admite cancelación previa al inicio de la estadía (14:00 hora hotel Ecuador / UTC-5)
    if (fila.checkin) {
      const fechaEntrada = new Date(`${fecha(fila.checkin)}T14:00:00-05:00`).getTime();
      if (Date.now() >= fechaEntrada) {
        throw conflicto(
          CodigoProblema.CANCELLATION_NOT_ALLOWED,
          `No es posible cancelar una reserva cuya estancia ya ha iniciado en el hotel ${nodo.nombreProveedor}.`,
        );
      }
    }

    const rawRef = fila.order_id_socio || fila.external_order_id || fila.codigo_reserva_socio || fila.codigo_reserva;
    const ref = String(rawRef || '').includes('~') ? String(rawRef).split('~').pop()! : String(rawRef || '');
    const cuerpoCancel = {
      motivo: (motivo || 'Cancelada por el cliente desde Booking').slice(0, 300),
      solicitadoPor: 'CLIENTE',
    };

    let r: any = null;
    let canceladaEnSocio = false;
    let b: any = {};

    try {
      r = await this.socios.llamar(nodo, 'POST', `/alojamientos/orders/${encodeURIComponent(ref)}/cancel`, {
        idempotencyKey: randomUUID(),
        correlationId,
        body: cuerpoCancel,
      });
      if (r.status === 404 && fila.codigo_reserva_socio && fila.codigo_reserva_socio !== ref) {
        const porLoc = await this.socios.llamar(nodo, 'POST', `/alojamientos/orders/${encodeURIComponent(fila.codigo_reserva_socio)}/cancel`, {
          idempotencyKey: randomUUID(),
          correlationId,
          body: cuerpoCancel,
        });
        if (porLoc.status === 200 || porLoc.status === 204 || porLoc.status === 409) r = porLoc;
      }
      if (r.status === 404) {
        const alias = await this.socios.llamar(nodo, 'POST', `/alojamientos/reservas/${encodeURIComponent(ref)}/cancel`, {
          idempotencyKey: randomUUID(),
          correlationId,
          body: cuerpoCancel,
        });
        if (alias.status === 200 || alias.status === 409) r = alias;
      }
      if (r.status === 200 || r.status === 204) {
        canceladaEnSocio = true;
        b = desempacar(r.body) || {};
      } else {
        this.logger.warn(`[alojamientos-socios] El hotel ${nodo.codigoNodo} devolvió ${r.status} al cancelar ${ref}. Se procede con anulación en Booking por política contractual.`);
      }
    } catch (netErr: any) {
      this.logger.warn(`[alojamientos-socios] Hotel ${nodo.codigoNodo} no respondió al cancelar: ${netErr?.message}. Se anula en Booking por política.`);
    }

    const codReembolso = b.codigoReembolso ?? b.codigo_reembolso ?? b.refundId ?? b.refund_id ?? `REF-BKG-${Date.now().toString(36).toUpperCase()}`;
    const montoReembolso = dinero(b.montoReembolsado ?? b.monto_reembolsado ?? b.refundAmount ?? b.monto ?? fila.total);
    
    let act: any;
    try {
      act = primeraFila(await this.q(
        `UPDATE ${TABLA}
            SET estado = $2, motivo_cancelacion = $3, cancelada_en = now(), actualizado_en = now(),
                codigo_reembolso = $4, monto_reembolsado = $5
          WHERE id = $1
          RETURNING *`,
        [fila.id, ESTADO_CANCELADO, motivo || null, codReembolso, montoReembolso],
      ));
    } catch (updErr: any) {
      this.logger.warn(`[alojamientos-socios] Actualizando estado básico de cancelación en ${TABLA}: ${updErr?.message}`);
      act = primeraFila(await this.q(
        `UPDATE ${TABLA}
            SET estado = $2, motivo_cancelacion = $3, cancelada_en = now(), actualizado_en = now()
          WHERE id = $1
          RETURNING *`,
        [fila.id, ESTADO_CANCELADO, motivo || null],
      ));
    }

    this.socios.invalidarCatalogo();
    trazaAlojamientos.registrar({
      correlacion: correlationId || 'sin-correlacion', paso: 'cancelacion', resultado: 'aviso',
      detalle: `Cancelada ${fila.codigo_reserva} · ${canceladaEnSocio ? 'confirmada por el hotel' : 'anulada en Booking'} · reembolso: ${montoReembolso}`,
      nodo: fila.codigo_nodo, monto: montoReembolso != null ? Number(dinero(montoReembolso)) || null : null, cliente: fila.cliente_email || 'invitado',
    });
    return this.respuesta(act || { ...fila, estado: ESTADO_CANCELADO, codigo_reembolso: codReembolso, monto_reembolsado: montoReembolso });
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
    const habAsignada = fila.habitacion_asignada || `Habitación ${Math.floor(Math.random() * 200) + 101}`;
    const act = primeraFila(await this.dataSource!.query(
      `UPDATE ${TABLA}
          SET estado = $2, checkin_at = COALESCE($3::timestamptz, now()), checkin_admin = $4,
              estado_habitacion = 'OCUPADA', habitacion_asignada = COALESCE(habitacion_asignada, $5),
              actualizado_en = now()
        WHERE id = $1
        RETURNING *`,
      [fila.id, ESTADO_ASISTIDO, datos.fecha || null, datos.admin || null, habAsignada],
    ));
    trazaAlojamientos.registrar({
      correlacion: `checkin-${fila.codigo_reserva}`, paso: 'checkin', resultado: 'ok',
      detalle: `Check-in confirmado por ${nodo.nombreProveedor} (Flujo 2)`,
      nodo: fila.codigo_nodo, cliente: fila.cliente_email || 'invitado',
    });
    return act;
  }

  // ───────────────────────────── Formato ─────────────────────────────

  /** Copia → mismo formato que `buildReservaResponse` de alojamientos (Mis Reservas). */
  respuesta(f: any): any {
    const idAloj = AlojamientosSociosService.idCompuesto(f.codigo_nodo, f.alojamiento_id_socio);
    const total = f.total !== null && f.total !== undefined ? Number(f.total) : null;
    const cancelTexto = 'Cancelación gratuita hasta 48 horas antes del check-in';
    const puedeCancelar = f.estado !== ESTADO_CANCELADO && f.estado !== ESTADO_ASISTIDO;

    const rawSocio = typeof f.respuesta_socio === 'string'
      ? (() => { try { return JSON.parse(f.respuesta_socio); } catch { return {}; } })()
      : (f.respuesta_socio || {});
    const camasSocio = rawSocio?.camas ?? rawSocio?.numero_camas ?? rawSocio?.numeroCamas ?? rawSocio?.habitacion?.camas;
    const numCamas = extraerCamasNum(camasSocio) ?? extraerCamasNum(f.tipo_nombre) ?? 1;
    const descCamas = rawSocio?.descripcion_camas || rawSocio?.camas_descripcion || (typeof camasSocio === 'string' && isNaN(Number(camasSocio)) ? camasSocio : null) || inferirDescripcionCamas(camasSocio ?? numCamas, f.tipo_nombre, f.adultos);

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
      camas: numCamas,
      descripcion_camas: descCamas,
      habitacion_asignada: f.habitacion_asignada || (f.checkin_at ? 'Habitación 204' : null),
      tipo_habitacion: {
        id: f.tipo_codigo,
        codigo: f.tipo_codigo,
        nombre: f.tipo_nombre,
        plan_tarifa: f.plan_tarifa,
        cancelacion: cancelTexto,
      },
      es_reembolsable: true,
      reembolsable: true,
      cancelacion_texto: cancelTexto,
      cancelacion_gratuita_horas: 48,
      politica_cancelacion: cancelTexto,
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
        ...(puedeCancelar ? { cancelar: { href: `/api/v1/alojamientos/reservations/${f.id}/cancel`, type: 'POST' } } : {}),
        alojamiento: { href: `/api/v1/alojamientos/${encodeURIComponent(idAloj)}`, type: 'GET' },
      },
    };
  }
}

