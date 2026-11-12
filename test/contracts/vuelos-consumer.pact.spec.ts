import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import * as path from 'path';
import axios from 'axios';

const { like, eachLike, integer, decimal } = MatchersV3;

/**
 * Consumer-Driven Contract Test con PACT (Cátedra RDA2 — Semana 9)
 * Valida formalmente el contrato entre Booking Prototipo (Consumidor)
 * y los Proveedores / Nodos de Aerolíneas (VuelosPartnerProvider).
 */
const provider = new PactV3({
  consumer: 'BookingPrototipoConsumer',
  provider: 'VuelosPartnerProvider',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Contract Testing con PACT: Booking (Consumer) -> Partner de Vuelos (Provider)', () => {
  it('Debe consultar vuelos disponibles por ruta y fecha con OpenAPI v2', async () => {
    provider
      .given('Existen itinerarios y asientos disponibles para la ruta UIO a GYE')
      .uponReceiving('Petición de búsqueda de vuelos UIO-GYE para 2026-12-15')
      .withRequest({
        method: 'POST',
        path: '/vuelos/buscar',
        headers: { 'Content-Type': 'application/json' },
        body: {
          origen: like('UIO'),
          destino: like('GYE'),
          fecha_salida: like('2026-12-15'),
          pasajeros: integer(1),
        },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          total: integer(2),
          vuelos: eachLike({
            vuelo_id: like('VUE-UIO-GYE-101'),
            numero_vuelo: like('EQ-312'),
            aerolinea: like('LATAM Airlines'),
            origen: like('UIO'),
            destino: like('GYE'),
            hora_salida: like('08:30'),
            hora_llegada: like('09:25'),
            precio_base: decimal(79.99),
            moneda: like('USD'),
            asientos_disponibles: integer(18),
          }),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.post(
        `${mockServer.url}/vuelos/buscar`,
        {
          origen: 'UIO',
          destino: 'GYE',
          fecha_salida: '2026-12-15',
          pasajeros: 1,
        },
        { headers: { 'Content-Type': 'application/json' } },
      );
      expect(response.status).toBe(200);
      expect(response.data.vuelos).toBeDefined();
      expect(response.data.vuelos.length).toBeGreaterThan(0);
      expect(response.data.vuelos[0].vuelo_id).toBeDefined();
    });
  });

  it('Debe despachar la reserva de un vuelo y recibir 201 Created con PNR y asiento', async () => {
    provider
      .given('El vuelo VUE-UIO-GYE-101 tiene asientos disponibles')
      .uponReceiving('Despacho de reserva de vuelo con pasajero titular')
      .withRequest({
        method: 'POST',
        path: '/vuelos/book',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': like('idem-vue-4481b'),
        },
        body: {
          vuelo_id: like('VUE-UIO-GYE-101'),
          asiento_preferido: like('14B'),
          pasajero: {
            nombre: like('Alexander'),
            apellido: like('Carrion'),
            documento: like('1712154321'),
            email: like('alexander@aerolinea.com'),
          },
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          pnr: like('PNR-VUE-8841'),
          codigo_reserva: like('VUE-RES-9032'),
          status: like('CONFIRMED'),
          asiento_asignado: like('14B'),
          precio_total: decimal(79.99),
          moneda: like('USD'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.post(
        `${mockServer.url}/vuelos/book`,
        {
          vuelo_id: 'VUE-UIO-GYE-101',
          asiento_preferido: '14B',
          pasajero: {
            nombre: 'Alexander',
            apellido: 'Carrion',
            documento: '1712154321',
            email: 'alexander@aerolinea.com',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'idem-vue-4481b',
          },
        },
      );
      expect(response.status).toBe(201);
      expect(response.data.pnr).toBeDefined();
      expect(response.data.status).toBe('CONFIRMED');
      expect(response.data.asiento_asignado).toBe('14B');
    });
  });
});
