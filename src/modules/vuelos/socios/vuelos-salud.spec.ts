import { acumular, healthStatusDe, mediana } from './vuelos-salud';
import { VuelosSociosService } from './vuelos-socios.service';

describe('Ping de integración de aerolíneas', () => {
  const nodo: any = { codigoNodo: 'NODE_VUE_X', vertical: 'VUELOS', baseUrlRest: 'https://x.test/api/v2/vuelos', apiKey: 'oauth2:id:secreto', killSwitchActivo: false };
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });

  const svc = () => {
    const repo: any = { find: jest.fn(async () => [nodo]), findOne: jest.fn(async () => nodo), update: jest.fn(async () => ({})) };
    return { s: new VuelosSociosService(repo), repo };
  };
  const resp = (status: number, cuerpo: any) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo),
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  });
  /** Simula la aerolínea: token y rutas. */
  const aerolinea = (rutas: Record<string, [number, any]>) => {
    const llamadas: string[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      const u = String(url);
      llamadas.push(`${init?.method || 'GET'} ${u}`);
      if (u.endsWith('/oauth2/token')) return resp(...(rutas.token ?? [200, { access_token: 'tok', expires_in: 300 }])) as any;
      const clave = Object.keys(rutas).find((k) => k !== 'token' && u.includes(k));
      if (!clave) return resp(404, '<html>Not found</html>') as any;
      return resp(...rutas[clave]) as any;
    }) as any;
    return llamadas;
  };

  it('token aceptado + feed del contrato → INTEGRADO, y la siguiente pide desde el último evento', async () => {
    const llamadas = aerolinea({ '/eventos': [200, { events: [{ id: 'ev-9', type: 'booking.checked_in' }] }] });
    const { s } = svc();
    expect((await s.comprobarIntegracion(nodo)).estado).toBe('INTEGRADO');
    await s.comprobarIntegracion(nodo);
    expect(llamadas.filter((l) => l.includes('/eventos')).pop()).toContain('after=ev-9');
    // el token se pidió una sola vez
    expect(llamadas.filter((l) => l.includes('/oauth2/token')).length).toBe(1);
  });

  it('credenciales rechazadas (JSON) → SIN_INTEGRACION', async () => {
    aerolinea({ token: [401, { error: 'invalid_client' }] });
    const r = await svc().s.comprobarIntegracion(nodo);
    expect(r.estado).toBe('SIN_INTEGRACION');
    expect(r.detalle).toMatch(/Credenciales rechazadas/);
  });

  it('token OK pero el feed rechaza el token → SIN_INTEGRACION', async () => {
    aerolinea({ '/eventos': [401, { title: 'Unauthorized' }] });
    expect((await svc().s.comprobarIntegracion(nodo)).estado).toBe('SIN_INTEGRACION');
  });

  it('feed responde 200 pero sin events/items → SIN_INTEGRACION', async () => {
    aerolinea({ '/eventos': [200, { ok: true }] });
    expect((await svc().s.comprobarIntegracion(nodo)).estado).toBe('SIN_INTEGRACION');
  });

  it('sin feed pero /search responde como API → INTEGRADO', async () => {
    aerolinea({ '/eventos': [404, { title: 'Not found' }], '/search': [400, { title: 'Solicitud inválida' }] });
    expect((await svc().s.comprobarIntegracion(nodo)).estado).toBe('INTEGRADO');
  });

  it('servidor detenido (HTML en todo) → CAIDO tras 2 fallos seguidos', async () => {
    aerolinea({ token: [403, '<html>stopped</html>'] });
    const { s } = svc();
    expect((await s.comprobarIntegracion(nodo)).estado).toBe('CAIDO');
  });

  it('sin conexión → un fallo aislado mantiene el estado anterior; el segundo marca CAIDO', async () => {
    aerolinea({ '/eventos': [200, { events: [] }] });
    const { s } = svc();
    await s.comprobarIntegracion(nodo);
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); }) as any;
    expect((await s.comprobarIntegracion(nodo)).estado).toBe('INTEGRADO');
    expect((await s.comprobarIntegracion(nodo)).estado).toBe('CAIDO');
  });

  it('comprobarYGuardar guarda estado, ms y hora solo si no tiene kill switch', async () => {
    aerolinea({ '/eventos': [200, { items: [] }] });
    const { s, repo } = svc();
    await s.comprobarYGuardar(nodo);
    expect(repo.update).toHaveBeenCalledWith(
      { codigoNodo: 'NODE_VUE_X', killSwitchActivo: false },
      expect.objectContaining({ healthStatus: 'HEALTHY' }),
    );
  });

  it('latencia = mediana de las últimas 3 correctas', () => {
    let a: any;
    for (const ms of [900, 120, 140]) a = acumular(a, { estado: 'INTEGRADO', llamadaMs: ms, tokenMs: 0, http: 200, detalle: '' });
    expect(a.ms).toBe(140);
    expect(mediana([5, 1, 3])).toBe(3);
    expect(healthStatusDe('SIN_INTEGRACION')).toBe('DEGRADED');
  });
});
