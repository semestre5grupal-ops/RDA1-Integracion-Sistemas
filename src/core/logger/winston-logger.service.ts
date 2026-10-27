import { Injectable, LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface StructuredLogRecord {
  timestamp: string;
  level: string;
  service: string;
  correlation_id: string;
  trace_id: string;
  span_id: string;
  node_id: string;
  event: string;
  event_received?: string;
  message: string;
  duration_ms: number;
  http: {
    method: string;
    path: string;
    status: number;
  };
  status?: 'received' | 'processed' | 'failed' | 'retrying' | 'compensated';
  error?: {
    name: string;
    message: string;
  };
  [key: string]: unknown;
}

const SENSITIVE_FIELD =
  /authorization|access.?token|refresh.?token|password|secret|api.?key|private.?key|card.?number|credit.?card|cvv|cvc|security.?code/i;
const CARD_NUMBER = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
const BEARER_TOKEN = /\bBearer\s+\S+/gi;

@Injectable()
export class WinstonPhysicalLoggerService implements LoggerService {
  private readonly logsDirectory = path.resolve(process.cwd(), 'logs');
  private readonly serviceName = (process.env.LOG_SERVICE_NAME || 'booking-gateway')
    .replace(/[^A-Za-z0-9._-]/g, '_');

  logRequest(record: StructuredLogRecord): void {
    this.writeRecord(record);
  }

  logAudit(event: string, payload: unknown, correlationId?: string): void {
    const timestamp = new Date().toISOString();
    const level = event === 'ERROR' ? 'error' : event === 'WARN' ? 'warn' : 'info';
    this.writeRecord({
      timestamp,
      level,
      service: this.serviceName,
      event,
      event_received: event,
      correlation_id: correlationId || `auto-${Date.now()}`,
      trace_id: '',
      span_id: '',
      node_id: os.hostname(),
      status: level === 'error' ? 'failed' : 'processed',
      message: event,
      duration_ms: 0,
      http: { method: '', path: '', status: 0 },
      type: 'AUDIT',
      payload: redact(payload),
    });
  }

  logIntegration(
    serviceName: string,
    operation: string,
    statusCode: number,
    latencyMs: number,
    details?: unknown,
  ): void {
    const timestamp = new Date().toISOString();
    this.writeRecord({
      timestamp,
      level: statusCode >= 500 ? 'error' : 'info',
      service: this.serviceName,
      event: operation,
      event_received: operation,
      correlation_id: `integration-${Date.now()}`,
      trace_id: '',
      span_id: '',
      node_id: os.hostname(),
      status: statusCode >= 500 ? 'failed' : 'processed',
      message: `${serviceName} ${operation}`,
      duration_ms: latencyMs,
      http: { method: '', path: '', status: statusCode },
      type: 'INTEGRATION',
      integration: {
        service: serviceName,
        status_code: statusCode,
        details: redact(details || {}),
      },
    });
  }

  getRecentAuditLogs(limit = 300): Array<Record<string, any>> {
    const serviceDirectory = path.join(this.logsDirectory, this.serviceName);
    if (!fs.existsSync(serviceDirectory)) return [];

    const files = fs.readdirSync(serviceDirectory)
      .filter(file => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
      .sort()
      .reverse();
    const entries: Array<Record<string, any>> = [];

    for (const file of files) {
      if (entries.length >= limit) break;
      const content = fs.readFileSync(path.join(serviceDirectory, file), 'utf8');
      for (const line of content.split('\n').reverse()) {
        if (!line.trim()) continue;
        const record = JSON.parse(line) as Record<string, any>;
        if (record.type !== 'AUDIT') continue;
        entries.push(record);
        if (entries.length >= limit) break;
      }
    }
    return entries;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logAudit('INFO', { message, params: optionalParams });
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logAudit('ERROR', { message, params: optionalParams });
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logAudit('WARN', { message, params: optionalParams });
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    this.logAudit('DEBUG', { message, params: optionalParams });
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    this.logAudit('VERBOSE', { message, params: optionalParams });
  }

  private writeRecord(record: StructuredLogRecord): void {
    const safeRecord = redact(record) as StructuredLogRecord;
    const logLine = `${JSON.stringify(safeRecord)}\n`;
    const date = safeRecord.timestamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('El timestamp del log debe ser una fecha ISO 8601 UTC.');
    }

    const serviceDirectory = path.join(this.logsDirectory, this.serviceName);
    fs.mkdirSync(serviceDirectory, { recursive: true });
    this.removeExpiredFiles(serviceDirectory, new Date());
    fs.appendFileSync(path.join(serviceDirectory, `${date}.jsonl`), logLine, 'utf8');
    if (process.env.LOG_TO_STDOUT?.toLowerCase() === 'true') {
      process.stdout.write(logLine);
    }
  }

  private removeExpiredFiles(serviceDirectory: string, now: Date): void {
    const configuredDays = Number(process.env.LOG_RETENTION_DAYS);
    const retentionDays =
      Number.isSafeInteger(configuredDays) && configuredDays > 0 ? configuredDays : 14;
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

    for (const file of fs.readdirSync(serviceDirectory)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
      const fileDate = Date.parse(`${file.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isFinite(fileDate) && fileDate < cutoff) {
        fs.unlinkSync(path.join(serviceDirectory, file));
      }
    }
  }
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(BEARER_TOKEN, 'Bearer [REDACTED]').replace(CARD_NUMBER, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_FIELD.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}
