import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as express from 'express';
import { VuelosSociosService } from './vuelos-socios.service';
import { VuelosSociosMiddleware } from './vuelos-socios.middleware';
import { resumenDeReserva } from './vuelos-socios-reservas.service';
import { trazaVuelos } from './vuelos-traza';

/**
 * Prueba el agregador contra aerolíneas FALSAS levantadas en un puerto local.
 * En producción 127.0.0.1 cuenta como auto-referencia (no se consulta), así que
 * esta suite desactiva esa regla y la prueba aparte con la función original.
 */
describe('VuelosSociosService (agregador de aerolíneas)', () => {
  const llamadas: Array<{ nodo: string; method: string; url: string; headers: any; body: any }> = [];
  let servidor: http.Server;
  let puerto: number;
  const original = VuelosSociosService.esAutoReferencia;

  beforeAll(async () => {
    servidor = http.createServer((req, res) => {
      let crudo = '';
      req.on('data', (c) => (crudo += c));
      req.on('end', () => {
        const [, nodo, ...resto] = (req.url || '').split('/'); // /<nodo>/api/v2/vuelos/...
        const ruta = '/' + resto.join('/');
        const body = crudo ? (req.headers['content-type']?.includes('json') ? JSON.parse(crudo) : crudo) : null;
        llamadas.push({ nodo, method: req.method!, url: ruta, headers: req.headers, body });
        const json = (s: number, b: any) => {
          res.writeHead(s, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(b));
        };
        if (ruta === '/api/v2/oauth2/token') {
          // Como un servidor estricto: credenciales en cabecera Y cuerpo -> 400.
          const enCuerpo = typeof body === 'string' && body.includes('client_secret');
          if (req.headers.authorization && enCuerpo) return json(400, { error: 'invalid_request' });
          return json(200, { access_token: 'tok-123', expires_in: 3600 });
        }
        if (nodo === 'lenta') return; // nunca responde
        if (nodo === 'oauth' && req.headers.authorization !== 'Bearer tok-123') return json(401, { title: 'sin token' });
        if (nodo === 'key' && req.headers['x-api-key'] !== 'clave-key') return json(401, { title: 'sin key' });
        if (ruta === '/api/v2/vuelos/search') {
          const precio = nodo === 'key' ? '120.00' : '80.00';
          return json(200, {
            offers: [{ offerId: `OF-${nodo}`, itineraries: [{ itineraryId: 'IT-1', pricingOptions: [{ price: { total: precio } }] }] }],
          });
        }
        if (ruta === '/api/v2/vuelos/offers/hold' && req.method === 'POST') {
          return json(201, { holdId: `HOLD-${nodo}`, offerId: body.offerId });
        }
        if (ruta.startsWith('/api/v2/vuelos/offers/hold/') && req.method === 'GET') {
          return json(200, { holdId: ruta.split('/').pop(), lockedPrice: { currency: 'USD', total: '150.00' } });
        }
        if (ruta === '/api/v2/vuelos/bookings' && req.method === 'POST') {
          if (nodo === 'oauth') return json(409, { title: 'Sin cupo', detail: 'El vuelo se llenó.' });
          return json(201, {
            bookingId: 'BK-1', pnr: 'ABC123', status: 'CONFIRMED', grandTotal: { currency: 'USD', total: '150.00' },
            itineraries: [{ segments: [{ departure: { iataCode: 'UIO', at: '2026-11-10T08:00:00-05:00' }, arrival: { iataCode: 'GYE', at: '2026-11-10T09:00:00-05:00' } }] }],
          });
        }
        if (/\/api\/v2\/vuelos\/bookings\/[^/]+\/cancel$/.test(ruta)) {
          return json(200, { bookingId: ruta.split('/')[5], pnr: 'ABC123', status: 'CANCELLED', refund: { refundId: 'R1', amount: '125.00' } });
        }
        if (ruta.startsWith('/api/v2/vuelos/flights/')) {
          return nodo === 'oauth' ? json(200, { flightNumber: 'RA101', status: 'DELAYED' }) : json(404, { title: 'no opera' });
        }
        if (ruta.startsWith('/api/v2/vuelos/bookings/') && req.method === 'GET') {
          return json(200, { bookingId: ruta.split('/').pop(), status: 'CONFIRMED' });
        }
        json(404, { title: 'no existe' });
      });
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    puerto = (servidor.address() as AddressInfo).port;
    (VuelosSociosService as any).esAutoReferencia = () => false;
    process.env.VUELOS_SOCIOS_TIMEOUT_MS = '800';
  });

  afterAll(async () => {
    (VuelosSociosService as any).esAutoReferencia = original;
    delete process.env.VUELOS_SOCIOS_TIMEOUT_MS;
    delete process.env.VUELOS_FUENTE;
    servidor.closeAllConnections?.();
    await new Promise((r) => servidor.close(r));
  });

  beforeEach(() => (llamadas.length = 0));

  const nodos = () => [
    { codigoNodo: 'NODE_VUE_KEY', nombreProveedor: 'Aero Key', vertical: 'VUELOS', baseUrlRest: `http://127.0.0.1:${puerto}/key/api/v2/vuelos`, apiKey: 'clave-key', killSwitchActivo: false },
    { codigoNodo: 'NODE_VUE_OAUTH', nombreProveedor: 'Aero OAuth', vertical: 'VUELOS', baseUrlRest: `http://127.0.0.1:${puerto}/oauth/api/v2`, apiKey: `oauth2:cid:csecret:http://127.0.0.1:${puerto}/oauth/api/v2/oauth2/token`, killSwitchActivo: false },
    { codigoNodo: 'NODE_VUE_LENTA', nombreProveedor: 'Aero Lenta', vertical: 'VUELOS', baseUrlRest: `http://127.0.0.1:${puerto}/lenta/api/v2/vuelos`, killSwitchActivo: false },
    { codigoNodo: 'NODE_VUE_APAGADA', nombreProveedor: 'Apagada', vertical: 'VUELOS', baseUrlRest: `http://127.0.0.1:${puerto}/key/api/v2/vuelos`, killSwitchActivo: true },
    { codigoNodo: 'NODE_VUE_SINURL', nombreProveedor: 'Sin URL', vertical: 'VUELOS', baseUrlRest: 'pendiente', killSwitchActivo: false },
  ];

  const repoFalso = () => ({
    find: async ({ where }: any) => nodos().filter((n) => n.vertical === where.vertical),
    findOne: async ({ where }: any) => nodos().find((n) => n.codigoNodo === where.codigoNodo) ?? null,
  });

  const crear = () => new VuelosSociosService(repoFalso() as any);

  it('consulta en paralelo, autentica (API key y OAuth2), prefija ids y tolera una aerolínea caída', async () => {
    const r = await crear().buscar({ itineraries: [] }, { 'x-device-fingerprint': 'fp-1' });

    expect(r.offers.map((o) => o.offerId)).toEqual(['NODE_VUE_OAUTH~OF-oauth', 'NODE_VUE_KEY~OF-key']); // ordenado por precio
    expect(r.offers[0].provider).toMatchObject({ nodeCode: 'NODE_VUE_OAUTH', name: 'Aero OAuth' });
    expect(r.sources).toHaveLength(3); // apagada y sin URL no se consultan
    const lenta = r.sources.find((s) => s.codigoNodo === 'NODE_VUE_LENTA')!;
    expect(lenta.ok).toBe(false);
    expect(lenta.error).toMatch(/Sin respuesta/);

    const busqueda = llamadas.find((c) => c.nodo === 'key' && c.url.endsWith('/search'))!;
    expect(busqueda.headers['x-device-fingerprint']).toBe('fp-1');
    expect(llamadas.some((c) => c.url === '/api/v2/oauth2/token')).toBe(true);
  });

  it('reenvía el hold a la aerolínea dueña sin el prefijo y devuelve ids prefijados', async () => {
    const r = await crear().reenviar(
      'NODE_VUE_KEY', 'POST', ['offers', 'hold'], '',
      { offerId: 'NODE_VUE_KEY~OF-key', itinerarySelections: [] },
      { 'idempotency-key': 'idem-1' },
    );
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ holdId: 'NODE_VUE_KEY~HOLD-key', offerId: 'NODE_VUE_KEY~OF-key' });
    const hold = llamadas.find((c) => c.url === '/api/v2/vuelos/offers/hold')!;
    expect(hold.body.offerId).toBe('OF-key');
    expect(hold.headers['x-user-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(hold.headers['idempotency-key']).toBe('idem-1');
  });

  it('detecta el nodo por la ruta o por el cuerpo', () => {
    expect(VuelosSociosService.detectarNodo(['bookings', 'NODE_VUE_KEY~BK-1'], null)).toBe('NODE_VUE_KEY');
    expect(VuelosSociosService.detectarNodo(['bookings'], { holdId: 'NODE_VUE_OAUTH~H-9' })).toBe('NODE_VUE_OAUTH');
    expect(VuelosSociosService.detectarNodo(['bookings', '3f2a-uuid-local'], { holdId: 'uuid-local' })).toBeNull();
  });

  it('completa las dos formas de segmento (búsqueda y reserva) para el frontend', () => {
    const anidado = { itineraries: [{ segments: [{ departure: { iataCode: 'UIO', at: '2026-11-10T07:00:00-05:00' }, arrival: { iataCode: 'GYE', at: '2026-11-10T08:00:00-05:00' } }] }] };
    const plano = { itineraries: [{ segments: [{ departureIataCode: 'UIO', departureAt: '2026-11-10T07:00:00-05:00', arrivalIataCode: 'GYE', arrivalAt: '2026-11-10T08:00:00-05:00' }] }] };
    const a = VuelosSociosService.normalizarSegmentos(anidado).itineraries[0].segments[0];
    const b = VuelosSociosService.normalizarSegmentos(plano).itineraries[0].segments[0];
    expect(a).toMatchObject({ departureIataCode: 'UIO', arrivalAt: '2026-11-10T08:00:00-05:00' });
    expect(b).toMatchObject({ departure: { iataCode: 'UIO' }, arrival: { at: '2026-11-10T08:00:00-05:00' } });
    expect(resumenDeReserva({ ...plano, grandTotal: { currency: 'USD', total: '99.50' } })).toMatchObject({
      origin: 'UIO', destination: 'GYE', departureDate: '2026-11-10', total: 99.5,
    });
  });

  it('no consulta nodos que apuntan a Booking mismo (seeds localhost)', () => {
    expect(original('http://localhost:3000/api/v2/vuelos')).toBe(true);
    expect(original('https://booking.example.com/api/v2/vuelos', 'booking.example.com')).toBe(true);
    expect(original('https://aerolinea.azurewebsites.net/api/v2/vuelos')).toBe(false);
  });

  describe('middleware sobre Express', () => {
    let app: http.Server;
    let base: string;
    const local = {
      searchFlights: jest.fn(async () => ({ offers: [{ offerId: 'LOCAL-1' }] })),
      listarReservas: jest.fn(async () => ({ items: [{ bookingId: 'local-uuid', createdAt: '2020-01-01T00:00:00Z' }], nextCursor: null })),
    };
    const DUENO = '11111111-1111-4111-8111-111111111111';
    const OTRO = '22222222-2222-4222-8222-222222222222';
    const copias = new Map<string, any>();
    const cobros: any[] = [];
    const reembolsos: any[] = [];
    const reservasFalsas = {
      cobrar: jest.fn(async (monto: number, idem: string, propietario: string) => {
        cobros.push({ monto, idem, propietario });
        return monto > 1000 ? { ok: false, status: 402, detalle: 'Fondos insuficientes' } : { ok: true, transaccionId: 'tx-1', paymentReference: 'AUTH-777' };
      }),
      reembolsar: jest.fn(async (tx: string, monto: number, motivo: string) => {
        reembolsos.push({ tx, monto, motivo });
        return monto;
      }),
      registrar: jest.fn(async (d: any) => copias.set(d.bookingId, { ...d, transaccionId: d.cobro?.transaccionId, status: 'CONFIRMED', createdAt: new Date().toISOString() })),
      obtener: jest.fn(async (id: string) => copias.get(id) ?? null),
      actualizarDesdeSocio: jest.fn(async () => undefined),
      marcarEstado: jest.fn(async (id: string, status: string) => copias.has(id) && (copias.get(id).status = status)),
      facturar: jest.fn(async (d: any) => ({ numero: 'FAC-20261104-000001', partnerOrderId: d.partnerOrderId, total: d.total.toFixed(2) })),
      factura: jest.fn(async () => null),
      mapearClienteSocio: jest.fn(async () => undefined),
      marcarCheckin: jest.fn(async () => true),
      registrarReferenciaPago: jest.fn(async () => undefined),
      recargoPct: jest.fn(async () => 10),
      notaCredito: jest.fn(async (d: any) => ({ numero: 'NC-20261104-000001', monto: d.monto.toFixed(2) })),
      listar: jest.fn(async (prop: string) =>
        [...copias.values()].filter((c) => c.propietarioId === prop).map((c) => ({
          bookingId: c.bookingId, codigoNodo: c.codigoNodo, pnr: 'ABC123', status: c.status, origin: 'UIO', destination: 'GYE',
          departureDate: '2026-11-10', currency: 'USD', grandTotal: 150, createdAt: c.createdAt,
        })),
      ),
    };

    beforeAll(async () => {
      const e = express();
      e.use(express.json());
      e.use(new VuelosSociosMiddleware(crear(), local as any, reservasFalsas as any).handler());
      e.use((_req, res) => res.status(299).json({ local: true }));
      app = await new Promise((r) => {
        const s = e.listen(0, '127.0.0.1', () => r(s));
      });
      base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      app.closeAllConnections?.();
      await new Promise((r) => app.close(r));
    });

    const post = (ruta: string, body: any) =>
      fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    it('modo socios: la búsqueda solo trae vuelos de aerolíneas (sin datos locales)', async () => {
      delete process.env.VUELOS_FUENTE;
      const r = await post('/api/v2/vuelos/search', { itineraries: [] });
      const datos = await r.json();
      expect(r.status).toBe(200);
      expect(datos.offers.map((o: any) => o.offerId)).not.toContain('LOCAL-1');
      expect(datos.meta).toMatchObject({ fuente: 'socios', airlinesQueried: 3, airlinesOk: 2 });
    });

    it('modo mixto: agrega también la base local', async () => {
      process.env.VUELOS_FUENTE = 'mixto';
      const datos = await (await post('/api/v1/vuelos/search', { itineraries: [] })).json();
      expect(datos.offers.map((o: any) => o.offerId)).toContain('LOCAL-1');
      delete process.env.VUELOS_FUENTE;
    });

    it('no expone reservas de socio no registradas y deja pasar las rutas locales', async () => {
      // Una reserva de socio que Booking no registró no se expone (protección IDOR).
      const r = await fetch(`${base}/api/v2/vuelos/bookings/${encodeURIComponent('NODE_VUE_KEY~BK-77')}`);
      expect(r.status).toBe(404);

      const localRes = await fetch(`${base}/api/v2/vuelos/bookings/uuid-local`);
      expect(localRes.status).toBe(299);
    });

    const conDueno = (prop: string, extra: Record<string, string> = {}) => ({
      'Content-Type': 'application/json', 'X-Device-Fingerprint': prop, ...extra,
    });

    it('reserva: cobra el precio del hold, envía la referencia real y guarda la copia', async () => {
      const r = await fetch(`${base}/api/v2/vuelos/bookings`, {
        method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-ok' }),
        body: JSON.stringify({ holdId: 'NODE_VUE_KEY~HOLD-key', passengers: [], payment: { paymentReference: 'pay_falso_del_front' } }),
      });
      const datos = await r.json();
      expect(r.status).toBe(201);
      expect(datos.bookingId).toBe('NODE_VUE_KEY~BK-1');
      // Al cliente: precio de la aerolínea (150) + recargo de Booking 10 % = 165.
      expect(cobros.at(-1)).toEqual({ monto: 165, idem: 'idem-ok', propietario: DUENO });
      const enviada = llamadas.find((c) => c.url === '/api/v2/vuelos/bookings' && c.method === 'POST')!;
      expect(enviada.body.payment.paymentReference).toBe('AUTH-777');
      // Contrato v2: a la aerolínea se le paga SU precio (sin el recargo de Booking).
      expect(enviada.body.payment).toMatchObject({ amount: { currency: 'USD', total: '150.00' }, provider: 'BOOKING_PROTOTIPO' });
      expect(datos.bookingPrice).toEqual({ currency: 'USD', airlineTotal: '150.00', serviceFee: '15.00', serviceFeePercentage: 10, total: '165.00' });
      expect(copias.get('NODE_VUE_KEY~BK-1')).toMatchObject({ montoCobrado: 165, montoAerolinea: 150, cargo: 15 });
      expect(enviada.body.salesChannel).toMatchObject({ partnerId: 'BOOKING_PROTOTIPO', partnerOrderId: expect.stringMatching(/^ORD-BKP-[0-9A-F]{10}$/) });
      expect(datos.factura).toMatchObject({ numero: 'FAC-20261104-000001' });
      expect(enviada.headers['x-user-id']).toBe(DUENO); // la aerolínea ve al mismo dueño que Booking
      expect(enviada.body.holdId).toBe('HOLD-key');
      expect(copias.get('NODE_VUE_KEY~BK-1')).toMatchObject({ propietarioId: DUENO, codigoNodo: 'NODE_VUE_KEY' });
    });

    it('traza en vivo: los pasos de una compra quedan unidos por su X-Correlation-Id', async () => {
      trazaVuelos.reiniciar();
      const corr = 'corr-vuelo-prueba-1';
      await fetch(`${base}/api/v2/vuelos/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': corr }, body: JSON.stringify({ itineraries: [] }) });
      await fetch(`${base}/api/v2/vuelos/bookings`, {
        method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-traza', 'X-Correlation-Id': corr }),
        body: JSON.stringify({ holdId: 'NODE_VUE_KEY~HOLD-key', passengers: [] }),
      });
      const { eventos, contadores } = trazaVuelos.desde(0);
      const deLaCompra = eventos.filter((e) => e.correlacion === corr).map((e) => `${e.paso}:${e.resultado}`);
      expect(deLaCompra).toEqual(['busqueda:aviso', 'cobro:ok', 'reserva_aerolinea:ok', 'copia:ok', 'factura:ok', 'confirmada:ok']);
      expect(contadores.cobro.ok).toBe(1);
      // La aerolínea recibe el mismo correlation ID que el cliente.
      const enviado = llamadas.find((c) => c.url === '/api/v2/vuelos/bookings' && c.method === 'POST')!;
      expect(enviado.headers['x-correlation-id']).toBe(corr);
    });

    it('reserva: si la aerolínea rechaza, Booking reembolsa (SAGA)', async () => {
      const r = await fetch(`${base}/api/v2/vuelos/bookings`, {
        method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-falla' }),
        body: JSON.stringify({ holdId: 'NODE_VUE_OAUTH~HOLD-oauth', passengers: [] }),
      });
      expect(r.status).toBe(409);
      expect((await r.json()).detail).toMatch(/reembolsó/);
      expect(reembolsos.at(-1)).toMatchObject({ tx: 'tx-1', monto: 165 }); // se devuelve todo lo cobrado
    });

    it('reserva: sin Idempotency-Key no se cobra', async () => {
      const antes = cobros.length;
      const r = await post('/api/v2/vuelos/bookings', { holdId: 'NODE_VUE_KEY~HOLD-key' });
      expect(r.status).toBe(400);
      expect(cobros.length).toBe(antes);
    });

    it('Mis Reservas: lista las reservas de socios del dueño, no las de otro', async () => {
      const mias = await (await fetch(`${base}/api/v2/vuelos/bookings?limit=20`, { headers: conDueno(DUENO) })).json();
      expect(mias.items.map((i: any) => i.bookingId)).toEqual(['NODE_VUE_KEY~BK-1']);
      expect(mias.items[0]).toMatchObject({ origin: 'UIO', destination: 'GYE', grandTotal: { total: '150.00' } });
      const ajenas = await (await fetch(`${base}/api/v2/vuelos/bookings`, { headers: conDueno(OTRO) })).json();
      expect(ajenas.items).toEqual([]);
    });

    it('detalle: otro usuario recibe 404 aunque conozca el id (IDOR)', async () => {
      const id = encodeURIComponent('NODE_VUE_KEY~BK-1');
      expect((await fetch(`${base}/api/v2/vuelos/bookings/${id}`, { headers: conDueno(OTRO) })).status).toBe(404);
      expect((await fetch(`${base}/api/v2/vuelos/bookings/${id}`, { headers: conDueno(DUENO) })).status).toBe(200);
    });

    it('cancelar: Booking ejecuta el reembolso que calcula la aerolínea', async () => {
      const id = encodeURIComponent('NODE_VUE_KEY~BK-1');
      const r = await fetch(`${base}/api/v2/vuelos/bookings/${id}/cancel`, {
        method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'c-1' }), body: JSON.stringify({ quoteId: 'Q1' }),
      });
      const datos = await r.json();
      expect(r.status).toBe(200);
      expect(datos.refund).toMatchObject({ amount: '125.00', executedByBooking: true, executedAmount: '125.00', creditNote: { numero: 'NC-20261104-000001' } });
      expect(reembolsos.at(-1)).toMatchObject({ tx: 'tx-1', monto: 125 });
      expect(copias.get('NODE_VUE_KEY~BK-1').status).toBe('CANCELLED');
    });

    it('estado de vuelo: responde la aerolínea que opera el vuelo', async () => {
      const r = await fetch(`${base}/api/v2/vuelos/flights/RA101/status?date=2026-11-10`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ flightNumber: 'RA101', status: 'DELAYED' });
    });

    it('modo local: todo sigue al controlador de siempre', async () => {
      process.env.VUELOS_FUENTE = 'local';
      const r = await post('/api/v2/vuelos/search', {});
      expect(r.status).toBe(299);
      delete process.env.VUELOS_FUENTE;
    });
  });
});

describe('referenciaPagoBooking', () => {
  it('tiene el formato PAY-BKP-AAAAMMDD-NNNNNN, usa la fecha de Ecuador y es estable', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { referenciaPagoBooking } = require('./vuelos-socios-reservas.service');
    const a = referenciaPagoBooking('7d1a7ccd-d58e-497b-aa8a-c3a521bb577a', new Date('2026-11-05T03:00:00Z'));
    expect(a).toMatch(/^PAY-BKP-20261104-\d{6}$/);
    expect(referenciaPagoBooking('7d1a7ccd-d58e-497b-aa8a-c3a521bb577a', new Date('2026-11-05T03:00:00Z'))).toBe(a);
  });
});

describe('normalizarPasajero', () => {
  it('pasa la nacionalidad a alfa-2 y el teléfono a E.164', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { normalizarPasajero } = require('./vuelos-socios.middleware');
    expect(normalizarPasajero({ nationality: 'ECU', contact: { phone: '099 123 4567' } })).toMatchObject({ nationality: 'EC', contact: { phone: '+593991234567' } });
    expect(normalizarPasajero({ nationality: 'col', contact: { phone: '+573001234567' } })).toMatchObject({ nationality: 'CO', contact: { phone: '+573001234567' } });
    expect(normalizarPasajero({ nationality: 'EC', contact: { phone: '593991234567' } }).contact.phone).toBe('+593991234567');
  });
});


describe('facturación de vuelos (cálculos)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const f = require('./vuelos-facturacion');
  it('usa el desglose de la aerolínea si cuadra con el total; si no, IVA 15% incluido', () => {
    expect(f.desglose(79.85, 59, 20.85)).toEqual({ subtotal: 59, impuestos: 20.85, pct: 35.34 });
    expect(f.desglose(80.5, null, null)).toEqual({ subtotal: 70, impuestos: 10.5, pct: 15 });
  });
  it('quincena y orden estables', () => {
    expect(f.periodoQuincena(new Date('2026-11-16T04:00:00Z'))).toBe('2026-11-Q1'); // 15-nov 23:00 en Ecuador
    expect(f.periodoQuincena(new Date('2026-11-16T06:00:00Z'))).toBe('2026-11-Q2');
    expect(f.ordenDeReserva('abc')).toBe(f.ordenDeReserva('abc'));
  });
});


describe('SincronizadorEventosVuelos (feed GET /vuelos/eventos)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SincronizadorEventosVuelos } = require('./vuelos-eventos');
  const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
  function armar(eventos: any[], copias: Record<string, any>) {
    const llamadas: any[] = [];
    const socios = {
      nodosActivos: async () => [{ codigoNodo: 'NODE_VUE_X' }],
      reenviar: jest.fn(async (_n: string, _m: string, s: string[], q: string) => {
        if (s[0] === 'bookings') {
          return { status: 200, body: { bookingId: s[1], status: 'CONFIRMED', itineraries: [{ segments: [{ departure: { iataCode: 'GYE', at: '2026-11-21T09:30:00Z' }, arrival: { iataCode: 'UIO' } }] }] } };
        }
        llamadas.push(q);
        return { status: 200, body: { events: q.includes('after=') ? [] : eventos } };
      }),
    };
    let cursor: string | null = null;
    const reservas = {
      cursorEventos: jest.fn(async () => cursor),
      guardarCursor: jest.fn(async (_n: string, c: string) => { cursor = c; }),
      obtener: jest.fn(async (id: string) => copias[id] ?? null),
      marcarCheckin: jest.fn(async () => true),
      reembolsar: jest.fn(async (_t: string, m: number) => m),
      notaCredito: jest.fn(async () => ({ numero: 'NC-1', monto: '10.00' })),
      marcarEstado: jest.fn(async () => undefined),
      idClienteEnSocio: jest.fn(async () => undefined),
      actualizarDesdeSocio: jest.fn(async () => undefined),
    };
    return { s: new SincronizadorEventosVuelos(socios as any, reservas as any), socios, reservas, llamadas, cursor: () => cursor };
  }
  const copia = { status: 'CONFIRMED', grandTotal: 80.5, reembolsado: 0, transaccionId: 'tx-1', propietarioId: 'u-1', pnr: 'ABC' };

  it('check-in en la aerolínea → CHECKED_IN; ignora reservas que no vendió Booking; guarda el cursor', async () => {
    const { s, reservas, cursor } = armar([
      { id: 'e1', type: 'ec.edu.epn.booking.vuelos.booking.checked_in', time: hace(1000), data: { bookingId: 'B1', pnr: 'ABC', passengersCheckedIn: 1 } },
      { id: 'e2', type: 'ec.edu.epn.booking.vuelos.booking.checked_in', time: hace(1000), data: { bookingId: 'AJENA' } },
      // así llega por el proxy de Booking: el id ya trae el código de la aerolínea
      { id: 'e2b', type: 'ec.edu.epn.booking.vuelos.booking.checked_in', time: hace(1000), data: { bookingId: 'NODE_VUE_X~B2' } },
    ], { 'NODE_VUE_X~B1': copia, 'NODE_VUE_X~B2': copia });
    expect(await s.sincronizarNodo('NODE_VUE_X')).toBe(2);
    expect(reservas.marcarCheckin).toHaveBeenCalledWith('NODE_VUE_X~B1', expect.any(Date), 'aerolinea');
    expect(reservas.marcarCheckin).toHaveBeenCalledWith('NODE_VUE_X~B2', expect.any(Date), 'aerolinea');
    expect(reservas.marcarCheckin).toHaveBeenCalledTimes(2);
    expect(cursor()).toBe('e2b');
  });

  it('cancelación hecha en la aerolínea → reembolsa lo que informa, nota de crédito y CANCELLED', async () => {
    const { s, reservas } = armar([
      { id: 'e3', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(5 * 60_000), data: { bookingId: 'B1', reasonCode: 'CUSTOMER_REQUEST', refundAmount: '10.50', refundId: 'R1' } },
    ], { 'NODE_VUE_X~B1': copia });
    await s.sincronizarNodo('NODE_VUE_X');
    expect(reservas.reembolsar).toHaveBeenCalledWith('tx-1', 10.5, expect.any(String));
    expect(reservas.notaCredito).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'NODE_VUE_X~B1', monto: 10.5, claveReembolso: 'R1' }));
    expect(reservas.marcarEstado).toHaveBeenCalledWith('NODE_VUE_X~B1', 'CANCELLED', 10.5);
  });

  it('retraso / cambio de fecha (booking.changed DATE_CHANGE) → relee la reserva y actualiza la fecha', async () => {
    const { s, socios, reservas } = armar([
      { id: 'e5', type: 'ec.edu.epn.booking.vuelos.booking.changed', time: hace(1000), data: { bookingId: 'B1', changeType: 'DATE_CHANGE' } },
      { id: 'e6', type: 'ec.edu.epn.booking.vuelos.booking.changed', time: hace(1000), data: { bookingId: 'B1', changeType: 'BAGGAGE' } },
      { id: 'e7', type: 'ec.edu.epn.booking.vuelos.booking.changed', time: hace(1000), data: { bookingId: 'B3', changeType: 'DATE_CHANGE' } },
    ], { 'NODE_VUE_X~B1': copia, 'NODE_VUE_X~B3': { ...copia, status: 'CANCELLED' } });
    expect(await s.sincronizarNodo('NODE_VUE_X')).toBe(1);
    expect(socios.reenviar).toHaveBeenCalledWith('NODE_VUE_X', 'GET', ['bookings', 'NODE_VUE_X~B1'], '', null, expect.any(Object));
    expect(reservas.actualizarDesdeSocio).toHaveBeenCalledTimes(1);
    expect(reservas.actualizarDesdeSocio).toHaveBeenCalledWith('NODE_VUE_X~B1', expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('una cancelación recién hecha espera (puede ser la que hizo Booking) y no avanza el cursor', async () => {
    const { s, reservas, cursor } = armar([
      { id: 'e4', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(5_000), data: { bookingId: 'B1' } },
    ], { 'NODE_VUE_X~B1': copia });
    await s.sincronizarNodo('NODE_VUE_X');
    expect(reservas.marcarEstado).not.toHaveBeenCalled();
    expect(cursor()).toBeNull();
  });
});

describe('ofertas de la fecha pedida', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ofertaCoincideConFechas } = require('./vuelos-socios.service');
  const oferta = (salidas: string[]) => ({ itineraries: salidas.map((at) => ({ segments: [{ departureAt: at }] })) });
  const pedido = (fechas: string[]) => ({ itineraries: fechas.map((d) => ({ departureDate: d })) });
  const ahora = new Date('2026-11-05T03:00:00Z');

  it('descarta vuelos de otra fecha o que ya salieron (EQ10 devolvía octubre para cualquier fecha)', () => {
    expect(ofertaCoincideConFechas(oferta(['2026-10-08T06:30:00+00:00']), pedido(['2026-11-06']), ahora)).toBe(false);
    expect(ofertaCoincideConFechas(oferta(['2026-11-06T12:00:00.000Z']), pedido(['2026-11-06']), ahora)).toBe(true);
    expect(ofertaCoincideConFechas(oferta(['2026-11-06T07:00:00-05:00', '2026-11-08T09:00:00-05:00']), pedido(['2026-11-06', '2026-11-08']), ahora)).toBe(true);
    expect(ofertaCoincideConFechas(oferta(['2026-11-06T07:00:00-05:00', '2026-11-09T09:00:00-05:00']), pedido(['2026-11-06', '2026-11-08']), ahora)).toBe(false);
    // 23:30 en Ecuador = 04:30Z del día siguiente: sigue siendo la fecha pedida
    expect(ofertaCoincideConFechas(oferta(['2026-11-07T04:30:00Z']), pedido(['2026-11-06']), ahora)).toBe(true);
    expect(ofertaCoincideConFechas(oferta(['2026-11-04T12:00:00Z']), pedido(['2026-11-04']), ahora)).toBe(false); // ya salió
  });

});
