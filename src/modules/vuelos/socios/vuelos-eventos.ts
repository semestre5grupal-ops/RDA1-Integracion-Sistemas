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
 *  - `booking.confirmed`: guarda con qué id conoce la aerolínea a nuestro cliente.
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
/** Una cancelación que hizo Booking ya se procesó al momento; las de la aerolínea se aplican pasado este margen. */
const MARGEN_CANCELACION_MS = 90_000;

export class SincronizadorEventosVuelos {
  private readonly logger = new Logger('VuelosEventos');
  private temporizador: NodeJS.Timeout | null = null;
  private ocupado = false;

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

  /** Una pasada por todas las aerolíneas activas. */
  async ciclo(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      const nodos = await this.socios.nodosActivos().catch(() => []);
      for (const n of nodos) {
        await this.sincronizarNodo(n.codigoNodo).catch((e) =>
          this.logger.warn(`Eventos de ${n.codigoNodo}: ${e?.message}`),
        );
      }
    } finally {
      this.ocupado = false;
    }
  }

  async sincronizarNodo(nodo: string): Promise<number> {
    let despues = await this.reservas.cursorEventos(nodo);
    let aplicados = 0;
    for (let p = 0; p < MAX_PAGINAS_POR_CICLO; p++) {
      const query = `limit=${PAGINA}${despues ? `&after=${encodeURIComponent(despues)}` : ''}`;
      const r = await this.socios.reenviar(nodo, 'GET', ['eventos'], query, null, {
        'x-correlation-id': `corr-eventos-${nodo}-${Date.now()}`,
      });
      if (r.status !== 200) return aplicados; // la aerolínea no expone el feed o no responde: se reintenta en el próximo ciclo
      const eventos: any[] = Array.isArray(r.body?.events) ? r.body.events : Array.isArray(r.body?.items) ? r.body.items : [];
      if (!eventos.length) break;
      for (const e of eventos) {
        // Una cancelación reciente puede ser la que hizo Booking hace segundos:
        // se deja para el próximo ciclo (no se avanza el cursor más allá).
        if (esCancelacionReciente(e)) {
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
      case 'booking.cancelled': {
        if (copia.status === 'CANCELLED') return false;
        const pendiente = Math.max(0, copia.grandTotal - copia.reembolsado);
        const informado = parseFloat(String(d.refundAmount ?? d.refund?.amount ?? ''));
        const monto = Number.isFinite(informado) && informado > 0
          ? Math.min(informado, pendiente)
          : d.reasonCode === 'FLIGHT_CANCELLED' ? pendiente : 0;
        let devuelto = 0;
        if (copia.transaccionId && monto > 0) {
          devuelto = await this.reservas.reembolsar(copia.transaccionId, monto, `Cancelación en ${nodo} (${d.reasonCode ?? 'aerolínea'})`);
          if (devuelto > 0) {
            await this.reservas.notaCredito({
              bookingId, monto: devuelto, motivo: `Cancelación en la aerolínea ${d.reasonCode ?? ''}`.trim(),
              transaccionId: copia.transaccionId, claveReembolso: String(d.refundId ?? e.id),
            });
          }
        }
        await this.reservas.marcarEstado(bookingId, 'CANCELLED', devuelto);
        this.traza(entr, 'cancelacion', devuelto > 0 || monto === 0 ? 'ok' : 'error',
          `Cancelada en ${nodo} · reembolso ${devuelto.toFixed(2)}${monto > 0 && devuelto <= 0 ? ' (FALLÓ)' : ''}`, nodo);
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

  private traza(entr: Record<string, any>, paso: PasoVuelo, resultado: ResultadoPaso, detalle: string, nodo: string) {
    trazaVuelos.registrar({ correlacion: entr['x-correlation-id'], paso, resultado, detalle, nodo });
  }
}

function esCancelacionReciente(e: any): boolean {
  if (!String(e?.type ?? '').endsWith('booking.cancelled')) return false;
  const t = Date.parse(e?.time ?? '');
  return Number.isFinite(t) && Date.now() - t < MARGEN_CANCELACION_MS;
}
