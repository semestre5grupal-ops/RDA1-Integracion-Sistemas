import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentReferenceAccessGuard } from './payment-reference-access.guard';
import { SesionSupabaseService } from '../../../core/auth/sesion-supabase.service';

describe('PaymentReferenceAccessGuard', () => {
  const previousStoreKeys = process.env.PAGOS_STORE_API_KEYS;
  let session: { obtenerUsuario: jest.Mock };
  let guard: PaymentReferenceAccessGuard;

  const contextFor = (headers: Record<string, string>) => {
    const request: Record<string, unknown> = { headers };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext,
    };
  };

  beforeEach(() => {
    process.env.PAGOS_STORE_API_KEYS = 'store-1=store-api-key-which-is-long-enough';
    session = { obtenerUsuario: jest.fn() };
    guard = new PaymentReferenceAccessGuard(session as never);
  });

  afterAll(() => {
    if (previousStoreKeys === undefined) delete process.env.PAGOS_STORE_API_KEYS;
    else process.env.PAGOS_STORE_API_KEYS = previousStoreKeys;
  });

  it('authenticates a store API key and associates it with the configured carrito id', async () => {
    const { context, request } = contextFor({ 'x-api-key': 'store-api-key-which-is-long-enough' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.paymentReferenceAccess).toEqual({ type: 'store', carritoId: 'store-1' });
    expect(session.obtenerUsuario).not.toHaveBeenCalled();
  });

  it('rejects an invalid API key without falling back to an unrelated identity', async () => {
    const { context } = contextFor({ 'x-api-key': 'invalid-store-api-key-which-is-long' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(session.obtenerUsuario).not.toHaveBeenCalled();
  });

  it('accepts SERVICE identity and rejects a regular client identity', async () => {
    const serviceContext = contextFor({ authorization: 'Bearer service-token' });
    session.obtenerUsuario.mockResolvedValue({ app_metadata: { role: 'SERVICE' } });
    await expect(guard.canActivate(serviceContext.context)).resolves.toBe(true);
    expect(serviceContext.request.paymentReferenceAccess).toEqual({ type: 'staff' });

    const customerContext = contextFor({ authorization: 'Bearer customer-token' });
    session.obtenerUsuario.mockResolvedValue({ app_metadata: { role: 'CLIENTE' } });
    await expect(guard.canActivate(customerContext.context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
