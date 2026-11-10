import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface InternalMeshNode {
  id: string;
  nombre: string;
  rol: string;
  sidecar: string;
  mtls: {
    activo: boolean;
    emisor: string;
    protocolo: string;
    algoritmo: string;
    fingerprint: string;
  };
  circuitBreaker: {
    estado: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    fallosConsecutivos: number;
    umbralFallos: number;
    ultimaAperturaAt: string | null;
  };
  metricasEsteOeste: {
    latenciaMs: number;
    peticionesTotal: number;
    exitosas: number;
    fallos: number;
    reintentos: number;
  };
}

@Injectable()
export class ServiceMeshService {
  private readonly logger = new Logger(ServiceMeshService.name);

  // Mapeo de microservicios internos en la malla (Tráfico Este-Oeste §8.4)
  private readonly nodos: Map<string, InternalMeshNode> = new Map([
    [
      'MS_CORE',
      {
        id: 'MS_CORE',
        nombre: 'Booking Core Backend (BFF)',
        rol: 'Ingress Point & Aggregator',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:A1:B2:C3:D4:E5:CORE:001',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 4,
          peticionesTotal: 1240,
          exitosas: 1238,
          fallos: 2,
          reintentos: 1,
        },
      },
    ],
    [
      'MS_ESB',
      {
        id: 'MS_ESB',
        nombre: 'Enterprise Service Bus (Orquestador)',
        rol: 'Sagas LIFO & Transaction Coordinator',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:E5:F6:A7:B8:C9:ESB:002',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 8,
          peticionesTotal: 840,
          exitosas: 835,
          fallos: 5,
          reintentos: 3,
        },
      },
    ],
    [
      'MS_PAG',
      {
        id: 'MS_PAG',
        nombre: 'Microservicio de Pagos & Conciliación',
        rol: 'Cobros, Holds y Reembolsos',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:D3:E4:F5:A6:B7:PAG:003',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 14,
          peticionesTotal: 620,
          exitosas: 618,
          fallos: 2,
          reintentos: 1,
        },
      },
    ],
    [
      'MS_STK',
      {
        id: 'MS_STK',
        nombre: 'Microservicio de Inventario gRPC',
        rol: 'Sincronización de Stock en RAM (:50051)',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:B7:C8:D9:E0:F1:STK:004',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 3,
          peticionesTotal: 1890,
          exitosas: 1890,
          fallos: 0,
          reintentos: 0,
        },
      },
    ],
    [
      'MS_FAC',
      {
        id: 'MS_FAC',
        nombre: 'Microservicio de Facturación Fiscal',
        rol: 'Emisión SRI & Generación de PDF',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:F2:A3:B4:C5:D6:FAC:005',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 18,
          peticionesTotal: 410,
          exitosas: 409,
          fallos: 1,
          reintentos: 1,
        },
      },
    ],
    [
      'MS_CLI',
      {
        id: 'MS_CLI',
        nombre: 'Microservicio de Clientes & Deduplicación',
        rol: 'Gestión de Perfiles y Cédulas Canónicas',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:C9:D0:E1:F2:A3:CLI:006',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 6,
          peticionesTotal: 980,
          exitosas: 979,
          fallos: 1,
          reintentos: 0,
        },
      },
    ],
    [
      'MS_PROV',
      {
        id: 'MS_PROV',
        nombre: 'Conectores a Proveedores Socios',
        rol: 'Vuelos, Autos, Atracciones, Hoteles',
        sidecar: 'Envoy-Sidecar-v1.28-embedded',
        mtls: {
          activo: true,
          emisor: 'booking-mesh-root-ca',
          protocolo: 'TLSv1.3 (Zero Trust)',
          algoritmo: 'ECDSA_P256_SHA256',
          fingerprint: 'SHA256:E4:F5:A6:B7:C8:PROV:007',
        },
        circuitBreaker: {
          estado: 'CLOSED',
          fallosConsecutivos: 0,
          umbralFallos: 5,
          ultimaAperturaAt: null,
        },
        metricasEsteOeste: {
          latenciaMs: 65,
          peticionesTotal: 1530,
          exitosas: 1512,
          fallos: 18,
          reintentos: 12,
        },
      },
    ],
  ]);

  /**
   * Obtiene el estado consolidado de la malla (mTLS, Sidecars, Circuit Breakers).
   */
  getMeshHealth() {
    const nodosArray = Array.from(this.nodos.values());
    const totalPeticiones = nodosArray.reduce((acc, n) => acc + n.metricasEsteOeste.peticionesTotal, 0);
    const totalExitosas = nodosArray.reduce((acc, n) => acc + n.metricasEsteOeste.exitosas, 0);
    const tasaExitoPct = totalPeticiones > 0 ? Math.round((totalExitosas / totalPeticiones) * 1000) / 10 : 100;
    const latenciaMediaMs = Math.round(
      nodosArray.reduce((acc, n) => acc + n.metricasEsteOeste.latenciaMs, 0) / nodosArray.length,
    );

    return {
      generadoEn: new Date().toISOString(),
      arquitectura: {
        tipo: 'Service Mesh Híbrido (Tráfico Este-Oeste §8.4)',
        patronSidecar: 'Envoy Proxy (intercepta llamadas inter-microservicio)',
        seguridad: 'mTLS Automático (Zero Trust - Cifrado mutuo interno)',
        resiliencia: 'Circuit Breaking granular + Reintentos uniformes',
        controlPlane: 'Istio-compatible control plane abstraction',
      },
      kpisMalla: {
        nodosEnMalla: nodosArray.length,
        nodosMtlsActivo: nodosArray.filter((n) => n.mtls.activo).length,
        circuitBreakersCerrados: nodosArray.filter((n) => n.circuitBreaker.estado === 'CLOSED').length,
        circuitBreakersAbiertos: nodosArray.filter((n) => n.circuitBreaker.estado === 'OPEN').length,
        tasaExitoEsteOestePct: tasaExitoPct,
        latenciaMediaEsteOesteMs: latenciaMediaMs,
      },
      nodos: nodosArray,
    };
  }

  /**
   * Registra una interacción Este-Oeste a través del sidecar proxy.
   */
  registrarInteraccion(origen: string, destino: string, latenciaMs: number, exitoso: boolean) {
    const nodo = this.nodos.get(destino);
    if (!nodo) return;

    nodo.metricasEsteOeste.peticionesTotal += 1;
    if (exitoso) {
      nodo.metricasEsteOeste.exitosas += 1;
      nodo.circuitBreaker.fallosConsecutivos = 0;
      if (nodo.circuitBreaker.estado === 'HALF_OPEN') {
        nodo.circuitBreaker.estado = 'CLOSED';
        this.logger.log(`Circuit Breaker para ${destino} pasó a CLOSED (recuperación exitosa)`);
      }
    } else {
      nodo.metricasEsteOeste.fallos += 1;
      nodo.circuitBreaker.fallosConsecutivos += 1;
      if (nodo.circuitBreaker.fallosConsecutivos >= nodo.circuitBreaker.umbralFallos) {
        nodo.circuitBreaker.estado = 'OPEN';
        nodo.circuitBreaker.ultimaAperturaAt = new Date().toISOString();
        this.logger.warn(`Circuit Breaker para ${destino} se disparó a OPEN (${nodo.circuitBreaker.fallosConsecutivos} fallos consecutivos)`);
      }
    }
    // Promedio móvil simple para latencia
    nodo.metricasEsteOeste.latenciaMs = Math.round((nodo.metricasEsteOeste.latenciaMs * 4 + latenciaMs) / 5);
  }

  /**
   * Valida si un microservicio puede recibir tráfico según su Circuit Breaker.
   */
  puedeTransitar(destino: string): boolean {
    const nodo = this.nodos.get(destino);
    if (!nodo) return true;
    if (nodo.circuitBreaker.estado === 'OPEN') {
      // Si pasaron más de 30 segundos, permitir sonda HALF_OPEN (§8.4)
      if (nodo.circuitBreaker.ultimaAperturaAt) {
        const transcurrido = Date.now() - new Date(nodo.circuitBreaker.ultimaAperturaAt).getTime();
        if (transcurrido > 30000) {
          nodo.circuitBreaker.estado = 'HALF_OPEN';
          this.logger.log(`Circuit Breaker para ${destino} entra en HALF_OPEN (sonda de prueba)`);
          return true;
        }
      }
      return false;
    }
    return true;
  }

  /**
   * Restablece manualmente el Circuit Breaker de un microservicio.
   */
  resetCircuitBreaker(servicioId: string) {
    const nodo = this.nodos.get(servicioId.toUpperCase());
    if (nodo) {
      nodo.circuitBreaker.estado = 'CLOSED';
      nodo.circuitBreaker.fallosConsecutivos = 0;
      nodo.circuitBreaker.ultimaAperturaAt = null;
      return { ok: true, mensaje: `Circuit Breaker de ${nodo.id} restablecido a CLOSED.` };
    }
    return { ok: false, mensaje: `Microservicio ${servicioId} no encontrado en la malla.` };
  }

  /**
   * Retorna el contenido del archivo declarativo de Istio (`deploy/istio-mesh.yaml`).
   */
  getDeclarativoIstio(): string {
    const ruta = path.join(process.cwd(), 'deploy', 'istio-mesh.yaml');
    if (fs.existsSync(ruta)) {
      return fs.readFileSync(ruta, 'utf-8');
    }
    return '# Manifiesto Istio no encontrado en disco';
  }

  /**
   * Retorna el contenido del archivo declarativo de Kong (`deploy/kong.yml`).
   */
  getDeclarativoKong(): string {
    const ruta = path.join(process.cwd(), 'deploy', 'kong.yml');
    if (fs.existsSync(ruta)) {
      return fs.readFileSync(ruta, 'utf-8');
    }
    return '# Manifiesto Kong no encontrado en disco';
  }
}

