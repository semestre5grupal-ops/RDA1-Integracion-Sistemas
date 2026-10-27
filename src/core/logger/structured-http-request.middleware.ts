import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as os from 'os';
import { WinstonPhysicalLoggerService } from './winston-logger.service';

interface RequestWithNode extends Request {
  node_id?: string;
}

@Injectable()
export class StructuredHttpRequestMiddleware implements NestMiddleware {
  constructor(private readonly logger: WinstonPhysicalLoggerService) {}

  use(request: RequestWithNode, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const traceparent = headerValue(request.headers.traceparent);
    const trace = traceparent?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i);
    const correlationId =
      headerValue(request.headers['x-correlation-id']) || 'correlation-id-missing';
    const httpPath = (request.originalUrl || request.url || '/').split('?')[0];

    response.on('finish', () => {
      const statusCode = response.statusCode;
      const failed = statusCode >= 400;
      const message = `${request.method} ${httpPath}`;
      this.logger.logRequest({
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'error' : failed ? 'warn' : 'info',
        service: process.env.LOG_SERVICE_NAME || 'booking-gateway',
        correlation_id: correlationId,
        trace_id: trace?.[1] || '',
        span_id: trace?.[2] || '',
        node_id:
          safeHeader(request.headers['x-node-id']) ||
          request.node_id ||
          os.hostname(),
        event: 'http.request.completed',
        event_received: message,
        message,
        duration_ms: Math.max(0, Date.now() - startedAt),
        status: failed ? 'failed' : 'processed',
        http: {
          method: request.method,
          path: httpPath,
          status: statusCode,
        },
        ...(failed
          ? { error: { name: 'HttpRequestError', message: `HTTP ${statusCode}` } }
          : {}),
      });
    });

    next();
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeHeader(value: string | string[] | undefined): string {
  const header = headerValue(value);
  return header ? header.slice(0, 128) : '';
}
