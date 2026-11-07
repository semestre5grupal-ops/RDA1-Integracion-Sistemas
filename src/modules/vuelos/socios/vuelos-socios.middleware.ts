import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RespuestaProxy, VuelosSociosService } from './vuelos-socios.service';
import { resumenDeReserva, VuelosSociosReservasService } from './vuelos-socios-reservas.service';
import { ordenDeReserva } from './vuelos-facturacion';
import { SincronizadorEventosVuelos } from './vuelos-eventos';
import { PasoVuelo, ResultadoPaso, trazaVuelos } from './vuelos-traza';
import { VuelosService } from '../vuelos.service';
import { propietarioDesde } from '../vuelos.controller';
import { esAdminPorToken } from '../../../core/auth/verificar-admin';

const RUTA_VUELOS = /^\/api\/v\d+\/vuelos\/(.+)$/;

/**
 * Se monta en `main.ts` DESPUÉS de los body parsers (necesita `req.body`).
 *
 *  - `POST   /vuelos/search`               → búsqueda agregada en las aerolíneas.
 *  - `POST   /vuelos/bookings` (hold socio) → cobra en MS_PAG, reserva en la
 *    aerolínea, guarda la copia para Mis Reservas; si la aerolínea falla,
 *    reembolsa (SAGA).
 *  - `GET    /vuelos/bookings`             → Mis Reservas con las reservas de socios.
 *  - `/vuelos/bookings/<NODO>~id/...`      → solo el dueño; se reenvía al socio.
 *    Al cancelar, Booking ejecuta el reembolso que calcula la aerolínea.
 *  - `GET    /vuelos/flights/{n}/status`   → pregunta a todas las aerolíneas.
 *  - Otras rutas con `<NODO>~` (hold, seatmap...) → se reenvían al socio.
 *  - Todo lo demás sigue al controlador local.
 */
@Injectable()
export class VuelosSociosMiddleware implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VuelosSociosMiddleware.name);
  readonly eventos: SincronizadorEventosVuelos;

  constructor(
    private readonly socios: VuelosSociosService,
    private readonly vuelosLocal: VuelosService,
    private readonly reservas: VuelosSociosReservasService,
  ) {
    this.eventos = new SincronizadorEventosVuelos(socios, reservas);
  }

  /** Lee el feed de eventos de las aerolíneas (check-in, cancelaciones) en segundo plano. */
  onModuleInit() {
    const apagado = String(process.env.VUELOS_EVENTOS_POLL ?? '').toLowerCase() === 'off';
    if (apagado || process.env.NODE_ENV === 'test' || this.socios.fuente() === 'local') return;
    this.eventos.iniciar(Math.max(5_000, Number(process.env.VUELOS_EVENTOS_INTERVALO_MS) || 20_000));
  }

  onModuleDestroy() {
    this.eventos.detener();
  }

  handler() {
    return (req: Request, res: Response, next: NextFunction) => {
      this.manejar(req, res).then(
        (atendida) => (atendida ? undefined : next()),
        (e) => {
          this.logger.error(`[vuelos-socios] error inesperado: ${e?.message}`, e?.stack);
          next(e);
        },
      );
    };
  }

  private async manejar(req: Request, res: Response): Promise<boolean> {
    const fuente = this.socios.fuente();
    if (fuente === 'local') return false;

    const [ruta, query = ''] = (req.originalUrl || req.url).split('?');
    const m = RUTA_VUELOS.exec(ruta);
    if (!m) return false;
    const segmentos = m[1].split('/').filter(Boolean);
    const entrantes = req.headers as Record<string, any>;
    const metodo = req.method.toUpperCase();

    // ── Búsqueda ──
    if (metodo === 'POST' && segmentos.length === 1 && segmentos[0] === 'search') {
      await this.buscar(req, res, fuente, entrantes);
      return true;
    }

    // ── Mis Reservas ──
    if (metodo === 'GET' && segmentos.length === 1 && segmentos[0] === 'bookings') {
      await this.listar(req, res, fuente);
      return true;
    }

    // ── Estado de vuelo ──
    if (metodo === 'GET' && segmentos[0] === 'flights' && segmentos[2] === 'status') {
      const r = await this.socios.primeraRespuesta('GET', segmentos, query, entrantes, req.headers.host);
      this.traza(entrantes, 'estado_vuelo', r.status < 300 ? 'ok' : 'aviso', `Vuelo ${segmentos[1]}: ${r.body?.status ?? `HTTP ${r.status}`}`, { nodo: r.headers['X-Booking-Node'] ?? null });
      if (fuente === 'mixto' && (r.status < 200 || r.status >= 300)) return false; // que responda la base local
      this.enviar(res, r);
      return true;
    }

    const nodo = VuelosSociosService.detectarNodo(segmentos, req.body);
    if (!nodo) return false;

    // ── Crear reserva en la aerolínea ──
    if (metodo === 'POST' && segmentos.length === 1 && segmentos[0] === 'bookings') {
      await this.reservar(req, res, nodo, entrantes);
      return true;
    }

    // ── Rutas de una reserva existente: solo el dueño (o un administrador verificado) ──
    if (segmentos[0] === 'bookings' && segmentos[1]) {
      const bookingId = decodeURIComponent(segmentos[1]);
      const copia = await this.reservas.obtener(bookingId);
      const propietario = propietarioDesde(entrantes['x-device-fingerprint'], entrantes['authorization']);
      const permitido = !!copia && (copia.propietarioId === propietario || await esAdminPorToken(entrantes['authorization']));
      if (!permitido) {
        this.enviar(res, problema(404, 'Reserva no encontrada', 'La reserva no existe o no pertenece a este usuario.'));
        return true;
      }
      const r = await this.socios.reenviar(nodo, metodo, segmentos, query, req.body, entrantes);
      await this.despuesDeReserva(metodo, segmentos, bookingId, copia, r, entrantes);
      this.enviar(res, r);
      return true;
    }

    const t0 = Date.now();
    const rg = await this.socios.reenviar(nodo, metodo, segmentos, query, req.body, entrantes);
    if (segmentos[0] === 'offers' && segmentos[1] === 'hold' && metodo === 'POST') {
      this.traza(entrantes, 'hold', rg.status < 300 ? 'ok' : 'error',
        rg.status < 300 ? `Hold creado · precio congelado ${rg.body?.lockedPrice?.total ?? '?'} ${rg.body?.lockedPrice?.currency ?? ''} · ${rg.body?.ttlMinutes ?? '?'} min` : `Hold rechazado (HTTP ${rg.status}): ${rg.body?.detail || rg.body?.title || ''}`,
        { nodo, ms: Date.now() - t0, monto: parseFloat(rg.body?.lockedPrice?.total) || null });
    } else {
      this.traza(entrantes, 'consulta', rg.status < 300 ? 'ok' : 'aviso', `${metodo} /${segmentos.join('/')} → HTTP ${rg.status}`, { nodo, ms: Date.now() - t0 });
    }
    this.enviar(res, rg);
    return true;
  }

  // ───────────────────────────── Búsqueda ─────────────────────────────

  private async buscar(req: Request, res: Response, fuente: string, entrantes: Record<string, any>) {
    const t0 = Date.now();
    const { offers, sources } = await this.socios.buscar(req.body, entrantes, req.headers.host);
    const it = req.body?.itineraries?.[0] || {};
    const okN = sources.filter((s) => s.ok).length;
    this.traza(
      entrantes,
      'busqueda',
      sources.length === 0 || okN === 0 ? 'error' : okN < sources.length ? 'aviso' : 'ok',
      `${it.origin ?? '?'} → ${it.destination ?? '?'} ${it.departureDate ?? ''}: ${offers.length} ofertas, ${okN}/${sources.length} aerolíneas respondieron` +
        (sources.some((s) => !s.ok) ? ` (sin respuesta: ${sources.filter((s) => !s.ok).map((s) => s.nombre).join(', ')})` : ''),
      { ms: Date.now() - t0 },
    );
    let todas = offers;
    if (fuente === 'mixto') {
      try {
        const local: any = await this.vuelosLocal.searchFlights(req.body);
        todas = [...offers, ...(local?.offers ?? [])];
      } catch (e: any) {
        sources.push({ codigoNodo: 'BOOKING_LOCAL', nombre: 'Base local', ok: false, ms: 0, ofertas: 0, error: e?.message });
      }
    }
    res.status(200).json({
      totalOffers: todas.length,
      offers: todas,
      meta: {
        fuente,
        totalOffers: todas.length,
        airlinesQueried: sources.length,
        airlinesOk: sources.filter((s) => s.ok).length,
      },
      sources,
    });
  }

  // ───────────────────────────── Reservar + pagar ─────────────────────────────

  private async reservar(req: Request, res: Response, nodo: string, entrantes: Record<string, any>) {
    const propietario = propietarioDesde(entrantes['x-device-fingerprint'], entrantes['authorization']);
    const idem = String(entrantes['idempotency-key'] || '').trim();
    if (!idem) {
      this.traza(entrantes, 'cobro', 'error', 'Sin Idempotency-Key: no se cobra', { nodo });
      this.enviar(res, problema(400, 'Falta Idempotency-Key', 'La cabecera Idempotency-Key es obligatoria para reservar.'));
      return;
    }
    const holdId = String(req.body?.holdId || '');

    // 1) Monto: se toma del hold de la aerolínea (precio congelado), no del cliente.
    const hold = await this.socios.reenviar(nodo, 'GET', ['offers', 'hold', holdId], '', null, entrantes);
    const monto = parseFloat(String(hold.body?.lockedPrice?.total ?? hold.body?.price?.total ?? hold.body?.grandTotal?.total ?? ''));
    if (hold.status < 200 || hold.status >= 300 || !Number.isFinite(monto) || monto <= 0) {
      this.traza(entrantes, 'hold', 'error', `No se pudo leer el precio del hold (HTTP ${hold.status}): no se cobra`, { nodo });
      this.enviar(
        res,
        hold.status >= 400
          ? hold
          : problema(409, 'Hold sin precio', 'La aerolínea no devolvió el precio congelado del hold (lockedPrice.total).'),
      );
      return;
    }
    // Un hold liberado o vencido no se cobra (algunas aerolíneas siguen
    // devolviendo su precio aunque ya no esté activo).
    const estadoHold = String(hold.body?.status ?? 'HELD').toUpperCase();
    const restante = Number(hold.body?.remainingSeconds);
    if (estadoHold !== 'HELD' || (Number.isFinite(restante) && restante <= 0)) {
      this.traza(entrantes, 'hold', 'error', `Hold ${estadoHold}${Number.isFinite(restante) ? ` (${restante}s)` : ''}: no se cobra`, { nodo });
      this.enviar(res, problema(410, 'Hold no activo', `El hold está ${estadoHold === 'HELD' ? 'vencido' : estadoHold}. Vuelve a seleccionar la tarifa. No se realizó ningún cobro.`));
      return;
    }

    // 1b) Datos de pasajeros en el formato del contrato (antes de cobrar):
    //     nacionalidad ISO alfa-2 (EC, no ECU) y teléfono E.164 (+593...).
    if (Array.isArray(req.body?.passengers)) {
      req.body = { ...req.body, passengers: req.body.passengers.map(normalizarPasajero) };
    }

    // 2) Cobro en MS_PAG (idempotente con la misma clave del cliente).
    const tCobro = Date.now();
    const cobro = await this.reservas.cobrar(monto, idem, propietario);
    this.traza(entrantes, 'cobro', cobro.ok ? 'ok' : 'error',
      cobro.ok ? `Pago aprobado · ${cobro.paymentReference}` : `Pago rechazado: ${cobro.detalle ?? cobro.estado ?? ''}`,
      { nodo, ms: Date.now() - tCobro, monto });
    if (!cobro.ok) {
      this.enviar(res, problema(cobro.status === 402 ? 402 : cobro.status ?? 502, 'Pago no aprobado', cobro.detalle ?? 'El cobro fue rechazado.'));
      return;
    }

    // 3) Reserva en la aerolínea con la referencia de pago real.
    // Contrato v2: la aerolínea sabe quién vuela (passengers), quién vendió y con
    // qué orden (salesChannel) y cuánto cobró Booking (payment.amount, que valida
    // contra el precio congelado: AMOUNT_MISMATCH). Así puede conciliar.
    const partnerOrderId = ordenDeReserva(idem);
    const moneda = String(hold.body?.lockedPrice?.currency ?? 'USD');
    // La aerolínea puede validar esta referencia en GET /pagos/{paymentReference}
    // (contrato de pagos v2) mientras procesa la reserva: se registra antes.
    await this.reservas.registrarReferenciaPago(cobro.paymentReference!, cobro.transaccionId, nodo, monto, moneda);
    const cuerpo = {
      ...(req.body ?? {}),
      payment: {
        ...(req.body?.payment ?? {}),
        paymentReference: cobro.paymentReference,
        amount: { currency: moneda, total: monto.toFixed(2) },
        provider: 'BOOKING_PROTOTIPO',
      },
      salesChannel: { ...(req.body?.salesChannel ?? {}), partnerId: 'BOOKING_PROTOTIPO', partnerOrderId },
    };
    const tRes = Date.now();
    // En un reintento (el intento anterior falló y se reembolsó) la aerolínea
    // necesita otra Idempotency-Key: con la misma y otros datos responde 409.
    const cabecerasReserva = cobro.reintento ? { ...entrantes, 'idempotency-key': randomUUID() } : entrantes;
    const r = await this.socios.reenviar(nodo, 'POST', ['bookings'], '', cuerpo, cabecerasReserva);
    const confirmo = r.status >= 200 && r.status < 300 && !!r.body?.bookingId;
    this.traza(entrantes, 'reserva_aerolinea', confirmo ? 'ok' : 'error',
      confirmo ? `Aerolínea confirmó · PNR ${r.body?.pnr ?? '?'}` : `Aerolínea rechazó (HTTP ${r.status}): ${r.body?.detail || r.body?.title || ''}`,
      { nodo, ms: Date.now() - tRes, monto });

    // 4) SAGA: si la aerolínea no confirmó, se devuelve el dinero.
    if (r.status < 200 || r.status >= 300 || !r.body?.bookingId) {
      let devuelto = 0;
      if (cobro.transaccionId) {
        devuelto = await this.reservas.reembolsar(cobro.transaccionId, monto, `Aerolínea ${nodo} rechazó la reserva (HTTP ${r.status})`);
        this.traza(entrantes, 'reembolso', devuelto > 0 ? 'ok' : 'error',
          devuelto > 0 ? `SAGA: se devolvieron ${devuelto.toFixed(2)}` : 'SAGA: el reembolso FALLÓ, el cliente quedó cobrado sin reserva', { nodo, monto });
      }
      // Solo se dice "se reembolsó" si el reembolso de verdad se hizo.
      const aviso = devuelto > 0 || !cobro.transaccionId
        ? 'Se reembolsó el cobro.'
        : 'El reembolso automático falló: el cobro quedó pendiente de devolución.';
      this.enviar(res, r.status >= 400 ? withDetalle(r, aviso) : problema(502, 'Reserva no confirmada', `La aerolínea no devolvió bookingId. ${aviso}`));
      return;
    }

    // 5) Copia para Mis Reservas.
    try {
      await this.reservas.registrar({ bookingId: r.body.bookingId, codigoNodo: nodo, propietarioId: propietario, reserva: r.body, montoCobrado: monto, cobro });
      this.traza(entrantes, 'copia', 'ok', 'Copia guardada para Mis Reservas', { nodo });
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] No se guardó la copia de ${r.body.bookingId}: ${e?.message}`);
      this.traza(entrantes, 'copia', 'error', `No se guardó la copia: ${e?.message}`, { nodo });
    }
    // 5b) Cliente cross-platform: el cliente de Booking y con qué id lo conoce la aerolínea.
    const titular = (req.body?.passengers ?? []).find((p: any) => p?.passengerType !== 'INFANT') ?? req.body?.passengers?.[0] ?? {};
    void this.reservas.mapearClienteSocio({
      email: emailDesdeJwt(entrantes['authorization']) || String(titular?.contact?.email ?? ''),
      nombre: `${titular.firstName ?? ''} ${titular.lastName ?? ''}`.trim() || undefined,
      documento: titular.documentNumber, telefono: titular?.contact?.phone,
      codigoNodo: nodo, idExterno: propietario,
      metadata: { propietario, ultimaReserva: r.body.bookingId, pnr: r.body.pnr ?? null, ordenBooking: partnerOrderId },
    });

    // 6) Factura al cliente + comisión y liquidación de la aerolínea.
    const lp = hold.body?.lockedPrice ?? {};
    const factura = await this.reservas.facturar({
      bookingId: r.body.bookingId,
      codigoNodo: nodo,
      propietarioId: propietario,
      reserva: r.body,
      pasajeros: req.body?.passengers ?? [],
      total: monto,
      moneda,
      base: lp.baseFare != null ? parseFloat(String(lp.baseFare)) : null,
      impuestos: lp.taxes != null ? parseFloat(String(lp.taxes)) : null,
      transaccionId: cobro.transaccionId ?? null,
      partnerOrderId,
      resumen: resumenDeReserva(r.body),
    });
    this.traza(entrantes, 'factura', factura ? 'ok' : 'error',
      factura ? `Factura ${factura.numero} · orden ${partnerOrderId}` : 'No se pudo emitir la factura (la reserva sigue confirmada)', { nodo, monto });
    this.traza(entrantes, 'confirmada', 'ok', `Reserva confirmada · ${r.body.bookingId}`, { nodo, monto });
    r.body = {
      ...r.body,
      payment: { ...(r.body.payment ?? {}), paymentReference: cobro.paymentReference },
      salesChannel: r.body.salesChannel ?? { partnerId: 'BOOKING_PROTOTIPO', partnerOrderId },
      ...(factura ? { factura } : {}),
    };
    this.enviar(res, r);
  }

  private async despuesDeReserva(metodo: string, segmentos: string[], bookingId: string, copia: any, r: RespuestaProxy, entrantes: Record<string, any>) {
    if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') return;
    try {
      if (metodo === 'POST' && segmentos[2] === 'check-in') {
        if (await this.reservas.marcarCheckin(bookingId, new Date(), 'booking')) {
          this.traza(entrantes, 'checkin', 'ok', `Check-in hecho desde Booking · ${bookingId}`, { nodo: copia.codigoNodo });
        }
        return;
      }
      if (metodo === 'GET' && segmentos.length === 2) {
        await this.reservas.actualizarDesdeSocio(bookingId, r.body);
        const factura = await this.reservas.factura(bookingId);
        if (factura) r.body = { ...r.body, factura };
        // La aerolínea deja la reserva en CONFIRMED tras el check-in; Booking
        // muestra que el pasajero ya se presentó.
        if (copia.status === 'CHECKED_IN') r.body = { ...r.body, status: 'CHECKED_IN' };
      } else if (metodo === 'POST' && segmentos[2] === 'cancel') {
        // Contrato v2: "La aerolínea calcula; Booking ejecuta el reembolso al cliente."
        const monto = parseFloat(String(r.body?.refund?.amount ?? r.body?.refundAmount ?? ''));
        let devuelto = 0;
        if (copia.transaccionId && Number.isFinite(monto) && monto > 0) {
          devuelto = await this.reservas.reembolsar(copia.transaccionId, monto, `Cancelación ${bookingId}`);
          if (devuelto <= 0) this.traza(entrantes, 'reembolso', 'error', `Cancelación ${bookingId}: el reembolso FALLÓ`, { nodo: copia.codigoNodo, monto });
        }
        await this.reservas.marcarEstado(bookingId, String(r.body.status || 'CANCELLED'), devuelto);
        this.traza(entrantes, 'cancelacion', 'ok', `Reserva ${String(r.body.status || 'CANCELLED')} · reembolso ${devuelto.toFixed(2)}`, { nodo: copia.codigoNodo, monto: devuelto });
        if (devuelto > 0) {
          const nota = await this.reservas.notaCredito({
            bookingId, monto: devuelto, motivo: `Cancelación ${r.body.reasonCode ?? ''}`.trim(),
            transaccionId: copia.transaccionId, claveReembolso: String(r.body?.refund?.refundId ?? r.body?.cancelledAt ?? 'cancelacion'),
          });
          this.traza(entrantes, 'factura', nota ? 'ok' : 'aviso',
            nota ? `Nota de crédito ${nota.numero} · ${nota.monto}` : 'Sin nota de crédito (reserva sin factura)', { nodo: copia.codigoNodo, monto: devuelto });
          r.body = {
            ...r.body,
            refund: { ...(r.body.refund ?? {}), executedByBooking: true, executedAmount: devuelto.toFixed(2), ...(nota ? { creditNote: nota } : {}) },
          };
        }
      }
    } catch (e: any) {
      this.logger.error(`[vuelos-socios] post-proceso ${metodo} ${bookingId}: ${e?.message}`);
    }
  }

  // ───────────────────────────── Mis Reservas ─────────────────────────────

  private async listar(req: Request, res: Response, fuente: string) {
    const q = req.query as Record<string, string | undefined>;
    const limite = Math.min(Math.max(Number(q.limit) || 10, 1), 50);
    const propietario = propietarioDesde(req.headers['x-device-fingerprint'] as string, req.headers['authorization'] as string);

    // Paginación: las reservas de socios van en la primera página; las páginas
    // siguientes (cursor) solo existen para la base local en modo mixto.
    if (q.cursor) {
      if (fuente === 'mixto') {
        res.status(200).json(await this.vuelosLocal.listarReservas(q as any, propietario));
      } else {
        res.status(200).json({ items: [], nextCursor: null });
      }
      return;
    }

    const deSocios = await this.reservas.listar(propietario, { status: q.status, pnr: q.pnr, limit: limite });
    let items: any[] = deSocios.map((r) => ({
      bookingId: r.bookingId,
      pnr: r.pnr,
      status: r.status,
      origin: r.origin,
      destination: r.destination,
      departureDate: r.departureDate,
      grandTotal: { currency: r.currency, total: r.grandTotal.toFixed(2) },
      createdAt: r.createdAt,
      provider: { nodeCode: r.codigoNodo },
    }));
    let nextCursor: string | null = null;
    if (fuente === 'mixto') {
      try {
        const local: any = await this.vuelosLocal.listarReservas({ ...q, limit: limite } as any, propietario);
        items = [...items, ...(local?.items ?? [])];
        nextCursor = local?.nextCursor ?? null;
      } catch (e: any) {
        this.logger.warn(`[vuelos-socios] listado local falló: ${e?.message}`);
      }
    }
    items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    res.status(200).json({ items: items.slice(0, limite), nextCursor });
  }

  // ───────────────────────────── Util ─────────────────────────────

  /** Deja un paso en la traza en vivo, con el correlation ID de la compra. */
  private traza(entrantes: Record<string, any>, paso: PasoVuelo, resultado: ResultadoPaso, detalle: string, extra: { nodo?: string | null; ms?: number | null; monto?: number | null } = {}) {
    try {
      trazaVuelos.registrar({ correlacion: String(entrantes['x-correlation-id'] || 'sin-correlacion'), paso, resultado, detalle, ...extra });
    } catch {
      /* la traza nunca debe romper una reserva */
    }
  }

  private enviar(res: Response, r: RespuestaProxy) {
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
    if (r.body === null || r.body === undefined || r.body === '') {
      res.status(r.status).end();
    } else if (typeof r.body === 'object') {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(r.status).send(JSON.stringify(r.body));
    } else {
      res.status(r.status).send(r.body);
    }
  }
}

function problema(status: number, title: string, detail: string): RespuestaProxy {
  return {
    status,
    body: { type: `https://httpstatuses.com/${status}`, title, status, detail, correlation_id: `corr-${randomUUID()}` },
    headers: { 'Content-Type': 'application/problem+json' },
  };
}

function withDetalle(r: RespuestaProxy, extra: string): RespuestaProxy {
  if (r.body && typeof r.body === 'object') {
    return { ...r, body: { ...r.body, detail: [r.body.detail, extra].filter(Boolean).join(' ') } };
  }
  return r;
}

const ALFA3_A_ALFA2: Record<string, string> = {
  ECU: 'EC', COL: 'CO', PER: 'PE', ARG: 'AR', CHL: 'CL', USA: 'US', MEX: 'MX', ESP: 'ES', BRA: 'BR',
  BOL: 'BO', VEN: 'VE', URY: 'UY', PRY: 'PY', PAN: 'PA', CRI: 'CR', CAN: 'CA', FRA: 'FR', DEU: 'DE',
  ITA: 'IT', GBR: 'GB', PRT: 'PT', CHN: 'CN', JPN: 'JP',
};

/** Nacionalidad a ISO alfa-2 y teléfono a E.164 (Ecuador por defecto). */
export function normalizarPasajero(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const out = { ...p };
  const nac = String(p.nationality ?? '').trim().toUpperCase();
  if (nac.length === 3 && ALFA3_A_ALFA2[nac]) out.nationality = ALFA3_A_ALFA2[nac];
  else if (nac) out.nationality = nac;
  if (p.contact && typeof p.contact === 'object' && p.contact.phone != null) {
    let tel = String(p.contact.phone).replace(/[\s().-]/g, '');
    if (tel.startsWith('00')) tel = '+' + tel.slice(2);
    else if (/^0\d{8,9}$/.test(tel)) tel = '+593' + tel.slice(1); // 0991234567 → +593991234567
    else if (/^593\d{8,9}$/.test(tel)) tel = '+' + tel;
    out.contact = { ...p.contact, phone: tel };
  }
  return out;
}

/** Email del JWT de Supabase (sin verificar firma: solo para el mapeo de cliente). */
function emailDesdeJwt(authorization: unknown): string | null {
  const m = /^Bearer\s+([^.]+)\.([^.]+)\./.exec(String(authorization ?? ''));
  if (!m) return null;
  try {
    const email = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8'))?.email;
    return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}
