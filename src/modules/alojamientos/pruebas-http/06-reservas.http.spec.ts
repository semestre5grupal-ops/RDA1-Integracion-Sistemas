/**
 * Suite 06 — Reservas directas (flujo del frontend):
 *   POST /alojamientos/:id/reservations
 *   GET  /alojamientos/reservations, /reservations/:id
 *   POST /alojamientos/reservations/:id/cancel
 *
 * Referencia Booking:
 * - Nunca hay overbooking: si queda una habitación y dos personas la piden a la
 *   vez, solo una reserva se confirma.
 * - El total se calcula con las FECHAS (noches reales), no con lo que diga el
 *   cliente, y se cobra en la moneda del alojamiento.
 * - No se reservan fechas pasadas, estancias de >30 noches ni más huéspedes de
 *   los que admite la habitación.
 * - Cada reserva tiene un código de confirmación y se puede consultar y cancelar.
 *   Cancelar dos veces no es un error; cancelar una estancia ya terminada sí.
 * - Las operaciones de escritura exigen Idempotency-Key (UUID).
 */
import { randomUUID } from 'crypto';
import {
  AppPrueba, crearAppPrueba, esperarProblema, camposInvalidos, dia, reservaValida,
} from './app-prueba';

describe('06 · Reservas directas', () => {
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

  const reservar = (id: string, body: Record<string, unknown>, idem: boolean | string = true) =>
    t.pedir('POST', `/alojamientos/${id}/reservations`, { body, idem });

  describe('Reserva exitosa', () => {
    it('201 con la reserva CONFIRMADA y todos sus datos', async () => {
      const body = reservaValida({ customer_name: 'Ana Pérez', checkin: dia(10), checkout: dia(13) });
      const res = await reservar('quito-epiq', body);
      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          reservation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          alojamiento_id: 'quito-epiq',
          codigo_reserva: expect.stringMatching(/^BKG-\d{6}$/),
          status: 'CONFIRMED',
          customer_name: 'Ana Pérez',
          checkin: dia(10),
          checkout: dia(13),
          noches: 3,
          habitaciones_count: 1,
          huespedes: 2,
          total_price: { currency: 'USD', total: 360 },
          nombre_alojamiento: 'Top Rentals EpiQ',
          destino: 'Quito',
          photo_url: expect.stringMatching(/^https:\/\//),
        }),
      );
    });

    it('incluye enlaces HATEOAS para consultar, cancelar y ver el alojamiento', async () => {
      const res = await reservar('quito-epiq', reservaValida());
      const id = res.body.reservation_id;
      expect(res.body._links).toEqual({
        self: { href: `/api/v1/alojamientos/reservations/${id}`, type: 'GET' },
        cancelar: { href: `/api/v1/alojamientos/reservations/${id}/cancel`, type: 'POST' },
        alojamiento: { href: '/api/v1/alojamientos/quito-epiq', type: 'GET' },
      });
    });

    it.each([
      [1, 1, 120],
      [2, 1, 240],
      [7, 1, 840],
      [3, 2, 720],
      [30, 1, 3600],
    ])('%i noche(s) × %i habitación(es) a 120 USD = %i USD', async (noches, habitaciones, total) => {
      const res = await reservar(
        'quito-epiq',
        reservaValida({ checkin: dia(10), checkout: dia(10 + noches), habitaciones_count: habitaciones, adultos: 2 }),
      );
      expect(res.status).toBe(201);
      expect(res.body.noches).toBe(noches);
      expect(res.body.total_price.total).toBe(total);
    });

    it('las noches salen de las FECHAS aunque el cliente envíe otro "nights"', async () => {
      const res = await reservar('quito-epiq', reservaValida({ checkin: dia(10), checkout: dia(12), nights: 9 }));
      expect(res.status).toBe(201);
      expect(res.body.noches).toBe(2);
      expect(res.body.total_price.total).toBe(240);
    });

    it('precio con decimales redondeado a céntimos (45.50 × 3 = 136.50)', async () => {
      const res = await reservar('quito-ejido', reservaValida({ checkin: dia(10), checkout: dia(13), adultos: 1 }));
      expect(res.body.total_price.total).toBe(136.5);
    });

    it('se cobra en la moneda del alojamiento (COP en Cartagena)', async () => {
      const res = await reservar('cartagena-charleston', reservaValida({ adultos: 2 }));
      expect(res.body.total_price.currency).toBe('COP');
    });

    it('huéspedes = adultos + niños', async () => {
      const res = await reservar('quito-epiq', reservaValida({ adultos: 2, ninos: 2 }));
      expect(res.body.huespedes).toBe(4);
    });

    it('el email se guarda normalizado (minúsculas, sin espacios)', async () => {
      const res = await reservar('quito-epiq', reservaValida({ customer_email: 'Ana.Perez@Example.COM' }));
      expect(res.body.customer_email).toBe('ana.perez@example.com');
    });

    it('acepta los campos opcionales de checkout (teléfono, peticiones, hora de llegada…)', async () => {
      const res = await reservar('quito-epiq', reservaValida({
        phone: '+593 991234567', guest_name: 'Ana', special_requests: 'Cuna para bebé',
        arrival_time: '15:00 - 16:00', travel_purpose: 'leisure', card_holder: 'Ana Pérez', payment_method: 'pay_at_property',
      }));
      expect(res.status).toBe(201);
    });

    it('llegada "ayer" según UTC se acepta (en Ecuador por la noche UTC ya es mañana)', async () => {
      expect((await reservar('quito-epiq', reservaValida({ checkin: dia(-1), checkout: dia(1) }))).status).toBe(201);
    });

    it('llegada HOY es válida', async () => {
      expect((await reservar('quito-epiq', reservaValida({ checkin: dia(0), checkout: dia(1) }))).status).toBe(201);
    });

    it('cada reserva tiene un código de confirmación distinto', async () => {
      const codigos = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const res = await reservar('cancun-coral', reservaValida({ checkin: dia(20 + i), checkout: dia(21 + i) }));
        codigos.add(res.body.codigo_reserva);
      }
      expect(codigos.size).toBe(5);
    });

    it('registra booking_confirmed en telemetría', async () => {
      const res = await reservar('quito-epiq', reservaValida());
      expect(t.telemetria.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: 'booking_confirmed',
          properties: expect.objectContaining({ order_id: res.body.reservation_id, total: 360 }),
        }),
      );
    });
  });

  describe('Idempotency-Key', () => {
    it('sin cabecera → 400 y no se crea nada', async () => {
      const res = await reservar('quito-epiq', reservaValida(), false);
      esperarProblema(res, 400);
      expect(res.body.detail).toContain('Idempotency-Key es obligatoria');
      expect(t.repos.reservas.todas()).toHaveLength(0);
    });

    it.each(['123', 'no-es-uuid', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'])('clave "%s" no UUID → 400', async (clave) => {
      const res = await reservar('quito-epiq', reservaValida(), clave);
      esperarProblema(res, 400);
      expect(res.body.detail).toContain('UUID');
    });

    it('reintento con la MISMA clave → 409 y no se duplica la reserva', async () => {
      const clave = randomUUID();
      const body = reservaValida();
      expect((await reservar('quito-epiq', body, clave)).status).toBe(201);
      const repetida = await reservar('quito-epiq', body, clave);
      esperarProblema(repetida, 409, 'BOOKING_NOT_CONFIRMED');
      expect(t.repos.reservas.todas()).toHaveLength(1);
    });

    it('cinco reintentos simultáneos con la misma clave → exactamente 1 reserva', async () => {
      const clave = randomUUID();
      const body = reservaValida({ habitaciones_count: 1 });
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => reservar('cancun-coral', body, clave)));
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(4);
      expect(t.repos.reservas.todas()).toHaveLength(1);
    });
  });

  describe('Inventario: sin overbooking', () => {
    it('última habitación: la segunda reserva solapada → 409 ROOM_NO_LONGER_AVAILABLE', async () => {
      expect((await reservar('quito-ejido', reservaValida({ adultos: 1 }))).status).toBe(201);
      const res = await reservar('quito-ejido', reservaValida({ adultos: 1, checkin: dia(11), checkout: dia(14) }));
      esperarProblema(res, 409, 'ROOM_NO_LONGER_AVAILABLE');
      expect(res.body.detail).toContain('Habitaciones disponibles: 0, solicitadas: 1');
    });

    it('la salida de una reserva libera la habitación ese mismo día (rotación hotelera)', async () => {
      await reservar('quito-ejido', reservaValida({ adultos: 1, checkin: dia(10), checkout: dia(13) }));
      const res = await reservar('quito-ejido', reservaValida({ adultos: 1, checkin: dia(13), checkout: dia(15) }));
      expect(res.status).toBe(201);
    });

    it('no se pueden pedir más habitaciones de las que tiene el alojamiento', async () => {
      const res = await reservar('quito-epiq', reservaValida({ habitaciones_count: 3, adultos: 3 }));
      esperarProblema(res, 409, 'ROOM_NO_LONGER_AVAILABLE');
    });

    it('se pueden llenar exactamente todas las habitaciones, ni una más', async () => {
      // Gangotena tiene 3 habitaciones.
      expect((await reservar('quito-gangotena', reservaValida({ habitaciones_count: 2, adultos: 2 }))).status).toBe(201);
      expect((await reservar('quito-gangotena', reservaValida({ habitaciones_count: 1, adultos: 1 }))).status).toBe(201);
      esperarProblema(await reservar('quito-gangotena', reservaValida({ habitaciones_count: 1, adultos: 1 })), 409, 'ROOM_NO_LONGER_AVAILABLE');
    });

    it('10 clientes piden a la vez la ÚNICA habitación → solo 1 confirmada, 9 rechazadas', async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          reservar('quito-ejido', reservaValida({ adultos: 1, customer_email: `cliente${i}@example.com` })),
        ),
      );
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);
      const confirmadas = t.repos.reservas.todas().filter((r) => r.status === 'CONFIRMED');
      expect(confirmadas).toHaveLength(1);
    });

    it('una cancelación libera la habitación para otro cliente', async () => {
      const primera = await reservar('quito-ejido', reservaValida({ adultos: 1 }));
      await t.pedir('POST', `/alojamientos/reservations/${primera.body.reservation_id}/cancel`, { idem: true, body: {} });
      expect((await reservar('quito-ejido', reservaValida({ adultos: 1 }))).status).toBe(201);
    });

    it('el mismo cliente no puede duplicar la misma reserva (mismas fechas y alojamiento)', async () => {
      const body = reservaValida({ customer_email: 'repetida@example.com' });
      const primera = await reservar('cancun-coral', body);
      const res = await reservar('cancun-coral', { ...body, customer_email: 'REPETIDA@example.com' });
      esperarProblema(res, 409, 'BOOKING_NOT_CONFIRMED');
      expect(res.body.detail).toContain(primera.body.codigo_reserva);
    });
  });

  describe('Validación de fechas', () => {
    it.each([
      ['llegada anteayer', dia(-2), dia(2), 'checkin'],
      ['salida = entrada', dia(10), dia(10), 'checkout'],
      ['salida antes de la entrada', dia(12), dia(10), 'checkout'],
      ['31 noches', dia(10), dia(41), 'checkout'],
      ['más de 500 días vista', dia(600), dia(602), 'checkin'],
      ['fecha imposible', '2027-02-29', '2027-03-02', 'checkin'],
      ['formato con barras', '2027/01/10', '2027/01/12', 'checkin'],
    ])('%s → 400 en "%s" y no se crea la reserva', async (_caso, checkin, checkout, campo) => {
      const res = await reservar('quito-epiq', reservaValida({ checkin, checkout }));
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
      expect(t.repos.reservas.todas()).toHaveLength(0);
    });
  });

  describe('Capacidad de huéspedes', () => {
    it.each([
      { caso: 'quito-epiq (4 adultos/hab)', id: 'quito-epiq', adultos: 4, ninos: 0, habitaciones: 1, esperado: 201 },
      { caso: 'quito-epiq 5 adultos en 1 hab', id: 'quito-epiq', adultos: 5, ninos: 0, habitaciones: 1, esperado: 400 },
      { caso: 'quito-epiq 5 adultos en 2 hab', id: 'quito-epiq', adultos: 5, ninos: 0, habitaciones: 2, esperado: 201 },
      { caso: 'gangotena 2 adultos + 1 niño', id: 'quito-gangotena', adultos: 2, ninos: 1, habitaciones: 1, esperado: 201 },
      { caso: 'gangotena 3 adultos en 1 hab', id: 'quito-gangotena', adultos: 3, ninos: 0, habitaciones: 1, esperado: 400 },
      { caso: 'gangotena 2 adultos + 2 niños en 1 hab', id: 'quito-gangotena', adultos: 2, ninos: 2, habitaciones: 1, esperado: 400 },
      { caso: 'ejido 1 adulto + 1 niño (cama libre)', id: 'quito-ejido', adultos: 1, ninos: 1, habitaciones: 1, esperado: 201 },
      { caso: 'ejido 2 adultos + 1 niño', id: 'quito-ejido', adultos: 2, ninos: 1, habitaciones: 1, esperado: 400 },
    ])('$caso → HTTP $esperado', async ({ id, adultos, ninos, habitaciones, esperado }) => {
      const res = await reservar(id, reservaValida({ adultos, ninos, habitaciones_count: habitaciones }));
      expect(res.status).toBe(esperado);
      if (esperado === 400) {
        esperarProblema(res, 400, 'VALIDATION_FAILED');
        expect(res.body.detail).toContain('capacidad');
      }
    });
  });

  describe('Validación del cuerpo', () => {
    it.each([
      ['checkin', { checkin: undefined }],
      ['checkout', { checkout: undefined }],
      ['habitaciones_count', { habitaciones_count: undefined }],
      ['habitaciones_count', { habitaciones_count: 0 }],
      ['habitaciones_count', { habitaciones_count: 31 }],
      ['habitaciones_count', { habitaciones_count: '1' }],
      ['customer_name', { customer_name: undefined }],
      ['customer_name', { customer_name: '' }],
      ['customer_name', { customer_name: 'N'.repeat(151) }],
      ['customer_email', { customer_email: 'no-es-email' }],
      ['customer_email', { customer_email: 'ana@' }],
      ['adultos', { adultos: 0 }],
      ['adultos', { adultos: 31 }],
      ['ninos', { ninos: -1 }],
      ['ninos', { ninos: 11 }],
      ['nights', { nights: 0 }],
      ['special_requests', { special_requests: 'x'.repeat(1001) }],
      ['precio_total', { precio_total: 1 }],
    ])('"%s" inválido → 400', async (campo, cambio) => {
      const res = await reservar('quito-epiq', { ...reservaValida(), ...cambio });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });

    it('el cliente no puede fijar el precio: un campo de total extra se rechaza', async () => {
      const res = await reservar('quito-epiq', { ...reservaValida(), total: 1 });
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toEqual(['total']);
    });

    it('alojamiento inexistente → 404', async () => {
      esperarProblema(await reservar('fantasma', reservaValida()), 404);
    });
  });

  describe('Consulta de reservas', () => {
    it('GET /reservations lista de la más reciente a la más antigua con el nombre del alojamiento', async () => {
      const a = await reservar('quito-epiq', reservaValida());
      const b = await reservar('cusco-inka', reservaValida());
      const res = await t.pedir('GET', '/alojamientos/reservations');
      expect(res.status).toBe(200);
      expect(res.body.map((r: any) => r.reservation_id)).toEqual([b.body.reservation_id, a.body.reservation_id]);
      expect(res.body[0].nombre_alojamiento).toBe('Palacio del Inka');
    });

    it('GET /reservations sin reservas → 200 []', async () => {
      const res = await t.pedir('GET', '/alojamientos/reservations');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('GET /reservations/:id → 200 con el mismo detalle que al crearla', async () => {
      const creada = await reservar('quito-epiq', reservaValida());
      const res = await t.pedir('GET', `/alojamientos/reservations/${creada.body.reservation_id}`);
      expect(res.status).toBe(200);
      expect(res.body.codigo_reserva).toBe(creada.body.codigo_reserva);
      expect(res.body.total_price).toEqual(creada.body.total_price);
      expect(res.body.nombre_alojamiento).toBe('Top Rentals EpiQ');
    });

    it('GET /reservations/:id con UUID inexistente → 404', async () => {
      esperarProblema(await t.pedir('GET', `/alojamientos/reservations/${randomUUID()}`), 404);
    });

    it.each(['123', 'BKG-123456', 'abc'])('GET /reservations/%s (no UUID) → 400, no 500', async (id) => {
      esperarProblema(await t.pedir('GET', `/alojamientos/reservations/${id}`), 400);
    });
  });

  describe('Cancelación', () => {
    const cancelar = (id: string, body: unknown = { reason: 'Cambio de planes' }, idem: boolean | string = true) =>
      t.pedir('POST', `/alojamientos/reservations/${id}/cancel`, { body, idem });

    it('200 → CANCELLED y queda registrado', async () => {
      const r = await reservar('quito-epiq', reservaValida());
      const res = await cancelar(r.body.reservation_id);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      const consulta = await t.pedir('GET', `/alojamientos/reservations/${r.body.reservation_id}`);
      expect(consulta.body.status).toBe('CANCELLED');
    });

    it('el motivo es opcional (cuerpo vacío)', async () => {
      const r = await reservar('quito-epiq', reservaValida());
      expect((await cancelar(r.body.reservation_id, {})).status).toBe(200);
    });

    it('cancelar dos veces es idempotente → 200 ambas', async () => {
      const r = await reservar('quito-epiq', reservaValida());
      expect((await cancelar(r.body.reservation_id)).status).toBe(200);
      const otra = await cancelar(r.body.reservation_id);
      expect(otra.status).toBe(200);
      expect(otra.body.status).toBe('CANCELLED');
    });

    it('registra booking_cancelled con el motivo', async () => {
      const r = await reservar('quito-epiq', reservaValida());
      await cancelar(r.body.reservation_id, { reason: 'Enfermedad' });
      expect(t.telemetria.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'booking_cancelled', properties: expect.objectContaining({ reason: 'Enfermedad' }) }),
      );
    });

    it('una estancia YA TERMINADA no se puede cancelar → 409 CANCELLATION_NOT_ALLOWED', async () => {
      const id = randomUUID();
      t.repos.reservas.sembrar({
        id, codigoReserva: 'BKG-900001', alojamientoId: 'quito-epiq', customerName: 'Pasado', status: 'CONFIRMED',
        checkin: dia(-5), checkout: dia(-2), noches: 3, habitacionesCount: 1, total: 360,
      });
      esperarProblema(await cancelar(id), 409, 'CANCELLATION_NOT_ALLOWED');
    });

    it('sin Idempotency-Key → 400', async () => {
      const r = await reservar('quito-epiq', reservaValida());
      esperarProblema(await cancelar(r.body.reservation_id, {}, false), 400);
    });

    it('UUID inexistente → 404', async () => {
      esperarProblema(await cancelar(randomUUID()), 404);
    });

    it('id no UUID → 400', async () => {
      esperarProblema(await cancelar('BKG-123456'), 400);
    });

    it.each([
      ['reason', { reason: 123 }],
      ['reason', { reason: 'x'.repeat(501) }],
      ['reembolso', { reembolso: true }],
    ])('cuerpo inválido → 400 en "%s"', async (campo, body) => {
      const r = await reservar('quito-epiq', reservaValida());
      const res = await cancelar(r.body.reservation_id, body);
      esperarProblema(res, 400, 'VALIDATION_FAILED');
      expect(camposInvalidos(res)).toContain(campo);
    });
  });
});
