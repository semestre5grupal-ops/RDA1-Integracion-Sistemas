import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { hostname } from 'os';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
  nodeId: string;
  userId?: string;
  userRoles?: string[];
}

const TRACEPARENT_V00 = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

@Injectable()
export class TraceContextService {
  private readonly storage = new AsyncLocalStorage<TraceContext>();
  private readonly instrumentedClients = new WeakSet<AxiosInstance>();

  run<T>(context: TraceContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  current(): TraceContext | undefined {
    return this.storage.getStore();
  }

  createContext(correlationId?: string, traceparent?: string): TraceContext {
    const match = typeof traceparent === 'string' ? TRACEPARENT_V00.exec(traceparent) : null;
    const validTraceparent =
      match && !/^0{32}$/.test(match[1]) && !/^0{16}$/.test(match[2]) ? match : null;

    return {
      correlationId: correlationId || this.newCorrelationId(),
      traceId: validTraceparent?.[1] ?? randomBytes(16).toString('hex'),
      spanId: this.newSpanId(),
      parentSpanId: validTraceparent?.[2],
      traceFlags: validTraceparent?.[3] ?? '01',
      nodeId: process.env.NODE_ID?.trim() || hostname(),
    };
  }

  traceparent(context: TraceContext, spanId = context.spanId): string {
    return `00-${context.traceId}-${spanId}-${context.traceFlags}`;
  }

  outgoingHeaders(correlationId?: string, includeIdentity = false): Record<string, string> {
    const current = this.current();
    const context = current ?? this.createContext(correlationId);
    const spanId = this.newSpanId();
    const headers: Record<string, string> = {
      'X-Correlation-Id': current?.correlationId || correlationId || context.correlationId,
      traceparent: this.traceparent(context, spanId),
      node_id: context.nodeId,
    };
    if (includeIdentity && context.userId) headers['X-User-Id'] = context.userId;
    if (includeIdentity && context.userRoles?.length) {
      headers['X-User-Roles'] = context.userRoles.join(',');
    }
    return headers;
  }

  createCloudEvent<T>(type: string, source: string, data: T) {
    const context = this.current() ?? this.createContext();
    const spanId = this.newSpanId();
    return {
      specversion: '1.0' as const,
      id: randomUUID(),
      source,
      type,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      correlationid: context.correlationId,
      traceparent: this.traceparent(context, spanId),
      tracestate: '',
      node_id: context.nodeId,
      data,
    };
  }

  instrumentAxios(client: AxiosInstance | undefined, includeIdentity = false): void {
    if (!client || this.instrumentedClients.has(client)) return;
    this.instrumentedClients.add(client);

    client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const correlationId = config.headers.get('X-Correlation-Id');
      const headers = this.outgoingHeaders(
        typeof correlationId === 'string' ? correlationId : undefined,
        includeIdentity,
      );
      for (const [name, value] of Object.entries(headers)) {
        config.headers.set(name, value);
      }
      return config;
    });
  }

  private newCorrelationId(): string {
    return `corr-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  private newSpanId(): string {
    let spanId = randomBytes(8).toString('hex');
    while (/^0{16}$/.test(spanId)) spanId = randomBytes(8).toString('hex');
    return spanId;
  }
}
