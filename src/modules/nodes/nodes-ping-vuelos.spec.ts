import { NodesService } from './nodes.service';
import { VuelosSociosService } from '../vuelos/socios/vuelos-socios.service';

/** El ping de una aerolínea solo dice "en línea" si responde como API del contrato v2. */
describe('Ping de aerolíneas (vuelos)', () => {
  const armar = (respuestas: Record<string, { status: number; body?: any }>) => {
    const nodo: any = { codigoNodo: 'NODE_VUE_X', vertical: 'VUELOS', baseUrlRest: 'https://x.test/api/v2/vuelos', killSwitchActivo: false };
    const repo: any = { findOne: jest.fn(async () => nodo), save: jest.fn(async (n: any) => n) };
    const socios = { reenviar: jest.fn(async (_c: string, m: string, seg: string[]) => respuestas[`${m} ${seg[0]}`] ?? { status: 404 }) };
    const moduleRef: any = { get: jest.fn((t: any) => (t === VuelosSociosService ? socios : null)) };
    const svc = new NodesService(repo, {} as any, undefined, undefined, undefined, undefined, undefined, moduleRef);
    return { svc, nodo, socios };
  };

  it('responde el feed de eventos (2xx) → en línea', async () => {
    const { svc } = armar({ 'GET eventos': { status: 200, body: { events: [] } } });
    const r = await svc.pingNodo('NODE_VUE_X');
    expect(r.online).toBe(true);
  });

  it('URL mal escrita (404 en todo) → caído, aunque el host conteste', async () => {
    const { svc } = armar({ 'GET eventos': { status: 404, body: 'Cannot GET' }, 'POST search': { status: 404, body: 'Cannot POST /api/iv2/vuelos/search' } });
    const r = await svc.pingNodo('NODE_VUE_X');
    expect(r.online).toBe(false);
    expect(r.health_status).toBe('DOWN');
  });

  it('servidor detenido en Azure (403 HTML) → caído', async () => {
    const { svc } = armar({ 'GET eventos': { status: 403, body: '<html>stopped</html>' }, 'POST search': { status: 403, body: '<html>stopped</html>' } });
    expect((await svc.pingNodo('NODE_VUE_X')).online).toBe(false);
  });

  it('sin feed de eventos pero la búsqueda contesta como API (400 JSON) → en línea', async () => {
    const { svc } = armar({ 'GET eventos': { status: 404 }, 'POST search': { status: 400, body: { title: 'Solicitud inválida' } } });
    expect((await svc.pingNodo('NODE_VUE_X')).online).toBe(true);
  });
});
