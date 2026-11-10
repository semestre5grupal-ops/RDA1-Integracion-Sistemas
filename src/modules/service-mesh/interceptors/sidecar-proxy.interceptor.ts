import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ServiceMeshService } from '../service-mesh.service';

/**
 * Interceptor que emula el patrón Sidecar Proxy (Envoy) de un Service Mesh (§8.4).
 * Intercepta de forma transparente el tráfico interno este-oeste, inyectando
 * encabezados de malla (mTLS, trazas) y evaluando el Circuit Breaker del nodo destino.
 */
@Injectable()
export class SidecarProxyInterceptor implements NestInterceptor {
  constructor(private readonly meshService: ServiceMeshService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // Determinar destino interno
    const ruta = req.url || '';
    let destino = 'MS_CORE';
    if (ruta.includes('/pagos')) destino = 'MS_PAG';
    else if (ruta.includes('/facturas')) destino = 'MS_FAC';
    else if (ruta.includes('/inventory') || ruta.includes('/stock')) destino = 'MS_STK';
    else if (ruta.includes('/clientes')) destino = 'MS_CLI';
    else if (ruta.includes('/nodes') || ruta.includes('/proveedores')) destino = 'MS_PROV';
    else if (ruta.includes('/esb')) destino = 'MS_ESB';

    const origen = req.headers['x-mesh-source'] || 'MS_CORE';

    // Verificación del Circuit Breaker en el sidecar
    if (!this.meshService.puedeTransitar(destino)) {
      throw new ServiceUnavailableException(
        `[Service Mesh Sidecar] Circuit Breaker OPEN para ${destino}. El tráfico este-oeste ha sido aislado temporalmente para proteger el ecosistema.`,
      );
    }

    // Inyección de encabezados de malla (Zero Trust y trazabilidad distribuida)
    const correlationId =
      req.headers['x-correlation-id'] ||
      `mesh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const traceparent =
      req.headers['traceparent'] ||
      `00-${Math.random().toString(16).substring(2, 18).padStart(32, '0')}-${Math.random().toString(16).substring(2, 10).padStart(16, '0')}-01`;

    req.headers['x-mesh-source'] = origen;
    req.headers['x-mesh-destination'] = destino;
    req.headers['x-mesh-mtls'] = 'active';
    req.headers['x-mesh-traceparent'] = traceparent;

    if (res && res.setHeader) {
      res.setHeader('X-Mesh-mTLS', 'active (Zero Trust TLSv1.3)');
      res.setHeader('X-Mesh-Sidecar', 'Envoy-Sidecar-v1.28-embedded');
      res.setHeader('X-Mesh-Correlation-Id', correlationId);
    }

    const inicio = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const duracion = Date.now() - inicio;
          this.meshService.registrarInteraccion(origen, destino, duracion, true);
        },
        error: () => {
          const duracion = Date.now() - inicio;
          this.meshService.registrarInteraccion(origen, destino, duracion, false);
        },
      }),
    );
  }
}

