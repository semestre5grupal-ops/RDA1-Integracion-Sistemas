import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { TraceContextService } from '../../core/tracing/trace-context.service';

export interface ConnectorNode {
  id: string;
  nombre: string;
  vertical: string;
  protocolo: string;
  url: string;
  enabled: boolean;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'DISABLED';
  latency: number;
  lastCheck: string;
  circuitBreaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'MANUALLY_OPEN';
  consecutiveFailures: number;
  errorRate: number;
  description: string;
  responsable: string;
}

@Injectable()
export class ConnectorHealthService {
  private readonly logger = new Logger(ConnectorHealthService.name);

  // Registro de nodos del ecosistema distribuido (Consideraciones RDA2 §3 - Brecha B-03)
  private readonly nodes: Map<string, ConnectorNode> = new Map();

  constructor(
    private readonly httpService: HttpService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {
    this.traceContext?.instrumentAxios(this.httpService.axiosRef);
    this.initDefaultNodes();
  }

  private initDefaultNodes() {
    const defaultNodes: ConnectorNode[] = [
      {
        id: 'atracciones',
        nombre: 'Sistema Atracciones & Tours',
        vertical: 'Atracciones',
        protocolo: 'REST / OpenAPI v2 + Circuit Breaker',
        url: process.env.TIENDA_ATRACCIONES_URL || 'https://descubreec.com/api/v2',
        enabled: true,
        status: 'ONLINE',
        latency: 18,
        lastCheck: new Date().toISOString(),
        circuitBreaker: 'CLOSED',
        consecutiveFailures: 0,
        errorRate: 0.1,
        description: 'Catálogo de tours turísticos, franjas horarias y reversos automáticos de stock.',
        responsable: 'Dilan (Compañero Externo)',
      },
      {
        id: 'autos',
        nombre: 'Sistema Renta de Autos & Flota',
        vertical: 'Autos',
        protocolo: 'REST / OpenAPI v2 + Cooldown 2h',
        url: process.env.TIENDA_AUTOS_URL || 'http://localhost:3000/api/v2/autos',
        enabled: true,
        status: 'ONLINE',
        latency: 24,
        lastCheck: new Date().toISOString(),
        circuitBreaker: 'CLOSED',
        consecutiveFailures: 0,
        errorRate: 0.2,
        description: 'Gestión de vehículos, depósitos, máquina de estados y coberturas de franquicia.',
        responsable: 'Equipo Autos (Compañero Externo)',
      },
      {
        id: 'alojamientos',
        nombre: 'Sistema Alojamientos & Hospedaje',
        vertical: 'Alojamientos',
        protocolo: 'REST / API Key Sync (X-Api-Key)',
        url: process.env.TIENDA_ALOJAMIENTOS_URL || 'http://localhost:3000/api/v2/alojamientos',
        enabled: true,
        status: 'ONLINE',
        latency: 15,
        lastCheck: new Date().toISOString(),
        circuitBreaker: 'CLOSED',
        consecutiveFailures: 0,
        errorRate: 0.05,
        description: 'Sincronización de habitaciones, tarifas dinámicas y políticas de cancelación.',
        responsable: 'Equipo Alojamientos (Compañero Externo)',
      },
      {
        id: 'vuelos',
        nombre: 'Sistema Vuelos & Aerolíneas',
        vertical: 'Vuelos',
        protocolo: 'REST / SOAP Translation Gateway',
        url: process.env.TIENDA_VUELOS_URL || 'http://localhost:3000/api/v2/vuelos',
        enabled: true,
        status: 'ONLINE',
        latency: 42,
        lastCheck: new Date().toISOString(),
        circuitBreaker: 'CLOSED',
        consecutiveFailures: 0,
        errorRate: 0.4,
        description: 'Búsqueda de itinerarios, asignación de asientos y bloqueo temporal de cupos.',
        responsable: 'Equipo Vuelos (Compañero Externo)',
      },
      {
        id: 'grpc_inventory',
        nombre: 'Servidor Inbound de Inventario gRPC',
        vertical: 'Infraestructura Core',
        protocolo: 'gRPC / HTTP/2 Multiplexed (Port 50051)',
        url: '0.0.0.0:50051',
        enabled: true,
        status: 'ONLINE',
        latency: 4,
        lastCheck: new Date().toISOString(),
        circuitBreaker: 'CLOSED',
        consecutiveFailures: 0,
        errorRate: 0.0,
        description: 'Socket de streaming continuo para recepción en tiempo real de variaciones de stock.',
        responsable: 'Booking Gateway (Plataforma)',
      },
    ];

    for (const node of defaultNodes) {
      this.nodes.set(node.id, node);
    }
  }

  /**
   * Consulta el estado de todos los nodos y opcionalmente sondea la red.
   */
  async getNodesHealth(probe: boolean = false): Promise<{ summary: any; nodes: ConnectorNode[] }> {
    if (probe) {
      await this.probeAllNodes();
    }

    const nodesList = Array.from(this.nodes.values());
    const onlineCount = nodesList.filter((n) => n.enabled && n.status === 'ONLINE').length;
    const disabledCount = nodesList.filter((n) => !n.enabled).length;
    const offlineCount = nodesList.filter((n) => n.enabled && n.status === 'OFFLINE').length;

    return {
      summary: {
        total_nodes: nodesList.length,
        online: onlineCount,
        disabled_switches: disabledCount,
        offline: offlineCount,
        system_health: offlineCount > 0 ? 'DEGRADED' : disabledCount > 0 ? 'PARTIAL_FALLBACK' : 'HEALTHY',
        timestamp: new Date().toISOString(),
      },
      nodes: nodesList,
    };
  }

  /**
   * Evalúa si un nodo está operativo y habilitado por el switch manual.
   */
  isNodeEnabled(serviceId: string): boolean {
    const node = this.nodes.get(serviceId);
    return node ? node.enabled : true;
  }

  /**
   * Actualiza en vivo la URL oficial de un conector socio en memoria (Cátedra RDA2 CE01).
   */
  updateNodeUrl(serviceId: string, newUrl: string): ConnectorNode {
    let target = this.nodes.get(serviceId);
    if (!target) {
      for (const [id, n] of this.nodes.entries()) {
        if (id.toLowerCase() === serviceId.toLowerCase() || n.vertical.toLowerCase() === serviceId.toLowerCase()) {
          target = n;
          break;
        }
      }
    }

    if (!target) {
      throw new Error(`El conector con ID o vertical '${serviceId}' no existe en la red.`);
    }

    const prevUrl = target.url;
    target.url = newUrl;
    target.lastCheck = new Date().toISOString();
    this.logger.log(`[PARAMETRIZACIÓN EN VIVO] URL de '${target.id}' actualizada a: ${newUrl}`);

    this.winstonLogger.logAudit('NODE_URL_PARAMETRIZADA_EN_VIVO', {
      service_id: target.id,
      nombre: target.nombre,
      previous_url: prevUrl,
      new_url: newUrl,
      timestamp: new Date().toISOString(),
    });

    return target;
  }

  /**
   * Conmuta el switch manual (Kill-Switch) de un conector externo para demostración docente (Brecha B-03).
   */
  toggleNode(serviceId: string, forceEnabled?: boolean): ConnectorNode {
    const node = this.nodes.get(serviceId);
    if (!node) {
      throw new Error(`El conector con ID '${serviceId}' no existe en la red.`);
    }

    const prevEnabled = node.enabled;
    const newEnabled = forceEnabled !== undefined ? forceEnabled : !prevEnabled;

    node.enabled = newEnabled;
    node.lastCheck = new Date().toISOString();

    if (!newEnabled) {
      node.status = 'DISABLED';
      node.circuitBreaker = 'MANUALLY_OPEN';
      this.logger.warn(`[KILL-SWITCH ACTIVADO] Conector '${serviceId}' DESCONECTADO manualmente por el Administrador.`);
    } else {
      node.status = 'ONLINE';
      node.circuitBreaker = 'CLOSED';
      node.consecutiveFailures = 0;
      this.logger.log(`[KILL-SWITCH RESTABLECIDO] Conector '${serviceId}' HABILITADO por el Administrador.`);
    }

    // Auditoría física en logs/audit-YYYY-MM-DD.log (Consideraciones RDA2 §2)
    this.winstonLogger.logAudit('NODE_KILL_SWITCH_TOGGLED', {
      service_id: serviceId,
      nombre: node.nombre,
      previous_state: prevEnabled ? 'ENABLED' : 'DISABLED',
      new_state: newEnabled ? 'ENABLED' : 'DISABLED',
      circuit_breaker: node.circuitBreaker,
      timestamp: new Date().toISOString(),
    });

    return node;
  }

  /**
   * Prueba de conectividad ping hacia un nodo específico con timeout reglamentario de 5s (CE01).
   */
  async pingNode(serviceId: string): Promise<ConnectorNode> {
    const node = this.nodes.get(serviceId);
    if (!node) {
      throw new Error(`Conector '${serviceId}' no encontrado.`);
    }

    if (!node.enabled) {
      return node; // No sondear si el switch manual está apagado
    }

    const t0 = Date.now();
    try {
      if (node.id === 'grpc_inventory') {
        // El servidor gRPC local siempre está listo si el microservicio está arriba
        node.latency = Math.max(1, Date.now() - t0);
        node.status = 'ONLINE';
        node.lastCheck = new Date().toISOString();
        return node;
      }

      const res = await firstValueFrom(
        this.httpService.get(node.url, { timeout: 5000 }).pipe(
          timeout(5000),
          catchError((err) => {
            return of({ status: err.response?.status || 500 });
          }),
        ),
      );

      const latency = Date.now() - t0;
      node.latency = latency;
      node.lastCheck = new Date().toISOString();

      if (res.status >= 200 && res.status < 400) {
        node.status = 'ONLINE';
        node.circuitBreaker = 'CLOSED';
        node.consecutiveFailures = 0;
      } else {
        node.status = 'DEGRADED';
        node.consecutiveFailures++;
      }
    } catch (err) {
      node.latency = Date.now() - t0;
      node.status = 'OFFLINE';
      node.consecutiveFailures++;
      if (node.consecutiveFailures >= 3) {
        node.circuitBreaker = 'OPEN';
      }
    }

    return node;
  }

  /**
   * Sondea todos los nodos en paralelo para actualizar semáforos.
   */
  private async probeAllNodes() {
    const probePromises = Array.from(this.nodes.keys()).map((id) => this.pingNode(id));
    await Promise.allSettled(probePromises);
  }
}
