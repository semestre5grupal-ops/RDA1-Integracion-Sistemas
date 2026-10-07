import {
  calcularNoches, esFechaCalendario, fechaRelativa, validarCapacidad, validarEstancia,
  MAX_NOCHES_POR_RESERVA,
} from './reglas-estancia';
import { ProblemaApi } from '../../core/errors/codigo-error';

const D = (n: number) => fechaRelativa(n);

function errorDe(fn: () => unknown): ProblemaApi {
  try {
    fn();
  } catch (e) {
    return e as ProblemaApi;
  }
  throw new Error('Se esperaba una excepción');
}

describe('reglas-estancia', () => {
  describe('esFechaCalendario', () => {
    it.each(['2026-01-01', '2028-02-29', '2026-12-31'])('"%s" es válida', (f) => {
      expect(esFechaCalendario(f)).toBe(true);
    });
    it.each(['2027-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', '26-01-01', '2026/01/01', '', 'hoy', '2026-01-01T00:00:00Z'])(
      '"%s" no es válida',
      (f) => expect(esFechaCalendario(f)).toBe(false),
    );
    it.each([null, undefined, 20260101, {}])('%p no es válida', (f) => expect(esFechaCalendario(f)).toBe(false));
  });

  describe('calcularNoches', () => {
    it.each([
      ['2026-10-10', '2026-10-13', 3],
      ['2026-12-30', '2027-01-02', 3], // cambio de año
      ['2028-02-28', '2028-03-01', 2], // año bisiesto
      ['2027-02-28', '2027-03-01', 1],
      ['2026-03-07', '2026-03-09', 2], // semana de cambio de horario en EE. UU.
      ['2026-10-31', '2026-11-02', 2],
    ])('%s → %s = %i noches', (a, b, n) => expect(calcularNoches(a, b)).toBe(n));
  });

  describe('fechaRelativa', () => {
    it('suma días cruzando meses y años', () => {
      const base = new Date(Date.UTC(2026, 11, 30));
      expect(fechaRelativa(0, base)).toBe('2026-12-30');
      expect(fechaRelativa(3, base)).toBe('2027-01-02');
      expect(fechaRelativa(-30, base)).toBe('2026-11-30');
    });
  });

  describe('validarEstancia', () => {
    it('devuelve las noches de una estancia válida', () => {
      expect(validarEstancia(D(1), D(4))).toBe(3);
    });

    it(`acepta exactamente ${MAX_NOCHES_POR_RESERVA} noches y rechaza una más`, () => {
      expect(validarEstancia(D(1), D(1 + MAX_NOCHES_POR_RESERVA))).toBe(MAX_NOCHES_POR_RESERVA);
      expect(errorDe(() => validarEstancia(D(1), D(2 + MAX_NOCHES_POR_RESERVA))).getStatus()).toBe(400);
    });

    it('rechaza 0 noches y salida anterior', () => {
      expect(errorDe(() => validarEstancia(D(3), D(3))).invalidParams[0].name).toBe('checkout');
      expect(errorDe(() => validarEstancia(D(3), D(1))).invalidParams[0].name).toBe('checkout');
    });

    it('rechaza llegadas pasadas salvo que se permita (historial)', () => {
      expect(errorDe(() => validarEstancia(D(-2), D(1))).invalidParams[0].name).toBe('checkin');
      expect(validarEstancia(D(-10), D(-8), { permitirPasado: true })).toBe(2);
    });

    it('tolera "ayer" en UTC: en Ecuador (UTC-5) por la noche, UTC ya va un día por delante', () => {
      expect(validarEstancia(D(-1), D(1))).toBe(2);
    });

    it('rechaza más de 500 días de antelación', () => {
      expect(validarEstancia(D(500), D(501))).toBe(1);
      expect(errorDe(() => validarEstancia(D(501), D(502))).invalidParams[0].name).toBe('checkin');
    });

    it('señala ambos campos si los dos tienen mal formato, con prefijo', () => {
      const e = errorDe(() => validarEstancia('x', 'y', { prefijo: 'dates' }));
      expect(e.invalidParams.map((p) => p.name)).toEqual(['dates.checkin', 'dates.checkout']);
      expect(e.codigo).toBe('VALIDATION_FAILED');
    });
  });

  describe('validarCapacidad', () => {
    const hab = { capacidadAdultos: 2, capacidadNinos: 1, habitaciones: 3 };

    it.each([
      [2, 0, 1],
      [2, 1, 1],
      [1, 2, 1], // un niño ocupa la plaza libre de adulto
      [4, 2, 2],
      [6, 3, 3],
    ])('%i adultos + %i niños en %i hab. caben', (a, n, h) => {
      expect(() => validarCapacidad(hab, a, n, h)).not.toThrow();
    });

    it.each([
      [3, 0, 1, 'adultos'],
      [2, 2, 1, 'ninos'],
      [5, 0, 2, 'adultos'],
    ])('%i adultos + %i niños en %i hab. NO caben (%s)', (a, n, h, campo) => {
      expect(errorDe(() => validarCapacidad(hab, a, n, h)).invalidParams.map((p) => p.name)).toContain(campo);
    });

    it('sin capacidad configurada asume 2 adultos por habitación', () => {
      expect(() => validarCapacidad({}, 2, 0, 1)).not.toThrow();
      expect(() => validarCapacidad({}, 3, 0, 1)).toThrow();
    });
  });
});
