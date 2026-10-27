import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { NextFunction, Request, Response } from 'express';
import { StructuredHttpRequestMiddleware } from './structured-http-request.middleware';
import { WinstonPhysicalLoggerService } from './winston-logger.service';

describe('JSON Lines request logging', () => {
  const originalEnvironment = {
    LOG_SERVICE_NAME: process.env.LOG_SERVICE_NAME,
    LOG_RETENTION_DAYS: process.env.LOG_RETENTION_DAYS,
    LOG_TO_STDOUT: process.env.LOG_TO_STDOUT,
  };
  let temporaryDirectory: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-jsonl-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(temporaryDirectory);
    process.env.LOG_SERVICE_NAME = 'booking-test';
    delete process.env.LOG_TO_STDOUT;
    delete process.env.LOG_RETENTION_DAYS;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('writes a JSONL request record with the required structured fields', () => {
    const logger = new WinstonPhysicalLoggerService();
    const response = new EventEmitter() as Response & { statusCode: number };
    response.statusCode = 200;
    const middleware = new StructuredHttpRequestMiddleware(logger);
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/health?verbose=true',
      headers: {
        'x-correlation-id': 'corr-test-1',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        'x-node-id': 'booking-node-test',
      },
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    const logPath = path.join(
      temporaryDirectory,
      'logs',
      'booking-test',
      `${new Date().toISOString().slice(0, 10)}.jsonl`,
    );
    const [line] = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const record = JSON.parse(line);

    expect(record).toEqual(
      expect.objectContaining({
        timestamp: expect.stringMatching(/Z$/),
        level: 'info',
        service: 'booking-test',
        correlation_id: 'corr-test-1',
        trace_id: '0af7651916cd43dd8448eb211c80319c',
        span_id: 'b7ad6b7169203331',
        node_id: 'booking-node-test',
        event: 'http.request.completed',
        message: 'GET /api/v1/health',
        duration_ms: expect.any(Number),
        http: { method: 'GET', path: '/api/v1/health', status: 200 },
      }),
    );
  });

  it('never records authorization credentials, tokens, or request bodies', () => {
    const logger = new WinstonPhysicalLoggerService();
    const response = new EventEmitter() as Response & { statusCode: number };
    response.statusCode = 201;
    const middleware = new StructuredHttpRequestMiddleware(logger);
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/pagos/procesar',
      headers: {
        authorization: 'Bearer sensitive-access-token',
        'x-correlation-id': 'corr-secret-test',
        'content-type': 'application/json',
      },
      body: {
        numeroTarjeta: '4111111111111111',
        token: 'sensitive-body-token',
      },
    } as unknown as Request;

    middleware.use(request, response, jest.fn() as NextFunction);
    response.emit('finish');

    const logPath = path.join(
      temporaryDirectory,
      'logs',
      'booking-test',
      `${new Date().toISOString().slice(0, 10)}.jsonl`,
    );
    const content = fs.readFileSync(logPath, 'utf8');
    expect(content).not.toContain('sensitive-access-token');
    expect(content).not.toContain('4111111111111111');
    expect(content).not.toContain('sensitive-body-token');
    expect(content).not.toContain('authorization');
  });

  it('mirrors JSONL records to stdout only when enabled', () => {
    process.env.LOG_TO_STDOUT = 'true';
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new WinstonPhysicalLoggerService();

    logger.logRequest({
      timestamp: '2026-10-25T00:00:00.000Z',
      level: 'info',
      service: 'booking-test',
      correlation_id: 'corr-stdout',
      trace_id: '',
      span_id: '',
      node_id: '',
      event: 'http.request.completed',
      message: 'GET /api/v1/health',
      duration_ms: 1,
      http: { method: 'GET', path: '/api/v1/health', status: 200 },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"correlation_id":"corr-stdout"'));
    stdoutSpy.mockRestore();
  });

  it('keeps existing audit readers working with the new daily JSONL files', () => {
    const logger = new WinstonPhysicalLoggerService();
    logger.logAudit('NODE_UPDATED', { actor_email: 'admin@example.com' }, 'corr-audit');

    expect(logger.getRecentAuditLogs(1)).toEqual([
      expect.objectContaining({
        event: 'NODE_UPDATED',
        correlation_id: 'corr-audit',
        payload: { actor_email: 'admin@example.com' },
      }),
    ]);
  });

  it('removes expired daily files using the configured retention period', () => {
    process.env.LOG_RETENTION_DAYS = '14';
    const serviceDirectory = path.join(temporaryDirectory, 'logs', 'booking-test');
    fs.mkdirSync(serviceDirectory, { recursive: true });
    fs.writeFileSync(path.join(serviceDirectory, '2020-01-01.jsonl'), '{}\n');
    fs.writeFileSync(path.join(serviceDirectory, '2020-01-02.jsonl'), '{}\n');
    const logger = new WinstonPhysicalLoggerService();

    logger.logRequest({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'booking-test',
      correlation_id: 'corr-retention',
      trace_id: '',
      span_id: '',
      node_id: '',
      event: 'http.request.completed',
      message: 'GET /api/v1/health',
      duration_ms: 1,
      http: { method: 'GET', path: '/api/v1/health', status: 200 },
    });

    expect(fs.existsSync(path.join(serviceDirectory, '2020-01-01.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(serviceDirectory, '2020-01-02.jsonl'))).toBe(false);
  });

  it('prints correlation records from all service files in timestamp order', () => {
    const logsDirectory = path.join(temporaryDirectory, 'logs');
    for (const service of ['booking-a', 'booking-b']) {
      const serviceDirectory = path.join(logsDirectory, service);
      fs.mkdirSync(serviceDirectory, { recursive: true });
      const entries =
        service === 'booking-a'
          ? [{ timestamp: '2026-10-25T10:00:02.000Z', correlation_id: 'corr-trace', event: 'second' }]
          : [{ timestamp: '2026-10-25T10:00:01.000Z', correlation_id: 'corr-trace', event: 'first' }];
      fs.writeFileSync(path.join(serviceDirectory, '2026-10-25.jsonl'), `${JSON.stringify(entries[0])}\n`);
    }

    const script = path.resolve(__dirname, '../../../scripts/logs/trace.js');
    const output = execFileSync(process.execPath, [script, 'corr-trace'], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
    });

    expect(output.indexOf('"event":"first"')).toBeLessThan(output.indexOf('"event":"second"'));
  });
});
