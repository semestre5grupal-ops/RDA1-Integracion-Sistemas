import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';

import { EsbController } from '../../src/modules/esb/esb.controller';
import { SagaOrchestratorService } from '../../src/modules/esb/interna/saga-orchestrator.service';
import { EsbInternalRouterService } from '../../src/modules/esb/interna/esb-internal-router.service';
import { SagaTransaccion, SagaPasoJournal } from '../../src/modules/esb/entities';

import { WebhooksController } from '../../src/modules/webhooks/webhooks.controller';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { WebhookEntrega } from '../../src/modules/webhooks/entities';
import { WebhooksRateLimitGuard } from '../../src/modules/webhooks/webhooks-rate-limit.guard';
import { RabbitMqEventBusService } from '../../src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service';

import { NodesController } from '../../src/modules/nodes/nodes.controller';
import { NodesService } from '../../src/modules/nodes/nodes.service';
import { ConnectorHealthService } from '../../src/modules/admin/connector-health.service';
import { ConfigProveedor } from '../../src/modules/nodes/entities';
import { Atraccion } from '../../src/modules/atracciones/entities/atraccion.entity';

import { WinstonPhysicalLoggerService } from '../../src/core/logger/winston-logger.service';
import { SupabaseAuthGuard } from '../../src/core/guards/supabase-auth.guard';
import { RolesGuard } from '../../src/core/guards/roles.guard';

describe('Suites de Pruebas End-to-End (E2E) Trazadas a Casos de Prueba (CP-001 a CP-013)', () => {
  let app: NestExpressApplication;

  const mockWebhookDeliveries: any[] = [];
  const mockWebhookRepo = {
    create: jest.fn((dto) => ({ id: `wh-${Date.now()}-${Math.random()}`, ...dto })),
    save: jest.fn(async (entity) => {
      mockWebhookDeliveries.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }) => {
      return (
        mockWebhookDeliveries.find((d) =>
          Object.entries(where).every(([k, v]) => d[k] === v),
        ) || null
      );
    }),
  };

  const mockConfigNodes: any[] = [
    {
      id: 'atracciones',
      codigoNodo: 'NODE_ATR_DILAN',
      nombreProveedor: 'Atracciones Dilan',
      vertical: 'ATRACCIONES',
      tipo: 'REST',
      baseUrlRest: 'http://localhost:3000/api/v2/atracciones',
      activo: true,
      killSwitchActivo: false,
      healthStatus: 'HEALTHY',
      circuitBreakerEstado: 'CLOSED',
      consecutiveFailures: 0,
      totalCalls: 10,
      totalFailures: 0,
      lastLatencyMs: 30,
      updatedAt: new Date(),
    },
    {
      id: 'autos',
      codigoNodo: 'NODE_AUT_DILAN',
      nombreProveedor: 'Autos Dilan',
      vertical: 'AUTOS',
      tipo: 'REST',
      baseUrlRest: 'http://localhost:3000/api/v2/autos',
      activo: true,
      killSwitchActivo: false,
      healthStatus: 'HEALTHY',
      circuitBreakerEstado: 'CLOSED',
      consecutiveFailures: 0,
      totalCalls: 8,
      totalFailures: 0,
      lastLatencyMs: 25,
      updatedAt: new Date(),
    },
  ];

  const mockConfigRepo = {
    find: jest.fn(async () => [...mockConfigNodes]),
    count: jest.fn(async () => mockConfigNodes.length),
    findOne: jest.fn(async (q) => {
      const codeOrId = q?.where?.[0]?.codigoNodo || q?.where?.codigoNodo;
      if (codeOrId) {
        return (
          mockConfigNodes.find(
            (n) => n.codigoNodo === codeOrId || n.id === codeOrId,
          ) || null
        );
      }
      const vertical = q?.where?.vertical;
      if (vertical) {
        return (
          mockConfigNodes.find((n) => n.vertical === vertical) || null
        );
      }
      return null;
    }),
    create: jest.fn((dto) => dto),
    save: jest.fn(async (entity) => {
      const idx = mockConfigNodes.findIndex(
        (n) => n.codigoNodo === entity.codigoNodo || n.id === entity.id,
      );
      if (idx >= 0) {
        mockConfigNodes[idx] = { ...mockConfigNodes[idx], ...entity };
        return mockConfigNodes[idx];
      }
      mockConfigNodes.push(entity);
      return entity;
    }),
  };

  const mockSagaRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
  };

  const mockLogger = {
    logAudit: jest.fn(),
    logIntegration: jest.fn(),
    logError: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockEventBus = {
    publish: jest.fn().mockResolvedValue(true),
  };

  const WEBHOOK_SECRET = 'test-e2e-webhook-secret-with-sufficient-entropy-32b';

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_VUELOS = WEBHOOK_SECRET;
    process.env.SAGA_STORE = 'memory';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EsbController, WebhooksController, NodesController],
      providers: [
        SagaOrchestratorService,
        EsbInternalRouterService,
        WebhooksService,
        NodesService,
        ConnectorHealthService,
        SupabaseAuthGuard,
        RolesGuard,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            axiosRef: { interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } },
            get: jest.fn(),
            post: jest.fn(),
          },
        },
        { provide: WinstonPhysicalLoggerService, useValue: mockLogger },
        { provide: getRepositoryToken(SagaTransaccion), useValue: mockSagaRepo },
        { provide: getRepositoryToken(SagaPasoJournal), useValue: mockSagaRepo },
        { provide: getRepositoryToken(WebhookEntrega), useValue: mockWebhookRepo },
        { provide: getRepositoryToken(ConfigProveedor), useValue: mockConfigRepo },
        { provide: getRepositoryToken(Atraccion), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: 'IEventBusService', useValue: mockEventBus },
        { provide: RabbitMqEventBusService, useValue: mockEventBus },
      ],
    })
      .overrideGuard(WebhooksRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();

    // Parser con soporte para rawBody en webhooks
    app.useBodyParser('json', {
      type: ['application/json', 'application/cloudevents+json'],
      verify: (req: any, _res: any, buffer: Buffer) => {
        req.rawBody = Buffer.from(buffer);
      },
    });

    // Middleware de trazabilidad distribuida
    app.use((req: any, res: any, next: any) => {
      const correlationId =
        req.headers['x-correlation-id'] ||
        `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      req.headers['x-correlation-id'] = correlationId;
      res.setHeader('X-Correlation-Id', correlationId);

      const traceparent =
        req.headers['traceparent'] ||
        `00-${Date.now().toString(16).padStart(32, '0')}-${Math.random().toString(16).substring(2, 18).padStart(16, '0')}-01`;
      req.headers['traceparent'] = traceparent;
      res.setHeader('traceparent', traceparent);

      next();
    });

    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: ['1', '2'],
      prefix: 'v',
    });

    await app.init();
  });

  afterAll(async () => {
    delete process.env.WEBHOOK_SECRET_VUELOS;
    if (app) {
      await app.close();
    }
  });

  describe('CP-001: Saga Feliz — Compra Compuesta Multivertical Exitosa', () => {
    it('CP-001: Ejecuta checkout saga multivertical completando todos los pasos con HTTP 200/201', async () => {
      const payload = {
        cliente_email: 'turista.e2e@booking.com',
        cliente_nombre: 'María Dolores E2E',
        metodo_pago: 'TARJETA_SIMULADA',
        numero_tarjeta: '4111111111111111',
        items: [
          {
            vertical: 'ATRACCIONES',
            item_id: 'PRhu4UBTWPBC',
            nombre: 'Tour Teleférico Quito',
            cantidad: 2,
            precio_unitario: 30.0,
          },
          {
            vertical: 'AUTOS',
            item_id: 'auto-sedan-01',
            nombre: 'Chevrolet Sail 2024',
            cantidad: 1,
            precio_unitario: 45.0,
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v2/esb/checkout-saga')
        .send(payload)
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.estado).toBe('COMPLETED');
      expect(res.body.total_pagado).toBe(105.0);
      expect(res.body.correlation_id).toBeDefined();
      expect(res.body.items_confirmados).toHaveLength(2);
      expect(res.body.mensaje).toContain('Checkout compuesto finalizado exitosamente');
    });
  });

  describe('CP-002 / CP-003: Saga con Fallo y Compensación LIFO (Reverso y Reembolso)', () => {
    it('CP-002: Ejecuta compensación LIFO automática ante fallo transaccional retornando HTTP 409 y REF-SAGA-...', async () => {
      const payloadConFallo = {
        cliente_email: 'fallo.saga@booking.com',
        cliente_nombre: 'Carlos Fallo',
        metodo_pago: 'TARJETA_SIMULADA',
        simular_fallo_en_paso: 'INVENTARIO_AGOTADO',
        items: [
          {
            vertical: 'ATRACCIONES',
            item_id: 'PRhu4UBTWPBC',
            nombre: 'Tour Mitad del Mundo',
            cantidad: 1,
            precio_unitario: 50.0,
          },
          {
            vertical: 'AUTOS',
            item_id: 'auto-sedan-01',
            nombre: 'Auto Sedán',
            cantidad: 1,
            precio_unitario: 40.0,
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v2/esb/checkout-saga')
        .send(payloadConFallo)
        .expect(HttpStatus.CONFLICT);

      expect(res.body.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.codigo_compensacion).toMatch(/^REF-SAGA-[A-F0-9]+/);
      expect(res.body.estado_saga).toBe('FAILED');
      expect(res.body.compensaciones_ejecutadas).toBeDefined();
      expect(res.body.title).toContain('Transacción Distribuida Cancelada y Compensada');
      expect(res.body.detail).toContain('acciones compensatorias automáticas');
    });
  });

  describe('CP-006 / CP-048: Idempotencia Estricta con Misma Idempotency-Key', () => {
    it('CP-006: Reenvío con idéntica Idempotency-Key retorna respuesta exacta con header Idempotent-Replayed: true', async () => {
      const idempotencyKey = 'e2e-saga-idem-key-888';
      const payload = {
        cliente_email: 'idempotente@booking.com',
        cliente_nombre: 'Ana Idempotente',
        items: [
          {
            vertical: 'ATRACCIONES',
            item_id: 'PRhu4UBTWPBC',
            nombre: 'Tour Teleférico',
            cantidad: 1,
            precio_unitario: 40.0,
          },
        ],
      };

      // 1ra Petición: Procesamiento original
      const res1 = await request(app.getHttpServer())
        .post('/api/v2/esb/checkout-saga')
        .set('idempotency-key', idempotencyKey)
        .send(payload)
        .expect(HttpStatus.OK);

      expect(res1.body.success).toBe(true);
      expect(res1.headers['idempotent-replayed']).toBeUndefined();

      // 2da Petición: Replay idempotente inmediato
      const res2 = await request(app.getHttpServer())
        .post('/api/v2/esb/checkout-saga')
        .set('idempotency-key', idempotencyKey)
        .send(payload)
        .expect(HttpStatus.OK);

      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body.correlation_id).toBe(res1.body.correlation_id);
      expect(res2.body.total_pagado).toBe(res1.body.total_pagado);
    });
  });

  describe('CP-010: Receptor de Webhooks Inbound con Validación HMAC-SHA256', () => {
    const cloudEventPayload = {
      specversion: '1.0',
      id: '7b8c9d0e-1f2a-4b3c-9d0e-1f2a3b4c5d6e',
      source: 'https://vuelos.external-partner.com',
      type: 'com.booking.flights.schedule_changed',
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: {
        flight_number: 'EQ-302',
        new_departure: '2026-10-26T14:00:00.000Z',
      },
    };

    it('CP-010 Subcaso A (Firma Válida): Acepta CloudEvent con HMAC-SHA256 y responde HTTP 202 Accepted', async () => {
      const rawString = JSON.stringify(cloudEventPayload);
      const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(rawString)).digest('hex')}`;

      const res = await request(app.getHttpServer())
        .post('/api/v2/webhooks/vuelos')
        .set('Content-Type', 'application/cloudevents+json')
        .set('x-webhook-signature', signature)
        .send(cloudEventPayload)
        .expect(HttpStatus.ACCEPTED);

      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.queue_target).toBe('booking.webhooks.inbound.vuelos');
      expect(res.body.event_id).toBe(cloudEventPayload.id);
    });

    it('CP-010 Subcaso B (Firma Adulterada): Rechaza con HTTP 401 Unauthorized ante firma inválida', async () => {
      const invalidSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const res = await request(app.getHttpServer())
        .post('/api/v2/webhooks/vuelos')
        .set('Content-Type', 'application/cloudevents+json')
        .set('x-webhook-signature', invalidSignature)
        .send(cloudEventPayload)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.message).toContain('La firma HMAC-SHA256 del webhook no es válida');
    });
  });

  describe('CP-011: Control de Acceso RBAC (Ruta Protegida por Rol)', () => {
    it('CP-011: Rechaza con HTTP 401 Unauthorized petición anónima sin credenciales', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v2/admin/nodes/atracciones/toggle-killswitch')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('CP-011: Rechaza con HTTP 403 Forbidden a usuario con rol CLIENTE intentando operar Kill-Switch admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v2/admin/nodes/atracciones/toggle-killswitch')
        .set('x-role', 'cliente')
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.message).toContain('Forbidden');
    });

    it('CP-011: Permite acceso con HTTP 200 a usuario con rol ADMIN para conmutar Kill-Switch', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v2/admin/nodes/atracciones/toggle-killswitch')
        .set('x-role', 'admin')
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(res.body.codigo_nodo).toBe('NODE_ATR_DILAN');
      expect(res.body.kill_switch_activo).toBe(true);
    });
  });

  describe('CP-013: Trazabilidad Distribuida de Extremo a Extremo (X-Correlation-Id / W3C Traceparent)', () => {
    it('CP-013: Propaga intactas las cabeceras X-Correlation-Id y traceparent en la respuesta HTTP', async () => {
      const customCorrelationId = 'e2e-trace-test-w3c-999';
      const customTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      const payload = {
        cliente_email: 'trace.tester@booking.com',
        cliente_nombre: 'Tester Trazas',
        items: [
          {
            vertical: 'ATRACCIONES',
            item_id: 'PRhu4UBTWPBC',
            nombre: 'Tour Centro Histórico',
            cantidad: 1,
            precio_unitario: 25.0,
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v2/esb/checkout-saga')
        .set('x-correlation-id', customCorrelationId)
        .set('traceparent', customTraceparent)
        .send(payload)
        .expect(HttpStatus.OK);

      expect(res.headers['x-correlation-id']).toBe(customCorrelationId);
      expect(res.headers['traceparent']).toBe(customTraceparent);
      expect(res.body.correlation_id).toBeDefined();
    });
  });
});
