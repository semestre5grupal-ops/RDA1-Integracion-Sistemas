import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, NotFoundException, UnprocessableEntityException, ConflictException } from '@nestjs/common';
import { of } from 'rxjs';
import { AlojamientosService } from './alojamientos.service';
import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { ResenaAlojamiento } from './entities/resena.entity';
import { ReservationStatus } from './dto/reservation.dto';
import { TelemetryService } from '../telemetry/telemetry.service';
import { CodigoProblema, ProblemaApi } from '../../core/errors/codigo-error';
import { fechaRelativa } from './reglas-estancia';

// Fechas relativas a hoy: con fechas fijas los tests caducaban al pasar el día.
const D = (dias: number) => fechaRelativa(dias);

describe('AlojamientosService', () => {
  let service: AlojamientosService;
  let alojamientoRepo: any;
  let reservaRepo: any;
  let resenaRepo: any;
  let httpService: any;
  let telemetryService: any;

  const mockAlojamiento: Partial<Alojamiento> = {
    id: 'test-uuid-1',
    nombre: 'Villa Paraíso',
    descripcion: 'Hermosa villa frente al mar',
    destino: 'Cancún',
    precioPorNoche: 200,
    moneda: 'USD',
    habitaciones: 3,
    camas: 4,
    banos: 2,
    tienePiscina: true,
    photos: [{ url: 'https://img.com/1.jpg', caption: 'Vista' }],
    amenidades: ['WiFi', 'Piscina', 'Pet friendly'],
    ratings: { score: 9.5, number_of_reviews: 10 },
    host: { id: 'h1', nombre: 'Carlos', es_superhost: true },
    ubicacion: { city: 'Cancún', country: 'MX' },
  };

  const mockReserva: Partial<ReservaAlojamiento> = {
    id: 'res-uuid-1',
    codigoReserva: 'BKG-998877',
    alojamientoId: 'test-uuid-1',
    customerName: 'Juan Pérez',
    customerEmail: 'juan@test.com',
    checkin: D(10),
    checkout: D(13),
    noches: 3,
    huespedes: 2,
    habitacionesCount: 1,
    total: 600,
    totalPrice: { currency: 'USD', total: 600 },
    status: ReservationStatus.CONFIRMED,
    idempotencyKey: 'idemp-test-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    alojamientoRepo = {
      count: jest.fn().mockResolvedValue(10),
      find: jest.fn().mockResolvedValue([mockAlojamiento]),
      findAndCount: jest.fn().mockResolvedValue([[mockAlojamiento], 1]),
      findOne: jest.fn().mockResolvedValue(mockAlojamiento),
      findOneBy: jest.fn().mockResolvedValue(mockAlojamiento),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'test-uuid-1', ...entity })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    reservaRepo = {
      find: jest.fn().mockResolvedValue([mockReserva]),
      findOne: jest.fn().mockResolvedValue(null),
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({ id: 'res-uuid-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'res-uuid-1', ...entity })),
    };

    resenaRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
    };

    httpService = {
      get: jest.fn().mockReturnValue(of({ data: {} })),
      post: jest.fn().mockReturnValue(of({ data: {} })),
    };

    telemetryService = {
      trackEvent: jest.fn().mockResolvedValue({ success: true }),
      trackApiCall: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlojamientosService,
        {
          provide: HttpService,
          useValue: httpService,
        },
        { provide: getRepositoryToken(Alojamiento), useValue: alojamientoRepo },
        { provide: getRepositoryToken(ReservaAlojamiento), useValue: reservaRepo },
        { provide: getRepositoryToken(ResenaAlojamiento), useValue: resenaRepo },
        { provide: TelemetryService, useValue: telemetryService },
      ],
    }).compile();

    service = module.get<AlojamientosService>(AlojamientosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('health()', () => {
    it('debe retornar el estado operativo del servicio y conteo de registros', async () => {
      const result = await service.health();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('Alojamientos');
      expect(result.database).toBe('connected');
      expect(result.total_listings).toBe(10);
    });
  });

  describe('search()', () => {
    it('debe buscar y retornar alojamientos formateados con metadata', async () => {
      const result = await service.search({ destino: 'Cancún', rows: 5 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].nombre).toBe('Villa Paraíso');
      expect(result.data[0]._links).toBeDefined();
      expect(result.metadata.total_results).toBe(1);
    });

    it('debe soportar búsqueda con país y filtros de precio', async () => {
      const result = await service.search({ country: 'mx', filters: { precioMin: 100, precioMax: 500 } } as any);
      expect(result.data).toBeDefined();
      expect(result.request_id).toBeDefined();
    });
  });

  describe('findOne()', () => {
    it('debe retornar el detalle formateado si el alojamiento existe', async () => {
      const result = await service.findOne('test-uuid-1');
      expect(result.id).toBe('test-uuid-1');
      expect(result.nombre).toBe('Villa Paraíso');
      expect(result._links.self.href).toBe('/api/v1/alojamientos/test-uuid-1');
    });

    it('debe lanzar excepción NOT_FOUND si no existe', async () => {
      alojamientoRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(HttpException);
    });
  });

  describe('reservar()', () => {
    it('debe calcular el monto total y generar la reserva confirmada', async () => {
      const dto = {
        nights: 3,
        habitaciones_count: 2,
        customer_name: 'Juan Pérez',
        customer_email: 'juan@test.com',
        checkin: D(10),
        checkout: D(13),
        adultos: 2,
      };

      const result = await service.reservar('test-uuid-1', dto as any, 'idemp-key-123');

      expect(result.status).toBe(ReservationStatus.CONFIRMED);
      expect(result.customer_name).toBe('Juan Pérez');
      expect(result.total_price.total).toBe(1200);
      expect(result._links.cancelar).toBeDefined();
    });

    it('debe lanzar conflicto si la clave de idempotencia ya fue procesada y confirmada', async () => {
      reservaRepo.findOne.mockResolvedValue({
        id: 'res-existente',
        status: ReservationStatus.CONFIRMED,
        idempotencyKey: 'idemp-key-dup',
      });

      const dto = { nights: 1, customer_name: 'Juan' };
      try {
        await service.reservar('test-uuid-1', dto as any, 'idemp-key-dup');
        fail('Debería lanzar error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProblemaApi);
        expect(err.codigo).toBe(CodigoProblema.BOOKING_NOT_CONFIRMED);
      }
    });
  });

  describe('cancelarReserva()', () => {
    it('debe actualizar el estado a CANCELLED', async () => {
      reservaRepo.findOneBy.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.CONFIRMED,
        codigoReserva: 'BKG-123',
        total: 200,
      });

      const result = await service.cancelarReserva('res-1', { reason: 'Cambio de planes' } as any, 'idemp-cancel');
      expect(result.status).toBe(ReservationStatus.CANCELLED);
    });
  });

  // =========================================================================
  // PRUEBAS DE ENDPOINTS EXTENDIDOS Y CONTRATOS OPENAPI
  // =========================================================================

  describe('Disponibilidad y Tarifas (OpenAPI)', () => {
    it('getAvailabilityContract() debe desglosar tarifas y productos por noche', async () => {
      const res = await service.getAvailabilityContract({
        accommodation: 'test-uuid-1',
        checkin: D(10),
        checkout: D(12),
      });

      expect(res.request_id).toBeDefined();
      expect(res.data.products).toHaveLength(3);
      expect(res.data.products[0].room_name).toContain('Estándar');
      expect(res.data.products[0].price).toBe(400); // 200 * 2 noches
    });

    it('getBulkAvailability() debe retornar disponibilidad múltiple', async () => {
      const res = await service.getBulkAvailability({
        accommodations: ['test-uuid-1', 'test-uuid-2'],
        checkin: D(10),
        checkout: D(11),
      });

      expect(res.request_id).toBeDefined();
      expect(res.data).toHaveLength(2);
    });
  });

  describe('Detalles Extendidos, Cambios, Cadenas y Constantes', () => {
    it('getAccommodationDetailsExtended() debe incluir políticas, instalaciones y bundles', async () => {
      const res = await service.getAccommodationDetailsExtended({
        accommodations: ['test-uuid-1'],
        extras: ['policies', 'facilities'],
      });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].policies).toBeDefined();
      expect(res.data[0].facilities_detail).toBeDefined();
    });

    it('getDetailsChanges() debe retornar listado de cambios con timestamp', async () => {
      const res = await service.getDetailsChanges({ last_change: '2026-09-01T00:00:00Z' });
      expect(res.data.from).toBe('2026-09-01T00:00:00Z');
      expect(res.data.changes.updated_accommodations).toBeDefined();
    });

    it('getChains() debe devolver el catálogo de cadenas hoteleras', async () => {
      const res = await service.getChains();
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data[0].brands).toBeDefined();
    });

    it('getConstants() debe devolver diccionarios de tipos de cuartos, servicios y planes', async () => {
      const res = await service.getConstants();
      expect(res.data.room_types).toBeDefined();
      expect(res.data.facilities).toBeDefined();
      expect(res.data.meal_plans).toBeDefined();
    });

    it('getReviewsContract() y getReviewsScores() deben devolver reseñas y desglose', async () => {
      const revRes = await service.getReviewsContract({ accommodations: ['test-uuid-1'] });
      expect(revRes.data).toHaveLength(1);

      const scoreRes = await service.getReviewsScores({ accommodations: ['test-uuid-1'] });
      expect(scoreRes.data).toHaveLength(1);
      expect(scoreRes.data[0].scores_breakdown.cleanliness).toBeDefined();
    });
  });

  describe('Gestión de Órdenes (preview, create, modify, cancel)', () => {
    it('previewOrder() debe generar preview con precio calculado', async () => {
      const res = await service.previewOrder({
        accommodation_id: 'test-uuid-1',
        checkin: D(15),
        checkout: D(17),
        guests: { number_of_adults: 2, number_of_rooms: 1 },
      });

      expect(res.data.order_preview_id).toBeDefined();
      expect(res.data.total_price).toBe(400); // 200 * 2 noches * 1 habitacion
      expect(res.data.nights).toBe(2);
    });

    it('createOrder() debe fallar si falta payment_reference con ProblemaApi (PAYMENT_REFERENCE_INVALID)', async () => {
      try {
        await service.createOrder(
          {
            order_preview_id: 'prev_123',
            payment_reference: '',
            customer_details: { first_name: 'Carlos', last_name: 'Mendoza', email: 'carlos@test.com' },
          },
          'idemp-order-1',
        );
        fail('Debería lanzar error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProblemaApi);
        expect(err.codigo).toBe(CodigoProblema.PAYMENT_REFERENCE_INVALID);
      }
    });

    it('createOrder() debe crear orden formalizada con payment_reference válido y emitir telemetría', async () => {
      const preview = await service.previewOrder({
        accommodation_id: 'test-uuid-1',
        checkin: D(15),
        checkout: D(17),
      });

      const order = await service.createOrder(
        {
          order_preview_id: preview.data.order_preview_id,
          payment_reference: 'pay_ABC123456789',
          customer_details: { first_name: 'Carlos', last_name: 'Mendoza', email: 'carlos@test.com' },
        },
        'idemp-order-valid-uuid',
      );

      expect(order.order_id).toBeDefined();
      expect(order.status).toBe('CONFIRMED');
      expect(order.payment_reference).toBe('pay_ABC123456789');
      expect(order.accommodation_details.nombre).toBe('Villa Paraíso');
      expect(telemetryService.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'booking_confirmed', vertical: 'alojamientos' }),
      );
    });

    it('getOrderById() debe retornar la orden solicitada', async () => {
      reservaRepo.findOne.mockResolvedValue({
        ...mockReserva,
        id: 'res-uuid-1',
      });

      const order = await service.getOrderById('res-uuid-1');
      expect(order.order_id).toBe('res-uuid-1');
      expect(order.status).toBe(ReservationStatus.CONFIRMED);
    });

    it('modifyOrder() debe actualizar fechas y recalcular precio', async () => {
      reservaRepo.findOne.mockResolvedValue({
        ...mockReserva,
        id: 'res-uuid-1',
        checkin: D(10),
        checkout: D(13),
        noches: 3,
        habitacionesCount: 1,
        total: 600,
      });

      const modified = await service.modifyOrder(
        'res-uuid-1',
        { checkin: D(10), checkout: D(14) }, // 4 noches
        'idemp-modify-uuid',
      );

      expect(modified.accommodation_details.noches).toBe(4);
      expect(modified.total_price).toBe(800); // 200 * 4 noches
    });

    it('cancelOrder() debe rechazar cancelación con CANCELLATION_NOT_ALLOWED si la estancia ya finalizó', async () => {
      reservaRepo.findOne.mockResolvedValue({
        ...mockReserva,
        id: 'res-uuid-1',
        checkout: '2020-01-01',
        status: ReservationStatus.CONFIRMED,
      });

      try {
        await service.cancelOrder('res-uuid-1', 'idemp-cancel-uuid', 'Imprevisto');
        fail('Debería lanzar error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProblemaApi);
        expect(err.codigo).toBe(CodigoProblema.CANCELLATION_NOT_ALLOWED);
      }
    });

    it('cancelOrder() debe cambiar status a CANCELLED y emitir telemetría', async () => {
      reservaRepo.findOne.mockResolvedValue({
        ...mockReserva,
        id: 'res-uuid-1',
        checkout: '2030-10-13',
        status: ReservationStatus.CONFIRMED,
      });

      const cancelResult = await service.cancelOrder('res-uuid-1', 'idemp-cancel-uuid', 'Imprevisto');
      expect(cancelResult.status).toBe(ReservationStatus.CANCELLED);
      expect(telemetryService.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'booking_cancelled', vertical: 'alojamientos' }),
      );
    });
  });

  describe('Suscripciones a Webhooks', () => {
    it('createWebhook() debe registrar webhook y validar URL https', async () => {
      await expect(
        service.createWebhook({
          url: 'http://inseguro.com/webhook',
          events: ['ORDER_CONFIRMED'],
        }),
      ).rejects.toThrow(HttpException);

      const sub = await service.createWebhook(
        {
          url: 'https://mi-servidor.com/webhook',
          events: ['ORDER_CONFIRMED', 'ORDER_CANCELLED'],
          secret: 'whsec_secret1234',
        },
        'owner-user-1',
      );

      expect(sub.id).toBeDefined();
      expect(sub.url).toBe('https://mi-servidor.com/webhook');
      expect(sub.secret).toContain('whsec_...');
    });

    it('listWebhooks() y deleteWebhook() deben gestionar suscripciones', async () => {
      const sub = await service.createWebhook(
        { url: 'https://mi-servidor.com/webhook', events: ['ORDER_CONFIRMED'] },
        'owner-user-2',
      );

      const list = await service.listWebhooks('owner-user-2');
      expect(list.some((w) => w.id === sub.id)).toBe(true);

      await service.deleteWebhook(sub.id, 'owner-user-2');
      const listAfter = await service.listWebhooks('owner-user-2');
      expect(listAfter.some((w) => w.id === sub.id)).toBe(false);
    });
  });
});
