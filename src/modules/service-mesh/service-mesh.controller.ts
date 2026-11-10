import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServiceMeshService } from './service-mesh.service';

@ApiTags('Service Mesh & Gateway (Semana 08)')
@Controller('admin/mesh')
export class ServiceMeshController {
  constructor(private readonly meshService: ServiceMeshService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Estado de salud de la Malla de Servicios (Tráfico Este-Oeste §8.4)',
    description:
      'Retorna el estado de los sidecars Envoy, mTLS automático (Zero Trust), estado de los Circuit Breakers y métricas de latencia inter-servicio.',
  })
  @ApiResponse({ status: 200, description: 'Estado consolidado de la malla.' })
  getMeshHealth() {
    return this.meshService.getMeshHealth();
  }

  @Get('telemetria')
  @ApiOperation({
    summary: 'Métricas de telemetría Este-Oeste de la malla',
    description: 'Métricas de latencia, tasa de éxito y volumen de peticiones internas entre microservicios.',
  })
  getTelemetria() {
    return this.meshService.getMeshHealth();
  }

  @Post('circuit-breaker/:service/reset')
  @ApiOperation({
    summary: 'Restablecer Circuit Breaker de un microservicio en la malla',
    description: 'Pone el estado del Circuit Breaker de un nodo interno en CLOSED para permitir tránsito.',
  })
  @ApiParam({ name: 'service', example: 'MS_PAG', description: 'Código del microservicio' })
  resetCircuitBreaker(@Param('service') service: string) {
    return this.meshService.resetCircuitBreaker(service);
  }

  @Get('declarativo/istio')
  @ApiOperation({
    summary: 'Descargar manifiesto declarativo de Istio para tráfico Este-Oeste (§8.4)',
    description: 'Devuelve la configuración YAML de Istio (VirtualService, DestinationRule, PeerAuthentication mTLS).',
  })
  getIstioManifest() {
    return {
      archivo: 'deploy/istio-mesh.yaml',
      formato: 'YAML / Kubernetes Custom Resource Definitions (CRDs)',
      contenido: this.meshService.getDeclarativoIstio(),
    };
  }

  @Get('declarativo/kong')
  @ApiOperation({
    summary: 'Descargar manifiesto declarativo de Kong Gateway para tráfico Norte-Sur (§8.3)',
    description: 'Devuelve la configuración declarativa kong.yml DB-less con plugins de seguridad.',
  })
  getKongManifest() {
    return {
      archivo: 'deploy/kong.yml',
      formato: 'YAML / Kong DB-less 3.0',
      contenido: this.meshService.getDeclarativoKong(),
    };
  }
}

