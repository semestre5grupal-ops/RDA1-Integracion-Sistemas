import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ObservabilidadController } from '../src/modules/observabilidad/observabilidad.controller';
import { ObservabilidadService } from '../src/modules/observabilidad/observabilidad.service';
import { SagaOrchestratorService } from '../src/modules/esb/interna/saga-orchestrator.service';
import * as fs from 'fs';
import * as path from 'path';

describe('I08 — Endpoint de trazas y dashboard de grafo', () => {
  let controller: ObservabilidadController;
  let service: ObservabilidadService;
  let mockSagaOrchestrator: any;

  const testLogsDir = path.resolve(process.cwd(), 'logs', 'test-service');

  beforeAll(() => {
    // Crear archivo de log de prueba para verificar lectura acotada de logs físicos
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, `${today}.jsonl`);
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'test-service',
      correlation_id: 'SAGA-OK-12345',
      action: 'ORDER_SUBMITTED',
      message: 'Orden confirmada en test',
    }) + '\n';
    fs.writeFileSync(logFile, line);
  });

  afterAll(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    mockSagaOrchestrator = {
      consultarEstadoSaga: jest.fn().mockImplementation(async (correlationId: string) => {
        if (correlationId === 'SAGA-OK-12345') {
          return {
            saga: {
              id: 'saga-1',
              correlationId: 'SAGA-OK-12345',
              sagaNombre: 'SAGA_CHECKOUT_MULTIDOMINIO',
              estado: 'COMPLETED',
              iniciadaAt: new Date(Date.now() - 5000),
              finalizadaAt: new Date(),
              montoTotal: 150,
            },
            journal: [
              {
                id: 'j-1',
                paso: 'HOLD_ATRACCIONES',
                servicio: 'MS_ATR',
                accion: 'RESERVA_ATRACCION',
                estado: 'SUCCESS',
                compensado: false,
                duracionMs: 120,
              },
              {
                id: 'j-2',
                paso: 'COBRO_PASARELA_SOA',
                servicio: 'MS_PAG',
                accion: 'PROCESAR_PAGO',
                estado: 'SUCCESS',
                compensado: false,
                duracionMs: 250,
              },
            ],
          };
        }

        if (correlationId === 'SAGA-FAIL-99999') {
          return {
            saga: {
              id: 'saga-2',
              correlationId: 'SAGA-FAIL-99999',
              sagaNombre: 'SAGA_CHECKOUT_MULTIDOMINIO',
              estado: 'FAILED_COMPENSATED',
              iniciadaAt: new Date(Date.now() - 4000),
              finalizadaAt: new Date(),
              codigoCompensacion: 'REF-SAGA-FAIL-LIFO',
            },
            journal: [
              {
                id: 'j-1',
                paso: 'HOLD_ATRACCIONES',
                servicio: 'MS_ATR',
                accion: 'RESERVA_ATRACCION',
                estado: 'COMPENSATED',
                compensado: true,
                duracionMs: 110,
              },
              {
                id: 'j-2',
                paso: 'COBRO_PASARELA_SOA',
                servicio: 'MS_PAG',
                accion: 'PROCESAR_PAGO',
                estado: 'FAILED',
                compensado: false,
                duracionMs: 80,
                error: 'HTTP 402 Fondos insuficientes',
              },
            ],
          };
        }

        throw new HttpException(
          {
            type: 'https://booking.epn.edu.ec/errors/not-found',
            title: 'Saga no encontrada',
            status: HttpStatus.NOT_FOUND,
          },
          HttpStatus.NOT_FOUND,
        );
      }),
      listarSagasRecientes: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObservabilidadController],
      providers: [
        ObservabilidadService,
        {
          provide: SagaOrchestratorService,
          useValue: mockSagaOrchestrator,
        },
      ],
    }).compile();

    controller = module.get<ObservabilidadController>(ObservabilidadController);
    service = module.get<ObservabilidadService>(ObservabilidadService);
  });

  it('1. Saga exitosa -> Retorna grafo con overall_status COMPLETED, nodos 🟢 (SUCCESS) y aristas', async () => {
    const res = await controller.obtenerTrazaGrafo('SAGA-OK-12345');

    expect(res).toBeDefined();
    expect(res.correlation_id).toBe('SAGA-OK-12345');
    expect(res.overall_status).toBe('COMPLETED');
    expect(res.nodes.length).toBeGreaterThanOrEqual(3); // orchestrator + 2 pasos

    const orchestratorNode = res.nodes.find((n: any) => n.id === 'span-orchestrator');
    expect(orchestratorNode).toBeDefined();
    expect(orchestratorNode.status).toBe('SUCCESS');
    expect(orchestratorNode.color_led).toBe('🟢');

    const pasoAtr = res.nodes.find((n: any) => n.id.includes('atracciones'));
    expect(pasoAtr).toBeDefined();
    expect(pasoAtr.status).toBe('SUCCESS');
    expect(pasoAtr.color_led).toBe('🟢');

    expect(res.edges.length).toBeGreaterThanOrEqual(2);
    expect(res.edges[0].from).toBe('span-orchestrator');
  });

  it('2. Saga fallida con compensación -> Retorna grafo con overall_status COMPENSATED, nodo fallido 🔴 (ERROR) y nodos compensados 🟡 (COMPENSATED)', async () => {
    const res = await controller.obtenerTrazaGrafo('SAGA-FAIL-99999');

    expect(res).toBeDefined();
    expect(res.correlation_id).toBe('SAGA-FAIL-99999');
    expect(res.overall_status).toBe('COMPENSATED');

    const failedNode = res.nodes.find((n: any) => n.id.includes('cobro') || n.id.includes('pag'));
    expect(failedNode).toBeDefined();
    expect(failedNode.status).toBe('ERROR');
    expect(failedNode.color_led).toBe('🔴');
    expect(failedNode.error_details).toContain('Fondos insuficientes');

    const compNode = res.nodes.find((n: any) => n.id.includes('atracciones'));
    expect(compNode).toBeDefined();
    expect(compNode.status).toBe('COMPENSATED');
    expect(compNode.color_led).toBe('🟡');

    // Debe existir al menos una arista de compensación
    const compEdge = res.edges.find((e: any) => e.kind === 'compensación');
    expect(compEdge).toBeDefined();
  });

  it('3. Correlation-ID inexistente (ni saga ni logs) -> Retorna HTTP 404', async () => {
    await expect(controller.obtenerTrazaGrafo('CORR-INEXISTENTE-000')).rejects.toThrow(
      HttpException,
    );

    try {
      await controller.obtenerTrazaGrafo('CORR-INEXISTENTE-000');
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(e.getResponse().title).toMatch(/no encontrada/i);
    }
  });

  it('4. Lectura de logs acotada en tiempo y tamaño: incluye trazas de log del correlationId', async () => {
    const logs = await service.buscarLogsFisicosPorCorrelationId('SAGA-OK-12345', 10);
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].correlation_id).toBe('SAGA-OK-12345');
  });
});
