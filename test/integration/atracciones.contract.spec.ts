import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AtraccionesController } from '../../src/modules/atracciones/atracciones.controller';
import { AtraccionesService } from '../../src/modules/atracciones/atracciones.service';
import { PagoService } from '../../src/modules/atracciones/pago.service';
import { SoapWrapperService } from '../../src/modules/atracciones/soap-wrapper.service';
import { DilanAtraccionesAdapter } from '../../src/modules/atracciones/acl/dilan-atracciones.adapter';
import { WinstonPhysicalLoggerService } from '../../src/core/logger/winston-logger.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Atraccion,
  CategoriaRecursiva,
  TurnoAforo,
  ReservaAtraccion,
  ResenaAtraccion,
  EventoOutbox,
} from '../../src/modules/atracciones/entities';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { of } from 'rxjs';
import { AjvValidationPipe } from '../../src/core/validation/ajv-validation.pipe';

describe('Atracciones OpenAPI v2 & v3 Contract Tests (Cátedra RDA2 CE07)', () => {
  let app: INestApplication;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([
      [
        {
          id: 'PRhu4UBTWPBC',
          nombre: 'Teleférico y Volcán Pichincha',
          descripcionCorta: 'Vistas panorámicas de Quito a 4000 msnm',
          precioUnitarioAdulto: 55.0,
          precioUnitarioNino: 27.5,
          activo: true,
          inclusiones: ['Guía', 'Transporte'],
          createdAt: new Date(),
        },
      ],
      1,
    ]),
    findOne: jest.fn().mockImplementation((query) => {
      if (query?.where?.horaInicio === '10:00 a.m.') {
        return Promise.resolve({
          id: 'turno-1',
          atraccionId: 'PRhu4UBTWPBC',
          fecha: '2026-10-25',
          horaInicio: '10:00 a.m.',
          horaFin: '12:00 p.m.',
          capacidadTotal: 20,
          cuposDisponibles: 15,
          estado: 'DISPONIBLE',
        });
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((entity) =>
      Promise.resolve({
        id: 'res-auto-01',
        localizador: 'LOC-12345',
        status: 'CONFIRMED',
        ...entity,
      }),
    ),
  };

  const mockHttpService = {
    get: jest.fn().mockReturnValue(of({ data: [] })),
    post: jest.fn().mockReturnValue(of({ data: { success: true } })),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AtraccionesController],
      providers: [
        AtraccionesService,
        PagoService,
        SoapWrapperService,
        DilanAtraccionesAdapter,
        WinstonPhysicalLoggerService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(Atraccion), useValue: mockRepo },
        { provide: getRepositoryToken(CategoriaRecursiva), useValue: mockRepo },
        { provide: getRepositoryToken(TurnoAforo), useValue: mockRepo },
        { provide: getRepositoryToken(ReservaAtraccion), useValue: mockRepo },
        { provide: getRepositoryToken(ResenaAtraccion), useValue: mockRepo },
        { provide: getRepositoryToken(EventoOutbox), useValue: mockRepo },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: ['1', '2', '3'],
      prefix: 'v',
    });
    app.useGlobalPipes(new AjvValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v2/atracciones debe cumplir con el esquema paginado de OpenAPI v2', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v2/atracciones?limit=2&page=1')
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
    expect(Array.isArray(response.body.data)).toBe(true);
    if (response.body.data.length > 0) {
      const item = response.body.data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('price');
    }
  });

  it('GET /api/v2/atracciones/categorias/arbol debe retornar el árbol recursivo con los 3 flags de inclusión', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v2/atracciones/categorias/arbol')
      .expect(HttpStatus.OK);

    expect(Array.isArray(response.body)).toBe(true);
    if (response.body.length > 0) {
      const cat = response.body[0];
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('nombre');
      expect(cat).toHaveProperty('incluye_comida');
      expect(cat).toHaveProperty('incluye_transporte');
      expect(cat).toHaveProperty('incluye_guia');
    }
  });

  it('POST /api/v2/atracciones/reservas debe validar aforo y procesar reserva según contrato OpenAPI v2', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v2/atracciones/reservas')
      .send({
        atraccionId: 'PRhu4UBTWPBC',
        date: '2026-10-25',
        time: '10:00 a.m.',
        adult_count: 1,
        child_count: 0,
        senior_count: 0,
        infant_count: 0,
        customer_name: 'Dilan Flores Test',
        customer_email: 'dilan.flores@epn.edu.ec',
      });

    // Debe responder 201 Created o 409 Conflict OUT_OF_STOCK según el cupo
    expect([HttpStatus.CREATED, HttpStatus.CONFLICT]).toContain(res.status);
    if (res.status === HttpStatus.CONFLICT) {
      expect(res.body).toHaveProperty('type');
      expect(res.body).toHaveProperty('code', 'OUT_OF_STOCK');
    }
  });

  it('GET /api/v2/atracciones/categorias debe retornar el listado plano con banderas de inclusión (RDA2)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v2/atracciones/categorias')
      .expect(HttpStatus.OK);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    const cat = response.body[0];
    expect(cat).toHaveProperty('id');
    expect(cat).toHaveProperty('nombre');
    expect(cat).toHaveProperty('incluye_comida');
    expect(cat).toHaveProperty('incluye_transporte');
    expect(cat).toHaveProperty('incluye_guia');
  });

  it('GET /api/v2/atracciones/:id/disponibilidad debe retornar turnos y cupos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v2/atracciones/PRhu4UBTWPBC/disponibilidad?date=2026-10-25')
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('atraccion_id', 'PRhu4UBTWPBC');
    expect(response.body).toHaveProperty('time_slots');
    expect(Array.isArray(response.body.time_slots)).toBe(true);
  });

  it('POST /api/v2/atracciones/reservas/:id/checkin debe procesar checkin presencial con guía', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v2/atracciones/reservas/res-test-01/checkin')
      .send({
        documento_identidad: '1723456789',
        guia_asignado: 'Carlos Villacís (Licencia MINTUR-441)',
      })
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('reserva_id');
    expect(response.body).toHaveProperty('estado', 'CHECKED_IN');
    expect(response.body).toHaveProperty('guia_asignado');
    expect(response.body).toHaveProperty('voucher_digital_qr');
  });

  it('POST /api/v2/atracciones/reservas/:id/cancel debe ejecutar compensación Saga con reembolso 100%', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v2/atracciones/reservas/res-test-01/cancel')
      .set('idempotency-key', 'idem-cancel-test-123')
      .set('x-correlation-id', 'corr-cancel-test-123')
      .send({
        reason: 'Cancelación voluntaria por el usuario',
      })
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('reservation_id');
    expect(response.body).toHaveProperty('status', 'CANCELLED');
    expect(response.body).toHaveProperty('cancel_code');
    expect(response.body).toHaveProperty('refund');
    expect(response.body.refund).toHaveProperty('status', 'PROCESSED');
  });

  it('GET /api/v2/atracciones/promociones/contrato debe retornar el acuerdo B2B de combos (Cátedra RDA2 §9)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v2/atracciones/promociones/contrato')
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('proveedor_codigo');
    expect(response.body).toHaveProperty('vertical', 'ATRACCIONES');
    expect(response.body).toHaveProperty('permite_promociones');
    expect(response.body).toHaveProperty('porcentaje_descuento_maximo');
  });

  // =========================================================================
  // PRUEBAS DE CONTRATO OPENAPI V3 & REGLAS SEMANA 9
  // =========================================================================

  it('GET /api/v3/atracciones debe responder bajo el prefijo canónico v3', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v3/atracciones?limit=2&page=1')
      .expect(HttpStatus.OK);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('POST /api/v3/atracciones/reservas debe procesar checkout canónico en inglés con slot_id concordante', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v3/atracciones/reservas')
      .send({
        attraction_id: 'PRhu4UBTWPBC',
        slot_id: 'slot-20261025-1000',
        date: '2026-10-25',
        time: '10:00 a.m.',
        adult_count: 1,
        customer_name: 'Paúl Rosero V3',
        customer_email: 'paul.rosero@epn.edu.ec',
      });

    expect([HttpStatus.CREATED, HttpStatus.CONFLICT]).toContain(res.status);
    if (res.status === HttpStatus.CREATED) {
      expect(res.body).toHaveProperty('reservation_code');
      expect(res.body).toHaveProperty('voucher_qr_payload');
    }
  });

  it('POST /api/v3/atracciones/reservas debe rechazar con 400 SLOT_TIME_MISMATCH si date/time no coinciden con slot_id', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v3/atracciones/reservas')
      .send({
        attraction_id: 'PRhu4UBTWPBC',
        slot_id: 'slot-20261025-1030', // Franja 10:30
        date: '2026-10-25',
        time: '14:00:00', // Discrepancia intencional a las 14:00
        adult_count: 1,
        customer_name: 'Turista Inconsistente',
      })
      .expect(HttpStatus.BAD_REQUEST);

    expect(res.body).toHaveProperty('type', 'https://booking.epn.edu.ec/errors/slot-mismatch');
    expect(res.body).toHaveProperty('code', 'SLOT_TIME_MISMATCH');
    expect(res.body).toHaveProperty('status', 400);
  });
});

