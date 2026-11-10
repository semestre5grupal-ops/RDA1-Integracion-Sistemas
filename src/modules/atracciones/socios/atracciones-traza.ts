/**
 * Traza en tiempo real del proceso de reserva de atracciones con operadores socios.
 *
 * Cada paso real (búsqueda de cupos/aforo, sincronizar cliente/visitante, cotizar tickets,
 * emisión de orden/voucher QR vía canal gRPC directo :50051, copia en schema_atracciones,
 * confirmada, compensación/cancelación y check-in/ingreso con QR) deja un evento aquí.
 * El admin lo lee cada 2 segundos (GET /admin/procesos/atracciones/en-vivo) y dibuja el flujo animado.
 *
 * Guarda en memoria los últimos 500 eventos y contadores operativos desde el arranque.
 */

export type PasoAtraccion =
  | 'busqueda'
  | 'cliente'
  | 'cotizar'
  | 'reserva_socio'
  | 'copia'
  | 'confirmada'
  | 'compensar'
  | 'cancelacion'
  | 'checkin'
  | 'consulta';

export type ResultadoPaso = 'ok' | 'error' | 'aviso';

export interface EventoAtraccion {
  seq: number;
  ts: string;
  correlacion: string;
  paso: PasoAtraccion;
  resultado: ResultadoPaso;
  detalle: string;
  nodo?: string | null;
  ms?: number | null;
  monto?: number | null;
  cliente?: string | null;
}

const MAX_EVENTOS = 500;

class TrazaAtracciones {
  private eventos: EventoAtraccion[] = [];
  private seq = 0;
  private readonly inicio = new Date().toISOString();
  private contadores: Record<string, { ok: number; error: number; aviso: number }> = {};

  registrar(e: Omit<EventoAtraccion, 'seq' | 'ts'>): EventoAtraccion {
    const evento: EventoAtraccion = { ...e, seq: ++this.seq, ts: new Date().toISOString() };
    this.eventos.push(evento);
    if (this.eventos.length > MAX_EVENTOS) this.eventos.splice(0, this.eventos.length - MAX_EVENTOS);
    const c = (this.contadores[e.paso] ??= { ok: 0, error: 0, aviso: 0 });
    c[e.resultado] = (c[e.resultado] || 0) + 1;
    return evento;
  }

  desde(ultimoSeq = 0) {
    const nuevos = ultimoSeq > 0 ? this.eventos.filter((e) => e.seq > ultimoSeq) : this.eventos.slice(-60);
    return {
      desde: ultimoSeq,
      ultimoSeq: this.seq,
      totalHistorico: this.seq,
      arranque: this.inicio,
      contadores: this.contadores,
      eventos: nuevos,
    };
  }

  limpiar() {
    this.eventos = [];
    this.contadores = {};
  }
}

export const trazaAtracciones = new TrazaAtracciones();

