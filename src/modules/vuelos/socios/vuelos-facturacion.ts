/**
 * Facturación de las reservas de vuelos con aerolíneas socias.
 *
 * Modelo (agencia que cobra y luego liquida, como una OTA):
 *  1. El cliente paga a Booking el precio que congeló la aerolínea.
 *  2. Booking emite la factura al cliente (schema_facturacion.facturas_encabezado/detalle).
 *  3. Booking registra la venta en el libro mayor de comisiones y la suma a la
 *     liquidación quincenal de esa aerolínea (schema_finanzas): Booking retiene
 *     su comisión y le debe el neto a la aerolínea.
 *  4. Si se cancela con reembolso, se emite una nota de crédito por lo devuelto y
 *     la venta se descuenta del libro y de la liquidación.
 *
 * La aerolínea relaciona cada reserva con la orden de Booking por
 * `salesChannel.partnerOrderId` (contrato v2), que va también en la factura y en
 * la liquidación, y así puede conciliar.
 *
 * Se escribe con SQL contra las tablas reales de la base (no con entidades
 * TypeORM): algunas entidades no coinciden con las columnas que existen.
 */
import { createHash } from 'crypto';
import type { DataSource, EntityManager } from 'typeorm';

/** Comisión que retiene Booking sobre cada venta de un socio (Panel 4: "Liquidaciones 10%"). */
export const COMISION_BOOKING_PCT = 10;
/** IVA vigente en Ecuador, usado solo si la aerolínea no detalla sus impuestos. */
const IVA_EC_PCT = 15;

export const SQL_FACTURACION_VUELOS = `
CREATE SEQUENCE IF NOT EXISTS schema_facturacion.seq_factura_vuelos;
CREATE SEQUENCE IF NOT EXISTS schema_facturacion.seq_nota_credito;
CREATE TABLE IF NOT EXISTS schema_facturacion.notas_credito (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nota         varchar(50)   UNIQUE NOT NULL,
  factura_id          uuid          NOT NULL REFERENCES schema_facturacion.facturas_encabezado(id),
  reserva_id          text          NOT NULL,
  monto               numeric(10,2) NOT NULL CHECK (monto > 0),
  motivo              text,
  transaccion_pago_id uuid,
  idempotency_key     varchar(64)   UNIQUE NOT NULL,
  emitida_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notas_credito_factura ON schema_facturacion.notas_credito (factura_id);
ALTER TABLE public.vuelos_reservas_socio
  ADD COLUMN IF NOT EXISTS partner_order_id varchar(40),
  ADD COLUMN IF NOT EXISTS factura_id       uuid,
  ADD COLUMN IF NOT EXISTS numero_factura   varchar(50);
`;

export interface FacturaVuelo {
  id: string;
  numero: string;
  partnerOrderId: string | null;
  cliente: { nombre: string; documento: string; email: string };
  subtotal: string;
  impuestosPorcentaje: string;
  impuestos: string;
  total: string;
  moneda: string;
  descripcion: string;
  estado: string;
  emitidaAt: string;
  notasCredito: Array<{ numero: string; monto: string; emitidaAt: string }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const hash = (s: string, n = 40) => createHash('sha256').update(String(s)).digest('hex').slice(0, n);

/** Fecha de Ecuador: { ymd: '20261104', ym: '202611', ymdIso: '2026-11-04', dia: 4 }. */
export function fechaEcuador(d = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { ymdIso: iso, ymd: iso.replace(/-/g, ''), ym: iso.slice(0, 7).replace('-', ''), dia: Number(iso.slice(8, 10)), periodoMes: iso.slice(0, 7) };
}

/** Periodo de liquidación quincenal: '2026-11-Q1' (días 1-15) o '2026-11-Q2'. */
export function periodoQuincena(d = new Date()) {
  const f = fechaEcuador(d);
  return `${f.periodoMes}-${f.dia <= 15 ? 'Q1' : 'Q2'}`;
}

/** Orden de Booking para la aerolínea (salesChannel.partnerOrderId). Estable por clave de idempotencia. */
export function ordenDeReserva(idempotencyKey: string) {
  return `ORD-BKP-${hash(idempotencyKey, 10).toUpperCase()}`;
}

/**
 * Subtotal e impuestos. Si la aerolínea detalla baseFare/taxes se usan tal cual
 * (incluyen tasas aeroportuarias); si no, se toma el IVA de Ecuador incluido.
 */
export function desglose(total: number, base?: number | null, impuestos?: number | null) {
  if (Number.isFinite(base) && Number.isFinite(impuestos) && (base as number) > 0 && Math.abs((base as number) + (impuestos as number) - total) < 0.02) {
    return { subtotal: r2(base as number), impuestos: r2(impuestos as number), pct: r2(((impuestos as number) / (base as number)) * 100) };
  }
  const subtotal = r2(total / (1 + IVA_EC_PCT / 100));
  return { subtotal, impuestos: r2(total - subtotal), pct: IVA_EC_PCT };
}

/** Números de vuelo de la reserva (acepta segmentos planos o anidados). */
function vuelosDe(reserva: any): string[] {
  const segs = [
    ...(reserva?.segments ?? []),
    ...((reserva?.itineraries ?? []).flatMap((i: any) => i?.segments ?? [])),
  ];
  return [...new Set(segs.map((s: any) => s?.flightNumber).filter(Boolean))] as string[];
}

/**
 * Emite la factura de una reserva confirmada. Idempotente por bookingId: si ya
 * existe, la devuelve.
 */
export async function emitirFacturaVuelo(
  ds: DataSource,
  datos: {
    bookingId: string;
    codigoNodo: string;
    propietarioId: string;
    reserva: any;
    pasajeros: any[];
    total: number;
    moneda: string;
    base?: number | null;
    impuestos?: number | null;
    transaccionId?: string | null;
    partnerOrderId: string;
    resumen: { pnr: string | null; origin: string | null; destination: string | null; departureDate: string | null };
  },
): Promise<FacturaVuelo> {
  const clave = `fac-vuelo-${hash(datos.bookingId)}`;
  const existente = await facturaPorClave(ds, clave);
  if (existente) return existente;

  const titular = datos.pasajeros?.find((p) => p?.passengerType !== 'INFANT') ?? datos.pasajeros?.[0] ?? {};
  const nombre = `${titular.firstName ?? ''} ${titular.lastName ?? ''}`.trim() || 'Consumidor final';
  const documento = String(titular.documentNumber ?? '').slice(0, 20) || '9999999999999';
  const email = String(titular.contact?.email ?? titular.email ?? '').slice(0, 150) || 'sin-correo@booking.local';
  const clienteId = /^[0-9a-f-]{36}$/i.test(datos.propietarioId) ? datos.propietarioId : null;
  const d = desglose(datos.total, datos.base, datos.impuestos);
  const n = Math.max(1, (datos.pasajeros ?? []).filter((p) => p?.passengerType !== 'INFANT').length);
  const vuelos = vuelosDe(datos.reserva);
  const ruta = [datos.resumen.origin, datos.resumen.destination].filter(Boolean).join(' → ');
  const descripcion = [
    `Boleto aéreo${vuelos.length ? ' ' + vuelos.join(' / ') : ''}${ruta ? ' ' + ruta : ''}`,
    datos.resumen.departureDate ? `salida ${datos.resumen.departureDate}` : null,
    datos.resumen.pnr ? `PNR ${datos.resumen.pnr}` : null,
    `${n} pasajero${n > 1 ? 's' : ''}`,
    `operado por ${datos.codigoNodo}`,
  ].filter(Boolean).join(' · ');

  await ds.transaction(async (m) => {
    const [{ seq }] = await m.query(`SELECT nextval('schema_facturacion.seq_factura_vuelos') AS seq`);
    const numero = `FAC-${fechaEcuador().ymd}-${String(seq).padStart(6, '0')}`;
    const [fila] = await m.query(
      `INSERT INTO schema_facturacion.facturas_encabezado
         (numero_factura, cliente_id, nombre_cliente, cedula_ruc_cliente, email_cliente, direccion_cliente,
          subtotal, iva_porcentaje, iva_valor, total, metodo_pago, estado, idempotency_key, transaccion_pago_id)
       VALUES ($1, COALESCE($2::uuid, gen_random_uuid()), $3, $4, $5, $6, $7, $8, $9, $10, 'TARJETA_CREDITO', 'PAGADA', $11, $12)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [numero, clienteId, nombre.slice(0, 150), documento, email, `Orden ${datos.partnerOrderId}`,
        d.subtotal, d.pct, d.impuestos, r2(datos.total), clave, datos.transaccionId ?? null],
    );
    if (!fila) return; // otra petición la emitió en paralelo
    await m.query(
      `INSERT INTO schema_facturacion.facturas_detalle
         (factura_id, vertical, item_id, descripcion, cantidad, precio_unitario, subtotal)
       VALUES ($1, 'vuelos', $2, $3, $4, $5, $6)`,
      [fila.id, String(datos.resumen.pnr || datos.bookingId).slice(0, 64), descripcion, n, r2(d.subtotal / n), d.subtotal],
    );
    await m.query(
      `UPDATE public.vuelos_reservas_socio SET factura_id = $2, numero_factura = $3, partner_order_id = $4, updated_at = now()
        WHERE booking_id = $1`,
      [datos.bookingId, fila.id, numero, datos.partnerOrderId],
    );
    await registrarMovimiento(m, {
      ordenId: datos.partnerOrderId, facturaId: fila.id, proveedor: datos.codigoNodo, total: r2(datos.total),
    });
  });
  const factura = await facturaPorClave(ds, clave);
  if (!factura) throw new Error('No se pudo leer la factura recién emitida.');
  return factura;
}

/**
 * Nota de crédito por un reembolso. Descuenta la venta del libro mayor y de la
 * liquidación de la aerolínea. Idempotente por (bookingId, transacción de reembolso).
 */
export async function emitirNotaCredito(
  ds: DataSource,
  datos: { bookingId: string; monto: number; motivo: string; transaccionId?: string | null; claveReembolso: string },
): Promise<{ numero: string; monto: string } | null> {
  if (!(datos.monto > 0)) return null;
  const [copia] = await ds.query(
    `SELECT factura_id, partner_order_id, codigo_nodo FROM public.vuelos_reservas_socio WHERE booking_id = $1`,
    [datos.bookingId],
  );
  if (!copia?.factura_id) return null; // reserva anterior a la facturación
  const clave = `nc-vuelo-${hash(`${datos.bookingId}|${datos.claveReembolso}`)}`;
  return ds.transaction(async (m) => {
    const previa = await m.query(`SELECT numero_nota, monto FROM schema_facturacion.notas_credito WHERE idempotency_key = $1`, [clave]);
    if (previa[0]) return { numero: previa[0].numero_nota, monto: Number(previa[0].monto).toFixed(2) };
    const [{ seq }] = await m.query(`SELECT nextval('schema_facturacion.seq_nota_credito') AS seq`);
    const numero = `NC-${fechaEcuador().ymd}-${String(seq).padStart(6, '0')}`;
    const monto = r2(datos.monto);
    await m.query(
      `INSERT INTO schema_facturacion.notas_credito
         (numero_nota, factura_id, reserva_id, monto, motivo, transaccion_pago_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [numero, copia.factura_id, datos.bookingId, monto, datos.motivo, datos.transaccionId ?? null, clave],
    );
    await registrarMovimiento(m, {
      ordenId: copia.partner_order_id || datos.bookingId.slice(0, 64), facturaId: copia.factura_id, proveedor: copia.codigo_nodo, total: -monto,
    });
    return { numero, monto: monto.toFixed(2) };
  });
}

/**
 * Asiento en el libro mayor y acumulado en la liquidación quincenal PENDIENTE
 * de la aerolínea. `total` negativo = devolución (nota de crédito).
 */
async function registrarMovimiento(m: EntityManager, d: { ordenId: string; facturaId: string; proveedor: string; total: number }) {
  const comision = r2(d.total * COMISION_BOOKING_PCT / 100);
  const neto = r2(d.total - comision);
  await m.query(
    `INSERT INTO schema_finanzas.libro_mayor_comisiones
       (orden_id, factura_id, vertical, total_venta, comision_booking_10pct, neto_socio_90pct)
     VALUES ($1, $2, 'vuelos', $3, $4, $5)`,
    [d.ordenId.slice(0, 64), d.facturaId, d.total, comision, neto],
  );
  const periodo = periodoQuincena();
  const abierta = await m.query(
    `SELECT id FROM schema_finanzas.liquidaciones_proveedores
      WHERE proveedor_codigo = $1 AND periodo = $2 AND estado = 'PENDIENTE' FOR UPDATE`,
    [d.proveedor, periodo],
  );
  if (abierta[0]) {
    await m.query(
      `UPDATE schema_finanzas.liquidaciones_proveedores
          SET monto_bruto_ventas = monto_bruto_ventas + $2,
              comision_retenida_booking = comision_retenida_booking + $3,
              monto_neto_a_pagar = monto_neto_a_pagar + $4
        WHERE id = $1`,
      [abierta[0].id, d.total, comision, neto],
    );
  } else {
    await m.query(
      `INSERT INTO schema_finanzas.liquidaciones_proveedores
         (numero_liquidacion, proveedor_codigo, vertical, periodo, monto_bruto_ventas,
          porcentaje_comision_booking, comision_retenida_booking, monto_neto_a_pagar, estado)
       VALUES ($1, $2, 'vuelos', $3, $4, $5, $6, $7, 'PENDIENTE')`,
      [`LIQ-${fechaEcuador().ym}-${hash(`${d.proveedor}|${periodo}|${Date.now()}`, 6).toUpperCase()}`,
        d.proveedor, periodo, d.total, COMISION_BOOKING_PCT, comision, neto],
    );
  }
}

async function facturaPorClave(ds: DataSource | EntityManager, clave: string): Promise<FacturaVuelo | null> {
  const filas = await ds.query(
    `SELECT f.id, f.numero_factura, f.nombre_cliente, f.cedula_ruc_cliente, f.email_cliente, f.direccion_cliente,
            f.subtotal, f.iva_porcentaje, f.iva_valor, f.total, f.estado, f.emitida_at,
            (SELECT d.descripcion FROM schema_facturacion.facturas_detalle d WHERE d.factura_id = f.id LIMIT 1) AS descripcion,
            COALESCE((SELECT json_agg(json_build_object('numero', n.numero_nota, 'monto', n.monto, 'emitidaAt', n.emitida_at) ORDER BY n.emitida_at)
                        FROM schema_facturacion.notas_credito n WHERE n.factura_id = f.id), '[]'::json) AS notas
       FROM schema_facturacion.facturas_encabezado f WHERE f.idempotency_key = $1`,
    [clave],
  );
  return filas[0] ? mapearFactura(filas[0]) : null;
}

/** Factura (con sus notas de crédito) de una reserva de vuelo con socio. */
export async function facturaDeReserva(ds: DataSource, bookingId: string): Promise<FacturaVuelo | null> {
  return facturaPorClave(ds, `fac-vuelo-${hash(bookingId)}`);
}

function mapearFactura(f: any): FacturaVuelo {
  const orden = String(f.direccion_cliente ?? '').match(/ORD-BKP-[A-Z0-9]+/)?.[0] ?? null;
  return {
    id: f.id,
    numero: f.numero_factura,
    partnerOrderId: orden,
    cliente: { nombre: f.nombre_cliente, documento: f.cedula_ruc_cliente, email: f.email_cliente },
    subtotal: Number(f.subtotal).toFixed(2),
    impuestosPorcentaje: Number(f.iva_porcentaje).toFixed(2),
    impuestos: Number(f.iva_valor).toFixed(2),
    total: Number(f.total).toFixed(2),
    moneda: 'USD',
    descripcion: f.descripcion ?? '',
    estado: f.estado,
    emitidaAt: new Date(f.emitida_at).toISOString(),
    notasCredito: (f.notas ?? []).map((n: any) => ({ numero: n.numero, monto: Number(n.monto).toFixed(2), emitidaAt: new Date(n.emitidaAt).toISOString() })),
  };
}

/**
 * Conciliación con una aerolínea: reservas del periodo con su orden, PNR, id en
 * la aerolínea, factura, total y lo devuelto. Es lo que la aerolínea compara con
 * su GET /bookings (createdFrom / createdTo).
 */
export async function conciliacionVuelos(ds: DataSource, filtros: { proveedor?: string; desde: string; hasta: string }) {
  const params: any[] = [filtros.desde, filtros.hasta];
  // date -> timestamp (medianoche) -> AT TIME ZONE = ese instante en Ecuador.
  let where = `created_at >= ($1::date::timestamp AT TIME ZONE 'America/Guayaquil') AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'America/Guayaquil') AND factura_id IS NOT NULL`;
  if (filtros.proveedor) { params.push(filtros.proveedor); where += ` AND codigo_nodo = $${params.length}`; }
  const filas = await ds.query(
    `SELECT codigo_nodo, partner_order_id, pnr, booking_id_socio, numero_factura, status, currency,
            grand_total, reembolsado, to_char(created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI') AS fecha
       FROM public.vuelos_reservas_socio WHERE ${where} ORDER BY codigo_nodo, created_at`,
    params,
  );
  const reservas = filas.map((f: any) => {
    const vendido = Number(f.grand_total);
    const devuelto = Number(f.reembolsado);
    const neto = r2(vendido - devuelto);
    const comision = r2(neto * COMISION_BOOKING_PCT / 100);
    return {
      proveedor: f.codigo_nodo, partnerOrderId: f.partner_order_id, pnr: f.pnr, bookingIdAerolinea: f.booking_id_socio,
      factura: f.numero_factura, estado: f.status, fecha: f.fecha, moneda: f.currency,
      vendido: vendido.toFixed(2), devuelto: devuelto.toFixed(2), comisionBooking: comision.toFixed(2), aPagarAerolinea: r2(neto - comision).toFixed(2),
    };
  });
  const porProveedor: Record<string, any> = {};
  for (const r of reservas) {
    const t = (porProveedor[r.proveedor] ??= { proveedor: r.proveedor, reservas: 0, vendido: 0, devuelto: 0, comisionBooking: 0, aPagarAerolinea: 0 });
    t.reservas += 1;
    t.vendido = r2(t.vendido + Number(r.vendido));
    t.devuelto = r2(t.devuelto + Number(r.devuelto));
    t.comisionBooking = r2(t.comisionBooking + Number(r.comisionBooking));
    t.aPagarAerolinea = r2(t.aPagarAerolinea + Number(r.aPagarAerolinea));
  }
  return { desde: filtros.desde, hasta: filtros.hasta, comisionPct: COMISION_BOOKING_PCT, totales: Object.values(porProveedor), reservas };
}
