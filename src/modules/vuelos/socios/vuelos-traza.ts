/**
 * Traza en tiempo real del proceso de vuelos con aerolíneas socias.
 *
 * Cada paso real (búsqueda, hold, cobro, reserva en la aerolínea, copia,
 * reembolso, cancelación, estado de vuelo) deja un evento aquí. El admin lo lee
 * cada pocos segundos (GET /admin/procesos/vuelos/en-vivo) y dibuja el flujo.
 *
 * Se guarda en memoria (los últimos 500 eventos y contadores desde el arranque):
 * es telemetría operativa para ver el sistema en vivo, no un registro contable.
 * Un reinicio del servidor la deja en cero.
 */

export type PasoVuelo =
  | 'busqueda'
  | 'hold'
  | 'cobro'
  | 'reserva_aerolinea'
  | 'copia'
  | 'confirmada'
  | 'reembolso'
  | 'cancelacion'
  | 'estado_vuelo'
  | 'consulta';

export type ResultadoPaso = 'ok' | 'error' | 'aviso';

export interface EventoVuelo {
  seq: number;
  ts: string;
  correlacion: string;
  paso: PasoVuelo;
  resultado: ResultadoPaso;
  detalle: string;
  nodo?: string | null;
  ms?: number | null;
  monto?: number | null;
}

const MAX_EVENTOS = 500;

class TrazaVuelos {
  private eventos: EventoVuelo[] = [];
  private seq = 0;
  private readonly inicio = new Date().toISOString();
  private contadores: Record<string, { ok: number; error: number; aviso: number }> = {};

  registrar(e: Omit<EventoVuelo, 'seq' | 'ts'>): EventoVuelo {
    const evento: EventoVuelo = { ...e, seq: ++this.seq, ts: new Date().toISOString() };
    this.eventos.push(evento);
    if (this.eventos.length > MAX_EVENTOS) this.eventos.splice(0, this.eventos.length - MAX_EVENTOS);
    const c = (this.contadores[e.paso] ??= { ok: 0, error: 0, aviso: 0 });
    c[e.resultado] += 1;
    return evento;
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

export const trazaVuelos = new TrazaVuelos();
