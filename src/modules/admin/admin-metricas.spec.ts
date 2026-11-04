import { calcularMetricas, grupoEstado, ReservaNormalizada } from './admin-metricas.service';

describe('calcularMetricas (tablero Resumen del admin)', () => {
  const ahora = new Date('2026-11-01T15:00:00Z');
  const r = (vertical: any, estado: string, total: number, fecha: string, destino: string | null = null): ReservaNormalizada => ({
    vertical, estado, total, createdAt: new Date(fecha), destino,
  });

  const datos = [
    r('vuelos', 'CONFIRMED', 100, '2026-11-01T10:00:00Z', 'GYE'),
    r('vuelos', 'CANCELLED', 80, '2026-10-30T10:00:00Z', 'GYE'),
    r('hospedaje', 'CONFIRMADA', 50, '2026-10-30T12:00:00Z', 'Cuenca'),
    r('autos', 'PENDING', 30, '2026-10-29T12:00:00Z'),
    r('atracciones', 'COMPLETED', 20, '2026-10-20T12:00:00Z'), // período anterior
    r('vuelos', 'CONFIRMED', 40, '2026-10-22T12:00:00Z', 'UIO'), // período anterior (7 días)
  ];

  it('clasifica estados en confirmadas / pendientes / canceladas', () => {
    expect(grupoEstado('ticketed')).toBe('confirmadas');
    expect(grupoEstado('HELD')).toBe('pendientes');
    expect(grupoEstado('REFUNDED')).toBe('canceladas');
    expect(grupoEstado('RARO')).toBe('otras');
  });

  it('calcula KPIs del período, comisión y comparación con el período anterior', () => {
    const m = calcularMetricas(datos, 7, 10, ahora);
    expect(m.kpis).toEqual({
      reservas: 4, reservasCobradas: 2, ingresos: 150, comision: 15, ticketPromedio: 75, tasaCancelacion: 25,
    });
    expect(m.kpisAnterior.ingresos).toBe(60); // 20 (atracciones) + 40 (vuelos), del 19 al 25
    expect(m.desde).toBe('2026-10-26');
    expect(m.hasta).toBe('2026-11-01');
  });

  it('devuelve todos los días del rango (los vacíos en cero) y solo suma ingresos cobrados', () => {
    const m = calcularMetricas(datos, 7, 0, ahora);
    expect(m.serieDiaria).toHaveLength(7);
    const d30 = m.serieDiaria.find((d) => d.fecha === '2026-10-30')!;
    expect(d30).toMatchObject({ reservas: 2, ingresos: 50 });
    expect(d30.porVertical.hospedaje).toBe(50);
    expect(m.serieDiaria.find((d) => d.fecha === '2026-10-27')).toMatchObject({ reservas: 0, ingresos: 0 });
  });

  it('agrupa por vertical con estados y ordena destinos por reservas', () => {
    const m = calcularMetricas(datos, 7, 0, ahora);
    const vuelos = m.porVertical.find((v) => v.vertical === 'vuelos')!;
    expect(vuelos).toMatchObject({ reservas: 2, ingresos: 100, estados: { confirmadas: 1, canceladas: 1, pendientes: 0, otras: 0 } });
    expect(m.topDestinos[0]).toEqual({ destino: 'GYE', reservas: 2, ingresos: 100 });
  });
});
