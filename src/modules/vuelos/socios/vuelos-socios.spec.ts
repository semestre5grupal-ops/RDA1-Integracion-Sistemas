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
  /** Simula EQ10/RAM/GabatAIR: un hold nuevo no puede incluir asientos que siguen en otro hold vivo. */
  let chocarConPropio = false;
  const holdsVivos = new Map<string, string[]>();
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
          const asientos = (body.assignedSeats ?? []).map((x: any) => x.seatNumber);
          // 'oauth' es una aerolínea que todavía no acepta assignedSeats; '9Z' ya lo compró alguien en la web de la aerolínea.
          if (asientos.length && nodo === 'oauth') return json(400, { title: 'property assignedSeats should not exist' });
          if (asientos.includes('9Z')) return json(409, { code: 'SEAT_TAKEN', title: 'Seat taken' });
          if (chocarConPropio && [...holdsVivos.values()].some((l) => l.some((x) => asientos.includes(x)))) return json(409, { code: 'SEAT_TAKEN', title: 'Seat taken' });
          const id = asientos.length ? `HOLD-${nodo}-${asientos.join('-')}` : body.passengersBreakdown?.adults === 2 ? `HOLD-${nodo}-dos` : `HOLD-${nodo}`;
          if (chocarConPropio) holdsVivos.set(id, asientos);
          return json(201, { holdId: id, offerId: body.offerId, status: 'HELD', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), lockedPrice: { currency: 'USD', total: '150.00' }, assignedSeats: body.assignedSeats });
        }
        if (ruta.startsWith('/api/v2/vuelos/offers/hold/') && req.method === 'DELETE') {
          holdsVivos.delete(ruta.split('/').pop()!);
          res.writeHead(204);
          return res.end();
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
        if (/\/offers\/[^/]+\/seatmap/.test(ruta)) {
          return json(200, { segmentId: 'SEG-1', cabins: [{ cabinClass: 'ECONOMY', rows: [{ rowNumber: 7, seats: [{ seatNumber: '7A', isAvailable: true, status: 'AVAILABLE' }, { seatNumber: '7B', isAvailable: true, status: 'AVAILABLE' }] }, { rowNumber: 0, seats: ['1A', '1B', '2A', '2B', '3A', '4A', '4B', '5C', '8C', '9D', '9Z'].map((n) => ({ seatNumber: n, isAvailable: true, status: 'AVAILABLE' })) }, { rowNumber: 12, seats: [{ seatNumber: '12F', isAvailable: false, status: 'OCCUPIED' }] }] }] });
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
    expect(r.body).toMatchObject({ holdId: 'NODE_VUE_KEY~HOLD-key', offerId: 'NODE_VUE_KEY~OF-key' });
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

    it('asientos en tiempo real: el que elige primero lo bloquea, el otro lo ve ocupado y no se le cobra', async () => {
      const locks = `${base}/api/v2/vuelos/offers/${encodeURIComponent('NODE_VUE_KEY~OF-key')}/seat-locks`;
      const put = (holdId: string, seats: any[]) =>
        fetch(locks, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdId, seats }) });
      const uno = await put('NODE_VUE_KEY~HOLD-A', [{ segmentId: 'SEG-1', seatNumber: '7A' }]);
      expect(uno.status).toBe(200);
      expect((await uno.json()).locked).toEqual([{ segmentId: 'SEG-1', seatNumber: '7A' }]);

      const dos = await put('NODE_VUE_KEY~HOLD-B', [{ segmentId: 'SEG-1', seatNumber: '7A' }]);
      expect(dos.status).toBe(409);
      expect(await dos.json()).toMatchObject({ code: 'SEAT_TAKEN', taken: [{ segmentId: 'SEG-1', seatNumber: '7A' }], charged: false });

      // El mapa del segundo cliente muestra 7A ocupado; a la aerolínea no le llega `holdId`.
      llamadas.length = 0;
      const mapa = await (await fetch(`${base}/api/v2/vuelos/offers/${encodeURIComponent('NODE_VUE_KEY~OF-key')}/seatmap?segmentId=SEG-1&holdId=${encodeURIComponent('NODE_VUE_KEY~HOLD-B')}`)).json();
      expect(mapa.cabins[0].rows[0].seats).toEqual([
        { seatNumber: '7A', isAvailable: false, status: 'HELD' },
        { seatNumber: '7B', isAvailable: true, status: 'AVAILABLE' },
      ]);
      expect(llamadas.find((c) => c.url.includes('/seatmap'))!.url).not.toContain('holdId');
      // El dueño del bloqueo sigue viendo su asiento libre para él.
      const propio = await (await fetch(`${base}/api/v2/vuelos/offers/${encodeURIComponent('NODE_VUE_KEY~OF-key')}/seatmap?segmentId=SEG-1&holdId=${encodeURIComponent('NODE_VUE_KEY~HOLD-A')}`)).json();
      expect(propio.cabins[0].rows[0].seats[0].status).toBe('AVAILABLE');
      const otros = await (await fetch(`${locks}?holdId=${encodeURIComponent('NODE_VUE_KEY~HOLD-B')}&segmentId=SEG-1`)).json();
      expect(otros.locks).toEqual([{ segmentId: 'SEG-1', seatNumber: '7A' }]);

      // Si el segundo intenta pagar ese asiento de todos modos: 409 y NO se cobra.
      const antes = cobros.length;
      const pago = await fetch(`${base}/api/v2/vuelos/bookings`, {
        method: 'POST', headers: conDueno(OTRO, { 'Idempotency-Key': 'idem-asiento' }),
        body: JSON.stringify({ holdId: 'NODE_VUE_KEY~HOLD-B', passengers: [{ assignedSeats: [{ segmentId: 'SEG-1', seatNumber: '7A' }] }] }),
      });
      expect(pago.status).toBe(409);
      expect((await pago.json()).detail).toMatch(/No se realizó ningún cobro/);
      expect(cobros.length).toBe(antes);

      // El primero sale del formulario: el asiento queda libre para el segundo.
      expect((await fetch(`${locks}?holdId=${encodeURIComponent('NODE_VUE_KEY~HOLD-A')}`, { method: 'DELETE' })).status).toBe(204);
      expect((await put('NODE_VUE_KEY~HOLD-B', [{ segmentId: 'SEG-1', seatNumber: '7A' }])).status).toBe(200);
      await fetch(`${locks}?holdId=${encodeURIComponent('NODE_VUE_KEY~HOLD-B')}`, { method: 'DELETE' });
    });

    it('asiento en la aerolínea: rehace el hold con assignedSeats, suelta el anterior y respeta el 409 de la aerolínea', async () => {
      const oferta = encodeURIComponent('NODE_VUE_KEY~OF-key');
      const locks = `${base}/api/v2/vuelos/offers/${oferta}/seat-locks`;
      // 1) Se crea el hold por Booking (así Booking guarda cómo se creó).
      const h = await (await fetch(`${base}/api/v2/vuelos/offers/hold`, { method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-h1' }), body: JSON.stringify({ offerId: 'NODE_VUE_KEY~OF-key', itinerarySelections: [{ itineraryId: 'IT-1', cabinClass: 'ECONOMY', fareBrand: 'BASIC' }], passengersBreakdown: { adults: 1 } }) })).json();
      expect(h.holdId).toBe('NODE_VUE_KEY~HOLD-key');
      llamadas.length = 0;
      // 2) Elige 8C: la aerolínea recibe un hold nuevo con assignedSeats y se libera el anterior.
      const r = await fetch(locks, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId: h.holdId, seats: [{ segmentId: 'SEG-1', seatNumber: '8C' }] }) });
      const datos = await r.json();
      expect(r.status).toBe(200);
      expect(datos).toMatchObject({ holdId: 'NODE_VUE_KEY~HOLD-key-8C', previousHoldId: 'NODE_VUE_KEY~HOLD-key', airlineHold: true });
      expect(datos.hold.bookingPrice).toMatchObject({ airlineTotal: '150.00', total: '165.00' });
      const nuevo = llamadas.find((c) => c.url === '/api/v2/vuelos/offers/hold' && c.method === 'POST')!;
      expect(nuevo.body).toMatchObject({ offerId: 'OF-key', assignedSeats: [{ segmentId: 'SEG-1', seatNumber: '8C' }], passengersBreakdown: { adults: 1 } });
      await new Promise((ok) => setTimeout(ok, 50));
      expect(llamadas.some((c) => c.method === 'DELETE' && c.url === '/api/v2/vuelos/offers/hold/HOLD-key')).toBe(true);
      // 3) El mismo PUT con el hold nuevo y los mismos asientos no rehace nada.
      llamadas.length = 0;
      const igual = await (await fetch(locks, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId: datos.holdId, seats: [{ segmentId: 'SEG-1', seatNumber: '8C' }] }) })).json();
      expect(igual).toMatchObject({ holdId: 'NODE_VUE_KEY~HOLD-key-8C', airlineHold: true });
      expect(llamadas.filter((c) => c.method === 'POST')).toHaveLength(0);
      // 4) Cambia a 9Z, que ya se vendió en la web de la aerolínea: 409 y sigue con 8C.
      const tomado = await fetch(locks, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId: datos.holdId, seats: [{ segmentId: 'SEG-1', seatNumber: '9Z' }] }) });
      expect(tomado.status).toBe(409);
      expect(await tomado.json()).toMatchObject({ code: 'SEAT_TAKEN', taken: [{ segmentId: 'SEG-1', seatNumber: '9Z' }], charged: false });
      const otros = await (await fetch(`${locks}?holdId=otro`)).json();
      expect(otros.locks).toEqual([{ segmentId: 'SEG-1', seatNumber: '8C' }]);
      await fetch(`${locks}?holdId=${encodeURIComponent(datos.holdId)}`, { method: 'DELETE' });
    });

    it('varios pasajeros: agregar un segundo asiento no choca con el hold propio en la aerolínea', async () => {
      chocarConPropio = true;
      holdsVivos.clear();
      try {
        const oferta = encodeURIComponent('NODE_VUE_KEY~OF-key');
        const locks = `${base}/api/v2/vuelos/offers/${oferta}/seat-locks`;
        const h = await (await fetch(`${base}/api/v2/vuelos/offers/hold`, { method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-multi' }), body: JSON.stringify({ offerId: 'NODE_VUE_KEY~OF-key', itinerarySelections: [], passengersBreakdown: { adults: 2 } }) })).json();
        const put = (holdId: string, seats: string[]) => fetch(locks, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId, seats: seats.map((n) => ({ segmentId: 'SEG-1', seatNumber: n })) }) });
        const uno = await (await put(h.holdId, ['5C'])).json();
        expect(uno.holdId).toBe('NODE_VUE_KEY~HOLD-key-5C');
        llamadas.length = 0;
        const dos = await put(uno.holdId, ['5C', '9D']);
        const datos = await dos.json();
        expect(dos.status).toBe(200);
        expect(datos).toMatchObject({ holdId: 'NODE_VUE_KEY~HOLD-key-5C-9D', airlineHold: true });
        // Se soltó el hold anterior ANTES del reintento que sí funcionó.
        const orden = llamadas.filter((c) => c.url.startsWith('/api/v2/vuelos/offers/hold') && c.method !== 'GET' && c.url !== '/api/v2/vuelos/offers/hold/HOLD-key-dos').map((c) => `${c.method} ${c.url}`);
        expect(orden).toEqual(['POST /api/v2/vuelos/offers/hold', 'DELETE /api/v2/vuelos/offers/hold/HOLD-key-5C', 'POST /api/v2/vuelos/offers/hold']);
        // Si el asiento nuevo de verdad es de otro (9Z), se restaura el hold con los asientos previos.
        const malo = await put(datos.holdId, ['5C', '9Z']);
        const cuerpo = await malo.json();
        expect(malo.status).toBe(409);
        expect(cuerpo.taken).toEqual([{ segmentId: 'SEG-1', seatNumber: '9Z' }]);
        expect(cuerpo.holdId).toBe('NODE_VUE_KEY~HOLD-key-5C-9D');
        await fetch(`${locks}?holdId=${encodeURIComponent(cuerpo.holdId)}`, { method: 'DELETE', headers: conDueno(DUENO) });
      } finally {
        chocarConPropio = false;
        holdsVivos.clear();
      }
    });

    it('validación de asientos: inexistente, más que pasajeros, y solo el dueño suelta', async () => {
      const oferta = encodeURIComponent('NODE_VUE_KEY~OF-key');
      const locks = `${base}/api/v2/vuelos/offers/${oferta}/seat-locks`;
      const h = await (await fetch(`${base}/api/v2/vuelos/offers/hold`, { method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-valida' }), body: JSON.stringify({ offerId: 'NODE_VUE_KEY~OF-key', itinerarySelections: [], passengersBreakdown: { adults: 1 } }) })).json();
      const put = (seats: string[], quien = DUENO) => fetch(locks, { method: 'PUT', headers: conDueno(quien), body: JSON.stringify({ holdId: h.holdId, seats: seats.map((n) => ({ segmentId: 'SEG-1', seatNumber: n })) }) });
      expect((await put(['99Z'])).status).toBe(422);
      expect((await put(['1A', '1B'])).status).toBe(422);
      expect((await put(['12F'])).status).toBe(409);
      const ok = await (await put(['1A'])).json();
      expect(ok.locked).toEqual([{ segmentId: 'SEG-1', seatNumber: '1A' }]);
      // Otra persona no puede soltar ni cambiar los asientos de esta compra.
      expect((await fetch(`${locks}?holdId=${encodeURIComponent(ok.holdId)}`, { method: 'DELETE', headers: conDueno(OTRO) })).status).toBe(403);
      const sigue = await (await fetch(`${locks}?holdId=otro`)).json();
      expect(sigue.locks).toContainEqual({ segmentId: 'SEG-1', seatNumber: '1A' });
      expect((await fetch(`${locks}?holdId=${encodeURIComponent(ok.holdId)}`, { method: 'DELETE', headers: conDueno(DUENO) })).status).toBe(204);
    });

    it('cambio de asiento rápido con el hold viejo: Booking usa el vigente y el comprador no se bloquea a sí mismo', async () => {
      const oferta = encodeURIComponent('NODE_VUE_KEY~OF-key');
      const locks = `${base}/api/v2/vuelos/offers/${oferta}/seat-locks`;
      const h = await (await fetch(`${base}/api/v2/vuelos/offers/hold`, { method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-h3' }), body: JSON.stringify({ offerId: 'NODE_VUE_KEY~OF-key', itinerarySelections: [], passengersBreakdown: { adults: 1 } }) })).json();
      const put = (holdId: string, seat: string) => fetch(locks, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId, seats: [{ segmentId: 'SEG-1', seatNumber: seat }] }) });
      const uno = await (await put(h.holdId, '7A')).json();
      expect(uno.holdId).toBe('NODE_VUE_KEY~HOLD-key-7A');
      // La pantalla todavía tiene el hold viejo y cambia a 7B.
      const dos = await (await put(h.holdId, '7B')).json();
      expect(dos.holdId).toBe('NODE_VUE_KEY~HOLD-key-7B');
      expect(dos.hold.holdId).toBe('NODE_VUE_KEY~HOLD-key-7B');
      // Nadie más tiene bloqueado nada: ni 7A (se soltó) ni 7B (es del comprador).
      expect((await (await fetch(`${locks}?holdId=${encodeURIComponent(dos.holdId)}`)).json()).locks).toEqual([]);
      // Con el hold viejo, el mapa igual le muestra 7B como suyo (libre para él).
      const mapa = await (await fetch(`${base}/api/v2/vuelos/offers/${oferta}/seatmap?segmentId=SEG-1&holdId=${encodeURIComponent(h.holdId)}`)).json();
      expect(mapa.cabins[0].rows[0].seats.find((x: any) => x.seatNumber === '7B').isAvailable).toBe(true);
      // Una tercera vez con el hold viejo y el mismo asiento: no rehace nada.
      llamadas.length = 0;
      expect((await (await put(h.holdId, '7B')).json()).holdId).toBe('NODE_VUE_KEY~HOLD-key-7B');
      expect(llamadas.filter((c) => c.method === 'POST')).toHaveLength(0);
      await fetch(`${locks}?holdId=${encodeURIComponent(dos.holdId)}`, { method: 'DELETE' });
    });

    it('aerolínea que aún no acepta assignedSeats: queda el bloqueo de Booking, sin romper la compra', async () => {
      const h = await (await fetch(`${base}/api/v2/vuelos/offers/hold`, { method: 'POST', headers: conDueno(DUENO, { 'Idempotency-Key': 'idem-h2' }), body: JSON.stringify({ offerId: 'NODE_VUE_OAUTH~OF-oauth', itinerarySelections: [] }) })).json();
      const r = await fetch(`${base}/api/v2/vuelos/offers/${encodeURIComponent('NODE_VUE_OAUTH~OF-oauth')}/seat-locks`, { method: 'PUT', headers: conDueno(DUENO), body: JSON.stringify({ holdId: h.holdId, seats: [{ segmentId: 'SEG-1', seatNumber: '3A' }] }) });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ holdId: h.holdId, airlineHold: false, locked: [{ segmentId: 'SEG-1', seatNumber: '3A' }] });
      await fetch(`${base}/api/v2/vuelos/offers/${encodeURIComponent('NODE_VUE_OAUTH~OF-oauth')}/seat-locks?holdId=${encodeURIComponent(h.holdId)}`, { method: 'DELETE' });
    });

    it('la acción de una reserva se compara en minúsculas (/CANCEL también reembolsa)', async () => {
      copias.set('NODE_VUE_KEY~BK-9', { bookingId: 'NODE_VUE_KEY~BK-9', codigoNodo: 'NODE_VUE_KEY', propietarioId: DUENO, transaccionId: 'tx-9', status: 'CONFIRMED' });
      reembolsos.length = 0;
      const r = await fetch(`${base}/api/v2/vuelos/bookings/${encodeURIComponent('NODE_VUE_KEY~BK-9')}/CANCEL`, { method: 'POST', headers: conDueno(DUENO), body: '{}' });
      expect(r.status).toBe(200);
      expect(reembolsos).toEqual([expect.objectContaining({ tx: 'tx-9', monto: 125 })]);
      expect(copias.get('NODE_VUE_KEY~BK-9').status).toBe('CANCELLED');
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
      { id: 'e4', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(2_000), data: { bookingId: 'B1' } },
    ], { 'NODE_VUE_X~B1': copia });
    await s.sincronizarNodo('NODE_VUE_X');
    expect(reservas.marcarEstado).not.toHaveBeenCalled();
    expect(cursor()).toBeNull();
  });

  it('la cancelación que Booking está procesando no la toca el feed; al terminar sí se lee', async () => {
    const { s, reservas } = armar([
      { id: 'e8', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(60_000), data: { bookingId: 'B1', refundAmount: '10.50' } },
    ], { 'NODE_VUE_X~B1': copia });
    s.enCurso.add('NODE_VUE_X~B1');
    await s.sincronizarNodo('NODE_VUE_X');
    expect(reservas.marcarEstado).not.toHaveBeenCalled();
    s.enCurso.delete('NODE_VUE_X~B1');
    await s.sincronizarNodo('NODE_VUE_X');
    expect(reservas.marcarEstado).toHaveBeenCalledWith('NODE_VUE_X~B1', 'CANCELLED', 10.5);
  });

  it('feed con lo más reciente primero y reembolso numérico (EQ10): aplica solo lo nuevo, en orden', async () => {
    const eventos = [
      { id: 'n3', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(60_000), data: { bookingId: 'B1', refund: 42.55, reason: 'web' } },
      { id: 'n2', type: 'ec.edu.epn.booking.vuelos.booking.confirmed', time: hace(120_000), data: { bookingId: 'B1' } },
      { id: 'n1', type: 'ec.edu.epn.booking.vuelos.booking.cancelled', time: hace(180_000), data: { bookingId: 'B9', refund: 5 } },
    ];
    const { s, reservas, cursor, llamadas } = armar(eventos, { 'NODE_VUE_X~B1': copia });
    expect(await s.sincronizarNodo('NODE_VUE_X')).toBe(1);
    expect(reservas.reembolsar).toHaveBeenCalledWith('tx-1', 42.55, expect.any(String));
    expect(cursor()).toBe('n3'); // el más nuevo
    // Siguiente ciclo: nada nuevo, y no se usa `after` (en este feed devuelve lo más antiguo).
    reservas.reembolsar.mockClear();
    expect(await s.sincronizarNodo('NODE_VUE_X')).toBe(0);
    expect(reservas.reembolsar).not.toHaveBeenCalled();
    expect(llamadas.every((q: string) => !q.includes('after='))).toBe(true);
  });

  it('cancelada sin devolución y luego llega el monto: completa el reembolso una sola vez', async () => {
    const { s, reservas } = armar([], {});
    const cancelada = { ...copia, status: 'CANCELLED', reembolsado: 0 };
    expect(await s.cancelarPorAerolinea('NODE_VUE_X', 'NODE_VUE_X~B1', cancelada, { refundAmount: '10.50' }, 'R9', {})).toBe(true);
    expect(reservas.reembolsar).toHaveBeenCalledTimes(1);
    expect(await s.cancelarPorAerolinea('NODE_VUE_X', 'NODE_VUE_X~B1', { ...cancelada, reembolsado: 10.5 }, { refundAmount: '10.50' }, 'R9', {})).toBe(false);
    expect(reservas.reembolsar).toHaveBeenCalledTimes(1);
  });

  it('reconciliar: sin eventos, el detalle de la aerolínea trae el check-in o la cancelación', async () => {
    const { s, socios, reservas } = armar([], { 'NODE_VUE_X~B1': copia, 'NODE_VUE_X~B2': copia });
    (socios.reenviar as jest.Mock).mockImplementation(async (_n: string, _m: string, seg: string[]) => ({
      status: 200,
      body: seg[1].endsWith('B1') ? { bookingId: seg[1], pnr: 'ABC', status: 'CHECKED_IN' } : { bookingId: seg[1], status: 'CANCELLED', refund: { amount: '20.00' } },
    }));
    expect(await s.reconciliar('NODE_VUE_X', 'NODE_VUE_X~B1')).toBe(true);
    expect(reservas.marcarCheckin).toHaveBeenCalledWith('NODE_VUE_X~B1', expect.any(Date), 'aerolinea');
    expect(await s.reconciliar('NODE_VUE_X', 'NODE_VUE_X~B2')).toBe(true);
    expect(reservas.reembolsar).toHaveBeenCalledWith('tx-1', 20, expect.any(String));
    expect(reservas.marcarEstado).toHaveBeenCalledWith('NODE_VUE_X~B2', 'CANCELLED', 20);
  });
});

describe('ofertas de la fecha pedida', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ofertaCoincideConFechas, saleElDiaAnterior, conFechasMasUnDia } = require('./vuelos-socios.service');
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
    // 04:06 UTC del 11 = 23:06 del 10 en Ecuador: no es un vuelo del 11.
    expect(ofertaCoincideConFechas(oferta(['2026-11-11T04:06:00.000Z']), pedido(['2026-11-11']), ahora)).toBe(false);
    expect(ofertaCoincideConFechas(oferta(['2026-11-11T04:06:00.000Z']), pedido(['2026-11-10']), ahora)).toBe(true);
    // Aerolínea que agrupa por fecha UTC: se detecta y se le pide también el día siguiente.
    expect(saleElDiaAnterior(oferta(['2026-11-11T04:06:00.000Z']), pedido(['2026-11-11']))).toBe(true);
    expect(saleElDiaAnterior(oferta(['2026-11-11T14:00:00.000Z']), pedido(['2026-11-11']))).toBe(false);
    expect(saleElDiaAnterior(oferta(['2026-11-11T02:00:00']), pedido(['2026-11-11']))).toBe(false);
    expect(conFechasMasUnDia(pedido(['2026-11-30', '2026-12-31'])).itineraries.map((i: any) => i.departureDate)).toEqual(['2026-12-01', '2027-01-01']);
    // Sin zona horaria: es la hora local de la aerolínea, vale la fecha del texto.
    expect(ofertaCoincideConFechas(oferta(['2026-11-11T02:00:00']), pedido(['2026-11-11']), ahora)).toBe(true);
  });

});

describe('Bloqueo de asientos en tiempo real', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { VuelosAsientosBloqueo, limpiarAsientos } = require('./vuelos-asientos-bloqueo');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { marcarBloqueados } = require('./vuelos-socios.middleware');
  const en15 = () => new Date(Date.now() + 15 * 60_000);
  const a = (seatNumber: string, segmentId = 'SEG-1') => ({ segmentId, seatNumber });

  it('el primero que elige un asiento lo bloquea; el segundo lo ve tomado', async () => {
    const b = new VuelosAsientosBloqueo();
    expect(await b.fijar('N', 'N~H1', [a('14D')], en15())).toEqual({ locked: [a('14D')], taken: [] });
    expect(await b.fijar('N', 'N~H2', [a('14D'), a('14E')], en15())).toEqual({ locked: [a('14E')], taken: [a('14D')] });
    expect(await b.deOtros('N', 'N~H2', 'SEG-1')).toEqual([a('14D')]);
    expect(await b.deOtros('N', 'N~H1')).toEqual([a('14E')]);
    expect(await b.tomadosPorOtros('N', 'N~H2', [a('14D')])).toEqual([a('14D')]);
    // Otro vuelo (otro tramo) u otra aerolínea no se mezclan.
    expect(await b.fijar('N', 'N~H2', [a('14E'), a('14D', 'SEG-2')], en15())).toMatchObject({ taken: [] });
    expect(await b.fijar('OTRA', 'OTRA~H3', [a('14D')], en15())).toMatchObject({ taken: [] });
  });

  it('cambiar de asiento suelta el anterior; salir o comprar suelta todo; lo vencido no bloquea', async () => {
    const b = new VuelosAsientosBloqueo();
    await b.fijar('N', 'N~H1', [a('1A')], en15());
    await b.fijar('N', 'N~H1', [a('2B')], en15());
    expect(await b.fijar('N', 'N~H2', [a('1A')], en15())).toMatchObject({ taken: [] });
    expect(await b.fijar('N', 'N~H2', [a('1A'), a('2B')], en15())).toMatchObject({ taken: [a('2B')] });
    await b.liberar('N~H1');
    expect(await b.deOtros('N', 'N~H2')).toEqual([]);
    await b.fijar('N', 'N~H4', [a('9C')], new Date(Date.now() - 1000));
    expect(await b.fijar('N', 'N~H5', [a('9C')], en15())).toMatchObject({ taken: [] });
  });

  it('limpia la entrada y pinta el mapa con los asientos de otros como HELD', () => {
    expect(limpiarAsientos([{ segmentId: 'S', seatNumber: ' 3d ' }, { segmentId: 'S', seatNumber: '3D' }, { seatNumber: '4A' }, { segmentId: 'S', seatNumber: '; DROP' }, null]))
      .toEqual([{ segmentId: 'S', seatNumber: '3D' }]);
    const mapa = { segmentId: 'S', cabins: [{ cabinClass: 'ECONOMY', rows: [{ rowNumber: 3, seats: [{ seatNumber: '3D', isAvailable: true, status: 'AVAILABLE' }, { seatNumber: '3E', isAvailable: true }, { seatNumber: '3F', isAvailable: false, status: 'TICKETED' }] }] }] };
    const fila = marcarBloqueados(mapa, new Set(['3D', '3F'])).cabins[0].rows[0].seats;
    expect(fila[0]).toMatchObject({ isAvailable: false, status: 'HELD' });
    expect(fila[1]).toEqual({ seatNumber: '3E', isAvailable: true });
    expect(fila[2].status).toBe('TICKETED');
  });
});
