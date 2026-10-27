import { ExecutionContext, HttpException } from '@nestjs/common';
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';
import { WebhooksRateLimitGuard } from './webhooks-rate-limit.guard';

describe('WebhooksRateLimitGuard', () => {
  const previousLimit = process.env.WEBHOOK_RATE_LIMIT_MAX;
  let response: { setHeader: jest.Mock };
  let context: ExecutionContext;

  beforeEach(() => {
    process.env.WEBHOOK_RATE_LIMIT_MAX = '1';
    response = { setHeader: jest.fn() };
    const request = { ip: '192.0.2.10', params: { vertical: 'vuelos' } };
    context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
  });

  afterAll(() => {
    if (previousLimit === undefined) delete process.env.WEBHOOK_RATE_LIMIT_MAX;
    else process.env.WEBHOOK_RATE_LIMIT_MAX = previousLimit;
  });

  it('allows requests within the configured rate and returns 429 with Retry-After when exceeded', () => {
    const guard = new WebhooksRateLimitGuard(new InMemoryRateLimitService());

    expect(guard.canActivate(context)).toBe(true);
    try {
      guard.canActivate(context);
      throw new Error('Expected the rate limit to reject the second request.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
