import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TraceContextService } from './trace-context.service';

@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  constructor(private readonly traceContext: TraceContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const correlationHeader = request.headers['x-correlation-id'];
    const traceparentHeader = request.headers.traceparent;
    const correlationId =
      typeof correlationHeader === 'string' && correlationHeader.trim()
        ? correlationHeader.trim()
        : undefined;
    const traceparent =
      typeof traceparentHeader === 'string' ? traceparentHeader : undefined;
    const context = this.traceContext.createContext(correlationId, traceparent);

    request.headers['x-correlation-id'] = context.correlationId;
    request.headers.traceparent = this.traceContext.traceparent(context);
    request.headers.node_id = context.nodeId;
    response.setHeader('X-Correlation-Id', context.correlationId);
    response.setHeader('traceparent', this.traceContext.traceparent(context));
    response.setHeader('node_id', context.nodeId);

    this.traceContext.run(context, next);
  }
}
