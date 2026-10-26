import { RpcException } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';
import { InventoryGrpcController } from './inventory-grpc.controller';

const loggerFake: any = { logAudit: jest.fn(), log: jest.fn(), warn: jest.fn() };

function metadata(valores: Record<string, string>): any {
  return { get: (k: string) => (valores[k] !== undefined ? [valores[k]] : []) };
}

const msg = (over: Record<string, any> = {}) => ({
  service_id: 'NODE_VUE_ECOAIRLINES',
  item_id: 'AV1632-ECONOMY',
  date: '2026-11-20',
  time_slot: '08:30',
  available_units: 42,
  timestamp: Date.now(),
  ...over,
});

describe('InventoryService / Panel 7 gRPC', () => {
  const envOriginal = process.env.GRPC_NODE_KEYS;
  let service: InventoryService;
  let controller: InventoryGrpcController;

  beforeEach(() => {
    delete process.env.GRPC_NODE_KEYS;
    service = new InventoryService(loggerFake);
    controller = new InventoryGrpcController(service);
  });

  afterAll(() => {
    if (envOriginal === undefined) delete process.env.GRPC_NODE_KEYS;
    else process.env.GRPC_NODE_KEYS = envOriginal;
  });

  it('no mezcla el stock de dos proveedores con el mismo item_id', () => {
    service.processPushStockUpdate(msg({ service_id: 'NODE_VUE_A', available_units: 5 }));
    service.processPushStockUpdate(msg({ service_id: 'NODE_VUE_B', available_units: 9 }));
    expect(service.getInventory('AV1632-ECONOMY', '2026-11-20', 'NODE_VUE_A')[0].available_units).toBe(5);
    expect(service.getInventory('AV1632-ECONOMY', '2026-11-20', 'NODE_VUE_B')[0].available_units).toBe(9);
  });

  it('rechaza service_id ausente o genérico', () => {
    expect(service.validarOrigen('', null)).toMatchObject({ ok: false, grpcCode: 3 });
    expect(service.validarOrigen('vuelos', null)).toMatchObject({ ok: false, grpcCode: 3 });
  });

  it('en modo abierto acepta cualquier nodo y lo informa', () => {
    expect(service.validarOrigen('NODE_VUE_X', undefined)).toEqual({ ok: true });
    expect(service.getStatus().auth_mode).toBe('ABIERTO');
  });

  it('con GRPC_NODE_KEYS exige la x-api-key del nodo', () => {
    process.env.GRPC_NODE_KEYS = JSON.stringify({ NODE_VUE_ECOAIRLINES: 'k-eco' });
    expect(service.validarOrigen('NODE_VUE_ECOAIRLINES', undefined)).toMatchObject({ ok: false, grpcCode: 16 });
    expect(service.validarOrigen('NODE_VUE_ECOAIRLINES', 'otra')).toMatchObject({ ok: false, grpcCode: 7 });
    expect(service.validarOrigen('NODE_VUE_OTRA', 'k-eco')).toMatchObject({ ok: false, grpcCode: 7 });
    expect(service.validarOrigen('NODE_VUE_ECOAIRLINES', 'k-eco')).toEqual({ ok: true });
  });

  it('PushStockUpdate gRPC rechaza una clave ajena y lo cuenta en la telemetría', () => {
    process.env.GRPC_NODE_KEYS = JSON.stringify({ NODE_VUE_ECOAIRLINES: 'k-eco' });
    expect(() => controller.pushStockUpdate(msg() as any, metadata({ 'x-api-key': 'mala' }))).toThrow(RpcException);
    const ok = controller.pushStockUpdate(msg() as any, metadata({ 'x-api-key': 'k-eco' }));
    expect(ok.success).toBe(true);
    const st = service.getStatus();
    expect(st.total_messages_rejected).toBe(1);
    expect(st.total_messages_received).toBe(1);
    expect(st.recent_rejections[0].service_id).toBe('NODE_VUE_ECOAIRLINES');
    expect(st.nodes.find((n: any) => n.service_id === 'NODE_VUE_ECOAIRLINES')?.unidades_disponibles).toBe(42);
  });

  it('push-stock del admin valida service_id y datos', () => {
    expect(() => controller.pushStockDesdeAdmin(msg({ service_id: 'vuelos' }))).toThrow('genérico');
    expect(() => controller.pushStockDesdeAdmin(msg({ available_units: -1 }))).toThrow('available_units');
    const r = controller.pushStockDesdeAdmin(msg({ available_units: 7 }));
    expect(r.success).toBe(true);
    expect(service.getInventory('AV1632-ECONOMY')[0].source).toBe('ADMIN_PANEL');
  });

  it('el admin puede probar aunque esté activo el modo API_KEY', () => {
    process.env.GRPC_NODE_KEYS = JSON.stringify({ NODE_VUE_ECOAIRLINES: 'k-eco' });
    expect(controller.pushStockDesdeAdmin(msg()).success).toBe(true);
  });
});
