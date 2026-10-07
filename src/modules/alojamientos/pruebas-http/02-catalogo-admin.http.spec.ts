/**
 * Suite 02 — Catálogo (listado, detalle, paginación HATEOAS) y administración.
 *
 * Referencia Booking: el listado se pagina de forma estable, cada propiedad
 * expone precio numérico, moneda, fotos y enlaces navegables, y los cambios de
 * un administrador (precio, baja) se reflejan de inmediato al cliente.
 */
import {
  AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, HOTELES, TOTAL_HOTELES,
} from './app-prueba';

const ALTA_VALIDA = {
  nombre: 'Hostal Andino',
  destino: 'Otavalo',
  precioPorNoche: 38.9,
  capacidadAdultos: 3,
  capacidadNinos: 1,
  habitaciones: 4,
  tienePiscina: false,
};

describe('02 · Catálogo y administración de alojamientos', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(async () => {
    t.sembrarCatalogo();
    await (t.app.get('CACHE_MANAGER') as any).reset();
  });

  describe('GET /alojamientos (listado paginado)', () => {
    it('200 con data, meta y _links', async () => {
      const res = await t.pedir('GET', '/alojamientos');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(TOTAL_HOTELES);
      expect(res.body.meta).toEqual({ total: TOTAL_HOTELES, limit: 10, page: 1 });
      expect(res.body._links.self.href).toBe('/api/v1/alojamientos?page=1&limit=10');
    });

    it('cada alojamiento expone los campos que necesita una tarjeta de resultados', async () => {
      const res = await t.pedir('GET', '/alojamientos');
      for (const a of res.body.data) {
        expect(a).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            nombre: expect.any(String),
            destino: expect.any(String),
            precioPorNoche: expect.any(Number),
            moneda: expect.stringMatching(/^[A-Z]{3}$/),
            capacidadAdultos: expect.any(Number),
            habitaciones: expect.any(Number),
            tienePiscina: expect.any(Boolean),
            photos: expect.arrayContaining([expect.objectContaining({ url: expect.any(String) })]),
            amenidades: expect.any(Array),
            ratings: expect.objectContaining({ score: expect.any(Number) }),
            ubicacion: expect.any(Object),
            _links: expect.objectContaining({
              self: { href: `/api/v1/alojamientos/${a.id}`, type: 'GET' },
              reservations: { href: `/api/v1/alojamientos/${a.id}/reservations`, type: 'POST' },
            }),
          }),
        );
        expect(a.precioPorNoche).toBeGreaterThan(0);
      }
    });

    it('el precio es numérico con decimales exactos (no string)', async () => {
      const res = await t.pedir('GET', '/alojamientos/quito-ejido');
      expect(res.body.precioPorNoche).toBe(45.5);
    });

    it.each([
      [1, 3, ['quito-gangotena', 'quito-epiq', 'quito-ejido']],
      [2, 3, ['cancun-coral', 'cartagena-charleston', 'medellin-clickclack']],
      [3, 3, ['cusco-inka']],
    ])('página %i con limit %i devuelve los elementos correctos y sin solaparse', async (page, limit, ids) => {
      const res = await t.pedir('GET', `/alojamientos?page=${page}&limit=${limit}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((a: any) => a.id)).toEqual(ids);
      expect(res.body.meta).toEqual({ total: TOTAL_HOTELES, limit, page });
    });

    it('_links.next existe mientras hay más páginas y es null en la última', async () => {
      const primera = await t.pedir('GET', '/alojamientos?page=1&limit=3');
      expect(primera.body._links.next).toEqual({ href: '/api/v1/alojamientos?page=2&limit=3', type: 'GET' });
      expect(primera.body._links.prev).toBeNull();

      const ultima = await t.pedir('GET', '/alojamientos?page=3&limit=3');
      expect(ultima.body._links.next).toBeNull();
      expect(ultima.body._links.prev).toEqual({ href: '/api/v1/alojamientos?page=2&limit=3', type: 'GET' });
    });

    it('una página fuera de rango devuelve 200 con lista vacía (no 404)', async () => {
      const res = await t.pedir('GET', '/alojamientos?page=50&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body._links.next).toBeNull();
    });

    it.each([
      ['page=0', 'page'],
      ['page=-1', 'page'],
      ['page=abc', 'page'],
      ['page=1.5', 'page'],
      ['limit=0', 'limit'],
      ['limit=xyz', 'limit'],
      ['orden=precio', 'orden'],
    ])('query inválida ?%s → 400 señalando "%s"', async (query, campo) => {
      const res = await t.pedir('GET', `/alojamientos?${query}`);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('catálogo vacío → 200 con data [] y total 0', async () => {
      t.repos.alojamientos.limpiar();
      const res = await t.pedir('GET', '/alojamientos?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('GET /alojamientos/:id (detalle)', () => {
    it.each(Object.values(HOTELES).map((h) => [h.id, h.nombre, h.destino]))(
      '%s → 200 con nombre y destino correctos',
      async (id, nombre, destino) => {
        const res = await t.pedir('GET', `/alojamientos/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(id);
        expect(res.body.nombre).toBe(nombre);
        expect(res.body.destino).toBe(destino);
      },
    );

    it('incluye enlaces HATEOAS para reservar, cotizar y volver al catálogo', async () => {
      const res = await t.pedir('GET', '/alojamientos/quito-epiq');
      expect(res.body._links).toEqual({
        self: { href: '/api/v1/alojamientos/quito-epiq', type: 'GET' },
        reservar: { href: '/api/v1/alojamientos/quito-epiq/reservations', type: 'POST' },
        preview: { href: '/api/v1/alojamientos/orders/preview', type: 'POST' },
        catalogo: { href: '/api/v1/alojamientos', type: 'GET' },
      });
    });

    it('respeta la moneda propia del alojamiento', async () => {
      const res = await t.pedir('GET', '/alojamientos/cartagena-charleston');
      expect(res.body.moneda).toBe('COP');
    });

    it('un alojamiento sin fotos recibe una foto por defecto (nunca tarjeta vacía)', async () => {
      t.repos.alojamientos.sembrar({ id: 'sin-fotos', nombre: 'Sin Fotos', destino: 'Loja', precioPorNoche: 20, photos: [] });
      const res = await t.pedir('GET', '/alojamientos/sin-fotos');
      expect(res.body.photos.length).toBeGreaterThan(0);
      expect(res.body.photos[0].url).toMatch(/^https:\/\//);
    });

    it.each(['no-existe', 'QUITO-EPIQ', 'quito-epiq-x', '12345'])('id inexistente "%s" → 404', async (id) => {
      const res = await t.pedir('GET', `/alojamientos/${id}`);
      esperarProblema(res, 404);
      expect(res.body.detail).toBe('Alojamiento no encontrado');
    });
  });

  describe('POST /alojamientos (alta, administración)', () => {
    it('201 y devuelve el alojamiento creado con id generado y valores por defecto', async () => {
      const res = await t.pedir('POST', '/alojamientos', { body: ALTA_VALIDA });
      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^aloj-\d+$/),
          nombre: 'Hostal Andino',
          precioPorNoche: 38.9,
          amenidades: [],
          ubicacion: { city: 'Otavalo' },
        }),
      );
      expect(res.body.photos.length).toBe(1);
    });

    it('el alta aparece inmediatamente en el catálogo y en la búsqueda (sin caché obsoleta)', async () => {
      await t.pedir('GET', '/alojamientos'); // llena la caché
      const alta = await t.pedir('POST', '/alojamientos', { body: ALTA_VALIDA });
      const lista = await t.pedir('GET', '/alojamientos');
      expect(lista.body.meta.total).toBe(TOTAL_HOTELES + 1);
      const busqueda = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'otavalo' } });
      expect(busqueda.body.data.map((a: any) => a.id)).toEqual([alta.body.id]);
    });

    it.each([
      ['nombre', { nombre: 'AB' }],
      ['nombre', { nombre: 123 }],
      ['destino', { destino: '' }],
      ['precioPorNoche', { precioPorNoche: 0 }],
      ['precioPorNoche', { precioPorNoche: -10 }],
      ['precioPorNoche', { precioPorNoche: '120' }],
      ['capacidadAdultos', { capacidadAdultos: 0 }],
      ['capacidadAdultos', { capacidadAdultos: 2.5 }],
      ['capacidadNinos', { capacidadNinos: -1 }],
      ['habitaciones', { habitaciones: 0 }],
      ['tienePiscina', { tienePiscina: 'si' }],
      ['id', { id: 'quito-epiq' }],
    ])('campo inválido "%s" → 400', async (campo, cambio) => {
      const res = await t.pedir('POST', '/alojamientos', { body: { ...ALTA_VALIDA, ...cambio } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('cuerpo vacío → 400 listando todos los campos obligatorios', async () => {
      const res = await t.pedir('POST', '/alojamientos', { body: {} });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(
        expect.arrayContaining(['nombre', 'destino', 'precioPorNoche', 'capacidadAdultos', 'capacidadNinos', 'habitaciones', 'tienePiscina']),
      );
    });

    it('no permite sobrescribir un alojamiento existente enviando su id', async () => {
      const antes = await t.pedir('GET', '/alojamientos/quito-epiq');
      await t.pedir('POST', '/alojamientos', { body: { ...ALTA_VALIDA, id: 'quito-epiq' } });
      const despues = await t.pedir('GET', '/alojamientos/quito-epiq');
      expect(despues.body.nombre).toBe(antes.body.nombre);
    });
  });

  describe('PATCH /alojamientos/:id (actualización parcial)', () => {
    it('200 y solo cambia los campos enviados', async () => {
      const res = await t.pedir('PATCH', '/alojamientos/quito-epiq', { body: { precioPorNoche: 135 } });
      expect(res.status).toBe(200);
      expect(res.body.precioPorNoche).toBe(135);
      expect(res.body.nombre).toBe(HOTELES.epiq.nombre);
      expect(res.body.destino).toBe('Quito');
    });

    it('el nuevo precio se ve AL INSTANTE en el detalle y el listado (la caché se invalida)', async () => {
      await t.pedir('GET', '/alojamientos/quito-epiq');
      await t.pedir('GET', '/alojamientos');
      await t.pedir('PATCH', '/alojamientos/quito-epiq', { body: { precioPorNoche: 99 } });

      const detalle = await t.pedir('GET', '/alojamientos/quito-epiq');
      expect(detalle.body.precioPorNoche).toBe(99);
      const lista = await t.pedir('GET', '/alojamientos');
      expect(lista.body.data.find((a: any) => a.id === 'quito-epiq').precioPorNoche).toBe(99);
    });

    it('el nuevo precio se aplica a las reservas posteriores', async () => {
      await t.pedir('PATCH', '/alojamientos/medellin-clickclack', { body: { precioPorNoche: 100 } });
      const { dia } = await import('./app-prueba');
      const res = await t.pedir('POST', '/alojamientos/medellin-clickclack/reservations', {
        idem: true,
        body: { checkin: dia(20), checkout: dia(22), habitaciones_count: 1, customer_name: 'Ana', adultos: 1 },
      });
      expect(res.body.total_price.total).toBe(200);
    });

    it('cuerpo vacío → 200 sin cambios', async () => {
      const res = await t.pedir('PATCH', '/alojamientos/quito-epiq', { body: {} });
      expect(res.status).toBe(200);
      expect(res.body.precioPorNoche).toBe(120);
    });

    it.each([
      ['precioPorNoche', { precioPorNoche: -5 }],
      ['nombre', { nombre: 'X' }],
      ['habitaciones', { habitaciones: 0 }],
      ['estrellas', { estrellas: 5 }],
    ])('valor inválido en "%s" → 400 y no modifica nada', async (campo, cambio) => {
      const res = await t.pedir('PATCH', '/alojamientos/quito-epiq', { body: cambio });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
      const detalle = await t.pedir('GET', '/alojamientos/quito-epiq');
      expect(detalle.body.precioPorNoche).toBe(120);
    });

    it('id inexistente → 404', async () => {
      esperarProblema(await t.pedir('PATCH', '/alojamientos/no-existe', { body: { precioPorNoche: 10 } }), 404);
    });
  });

  describe('PUT /alojamientos/:id (reemplazo)', () => {
    it('204 y el detalle refleja los nuevos datos', async () => {
      const res = await t.pedir('PUT', '/alojamientos/cusco-inka', {
        body: { ...ALTA_VALIDA, nombre: 'Palacio del Inka Renovado', destino: 'Cusco' },
      });
      expect(res.status).toBe(204);
      const detalle = await t.pedir('GET', '/alojamientos/cusco-inka');
      expect(detalle.body.nombre).toBe('Palacio del Inka Renovado');
      expect(detalle.body.precioPorNoche).toBe(38.9);
    });

    it('PUT exige el recurso COMPLETO → 400 si falta un campo', async () => {
      const { tienePiscina, ...incompleto } = ALTA_VALIDA;
      const res = await t.pedir('PUT', '/alojamientos/cusco-inka', { body: incompleto });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('tienePiscina');
    });

    it('id inexistente → 404', async () => {
      esperarProblema(await t.pedir('PUT', '/alojamientos/no-existe', { body: ALTA_VALIDA }), 404);
    });
  });

  describe('DELETE /alojamientos/:id (baja)', () => {
    it('204, deja de aparecer en el detalle (404), el listado y la búsqueda', async () => {
      await t.pedir('GET', '/alojamientos/cusco-inka'); // en caché
      await t.pedir('GET', '/alojamientos');
      const res = await t.pedir('DELETE', '/alojamientos/cusco-inka');
      expect(res.status).toBe(204);

      esperarProblema(await t.pedir('GET', '/alojamientos/cusco-inka'), 404);
      const lista = await t.pedir('GET', '/alojamientos');
      expect(lista.body.data.map((a: any) => a.id)).not.toContain('cusco-inka');
      const busqueda = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'Cusco' } });
      expect(busqueda.body.data).toEqual([]);
    });

    it('borrar dos veces → la segunda es 404', async () => {
      expect((await t.pedir('DELETE', '/alojamientos/medellin-clickclack')).status).toBe(204);
      esperarProblema(await t.pedir('DELETE', '/alojamientos/medellin-clickclack'), 404);
    });
  });
});
