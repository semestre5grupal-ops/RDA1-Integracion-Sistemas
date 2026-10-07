/**
 * Suite 04 — Endpoints de catálogo del contrato (estilo Booking Demand API):
 * details, details/changes, chains, constants, reviews, reviews/scores y
 * GET /:id/resenas.
 *
 * Referencia Booking: las consultas por lotes responden por elemento (un ID
 * malo no tumba la respuesta), las políticas siguen el estándar de la industria
 * (check-in desde las 14:00, check-out hasta las 11:00) y las puntuaciones van
 * en escala 0–10.
 */
import { AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos } from './app-prueba';

describe('04 · Catálogo del contrato (details, changes, chains, constants, reviews)', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(() => {
    t.sembrarCatalogo();
    t.repos.resenas.limpiar();
  });

  describe('POST /alojamientos/details', () => {
    it('200 con el detalle de cada ID pedido, en el mismo orden', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', {
        body: { accommodations: ['cusco-inka', 'quito-epiq'] },
      });
      expect(res.status).toBe(200);
      expect(res.body.request_id).toMatch(/^req-batch-\d+$/);
      expect(res.body.data.map((d: any) => d.id)).toEqual(['cusco-inka', 'quito-epiq']);
      expect(res.body.data[0].nombre).toBe('Palacio del Inka');
    });

    it('un ID inexistente se marca como no encontrado sin inventar datos ni romper el lote', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', {
        body: { accommodations: ['quito-epiq', 'fantasma'] },
      });
      expect(res.status).toBe(200);
      expect(res.body.data[1]).toEqual({ id: 'fantasma', disponible: false, error: 'Alojamiento no encontrado' });
      expect(res.body.data[1].nombre).toBeUndefined();
    });

    it('con extras devuelve políticas estándar de la industria, instalaciones y tarifas', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', {
        body: { accommodations: ['quito-epiq'], extras: ['policies', 'facilities'] },
      });
      expect(res.status).toBe(200);
      const d = res.body.data[0];
      expect(d.policies).toEqual(
        expect.objectContaining({ checkin_from: '14:00', checkout_until: '11:00', pets_allowed: true }),
      );
      expect(d.facilities_detail.length).toBeGreaterThan(0);
      expect(d.bundles.map((b: any) => b.price_multiplier)).toEqual([1.0, 1.2]);
      expect(res.body.next_page).toBeNull();
    });

    it('pets_allowed es false si el alojamiento no admite mascotas', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', {
        body: { accommodations: ['quito-gangotena'], extras: ['policies'] },
      });
      expect(res.body.data[0].policies.pets_allowed).toBe(false);
    });

    it('extendido con ID inexistente → elemento con error, no 404 global', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', {
        body: { accommodations: ['fantasma'], country: 'ec' },
      });
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toEqual({ id: 'fantasma', disponible: false, error: 'Alojamiento no encontrado' });
    });

    it.each([
      ['lista vacía', { accommodations: [] }],
      ['sin accommodations', {}],
      ['no es lista', { accommodations: 'quito-epiq' }],
      ['más de 100 IDs', { accommodations: Array.from({ length: 101 }, (_, i) => `id-${i}`) }],
    ])('%s → 400', async (_caso, body) => {
      const res = await t.pedir('POST', '/alojamientos/details', { body });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('accommodations');
    });

    it('extras con elementos no textuales → 400', async () => {
      const res = await t.pedir('POST', '/alojamientos/details', { body: { accommodations: ['quito-epiq'], extras: [1] } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('extras');
    });
  });

  describe('POST /alojamientos/details/changes', () => {
    it('200 con los IDs modificados y la marca de tiempo para la siguiente consulta', async () => {
      const res = await t.pedir('POST', '/alojamientos/details/changes', { body: { last_change: '2026-09-01T00:00:00Z' } });
      expect(res.status).toBe(200);
      expect(res.body.data.from).toBe('2026-09-01T00:00:00Z');
      expect(new Date(res.body.data.next).toString()).not.toBe('Invalid Date');
      expect(res.body.data.total_changes).toBe(7);
      expect(res.body.data.changes.updated_accommodations).toContain('quito-epiq');
      expect(res.body.data.changes.deleted_accommodations).toEqual([]);
    });

    it('acepta filtros de países y ciudades', async () => {
      const res = await t.pedir('POST', '/alojamientos/details/changes', {
        body: { last_change: '2026-09-01T00:00:00Z', filters: { countries: ['ec'], cities: [1] } },
      });
      expect(res.status).toBe(200);
    });

    it.each([
      ['sin last_change', {}],
      ['fecha no ISO', { last_change: 'ayer' }],
      ['fecha dd/mm/aaaa', { last_change: '01/09/2026' }],
      ['tipo numérico', { last_change: 1725148800 }],
    ])('%s → 400 en last_change', async (_caso, body) => {
      const res = await t.pedir('POST', '/alojamientos/details/changes', { body });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('last_change');
    });
  });

  describe('POST /alojamientos/chains', () => {
    it('200 con cadenas y sus marcas', async () => {
      const res = await t.pedir('POST', '/alojamientos/chains');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      for (const cadena of res.body.data) {
        expect(cadena).toEqual({ id: expect.any(Number), name: expect.any(String), brands: expect.any(Array) });
        expect(cadena.brands.length).toBeGreaterThan(0);
      }
      expect(res.body.data.map((c: any) => c.name)).toContain('Marriott International');
    });

    it('los IDs de cadena y de marca son únicos', async () => {
      const res = await t.pedir('POST', '/alojamientos/chains');
      const cadenas = res.body.data.map((c: any) => c.id);
      const marcas = res.body.data.flatMap((c: any) => c.brands.map((b: any) => b.id));
      expect(new Set(cadenas).size).toBe(cadenas.length);
      expect(new Set(marcas).size).toBe(marcas.length);
    });
  });

  describe('POST /alojamientos/constants', () => {
    it('200 con los diccionarios que necesita un buscador tipo Booking', async () => {
      const res = await t.pedir('POST', '/alojamientos/constants', { body: { languages: ['es'] } });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['bed_types', 'facilities', 'meal_plans', 'property_types', 'room_types'].sort(),
      );
    });

    it.each(['room_only', 'breakfast_included', 'half_board', 'all_inclusive'])(
      'incluye el régimen de comidas "%s"',
      async (codigo) => {
        const res = await t.pedir('POST', '/alojamientos/constants');
        expect(res.body.data.meal_plans.map((m: any) => m.code)).toContain(codigo);
      },
    );

    it('las capacidades de los tipos de habitación son positivas y crecientes', async () => {
      const res = await t.pedir('POST', '/alojamientos/constants');
      const capacidades = res.body.data.room_types.map((r: any) => r.capacity);
      expect(capacidades.every((c: number) => c > 0)).toBe(true);
      expect([...capacidades].sort((a, b) => a - b)).toEqual(capacidades);
    });

    it('códigos únicos en cada diccionario', async () => {
      const res = await t.pedir('POST', '/alojamientos/constants');
      for (const lista of Object.values(res.body.data) as any[]) {
        const codigos = lista.map((x: any) => x.code);
        expect(new Set(codigos).size).toBe(codigos.length);
      }
    });

    it('languages con tipo incorrecto → 400', async () => {
      const res = await t.pedir('POST', '/alojamientos/constants', { body: { languages: 'es' } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('languages');
    });
  });

  describe('GET /alojamientos/:id/resenas', () => {
    it('200 con reseñas, total y puntuaciones promedio en escala 0–10', async () => {
      const res = await t.pedir('GET', '/alojamientos/quito-epiq/resenas');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(res.body.resenas.length);
      expect(res.body.total).toBeGreaterThan(0);
      for (const valor of Object.values(res.body.scores) as number[]) {
        expect(valor).toBeGreaterThanOrEqual(0);
        expect(valor).toBeLessThanOrEqual(10);
      }
    });

    it('el promedio general es la media real de las puntuaciones (1 decimal)', async () => {
      t.repos.resenas.sembrar(
        { alojamientoId: 'cusco-inka', usuarioNombre: 'A', puntuacion: 8, limpieza: 7, servicio: 9, calidad: 8, createdAt: new Date('2026-01-01') },
        { alojamientoId: 'cusco-inka', usuarioNombre: 'B', puntuacion: 9.5, limpieza: 10, servicio: 9, calidad: 9, createdAt: new Date('2026-02-01') },
      );
      const res = await t.pedir('GET', '/alojamientos/cusco-inka/resenas');
      expect(res.body.total).toBe(2);
      expect(res.body.scores).toEqual({ general: 8.8, limpieza: 8.5, servicio: 9, calidad: 8.5 });
    });

    it('las reseñas van de la más reciente a la más antigua', async () => {
      t.repos.resenas.sembrar(
        { alojamientoId: 'cusco-inka', usuarioNombre: 'Vieja', puntuacion: 8, limpieza: 8, servicio: 8, calidad: 8, createdAt: new Date('2025-01-01') },
        { alojamientoId: 'cusco-inka', usuarioNombre: 'Nueva', puntuacion: 9, limpieza: 9, servicio: 9, calidad: 9, createdAt: new Date('2026-05-01') },
      );
      const res = await t.pedir('GET', '/alojamientos/cusco-inka/resenas');
      expect(res.body.resenas.map((r: any) => r.usuarioNombre)).toEqual(['Nueva', 'Vieja']);
    });

    it('consultar dos veces no duplica las reseñas (GET idempotente)', async () => {
      const a = await t.pedir('GET', '/alojamientos/quito-epiq/resenas');
      const b = await t.pedir('GET', '/alojamientos/quito-epiq/resenas');
      expect(b.body.total).toBe(a.body.total);
    });

    it('alojamiento inexistente → 404', async () => {
      esperarProblema(await t.pedir('GET', '/alojamientos/fantasma/resenas'), 404);
    });
  });

  describe('POST /alojamientos/reviews y /reviews/scores', () => {
    beforeEach(() => {
      t.repos.resenas.sembrar(
        { alojamientoId: 'quito-epiq', usuarioNombre: 'Laura', usuarioPais: 'Ecuador', comentario: 'Genial', puntuacion: 9.6, limpieza: 10, servicio: 9.5, calidad: 9.2, createdAt: new Date('2026-03-01') },
        { alojamientoId: 'quito-epiq', usuarioNombre: 'Carlos', usuarioPais: 'Colombia', comentario: 'Muy bien', puntuacion: 9.2, limpieza: 9.5, servicio: 9, calidad: 9, createdAt: new Date('2026-04-01') },
      );
    });

    it('reviews → 200 con reseñas por alojamiento en formato contrato', async () => {
      const res = await t.pedir('POST', '/alojamientos/reviews', { body: { accommodations: ['quito-epiq'] } });
      expect(res.status).toBe(200);
      const item = res.body.data[0];
      expect(item.accommodation_id).toBe('quito-epiq');
      expect(item.reviews_count).toBe(2);
      expect(item.reviews[0]).toEqual(
        expect.objectContaining({
          author: 'Carlos',
          country: 'Colombia',
          score: 9.2,
          text: 'Muy bien',
          categories: { cleanliness: 9.5, service: 9, quality: 9 },
        }),
      );
    });

    it('reviews respeta rows', async () => {
      const res = await t.pedir('POST', '/alojamientos/reviews', { body: { accommodations: ['quito-epiq'], rows: 1 } });
      expect(res.body.data[0].reviews).toHaveLength(1);
    });

    it('reviews de un alojamiento sin reseñas → reviews_count 0', async () => {
      const res = await t.pedir('POST', '/alojamientos/reviews', { body: { accommodations: ['cusco-inka'] } });
      expect(res.body.data[0].reviews_count).toBe(0);
    });

    it.each([
      ['accommodations', { accommodations: [] }],
      ['rows', { accommodations: ['quito-epiq'], rows: 0 }],
      ['rows', { accommodations: ['quito-epiq'], rows: 500 }],
    ])('reviews inválido → 400 en "%s"', async (campo, body) => {
      const res = await t.pedir('POST', '/alojamientos/reviews', { body });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('scores → 200 con promedio y desglose por categoría', async () => {
      const res = await t.pedir('POST', '/alojamientos/reviews/scores', { body: { accommodations: ['quito-epiq'] } });
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toEqual({
        accommodation_id: 'quito-epiq',
        total_reviews: 2,
        average_score: 9.4,
        scores_breakdown: { cleanliness: 9.8, service: 9.3, quality: 9.1, location: expect.any(Number) },
      });
    });

    it('scores con un ID inexistente responde por elemento (no 404 del lote entero)', async () => {
      const res = await t.pedir('POST', '/alojamientos/reviews/scores', {
        body: { accommodations: ['quito-epiq', 'fantasma'] },
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[1]).toEqual({ accommodation_id: 'fantasma', error: 'Alojamiento no encontrado' });
    });

    it('scores con lista vacía → 400', async () => {
      esperarProblema(await t.pedir('POST', '/alojamientos/reviews/scores', { body: { accommodations: [] } }), 400, 'VALIDATION_FAILED');
    });
  });
});
