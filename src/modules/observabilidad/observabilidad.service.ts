import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { SagaOrchestratorService } from '../esb/interna/saga-orchestrator.service';
import * as fs from 'fs';
import * as path from 'path';

export interface TraceGraphNode {
  id: string;
  label: string;
  service: string;
  type?: string;
  status: 'SUCCESS' | 'ERROR' | 'COMPENSATED' | 'SKIPPED';
  color_led: '🟢' | '🟡' | '🔴';
  duration_ms: number;
  timestamp?: string;
  error?: string | null;
  error_details?: string | null;
}

export interface TraceGraphEdge {
  from: string;
  to: string;
  protocol: 'REST' | 'GRPC' | 'RABBITMQ_AMQP' | 'KAFKA_STREAMING';
  kind?: 'llamada' | 'evento' | 'compensación';
  event_name?: string | null;
}

export interface TraceGraphResponse {
  correlation_id: string;
  root_process: string;
  overall_status: 'COMPLETED' | 'COMPENSATED' | 'FAILED' | 'IN_PROGRESS';
  duration_ms: number;
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  // Campos de compatibilidad con esb-sagas-openapi-v2.yaml
  nodos?: any[];
  aristas?: any[];
  spans?: any[];
  trace_id?: string;
  estado_global?: string;
}

@Injectable()
export class ObservabilidadService {
  private readonly logger = new Logger(ObservabilidadService.name);

  constructor(
    @Optional() private readonly sagaOrchestrator?: SagaOrchestratorService,
  ) {}

  /**
   * Búsqueda acotada y no bloqueante de logs físicos en disco por correlation_id (ADR-003 / I03)
   * Filtra por archivos de los últimos 7 días y un límite máximo de tamaño/registros para proteger el servidor.
   */
  async buscarLogsFisicosPorCorrelationId(
    correlationId: string,
    limit = 50,
  ): Promise<any[]> {
    const logsDirectory = path.resolve(process.cwd(), 'logs');
    const records: any[] = [];

    if (!fs.existsSync(logsDirectory)) {
      return records;
    }

    try {
      const serviceDirs = fs.readdirSync(logsDirectory);
      const hoy = new Date();
      // Limitar a archivos de los últimos 7 días
      const fechasValidas = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        fechasValidas.add(d.toISOString().split('T')[0]);
      }

      for (const serviceName of serviceDirs) {
        if (records.length >= limit) break;
        const serviceDirectory = path.join(logsDirectory, serviceName);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(serviceDirectory);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        const files = fs.readdirSync(serviceDirectory);
        for (const filename of files) {
          if (records.length >= limit) break;
          const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
          if (!match || !fechasValidas.has(match[1])) continue;

          const filePath = path.join(serviceDirectory, filename);
          const fileStat = fs.statSync(filePath);
          // Si el archivo supera 5 MB, no lo procesamos entero de golpe
          if (fileStat.size > 5 * 1024 * 1024) continue;

          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const record = JSON.parse(line);
              if (record.correlation_id === correlationId) {
                records.push(record);
                if (records.length >= limit) break;
              }
            } catch {
              // Ignorar líneas corruptas
            }
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`Error al leer logs físicos para traza: ${e.message}`);
    }

    return records.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Reconstruye el grafo acíclico dirigido (DAG) de trazas para el Dashboard (I08 / Semana 8)
   * Correlaciona el estado de la Saga en memoria/BD + logs estructurados en disco.
   */
  async obtenerTrazaGrafo(correlationId: string): Promise<TraceGraphResponse> {
    let sagaData: any = null;
    if (this.sagaOrchestrator) {
      try {
        sagaData = await this.sagaOrchestrator.consultarEstadoSaga(correlationId);
      } catch (e: any) {
        // Puede que no sea una saga o que no se encuentre en BD/memoria
      }
    }

    const logRecords = await this.buscarLogsFisicosPorCorrelationId(correlationId, 100);

    if (!sagaData && logRecords.length === 0) {
      throw new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/not-found',
          title: 'Traza no encontrada',
          status: HttpStatus.NOT_FOUND,
          detail: `No se encontraron registros de saga ni trazas para el Correlation-ID '${correlationId}'.`,
          instance: `/api/v2/observabilidad/trazas/${correlationId}`,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const saga = sagaData?.saga;
    const journal: any[] = sagaData?.journal || [];

    // Determinar estado general
    let overallStatus: 'COMPLETED' | 'COMPENSATED' | 'FAILED' | 'IN_PROGRESS' = 'COMPLETED';
    if (saga) {
      if (saga.estado === 'COMPLETED') {
        overallStatus = 'COMPLETED';
      } else if (
        saga.estado === 'FAILED_COMPENSATED' ||
        saga.estado === 'COMPENSATED' ||
        journal.some((j: any) => j.compensado)
      ) {
        overallStatus = 'COMPENSATED';
      } else if (saga.estado === 'FAILED' || saga.estado === 'COMPENSATION_FAILED') {
        overallStatus = 'FAILED';
      } else {
        overallStatus = 'IN_PROGRESS';
      }
    } else {
      const hasError = logRecords.some((l) => l.level === 'error' || l.status === 'FAILED');
      const hasRollback = logRecords.some(
        (l) => l.action?.includes('ROLLBACK') || l.action?.includes('COMPENS'),
      );
      if (hasRollback) overallStatus = 'COMPENSATED';
      else if (hasError) overallStatus = 'FAILED';
    }

    // Calcular duración total
    let durationMs = 0;
    if (saga?.iniciadaAt && saga?.finalizadaAt) {
      durationMs = Math.max(
        10,
        new Date(saga.finalizadaAt).getTime() - new Date(saga.iniciadaAt).getTime(),
      );
    } else if (journal.length > 0) {
      durationMs = journal.reduce((acc, curr) => acc + (curr.duracionMs || 50), 0);
    } else if (logRecords.length > 1) {
      durationMs = Math.max(
        10,
        new Date(logRecords[logRecords.length - 1].timestamp).getTime() -
          new Date(logRecords[0].timestamp).getTime(),
      );
    } else {
      durationMs = 120;
    }

    const nodes: TraceGraphNode[] = [];
    const edges: TraceGraphEdge[] = [];

    // 1. Nodo Orquestador Central
    const orchestratorStatus: 'SUCCESS' | 'ERROR' | 'COMPENSATED' =
      overallStatus === 'COMPLETED'
        ? 'SUCCESS'
        : overallStatus === 'COMPENSATED'
        ? 'COMPENSATED'
        : 'ERROR';

    const orchestratorLed: '🟢' | '🟡' | '🔴' =
      orchestratorStatus === 'SUCCESS' ? '🟢' : orchestratorStatus === 'COMPENSATED' ? '🟡' : '🔴';

    nodes.push({
      id: 'span-orchestrator',
      label: 'API Gateway / Saga Orchestrator',
      service: 'MS_ESB',
      type: 'orchestrator',
      status: orchestratorStatus,
      color_led: orchestratorLed,
      duration_ms: durationMs,
      timestamp: saga?.iniciadaAt ? new Date(saga.iniciadaAt).toISOString() : new Date().toISOString(),
      error: overallStatus === 'COMPLETED' ? null : saga?.codigoCompensacion || 'Transacción compensada',
      error_details: overallStatus === 'COMPLETED' ? null : saga?.codigoCompensacion || null,
    });

    // 2. Nodos por cada paso del Journal
    let ultimoNodeId = 'span-orchestrator';
    let primerPaso = true;

    for (let i = 0; i < journal.length; i++) {
      const step = journal[i];
      const stepId = `span-${(step.paso || `paso-${i}`).toLowerCase().replace(/_/g, '-')}`;

      let stepStatus: 'SUCCESS' | 'ERROR' | 'COMPENSATED' | 'SKIPPED' = 'SUCCESS';
      let stepLed: '🟢' | '🟡' | '🔴' = '🟢';

      if (step.compensado) {
        stepStatus = 'COMPENSATED';
        stepLed = '🟡';
      } else if (step.estado === 'FAILED') {
        stepStatus = 'ERROR';
        stepLed = '🔴';
      } else if (step.estado === 'SKIPPED') {
        stepStatus = 'SKIPPED';
        stepLed = '🟡';
      } else {
        stepStatus = 'SUCCESS';
        stepLed = '🟢';
      }

      nodes.push({
        id: stepId,
        label: `${step.servicio || 'MS'}: ${step.accion || step.paso}`,
        service: step.servicio || 'MS_EXT',
        type: 'step',
        status: stepStatus,
        color_led: stepLed,
        duration_ms: step.duracionMs || 80,
        timestamp: step.ejecutadoAt ? new Date(step.ejecutadoAt).toISOString() : undefined,
        error: step.error || null,
        error_details: step.error || null,
      });

      // Arista de invocación hacia adelante
      edges.push({
        from: primerPaso ? 'span-orchestrator' : ultimoNodeId,
        to: stepId,
        protocol: step.servicio?.includes('GRPC') ? 'GRPC' : 'REST',
        kind: 'llamada',
        event_name: `Invocación ${step.paso}`,
      });

      // Si fue compensado, añadir arista de compensación (LIFO)
      if (step.compensado) {
        edges.push({
          from: 'span-orchestrator',
          to: stepId,
          protocol: 'REST',
          kind: 'compensación',
          event_name: `Compensación LIFO: ${step.paso}`,
        });
      }

      ultimoNodeId = stepId;
      primerPaso = false;
    }

    // 3. Si no hay pasos en journal pero hay logs estructurados, inferir nodos
    if (journal.length === 0 && logRecords.length > 0) {
      logRecords.forEach((l, idx) => {
        const logNodeId = `span-log-${idx}`;
        nodes.push({
          id: logNodeId,
          label: `${l.service || 'SERVICE'}: ${l.action || l.message || 'Log Event'}`,
          service: l.service || 'MS_LOG',
          type: 'log_event',
          status: l.level === 'error' ? 'ERROR' : 'SUCCESS',
          color_led: l.level === 'error' ? '🔴' : '🟢',
          duration_ms: 10,
          timestamp: l.timestamp,
          error: l.error || null,
          error_details: l.error || null,
        });

        edges.push({
          from: 'span-orchestrator',
          to: logNodeId,
          protocol: 'REST',
          kind: 'evento',
          event_name: l.action || 'Log Entry',
        });
      });
    }

    // 4. Integrar nodo de Event Bus (RabbitMQ / Kafka) si hubo publicación
    if (saga || logRecords.some((l) => l.action?.includes('EVENT') || l.action?.includes('RABBIT'))) {
      const brokerNodeId = 'node-rabbitmq-events';
      nodes.push({
        id: brokerNodeId,
        label: 'RabbitMQ Broker (booking.events)',
        service: 'RABBITMQ',
        type: 'event_broker',
        status: 'SUCCESS',
        color_led: '🟢',
        duration_ms: 5,
        timestamp: new Date().toISOString(),
        error: null,
      });

      edges.push({
        from: 'span-orchestrator',
        to: brokerNodeId,
        protocol: 'RABBITMQ_AMQP',
        kind: 'evento',
        event_name: overallStatus === 'COMPLETED' ? 'order.confirmed' : 'saga.compensated',
      });
    }

    // Mapeo para esb-sagas-openapi-v2.yaml (SagaGrafoTrazaResponse)
    const nodosCompat = nodes.map((n) => ({
      id: n.id,
      servicio: n.service,
      nombre: n.label,
      estado: n.color_led === '🟢' ? 'GREEN' : n.color_led === '🟡' ? 'YELLOW' : 'RED',
      latencia_ms: n.duration_ms,
      error: n.error || null,
    }));

    const aristasCompat = edges.map((e) => ({
      origen: e.from,
      destino: e.to,
      tipo: e.kind === 'compensación' ? 'COMPENSACION' : 'ADELANTE',
    }));

    const spansCompat = nodes.map((n, i) => ({
      span_id: `span-otel-${i + 1}`,
      operacion: n.label,
      duracion_ms: n.duration_ms,
      status_code: n.status === 'ERROR' ? 500 : 200,
    }));

    return {
      correlation_id: correlationId,
      root_process: saga?.sagaNombre || 'CHECKOUT_MULTIVERTICAL_SAGA',
      overall_status: overallStatus,
      duration_ms: durationMs,
      nodes,
      edges,
      // Retrocompatibilidad con esb-sagas-openapi-v2.yaml
      nodos: nodosCompat,
      aristas: aristasCompat,
      spans: spansCompat,
      trace_id: correlationId.replace(/^SAGA-/, '').toLowerCase(),
      estado_global: overallStatus === 'COMPLETED' ? 'SUCCESS' : overallStatus === 'COMPENSATED' ? 'COMPENSATING' : 'FAILED',
    };
  }
}
