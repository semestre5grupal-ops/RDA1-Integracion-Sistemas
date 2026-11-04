import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AlojamientosController } from '../../src/modules/alojamientos/alojamientos.controller';
import { AlojamientosService } from '../../src/modules/alojamientos/alojamientos.service';
import { TiposHabitacionService } from '../../src/modules/alojamientos/tipos-habitacion.service';
import { ProveedoresAlojamientoService } from '../../src/modules/alojamientos/proveedores.service';
import { AlojamientosCircuitBreakerAdapter, CircuitState } from '../../src/modules/alojamientos/acl/alojamientos-circuit-breaker.adapter';
import { WinstonPhysicalLoggerService } from '../../src/core/logger/winston-logger.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Alojamiento } from '../../src/modules/alojamientos/entities/alojamiento.entity';
import { ReservaAlojamiento } from '../../src/modules/alojamientos/entities/reserva.entity';
import { ResenaAlojamiento } from '../../src/modules/alojamientos/entities/resena.entity';
import { TipoHabitacion } from '../../src/modules/alojamientos/entities/tipo-habitacion.entity';
import { HuespedReserva } from '../../src/modules/alojamientos/entities/huesped-reserva.entity';
import { ProveedorAlojamiento } from '../../src/modules/alojamientos/entities/proveedor-alojamiento.entity';
import { EventoOutboxAlojamiento } from '../../src/modules/alojamientos/entities/evento-outbox.entity';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { SesionSupabaseService } from '../../src/core/auth/sesion-supabase.service';
import { of, throwError } from 'rxjs';
import {
  GestionAlojamientosGuard,
  ClienteAutenticadoGuard,
  SesionOpcionalGuard,
  SoloAdministradorGuard,
} from '../../src/modules/alojamientos/guards/gestion-alojamientos.guard';

describe('Alojamientos OpenAPI v2.2.0 Contract Tests & Resiliencia Circuit Breaker (MS_ALO CE01 & CE07)', () => {
  let app: INestApplication;
  let aclAdapter: AlojamientosCircuitBreakerAdapter;

  const mockHotel = {
    id: 'alo-posada-01',
    nombre: 'Hotel Mariscal Boutique',
    descripcion: 'Alojamiento boutique en la zona turística de Quito',
    destino: 'Quito',
    tipoPropiedad: 'Hoteles',
    tipoAlojamiento: 'Habitación privada',
    precioPorNoche: 65.0,
    moneda: 'USD',
    capacidadAdultos: 2,
    capacidadNinos: 1,
    habitaciones: 15,
    camas: 15,
    banos: 1,
    tienePiscina: false,
    photos: [
      { url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', caption: 'Fachada' },
      { url: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800', caption: 'Habitación' },
    ],
    amenidades: ['WiFi gratis', 'Desayuno buffet', 'Parqueadero'],
    ubicacion: { city: 'Quito', country: 'EC', address: 'Calama E5-23' },
    ratings: { score: 9.0, number_of_reviews: 12 },
    estado: 'ACTIVO',
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTipoHabitacion = {
    id: 'tipo-hab-01',
    alojamientoId: 'alo-posada-01',
    codigo: 'STD-DOBLE',
    nombre: 'Habitación Estándar Doble',
    precioNoche: 65.0,
    capacidadAdultos: 2,
    capacidadNinos: 1,
    camas: 1,
    cantidad: 10,
    activo: true,
    amenidades: ['WiFi'],
    photos: [],
  };

  const mockReserva = {
    id: 'c0000000-0000-4000-a000-000000000003',
    codigoReserva: 'BKG-12345',
    alojamientoId: 'alo-posada-01',
    customerName: 'Samantha Nuñez',
    customerEmail: 'samantha.nunez@epn.edu.ec',
    checkin: '2026-11-10',
    checkout: '2026-11-12',
    noches: 2,
    huespedes: 2,
    habitacionesCount: 1,
    total: 130.0,
    status: 'CONFIRMED',
    idempotencyKey: '00000000-0000-4000-a000-000000000001',
    createdAt: new Date(),
  };

  const mockAlojamientoRepo = {
    find: jest.fn().mockResolvedValue([mockHotel]),
    findAndCount: jest.fn().mockResolvedValue([[mockHotel], 1]),
    findOne: jest.fn().mockImplementation((opts) => {
      const id = opts?.where?.id || (Array.isArray(opts?.where) ? opts?.where[0]?.id : undefined);
      if (!id || id === 'alo-posada-01' || id === mockHotel.id) {
        return Promise.resolve(mockHotel);
      }
      return Promise.resolve(null);
    }),
    findOneBy: jest.fn().mockImplementation((where) => {
      if (!where?.id || where?.id === 'alo-posada-01' || where?.id === mockHotel.id) {
        return Promise.resolve(mockHotel);
      }
      return Promise.resolve(null);
    }),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'alo-posada-01', ...dto })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockReservaRepo = {
    find: jest.fn().mockResolvedValue([mockReserva]),
    findOne: jest.fn().mockImplementation((opts) => {
      const id = opts?.where?.id || opts?.where?.codigoReserva;
      if (id === 'c0000000-0000-4000-a000-000000000003' || id === 'BKG-12345' || !id) {
        return Promise.resolve(mockReserva);
      }
      return Promise.resolve(null);
    }),
    findOneBy: jest.fn().mockResolvedValue(mockReserva),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((entity) =>
      Promise.resolve({
        id: 'c0000000-0000-4000-a000-000000000003',
        codigoReserva: 'BKG-12345',
        status: 'CONFIRMED',
        ...entity,
      }),
    ),
  };

  const mockTiposRepo = {
    find: jest.fn().mockResolvedValue([mockTipoHabitacion]),
    findOne: jest.fn().mockImplementation((opts) => {
      const id = opts?.where?.id || opts?.where?.codigo;
      if (id === 'tipo-hab-01' || id === 'STD-DOBLE' || !id) {
        return Promise.resolve(mockTipoHabitacion);
      }
      return Promise.resolve(null);
    }),
    findOneBy: jest.fn().mockImplementation((where) => {
      if (where?.id === 'tipo-hab-01' || where?.codigo === 'STD-DOBLE' || !where?.id) {
        return Promise.resolve(mockTipoHabitacion);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'tipo-hab-01', ...dto })),
  };

  const mockResenaRepo = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
  };

  const mockHuespedRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
  };

  const mockProveedorRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
  };

  const mockOutboxRepo = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'outbox-1',
        eventType: 'ALOJAMIENTO_RESERVA_CREADA',
        aggregateId: 'alo-posada-01',
        payload: { codigo: 'BKG-12345' },
        procesado: true,
        createdAt: new Date(),
      },
    ]),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
  };

  const mockHttpService = {
    get: jest.fn().mockReturnValue(of({ data: [] })),
    post: jest.fn().mockReturnValue(of({ data: { success: true } })),
    axiosRef: {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    },
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null),
    reset: jest.fn().mockResolvedValue(null),
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
      controllers: [AlojamientosController],
      providers: [
        AlojamientosService,
        TiposHabitacionService,
        ProveedoresAlojamientoService,
        AlojamientosCircuitBreakerAdapter,
        WinstonPhysicalLoggerService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(Alojamiento), useValue: mockAlojamientoRepo },
        { provide: getRepositoryToken(ReservaAlojamiento), useValue: mockReservaRepo },
        { provide: getRepositoryToken(ResenaAlojamiento), useValue: mockResenaRepo },
        { provide: getRepositoryToken(TipoHabitacion), useValue: mockTiposRepo },
        { provide: getRepositoryToken(HuespedReserva), useValue: mockHuespedRepo },
        { provide: getRepositoryToken(ProveedorAlojamiento), useValue: mockProveedorRepo },
        { provide: getRepositoryToken(EventoOutboxAlojamiento), useValue: mockOutboxRepo },
        { provide: GestionAlojamientosGuard, useValue: { canActivate: () => true } },
        { provide: ClienteAutenticadoGuard, useValue: { canActivate: () => true } },
        { provide: SesionOpcionalGuard, useValue: { canActivate: () => true } },
        { provide: SoloAdministradorGuard, useValue: { canActivate: () => true } },
        { provide: SesionSupabaseService, useValue: { obtenerUsuario: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    aclAdapter = moduleFixture.get<AlojamientosCircuitBreakerAdapter>(AlojamientosCircuitBreakerAdapter);

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: ['1', '2', '3'],
      prefix: 'v',
    });
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Verificación de Contrato OpenAPI v2.2.0 (GET endpoints)', () => {
    it('GET /api/v2/alojamientos/health debe reportar salud del microservicio MS_ALO', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos/health')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'Alojamientos');
      expect(response.body).toHaveProperty('database', 'connected');
    });

    it('GET /api/v2/alojamientos/promociones/contrato debe exponer las reglas de promoción hoteleras', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos/promociones/contrato')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('porcentaje_descuento_maximo');
      expect(response.body).toHaveProperty('permite_promociones', true);
      expect(response.body).toHaveProperty('destinos_habilitados');
      expect(Array.isArray(response.body.destinos_habilitados)).toBe(true);
    });

    it('GET /api/v2/alojamientos/eventos debe devolver la bitácora Outbox para auditoría distribuida', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos/eventos')
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('event_type', 'ALOJAMIENTO_RESERVA_CREADA');
      expect(response.body[0]).toHaveProperty('specversion', '1.0');
    });

    it('GET /api/v2/alojamientos debe devolver catálogo paginado conforme a OpenAPI v2.2.0', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos?page=1&limit=10')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const hotel = response.body.data[0];
      expect(hotel).toHaveProperty('id', 'alo-posada-01');
      expect(hotel).toHaveProperty('nombre', 'Hotel Mariscal Boutique');
      expect(hotel).toHaveProperty('photos');
      expect(Array.isArray(hotel.photos)).toBe(true);
      expect(hotel.photos[0].url).toContain('http');
    });

    it('GET /api/v2/alojamientos/:id debe retornar detalle completo con amenidades y fotos', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos/alo-posada-01')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', 'alo-posada-01');
      expect(response.body).toHaveProperty('nombre', 'Hotel Mariscal Boutique');
      expect(response.body).toHaveProperty('amenidades');
      expect(response.body).toHaveProperty('photos');
      expect(response.body.photos.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v2/alojamientos/:id/tipos-habitacion debe listar los tipos de habitación registrados', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/alojamientos/alo-posada-01/tipos-habitacion')
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('codigo', 'STD-DOBLE');
      expect(response.body[0]).toHaveProperty('nombre', 'Habitación Estándar Doble');
    });
  });

  describe('2. Cotización y Búsqueda OpenAPI v2.2.0 (POST endpoints)', () => {
    it('POST /api/v2/alojamientos/search debe filtrar hoteles por destino y número de huéspedes', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v2/alojamientos/search')
        .send({
          destino: 'Quito',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          adultos: 2,
          habitaciones: 1,
        })
        .expect(HttpStatus.OK);

      expect(response.body).toBeDefined();
      const items = Array.isArray(response.body) ? response.body : response.body.data;
      expect(Array.isArray(items)).toBe(true);
    });

    it('POST /api/v2/alojamientos/availability debe retornar cotización y cupos disponibles', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v2/alojamientos/availability')
        .send({
          accommodation: 'alo-posada-01',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          guests: {
            number_of_adults: 2,
            number_of_rooms: 1,
          },
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', 'alo-posada-01');
      expect(response.body.data).toHaveProperty('nights', 2);
    });

    it('POST /api/v2/alojamientos/orders/preview debe calcular el desglose financiero exacto con noches', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v2/alojamientos/orders/preview')
        .send({
          accommodation_id: 'alo-posada-01',
          product_id: 'STD-DOBLE',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          guests: {
            number_of_adults: 2,
            number_of_rooms: 1,
          },
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('order_preview_id');
      expect(response.body.data).toHaveProperty('nights', 2);
      expect(response.body.data).toHaveProperty('currency', 'USD');
      expect(response.body.data.total_price).toBeGreaterThan(0);
    });

    it('POST /api/v2/alojamientos/orders/create debe exigir cabecera Idempotency-Key y crear la orden', async () => {
      // 1. Obtener preview primero
      const previewRes = await request(app.getHttpServer())
        .post('/api/v2/alojamientos/orders/preview')
        .send({
          accommodation_id: 'alo-posada-01',
          product_id: 'STD-DOBLE',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          guests: {
            number_of_adults: 2,
            number_of_rooms: 1,
          },
        })
        .expect(HttpStatus.OK);

      const previewId = previewRes.body.data.order_preview_id;

      const orderPayload = {
        order_preview_id: previewId,
        payment_reference: 'PAY-POSADA-EC-7788',
        customer_details: {
          first_name: 'Samantha',
          last_name: 'Nuñez',
          email: 'samantha.nunez@epn.edu.ec',
          phone: '+593 991234567',
        },
      };

      // Sin Idempotency-Key debe rechazar con 400 Bad Request
      await request(app.getHttpServer())
        .post('/api/v2/alojamientos/orders/create')
        .send(orderPayload)
        .expect(HttpStatus.BAD_REQUEST);

      // Con Idempotency-Key válida UUID v4 debe responder 201 Created
      const resValida = await request(app.getHttpServer())
        .post('/api/v2/alojamientos/orders/create')
        .set('Idempotency-Key', 'a0000000-0000-4000-a000-000000000001')
        .send(orderPayload)
        .expect(HttpStatus.CREATED);

      expect(resValida.body).toHaveProperty('order_id');
      expect(resValida.body).toHaveProperty('codigo_reserva');
      expect(resValida.body).toHaveProperty('status', 'CONFIRMED');
    });

    it('POST /api/v2/alojamientos/orders/:orderId/cancel debe ejecutar compensación Saga LIFO', async () => {
      const validOrderId = 'c0000000-0000-4000-a000-000000000003';
      const response = await request(app.getHttpServer())
        .post(`/api/v2/alojamientos/orders/${validOrderId}/cancel`)
        .set('Idempotency-Key', 'b0000000-0000-4000-a000-000000000002')
        .send({
          motivo: 'Cambio de itinerario por el cliente (Saga LIFO)',
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('order_id', validOrderId);
      expect(response.body).toHaveProperty('status', 'CANCELLED');
    });
  });

  describe('3. Resiliencia y Circuit Breaker (Cátedra RDA2 CE01)', () => {
    it('debe activar Mock Fallback si el proveedor hotelero externo excede el timeout de 5 segundos', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('ETIMEDOUT: Connection timed out > 5000ms')),
      );

      const reservaFallback = await aclAdapter.crearReservaExterna(
        {
          alojamientoId: 'alo-posada-01',
          tipoHabitacionCodigo: 'STD-DOBLE',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          adultos: 2,
          habitaciones: 1,
          customer_name: 'Evaluador Cátedra RDA2',
          customer_email: 'profesor@epn.edu.ec',
        },
        'idem-circuit-timeout-001',
      );

      expect(reservaFallback).toBeDefined();
      expect(reservaFallback.status).toBe('CONFIRMED_FALLBACK');
      expect(reservaFallback.external_sync_pending).toBe(true);
    });

    it('debe abrir el circuito tras 3 fallos consecutivos y rechazar rápido con fallback', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Remote server down 503 Service Unavailable')),
      );

      // Ejecutar 3 fallos consecutivos
      for (let i = 0; i < 3; i++) {
        await aclAdapter.crearReservaExterna(
          {
            alojamientoId: 'alo-posada-01',
            checkin: '2026-11-10',
            checkout: '2026-11-12',
            adultos: 2,
            habitaciones: 1,
            customer_name: 'Evaluador Cátedra RDA2',
            customer_email: 'profesor@epn.edu.ec',
          },
          `idem-fail-${i}`,
        );
      }

      const status = aclAdapter.getCircuitStatus();
      expect(status.circuit_state).toBe(CircuitState.OPEN);
      expect(status.consecutive_failures).toBeGreaterThanOrEqual(3);

      // Petición con circuito abierto no debe invocar la red y debe responder inmediatamente con fallback
      mockHttpService.post.mockClear();
      const resultadoRapido = await aclAdapter.crearReservaExterna(
        {
          alojamientoId: 'alo-posada-01',
          checkin: '2026-11-10',
          checkout: '2026-11-12',
          adultos: 2,
          habitaciones: 1,
          customer_name: 'Evaluador Cátedra RDA2',
          customer_email: 'profesor@epn.edu.ec',
        },
        'idem-fast-reject',
      );

      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(resultadoRapido.status).toBe('CONFIRMED_FALLBACK');
      expect(resultadoRapido.circuit_breaker_open).toBe(true);
    });
  });
});
