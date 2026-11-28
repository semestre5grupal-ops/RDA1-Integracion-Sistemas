import { HealthController } from './health.controller';
import { getCachedSupabaseUser, setCachedSupabaseUser, clearSupabaseTokenCache } from '../auth/supabase-token-cache';

describe('HealthController (Keep-Alive & Egress Protection)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearSupabaseTokenCache();
  });

  it('ejecuta SELECT 1 + ping Supabase una vez y cachea durante 12 horas', async () => {
    const queryMock = jest.fn().mockResolvedValue([{ alive: 1 }]);
    const dataSource = { query: queryMock } as any;
    const fetchMock = jest.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock as any;

    const controller = new HealthController(dataSource);

    // Primera llamada -> live_ping
    const first = await controller.keepAlive();
    expect(first.status).toBe('ok');
    expect(first.mode).toBe('live_ping');
    expect(first.db_select_1).toBe('ok');
    expect(first.supabase_auth_health).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda llamada inmediata -> cached (0 consultas extra a DB ni Supabase)
    const second = await controller.keepAlive();
    expect(second.status).toBe('ok');
    expect(second.mode).toBe('cached');
    expect(second.egress_protected).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Llamada con force=true -> fuerza ping real
    const forced = await controller.keepAlive('true');
    expect(forced.mode).toBe('live_ping');
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Supabase Token Cache', () => {
  beforeEach(() => clearSupabaseTokenCache());

  function fakeJwt(expSecondsFromNow: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })).toString('base64url');
    return `${header}.${payload}.sig`;
  }

  it('retorna usuario cacheado si el JWT es válido', () => {
    const token = fakeJwt(300);
    const user = { id: 'u1', email: 'test@booking.com' };
    setCachedSupabaseUser(token, user);
    expect(getCachedSupabaseUser(token)).toEqual(user);
  });

  it('no devuelve ni almacena un JWT ya expirado', () => {
    const expired = fakeJwt(-10);
    setCachedSupabaseUser(expired, { id: 'u1' });
    expect(getCachedSupabaseUser(expired)).toBeNull();
  });
});
