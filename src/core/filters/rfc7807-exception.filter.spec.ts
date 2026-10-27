import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Rfc7807ExceptionFilter } from './rfc7807-exception.filter';

describe('Rfc7807ExceptionFilter tracing fields', () => {
  it('includes the request correlation ID and a UTC timestamp', () => {
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json,
    };
    const request = {
      method: 'GET',
      url: '/api/v1/autos',
      headers: { 'x-correlation-id': 'corr-test-123' },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    new Rfc7807ExceptionFilter().catch(new BadRequestException('invalid'), host as any);

    const problem = json.mock.calls[0][0];
    expect(problem.correlation_id).toBe('corr-test-123');
    expect(problem.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(problem.timestamp))).toBe(false);
  });

  it('includes the request correlation ID in 5xx responses', () => {
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json,
    };
    const request = {
      method: 'GET',
      url: '/api/v1/autos',
      headers: { 'x-correlation-id': 'corr-server-error' },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    new Rfc7807ExceptionFilter().catch(
      new InternalServerErrorException('server error'),
      host as any,
    );

    expect(json.mock.calls[0][0].correlation_id).toBe('corr-server-error');
  });
});
