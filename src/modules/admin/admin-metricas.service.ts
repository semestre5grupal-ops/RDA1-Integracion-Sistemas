import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reserva } from '../vuelos/entities/reserva.entity';
import { OrderAuto } from '../autos/entities/order-auto.entity';
import { ReservaAtraccion } from '../atracciones/entities/reserva.entity';
import { ReservaAlojamiento } from '../alojamientos/entities/reserva.entity';
import { Alojamiento } from '../alojamientos/entities/alojamiento.entity';
import { ANULADAS, PAGADAS, PENDIENTES } from './admin-finanzas.service';
import { AdminConfigService } from './admin-config.service';

/**
 * Métricas del tablero "Resumen" del admin, todas calculadas desde datos reales
 * (las cuatro verticales + reservas hechas en aerolíneas socias). Nada se
 * inventa: si no hay datos, las series vienen en cero y el frontend lo dice.
 */

export type Vertical = 'vuelos' | 'autos' | 'atracciones' | 'hospedaje';
export const VERTICALES_METRICAS: Vertical[] = ['vuelos', 'autos', 'atracciones', 'hospedaje'];

export interface ReservaNormalizada {
  vertical: Vertical;
  estado: string;
  total: number;
  createdAt: Date;
  destino: string | null;
}

type Grupo = 'confirmadas' | 'pendientes' | 'canceladas' | 'otras';

export function grupoEstado(estado: string): Grupo {
  const e = String(estado || '').toUpperCase();
  if (PAGADAS.has(e)) return 'confirmadas';
  if (PENDIENTES.has(e)) return 'pendientes';
  if (ANULADAS.has(e)) return 'canceladas';
  return 'otras';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const diaIso = (d: Date) => d.toISOString().slice(0, 10);

/** Cálculo puro (sin BD) para poder probarlo. */
export function calcularMetricas(reservas: ReservaNormalizada[], dias: number, comisionPct: number, ahora = new Date()) {
  const fin = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
  const inicio = new Date(fin.getTime() - dias * 86_400_000);
  const inicioAnterior = new Date(inicio.getTime() - dias * 86_400_000);

  const enRango = (r: ReservaNormalizada, a: Date, b: Date) => r.createdAt >= a && r.createdAt < b;
  const actual = reservas.filter((r) => enRango(r, inicio, fin));
  const anterior = reservas.filter((r) => enRango(r, inicioAnterior, inicio));

  const resumen = (lista: ReservaNormalizada[]) => {
    const cobradas = lista.filter((r) => grupoEstado(r.estado) === 'confirmadas');
    const canceladas = lista.filter((r) => grupoEstado(r.estado) === 'canceladas').length;
    const ingresos = r2(cobradas.reduce((s, r) => s + r.total, 0));
    return {
      reservas: lista.length,
      reservasCobradas: cobradas.length,
      ingresos,
      comision: r2((ingresos * comisionPct) / 100),
      ticketPromedio: cobradas.length ? r2(ingresos / cobradas.length) : 0,
      tasaCancelacion: lista.length ? Math.round((canceladas / lista.length) * 1000) / 10 : 0,
    };
  };

  // Serie diaria con todos los días del rango (los vacíos en cero).
  const serie = new Map<string, { fecha: string; reservas: number; ingresos: number; porVertical: Record<Vertical, number> }>();
  for (let t = inicio.getTime(); t < fin.getTime(); t += 86_400_000) {
    const fecha = diaIso(new Date(t));
    serie.set(fecha, { fecha, reservas: 0, ingresos: 0, porVertical: { vuelos: 0, autos: 0, atracciones: 0, hospedaje: 0 } });
  }
  for (const r of actual) {
    const p = serie.get(diaIso(r.createdAt));
    if (!p) continue;
    p.reservas += 1;
    if (grupoEstado(r.estado) === 'confirmadas') {
      p.ingresos = r2(p.ingresos + r.total);
      p.porVertical[r.vertical] = r2(p.porVertical[r.vertical] + r.total);
    }
  }

  const porVertical = VERTICALES_METRICAS.map((v) => {
    const lista = actual.filter((r) => r.vertical === v);
    const estados: Record<Grupo, number> = { confirmadas: 0, pendientes: 0, canceladas: 0, otras: 0 };
    lista.forEach((r) => (estados[grupoEstado(r.estado)] += 1));
    return { vertical: v, ...resumen(lista), estados };
  });

  const destinos = new Map<string, { destino: string; reservas: number; ingresos: number }>();
  for (const r of actual) {
    if (!r.destino) continue;
    const d = destinos.get(r.destino) ?? { destino: r.destino, reservas: 0, ingresos: 0 };
    d.reservas += 1;
    if (grupoEstado(r.estado) === 'confirmadas') d.ingresos = r2(d.ingresos + r.total);
    destinos.set(r.destino, d);
  }

  return {
    dias,
    desde: diaIso(inicio),
    hasta: diaIso(new Date(fin.getTime() - 86_400_000)),
    comisionPct,
    kpis: resumen(actual),
    kpisAnterior: resumen(anterior),
    serieDiaria: [...serie.values()],
    porVertical,
    topDestinos: [...destinos.values()].sort((a, b) => b.reservas - a.reservas || b.ingresos - a.ingresos).slice(0, 8),
  };
}

@Injectable()
export class AdminMetricasService {
  private readonly logger = new Logger(AdminMetricasService.name);

  constructor(
    @InjectRepository(Reserva) private readonly reservaRepo: Repository<Reserva>,
    @InjectRepository(OrderAuto) private readonly orderAutoRepo: Repository<OrderAuto>,
    @InjectRepository(ReservaAtraccion) private readonly reservaAtraccionRepo: Repository<ReservaAtraccion>,
    @InjectRepository(ReservaAlojamiento) private readonly reservaAlojamientoRepo: Repository<ReservaAlojamiento>,
    @InjectRepository(Alojamiento) private readonly alojamientoRepo: Repository<Alojamiento>,
    private readonly dataSource: DataSource,
    private readonly configService: AdminConfigService,
  ) {}

  async getMetricas(diasPedidos?: number) {
    const dias = [7, 30, 90, 365].includes(Number(diasPedidos)) ? Number(diasPedidos) : 30;
    const [reservas, cfg, proveedores] = await Promise.all([
      this.reservas(),
      this.configService.getConfig().catch(() => ({ comisionBase: 0 }) as any),
      this.proveedores(),
    ]);
    return {
      generadoEn: new Date().toISOString(),
      ...calcularMetricas(reservas, dias, Number(cfg?.comisionBase) || 0),
      proveedores,
    };
  }

  private async seguro<T>(nombre: string, f: () => Promise<T>, vacio: T): Promise<T> {
    try {
      return await f();
    } catch (e: any) {
      this.logger.warn(`Métricas: ${nombre} no disponible (${e?.message})`);
      return vacio;
    }
  }

  private async reservas(): Promise<ReservaNormalizada[]> {
    const [vuelos, destinosVuelos, socios, autos, atracciones, hospedaje] = await Promise.all([
      this.seguro('vuelos', () => this.reservaRepo.find(), [] as Reserva[]),
      this.seguro(
        'destinos de vuelos',
        () => this.dataSource.query(`SELECT bookingid::text AS id, destination FROM vista_listado_reservas`),
        [] as { id: string; destination: string | null }[],
      ),
      this.seguro(
        'vuelos de aerolíneas socias',
        () => this.dataSource.query(`SELECT status, grand_total, created_at, destination FROM public.vuelos_reservas_socio`),
        [] as any[],
      ),
      this.seguro('autos', () => this.orderAutoRepo.find(), [] as OrderAuto[]),
      this.seguro('atracciones', () => this.reservaAtraccionRepo.find(), [] as ReservaAtraccion[]),
      this.seguro('hospedaje', () => this.reservaAlojamientoRepo.find(), [] as ReservaAlojamiento[]),
    ]);

    const destinoVuelo = new Map(destinosVuelos.map((d) => [String(d.id), d.destination]));
    const idsAloj = [...new Set(hospedaje.map((h) => h.alojamientoId).filter(Boolean))];
    const alojs = idsAloj.length
      ? await this.seguro('alojamientos', () => this.alojamientoRepo.find({ where: idsAloj.map((id) => ({ id })) as any }), [] as Alojamiento[])
      : [];
    const destinoAloj = new Map(alojs.map((a: any) => [String(a.id), a.destino || a.ubicacion?.city || null]));

    const fecha = (v: any) => (v ? new Date(v) : new Date(0));
    return [
      ...vuelos.map((r) => ({
        vertical: 'vuelos' as const,
        estado: String(r.estado),
        total: Number(r.total || 0),
        createdAt: fecha(r.fechaCreacion),
        destino: destinoVuelo.get(String(r.idReserva)) ?? null,
      })),
      ...socios.map((s: any) => ({
        vertical: 'vuelos' as const,
        estado: String(s.status),
        total: Number(s.grand_total || 0),
        createdAt: fecha(s.created_at),
        destino: s.destination ?? null,
      })),
      ...autos.map((o) => ({
        vertical: 'autos' as const,
        estado: String(o.status),
        total: Number(o.totalPrice?.total || 0),
        createdAt: fecha(o.createdAt),
        destino: null,
      })),
      ...atracciones.map((a) => ({
        vertical: 'atracciones' as const,
        estado: String(a.status),
        total: Number(a.totalPrice?.total || 0),
        createdAt: fecha(a.createdAt),
        destino: null,
      })),
      ...hospedaje.map((h: any) => ({
        vertical: 'hospedaje' as const,
        estado: String(h.status),
        total: Number(h.totalPrice?.total ?? h.total ?? 0),
        createdAt: fecha(h.createdAt),
        destino: destinoAloj.get(String(h.alojamientoId)) ?? null,
      })),
    ];
  }

  /**
   * Datos en vivo para la pestaña "Procesos": cuántas reservas de aerolíneas
   * socias hay en cada estado, cuánto se cobró y reembolsó, y el estado real
   * de cada aerolínea registrada.
   */
  async getProcesoVuelos() {
    const [estados, dinero, aerolineas] = await Promise.all([
      this.seguro(
        'estados de reservas socias',
        () => this.dataSource.query(`SELECT status, COUNT(*)::int AS n FROM public.vuelos_reservas_socio GROUP BY status`),
        [] as { status: string; n: number }[],
      ),
      this.seguro(
        'dinero de reservas socias',
        () =>
          this.dataSource.query(
            `SELECT COALESCE(SUM(grand_total),0)::float AS cobrado, COALESCE(SUM(reembolsado),0)::float AS reembolsado,
                    COUNT(*) FILTER (WHERE transaccion_id IS NULL)::int AS sin_pago
               FROM public.vuelos_reservas_socio`,
          ),
        [{ cobrado: 0, reembolsado: 0, sin_pago: 0 }],
      ),
      this.seguro(
        'aerolíneas',
        () =>
          this.dataSource.query(
            `SELECT codigo_nodo, nombre_proveedor, health_status, kill_switch_activo, latencia_ms, ultimo_ping_at, base_url_rest
               FROM schema_proveedores.config_proveedor WHERE vertical = 'VUELOS' ORDER BY nombre_proveedor`,
          ),
        [] as any[],
      ),
    ]);
    const porEstado: Record<string, number> = {};
    for (const e of estados) porEstado[String(e.status).toUpperCase()] = Number(e.n);
    const d = dinero[0] || {};
    return {
      generadoEn: new Date().toISOString(),
      porEstado,
      totalReservas: Object.values(porEstado).reduce((a, b) => a + b, 0),
      cobrado: Math.round(Number(d.cobrado || 0) * 100) / 100,
      reembolsado: Math.round(Number(d.reembolsado || 0) * 100) / 100,
      sinPagoRegistrado: Number(d.sin_pago || 0),
      timeoutMs: Number(process.env.VUELOS_SOCIOS_TIMEOUT_MS) || 8000,
      fuente: (process.env.VUELOS_FUENTE || 'socios').toLowerCase(),
      aerolineas: aerolineas.map((a: any) => ({
        codigo: a.codigo_nodo,
        nombre: a.nombre_proveedor,
        estado: a.kill_switch_activo
          ? 'APAGADA'
          : !/^https?:\/\//i.test(a.base_url_rest || '') || a.health_status === 'UNKNOWN'
            ? 'SIN_VERIFICAR'
            : a.health_status === 'DOWN'
              ? 'CAIDA'
              : 'EN_LINEA',
        latenciaMs: a.latencia_ms,
        ultimoPing: a.ultimo_ping_at,
      })),
    };
  }

  /** Estado REAL de los socios registrados (último ping guardado). */
  private async proveedores() {
    const filas = await this.seguro(
      'proveedores',
      () =>
        this.dataSource.query(
          `SELECT vertical, health_status, kill_switch_activo, base_url_rest, ultimo_ping_at
             FROM schema_proveedores.config_proveedor`,
        ),
      [] as any[],
    );
    const res = { total: filas.length, enLinea: 0, caidos: 0, sinVerificar: 0, apagados: 0, porVertical: {} as Record<string, number> };
    for (const f of filas) {
      const v = String(f.vertical || '').toLowerCase();
      res.porVertical[v] = (res.porVertical[v] || 0) + 1;
      if (f.kill_switch_activo) res.apagados += 1;
      else if (!/^https?:\/\//i.test(f.base_url_rest || '') || f.health_status === 'UNKNOWN') res.sinVerificar += 1;
      else if (f.health_status === 'DOWN') res.caidos += 1;
      else res.enLinea += 1;
    }
    return res;
  }
}
