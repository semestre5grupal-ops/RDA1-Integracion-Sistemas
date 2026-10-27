import { createHmac } from 'crypto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WebhookEntrega } from './entities/webhook-entrega.entity';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const previousSecret = process.env.WEBHOOK_SECRET_VUELOS;
  let deliveries: WebhookEntrega[];
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
  };
  let eventBus: { publish: jest.Mock };
  let logger: { logAudit: jest.Mock };
  let service: WebhooksService;

  const event = {
    specversion: '1.0',
    id: '7b8c9d0e-1f2a-4b3c-9d0e-1f2a3b4c5d6e',
    source: 'https://vuelos.booking.epn.edu.ec',
    type: 'booking.ticket_issued',
    time: '2026-10-25T12:00:00.000Z',
    datacontenttype: 'application/json',
    correlationid: 'corr-123',
    traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    data: { reserva_id: 'VUE-1' },
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const sign = (body = rawBody) =>
    `sha256=${createHmac('sha256', 'test-webhook-secret-with-enough-entropy').update(body).digest('hex')}`;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET_VUELOS = 'test-webhook-secret-with-enough-entropy';
    deliveries = [];
    repository = {
      create: jest.fn((data: Partial<WebhookEntrega>) => ({
        id: `delivery-${deliveries.length + 1}`,
        receivedAt: new Date('2026-10-25T12:01:00.000Z'),
        ...data,
      })),
      save: jest.fn(async (delivery: WebhookEntrega) => {
        const index = deliveries.findIndex((existing) => existing.id === delivery.id);
        if (index === -1) deliveries.push(delivery);
        else deliveries[index] = delivery;
        return delivery;
      }),
      findOne: jest.fn(async ({ where }: { where: Partial<WebhookEntrega> }) =>
        deliveries.find((delivery) =>
          Object.entries(where).every(([key, value]) => delivery[key as keyof WebhookEntrega] === value),
        ) ?? null,
      ),
      find: jest.fn(async ({
        where,
        skip = 0,
        take,
      }: {
        where?: Partial<WebhookEntrega>;
        skip?: number;
        take?: number;
      }) => {
        const matches = deliveries.filter((delivery) =>
          Object.entries(where || {}).every(([key, value]) => delivery[key as keyof WebhookEntrega] === value),
        );
        return matches.slice(skip, take === undefined ? undefined : skip + take);
      }),
      count: jest.fn(async ({ where }: { where?: Partial<WebhookEntrega> }) =>
        deliveries.filter((delivery) =>
          Object.entries(where || {}).every(([key, value]) => delivery[key as keyof WebhookEntrega] === value),
        ).length,
      ),
    };
    eventBus = { publish: jest.fn().mockResolvedValue(true) };
    logger = { logAudit: jest.fn() };
    service = new WebhooksService(repository as never, eventBus as never, logger as never);
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.WEBHOOK_SECRET_VUELOS;
    else process.env.WEBHOOK_SECRET_VUELOS = previousSecret;
  });

  it('accepts a signed CloudEvent and queues it asynchronously', async () => {
    const response = await service.receive('vuelos', rawBody, sign(), event, 'application/cloudevents+json');

    expect(response.status).toBe('ACCEPTED');
    expect(repository.save).toHaveBeenCalledTimes(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(eventBus.publish).toHaveBeenCalledWith(
      'booking.webhooks.inbound.vuelos',
      expect.objectContaining({ id: event.id, type: event.type }),
    );
  });

  it('rejects an invalid signature before persisting the delivery', async () => {
    await expect(service.receive('vuelos', rawBody, sign(Buffer.from('different')), event, 'application/cloudevents+json'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('replays duplicate event IDs without queueing them twice', async () => {
    const first = await service.receive('vuelos', rawBody, sign(), event, 'application/cloudevents+json');
    await new Promise<void>((resolve) => setImmediate(resolve));
    const duplicate = await service.receive('vuelos', rawBody, sign(), event, 'application/cloudevents+json');

    expect(first.status).toBe('ACCEPTED');
    expect(duplicate.status).toBe('DEDUPLICATED');
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown verticals and invalid CloudEvents', async () => {
    await expect(service.receive('cruceros', rawBody, sign(), event, 'application/cloudevents+json')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.receive('vuelos', rawBody, sign(), { ...event, specversion: '0.3' }, 'application/cloudevents+json'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payloads larger than one megabyte', async () => {
    const oversized = Buffer.alloc(1024 * 1024 + 1);
    await expect(service.receive('vuelos', oversized, sign(oversized), event, 'application/cloudevents+json'))
      .rejects.toMatchObject({ status: 413 });
  });

  it('lists deliveries with a limit and cursor and rejects malformed cursors', async () => {
    const secondEvent = { ...event, id: '7b8c9d0e-1f2a-4b3c-9d0e-1f2a3b4c5d7e' };
    const secondRawBody = Buffer.from(JSON.stringify(secondEvent));
    await service.receive('vuelos', rawBody, sign(), event, 'application/cloudevents+json');
    await service.receive(
      'vuelos',
      secondRawBody,
      sign(secondRawBody),
      secondEvent,
      'application/cloudevents+json',
    );

    const firstPage = await service.listDeliveries('vuelos', { limit: 1 });
    const secondPage = await service.listDeliveries('vuelos', {
      limit: 1,
      cursor: firstPage.next_cursor || undefined,
    });

    expect(firstPage.total).toBe(2);
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.next_cursor).toMatch(/^cur_/);
    expect(secondPage.data).toHaveLength(1);
    await expect(service.listDeliveries('vuelos', { limit: 50, cursor: 'invalid' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
