import axios from 'axios';
import { TraceContextService } from './trace-context.service';
import { TraceContextMiddleware } from './trace-context.middleware';

describe('TraceContextService', () => {
  it('continues a valid trace and creates a child span for outgoing HTTP', () => {
    const service = new TraceContextService();
    const middleware = new TraceContextMiddleware(service);
    const request = {
      headers: {
        'x-correlation-id': 'corr-incoming',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    };
    const response = { setHeader: jest.fn() };
    let outgoing: Record<string, string> | undefined;

    middleware.use(request as any, response as any, () => {
      outgoing = service.outgoingHeaders();
    });

    expect(outgoing?.['X-Correlation-Id']).toBe('corr-incoming');
    expect(outgoing?.traceparent).toMatch(
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7)[0-9a-f]{16}-01$/,
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'corr-incoming');
  });

  it('creates request IDs and trace context when the client sends no valid context', () => {
    const service = new TraceContextService();
    const middleware = new TraceContextMiddleware(service);
    const request = { headers: { traceparent: 'invalid' } };
    const response = { setHeader: jest.fn() };
    let context: ReturnType<TraceContextService['current']> = undefined;

    middleware.use(request as any, response as any, () => {
      context = service.current();
    });

    expect(context?.correlationId).toMatch(/^corr-\d+-[0-9a-f]{8}$/);
    expect(context?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Correlation-Id',
      context?.correlationId,
    );
  });

  it('adds correlation ID and child W3C context to outgoing axios calls', async () => {
    const service = new TraceContextService();
    const client = axios.create();
    let requestHeaders: Record<string, unknown> | undefined;
    client.defaults.adapter = async (config) => {
      requestHeaders = config.headers.toJSON();
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    service.instrumentAxios(client, true);

    const context = service.createContext(
      'corr-http',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );
    context.userId = 'user-123';
    context.userRoles = ['CLIENTE'];
    await service.run(context, async () => {
      await client.get('https://partner.example.test/health');
      expect(service.outgoingHeaders('different-correlation')['X-Correlation-Id']).toBe(
        'corr-http',
      );
    });

    expect(requestHeaders?.['X-Correlation-Id']).toBe('corr-http');
    expect(requestHeaders?.traceparent).toMatch(
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7-)[0-9a-f]{16}-01$/,
    );
    expect(requestHeaders?.node_id).toBe(context.nodeId);
    expect(requestHeaders?.['X-User-Id']).toBe('user-123');
    expect(requestHeaders?.['X-User-Roles']).toBe('CLIENTE');
  });
});
