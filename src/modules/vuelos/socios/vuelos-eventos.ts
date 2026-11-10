/**
 * Sincroniza con Booking lo que pasa en la web de cada aerolínea, leyendo su
 * feed de eventos `GET /vuelos/eventos?after=<id>` (contrato v2: "Booking lo usa
 * para reconciliar eventos que no llegaron por webhook").
 *
 * Así no hace falta que la aerolínea cambie nada: aunque no envíe webhooks,
 * Booking se entera de
 *  - `booking.checked_in`: el pasajero hizo check-in en el mostrador / web de la
 *    aerolínea → la reserva pasa a CHECKED_IN (asistencia confirmada).
 *  - `booking.cancelled`: la aerolínea canceló (en su mostrador o por vuelo
 *    cancelado) → Booking devuelve al cliente lo que diga la aerolínea, emite la
 *    nota de crédito y marca CANCELLED.
 *  - `booking.changed` (DATE_CHANGE): cambio de fecha o retraso del vuelo → se
 *    vuelve a leer la reserva en la aerolínea y se actualiza la fecha de salida.
 *  - `booking.confirmed`: guarda con qué id conoce la aerolínea a nuestro cliente.
 *
 * Cada aerolínea publica el feed a su manera y Booking se adapta sin pedirle
 * cambios: orden ascendente con cursor `after` (contrato) o los más recientes
 * primero (EQ10); reembolso en `refundAmount`, `refund.amount` o `refund`.
 * Si una aerolínea no emite algún evento (EQ10 no emite el de check-in),
 * `reconciliar` lee el detalle de la reserva y aplica el estado que tenga.
 *
 * Solo se tocan reservas hechas desde Booking (las que están en
 * vuelos_reservas_socio). El cursor por aerolínea se guarda en la base, así un
 * reinicio no vuelve a leer todo. Todo es idempotente.
 */
import { Logger } from '@nestjs/common';
import { SEPARADOR_ID, VuelosSociosService } from './vuelos-socios.service';
import { VuelosSociosReservasService } from './vuelos-socios-reservas.service';
import { trazaVuelos, PasoVuelo, ResultadoPaso } from './vuelos-traza';

const PAGINA = 100;
const MAX_PAGINAS_POR_CICLO = 10;
/**
 * Margen para una cancelación recién emitida: la que hace Booking se protege con
 * `enCurso` (misma instancia); este margen corto cubre otra instancia del servidor.
 */
const MARGEN_CANCELACION_MS = 8_000;
const ENTRE_CICLOS_RAPIDOS_MS = 5_000;

export class SincronizadorEventosVuelos {
  private readonly logger = new Logger('VuelosEventos');
  private temporizador: NodeJS.Timeout | null = null;
  private ocupado = false;
  private ultimoCiclo = 0;
  /** Reservas que Booking está cancelando ahora mismo (las procesa el middleware, no el feed). */
  readonly enCurso = new Set<string>();
  /** Aerolíneas cuyo feed devuelve primero lo más reciente. */
  private readonly descendente = new Map<string, boolean>();

  constructor(
    private readonly socios: VuelosSociosService,
    private readonly reservas: VuelosSociosReservasService,
  ) {}

  iniciar(intervaloMs: number) {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => void this.ciclo(), intervaloMs);
    this.temporizador.unref?.();
    setTimeout(() => void this.ciclo(), 5_000).unref?.();
    this.logger.log(`Leyendo el feed de eventos de las aerolíneas cada ${Math.round(intervaloMs / 1000)} s`);
  }

  detener() {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /** Una pasada por todas las aerolíneas activas (en paralelo). Devuelve cuántas reservas cambiaron. */
  async ciclo(): Promise<number> {
    if (this.ocupado) return 0;
    this.ocupado = true;
    this.ultimoCiclo = Date.now();
    try {
      const nodos = await this.socios.nodosActivos().catch(() => []);
      const res = await Promise.all(nodos.map((n) =>
        this.sincronizarNodo(n.codigoNodo).catch((e) => {
          this.logger.warn(`Eventos de ${n.codigoNodo}: ${e?.message}`);
          return 0;
        }),
      ));
      return res.reduce((a, b) => a + b, 0);
    } finally {
      this.ocupado = false;
    }
  }

  /** Lee el feed ahora (alguien abrió Mis Reservas), salvo que se acabe de leer. */
  async cicloRapido(): Promise<number> {
    if (this.ocupado || Date.now() - this.ultimoCiclo < ENTRE_CICLOS_RAPIDOS_MS) return 0;
    return this.ciclo();
  }

  private async pagina(nodo: string, despues: string | null): Promise<any[] | null> {
    const query = `limit=${PAGINA}${despues ? `&after=${encodeURIComponent(despues)}` : ''}`;
    const r = await this.socios.reenviar(nodo, 'GET', ['eventos'], query, null, {
      'x-correlation-id': `corr-eventos-${nodo}-${Date.now()}`,
    });
    if (r.status !== 200) return null; // la aerolínea no expone el feed o no responde: se reintenta en el próximo ciclo
    return Array.isArray(r.body?.events) ? r.body.events : Array.isArray(r.body?.items) ? r.body.items : [];
  }

  /** Esta cancelación todavía no se debe procesar (la está haciendo Booking o acaba de emitirse). */
  private debeEsperar(nodo: string, e: any): boolean {
    if (!String(e?.type ?? '').endsWith('booking.cancelled')) return false;
    const id = String(e?.data?.bookingId ?? '');
    if (this.enCurso.has(id) || this.enCurso.has(`${nodo}${SEPARADOR_ID}${id}`)) return true;
    const t = Date.parse(e?.time ?? '');
    return Number.isFinite(t) && Date.now() - t < MARGEN_CANCELACION_MS;
  }

  async sincronizarNodo(nodo: string): Promise<number> {
    const cursor = await this.reservas.cursorEventos(nodo);
    // El orden del feed se detecta una vez por aerolínea, con la página sin cursor.
    if (!this.descendente.has(nodo)) {
      const primera = await this.pagina(nodo, null);
      if (primera === null) return 0;
      const orden = ordenDelFeed(primera);
      if (orden !== null) this.descendente.set(nodo, orden === 'desc');
      if (orden === 'desc') return this.aplicarRecientes(nodo, primera, cursor);
      if (!cursor) return this.aplicarAscendente(nodo, null, primera);
    } else if (this.descendente.get(nodo)) {
      const primera = await this.pagina(nodo, null);
      return primera === null ? 0 : this.aplicarRecientes(nodo, primera, cursor);
    }
    return this.aplicarAscendente(nodo, cursor, null);
  }

  /** Feed del contrato: orden ascendente, se avanza con `after=<último id>`. */
  private async aplicarAscendente(nodo: string, cursor: string | null, primera: any[] | null): Promise<number> {
    let despues = cursor;
    let aplicados = 0;
    for (let p = 0; p < MAX_PAGINAS_POR_CICLO; p++) {
      const eventos = p === 0 && primera ? primera : await this.pagina(nodo, despues);
      if (eventos === null) return aplicados;
      if (!eventos.length) break;
      for (const e of eventos) {
        // No se avanza el cursor más allá de una cancelación que debe esperar.
        if (this.debeEsperar(nodo, e)) {
          if (despues) await this.reservas.guardarCursor(nodo, despues, 0);
          return aplicados;
        }
        if (await this.aplicar(nodo, e)) aplicados++;
        despues = String(e.id ?? despues);
      }
      await this.reservas.guardarCursor(nodo, despues!, eventos.length);
      if (eventos.length < PAGINA) break;
    }
    return aplicados;
  }

  /**
   * Feed con lo más reciente primero (sin cursor útil): se aplican, del más
   * antiguo al más nuevo, los eventos posteriores al último ya procesado.
   */
  private async aplicarRecientes(nodo: string, eventos: any[], cursor: string | null): Promise<number> {
    const corte = cursor ? eventos.findIndex((e) => String(e?.id) === cursor) : -1;
    const nuevos = (corte >= 0 ? eventos.slice(0, corte) : eventos).reverse();
    let aplicados = 0;
    let ultimo: string | null = null;
    let leidos = 0;
    for (const e of nuevos) {
      if (this.debeEsperar(nodo, e)) break;
      if (await this.aplicar(nodo, e)) aplicados++;
      ultimo = String(e.id ?? ultimo);
      leidos++;
    }
    if (ultimo) await this.reservas.guardarCursor(nodo, ultimo, leidos);
    return aplicados;
  }

  /** Aplica un evento a la reserva de Booking que corresponda. true si cambió algo. */
  async aplicar(nodo: string, e: any): Promise<boolean> {
    const tipo = String(e?.type ?? '').split('.vuelos.').pop() ?? '';
    const d = e?.data ?? {};
    if (!d.bookingId || !tipo.startsWith('booking.')) return false;
    // El proxy de Booking ya antepone el código de la aerolínea a los ids
    // (NODE_X~id); si viniera sin él, se agrega.
    const idSocio = String(d.bookingId);
    const bookingId = idSocio.includes(SEPARADOR_ID) ? idSocio : `${nodo}${SEPARADOR_ID}${idSocio}`;
    const copia = await this.reservas.obtener(bookingId);
    if (!copia) return false; // no la vendió Booking
    const entr = { 'x-correlation-id': e.correlationid || `corr-evento-${e.id}` };

    switch (tipo) {
      case 'booking.checked_in': {
        if (copia.status === 'CHECKED_IN' || copia.status === 'CANCELLED') return false;
        const cambio = await this.reservas.marcarCheckin(bookingId, e.time ? new Date(e.time) : new Date(), 'aerolinea');
        if (cambio) {
          this.traza(entr, 'checkin', 'ok',
            `Check-in confirmado por ${nodo} · PNR ${d.pnr ?? copia.pnr ?? '?'}${d.passengersCheckedIn ? ` · ${d.passengersCheckedIn} pasajero(s)` : ''}`, nodo);
        }
        return cambio;
      }
      case 'booking.cancelled':
        return this.cancelarPorAerolinea(nodo, bookingId, copia, d, String(d.refundId ?? e.id), entr);
      case 'booking.changed': {
        // Los retrasos se manejan como cambio de fecha (contrato v2: changeType DATE_CHANGE).
        if (copia.status === 'CANCELLED') return false;
        const tipoCambio = String(d.changeType ?? 'DATE_CHANGE').toUpperCase();
        if (tipoCambio !== 'DATE_CHANGE') return false;
        const r = await this.socios.reenviar(nodo, 'GET', ['bookings', bookingId], '', null, entr);
        if (r.status !== 200 || !r.body || typeof r.body !== 'object') {
          this.traza(entr, 'cambio_fecha', 'aviso', `Cambio de fecha en ${nodo} · PNR ${d.pnr ?? copia.pnr ?? '?'}: no se pudo leer la reserva (HTTP ${r.status})`, nodo);
          return false;
        }
        await this.reservas.actualizarDesdeSocio(bookingId, r.body);
        const nueva = await this.reservas.obtener(bookingId);
        this.traza(entr, 'cambio_fecha', 'ok',
          `Cambio de fecha en ${nodo} · PNR ${d.pnr ?? copia.pnr ?? '?'} · salida ${copia.departureDate ?? '?'} → ${nueva?.departureDate ?? '?'}`, nodo);
        return true;
      }
      case 'booking.confirmed': {
        if (d.ownerId) await this.reservas.idClienteEnSocio(nodo, copia.propietarioId, String(d.ownerId));
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * La aerolínea canceló (en su web, mostrador o por vuelo cancelado): Booking
   * devuelve al cliente lo que ella informe, emite la nota de crédito y marca
   * CANCELLED. Si la reserva ya estaba cancelada sin devolución y ahora llega el
   * monto, se completa el reembolso (nunca dos veces).
   */
  async cancelarPorAerolinea(nodo: string, bookingId: string, copia: any, d: any, clave: string, entr: Record<string, any>): Promise<boolean> {
    const yaCancelada = copia.status === 'CANCELLED';
    if (yaCancelada && copia.reembolsado > 0) return false;
    // Solo se devuelve la parte de la aerolínea: el cargo por servicio de
    // Booking no es reembolsable (reservas antiguas: el total).
    const pendiente = Math.max(0, (copia.montoAerolinea ?? copia.grandTotal) - copia.reembolsado);
    const informado = montoReembolso(d);
    const monto = informado > 0 ? Math.min(informado, pendiente) : d?.reasonCode === 'FLIGHT_CANCELLED' ? pendiente : 0;
    if (yaCancelada && monto <= 0) return false;
    let devuelto = 0;
    if (copia.transaccionId && monto > 0) {
      devuelto = await this.reservas.reembolsar(copia.transaccionId, monto, `Cancelación en ${nodo} (${d?.reasonCode ?? 'aerolínea'})`);
      if (devuelto > 0) {
        await this.reservas.notaCredito({
          bookingId, monto: devuelto, motivo: `Cancelación en la aerolínea ${d?.reasonCode ?? ''}`.trim(),
          transaccionId: copia.transaccionId, claveReembolso: clave,
        });
      }
    }
    if (yaCancelada && devuelto <= 0) return false;
    await this.reservas.marcarEstado(bookingId, 'CANCELLED', devuelto);
    this.traza(entr, 'cancelacion', devuelto > 0 || monto === 0 ? 'ok' : 'error',
      `Cancelada en ${nodo} · PNR ${d?.pnr ?? copia.pnr ?? '?'} · reembolso ${devuelto.toFixed(2)}${monto > 0 && devuelto <= 0 ? ' (FALLÓ)' : ''}`, nodo);
    return true;
  }

  /**
   * Compara la copia de Booking con el detalle de la reserva en la aerolínea
   * (GET /vuelos/bookings/{id}) y aplica lo que haya cambiado allá: cancelación,
   * check-in o cambio de fecha. true si cambió el estado.
   */
  async reconciliar(nodo: string, bookingId: string): Promise<boolean> {
    if (this.enCurso.has(bookingId)) return false;
    const entr = { 'x-correlation-id': `corr-reconciliar-${bookingId.split(SEPARADOR_ID).pop()}` };
    const r = await this.socios.reenviar(nodo, 'GET', ['bookings', bookingId], '', null, entr);
    if (r.status !== 200 || !r.body || typeof r.body !== 'object') return false;
    // Se relee la copia DESPUÉS de consultar: el feed pudo haberla actualizado mientras tanto.
    const copia = await this.reservas.obtener(bookingId);
    if (!copia || copia.status === 'CANCELLED' || this.enCurso.has(bookingId)) return false;
    const estado = String(r.body.status ?? '').toUpperCase();
    if (estado === 'CANCELLED') {
      return this.cancelarPorAerolinea(nodo, bookingId, copia, { ...(r.body.cancellation ?? {}), ...r.body }, `detalle-${bookingId}`, entr);
    }
    await this.reservas.actualizarDesdeSocio(bookingId, r.body);
    if (copia.status !== 'CHECKED_IN' && (estado === 'CHECKED_IN' || estado === 'BOARDED')) {
      const cambio = await this.reservas.marcarCheckin(bookingId, new Date(), 'aerolinea');
      if (cambio) this.traza(entr, 'checkin', 'ok', `Check-in confirmado por ${nodo} · PNR ${r.body.pnr ?? copia.pnr ?? '?'}`, nodo);
      return cambio;
    }
    return false;
  }

  private traza(entr: Record<string, any>, paso: PasoVuelo, resultado: ResultadoPaso, detalle: string, nodo: string) {
    trazaVuelos.registrar({ correlacion: entr['x-correlation-id'], paso, resultado, detalle, nodo });
  }
}

/** Monto que la aerolínea dice que hay que devolver: `refundAmount`, `refund.amount` o `refund`. */
export function montoReembolso(d: any): number {
  const crudo = d?.refundAmount ?? (d?.refund && typeof d.refund === 'object' ? d.refund.amount ?? d.refund.total : d?.refund);
  const n = parseFloat(String(crudo ?? ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'asc' (contrato), 'desc' (lo más reciente primero) o null si no se puede saber todavía. */
export function ordenDelFeed(eventos: any[]): 'asc' | 'desc' | null {
  const tiempos = eventos.map((e) => Date.parse(e?.time ?? '')).filter((t) => Number.isFinite(t));
  if (tiempos.length < 2 || tiempos[0] === tiempos[tiempos.length - 1]) return null;
  return tiempos[0] > tiempos[tiempos.length - 1] ? 'desc' : 'asc';
}
