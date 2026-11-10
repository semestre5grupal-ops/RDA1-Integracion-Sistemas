/**
 * Traza en tiempo real del proceso de alojamientos con hoteles socios.
 *
 * Cada paso real (búsqueda, sincronizar cliente, cotizar, crear la orden en el
 * hotel, recuperar por idempotency_key, copia, confirmada, compensar, cancelación
 * y check-in) deja un evento aquí. El admin lo lee cada pocos segundos
 * (GET /admin/procesos/alojamientos/en-vivo) y dibuja el flujo.
 *
 * Se guarda en memoria (los últimos 500 eventos y contadores desde el arranque):
 * es telemetría operativa para ver el sistema en vivo, no un registro contable.
 * Un reinicio del servidor la deja en cero.
 */

export type PasoAlojamiento =
  | 'busqueda'
  | 'cliente'
  | 'cotizar'
  | 'crear_orden'
  | 'recuperar'
  | 'copia'
  | 'confirmada'
  | 'compensar'
  | 'cancelacion'
  | 'checkin'
  | 'consulta';

export type ResultadoPaso = 'ok' | 'error' | 'aviso';

export interface EventoAlojamiento {
  seq: number;
  ts: string;
  correlacion: string;
  paso: PasoAlojamiento;
  resultado: ResultadoPaso;
  detalle: string;
  nodo?: string | null;
  ms?: number | null;
  monto?: number | null;
  /** Quién hizo el paso: correo del cliente o "invitado" si no hay sesión. */
  cliente?: string | null;
}

const MAX_EVENTOS = 500;

class TrazaAlojamientos {
  private eventos: EventoAlojamiento[] = [];
  private seq = 0;
  private readonly inicio = new Date().toISOString();
  private contadores: Record<string, { ok: number; error: number; aviso: number }> = {};

  /** Nunca lanza: la telemetría no debe romper el flujo de reserva. */
  registrar(e: Omit<EventoAlojamiento, 'seq' | 'ts'>): EventoAlojamiento | null {
    try {
      const evento: EventoAlojamiento = { ...e, seq: ++this.seq, ts: new Date().toISOString() };
      this.eventos.push(evento);
      if (this.eventos.length > MAX_EVENTOS) this.eventos.splice(0, this.eventos.length - MAX_EVENTOS);
      const c = (this.contadores[e.paso] ??= { ok: 0, error: 0, aviso: 0 });
      c[e.resultado] += 1;
      return evento;
    } catch {
      return null;
    }
  }

  /** Eventos con seq mayor a `desde` (para que el admin pida solo lo nuevo). */
  desde(desde = 0, limite = 200) {
    const nuevos = this.eventos.filter((e) => e.seq > desde).slice(-limite);
    return {
      inicio: this.inicio,
      ultimoSeq: this.seq,
      contadores: this.contadores,
      eventos: nuevos,
    };
  }

  /** Solo para pruebas. */
  reiniciar() {
    this.eventos = [];
    this.seq = 0;
    this.contadores = {};
  }
}

export const trazaAlojamientos = new TrazaAlojamientos();
