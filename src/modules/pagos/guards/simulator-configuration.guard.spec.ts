import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SimulatorConfigurationGuard } from './simulator-configuration.guard';
import { SesionSupabaseService } from '../../../core/auth/sesion-supabase.service';

describe('SimulatorConfigurationGuard', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  let session: { obtenerUsuario: jest.Mock };
  let guard: SimulatorConfigurationGuard;

  const contextFor = (authorization?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  }) as ExecutionContext;

  beforeEach(() => {
    session = { obtenerUsuario: jest.fn() };
    guard = new SimulatorConfigurationGuard(session as never);
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('preserves the existing development workflow', async () => {
    process.env.NODE_ENV = 'test';
    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
  });

  it('requires an authenticated administrator in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException);

    session.obtenerUsuario.mockResolvedValue({ email: 'admin@booking.com' });
    await expect(guard.canActivate(contextFor('Bearer admin-token'))).resolves.toBe(true);

    session.obtenerUsuario.mockResolvedValue({ app_metadata: { role: 'CLIENTE' } });
    await expect(guard.canActivate(contextFor('Bearer client-token'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
