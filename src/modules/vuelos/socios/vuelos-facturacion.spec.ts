import { desglose, precioConRecargo } from './vuelos-facturacion';

describe('Precio de vuelos con recargo de Booking', () => {
  it('cliente paga el precio de la aerolínea + 10 %; la aerolínea recibe su precio', () => {
    expect(precioConRecargo(200, 10)).toEqual({ aerolinea: 200, cargo: 20, total: 220, pct: 10 });
  });

  it('redondea el cargo a centavos y el total es la suma exacta', () => {
    const p = precioConRecargo(72.6, 10);
    expect(p).toEqual({ aerolinea: 72.6, cargo: 7.26, total: 79.86, pct: 10 });
    const q = precioConRecargo(138.65, 10);
    expect(q.cargo).toBe(13.87);
    expect(q.total).toBe(152.52);
  });

  it('un porcentaje inválido vuelve al 10 % por defecto', () => {
    expect(precioConRecargo(100, Number.NaN).pct).toBe(10);
    expect(precioConRecargo(100, 80).pct).toBe(10);
    expect(precioConRecargo(100, 0)).toEqual({ aerolinea: 100, cargo: 0, total: 100, pct: 0 });
  });

  it('el cargo por servicio lleva IVA 15 % incluido y cuadra al centavo', () => {
    const d = desglose(20);
    expect(d.subtotal + d.impuestos).toBeCloseTo(20, 2);
    expect(d.pct).toBe(15);
  });

  it('el boleto usa la tarifa e impuestos que informó la aerolínea', () => {
    expect(desglose(72.6, 60.5, 12.1)).toEqual({ subtotal: 60.5, impuestos: 12.1, pct: 20 });
  });
});
