/**
 * Suite 07 — Órdenes (flujo GDS/contrato):
 *   POST /orders/preview → POST /orders/create → GET /orders/:id
 *   → POST /orders/:id/modify → POST /orders/:id/cancel
 *
 * Referencia Booking:
 * - El precio se cotiza (preview) y la cotización CADUCA (30 min): pasado ese
 *   tiempo hay que volver a cotizar (410 Gone). Una orden solo se crea desde una
 *   cotización vigente; nunca se inventa una reserva con otro hotel u otras fechas.
 * - Se exige una referencia de pago válida (422 si falta).
 * - Reintentar con la misma Idempotency-Key devuelve la MISMA orden (sin doble cobro).
 * - Entre la cotización y el pago otra persona puede llevarse la habitación: se
 *   revalida el cupo (409).
 * - Modificar fechas recalcula el total con la tarifa contratada y respeta el cupo.
 */
import { randomUUID } from 'crypto';
import { AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, dia, reservaValida } from './app-prueba';

const CLIENTE = { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com', phone: '+593991234567' };

describe('07 · Órdenes: preview, create, consulta, modificación y cancelación', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(() => {
    t.sembrarCatalogo();
    t.repos.reservas.limpiar();
    t.telemetria.trackEvent.mockClear();
    t.http.post.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  const preview = (body: Record<string, unknown>) => t.pedir('POST', '/alojamientos/orders/preview', { body });
  const previewValido = (extra: Record<string, unknown> = {}) =>
    preview({
      accommodation_id: 'quito-epiq',
      checkin: dia(10),
      checkout: dia(13),
      guests: { number_of_adults: 2, number_of_rooms: 1 },
      ...extra,
    });
  const crear = (previewId: string, extra: Record<string, unknown> = {}, idem: boolean | string = true) =>
    t.pedir('POST', '/alojamientos/orders/create', {
      body: { order_preview_id: previewId, payment_reference: 'pay_3NxQ1mJZqEvB', customer_details: CLIENTE, ...extra },
      idem,
    });
  const ordenNueva = async (extraPreview: Record<string, unknown> = {}) => {
    const p = await previewValido(extraPreview);
    expect(p.status).toBe(200);
    const o = await crear(p.body.data.order_preview_id);
    expect(o.status).toBe(201);
    return o.body;
  };

  describe('POST /orders/preview', () => {
    it('200 con id de cotización, total, noches, habitaciones y caducidad a 30 minutos', async () => {
      const antes = Date.now();
      const res = await previewValido();
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        order_preview_id: expect.stringMatching(/^prev_[0-9a-f]{8}$/),
        accommodation_id: 'quito-epiq',
        total_price: 360,
        currency: 'USD',
        nights: 3,
        rooms: 1,
        expires_at: expect.any(String),
      });
      const caduca = Date.parse(res.body.data.expires_at) - antes;
      expect(caduca).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1000);
      expect(caduca).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
    });

    it.each([
      ['estándar', undefined, 360],
      ['deluxe (+25%)', 'prod_quito-epiq_deluxe_bb', 450],
      ['suite (+60%)', 'prod_quito-epiq_suite_ai', 576],
    ])('tarifa %s → total %i', async (_t, product_id, total) => {
      const res = await previewValido(product_id ? { product_id } : {});
      expect(res.body.data.total_price).toBe(total);
    });

    it('2 habitaciones duplican el total', async () => {
      const res = await previewValido({ guests: { number_of_adults: 4, number_of_rooms: 2 } });
      expect(res.body.data.total_price).toBe(720);
      expect(res.body.data.rooms).toBe(2);
    });

    it('el precio coincide con el de la consulta de disponibilidad', async () => {
      const disp = await t.pedir('POST', '/alojamientos/availability', {
        body: { accommodation: 'quito-epiq', checkin: dia(10), checkout: dia(13) },
      });
      const prev = await previewValido({ product_id: disp.body.data.products[1].product_id });
      expect(prev.body.data.total_price).toBe(disp.body.data.products[1].price);
    });

    it('registra checkout_started en telemetría', async () => {
      await previewValido();
      expect(t.telemetria.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'checkout_started', properties: expect.objectContaining({ total_price: 360 }) }),
      );
    });

    it('alojamiento inexistente → 404 (no cotiza otro hotel)', async () => {
      const res = await preview({ accommodation_id: 'fantasma', checkin: dia(10), checkout: dia(12) });
      esperarProblema(res, 404);
      expect(res.body.detail).toContain('fantasma');
    });

    it('sin cupo → 409 ROOM_NO_LONGER_AVAILABLE', async () => {
      await t.pedir('POST', '/alojamientos/quito-ejido/reservations', { idem: true, body: reservaValida({ adultos: 1 }) });
      const res = await preview({ accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(13) });
      esperarProblema(res, 409, 'ROOM_NO_LONGER_AVAILABLE');
    });

    it('más adultos de los que caben → 400', async () => {
      const res = await previewValido({ guests: { number_of_adults: 5, number_of_rooms: 1 } });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain('adultos');
    });

    it.each([
      ['accommodation_id', { accommodation_id: undefined }],
      ['accommodation_id', { accommodation_id: '' }],
      ['checkin', { checkin: undefined }],
      ['checkout', { checkout: undefined }],
      ['checkout', { checkout: dia(9) }],
      ['checkin', { checkin: dia(-3), checkout: dia(1) }],
      ['checkout', { checkout: dia(45) }],
      ['product_id', { product_id: 7 }],
      ['guests.number_of_adults', { guests: { number_of_adults: 0, number_of_rooms: 1 } }],
      ['guests.number_of_rooms', { guests: { number_of_adults: 2 } }],
      ['guests.children', { guests: { number_of_adults: 2, number_of_rooms: 1, children: [20] } }],
      ['descuento', { descuento: 10 }],
    ])('inválido → 400 en "%s"', async (campo, cambio) => {
      const res = await previewValido(cambio);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });
  });

  describe('POST /orders/create', () => {
    it('201 con la orden CONFIRMADA al precio cotizado', async () => {
      const p = await previewValido({ product_id: 'prod_quito-epiq_deluxe_bb' });
      const res = await crear(p.body.data.order_preview_id);
      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          order_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          codigo_reserva: expect.stringMatching(/^BKG-\d{6}$/),
          status: 'CONFIRMED',
          total_price: 450,
          currency: 'USD',
          payment_reference: 'pay_3NxQ1mJZqEvB',
          customer_name: 'Ana Pérez',
          customer_email: 'ana@example.com',
          accommodation_details: expect.objectContaining({
            id: 'quito-epiq', nombre: 'Top Rentals EpiQ', destino: 'Quito',
            checkin: dia(10), checkout: dia(13), noches: 3, habitaciones: 1, huespedes: 2,
          }),
        }),
      );
      expect(new Date(res.body.creation_date).toString()).not.toBe('Invalid Date');
    });

    it('incluye enlaces HATEOAS para consultar, modificar y cancelar', async () => {
      const orden = await ordenNueva();
      expect(orden._links).toEqual({
        self: { href: `/api/v1/alojamientos/orders/${orden.order_id}`, type: 'GET' },
        modify: { href: `/api/v1/alojamientos/orders/${orden.order_id}/modify`, type: 'POST' },
        cancel: { href: `/api/v1/alojamientos/orders/${orden.order_id}/cancel`, type: 'POST' },
        accommodation: { href: '/api/v1/alojamientos/quito-epiq', type: 'GET' },
      });
    });

    it('la cotización se consume: usarla otra vez (otra clave) → 410 OFFER_NO_LONGER_AVAILABLE', async () => {
      const p = await previewValido();
      expect((await crear(p.body.data.order_preview_id)).status).toBe(201);
      const res = await crear(p.body.data.order_preview_id);
      esperarProblema(res, 410, 'OFFER_NO_LONGER_AVAILABLE');
      expect(t.repos.reservas.todas()).toHaveLength(1);
    });

    it('cotización inexistente → 410 y NO se crea ninguna reserva inventada', async () => {
      const res = await crear('prev_inventado');
      esperarProblema(res, 410, 'OFFER_NO_LONGER_AVAILABLE');
      expect(res.body.detail).toContain('Vuelve a consultar el precio');
      expect(t.repos.reservas.todas()).toHaveLength(0);
    });

    it('cotización caducada (más de 30 min) → 410', async () => {
      const p = await previewValido();
      const ahora = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(ahora + 31 * 60 * 1000);
      const res = await crear(p.body.data.order_preview_id);
      esperarProblema(res, 410, 'OFFER_NO_LONGER_AVAILABLE');
    });

    it('cotización a los 29 minutos todavía es válida', async () => {
      const p = await previewValido();
      const ahora = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(ahora + 29 * 60 * 1000);
      expect((await crear(p.body.data.order_preview_id)).status).toBe(201);
    });

    it('otra persona reserva la última habitación entre la cotización y el pago → 409', async () => {
      const p = await preview({ accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(12), guests: { number_of_adults: 1, number_of_rooms: 1 } });
      expect(p.status).toBe(200);
      await t.pedir('POST', '/alojamientos/quito-ejido/reservations', {
        idem: true, body: reservaValida({ adultos: 1, checkin: dia(11), checkout: dia(12) }),
      });
      const res = await crear(p.body.data.order_preview_id);
      esperarProblema(res, 409, 'ROOM_NO_LONGER_AVAILABLE');
    });

    it('dos cotizaciones de la última habitación pagadas a la vez → solo una se confirma', async () => {
      const cuerpo = { accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(12), guests: { number_of_adults: 1, number_of_rooms: 1 } };
      const [p1, p2] = await Promise.all([preview(cuerpo), preview(cuerpo)]);
      const [o1, o2] = await Promise.all([crear(p1.body.data.order_preview_id), crear(p2.body.data.order_preview_id)]);
      expect([o1.status, o2.status].sort()).toEqual([201, 409]);
    });

    it('misma Idempotency-Key → 201 con la MISMA orden (sin doble cobro)', async () => {
      const p = await previewValido();
      const clave = randomUUID();
      const a = await crear(p.body.data.order_preview_id, {}, clave);
      const b = await crear(p.body.data.order_preview_id, {}, clave);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(b.body.order_id).toBe(a.body.order_id);
      expect(t.repos.reservas.todas()).toHaveLength(1);
    });

    it('reintentos simultáneos con la misma clave → una sola orden', async () => {
      const p = await previewValido();
      const clave = randomUUID();
      const resps = await Promise.all(Array.from({ length: 4 }, () => crear(p.body.data.order_preview_id, {}, clave)));
      expect(new Set(resps.map((r) => r.body.order_id)).size).toBe(1);
      expect(t.repos.reservas.todas()).toHaveLength(1);
    });

    it('sin Idempotency-Key → 400', async () => {
      const p = await previewValido();
      esperarProblema(await crear(p.body.data.order_preview_id, {}, false), 400);
    });

    it('Idempotency-Key no UUID → 400', async () => {
      const p = await previewValido();
      esperarProblema(await crear(p.body.data.order_preview_id, {}, 'clave-1'), 400);
    });

    it('payment_reference en blanco (4 espacios) → 422 PAYMENT_REFERENCE_INVALID', async () => {
      const p = await previewValido();
      const res = await crear(p.body.data.order_preview_id, { payment_reference: '    ' });
      esperarProblema(res, 422, 'PAYMENT_REFERENCE_INVALID');
      expect(t.repos.reservas.todas()).toHaveLength(0);
    });

    it.each([
      ['payment_reference', { payment_reference: undefined }],
      ['payment_reference', { payment_reference: 'abc' }],
      ['payment_reference', { payment_reference: 'x'.repeat(121) }],
      ['order_preview_id', { order_preview_id: '' }],
      ['customer_details', { customer_details: undefined }],
      ['customer_details.first_name', { customer_details: { ...CLIENTE, first_name: '' } }],
      ['customer_details.last_name', { customer_details: { ...CLIENTE, last_name: undefined } }],
      ['customer_details.email', { customer_details: { ...CLIENTE, email: 'ana' } }],
      ['customer_details.pasaporte', { customer_details: { ...CLIENTE, pasaporte: 'X' } }],
      ['total_price', { total_price: 1 }],
    ])('cuerpo inválido → 400 en "%s"', async (campo, cambio) => {
      const p = await previewValido();
      const res = await crear(p.body.data.order_preview_id, cambio);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('registra booking_confirmed en telemetría', async () => {
      const orden = await ordenNueva();
      expect(t.telemetria.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'booking_confirmed', properties: expect.objectContaining({ order_id: orden.order_id }) }),
      );
    });
  });

  describe('GET /orders/:orderId', () => {
    it('200 con el mismo detalle de la creación', async () => {
      const orden = await ordenNueva();
      const res = await t.pedir('GET', `/alojamientos/orders/${orden.order_id}`);
      expect(res.status).toBe(200);
      expect(res.body.codigo_reserva).toBe(orden.codigo_reserva);
      expect(res.body.total_price).toBe(orden.total_price);
      expect(res.body.accommodation_details).toEqual(orden.accommodation_details);
    });

    it('UUID inexistente → 404', async () => {
      esperarProblema(await t.pedir('GET', `/alojamientos/orders/${randomUUID()}`), 404);
    });

    it.each(['123', 'prev_abc', 'BKG-123456'])('id "%s" no UUID → 400', async (id) => {
      esperarProblema(await t.pedir('GET', `/alojamientos/orders/${id}`), 400);
    });
  });

  describe('POST /orders/:orderId/modify', () => {
    const modificar = (id: string, body: Record<string, unknown>, idem: boolean | string = true) =>
      t.pedir('POST', `/alojamientos/orders/${id}/modify`, { body, idem });

    it('alargar la estancia recalcula noches y total con la tarifa por noche', async () => {
      const orden = await ordenNueva();
      const res = await modificar(orden.order_id, { checkin: dia(10), checkout: dia(15) });
      expect(res.status).toBe(200);
      expect(res.body.accommodation_details).toEqual(expect.objectContaining({ checkin: dia(10), checkout: dia(15), noches: 5 }));
      expect(res.body.total_price).toBe(600);
    });

    it('cambiar SOLO la salida mantiene la entrada original', async () => {
      const orden = await ordenNueva();
      const res = await modificar(orden.order_id, { checkout: dia(11) });
      expect(res.status).toBe(200);
      expect(res.body.accommodation_details.checkin).toBe(dia(10));
      expect(res.body.accommodation_details.noches).toBe(1);
      expect(res.body.total_price).toBe(120);
    });

    it('añadir una habitación duplica el total', async () => {
      const orden = await ordenNueva();
      const res = await modificar(orden.order_id, { guests: { number_of_adults: 4, number_of_rooms: 2 } });
      expect(res.status).toBe(200);
      expect(res.body.accommodation_details.habitaciones).toBe(2);
      expect(res.body.total_price).toBe(720);
    });

    it('conserva la moneda de la orden original', async () => {
      const p = await preview({ accommodation_id: 'cartagena-charleston', checkin: dia(10), checkout: dia(12) });
      const orden = (await crear(p.body.data.order_preview_id)).body;
      const res = await modificar(orden.order_id, { checkout: dia(13) });
      expect(res.body.currency).toBe('COP');
    });

    it('la propia reserva no bloquea su modificación (1 habitación, se alarga 1 noche)', async () => {
      const p = await preview({ accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(12), guests: { number_of_adults: 1, number_of_rooms: 1 } });
      const orden = (await crear(p.body.data.order_preview_id)).body;
      const res = await modificar(orden.order_id, { checkout: dia(13) });
      expect(res.status).toBe(200);
    });

    it('mover a fechas ocupadas por otra reserva → 409 y la orden no cambia', async () => {
      const p = await preview({ accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(12), guests: { number_of_adults: 1, number_of_rooms: 1 } });
      const orden = (await crear(p.body.data.order_preview_id)).body;
      await t.pedir('POST', '/alojamientos/quito-ejido/reservations', {
        idem: true, body: reservaValida({ adultos: 1, checkin: dia(20), checkout: dia(22) }),
      });
      esperarProblema(await modificar(orden.order_id, { checkin: dia(21), checkout: dia(23) }), 409, 'ROOM_NO_LONGER_AVAILABLE');
      const consulta = await t.pedir('GET', `/alojamientos/orders/${orden.order_id}`);
      expect(consulta.body.accommodation_details.checkin).toBe(dia(10));
    });

    it('dispara el webhook ORDER_MODIFIED a los suscriptores', async () => {
      await t.pedir('POST', '/alojamientos/webhooks', { body: { url: 'https://partner.example.com/hook', events: ['ORDER_MODIFIED'] } });
      const orden = await ordenNueva();
      await modificar(orden.order_id, { checkout: dia(14) });
      expect(t.http.post).toHaveBeenCalledWith(
        'https://partner.example.com/hook',
        expect.objectContaining({ eventType: 'ORDER_MODIFIED', resourceId: orden.order_id }),
      );
    });

    it.each([
      ['salida antes de la entrada', { checkin: dia(10), checkout: dia(8) }, 'checkout'],
      ['entrada en el pasado', { checkin: dia(-2) }, 'checkin'],
      ['más de 30 noches', { checkout: dia(50) }, 'checkout'],
      ['fecha inválida', { checkout: '2027-02-31' }, 'checkout'],
    ])('%s → 400 y la orden no cambia', async (_caso, cambio, campo) => {
      const orden = await ordenNueva();
      const res = await modificar(orden.order_id, cambio);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
      const consulta = await t.pedir('GET', `/alojamientos/orders/${orden.order_id}`);
      expect(consulta.body.total_price).toBe(360);
    });

    it('más huéspedes de los que caben → 400', async () => {
      const orden = await ordenNueva();
      esperarProblema(await modificar(orden.order_id, { guests: { number_of_adults: 9, number_of_rooms: 1 } }), 400, 'VALIDATION_FAILED');
    });

    it('orden cancelada → 409', async () => {
      const orden = await ordenNueva();
      await t.pedir('POST', `/alojamientos/orders/${orden.order_id}/cancel`, { idem: true, body: {} });
      esperarProblema(await modificar(orden.order_id, { checkout: dia(14) }), 409);
    });

    it('UUID inexistente → 404', async () => {
      esperarProblema(await modificar(randomUUID(), { checkout: dia(14) }), 404);
    });

    it('sin Idempotency-Key → 400', async () => {
      const orden = await ordenNueva();
      esperarProblema(await modificar(orden.order_id, { checkout: dia(14) }, false), 400);
    });

    it('campo desconocido → 400', async () => {
      const orden = await ordenNueva();
      const res = await modificar(orden.order_id, { precio: 1 });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['precio']);
    });
  });

  describe('POST /orders/:orderId/cancel', () => {
    const cancelar = (id: string, body: unknown = { reason: 'Cambio de planes' }, idem: boolean | string = true) =>
      t.pedir('POST', `/alojamientos/orders/${id}/cancel`, { body, idem });

    it('200 con estado CANCELLED, código y fecha de cancelación', async () => {
      const orden = await ordenNueva();
      const res = await cancelar(orden.order_id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          order_id: orden.order_id,
          codigo_reserva: orden.codigo_reserva,
          status: 'CANCELLED',
          cancellation_date: expect.any(String),
        }),
      );
      expect((await t.pedir('GET', `/alojamientos/orders/${orden.order_id}`)).body.status).toBe('CANCELLED');
    });

    it('cancelar dos veces → 200 ambas (idempotente) y un solo webhook', async () => {
      await t.pedir('POST', '/alojamientos/webhooks', { body: { url: 'https://partner.example.com/c', events: ['ORDER_CANCELLED'] } });
      const orden = await ordenNueva();
      expect((await cancelar(orden.order_id)).status).toBe(200);
      expect((await cancelar(orden.order_id)).status).toBe(200);
      const enviados = t.http.post.mock.calls.filter((c: any[]) => c[1].eventType === 'ORDER_CANCELLED');
      expect(enviados).toHaveLength(1);
    });

    it('el cuerpo es opcional', async () => {
      const orden = await ordenNueva();
      expect((await t.pedir('POST', `/alojamientos/orders/${orden.order_id}/cancel`, { idem: true })).status).toBe(200);
    });

    it('cancelar libera el cupo: se puede volver a cotizar la misma habitación', async () => {
      const cuerpo = { accommodation_id: 'quito-ejido', checkin: dia(10), checkout: dia(12), guests: { number_of_adults: 1, number_of_rooms: 1 } };
      const orden = (await crear((await preview(cuerpo)).body.data.order_preview_id)).body;
      esperarProblema(await preview(cuerpo), 409, 'ROOM_NO_LONGER_AVAILABLE');
      await cancelar(orden.order_id);
      expect((await preview(cuerpo)).status).toBe(200);
    });

    it('estancia ya terminada → 409 CANCELLATION_NOT_ALLOWED', async () => {
      const id = randomUUID();
      t.repos.reservas.sembrar({
        id, codigoReserva: 'BKG-800001', alojamientoId: 'quito-epiq', customerName: 'Pasado', status: 'CONFIRMED',
        checkin: dia(-4), checkout: dia(-1), noches: 3, habitacionesCount: 1, total: 360,
      });
      esperarProblema(await cancelar(id), 409, 'CANCELLATION_NOT_ALLOWED');
    });

    it('UUID inexistente → 404 · id no UUID → 400 · sin clave → 400', async () => {
      esperarProblema(await cancelar(randomUUID()), 404);
      esperarProblema(await cancelar('no-uuid'), 400);
      const orden = await ordenNueva();
      esperarProblema(await cancelar(orden.order_id, {}, false), 400);
    });
  });
});
