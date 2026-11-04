import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { InventoryGrpcController } from '../src/modules/inventory/inventory-grpc.controller';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { WinstonPhysicalLoggerService } from '../src/core/logger/winston-logger.service';

describe('I09 — gRPC de inventario: unificación, autenticación y alterno REST', () => {
  let controller: InventoryGrpcController;
  let service: InventoryService;

  const validApiKey = 'test-inventory-secret-key-12345';

  beforeAll(() => {
    process.env.INVENTORY_API_KEYS = `test-service:${validApiKey},alojamientos-proveedor:clave-alo-999`;
  });

  afterAll(() => {
    delete process.env.INVENTORY_API_KEYS;
  });

  beforeEach(async () => {
    const mockWinstonLogger = {
      logAudit: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryGrpcController],
      providers: [
        InventoryService,
        {
          provide: WinstonPhysicalLoggerService,
          useValue: mockWinstonLogger,
        },
      ],
    }).compile();

    controller = module.get<InventoryGrpcController>(InventoryGrpcController);
    service = module.get<InventoryService>(InventoryService);
  });

  describe('1. Inbound gRPC: pushStockUpdate', () => {
    it('Sin metadata o sin x-api-key -> rechaza con UNAUTHENTICATED (16)', () => {
      const mockMetadataWithoutAuth = {
        get: jest.fn().mockReturnValue([]),
      };

      const payload = {
        service_id: 'test-service',
        item_id: 'item-001',
        date: '2026-10-26',
        time_slot: '10:00',
        available_units: 10,
        timestamp: Date.now(),
      };

      try {
        controller.pushStockUpdate(payload as any, mockMetadataWithoutAuth as any);
        fail('Debería haber lanzado RpcException con UNAUTHENTICATED');
      } catch (e: any) {
        expect(e).toBeInstanceOf(RpcException);
        const err = e.getError();
        expect(err.code).toBe(status.UNAUTHENTICATED);
      }
    });

    it('Con x-api-key incorrecta -> rechaza con UNAUTHENTICATED (16)', () => {
      const mockMetadataWrongKey = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'x-api-key') return ['clave-invalida-xyz'];
          return [];
        }),
      };

      const payload = {
        service_id: 'test-service',
        item_id: 'item-001',
        date: '2026-10-26',
        time_slot: '10:00',
        available_units: 10,
        timestamp: Date.now(),
      };

      expect(() => {
        controller.pushStockUpdate(payload as any, mockMetadataWrongKey as any);
      }).toThrow(RpcException);
    });

    it('Con payload inválido (unidades negativas) -> rechaza con INVALID_ARGUMENT (3)', () => {
      const mockMetadataValid = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'x-api-key') return [validApiKey];
          return [];
        }),
      };

      const payloadInvalido = {
        service_id: 'test-service',
        item_id: 'item-001',
        date: '2026-10-26',
        time_slot: '10:00',
        available_units: -5,
        timestamp: Date.now(),
      };

      try {
        controller.pushStockUpdate(payloadInvalido as any, mockMetadataValid as any);
        fail('Debería haber lanzado RpcException con INVALID_ARGUMENT');
      } catch (e: any) {
        expect(e).toBeInstanceOf(RpcException);
        const err = e.getError();
        expect(err.code).toBe(status.INVALID_ARGUMENT);
      }
    });

    it('Con credencial válida en metadata -> stock actualizado con éxito', () => {
      const mockMetadataValid = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'x-api-key') return [validApiKey];
          if (key === 'x-correlation-id') return ['corr-grpc-test-111'];
          if (key === 'traceparent') return ['00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'];
          return [];
        }),
      };

      const payload = {
        service_id: 'test-service',
        item_id: 'item-001',
        date: '2026-10-26',
        time_slot: '10:00',
        available_units: 25,
        timestamp: Date.now(),
      };

      const ack = controller.pushStockUpdate(payload as any, mockMetadataValid as any);
      expect(ack).toBeDefined();
      expect(ack.success).toBe(true);

      const inventario = service.getInventory('item-001');
      expect(inventario.length).toBeGreaterThan(0);
      expect(inventario[0].available_units).toBe(25);
    });
  });

  describe('2. Alterno REST Inbound: POST /inventory/stock', () => {
    it('Sin cabecera X-Api-Key -> HTTP 401 Unauthorized', async () => {
      const body = {
        service_id: 'test-service',
        item_id: 'item-rest-002',
        date: '2026-10-26',
        time_slot: '12:00',
        available_units: 8,
      };

      await expect(controller.pushStockUpdateRest(body as any, undefined)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.pushStockUpdateRest(body as any, undefined);
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('Con X-Api-Key incorrecta -> HTTP 401 Unauthorized', async () => {
      const body = {
        service_id: 'test-service',
        item_id: 'item-rest-002',
        date: '2026-10-26',
        time_slot: '12:00',
        available_units: 8,
      };

      await expect(
        controller.pushStockUpdateRest(body as any, 'clave-invalida-rest'),
      ).rejects.toThrow(HttpException);
    });

    it('Con cuerpo incompleto -> HTTP 400 Bad Request', async () => {
      const bodyIncompleto = {
        service_id: 'test-service',
        // falta item_id y date
        available_units: 8,
      };

      await expect(
        controller.pushStockUpdateRest(bodyIncompleto as any, validApiKey),
      ).rejects.toThrow(HttpException);
    });

    it('Con X-Api-Key válida y datos correctos -> actualiza stock y responde 200 con ack', async () => {
      const body = {
        service_id: 'test-service',
        item_id: 'item-rest-002',
        date: '2026-10-26',
        time_slot: '12:00',
        available_units: 14,
      };

      const ack = await controller.pushStockUpdateRest(
        body as any,
        validApiKey,
        'corr-rest-inventario-888',
      );

      expect(ack).toBeDefined();
      expect(ack.success).toBe(true);

      const inventario = service.getInventory('item-rest-002');
      expect(inventario.length).toBeGreaterThan(0);
      expect(inventario[0].available_units).toBe(14);
      expect(inventario[0].source).toBe('REST_FALLBACK');
    });
  });
});
