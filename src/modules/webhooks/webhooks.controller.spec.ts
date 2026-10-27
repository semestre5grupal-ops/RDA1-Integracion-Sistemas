import { VersioningType } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Request } from 'express';
import request = require('supertest');
import { InMemoryRateLimitService } from '../../core/security/in-memory-rate-limit.service';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { RolesGuard } from '../../core/guards/roles.guard';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RabbitMqEventBusService } from '../event-bus/rabbitmq/rabbitmq-event-bus.service';
import { WebhookEntrega } from './entities';
import { WebhooksController } from './webhooks.controller';
import { WebhooksRateLimitGuard } from './webhooks-rate-limit.guard';
import { WebhooksService } from './webhooks.service';
import { crearValidationPipeGlobal } from '../../core/validation/validation-pipe';

describe('WebhooksController', () => {
  const previousSecret = process.env.WEBHOOK_SECRET_VUELOS;
  const secret = 'test-webhook-secret-with-enough-entropy';
  const cloudEvent = {
    specversion: '1.0',
    id: '7b8c9d0e-1f2a-4b3c-9d0e-1f2a3b4c5d6e',
    source: 'https://vuelos.booking.epn.edu.ec',
    type: 'booking.ticket_issued',
    time: '2026-10-25T12:00:00.000Z',
    datacontenttype: 'application/json',
    correlationid: 'corr-http-123',
    data: { reserva_id: 'VUE-HTTP-1' },
  };
  let app: NestExpressApplication;
  let storedDeliveries: WebhookEntrega[];
  let eventBus: { publish: jest.Mock };

  const bodyFor = (event: Record<string, unknown>, spaces = false): string =>
    spaces ? JSON.stringify(event, null, 2) : JSON.stringify(event);
  const signatureFor = (rawBody: string): string =>
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_VUELOS = secret;
    storedDeliveries = [];
    const repository = {
      create: jest.fn((data: Partial<WebhookEntrega>) => ({
        id: `delivery-${storedDeliveries.length + 1}`,
        receivedAt: new Date('2026-10-25T12:01:00.000Z'),
        ...data,
      })),
      save: jest.fn(async (delivery: WebhookEntrega) => {
        const index = storedDeliveries.findIndex((existing) => existing.id === delivery.id);
        if (index === -1) storedDeliveries.push(delivery);
        else storedDeliveries[index] = delivery;
        return delivery;
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<WebhookEntrega> }) =>
        storedDeliveries.find((delivery) =>
          Object.entries(where).every(([key, value]) => delivery[key as keyof WebhookEntrega] === value),
        ) ?? null,
      ),
      find: jest.fn(async () => storedDeliveries),
      count: jest.fn(async () => storedDeliveries.length),
    };
    eventBus = { publish: jest.fn().mockResolvedValue(true) };
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        WebhooksRateLimitGuard,
        InMemoryRateLimitService,
        SupabaseAuthGuard,
        RolesGuard,
        { provide: getRepositoryToken(WebhookEntrega), useValue: repository },
        { provide: RabbitMqEventBusService, useValue: eventBus },
        { provide: WinstonPhysicalLoggerService, useValue: { logAudit: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.useBodyParser('json', {
      limit: '5mb',
      type: ['application/json', 'application/cloudevents+json'],
      verify: (request: Request, _response: unknown, buffer: Buffer) => {
        if (/^\/api\/v2\/webhooks(?:\/|\?|$)/.test(request.url || '')) {
          (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        }
      },
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: ['1', '2'],
      prefix: 'v',
    });
    app.useGlobalPipes(crearValidationPipeGlobal());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.WEBHOOK_SECRET_VUELOS;
    else process.env.WEBHOOK_SECRET_VUELOS = previousSecret;
  });

  beforeEach(() => {
    storedDeliveries.length = 0;
    eventBus.publish.mockClear();
  });

  it('accepts a valid raw-body HMAC CloudEvent with 202', async () => {
    const rawBody = bodyFor(cloudEvent, true);
    const response = await request(app.getHttpServer())
      .post('/api/v2/webhooks/vuelos')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(202);
    expect(response.body.event_id).toBe(cloudEvent.id);
    expect(response.body).not.toHaveProperty('replayed');
  });

  it('rejects an invalid signature with 401', async () => {
    const rawBody = bodyFor(cloudEvent);
    const response = await request(app.getHttpServer())
      .post('/api/v2/webhooks/vuelos')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(`${rawBody} `))
      .send(rawBody);

    expect(response.status).toBe(401);
  });

  it('returns 200 and the replay header for duplicate event IDs', async () => {
    const rawBody = bodyFor(cloudEvent);
    const sendEvent = () => request(app.getHttpServer())
      .post('/api/v2/webhooks/vuelos')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(rawBody))
      .send(rawBody);

    expect((await sendEvent()).status).toBe(202);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const replay = await sendEvent();

    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for unknown verticals and 400 for non-CloudEvents', async () => {
    const rawBody = bodyFor(cloudEvent);
    const unknownVertical = await request(app.getHttpServer())
      .post('/api/v2/webhooks/cruceros')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(rawBody))
      .send(rawBody);
    expect(unknownVertical.status).toBe(404);

    const invalidEvent = { ...cloudEvent, specversion: '0.3' };
    const invalidRawBody = bodyFor(invalidEvent);
    const invalidCloudEvent = await request(app.getHttpServer())
      .post('/api/v2/webhooks/vuelos')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(invalidRawBody))
      .send(invalidRawBody);
    expect(invalidCloudEvent.status).toBe(400);
  });

  it('returns 413 when the raw body exceeds one megabyte', async () => {
    const largeEvent = { ...cloudEvent, data: { payload: 'x'.repeat(1024 * 1024) } };
    const rawBody = bodyFor(largeEvent);
    const response = await request(app.getHttpServer())
      .post('/api/v2/webhooks/vuelos')
      .set('Content-Type', 'application/cloudevents+json')
      .set('X-Webhook-Signature', signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(413);
  });

  it('restricts delivery history to administrators', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v2/webhooks/vuelos/entregas?limit=10')
      .set('X-Role', 'admin');
    const denied = await request(app.getHttpServer())
      .get('/api/v2/webhooks/vuelos/entregas?limit=10')
      .set('X-Role', 'CLIENTE');

    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ vertical: 'vuelos', data: [] });
    expect(denied.status).toBe(403);
  });
});
