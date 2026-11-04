import { NodesController } from '../src/modules/nodes/nodes.controller';
import { NodesService } from '../src/modules/nodes/nodes.service';
import { AdminController } from '../src/modules/admin/admin.controller';
import { FinanzasService } from '../src/modules/finanzas/finanzas.service';
import { AdminFinanzasService } from '../src/modules/admin/admin-finanzas.service';

describe('I10 — Consolidar rutas duplicadas de nodos, finanzas y versionado', () => {
  let nodesService: NodesService;
  let nodesController: NodesController;
  let adminController: AdminController;
  let finanzasService: FinanzasService;
  let adminFinanzasService: AdminFinanzasService;

  let mockConfigRepo: any;
  let mockAtraccionRepo: any;
  let mockWinstonLogger: any;
  let mockConnectorHealthService: any;
  let mockAuditService: any;
  let mockLiquidacionRepo: any;
  let mockLibroMayorRepo: any;
  let mockAdminConfigService: any;
  let mockDataSource: any;

  let mockNodeData: any;

  beforeEach(() => {
    mockNodeData = {
      id: 'uuid-node-atr-123',
      codigoNodo: 'NODE_ATR_DILAN',
      nombreProveedor: 'Descubre EC (Dilan Mendoza)',
      vertical: 'ATRACCIONES',
      baseUrlRest: 'https://descubreec.com/api/v2',
      endpointGrpc: 'grpc://booking.epn.edu.ec:50051',
      healthStatus: 'HEALTHY',
      latenciaMs: 25,
      killSwitchActivo: false,
      circuitBreakerEstado: 'CLOSED',
      tasaFallosPct: 0.0,
      equipo: 'Dilan Team',
      contacto: 'dilan@epn.edu.ec',
      emoji: '🎡',
      descripcion: 'Tours y atracciones',
    };

    mockConfigRepo = {
      findOne: jest.fn().mockImplementation((query: any) => {
        const where = query.where;
        if (Array.isArray(where)) {
          for (const cond of where) {
            if (cond.codigoNodo && (cond.codigoNodo === mockNodeData.codigoNodo || cond.codigoNodo === mockNodeData.id)) {
              return Promise.resolve(mockNodeData);
            }
          }
        } else if (where?.vertical && where.vertical === mockNodeData.vertical) {
          return Promise.resolve(mockNodeData);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockResolvedValue([mockNodeData]),
      save: jest.fn().mockImplementation((entity: any) => {
        Object.assign(mockNodeData, entity);
        return Promise.resolve(mockNodeData);
      }),
      count: jest.fn().mockResolvedValue(1),
    };

    mockAtraccionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockWinstonLogger = {
      logAudit: jest.fn(),
      logSecurity: jest.fn(),
      logError: jest.fn(),
      logTraffic: jest.fn(),
    };

    mockConnectorHealthService = {
      toggleNode: jest.fn().mockImplementation((serviceId: string, enabled?: boolean) => ({
        id: serviceId,
        nombre: 'Descubre EC',
        vertical: 'Atracciones',
        enabled: enabled !== undefined ? enabled : true,
        status: enabled ? 'ONLINE' : 'DISABLED',
        circuitBreaker: enabled ? 'CLOSED' : 'MANUALLY_OPEN',
      })),
      updateNodeUrl: jest.fn(),
      getNodesHealth: jest.fn(),
      pingNode: jest.fn(),
    };

    mockAuditService = {
      registrar: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      listar: jest.fn().mockResolvedValue([]),
    };

    mockLiquidacionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        id: 'liq-uuid-1',
        proveedorCodigo: 'NODE_ATR_DILAN',
        vertical: 'ATRACCIONES',
        periodo: '2026-10-Q1',
        totalRecaudado: 1000,
        comisionBooking10pct: 100,
        montoLiquidarSocio90pct: 900,
        estado: 'PENDIENTE',
        comprobanteTransferenciaUrl: null,
        fechaPago: null,
      }),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'liq-uuid-1' })),
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: 'liq-uuid-1' })),
    };

    mockLibroMayorRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto: any) => ({ ...dto, id: 'asiento-1' })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity, id: 'asiento-1' })),
    };

    mockAdminConfigService = {
      getConfig: jest.fn().mockResolvedValue({ comisionBase: 10, tasaImpuestos: 15 }),
      asegurarEsquema: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ id: 'payout-1', aprobado_en: new Date() }]),
    };

    // Instantiate Services
    nodesService = new NodesService(
      mockConfigRepo,
      mockAtraccionRepo,
      mockWinstonLogger,
      mockConnectorHealthService,
    );

    nodesController = new NodesController(nodesService);

    finanzasService = new FinanzasService(
      mockLiquidacionRepo,
      mockLibroMayorRepo,
      mockWinstonLogger,
      mockDataSource as any,
      mockAdminConfigService as any,
    );

    adminFinanzasService = new AdminFinanzasService(
      finanzasService as any,
    );

    adminController = new AdminController(
      {} as any, // adminService
      mockAdminConfigService,
      adminFinanzasService,
      mockAuditService,
      {} as any, // proveedoresService
      mockConnectorHealthService,
      nodesService,
    );
  });

  describe('1. Unificación de Kill-Switches y Rutas de Nodos', () => {
    it('Ruta Canónica: POST /admin/nodes/:codigoNodo/toggle-killswitch conmuta estado y audita sin cabecera Deprecation', async () => {
      const resp = await nodesController.toggleKillSwitch('NODE_ATR_DILAN', { activar: true });

      expect(resp.success).toBe(true);
      expect(resp.kill_switch_activo).toBe(true);
      expect(resp.estado).toBe('APAGADO');
      expect(mockNodeData.killSwitchActivo).toBe(true);
      expect(mockConnectorHealthService.toggleNode).toHaveBeenCalledWith('atracciones', false);
      expect(mockWinstonLogger.logAudit).toHaveBeenCalledWith(
        'KILL_SWITCH_PROVEEDOR_ALTERADO',
        expect.objectContaining({
          codigo_nodo: 'NODE_ATR_DILAN',
          kill_switch_activo: true,
        }),
      );
    });

    it('Ruta Deprecada 1: POST /nodes/:codigoNodo/toggle adjunta encabezados Deprecation y Link a la canónica', async () => {
      const mockRes: any = {
        headers: {},
        setHeader: jest.fn(function (name: string, value: string) {
          this.headers[name] = value;
        }),
      };

      const resp = await nodesController.toggleNodePublic('NODE_ATR_DILAN', { activar: true }, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Link',
        expect.stringContaining('/admin/nodes/NODE_ATR_DILAN/toggle-killswitch>; rel="successor-version"'),
      );
      expect(resp.success).toBe(true);
      expect(resp.kill_switch_activo).toBe(true);
    });

    it('Ruta Deprecada 2: POST /admin/nodes/:serviceId/toggle delega en NodesService y adjunta Deprecation y Link', async () => {
      const mockReq: any = {
        user: { email: 'admin@epn.edu.ec', rol: 'ADMIN' },
      };
      const mockRes: any = {
        headers: {},
        setHeader: jest.fn(function (name: string, value: string) {
          this.headers[name] = value;
        }),
      };

      const resp = await adminController.toggleNode('atracciones', { enabled: false }, mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Link',
        expect.stringContaining('/admin/nodes/atracciones/toggle-killswitch>; rel="successor-version"'),
      );
      expect(resp.success).toBe(true);
      expect(resp.kill_switch_activo).toBe(true);
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Conmutó kill-switch'),
        'nodo_red',
        'atracciones',
        expect.anything(),
      );
    });

    it('Acepta de forma consistente tanto serviceId ("atracciones") como codigoNodo ("NODE_ATR_DILAN")', async () => {
      // 1. Invocar con serviceId en la ruta canónica
      const respServiceId = await nodesController.toggleKillSwitch('atracciones', { activar: true });
      expect(respServiceId.codigo_nodo).toBe('NODE_ATR_DILAN');

      // 2. Invocar con codigoNodo en la ruta canónica
      const respCodigoNodo = await nodesController.toggleKillSwitch('NODE_ATR_DILAN', { activar: false });
      expect(respCodigoNodo.codigo_nodo).toBe('NODE_ATR_DILAN');
      expect(respCodigoNodo.kill_switch_activo).toBe(false);
    });
  });

  describe('2. Consolidación de Finanzas y Payouts en FinanzasService', () => {
    it('AdminFinanzasService delega la aprobación de payout a FinanzasService y audita', async () => {
      const body = { vertical: 'atracciones', periodo: '2026-10-Q1', referencia: 'PAYOUT-TEST-001' };
      const actor = 'admin@epn.edu.ec';

      const res = await adminFinanzasService.aprobarPayout(body, actor);

      expect(res.success).toBe(true);
      expect(res.vertical).toBe('atracciones');
      expect(res.periodo).toBe('2026-10-Q1');
      expect(mockWinstonLogger.logAudit).toHaveBeenCalledWith(
        'PAYOUT_APROBADO',
        expect.objectContaining({
          vertical: 'atracciones',
          periodo: '2026-10-Q1',
        }),
      );
    });

    it('FinanzasService.marcarLiquidacionPagada es idempotente ante liquidación ya pagada', async () => {
      mockLiquidacionRepo.findOne.mockResolvedValueOnce({
        id: 'liq-uuid-pagada',
        proveedorCodigo: 'NODE_ATR_DILAN',
        periodo: '2026-10-Q1',
        estado: 'PAGADO',
        comprobanteTransferenciaUrl: 'https://banco.local/trx-previa.pdf',
        fechaPago: new Date('2026-10-15T10:00:00Z'),
        montoLiquidarSocio90pct: 900,
      });

      const res = await finanzasService.marcarLiquidacionPagada('liq-uuid-pagada', {
        comprobante_url: 'https://banco.local/nueva-url.pdf',
      });

      expect(res.success).toBe(true);
      expect(res.idempotent_replayed).toBe(true);
      // No debe sobreescribir fechaPago en repo.save
      expect(mockLiquidacionRepo.save).not.toHaveBeenCalled();
    });
  });
});
