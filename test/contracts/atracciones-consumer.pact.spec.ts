import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import * as path from 'path';
import axios from 'axios';

const { like, eachLike, integer } = MatchersV3;

/**
 * Consumer-Driven Contract Test con PACT (Cátedra RDA2 — Semana 9)
 * Valida formalmente el contrato entre Booking Prototipo (Consumidor)
 * y las Tiendas Web Individuales de Atracciones (Proveedores).
 */
const provider = new PactV3({
  consumer: 'BookingPrototipoConsumer',
  provider: 'AtraccionesPartnerProvider',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Contract Testing con PACT: Booking (Consumer) -> Tienda de Atracciones (Provider)', () => {
  it('Debe consultar la disponibilidad de turnos con el schema canónico OpenAPI v3', async () => {
    provider
      .given('Existen turnos y aforo disponible para la atracción PRhu4UBTWPBC')
      .uponReceiving('Petición de disponibilidad de turnos para el 2026-10-25')
      .withRequest({
        method: 'GET',
        path: '/atracciones/PRhu4UBTWPBC/disponibilidad',
        query: { date: '2026-10-25' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          atraccion_id: like('PRhu4UBTWPBC'),
          date: like('2026-10-25'),
          total_available_slots: integer(45),
          time_slots: eachLike({
            slot_id: like('slot-20261025-1030'),
            time: like('10:30 a.m.'),
            total_slots: integer(25),
            available_slots: integer(8),
            status: like('DISPONIBLE'),
          }),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.get(
        `${mockServer.url}/atracciones/PRhu4UBTWPBC/disponibilidad?date=2026-10-25`,
      );
      expect(response.status).toBe(200);
      expect(response.data.total_available_slots).toBeDefined();
      expect(response.data.time_slots.length).toBeGreaterThan(0);
    });
  });

  it('Debe despachar una reserva REST y recibir 201 Created con reservation_id', async () => {
    provider
      .given('El turno slot-20261025-1030 cuenta con 8 cupos disponibles')
      .uponReceiving('Despacho REST de reserva desde Booking Prototipo con Idempotency-Key')
      .withRequest({
        method: 'POST',
        path: '/reservas',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': like('idem-v3-9932b'),
        },
        body: {
          attraction_id: like('PRhu4UBTWPBC'),
          slot_id: like('slot-20261025-1030'),
          date: like('2026-10-25'),
          time: like('10:30 a.m.'),
          adult_count: integer(2),
          total_tickets: integer(2),
          customer: {
            name: like('Carlos Mendoza'),
            email: like('turista@epn.edu.ec'),
          },
          booking_reservation_id: like('RES-ATR-A1B2C3'),
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: like(true),
          reservation_id: like('SOCIO-CONF-8821'),
          status: like('CONFIRMED'),
          message: like('Reserva confirmada en la tienda socia.'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.post(
        `${mockServer.url}/reservas`,
        {
          attraction_id: 'PRhu4UBTWPBC',
          slot_id: 'slot-20261025-1030',
          date: '2026-10-25',
          time: '10:30 a.m.',
          adult_count: 2,
          total_tickets: 2,
          customer: {
            name: 'Carlos Mendoza',
            email: 'turista@epn.edu.ec',
          },
          booking_reservation_id: 'RES-ATR-A1B2C3',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'idem-v3-9932b',
          },
        },
      );
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.reservation_id).toBeDefined();
    });
  });

  it('Debe recibir 409 Conflict con OUT_OF_STOCK para activar la Saga de compensación en Booking', async () => {
    provider
      .given('El turno slot-20261025-1030 no tiene cupos suficientes')
      .uponReceiving('Despacho REST de reserva para un turno agotado')
      .withRequest({
        method: 'POST',
        path: '/reservas',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          attraction_id: like('PRhu4UBTWPBC'),
          slot_id: like('slot-20261025-1030'),
          adult_count: integer(5),
        },
      })
      .willRespondWith({
        status: 409,
        headers: { 'Content-Type': 'application/problem+json' },
        body: {
          type: like('https://booking.epn.edu.ec/errors/sin-cupos'),
          title: like('Cupos Agotados para el Turno Horario'),
          status: integer(409),
          detail: like('No existen suficientes cupos disponibles.'),
          code: like('OUT_OF_STOCK'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      try {
        await axios.post(
          `${mockServer.url}/reservas`,
          {
            attraction_id: 'PRhu4UBTWPBC',
            slot_id: 'slot-20261025-1030',
            adult_count: 5,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
        throw new Error('Debería haber fallado con 409 Conflict');
      } catch (err: any) {
        expect(err.response.status).toBe(409);
        expect(err.response.data.code).toBe('OUT_OF_STOCK');
      }
    });
  });
});
