/**
 * Suite 03 — Búsqueda de alojamientos (POST /alojamientos/search).
 *
 * Referencia Booking:
 * - Buscar "Quito" devuelve SOLO alojamientos de Quito; un destino sin oferta
 *   devuelve "0 resultados", nunca hoteles de otra ciudad.
 * - La búsqueda tolera mayúsculas, tildes y espacios ("cancun" = "Cancún").
 * - Las fechas se validan: salida posterior a la entrada, no en el pasado, máx.
 *   30 noches. Huéspedes y habitaciones tienen límites razonables.
 * - Es una consulta: responde 200, no 201.
 */
import { AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, dia } from './app-prueba';

const ids = (res: any) => res.body.data.map((a: any) => a.id).sort();
const QUITO = ['quito-ejido', 'quito-epiq', 'quito-gangotena'];

describe('03 · Búsqueda de alojamientos', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(() => {
    t.sembrarCatalogo();
    t.repos.reservas.limpiar();
    t.telemetria.trackEvent.mockClear();
  });

  const buscar = (body: Record<string, unknown>) => t.pedir('POST', '/alojamientos/search', { body });

  describe('Por destino', () => {
    it('"Quito" → 200 con los 3 alojamientos de Quito y nada más', async () => {
      const res = await buscar({ destino: 'Quito' });
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual(QUITO);
      expect(res.body.data.every((a: any) => a.destino === 'Quito')).toBe(true);
    });

    it.each(['quito', 'QUITO', 'QuItO', '  Quito  ', 'quíto', 'Quit'])(
      'tolera mayúsculas, tildes, espacios y texto parcial: "%s"',
      async (texto) => {
        expect(ids(await buscar({ destino: texto }))).toEqual(QUITO);
      },
    );

    it.each([
      ['Cancún', ['cancun-coral']],
      ['cancun', ['cancun-coral']],
      ['CANCUN', ['cancun-coral']],
      ['Medellin', ['medellin-clickclack']],
      ['medellín', ['medellin-clickclack']],
      ['Cartagena', ['cartagena-charleston']],
      ['cusco', ['cusco-inka']],
    ])('"%s" encuentra su destino con o sin tilde', async (texto, esperado) => {
      expect(ids(await buscar({ destino: texto }))).toEqual(esperado);
    });

    it.each([
      ['Gangotena', ['quito-gangotena']],
      ['click clack', ['medellin-clickclack']],
      ['Palacio del Inka', ['cusco-inka']],
    ])('también busca por nombre del alojamiento: "%s"', async (texto, esperado) => {
      expect(ids(await buscar({ destino: texto }))).toEqual(esperado);
    });

    it.each(['Madrid', 'Tokio', 'zzzz', 'Guayaquil'])(
      'destino sin oferta "%s" → 200 con 0 resultados (no hoteles de otra ciudad)',
      async (texto) => {
        const res = await buscar({ destino: texto });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.metadata.total_results).toBe(0);
        expect(res.body.next_page).toBeNull();
      },
    );

    it('acepta "city" como alias de texto del destino', async () => {
      expect(ids(await buscar({ city: 'Cusco' }))).toEqual(['cusco-inka']);
    });

    it.each([
      ['ec', QUITO],
      ['mx', ['cancun-coral']],
      ['co', ['cartagena-charleston']],
      ['pe', ['cusco-inka']],
    ])('por país "%s" sin destino', async (pais, esperado) => {
      expect(ids(await buscar({ country: pais }))).toEqual(esperado);
    });

    it('país sin oferta → 0 resultados', async () => {
      expect((await buscar({ country: 'jp' })).body.data).toEqual([]);
    });

    it('sin destino ni país → devuelve el catálogo (exploración)', async () => {
      const res = await buscar({});
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(7);
    });

    it('cada resultado incluye request_id y metadata del total', async () => {
      const res = await buscar({ destino: 'Quito' });
      expect(res.body.request_id).toMatch(/^req-\d+$/);
      expect(res.body.metadata).toEqual({ total_results: 3, next_page: null });
    });
  });

  describe('Paginación de resultados (rows)', () => {
    it('rows limita el número de resultados y ofrece token de página siguiente', async () => {
      const res = await buscar({ destino: 'Quito', rows: 2 });
      expect(res.body.data).toHaveLength(2);
      expect(res.body.metadata.total_results).toBe(3);
      expect(res.body.next_page).toEqual(expect.any(String));
      expect(JSON.parse(Buffer.from(res.body.next_page, 'base64').toString())).toEqual({ page: 2 });
    });

    it.each([0, -1, 101, 2.5, '10'])('rows=%p fuera de rango o tipo → 400', async (rows) => {
      const res = await buscar({ rows });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('rows');
    });
  });

  describe('Filtros', () => {
    it('tienePiscina=true deja solo alojamientos con piscina', async () => {
      const res = await buscar({ filters: { tienePiscina: true } });
      expect(ids(res)).toEqual(['cancun-coral', 'cartagena-charleston', 'quito-epiq']);
      expect(res.body.data.every((a: any) => a.tienePiscina)).toBe(true);
    });

    it('combina destino + piscina', async () => {
      expect(ids(await buscar({ destino: 'Quito', filters: { tienePiscina: true } }))).toEqual(['quito-epiq']);
    });

    it('rango de precio por noche [100, 260] (extremos incluidos)', async () => {
      const res = await buscar({ filters: { precioMin: 120, precioMax: 250 } });
      expect(ids(res)).toEqual(['cusco-inka', 'quito-epiq', 'quito-gangotena']);
      for (const a of res.body.data) {
        expect(a.precioPorNoche).toBeGreaterThanOrEqual(120);
        expect(a.precioPorNoche).toBeLessThanOrEqual(250);
      }
    });

    it('solo precio máximo (presupuesto ajustado)', async () => {
      expect(ids(await buscar({ filters: { precioMax: 100 } }))).toEqual(['medellin-clickclack', 'quito-ejido']);
    });

    it('filtros sin coincidencias → 0 resultados', async () => {
      const res = await buscar({ destino: 'Medellín', filters: { tienePiscina: true } });
      expect(res.body.data).toEqual([]);
    });

    it('precioMin > precioMax → 400 (rango imposible)', async () => {
      const res = await buscar({ filters: { precioMin: 300, precioMax: 100 } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['filters.precioMin']);
    });

    it.each([
      ['filters.precioMin', { precioMin: -1 }],
      ['filters.precioMax', { precioMax: -50 }],
      ['filters.precioMin', { precioMin: 'barato' }],
      ['filters.tienePiscina', { tienePiscina: 'si' }],
      ['filters.rating.minimum_review_score', { rating: { minimum_review_score: 'alto' } }],
      ['filters.estrellas', { estrellas: 5 }],
    ])('filtro inválido → 400 en "%s"', async (campo, filters) => {
      const res = await buscar({ filters });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });
  });

  describe('Fechas de la búsqueda', () => {
    it('fechas válidas → 200', async () => {
      const res = await buscar({ destino: 'Quito', checkin: dia(7), checkout: dia(9) });
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual(QUITO);
    });

    it('acepta el formato del frontend dates: { checkin, checkout }', async () => {
      const res = await buscar({ destino: 'Quito', dates: { checkin: dia(7), checkout: dia(9) } });
      expect(res.status).toBe(200);
    });

    it('llegada hoy es válida', async () => {
      expect((await buscar({ checkin: dia(0), checkout: dia(1) })).status).toBe(200);
    });

    it('30 noches es el máximo permitido', async () => {
      expect((await buscar({ checkin: dia(1), checkout: dia(31) })).status).toBe(200);
    });

    it.each([
      ['salida = entrada (0 noches)', dia(5), dia(5), 'checkout'],
      ['salida antes de la entrada', dia(9), dia(5), 'checkout'],
      ['31 noches', dia(1), dia(32), 'checkout'],
      ['llegada anteayer', dia(-2), dia(2), 'checkin'],
      ['llegada hace un año', dia(-365), dia(-360), 'checkin'],
      ['llegada a más de 500 días', dia(501), dia(503), 'checkin'],
      ['fecha imposible 30 de febrero', '2027-02-30', '2027-03-02', 'checkin'],
      ['formato dd/mm/aaaa', '10/12/2026', '12/12/2026', 'checkin'],
      ['fecha con hora', `${dia(5)}T10:00:00Z`, dia(7), 'checkin'],
      ['texto libre', 'mañana', 'pasado', 'checkin'],
      ['solo checkin', dia(5), undefined, 'checkout'],
      ['solo checkout', undefined, dia(5), 'checkin'],
    ])('%s → 400 señalando "%s"', async (_caso, checkin, checkout, campo) => {
      const res = await buscar({ destino: 'Quito', checkin, checkout });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('en el formato dates: {...} el campo inválido se reporta como dates.checkout', async () => {
      const res = await buscar({ dates: { checkin: dia(9), checkout: dia(5) } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['dates.checkout']);
    });

    it('fechas de tipo numérico → 400 por esquema', async () => {
      const res = await buscar({ checkin: 20261010, checkout: 20261012 });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
    });
  });

  describe('Huéspedes, habitaciones y contexto del comprador', () => {
    it('ocupación del frontend (adultos, niños, habitaciones) → 200', async () => {
      expect((await buscar({ destino: 'Quito', adultos: 2, ninos: 1, habitaciones: 1 })).status).toBe(200);
    });

    it('ocupación en formato contrato (guests) → 200', async () => {
      const res = await buscar({ guests: { number_of_adults: 2, number_of_rooms: 1, children: [5, 9] } });
      expect(res.status).toBe(200);
    });

    it.each([
      ['adultos', { adultos: 0 }],
      ['adultos', { adultos: 31 }],
      ['adultos', { adultos: 1.5 }],
      ['ninos', { ninos: -1 }],
      ['ninos', { ninos: 11 }],
      ['habitaciones', { habitaciones: 0 }],
      ['habitaciones', { habitaciones: 31 }],
      ['guests.number_of_adults', { guests: { number_of_adults: 0, number_of_rooms: 1 } }],
      ['guests.number_of_rooms', { guests: { number_of_adults: 2, number_of_rooms: 0 } }],
      ['guests.children', { guests: { number_of_adults: 2, number_of_rooms: 1, children: [18] } }],
      ['guests.children', { guests: { number_of_adults: 2, number_of_rooms: 1, children: [-2] } }],
    ])('ocupación imposible → 400 en "%s"', async (campo, cambio) => {
      const res = await buscar(cambio);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('booker válido (país, plataforma, propósito) → 200', async () => {
      const res = await buscar({
        destino: 'Quito',
        booker: { country: 'ec', platform: 'mobile', travel_purpose: 'business' },
      });
      expect(res.status).toBe(200);
    });

    it.each([
      ['booker.country', { country: 'EC', platform: 'desktop' }],
      ['booker.country', { country: 'ecu', platform: 'desktop' }],
      ['booker.platform', { country: 'ec', platform: 'smartwatch' }],
      ['booker.travel_purpose', { country: 'ec', platform: 'desktop', travel_purpose: 'vacaciones' }],
    ])('booker inválido → 400 en "%s"', async (campo, booker) => {
      const res = await buscar({ booker });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it.each(['usd', 'US', 'DOLAR', 'U$D'])('moneda "%s" no ISO 4217 → 400', async (currency) => {
      const res = await buscar({ currency });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['currency']);
    });

    it('destino demasiado largo (>100 caracteres) → 400', async () => {
      const res = await buscar({ destino: 'Q'.repeat(101) });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['destino']);
    });

    it('destino no textual → 400', async () => {
      const res = await buscar({ destino: 123 });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
    });
  });

  describe('Resultados coherentes con filtros, paginación y disponibilidad', () => {
    it('filtro sin coincidencias y sin destino → 0 resultados (no el catálogo entero)', async () => {
      const res = await buscar({ filters: { precioMax: 1 } });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.metadata.total_results).toBe(0);
    });

    it('los filtros se aplican antes de paginar (rows=1 con piscina sigue encontrando)', async () => {
      const res = await buscar({ rows: 1, filters: { tienePiscina: true } });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].tienePiscina).toBe(true);
      expect(res.body.metadata.total_results).toBe(3);
    });

    it('con fechas, cada resultado trae noches, precio total y habitaciones libres', async () => {
      const res = await buscar({ destino: 'Medellín', checkin: dia(10), checkout: dia(13) });
      expect(res.body.data[0].disponibilidad).toEqual({
        available_rooms: 4,
        nights: 3,
        total_price: 285, // 95 × 3 noches
        currency: 'USD',
      });
    });

    it('sin fechas no se inventa disponibilidad', async () => {
      const res = await buscar({ destino: 'Medellín' });
      expect(res.body.data[0].disponibilidad).toBeUndefined();
    });

    it('un alojamiento COMPLETO en esas fechas no aparece (como en Booking)', async () => {
      t.repos.reservas.sembrar({
        codigoReserva: 'BKG-111111', alojamientoId: 'quito-ejido', customerName: 'X', status: 'CONFIRMED',
        checkin: dia(10), checkout: dia(12), noches: 2, habitacionesCount: 1, total: 91,
      });
      const res = await buscar({ destino: 'Quito', checkin: dia(10), checkout: dia(12) });
      expect(ids(res)).toEqual(['quito-epiq', 'quito-gangotena']);
      expect(res.body.metadata.total_results).toBe(2);
    });

    it('…pero vuelve a aparecer para fechas que no se solapan (salida = nueva entrada)', async () => {
      t.repos.reservas.sembrar({
        codigoReserva: 'BKG-222222', alojamientoId: 'quito-ejido', customerName: 'X', status: 'CONFIRMED',
        checkin: dia(10), checkout: dia(12), noches: 2, habitacionesCount: 1, total: 91,
      });
      const res = await buscar({ destino: 'Quito', checkin: dia(12), checkout: dia(14) });
      expect(ids(res)).toEqual(QUITO);
    });

    it('una reserva CANCELADA no ocupa habitación en la búsqueda', async () => {
      t.repos.reservas.sembrar({
        codigoReserva: 'BKG-333333', alojamientoId: 'quito-ejido', customerName: 'X', status: 'CANCELLED',
        checkin: dia(10), checkout: dia(12), noches: 2, habitacionesCount: 1, total: 91,
      });
      expect(ids(await buscar({ destino: 'Quito', checkin: dia(10), checkout: dia(12) }))).toEqual(QUITO);
    });

    it('pedir más habitaciones de las libres excluye el alojamiento', async () => {
      // Gangotena tiene 3 habitaciones, EpiQ 2, El Ejido 1.
      const res = await buscar({ destino: 'Quito', checkin: dia(10), checkout: dia(12), habitaciones: 3 });
      expect(ids(res)).toEqual(['quito-gangotena']);
    });
  });

  describe('Seguridad de la búsqueda', () => {
    it.each(["' OR 1=1 --", '%', '_', '%%%', '.*', '<script>alert(1)</script>'])(
      'entrada maliciosa o comodines "%s" no devuelven todo el catálogo ni rompen (200)',
      async (texto) => {
        const res = await buscar({ destino: texto });
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThan(7);
      },
    );
  });

  describe('Telemetría', () => {
    it('cada búsqueda registra el evento search_submitted con destino y fechas', async () => {
      await buscar({ destino: 'Quito', checkin: dia(3), checkout: dia(5), adultos: 2 });
      expect(t.telemetria.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: 'search_submitted',
          vertical: 'alojamientos',
          properties: expect.objectContaining({ destino: 'Quito', checkin: dia(3), checkout: dia(5), adultos: 2 }),
        }),
      );
    });

    it('una búsqueda rechazada por validación NO se registra como búsqueda', async () => {
      await buscar({ checkin: dia(5), checkout: dia(1) });
      expect(t.telemetria.trackEvent).not.toHaveBeenCalled();
    });
  });
});
