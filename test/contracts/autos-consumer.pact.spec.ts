import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import * as path from 'path';
import axios from 'axios';

const { like, eachLike, integer, decimal, boolean } = MatchersV3;

/**
 * Consumer-Driven Contract Test con PACT (Cátedra RDA2 — Semana 9)
 * Valida formalmente el contrato entre Booking Prototipo (Consumidor)
 * y los Proveedores / Nodos de Rent a Car (AutosPartnerProvider).
 */
const provider = new PactV3({
  consumer: 'BookingPrototipoConsumer',
  provider: 'AutosPartnerProvider',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Contract Testing con PACT: Booking (Consumer) -> Partner de Autos (Provider)', () => {
  it('Debe consultar catálogo de vehículos disponibles por ciudad', async () => {
    provider
      .given('Existen vehículos disponibles para alquiler en la ciudad de Quito')
      .uponReceiving('Petición de catálogo de autos en Quito')
      .withRequest({
        method: 'GET',
        path: '/autos',
        query: { ciudad: 'Quito' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          total: integer(1),
          vehiculos: eachLike({
            vehiculo_id: like('VEH-UIO-401'),
            marca: like('Toyota'),
            modelo: like('RAV4'),
            categoria: like('SUV'),
            transmision: like('AUTOMATICA'),
            tarifa_diaria: decimal(45.0),
            moneda: like('USD'),
            disponible: boolean(true),
          }),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.get(
        `${mockServer.url}/autos?ciudad=Quito`,
      );
      expect(response.status).toBe(200);
      expect(response.data.vehiculos).toBeDefined();
      expect(response.data.vehiculos.length).toBeGreaterThan(0);
      expect(response.data.vehiculos[0].vehiculo_id).toBeDefined();
    });
  });

  it('Debe despachar reserva de vehículo con validación de depósito y cooldown de 2h', async () => {
    provider
      .given('El vehículo VEH-UIO-401 está listo para entrega inmediata')
      .uponReceiving('Despacho de reserva de auto con conductor y días')
      .withRequest({
        method: 'POST',
        path: '/autos/reservas',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': like('idem-aut-1294c'),
        },
        body: {
          vehiculo_id: like('VEH-UIO-401'),
          dias: integer(3),
          conductor: {
            nombre: like('Damián Nicolalde'),
            licencia: like('LIC-EC-90812'),
            email: like('damian@rentacar.com'),
          },
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          reserva_id: like('RES-AUT-5541'),
          vehiculo_id: like('VEH-UIO-401'),
          status: like('CONFIRMED'),
          total_alquiler: decimal(135.0),
          deposito_garantia: decimal(200.0),
          cooldown_horas: integer(2),
          moneda: like('USD'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await axios.post(
        `${mockServer.url}/autos/reservas`,
        {
          vehiculo_id: 'VEH-UIO-401',
          dias: 3,
          conductor: {
            nombre: 'Damián Nicolalde',
            licencia: 'LIC-EC-90812',
            email: 'damian@rentacar.com',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'idem-aut-1294c',
          },
        },
      );
      expect(response.status).toBe(201);
      expect(response.data.reserva_id).toBeDefined();
      expect(response.data.status).toBe('CONFIRMED');
      expect(response.data.cooldown_horas).toBe(2);
    });
  });
});
