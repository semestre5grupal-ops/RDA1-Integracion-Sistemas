/**
 * Suite 01 — Contrato HTTP transversal de la API de Alojamientos.
 *
 * Booking.com (y cualquier API profesional) responde los errores con un formato
 * estable y legible por máquina. Aquí se verifica que TODOS los errores salen en
 * RFC 7807 (`application/problem+json`) con `type`, `title`, `status`, `detail`,
 * `instance` y, para validaciones, `code` + `invalidParams` con el campo exacto.
 */
import { AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, dia } from './app-prueba';

describe('01 · Contrato HTTP y formato de errores (RFC 7807)', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());

  describe('Healthcheck', () => {
    it('GET /alojamientos/health → 200 con estado y total de alojamientos', async () => {
      const res = await t.pedir('GET', '/alojamientos/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.body).toEqual({
        status: 'ok',
        service: 'Alojamientos',
        database: 'connected',
        total_listings: 7,
      });
    });

    it('el healthcheck refleja altas y bajas del catálogo', async () => {
      t.repos.alojamientos.sembrar({ id: 'temporal', nombre: 'Temporal', destino: 'Loja', precioPorNoche: 10 });
      expect((await t.pedir('GET', '/alojamientos/health')).body.total_listings).toBe(8);
      t.sembrarCatalogo();
      expect((await t.pedir('GET', '/alojamientos/health')).body.total_listings).toBe(7);
    });
  });

  describe('Formato Problem Details en todos los errores', () => {
    it('404 de recurso inexistente → problem+json sin code inventado', async () => {
      const res = await t.pedir('GET', '/alojamientos/no-existe');
      esperarProblema(res, 404);
      expect(res.body.instance).toBe('/api/v1/alojamientos/no-existe');
      expect(res.body.code).toBeUndefined();
    });

    it('400 de validación → code VALIDATION_FAILED y URN del catálogo de errores', async () => {
      const res = await t.pedir('POST', '/alojamientos/search', { body: { rows: 0 } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(res.body.type).toBe('urn:gds:error:validation-failed');
      expect(res.body.title).toBe('Validation Failed');
      expect(camposInvalidos(res)).toEqual(['rows']);
    });

    it('invalidParams identifica campos anidados con notación de punto', async () => {
      const res = await t.pedir('POST', '/alojamientos/search', {
        body: { booker: { country: 'ECU', platform: 'desktop' } },
      });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('booker.country');
    });

    it('invalidParams señala TODOS los campos inválidos a la vez (no solo el primero)', async () => {
      const res = await t.pedir('POST', '/alojamientos/quito-epiq/reservations', {
        idem: true,
        body: { checkin: 20261010, habitaciones_count: 0, customer_email: 'no-es-email' },
      });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(
        expect.arrayContaining(['checkin', 'checkout', 'habitaciones_count', 'customer_name', 'customer_email']),
      );
    });

    it('un campo no declarado en el contrato se rechaza con 400 (no se ignora en silencio)', async () => {
      const res = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'Quito', descuento: 99 } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['descuento']);
    });

    it('JSON mal formado → 400 problem+json (no 500)', async () => {
      const res = await t.pedir('POST', '/alojamientos/search', { raw: '{"destino": "Quito",' });
      esperarProblema(res, 400);
    });

    it('ruta inexistente → 404 problem+json', async () => {
      const res = await t.pedir('GET', '/alojamientos/orders');
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
    });

    it('método no soportado sobre una ruta de acción → 404', async () => {
      const res = await t.pedir('DELETE', '/alojamientos/search');
      // DELETE /alojamientos/:id con id="search": no existe ese alojamiento.
      esperarProblema(res, 404);
    });

    it('los errores de negocio (409) incluyen code y URN propios', async () => {
      const ultimo = { checkin: dia(40), checkout: dia(41), habitaciones_count: 1, customer_name: 'A', adultos: 1 };
      await t.pedir('POST', '/alojamientos/quito-ejido/reservations', { idem: true, body: ultimo });
      const res = await t.pedir('POST', '/alojamientos/quito-ejido/reservations', {
        idem: true,
        body: { ...ultimo, customer_name: 'B' },
      });
      esperarProblema(res, 409, 'ROOM_NO_LONGER_AVAILABLE');
      expect(res.body.type).toBe('urn:gds:error:room-no-longer-available');
    });
  });

  describe('Códigos de estado según el verbo (semántica REST)', () => {
    it.each([
      ['POST', '/alojamientos/search', {}, 200],
      ['POST', '/alojamientos/chains', {}, 200],
      ['POST', '/alojamientos/constants', {}, 200],
      ['POST', '/alojamientos/details/changes', { last_change: '2026-09-01T00:00:00Z' }, 200],
    ])('%s %s es una CONSULTA → %i (no 201)', async (metodo, ruta, body, esperado) => {
      const res = await t.pedir(metodo, ruta, { body });
      expect(res.status).toBe(esperado);
    });

    it('crear recursos responde 201 (alojamiento, reserva, webhook)', async () => {
      const alta = await t.pedir('POST', '/alojamientos', {
        body: {
          nombre: 'Hostal Prueba', destino: 'Loja', precioPorNoche: 30,
          capacidadAdultos: 2, capacidadNinos: 0, habitaciones: 2, tienePiscina: false,
        },
      });
      expect(alta.status).toBe(201);

      const reserva = await t.pedir('POST', '/alojamientos/quito-epiq/reservations', {
        idem: true,
        body: { checkin: dia(5), checkout: dia(6), habitaciones_count: 1, customer_name: 'Ana', adultos: 2 },
      });
      expect(reserva.status).toBe(201);

      const webhook = await t.pedir('POST', '/alojamientos/webhooks', {
        body: { url: 'https://example.com/hook', events: ['ORDER_CONFIRMED'] },
      });
      expect(webhook.status).toBe(201);
      t.sembrarCatalogo();
    });

    it('PUT y DELETE exitosos responden 204 sin cuerpo', async () => {
      const put = await t.pedir('PUT', '/alojamientos/cusco-inka', {
        body: {
          nombre: 'Palacio del Inka', destino: 'Cusco', precioPorNoche: 215,
          capacidadAdultos: 2, capacidadNinos: 1, habitaciones: 6, tienePiscina: false,
        },
      });
      expect(put.status).toBe(204);
      expect(put.texto).toBe('');

      const del = await t.pedir('DELETE', '/alojamientos/cusco-inka');
      expect(del.status).toBe(204);
      expect(del.texto).toBe('');
      t.sembrarCatalogo();
    });
  });

  describe('Cabeceras', () => {
    it('el catálogo anuncia su fecha de deprecación (X-API-Deprecation-Date)', async () => {
      const lista = await t.pedir('GET', '/alojamientos');
      expect(lista.headers.get('x-api-deprecation-date')).toBe('2027-12-31');
      const detalle = await t.pedir('GET', '/alojamientos/quito-epiq');
      expect(detalle.headers.get('x-api-deprecation-date')).toBe('2027-12-31');
    });

    it('las respuestas exitosas son application/json en UTF-8 (tildes y ñ intactas)', async () => {
      const res = await t.pedir('GET', '/alojamientos/cancun-coral');
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(res.body.destino).toBe('Cancún');
    });
  });
});
