import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { NodesService } from '../../src/modules/nodes/nodes.service';
import { NodesController } from '../../src/modules/nodes/nodes.controller';
import { ConfigProveedor } from '../../src/modules/nodes/entities';
import { ConnectorHealthService } from '../../src/modules/admin/connector-health.service';
import { DilanAtraccionesAdapter } from '../../src/modules/atracciones/acl/dilan-atracciones.adapter';
import { AutosCircuitBreakerAdapter } from '../../src/modules/autos/acl/autos-circuit-breaker.adapter';
import { WinstonPhysicalLoggerService } from '../../src/core/logger/winston-logger.service';
import { SupabaseAuthGuard } from '../../src/core/guards/supabase-auth.guard';
import { RolesGuard } from '../../src/core/guards/roles.guard';
import { Atraccion } from '../../src/modules/atracciones/entities';

describe('Paso 3: Orquestación de Conectores Externos y Resiliencia Circuit Breaker (Cátedra RDA2 CE01)', () => {
  let nodesService: NodesService;
  let nodesController: NodesController;
  let connectorHealthService: ConnectorHealthService;
  let dilanAdapter: DilanAtraccionesAdapter;
  let autosAdapter: AutosCircuitBreakerAdapter;
  let winstonLogger: WinstonPhysicalLoggerService;

  // Repositorio simulado en memoria para ConfigProveedor
  const mockConfigRepoData: any[] = [];
  const mockConfigRepo = {
    find: jest.fn().mockImplementation(() => Promise.resolve([...mockConfigRepoData])),
    findOne: jest.fn().mockImplementation((query) => {
      const codeOrId = query.where?.[0]?.codigoNodo || query.where?.codigoNodo;
      return Promise.resolve(mockConfigRepoData.find((n) => n.codigoNodo === codeOrId || n.id === codeOrId) || null);
    }),
    create: jest.fn().mockImplementation((dto) => ({ id: `id-${Date.now()}-${Math.random()}`, ...dto })),
    save: jest.fn().mockImplementation((entity) => {
      const idx = mockConfigRepoData.findIndex((n) => n.codigoNodo === entity.codigoNodo || n.id === entity.id);
      if (idx >= 0) {
        mockConfigRepoData[idx] = { ...mockConfigRepoData[idx], ...entity };
        return Promise.resolve(mockConfigRepoData[idx]);
      }
      const nuevo = { id: entity.id || `id-${Date.now()}`, ...entity };
      mockConfigRepoData.push(nuevo);
      return Promise.resolve(nuevo);
    }),
  };

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    mockConfigRepoData.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodesController],
      providers: [
        NodesService,
        ConnectorHealthService,
        DilanAtraccionesAdapter,
        AutosCircuitBreakerAdapter,
        WinstonPhysicalLoggerService,
        SupabaseAuthGuard,
        RolesGuard,
        { provide: getRepositoryToken(ConfigProveedor), useValue: mockConfigRepo },
        {
          provide: getRepositoryToken(Atraccion),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
          },
        },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    nodesService = module.get<NodesService>(NodesService);
    nodesController = module.get<NodesController>(NodesController);
    connectorHealthService = module.get<ConnectorHealthService>(ConnectorHealthService);
    dilanAdapter = module.get<DilanAtraccionesAdapter>(DilanAtraccionesAdapter);
    autosAdapter = module.get<AutosCircuitBreakerAdapter>(AutosCircuitBreakerAdapter);
    winstonLogger = module.get<WinstonPhysicalLoggerService>(WinstonPhysicalLoggerService);
  });

  describe('1. Parametrización en Vivo de URLs Oficiales (NodesService & Controller)', () => {
    it('debe sembrar nodos por defecto con variables .env si la tabla está vacía y calcular semáforos LED para Panel 1', async () => {
      const nodos = await nodesService.listarNodos();
      expect(nodos.length).toBe(20);

      const dilanNode = nodos.find((n) => n.codigo_nodo === 'NODE_ATR_DILAN');
      expect(dilanNode).toBeDefined();
      expect(dilanNode.vertical).toBe('ATRACCIONES');
      expect(dilanNode.semaforo_led.icono).toBe('🟢');
      expect(dilanNode.semaforo_led.estado).toBe('HEALTHY');
      expect(dilanNode.url).toBe(process.env.TIENDA_ATRACCIONES_URL || 'http://100.80.229.90:8080/api/v3');

      // Compatibilidad con campos de Panel 1
      expect(dilanNode.codigo).toBe('NODE_ATR_DILAN');
      expect(dilanNode.estado).toBe('OPERATIVO');
      expect(dilanNode.failCount).toBe(0);
    });

    it('debe permitir parametrizar en vivo la URL oficial de un nodo y sincronizar con ConnectorHealthService', async () => {
      await nodesService.listarNodos(); // Asegurar siembra

      const nuevaUrlOficial = 'https://partner-dilan-v2.descubreec.com/api/v2';
      const resultado = await nodesController.actualizarNodo('NODE_ATR_DILAN', {
        baseUrlRest: nuevaUrlOficial,
        nombreProveedor: 'Descubre EC (Dilan Mendoza - Producción)',
      });

      expect(resultado.success).toBe(true);
      expect(resultado.nodo.base_url_rest).toBe(nuevaUrlOficial);

      // Verificar que el monitor en memoria se actualizó inmediatamente
      const healthData = await connectorHealthService.getNodesHealth(false);
      const atraccionesNode = healthData.nodes.find((n) => n.id === 'atracciones');
      expect(atraccionesNode?.url).toBe(nuevaUrlOficial);
    });

    it('debe rechazar la parametrización de un nodo inexistente con HTTP 404', async () => {
      await expect(
        nodesController.actualizarNodo('NODE_INEXISTENTE_999', { baseUrlRest: 'http://foo.com' })
      ).rejects.toThrow(HttpException);
    });
  });

  describe('2. Verificación del Circuit Breaker y Timeout de 5s en DilanAtraccionesAdapter (CE01)', () => {
    it('debe retornar disponibilidad normal si la tienda externa de Dilan responde en <5s', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            horarios: [
              { turno: '09:00', cupos_libres: 12 },
              { turno: '14:00', cupos_libres: 5 },
            ],
          },
        })
      );

      const disp = await dilanAdapter.getDisponibilidad('atr-cotopaxi-01', '2026-10-25');
      expect(disp).toBeDefined();
      expect(Array.isArray(disp)).toBe(true);
      expect(disp.length).toBe(2);
      expect(disp[0].hora).toBe('09:00');
    });

    it('debe activar Mock Fallback automático si la tienda de Dilan está apagada (error de red o timeout >5s) sin congelar la plataforma', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Connection refused / ECONNREFUSED')));

      // El llamado no debe arrojar excepción que rompa el servidor: debe entregar fallback controlado
      const disp = await dilanAdapter.getDisponibilidad('atr-cotopaxi-01', '2026-10-25');
      expect(disp).toBeDefined();
      expect(Array.isArray(disp)).toBe(true);
      expect(disp.length).toBeGreaterThan(0);
      expect(disp[0].origen).toBe('FALLBACK_LOCAL_CACHE');
    });

    it('debe abrir el circuito tras 3 fallos consecutivos y retornar confirmación Mock Fallback en reservas', async () => {
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Gateway Timeout 504')));

      const payload = {
        atraccionId: 'atr-cotopaxi-01',
        date: '2026-10-25',
        time: '10:00',
        adult_count: 2,
        child_count: 0,
        ticket_count: 2,
        customer_name: 'Turista Evaluación',
        customer_email: 'evaluacion@epn.edu.ec',
      };

      // 3 fallos consecutivos
      await dilanAdapter.crearReserva(payload, 'idem-f1');
      await dilanAdapter.crearReserva(payload, 'idem-f2');
      const res3 = await dilanAdapter.crearReserva(payload, 'idem-f3');

      // Cuarto intento con el circuito ya ABIERTO (CircuitState.OPEN)
      const resCircuitoAbierto = await dilanAdapter.crearReserva(payload, 'idem-f4');

      expect(resCircuitoAbierto).toBeDefined();
      expect(resCircuitoAbierto.status).toBe('CONFIRMED_FALLBACK');
      expect(resCircuitoAbierto.circuit_breaker_open).toBe(true);
      expect(resCircuitoAbierto.message).toContain('Mock Fallback de resiliencia');
    });
  });

  describe('3. Verificación de Resiliencia y Mock Fallback en AutosCircuitBreakerAdapter (CE01)', () => {
    it('debe retornar catálogo Mock Fallback de 3 vehículos cuando el proveedor externo de autos está apagado', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('ETIMEDOUT: Connection timed out > 5000ms')));

      const autos = await autosAdapter.fetchExternalCars({ ciudad: 'Quito' });
      expect(autos).toBeDefined();
      expect(Array.isArray(autos)).toBe(true);
      expect(autos.length).toBe(3);
      expect(autos[0].is_mock_fallback).toBe(true);
      expect(autos[0].marca).toBe('Chevrolet');
      expect(autos[1].marca).toBe('Kia');
      expect(autos[2].marca).toBe('Isuzu');
    });

    it('debe generar orden Mock Fallback de resiliencia si la agencia externa no responde en el límite de 5s', async () => {
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Socket hang up / Remote server down')));

      const payload = {
        vehicle_id: 'ext-hertz-1',
        dias: 3,
        pickup_date: '2026-10-25',
        dropoff_date: '2026-10-28',
        pickup_location: 'Aeropuerto Quito',
        dropoff_location: 'Aeropuerto Quito',
        tipo_cobertura: 'COBERTURA_TOTAL',
        conductor: {
          nombre: 'Docente Evaluador',
          email: 'profesor@epn.edu.ec',
          telefono: '0987654321',
          licencia: 'LIC-EC-1720',
          edad: 35,
        },
      };

      const orden = await autosAdapter.createExternalOrder(payload, 'idem-auto-001');
      expect(orden).toBeDefined();
      expect(orden.status).toBe('CONFIRMED_FALLBACK');
      expect(orden.circuit_breaker_open).toBe(true);
      expect(orden.external_order_id).toContain('EXT-MOCK-TIMEOUT');
    });

    it('debe conmutar el Kill-Switch desde Panel 1, abriendo el circuito inmediatamente en el adaptador', async () => {
      // Conmutar kill-switch del conector autos
      connectorHealthService.toggleNode('autos', false);
      expect(connectorHealthService.isNodeEnabled('autos')).toBe(false);

      // Con el switch apagado, fetchExternalCars debe responder inmediatamente con Mock Fallback sin llamar a la red
      mockHttpService.get.mockClear();
      const autos = await autosAdapter.fetchExternalCars({});
      expect(mockHttpService.get).not.toHaveBeenCalled();
      expect(autos.length).toBe(3);
      expect(autos[0].is_mock_fallback).toBe(true);

      // Reactivar el switch
      connectorHealthService.toggleNode('autos', true);
      expect(connectorHealthService.isNodeEnabled('autos')).toBe(true);
    });
  });

  describe('4. Garantía de Disponibilidad Global (Criterio Excluyente CE01)', () => {
    it('comprueba que si TODAS las tiendas externas de compañeros están apagadas, la plataforma continúa 100% operativa', async () => {
      // Simular caída total de la red de compañeros
      mockHttpService.get.mockReturnValue(throwError(() => new Error('All external partner servers offline')));
      mockHttpService.post.mockReturnValue(throwError(() => new Error('All external partner servers offline')));

      // 1. Atracciones: consulta y reserva
      const dispAtr = await dilanAdapter.getDisponibilidad('atr-quilotoa', '2026-10-28');
      expect(dispAtr.length).toBeGreaterThan(0);

      const resAtr = await dilanAdapter.crearReserva({
        atraccionId: 'atr-quilotoa',
        date: '2026-10-28',
        time: '08:00',
        adult_count: 1,
        child_count: 0,
        ticket_count: 1,
        customer_name: 'Estudiante EPN',
        customer_email: 'estudiante@epn.edu.ec',
      }, 'idem-global-1');
      expect(resAtr.status).toBe('CONFIRMED_FALLBACK');

      // 2. Autos: consulta y reserva
      const autos = await autosAdapter.fetchExternalCars({});
      expect(autos.length).toBe(3);

      const resAuto = await autosAdapter.createExternalOrder({
        vehicle_id: 'ext-mock-sportage-02',
        dias: 2,
        pickup_date: '2026-10-28',
        dropoff_date: '2026-10-30',
        pickup_location: 'Quito',
        dropoff_location: 'Quito',
        tipo_cobertura: 'BASICA',
        conductor: {
          nombre: 'Estudiante EPN',
          email: 'estudiante@epn.edu.ec',
          telefono: '0999999999',
          licencia: 'LIC-099',
          edad: 28,
        },
      }, 'idem-global-2');
      expect(resAuto.status).toBe('CONFIRMED_FALLBACK');

      // 3. Monitor de salud refleja el estado con precisión
      const health = await connectorHealthService.getNodesHealth(false);
      expect(health.summary.total_nodes).toBe(5);
    });
  });
});
