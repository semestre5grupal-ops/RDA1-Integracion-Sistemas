import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import * as path from 'path';
import axios from 'axios';

const { like, eachLike, integer, decimal, boolean } = MatchersV3;

/**
 * Consumer-Driven Contract Test con PACT (Cátedra RDA2 — Semana 9)
 * Valida formalmente el contrato entre Booking Prototipo (Consumidor)
 * y los Proveedores / Nodos de Alojamientos (Proveedores).
 */
const provider = new PactV3({
  consumer: 'BookingPrototipoConsumer',
  provider: 'AlojamientosPartnerProvider',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Contract Testing con PACT: Booking (Consumer) -> Partner de Alojamientos (Provider)', () => {
  it('Debe consultar disponibilidad de alojamientos por ciudad y fechas', async () => {
    provider
      .given('Existen hoteles y habitaciones disponibles en Quito')
      .uponReceiving('Petición de búsqueda de alojamientos en Quito')
      .withRequest({
        method: 'GET',
        path: '/alojamientos/buscar',
        query: {
          ciudad: 'Quito',
          checkin: '2026-12-01',
          checkout: '2026-12-05',
        },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          total: integer(1),
          hoteles: eachLike({
            hotel_id: like('HTL-UIO-001'),
            nombre: like('Hotel Plaza Grande'),
            ciudad: like('Quito'),
            precio_por_noche: decimal(95.5),
            moneda: like('USD'),
            disponible: boolean(true),
            habitaciones_disponibles: integer(4),
          }),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.get(
        `${mockServer.url}/alojamientos/buscar?ciudad=Quito&checkin=2026-12-01&checkout=2026-12-05`,
      );
      expect(response.status).toBe(200);
      expect(response.data.hoteles).toBeDefined();
      expect(response.data.hoteles.length).toBeGreaterThan(0);
      expect(response.data.hoteles[0].hotel_id).toBeDefined();
    });
  });

  it('Debe despachar una reserva de alojamiento y recibir 201 Created con PNR', async () => {
    provider
      .given('La habitación HAB-101 cuenta con disponibilidad')
      .uponReceiving('Despacho de reserva de alojamiento con Idempotency-Key')
      .withRequest({
        method: 'POST',
        path: '/alojamientos/reservas',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': like('idem-alo-9831a'),
        },
        body: {
          hotel_id: like('HTL-UIO-001'),
          habitacion_id: like('HAB-101'),
          checkin: like('2026-12-01'),
          checkout: like('2026-12-05'),
          noches: integer(4),
          huespedes: integer(2),
          titular: {
            nombre: like('Karol Moreno'),
            email: like('karol@alojamiento.com'),
            identificacion: like('1723456789'),
          },
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          pnr: like('BK-ALO-7429'),
          status: like('CONFIRMED'),
          total: decimal(382.0),
          moneda: like('USD'),
          checkin_presencial: boolean(true),
          mensaje: like('Reserva confirmada. Check-in presencial en recepción.'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.post(
        `${mockServer.url}/alojamientos/reservas`,
        {
          hotel_id: 'HTL-UIO-001',
          habitacion_id: 'HAB-101',
          checkin: '2026-12-01',
          checkout: '2026-12-05',
          noches: 4,
          huespedes: 2,
          titular: {
            nombre: 'Karol Moreno',
            email: 'karol@alojamiento.com',
            identificacion: '1723456789',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'idem-alo-9831a',
          },
        },
      );
      expect(response.status).toBe(201);
      expect(response.data.pnr).toBeDefined();
      expect(response.data.status).toBe('CONFIRMED');
      expect(response.data.checkin_presencial).toBe(true);
    });
  });
});
