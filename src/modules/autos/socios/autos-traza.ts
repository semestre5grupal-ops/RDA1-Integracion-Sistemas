/**
 * Traza en tiempo real del proceso de reserva de autos con agencias socias.
 *
 * Cada paso real (búsqueda, sincronizar conductor, cotizar tarifa congelada,
 * reserva con la agencia vía canal gRPC punto a punto :50051, copia local en schema_autos,
 * confirmada, compensación/cancelación y asistencia/entrega) deja un evento aquí.
 * El admin lo lee cada pocos segundos (GET /admin/procesos/autos/en-vivo) y dibuja el flujo animado.
 *
 * Guarda en memoria los últimos 500 eventos y contadores operativos desde el arranque.
 */

export type PasoAuto =
  | 'busqueda'
  | 'cliente'
  | 'cotizar'
  | 'reserva_socio'
  | 'copia'
  | 'confirmada'
  | 'compensar'
  | 'cancelacion'
  | 'asistencia'
  | 'consulta';

export type ResultadoPaso = 'ok' | 'error' | 'aviso';

export interface EventoAuto {
  seq: number;
  ts: string;
  correlacion: string;
  paso: PasoAuto;
  resultado: ResultadoPaso;
  detalle: string;
  nodo?: string | null;
  ms?: number | null;
  monto?: number | null;
  cliente?: string | null;
}

const MAX_EVENTOS = 500;

class TrazaAutos {
  private eventos: EventoAuto[] = [];
  private seq = 0;
  private readonly inicio = new Date().toISOString();
  private contadores: Record<string, { ok: number; error: number; aviso: number }> = {};

  registrar(e: Omit<EventoAuto, 'seq' | 'ts'>): EventoAuto {
    const evento: EventoAuto = { ...e, seq: ++this.seq, ts: new Date().toISOString() };
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

export const trazaAutos = new TrazaAutos();

