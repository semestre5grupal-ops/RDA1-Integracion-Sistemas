/**
 * Traza en tiempo real del proceso de vuelos con aerolíneas socias.
 *
 * Cada paso real (búsqueda, hold, cobro, reserva en la aerolínea, copia,
 * reembolso, cancelación, estado de vuelo) deja un evento aquí. El admin lo lee
 * cada pocos segundos (GET /admin/procesos/vuelos/en-vivo) y dibuja el flujo.
 *
 * Cada evento se guarda en Postgres (public.vuelos_traza) además de en memoria:
 * así todos los admins ven lo mismo desde cualquier computadora, aunque Azure
 * reparta las peticiones entre varias instancias o el servidor se reinicie.
 * Si la base no está disponible se usa la memoria (últimos 500 eventos).
 * Es telemetría operativa, no un registro contable.
 */

export type PasoVuelo =
  | 'busqueda'
  | 'hold'
  | 'asiento'
  | 'cobro'
  | 'reserva_aerolinea'
  | 'copia'
  | 'factura'
  | 'confirmada'
  | 'reembolso'
  | 'cancelacion'
  | 'checkin'
  | 'cambio_fecha'
  | 'estado_vuelo'
  | 'consulta'
  // Monitoreo: post-venta y fondo
  | 'boleto'
  | 'pase'
  | 'cotizacion'
  | 'soltar'
  | 'webhook'
  | 'integracion';

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
  /** Quién hizo el paso: correo del cliente (token) o "invitado ·abc123" (huella del dispositivo). */
  cliente?: string | null;
}

const MAX_EVENTOS = 500;

/** Dónde se guarda la traza compartida (lo conecta VuelosTrazaPersistencia al arrancar). */
export interface AlmacenTraza {
  guardar(e: EventoVuelo): Promise<void>;
  consultar(desde: number, limite: number): Promise<{ ultimoSeq: number; contadores: Record<string, { ok: number; error: number; aviso: number }>; eventos: EventoVuelo[] }>;
  /** Eventos de las últimas `horas` (para el monitoreo: resumen, compras, aerolíneas). */
  ventana?(horas: number, limite: number): Promise<{ eventos: EventoVuelo[]; truncado: boolean }>;
}

class TrazaVuelos {
  private almacen: AlmacenTraza | null = null;

  conectar(almacen: AlmacenTraza | null) {
    this.almacen = almacen;
  }

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
    // Se guarda en segundo plano: la traza nunca frena ni rompe una compra.
    this.almacen?.guardar(evento).catch(() => undefined);
    return evento;
  }

  /**
   * Lo que ve el admin: desde la base compartida si está conectada (seq = id
   * de la fila, contadores de las últimas 24 h); si no, desde la memoria.
   */
  async consultar(desde = 0, limite = 300) {
    if (this.almacen) {
      try {
        const r = await this.almacen.consultar(desde, limite);
        return { inicio: 'compartida', origen: 'base', ...r };
      } catch {
        /* sin base: se responde con la memoria de esta instancia */
      }
    }
    return { ...this.desde(desde, limite), origen: 'memoria' };
  }

  /** Eventos de las últimas `horas` (base compartida si está; si no, memoria). */
  async ventana(horas = 24, limite = 6000): Promise<{ eventos: EventoVuelo[]; truncado: boolean; origen: string }> {
    const h = Math.min(Math.max(Number(horas) || 24, 1), 168);
    if (this.almacen?.ventana) {
      try {
        return { ...(await this.almacen.ventana(h, limite)), origen: 'base' };
      } catch {
        /* sin base: memoria */
      }
    }
    const limiteTs = Date.now() - h * 3_600_000;
    const evs = this.eventos.filter((e) => Date.parse(e.ts) >= limiteTs);
    return { eventos: evs.slice(-limite), truncado: evs.length > limite, origen: 'memoria' };
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
