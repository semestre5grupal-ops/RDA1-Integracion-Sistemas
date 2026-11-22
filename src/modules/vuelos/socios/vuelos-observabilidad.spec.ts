import { burnRate, evaluarSlo, SLOS_VUELOS, VentanasSli } from './vuelos-slo';
import { asegurarTraceparent, leerTraceparent, spanVuelos, traceIdDe, traceparentSaliente } from './vuelos-observabilidad';

const ventana = (total: number, malos: number) => ({ total, malos });
const todas = (t: number, m: number): VentanasSli => ({ h1: ventana(t, m), h6: ventana(t, m), h24: ventana(t, m), d7: ventana(t, m) });
const def = (id: string) => SLOS_VUELOS.find((s) => s.id === id)!;

describe('SLO de vuelos', () => {
  it('burn rate 1x cuando el ritmo de fallos es el permitido', () => {
    expect(burnRate(ventana(1000, 5), 0.995)).toBeCloseTo(1, 5); // 0,5 % permitido y 0,5 % observado
    expect(burnRate(ventana(1000, 72), 0.995)).toBeCloseTo(14.4, 5);
    expect(burnRate(ventana(0, 0), 0.995)).toBeNull();
  });

  it('cumple: dentro de la meta no genera alerta', () => {
    const r = evaluarSlo(def('busqueda_disponible'), todas(1000, 2));
    expect(r.estado).toBe('ok');
    expect(r.cumplimiento).toBeCloseTo(0.998, 3);
    expect(r.fallosPermitidos).toBe(5);
    expect(r.presupuestoConsumidoPct).toBeCloseTo(40, 1); // 2 de 5 permitidos
  });

  it('presupuesto agotado: atención con mensaje de frenar cambios', () => {
    const r = evaluarSlo(def('busqueda_disponible'), { h1: ventana(10, 0), h6: ventana(100, 0), h24: ventana(500, 4), d7: ventana(1000, 8) });
    expect(r.presupuestoConsumidoPct).toBeCloseTo(160, 1);
    expect(r.estado).toBe('atencion');
    expect(r.mensaje).toMatch(/agotó/);
  });

  it('gasto muy rápido en 1 h y 6 h: crítico', () => {
    // Meta 95 %: se permite 5 % de fallos. 80 % de fallos en 1 h = 16x; 75 % en 6 h = 15x.
    const r = evaluarSlo(def('compra_exitosa'), { h1: ventana(10, 8), h6: ventana(40, 30), h24: ventana(100, 40), d7: ventana(200, 50) });
    expect(r.burnRate.h1).toBe(16);
    expect(r.estado).toBe('critico');
    // Mismo volumen pero solo 50 % de fallos (10x): preocupa, pero no es crítico.
    const medio = evaluarSlo(def('compra_exitosa'), { h1: ventana(10, 5), h6: ventana(40, 20), h24: ventana(100, 25), d7: ventana(200, 30) });
    expect(medio.estado).toBe('atencion');
  });

  it('reembolso 100 %: un solo fallo ya es crítico', () => {
    expect(evaluarSlo(def('reembolso_total'), todas(10, 0)).estado).toBe('ok');
    const r = evaluarSlo(def('reembolso_total'), todas(10, 1));
    expect(r.estado).toBe('critico');
    expect(r.fallosPermitidos).toBe(0);
  });

  it('reembolso: un solo cobro sin devolver es crítico aunque haya pocos datos', () => {
    const r = evaluarSlo(def('reembolso_total'), todas(2, 1));
    expect(r.estado).toBe('critico');
    expect(evaluarSlo(def('reembolso_total'), todas(0, 0)).estado).toBe('sin_datos');
  });

  it('con muy pocos datos no opina', () => {
    expect(evaluarSlo(def('busqueda_rapida'), todas(3, 3)).estado).toBe('sin_datos');
    expect(evaluarSlo(def('busqueda_rapida'), todas(0, 0)).cumplimiento).toBeNull();
  });
});

describe('trace_id y traceparent de vuelos', () => {
  const valido = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  const anterior = { ...process.env };
  afterEach(() => {
    process.env = { ...anterior };
  });

  it('lee un traceparent válido y rechaza los inválidos o de ceros', () => {
    expect(leerTraceparent(valido)?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(leerTraceparent('basura')).toBeNull();
    expect(leerTraceparent(`00-${'0'.repeat(32)}-00f067aa0ba902b7-01`)).toBeNull();
  });

  it('conserva el trace_id que ya trae la petición', () => {
    const h: Record<string, any> = { traceparent: valido };
    const respuesta: Record<string, string> = {};
    const id = asegurarTraceparent(h, (k, v) => (respuesta[k] = v));
    expect(id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(traceIdDe(h)).toBe(id);
    expect(respuesta.traceparent).toContain(id);
  });

  it('si no trae traceparent, lo genera válido (antes los logs de vuelos salían con trace_id vacío)', () => {
    const h: Record<string, any> = {};
    const id = asegurarTraceparent(h);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(leerTraceparent(h['traceparent'])?.traceId).toBe(id);
  });

  it('el traceparent hacia la aerolínea va apagado por defecto y con el mismo trace_id al encenderlo', () => {
    const h: Record<string, any> = { traceparent: valido };
    delete process.env.VUELOS_TRACEPARENT_SALIDA;
    expect(traceparentSaliente(h)).toBeNull();
    process.env.VUELOS_TRACEPARENT_SALIDA = 'true';
    expect(traceparentSaliente(h)).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
  });

  it('sin OTEL_ENABLED el span solo ejecuta la función y propaga errores', async () => {
    delete process.env.OTEL_ENABLED;
    await expect(spanVuelos('vuelos.prueba', { a: 1 }, async () => 42)).resolves.toBe(42);
    await expect(spanVuelos('vuelos.prueba', {}, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
  });

  it('con OTEL_ENABLED y sin SDK (no-op) tampoco rompe la compra', async () => {
    process.env.OTEL_ENABLED = 'true';
    await expect(spanVuelos('vuelos.prueba', { a: 1, b: undefined }, async () => 'ok')).resolves.toBe('ok');
    await expect(spanVuelos('vuelos.prueba', {}, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
  });
});
