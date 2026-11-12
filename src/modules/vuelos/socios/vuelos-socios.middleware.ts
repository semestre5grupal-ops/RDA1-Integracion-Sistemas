import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RespuestaProxy, VuelosSociosService } from './vuelos-socios.service';
import { resumenDeReserva, VuelosSociosReservasService } from './vuelos-socios-reservas.service';
import { ordenDeReserva, precioConRecargo } from './vuelos-facturacion';
import { montoReembolso, SincronizadorEventosVuelos } from './vuelos-eventos';
import { PasoVuelo, ResultadoPaso, trazaVuelos } from './vuelos-traza';
import { AsientoRef, limpiarAsientos, minutosBloqueo, VuelosAsientosBloqueo } from './vuelos-asientos-bloqueo';
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
 *  - `/vuelos/offers/<NODO>~id/seat-locks`   → bloqueo de asientos en tiempo real
 *    (propio de Booking; a la aerolínea no se le envía nada).
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
    @Optional() bloqueos?: VuelosAsientosBloqueo,
  ) {
    this.eventos = new SincronizadorEventosVuelos(socios, reservas);
    this.bloqueos = bloqueos ?? new VuelosAsientosBloqueo();
  }

  private readonly bloqueos: VuelosAsientosBloqueo;
  /** Última vez que se refrescó cada reserva contra la aerolínea (Mis Reservas). */
  private readonly refrescadas = new Map<string, number>();
  private readonly holdsVistos = new Map<string, number>();

  /** Lee el feed de eventos de las aerolíneas (check-in, cancelaciones) en segundo plano. */
  onModuleInit() {
    const apagado = String(process.env.VUELOS_EVENTOS_POLL ?? '').toLowerCase() === 'off';
    if (apagado || process.env.NODE_ENV === 'test' || this.socios.fuente() === 'local') return;
    this.eventos.iniciar(Math.max(5_000, Number(process.env.VUELOS_EVENTOS_INTERVALO_MS) || 10_000));
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

    // ── Bloqueo de asientos en tiempo real (propio de Booking) ──
    if (segmentos[0] === 'offers' && segmentos.length === 3 && segmentos[2].toLowerCase() === 'seat-locks') {
      await this.bloqueoAsientos(req, res, nodo, metodo, entrantes);
      return true;
    }

    // ── Rutas de una reserva existente: solo el dueño (o un administrador verificado) ──
    if (segmentos[0] === 'bookings' && segmentos[1]) {
      // La acción se compara en minúsculas: `/CANCEL` no puede saltarse el reembolso.
      if (segmentos[2]) segmentos[2] = segmentos[2].toLowerCase();
      const bookingId = decodeURIComponent(segmentos[1]);
      const copia = await this.reservas.obtener(bookingId);
      const propietario = propietarioDesde(entrantes['x-device-fingerprint'], entrantes['authorization']);
      const permitido = !!copia && (copia.propietarioId === propietario || await esAdminPorToken(entrantes['authorization']));
      if (!permitido) {
        this.enviar(res, problema(404, 'Reserva no encontrada', 'La reserva no existe o no pertenece a este usuario.'));
        return true;
      }
      // Mientras Booking cancela, el lector de eventos no procesa esa misma cancelación.
      const cancelando = metodo === 'POST' && segmentos[2] === 'cancel';
      if (cancelando) this.eventos.enCurso.add(bookingId);
      try {
        const r = await this.socios.reenviar(nodo, metodo, segmentos, query, req.body, entrantes);
        await this.despuesDeReserva(metodo, segmentos, bookingId, copia, r, entrantes);
        this.enviar(res, r);
      } finally {
        if (cancelando) this.eventos.enCurso.delete(bookingId);
      }
      return true;
    }

    const t0 = Date.now();
    // `holdId` en el mapa de asientos es de Booking (saber qué bloqueos son míos): no va a la aerolínea.
    const esMapa = metodo === 'GET' && segmentos[0] === 'offers' && segmentos[2] === 'seatmap';
    const params = new URLSearchParams(query);
    const holdMapa = esMapa && params.get('holdId') ? this.bloqueos.actual(String(params.get('holdId'))).holdId : null;
    if (esMapa) params.delete('holdId');
    const rg = await this.socios.reenviar(nodo, metodo, segmentos, esMapa ? params.toString() : query, req.body, entrantes);
    if (esMapa && rg.status >= 200 && rg.status < 300 && rg.body && typeof rg.body === 'object') {
      const otros = await this.bloqueos.deOtros(nodo, holdMapa, params.get('segmentId'));
      if (otros.length) rg.body = marcarBloqueados(rg.body, new Set(otros.map((a) => a.seatNumber)));
      // Los asientos que la aerolínea tiene apartados para MI hold me salen libres (son míos).
      const mio = holdMapa ? await this.bloqueos.hold(holdMapa) : null;
      const propios = (mio?.asientos ?? []).filter((a) => !params.get('segmentId') || a.segmentId === params.get('segmentId'));
      if (propios.length) rg.body = marcarPropios(rg.body, new Set(propios.map((a) => a.seatNumber)));
    }
    // Hold liberado por el cliente: se sueltan también sus asientos.
    if (metodo === 'DELETE' && segmentos[0] === 'offers' && segmentos[1] === 'hold' && segmentos[2]) {
      const pedido = decodeURIComponent(segmentos[2]);
      await this.bloqueos.liberar(pedido);
      void this.bloqueos.olvidarHold(pedido);
      // Si la pantalla soltó un hold ya reemplazado, se suelta también el vigente.
      const vigente = this.bloqueos.actual(pedido).holdId;
      if (vigente !== pedido) {
        await this.bloqueos.liberar(vigente);
        void this.bloqueos.olvidarHold(vigente);
        void this.socios.reenviar(nodo, 'DELETE', ['offers', 'hold', vigente], '', null, entrantes).catch(() => undefined);
      }
    }
    // Hold (crear o consultar): Booking agrega lo que cobrará al cliente.
    if (segmentos[0] === 'offers' && segmentos[1] === 'hold' && rg.status < 300 && rg.body?.lockedPrice?.total != null) {
      const base = parseFloat(String(rg.body.lockedPrice.total));
      if (Number.isFinite(base) && base > 0) {
        rg.body = { ...rg.body, bookingPrice: precioBooking(precioConRecargo(base, await this.reservas.recargoPct()), rg.body.lockedPrice.currency) };
      }
    }
    if (segmentos[0] === 'offers' && segmentos[1] === 'hold' && metodo === 'POST' && segmentos.length === 2 && rg.status < 300 && rg.body?.holdId) {
      await this.bloqueos.guardarHold(String(rg.body.holdId), nodo, req.body, limpiarAsientos(req.body?.assignedSeats));
    }
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
      // Los precios de las ofertas son los de la aerolínea; Booking cobra además
      // su cargo por servicio con este porcentaje (el frontend muestra el final).
      bookingFee: { percentage: await this.reservas.recargoPct() },
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
    // Si la pantalla quedó con un hold ya reemplazado (cambio de asiento), se usa el vigente.
    const holdId = this.bloqueos.actual(String(req.body?.holdId || '')).holdId;
    if (req.body && typeof req.body === 'object' && holdId && req.body.holdId !== holdId) req.body = { ...req.body, holdId };

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

    // 1b') Asientos: si otra compra en curso ya tiene bloqueado alguno, no se cobra.
    const pedidos = limpiarAsientos((req.body?.passengers ?? []).flatMap((p: any) => p?.assignedSeats ?? []));
    const ajenos = await this.bloqueos.tomadosPorOtros(nodo, holdId, pedidos);
    if (ajenos.length) {
      this.traza(entrantes, 'asiento', 'aviso', `Asiento ${ajenos.map((a) => a.seatNumber).join(', ')} bloqueado por otra compra: no se cobra`, { nodo });
      this.enviar(res, asientoTomado(ajenos, 'No se realizó ningún cobro.'));
      return;
    }

    // 1c) Precio al cliente = precio de la aerolínea (monto) + recargo de Booking.
    //     A la aerolínea se le envía y se le paga SOLO su precio (contrato sin cambios).
    const precio = precioConRecargo(monto, await this.reservas.recargoPct());

    // 2) Cobro en MS_PAG (idempotente con la misma clave del cliente).
    const tCobro = Date.now();
    const cobro = await this.reservas.cobrar(precio.total, idem, propietario);
    this.traza(entrantes, 'cobro', cobro.ok ? 'ok' : 'error',
      cobro.ok
        ? `Pago aprobado ${precio.total.toFixed(2)} (aerolínea ${precio.aerolinea.toFixed(2)} + servicio ${precio.cargo.toFixed(2)}) · ${cobro.paymentReference}`
        : `Pago rechazado: ${cobro.detalle ?? cobro.estado ?? ''}`,
      { nodo, ms: Date.now() - tCobro, monto: precio.total });
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
        devuelto = await this.reservas.reembolsar(cobro.transaccionId, precio.total, `Aerolínea ${nodo} rechazó la reserva (HTTP ${r.status})`);
        this.traza(entrantes, 'reembolso', devuelto > 0 ? 'ok' : 'error',
          devuelto > 0 ? `SAGA: se devolvieron ${devuelto.toFixed(2)}` : 'SAGA: el reembolso FALLÓ, el cliente quedó cobrado sin reserva', { nodo, monto: precio.total });
      }
      // Solo se dice "se reembolsó" si el reembolso de verdad se hizo.
      const aviso = devuelto > 0 || !cobro.transaccionId
        ? 'Se reembolsó el cobro.'
        : 'El reembolso automático falló: el cobro quedó pendiente de devolución.';
      this.enviar(res, r.status >= 400 ? withDetalle(r, aviso) : problema(502, 'Reserva no confirmada', `La aerolínea no devolvió bookingId. ${aviso}`));
      return;
    }

    // La aerolínea ya marca esos asientos como ocupados: se suelta el bloqueo de Booking.
    void this.bloqueos.liberar(holdId);
    void this.bloqueos.olvidarHold(holdId);

    // 5) Copia para Mis Reservas.
    try {
      await this.reservas.registrar({
        bookingId: r.body.bookingId, codigoNodo: nodo, propietarioId: propietario, reserva: r.body,
        montoCobrado: precio.total, montoAerolinea: precio.aerolinea, cargo: precio.cargo, cobro,
      });
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
      total: precio.total,
      moneda,
      base: lp.baseFare != null ? parseFloat(String(lp.baseFare)) : null,
      impuestos: lp.taxes != null ? parseFloat(String(lp.taxes)) : null,
      cargo: precio.cargo,
      transaccionId: cobro.transaccionId ?? null,
      partnerOrderId,
      resumen: resumenDeReserva(r.body),
    });
    this.traza(entrantes, 'factura', factura ? 'ok' : 'error',
      factura ? `Factura ${factura.numero} · orden ${partnerOrderId}` : 'No se pudo emitir la factura (la reserva sigue confirmada)', { nodo, monto: precio.total });
    this.traza(entrantes, 'confirmada', 'ok', `Reserva confirmada · ${r.body.bookingId}`, { nodo, monto: precio.total });
    r.body = {
      ...r.body,
      payment: { ...(r.body.payment ?? {}), paymentReference: cobro.paymentReference },
      salesChannel: r.body.salesChannel ?? { partnerId: 'BOOKING_PROTOTIPO', partnerOrderId },
      bookingPrice: precioBooking(precio, moneda),
      ...(factura ? { factura } : {}),
    };
    this.enviar(res, r);
  }

  private async despuesDeReserva(metodo: string, segmentos: string[], bookingId: string, copia: any, r: RespuestaProxy, entrantes: Record<string, any>) {
    const pnr = copia?.pnr ? `PNR ${copia.pnr}` : bookingId;
    // Check-in o cancelación rechazados por la aerolínea: quedan en el panel en vivo con el motivo.
    if ((r.status < 200 || r.status >= 300) && metodo === 'POST' && (segmentos[2] === 'check-in' || segmentos[2] === 'cancel')) {
      const motivo = String(r.body?.code ?? r.body?.detail ?? r.body?.title ?? `HTTP ${r.status}`).slice(0, 160);
      this.traza(entrantes, segmentos[2] === 'check-in' ? 'checkin' : 'cancelacion', 'aviso',
        `${segmentos[2] === 'check-in' ? 'Check-in' : 'Cancelación'} rechazado por la aerolínea · ${pnr} · ${motivo}`, { nodo: copia?.codigoNodo });
      return;
    }
    if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') return;
    try {
      if (metodo === 'POST' && segmentos[2] === 'check-in') {
        if (await this.reservas.marcarCheckin(bookingId, new Date(), 'booking')) {
          this.traza(entrantes, 'checkin', 'ok', `Check-in hecho desde Booking · ${pnr}`, { nodo: copia.codigoNodo });
        }
        return;
      }
      if (metodo === 'GET' && segmentos.length === 2) {
        await this.reservas.actualizarDesdeSocio(bookingId, r.body);
        const factura = await this.reservas.factura(bookingId);
        if (factura) r.body = { ...r.body, factura };
        if (copia.cargoServicio != null && copia.montoAerolinea != null) {
          r.body = { ...r.body, bookingPrice: precioBooking({ aerolinea: copia.montoAerolinea, cargo: copia.cargoServicio, total: copia.grandTotal, pct: copia.montoAerolinea > 0 ? Math.round((copia.cargoServicio / copia.montoAerolinea) * 10000) / 100 : 0 }, copia.currency) };
        }
        // La aerolínea deja la reserva en CONFIRMED tras el check-in; Booking
        // muestra que el pasajero ya se presentó.
        if (copia.status === 'CHECKED_IN') r.body = { ...r.body, status: 'CHECKED_IN' };
      } else if (metodo === 'POST' && segmentos[2] === 'cancel') {
        // Contrato v2: "La aerolínea calcula; Booking ejecuta el reembolso al cliente."
        const monto = montoReembolso(r.body);
        let devuelto = 0;
        if (copia.transaccionId && monto > 0) {
          devuelto = await this.reservas.reembolsar(copia.transaccionId, monto, `Cancelación ${bookingId}`);
          if (devuelto <= 0) this.traza(entrantes, 'reembolso', 'error', `Cancelación ${pnr}: el reembolso FALLÓ`, { nodo: copia.codigoNodo, monto });
        }
        await this.reservas.marcarEstado(bookingId, String(r.body.status || 'CANCELLED'), devuelto);
        this.traza(entrantes, 'cancelacion', 'ok', `Cancelada desde Booking · ${pnr} · la aerolínea devuelve ${monto.toFixed(2)}`, { nodo: copia.codigoNodo, monto: devuelto });
        if (devuelto > 0) this.traza(entrantes, 'reembolso', 'ok', `Reembolso al cliente · ${pnr} · ${devuelto.toFixed(2)} (el cargo por servicio no se devuelve)`, { nodo: copia.codigoNodo, monto: devuelto });
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

    let deSocios = await this.reservas.listar(propietario, { status: q.status, pnr: q.pnr, limit: limite });
    // Lo que pasó en la web de la aerolínea (check-in, cancelación) se refleja aquí.
    if (await this.refrescarDesdeAerolineas(deSocios)) {
      deSocios = await this.reservas.listar(propietario, { status: q.status, pnr: q.pnr, limit: limite });
    }
    let items: any[] = deSocios.map((r) => ({
      bookingId: r.bookingId,
      pnr: r.pnr,
      status: r.status,
      origin: r.origin,
      destination: r.destination,
      departureDate: r.departureDate,
      departureAt: r.departureAt ?? null,
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

  /**
   * Pone al día las reservas activas con lo que diga la aerolínea, sin depender
   * de que emita eventos: (1) lee ya el feed de eventos y (2) consulta el detalle
   * de cada reserva activa (como mucho cada 20 s por reserva). Espera poco: lo que
   * no llegue a tiempo se aplica en segundo plano y sale en la siguiente lectura.
   */
  private async refrescarDesdeAerolineas(lista: Array<{ bookingId: string; codigoNodo: string; status: string; departureDate: string | null }>): Promise<boolean> {
    if (process.env.NODE_ENV === 'test' && !process.env.VUELOS_REFRESCO_EN_TEST) return false;
    const ayer = new Date(Date.now() - 36 * 3_600_000).toISOString().slice(0, 10);
    const activas = lista
      .filter((r) => r.status !== 'CANCELLED' && (!r.departureDate || r.departureDate >= ayer))
      .slice(0, 8);
    if (!activas.length) return false;
    const ahora = Date.now();
    const tocan = activas.filter((r) => ahora - (this.refrescadas.get(r.bookingId) ?? 0) > 20_000);
    for (const r of tocan) this.refrescadas.set(r.bookingId, ahora);
    if (this.refrescadas.size > 5_000) this.refrescadas.clear();
    const trabajo = (async () => {
      let cambios = (await this.eventos.cicloRapido()) > 0;
      const res = await Promise.all(tocan.map((r) => this.eventos.reconciliar(r.codigoNodo, r.bookingId).catch(() => false)));
      return cambios || res.some(Boolean);
    })().catch(() => false);
    const limite = new Promise<boolean>((ok) => setTimeout(() => ok(false), 3_500).unref?.());
    return Promise.race([trabajo, limite]);
  }

  // ───────────────────────────── Bloqueo de asientos ─────────────────────────────

  /**
   * `PUT    /vuelos/offers/{offerId}/seat-locks`  { holdId, seats:[{segmentId,seatNumber}], expiresAt? }
   *         deja bloqueados exactamente esos asientos para la compra (409 si alguno ya es de otra).
   * `GET    /vuelos/offers/{offerId}/seat-locks?holdId=&segmentId=`  asientos bloqueados por otras compras.
   * `DELETE /vuelos/offers/{offerId}/seat-locks?holdId=`  suelta los de esta compra.
   */
  private async bloqueoAsientos(req: Request, res: Response, nodo: string, metodo: string, entrantes: Record<string, any>) {
    const q = req.query as Record<string, string | undefined>;
    const pedido = String((metodo === 'PUT' ? req.body?.holdId : q.holdId) ?? '').trim().slice(0, 200);
    // La pantalla puede llegar con un hold que Booking ya reemplazó: se trabaja con el vigente
    // y se le devuelve, para que no queden asientos bloqueados a nombre de un hold que ya no existe.
    const vigente = pedido ? this.bloqueos.actual(pedido) : { holdId: '', hold: null };
    const holdId = vigente.holdId;
    const holdParaPantalla = pedido && holdId !== pedido ? vigente.hold : null;
    if (metodo === 'GET') {
      const locks = await this.bloqueos.deOtros(nodo, holdId || null, q.segmentId || null);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ locks, ttlMinutes: minutosBloqueo() });
      return;
    }
    if (!holdId || !holdId.startsWith(`${nodo}~`)) {
      this.enviar(res, problema(400, 'Falta holdId', 'Indica el holdId de la compra a la que pertenecen los asientos.'));
      return;
    }
    if (metodo === 'DELETE') {
      await this.bloqueos.liberar(holdId);
      res.status(204).end();
      return;
    }
    if (metodo !== 'PUT') {
      this.enviar(res, problema(405, 'Método no permitido', 'Usa GET, PUT o DELETE.'));
      return;
    }
    const asientos = limpiarAsientos(req.body?.seats);
    // Solo bloquea quien tiene un hold vivo en la aerolínea (nadie puede bloquear asientos "al aire").
    if (asientos.length && !(await this.holdVigente(nodo, holdId, entrantes))) {
      await this.bloqueos.liberar(holdId);
      this.enviar(res, problema(410, 'Hold no activo', 'El hold venció o fue liberado. Vuelve a seleccionar la tarifa.'));
      return;
    }
    // Dura lo que dure el hold de la aerolínea, con tope de 15 min.
    const tope = Date.now() + minutosBloqueo() * 60_000;
    const delHold = Date.parse(String(req.body?.expiresAt ?? ''));
    const expira = new Date(Number.isFinite(delHold) && delHold > Date.now() ? Math.min(delHold, tope) : tope);
    const { locked, taken } = await this.bloqueos.fijar(nodo, holdId, asientos, expira);
    if (locked.length || taken.length) {
      this.traza(entrantes, 'asiento', taken.length ? 'aviso' : 'ok',
        taken.length
          ? `Asiento ${taken.map((a) => a.seatNumber).join(', ')} ya lo tiene otra compra`
          : `Asiento ${locked.map((a) => a.seatNumber).join(', ')} bloqueado hasta ${expira.toISOString().slice(11, 16)} UTC`,
        { nodo });
    }
    if (taken.length) {
      const r = asientoTomado(taken, 'Elige otro asiento.');
      r.body = { ...r.body, locked, expiresAt: expira.toISOString(), holdId, ...(holdParaPantalla ? { hold: holdParaPantalla } : {}) };
      this.enviar(res, r);
      return;
    }

    // En la aerolínea: el hold se rehace con `assignedSeats` (contrato v2) para
    // que ella también vea el asiento apartado. Si no lo acepta, sigue el bloqueo de Booking.
    const enAerolinea = await this.apartarEnAerolinea(nodo, holdId, asientos, entrantes);
    if (enAerolinea.tomados) {
      await this.bloqueos.fijar(nodo, holdId, enAerolinea.previos, expira);
      const r = asientoTomado(enAerolinea.tomados, 'Elige otro asiento.');
      r.body = { ...r.body, holdId, airlineHold: true, ...(holdParaPantalla ? { hold: holdParaPantalla } : {}) };
      this.enviar(res, r);
      return;
    }
    const nuevo = enAerolinea.nuevoHold;
    if (nuevo) {
      const expiraNuevo = Date.parse(String(nuevo.expiresAt ?? ''));
      const hasta = new Date(Number.isFinite(expiraNuevo) && expiraNuevo > Date.now() ? Math.min(expiraNuevo, Date.now() + minutosBloqueo() * 60_000) : Date.now() + minutosBloqueo() * 60_000);
      await this.bloqueos.liberar(holdId);
      await this.bloqueos.fijar(nodo, String(nuevo.holdId), asientos, hasta);
      res.status(200).json({ holdId: String(nuevo.holdId), previousHoldId: holdId, hold: nuevo, locked: asientos, taken: [], expiresAt: hasta.toISOString(), ttlMinutes: minutosBloqueo(), airlineHold: true });
      return;
    }
    res.status(200).json({ holdId, ...(holdParaPantalla ? { hold: holdParaPantalla } : {}), locked, taken: [], expiresAt: expira.toISOString(), ttlMinutes: minutosBloqueo(), airlineHold: enAerolinea.apartado });
  }

  /** Aerolíneas que todavía no aceptan `assignedSeats` en el hold (se vuelve a probar cada 10 min). */
  private readonly sinAsientoEnHold = new Map<string, number>();

  /**
   * Rehace el hold en la aerolínea con los asientos elegidos (`assignedSeats`) y
   * suelta el anterior. Devuelve el hold nuevo, o `tomados` si la aerolínea dice
   * que el asiento ya está ocupado (409). Si la aerolínea no lo soporta o falla,
   * no cambia nada (queda el bloqueo de Booking).
   */
  private async apartarEnAerolinea(nodo: string, holdId: string, asientos: AsientoRef[], entrantes: Record<string, any>): Promise<{ nuevoHold?: any; tomados?: AsientoRef[]; previos: AsientoRef[]; apartado: boolean }> {
    const guardado = await this.bloqueos.hold(holdId);
    const previos = guardado?.asientos ?? [];
    const firma = (l: AsientoRef[]) => l.map((a) => `${a.segmentId}|${a.seatNumber}`).sort().join(',');
    if (!guardado) return { previos, apartado: false };
    if (firma(previos) === firma(asientos)) return { previos, apartado: previos.length > 0 };
    const pausa = this.sinAsientoEnHold.get(nodo);
    if (asientos.length && pausa && Date.now() - pausa < 10 * 60_000) return { previos, apartado: false };

    const t0 = Date.now();
    const cuerpo = asientos.length ? { ...guardado.cuerpo, assignedSeats: asientos } : { ...guardado.cuerpo };
    const r = await this.socios.reenviar(nodo, 'POST', ['offers', 'hold'], '', cuerpo, { ...entrantes, 'idempotency-key': randomUUID() });
    if (r.status >= 200 && r.status < 300 && r.body?.holdId) {
      this.sinAsientoEnHold.delete(nodo);
      const nuevoId = String(r.body.holdId);
      await this.bloqueos.guardarHold(nuevoId, nodo, guardado.cuerpo, asientos);
      this.holdsVistos.delete(holdId);
      // El hold anterior se suelta en la aerolínea (si falla, vence solo).
      void this.socios.reenviar(nodo, 'DELETE', ['offers', 'hold', holdId], '', null, entrantes).catch(() => undefined);
      void this.bloqueos.olvidarHold(holdId);
      const base = parseFloat(String(r.body?.lockedPrice?.total ?? ''));
      if (Number.isFinite(base) && base > 0) {
        r.body = { ...r.body, bookingPrice: precioBooking(precioConRecargo(base, await this.reservas.recargoPct()), r.body.lockedPrice.currency) };
      }
      this.bloqueos.registrarReemplazo(holdId, nuevoId, r.body);
      this.traza(entrantes, 'asiento', 'ok',
        asientos.length
          ? `Asiento ${asientos.map((a) => a.seatNumber).join(', ')} apartado también en la aerolínea (hold ${nuevoId.split('~').pop()?.slice(0, 8)})`
          : 'Asientos soltados en la aerolínea',
        { nodo, ms: Date.now() - t0 });
      return { nuevoHold: r.body, previos, apartado: asientos.length > 0 };
    }
    if (r.status === 409) {
      const clave = new Set(previos.map((a) => `${a.segmentId}|${a.seatNumber}`));
      const nuevos = asientos.filter((a) => !clave.has(`${a.segmentId}|${a.seatNumber}`));
      this.traza(entrantes, 'asiento', 'aviso', `La aerolínea dice que el asiento ${(nuevos.length ? nuevos : asientos).map((a) => a.seatNumber).join(', ')} ya está ocupado`, { nodo, ms: Date.now() - t0 });
      return { tomados: nuevos.length ? nuevos : asientos, previos, apartado: previos.length > 0 };
    }
    if (r.status === 400 || r.status === 422) {
      // La aerolínea todavía no acepta `assignedSeats` en el hold.
      this.sinAsientoEnHold.set(nodo, Date.now());
      this.traza(entrantes, 'asiento', 'aviso', `La aerolínea no acepta asientos en el hold (HTTP ${r.status}): queda el bloqueo de Booking`, { nodo, ms: Date.now() - t0 });
    }
    return { previos, apartado: false };
  }

  /**
   * El hold sigue activo en la aerolínea (se recuerda 5 min). Solo se rechaza
   * cuando la aerolínea dice claramente que venció o se liberó; si no responde o
   * no reconoce al usuario (403/404 por dueño distinto) se deja pasar: es mejor
   * bloquear de más que dejar a un cliente sin su asiento.
   */
  private async holdVigente(nodo: string, holdId: string, entrantes: Record<string, any>): Promise<boolean> {
    const visto = this.holdsVistos.get(holdId);
    if (visto && Date.now() - visto < 5 * 60_000) return true;
    const h = await this.socios.reenviar(nodo, 'GET', ['offers', 'hold', holdId], '', null, entrantes);
    const estado = String(h.body?.status ?? 'HELD').toUpperCase();
    if (h.status === 410 || (h.status >= 200 && h.status < 300 && estado !== 'HELD')) return false;
    if (this.holdsVistos.size > 5_000) this.holdsVistos.clear();
    this.holdsVistos.set(holdId, Date.now());
    return true;
  }

  // ───────────────────────────── Util ─────────────────────────────

  /** Deja un paso en la traza en vivo, con el correlation ID de la compra. */
  private traza(entrantes: Record<string, any>, paso: PasoVuelo, resultado: ResultadoPaso, detalle: string, extra: { nodo?: string | null; ms?: number | null; monto?: number | null } = {}) {
    try {
      const huella = String(entrantes['x-device-fingerprint'] || '');
      const cliente = emailDesdeJwt(entrantes['authorization']) || (huella ? `invitado ·${huella.slice(-6)}` : null);
      trazaVuelos.registrar({ correlacion: String(entrantes['x-correlation-id'] || 'sin-correlacion'), paso, resultado, detalle, cliente, ...extra });
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

/**
 * Desglose de lo que paga el cliente en Booking (campo propio de Booking hacia
 * su frontend; a la aerolínea no se le envía): su precio + cargo por servicio.
 */
function precioBooking(p: { aerolinea: number; cargo: number; total: number; pct: number }, moneda?: string) {
  return {
    currency: moneda || 'USD',
    airlineTotal: p.aerolinea.toFixed(2),
    serviceFee: p.cargo.toFixed(2),
    serviceFeePercentage: p.pct,
    total: p.total.toFixed(2),
  };
}

/** 409 del contrato (`SEAT_TAKEN`) con los asientos que ya tiene otra compra. */
function asientoTomado(asientos: AsientoRef[], extra: string): RespuestaProxy {
  const nums = asientos.map((a) => a.seatNumber).join(', ');
  const r = problema(409, 'Asiento no disponible', `El asiento ${nums} lo acaba de elegir otra persona. ${extra}`);
  r.body = { ...r.body, type: 'https://api.booking.local/errors/seat-taken', code: 'SEAT_TAKEN', taken: asientos, charged: false };
  return r;
}

/** Deja libres en MI mapa los asientos que la aerolínea apartó para mi propio hold. */
export function marcarPropios(mapa: any, propios: Set<string>): any {
  return {
    ...mapa,
    cabins: (mapa.cabins ?? []).map((c: any) => ({
      ...c,
      rows: (c.rows ?? []).map((f: any) => ({
        ...f,
        seats: (f.seats ?? []).map((a: any) =>
          propios.has(String(a?.seatNumber ?? '').toUpperCase()) && String(a?.status ?? 'HELD').toUpperCase() === 'HELD'
            ? { ...a, isAvailable: true, status: 'AVAILABLE', heldByMe: true }
            : a),
      })),
    })),
  };
}

/** Marca como ocupados (HELD) en el mapa los asientos bloqueados por otras compras de Booking. */
export function marcarBloqueados(mapa: any, bloqueados: Set<string>): any {
  return {
    ...mapa,
    cabins: (mapa.cabins ?? []).map((c: any) => ({
      ...c,
      rows: (c.rows ?? []).map((f: any) => ({
        ...f,
        seats: (f.seats ?? []).map((a: any) =>
          bloqueados.has(String(a?.seatNumber ?? '').toUpperCase()) && a?.isAvailable !== false && String(a?.status ?? 'AVAILABLE') === 'AVAILABLE'
            ? { ...a, isAvailable: false, status: 'HELD' }
            : a),
      })),
    })),
  };
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
