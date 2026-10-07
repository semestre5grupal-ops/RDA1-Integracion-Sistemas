/**
 * Suite 08 — Webhooks para socios (GET/POST/DELETE /alojamientos/webhooks).
 *
 * Referencia Booking (Connectivity / Partner APIs):
 * - Solo se aceptan URLs https y eventos conocidos.
 * - El secreto de firma nunca se devuelve completo (solo los últimos 4 caracteres).
 * - Cada socio ve y borra SOLO sus suscripciones.
 * - Al confirmar, modificar o cancelar una orden se notifica únicamente a quien
 *   se suscribió a ese evento, con eventId, tipo, fecha y datos.
 */
import { randomUUID } from 'crypto';
import { AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, dia } from './app-prueba';

describe('08 · Webhooks de alojamientos', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(async () => {
    t.sembrarCatalogo();
    t.repos.reservas.limpiar();
    t.http.post.mockClear();
    // Cada test empieza sin suscripciones (borra las de los socios usados).
    for (const socio of ['socio-a', 'socio-b', 'default-owner']) {
      const lista = await t.pedir('GET', '/alojamientos/webhooks', { headers: { 'X-Device-Fingerprint': socio } });
      for (const w of lista.body) {
        await t.pedir('DELETE', `/alojamientos/webhooks/${w.id}`, { headers: { 'X-Device-Fingerprint': socio } });
      }
    }
  });

  const suscribir = (body: Record<string, unknown>, socio = 'socio-a') =>
    t.pedir('POST', '/alojamientos/webhooks', { body, headers: { 'X-Device-Fingerprint': socio } });
  const listar = (socio = 'socio-a') =>
    t.pedir('GET', '/alojamientos/webhooks', { headers: { 'X-Device-Fingerprint': socio } });

  describe('Alta de suscripción', () => {
    it('201 con id UUID, eventos, activa y secreto ENMASCARADO', async () => {
      const res = await suscribir({
        url: 'https://partner.example.com/hooks', events: ['ORDER_CONFIRMED', 'ORDER_CANCELLED'], secret: 'whsec_supersecreto1234',
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        url: 'https://partner.example.com/hooks',
        events: ['ORDER_CONFIRMED', 'ORDER_CANCELLED'],
        secret: 'whsec_...1234',
        createdAt: expect.any(String),
        active: true,
      });
      expect(res.texto).not.toContain('supersecreto');
    });

    it('sin secreto propio se genera uno (también enmascarado)', async () => {
      const res = await suscribir({ url: 'https://partner.example.com/x', events: ['ORDER_CONFIRMED'] });
      expect(res.body.secret).toMatch(/^whsec_\.\.\.[0-9a-f]{4}$/);
    });

    it.each(['ORDER_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_MODIFIED', 'AVAILABILITY_CHANGED'])(
      'acepta el evento %s',
      async (evento) => {
        expect((await suscribir({ url: 'https://p.example.com/h', events: [evento] })).status).toBe(201);
      },
    );

    it.each([
      ['url', { url: 'http://partner.example.com/hooks', events: ['ORDER_CONFIRMED'] }],
      ['url', { url: 'ftp://partner.example.com', events: ['ORDER_CONFIRMED'] }],
      ['url', { url: '', events: ['ORDER_CONFIRMED'] }],
      ['url', { events: ['ORDER_CONFIRMED'] }],
      ['events', { url: 'https://p.example.com/h', events: [] }],
      ['events', { url: 'https://p.example.com/h' }],
      ['events', { url: 'https://p.example.com/h', events: ['ORDER_PAID'] }],
      ['events', { url: 'https://p.example.com/h', events: 'ORDER_CONFIRMED' }],
      ['secret', { url: 'https://p.example.com/h', events: ['ORDER_CONFIRMED'], secret: 1234 }],
      ['owner', { url: 'https://p.example.com/h', events: ['ORDER_CONFIRMED'], owner: 'otro' }],
    ])('inválido → 400 en "%s"', async (campo, body) => {
      const res = await suscribir(body);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });
  });

  describe('Listado y aislamiento entre socios', () => {
    it('cada socio ve solo sus suscripciones', async () => {
      await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] }, 'socio-a');
      await suscribir({ url: 'https://a.example.com/2', events: ['ORDER_CANCELLED'] }, 'socio-a');
      await suscribir({ url: 'https://b.example.com/1', events: ['ORDER_CONFIRMED'] }, 'socio-b');

      const a = await listar('socio-a');
      expect(a.status).toBe(200);
      expect(a.body.map((w: any) => w.url).sort()).toEqual(['https://a.example.com/1', 'https://a.example.com/2']);
      expect((await listar('socio-b')).body.map((w: any) => w.url)).toEqual(['https://b.example.com/1']);
    });

    it('el listado tampoco expone el secreto completo', async () => {
      await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'], secret: 'whsec_muysecreto9876' });
      const res = await listar();
      expect(res.body[0].secret).toBe('whsec_...9876');
      expect(res.texto).not.toContain('muysecreto');
    });

    it('sin suscripciones → 200 []', async () => {
      expect((await listar('socio-nuevo')).body).toEqual([]);
    });
  });

  describe('Baja de suscripción', () => {
    it('204 y deja de listarse', async () => {
      const w = await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] });
      const res = await t.pedir('DELETE', `/alojamientos/webhooks/${w.body.id}`, { headers: { 'X-Device-Fingerprint': 'socio-a' } });
      expect(res.status).toBe(204);
      expect((await listar()).body).toEqual([]);
    });

    it('borrar dos veces → 404 la segunda', async () => {
      const w = await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] });
      const borrar = () => t.pedir('DELETE', `/alojamientos/webhooks/${w.body.id}`, { headers: { 'X-Device-Fingerprint': 'socio-a' } });
      expect((await borrar()).status).toBe(204);
      esperarProblema(await borrar(), 404);
    });

    it('un socio NO puede borrar la suscripción de otro (404, sin revelar que existe)', async () => {
      const w = await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] }, 'socio-a');
      const res = await t.pedir('DELETE', `/alojamientos/webhooks/${w.body.id}`, { headers: { 'X-Device-Fingerprint': 'socio-b' } });
      esperarProblema(res, 404);
      expect((await listar('socio-a')).body).toHaveLength(1);
    });

    it('UUID inexistente → 404 · id no UUID → 400', async () => {
      esperarProblema(await t.pedir('DELETE', `/alojamientos/webhooks/${randomUUID()}`), 404);
      esperarProblema(await t.pedir('DELETE', '/alojamientos/webhooks/abc'), 400);
    });
  });

  describe('Entrega de eventos', () => {
    const ordenConfirmada = async () => {
      const p = await t.pedir('POST', '/alojamientos/orders/preview', {
        body: { accommodation_id: 'cusco-inka', checkin: dia(10), checkout: dia(12) },
      });
      const o = await t.pedir('POST', '/alojamientos/orders/create', {
        idem: true,
        body: {
          order_preview_id: p.body.data.order_preview_id,
          payment_reference: 'pay_123456',
          customer_details: { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com' },
        },
      });
      return o.body;
    };

    it('ORDER_CONFIRMED se envía a la URL suscrita con eventId, tipo, fecha y datos de la orden', async () => {
      await suscribir({ url: 'https://a.example.com/confirmadas', events: ['ORDER_CONFIRMED'] });
      const orden = await ordenConfirmada();
      expect(t.http.post).toHaveBeenCalledTimes(1);
      const [url, payload] = t.http.post.mock.calls[0];
      expect(url).toBe('https://a.example.com/confirmadas');
      expect(payload).toEqual({
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        eventType: 'ORDER_CONFIRMED',
        timestamp: expect.any(String),
        resourceId: orden.order_id,
        data: expect.objectContaining({
          order_id: orden.order_id,
          codigo_reserva: orden.codigo_reserva,
          total: 420,
          customer_email: 'ana@example.com',
          alojamiento_id: 'cusco-inka',
        }),
      });
    });

    it('no se notifica a quien no se suscribió a ese evento', async () => {
      await suscribir({ url: 'https://a.example.com/solo-cancel', events: ['ORDER_CANCELLED'] });
      await ordenConfirmada();
      expect(t.http.post).not.toHaveBeenCalled();
    });

    it('se notifica a todos los suscriptores del evento', async () => {
      await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] }, 'socio-a');
      await suscribir({ url: 'https://b.example.com/1', events: ['ORDER_CONFIRMED'] }, 'socio-b');
      await ordenConfirmada();
      expect(t.http.post.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['https://a.example.com/1', 'https://b.example.com/1']);
    });

    it('tras darse de baja ya no recibe eventos', async () => {
      const w = await suscribir({ url: 'https://a.example.com/1', events: ['ORDER_CONFIRMED'] });
      await t.pedir('DELETE', `/alojamientos/webhooks/${w.body.id}`, { headers: { 'X-Device-Fingerprint': 'socio-a' } });
      await ordenConfirmada();
      expect(t.http.post).not.toHaveBeenCalled();
    });

    it('ORDER_CANCELLED incluye el motivo', async () => {
      await suscribir({ url: 'https://a.example.com/c', events: ['ORDER_CANCELLED'] });
      const orden = await ordenConfirmada();
      await t.pedir('POST', `/alojamientos/orders/${orden.order_id}/cancel`, { idem: true, body: { reason: 'Vuelo cancelado' } });
      expect(t.http.post).toHaveBeenCalledWith(
        'https://a.example.com/c',
        expect.objectContaining({ eventType: 'ORDER_CANCELLED', data: expect.objectContaining({ reason: 'Vuelo cancelado', status: 'CANCELLED' }) }),
      );
    });

    it('si el socio no responde, la reserva igualmente se confirma (entrega no bloqueante)', async () => {
      const { throwError } = await import('rxjs');
      t.http.post.mockImplementation(() => throwError(() => new Error('ECONNREFUSED')));
      await suscribir({ url: 'https://caido.example.com/h', events: ['ORDER_CONFIRMED'] });
      const orden = await ordenConfirmada();
      expect(orden.status).toBe('CONFIRMED');
      const { of } = await import('rxjs');
      t.http.post.mockImplementation(() => of({ status: 200, data: {} }));
    });
  });
});
