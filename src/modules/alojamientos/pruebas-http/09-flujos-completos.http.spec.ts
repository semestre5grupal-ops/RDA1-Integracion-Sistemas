/**
 * Suite 09 — Recorridos completos de un cliente, de punta a punta, tal como los
 * hace el frontend y como funcionaría en Booking.com.
 */
import { randomUUID } from 'crypto';
import { AppPrueba, crearAppPrueba, esperarProblema, dia } from './app-prueba';

describe('09 · Flujos completos de cliente', () => {
  let t: AppPrueba;

  beforeAll(async () => {
    t = await crearAppPrueba();
  });
  afterAll(() => t.cerrar());
  beforeEach(() => {
    t.sembrarCatalogo();
    t.repos.reservas.limpiar();
  });

  it('buscar "quito" → elegir → ver detalle y reseñas → disponibilidad → cotizar → pagar → ver → modificar → cancelar', async () => {
    // 1. Búsqueda como en la barra del frontend (minúsculas, con fechas).
    const busqueda = await t.pedir('POST', '/alojamientos/search', {
      body: { destino: 'quito', dates: { checkin: dia(15), checkout: dia(18) }, adultos: 2, ninos: 0, habitaciones: 1, rows: 25 },
    });
    expect(busqueda.status).toBe(200);
    const elegido = busqueda.body.data.find((a: any) => a.id === 'quito-epiq');
    expect(elegido.disponibilidad.total_price).toBe(360);

    // 2. Detalle y reseñas.
    const detalle = await t.pedir('GET', `/alojamientos/${elegido.id}`);
    expect(detalle.status).toBe(200);
    expect((await t.pedir('GET', `/alojamientos/${elegido.id}/resenas`)).status).toBe(200);

    // 3. Tarifas disponibles.
    const disp = await t.pedir('POST', '/alojamientos/availability', {
      body: { accommodation: elegido.id, checkin: dia(15), checkout: dia(18), guests: { number_of_adults: 2, number_of_rooms: 1 } },
    });
    const tarifa = disp.body.data.products.find((p: any) => /Desayuno/.test(p.meal_plan));

    // 4. Cotización con la tarifa elegida: mismo precio.
    const prev = await t.pedir('POST', '/alojamientos/orders/preview', {
      body: { accommodation_id: elegido.id, product_id: tarifa.product_id, checkin: dia(15), checkout: dia(18), guests: { number_of_adults: 2, number_of_rooms: 1 } },
    });
    expect(prev.body.data.total_price).toBe(tarifa.price);

    // 5. Pago y confirmación.
    const orden = await t.pedir('POST', '/alojamientos/orders/create', {
      idem: true,
      body: {
        order_preview_id: prev.body.data.order_preview_id,
        payment_reference: 'pay_live_001',
        customer_details: { first_name: 'Lucía', last_name: 'Andrade', email: 'lucia@example.com' },
      },
    });
    expect(orden.status).toBe(201);
    expect(orden.body.total_price).toBe(tarifa.price);

    // 6. El inventario ya descuenta la habitación.
    const inv = await t.pedir('GET', `/alojamientos/${elegido.id}/availability?checkin=${dia(15)}&checkout=${dia(18)}`);
    expect(inv.body.available_rooms).toBe(1);

    // 7. Consulta de la orden.
    const consulta = await t.pedir('GET', `/alojamientos/orders/${orden.body.order_id}`);
    expect(consulta.body.status).toBe('CONFIRMED');

    // 8. Modificación: una noche más.
    const mod = await t.pedir('POST', `/alojamientos/orders/${orden.body.order_id}/modify`, {
      idem: true, body: { checkout: dia(19) },
    });
    expect(mod.status).toBe(200);
    expect(mod.body.accommodation_details.noches).toBe(4);

    // 9. Cancelación y liberación del inventario.
    const cancel = await t.pedir('POST', `/alojamientos/orders/${orden.body.order_id}/cancel`, { idem: true, body: { reason: 'Cambio de planes' } });
    expect(cancel.body.status).toBe('CANCELLED');
    const invFinal = await t.pedir('GET', `/alojamientos/${elegido.id}/availability?checkin=${dia(15)}&checkout=${dia(18)}`);
    expect(invFinal.body.available_rooms).toBe(2);
  });

  it('flujo del frontend: reserva directa → aparece en "Mis reservas" → cancelar', async () => {
    const clave = randomUUID();
    const reserva = await t.pedir('POST', '/alojamientos/quito-gangotena/reservations', {
      idem: clave,
      body: {
        checkin: dia(20), checkout: dia(22), habitaciones_count: 1, nights: 2,
        customer_name: 'Mateo Ruiz', customer_email: 'mateo@example.com', adultos: 2, ninos: 0,
      },
    });
    expect(reserva.status).toBe(201);
    expect(reserva.body.total_price).toEqual({ currency: 'USD', total: 500 });

    const mis = await t.pedir('GET', '/alojamientos/reservations');
    expect(mis.body.map((r: any) => r.codigo_reserva)).toContain(reserva.body.codigo_reserva);

    // Doble clic en "Reservar" (misma clave) no crea otra reserva.
    const dobleClic = await t.pedir('POST', '/alojamientos/quito-gangotena/reservations', {
      idem: clave,
      body: {
        checkin: dia(20), checkout: dia(22), habitaciones_count: 1, customer_name: 'Mateo Ruiz', customer_email: 'mateo@example.com', adultos: 2,
      },
    });
    expect(dobleClic.status).toBe(409);
    expect((await t.pedir('GET', '/alojamientos/reservations')).body).toHaveLength(1);

    const cancel = await t.pedir('POST', `/alojamientos/reservations/${reserva.body.reservation_id}/cancel`, { idem: true, body: { reason: 'Ya no viajo' } });
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('temporada alta: el hotel se llena y la búsqueda deja de mostrarlo para esas fechas', async () => {
    // Gangotena: 3 habitaciones.
    for (let i = 0; i < 3; i++) {
      const r = await t.pedir('POST', '/alojamientos/quito-gangotena/reservations', {
        idem: true,
        body: { checkin: dia(30), checkout: dia(33), habitaciones_count: 1, customer_name: `Cliente ${i}`, customer_email: `c${i}@example.com`, adultos: 2 },
      });
      expect(r.status).toBe(201);
    }
    const busqueda = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'Quito', checkin: dia(31), checkout: dia(32) } });
    expect(busqueda.body.data.map((a: any) => a.id)).not.toContain('quito-gangotena');

    const cuarta = await t.pedir('POST', '/alojamientos/quito-gangotena/reservations', {
      idem: true,
      body: { checkin: dia(31), checkout: dia(32), habitaciones_count: 1, customer_name: 'Tarde', adultos: 1 },
    });
    esperarProblema(cuarta, 409, 'ROOM_NO_LONGER_AVAILABLE');

    // Fuera de esas fechas sí aparece.
    const otras = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'Quito', checkin: dia(33), checkout: dia(35) } });
    expect(otras.body.data.map((a: any) => a.id)).toContain('quito-gangotena');
  });

  it('el administrador sube el precio: lo ven la búsqueda, el detalle, la cotización y la reserva', async () => {
    await t.pedir('GET', '/alojamientos/cusco-inka');
    expect((await t.pedir('PATCH', '/alojamientos/cusco-inka', { body: { precioPorNoche: 260 } })).status).toBe(200);

    expect((await t.pedir('GET', '/alojamientos/cusco-inka')).body.precioPorNoche).toBe(260);
    const busqueda = await t.pedir('POST', '/alojamientos/search', { body: { destino: 'cusco', checkin: dia(5), checkout: dia(7) } });
    expect(busqueda.body.data[0].disponibilidad.total_price).toBe(520);
    const prev = await t.pedir('POST', '/alojamientos/orders/preview', { body: { accommodation_id: 'cusco-inka', checkin: dia(5), checkout: dia(7) } });
    expect(prev.body.data.total_price).toBe(520);
  });

  it('el administrador da de baja un hotel: ya no se puede cotizar ni reservar', async () => {
    expect((await t.pedir('DELETE', '/alojamientos/medellin-clickclack')).status).toBe(204);
    esperarProblema(
      await t.pedir('POST', '/alojamientos/orders/preview', { body: { accommodation_id: 'medellin-clickclack', checkin: dia(5), checkout: dia(7) } }),
      404,
    );
    esperarProblema(
      await t.pedir('POST', '/alojamientos/medellin-clickclack/reservations', {
        idem: true, body: { checkin: dia(5), checkout: dia(7), habitaciones_count: 1, customer_name: 'Ana', adultos: 1 },
      }),
      404,
    );
  });
});
