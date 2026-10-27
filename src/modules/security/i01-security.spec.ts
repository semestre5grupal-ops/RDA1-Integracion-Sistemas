import {
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';
import { RolesGuard } from '../../core/guards/roles.guard';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';
import { NodesController } from '../nodes/nodes.controller';
import { InventoryGrpcController } from '../inventory/inventory-grpc.controller';
import { TelemetryEventDto } from '../telemetry/dto/telemetry-event.dto';
import { TelemetryBodySizeInterceptor } from '../telemetry/telemetry-body-size.interceptor';
import { TelemetryRateLimitGuard } from '../telemetry/telemetry-rate-limit.guard';
import { ChatbotRateLimitGuard } from '../chatbot/chatbot-rate-limit.guard';
import { HERRAMIENTAS } from '../chatbot/chatbot.tools';

function executionContext(request: Record<string, any>, handler?: Function): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => request.response ?? { setHeader: jest.fn() },
    }),
    getHandler: () => handler,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function expectHttpStatus(action: () => unknown, status: number): void {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
}

describe('I01 security boundaries', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.SECURITY_RATE_LIMIT_ENABLED;
    delete process.env.TELEMETRY_RATE_LIMIT_MAX;
    delete process.env.CHATBOT_RATE_LIMIT_MAX;
  });

  it('rejects anonymous and non-admin toggle requests, while accepting maintenance/admin', async () => {
    process.env.NODE_ENV = 'test';
    const authGuard = new SupabaseAuthGuard();
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);
    const handler = NodesController.prototype.toggleNodePublic;
    const roles = Reflect.getMetadata(ROLES_KEY, handler);

    expect(Reflect.getMetadata('__guards__', handler)).toEqual(
      expect.arrayContaining([SupabaseAuthGuard, RolesGuard]),
    );
    expect(roles).toEqual(expect.arrayContaining([Rol.ADMIN, Rol.MANTENIMIENTO]));
    await expect(authGuard.canActivate(executionContext({ headers: {} }))).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });

    const request: Record<string, any> = { headers: { 'x-role': 'cliente' } };
    await authGuard.canActivate(executionContext(request));
    expectHttpStatus(
      () => rolesGuard.canActivate(executionContext(request, handler)),
      HttpStatus.FORBIDDEN,
    );

    for (const role of ['admin', 'mantenimiento']) {
      const authorized: Record<string, any> = { headers: { 'x-role': role } };
      await authGuard.canActivate(executionContext(authorized));
      expect(rolesGuard.canActivate(executionContext(authorized, handler))).toBe(true);
    }
  });

  it('does not trust evaluation headers in production', async () => {
    process.env.NODE_ENV = 'production';
    const guard = new SupabaseAuthGuard();

    await expect(
      guard.canActivate(executionContext({ headers: { 'x-role': 'admin' } })),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    await expect(
      guard.canActivate(executionContext({ headers: { 'x-admin-key': 'admin-secret' } })),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });

  it('requires admin or maintenance roles for REST inventory status and reads', () => {
    const authGuard = new SupabaseAuthGuard();
    const rolesGuard = new RolesGuard(new Reflector());
    for (const handler of [
      InventoryGrpcController.prototype.getInventory,
      InventoryGrpcController.prototype.getStatus,
    ]) {
      expect(Reflect.getMetadata('__guards__', handler)).toEqual(
        expect.arrayContaining([SupabaseAuthGuard, RolesGuard]),
      );
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(
        expect.arrayContaining([Rol.ADMIN, Rol.MANTENIMIENTO]),
      );
      const anonymous: Record<string, any> = { headers: {} };
      expectHttpStatus(
        () => rolesGuard.canActivate(executionContext(anonymous, handler)),
        HttpStatus.UNAUTHORIZED,
      );
      const forbidden: Record<string, any> = { headers: { 'x-role': 'cliente' } };
      authGuard.canActivate(executionContext(forbidden));
      expectHttpStatus(
        () => rolesGuard.canActivate(executionContext(forbidden, handler)),
        HttpStatus.FORBIDDEN,
      );
      for (const role of ['admin', 'mantenimiento']) {
        const authorized: Record<string, any> = { headers: { 'x-role': role } };
        authGuard.canActivate(executionContext(authorized));
        expect(rolesGuard.canActivate(executionContext(authorized, handler))).toBe(true);
      }
    }
  });

  it('protects all public node mutations while keeping node listing public', () => {
    expect(Reflect.getMetadata('__guards__', NodesController.prototype.listarNodos)).toBeUndefined();
    for (const handler of [
      NodesController.prototype.crearNodoPublic,
      NodesController.prototype.actualizarNodoPublic,
      NodesController.prototype.eliminarNodoPublic,
      NodesController.prototype.pingNodoPublic,
      NodesController.prototype.sincronizarCatalogoPublic,
    ]) {
      expect(Reflect.getMetadata('__guards__', handler)).toEqual(
        expect.arrayContaining([SupabaseAuthGuard, RolesGuard]),
      );
    }
  });

  it('rejects telemetry events outside the contract allowlist and oversized properties', async () => {
    const valid = Object.assign(new TelemetryEventDto(), {
      event_name: 'search_submitted',
      session_id: 'session-1',
      vertical: 'vuelos',
      device: 'desktop',
      properties: { origin: 'UIO' },
    });
    expect(await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);

    const invalidEvent = Object.assign(new TelemetryEventDto(), {
      ...valid,
      event_name: 'arbitrary_event',
    });
    expect(await validate(invalidEvent, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);

    const oversizedProperties = Object.assign(new TelemetryEventDto(), {
      ...valid,
      properties: { content: 'x'.repeat(9000) },
    });
    expect(await validate(oversizedProperties, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    const unexpectedProperty = Object.assign(new TelemetryEventDto(), {
      ...valid,
      unrecognized: 'not allowed',
    });
    expect(
      await validate(unexpectedProperty, { whitelist: true, forbidNonWhitelisted: true }),
    ).not.toHaveLength(0);
  });

  it('limits telemetry request body size before invoking the handler', () => {
    const interceptor = new TelemetryBodySizeInterceptor();
    const request = { body: { properties: { content: 'x'.repeat(20_000) } } };
    const next = { handle: jest.fn() };

    expectHttpStatus(
      () => interceptor.intercept(executionContext(request), next as any),
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('rate-limits telemetry and chatbot messages per requester', () => {
    process.env.SECURITY_RATE_LIMIT_ENABLED = 'true';
    process.env.TELEMETRY_RATE_LIMIT_MAX = '2';
    process.env.CHATBOT_RATE_LIMIT_MAX = '2';
    const limiter = new InMemoryRateLimitService();
    const telemetryGuard = new TelemetryRateLimitGuard(limiter);
    const chatbotGuard = new ChatbotRateLimitGuard(limiter);

    const makeRequest = (body: Record<string, unknown>) => ({
      ip: '127.0.0.1',
      headers: {},
      body,
    });
    expect(
      telemetryGuard.canActivate(executionContext(makeRequest({ session_id: 'session-one' }))),
    ).toBe(true);
    expect(
      chatbotGuard.canActivate(executionContext(makeRequest({ sessionId: 'session-one' }))),
    ).toBe(true);
    expect(
      telemetryGuard.canActivate(executionContext(makeRequest({ session_id: 'session-two' }))),
    ).toBe(true);
    expect(
      chatbotGuard.canActivate(executionContext(makeRequest({ sessionId: 'session-two' }))),
    ).toBe(true);
    expectHttpStatus(
      () => telemetryGuard.canActivate(executionContext(makeRequest({ session_id: 'same-session' }))),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expectHttpStatus(
      () => chatbotGuard.canActivate(executionContext(makeRequest({ sessionId: 'same-session' }))),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('exposes only read-only chatbot tools to anonymous visitors', () => {
    expect(HERRAMIENTAS.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining([
        'consultar_vuelos',
        'consultar_autos',
        'consultar_atracciones',
        'consultar_alojamientos',
      ]),
    );
    expect(HERRAMIENTAS.some(({ function: tool }) => /crear|cancelar|pagar|reservar/i.test(tool.name))).toBe(
      false,
    );
  });
});
