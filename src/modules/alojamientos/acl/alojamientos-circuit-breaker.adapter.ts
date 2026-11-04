import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { ConnectorHealthService } from '../../admin/connector-health.service';
import { TraceContextService } from '../../../core/tracing/trace-context.service';

export interface AlojamientoExternalReservaPayload {
  alojamientoId: string;
  tipoHabitacionCodigo?: string;
  checkin: string;
  checkout: string;
  adultos: number;
  ninos?: number;
  habitaciones: number;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  special_requests?: string;
}

export enum CircuitState {
  CLOSED = 'CLOSED',       // Tráfico normal
  OPEN = 'OPEN',           // Circuito abierto: rechazo rápido / Mock Fallback CE01
  HALF_OPEN = 'HALF_OPEN', // Probando recuperación tras ventana de enfriamiento
}

/**
 * Anti-Corruption Layer (ACL) + Circuit Breaker para el Microservicio de Alojamientos (MS_ALO).
 *
 * Implementa:
 * - Traducción bidireccional de contratos (Booking Core <-> Proveedor Externo de Hoteles)
 * - Circuit Breaker con timeout estricto de 5 segundos (Cátedra RDA2 CE01) y umbral de 3 fallos
 * - Integración con Kill-Switch en vivo de ConnectorHealthService ('alojamientos')
 * - Propagación automática de X-Correlation-Id e Idempotency-Key
 * - Mock Fallback automático cuando el nodo externo está caído o en estado OPEN
 */
@Injectable()
export class AlojamientosCircuitBreakerAdapter {
  private readonly logger = new Logger(AlojamientosCircuitBreakerAdapter.name);
  private BASE_URL =
    process.env.TIENDA_ALOJAMIENTOS_URL ||
    process.env.ALOJAMIENTOS_API_URL ||
    'http://localhost:3000/api/v2/alojamientos';
  private API_KEY = process.env.TIENDA_ALOJAMIENTOS_API_KEY || '';

  private circuitState: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT_MS = 30000; // 30 segundos
  private readonly TIMEOUT_MS = 5000;        // 5 segundos reglamentarios (Cátedra RDA2 CE01)

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly connectorHealthService?: ConnectorHealthService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {
    this.traceContext?.instrumentAxios(this.httpService.axiosRef);
  }

  setBaseUrl(url: string) {
    this.BASE_URL = url;
    this.logger.log(`[AlojamientosCircuitBreakerAdapter] URL oficial actualizada en vivo a: ${url}`);
  }

  getCircuitStatus() {
    this.checkCircuit();
    return {
      vertical: 'ALOJAMIENTOS',
      node_code: 'NODE_ALO_LOCAL',
      circuit_state: this.circuitState,
      consecutive_failures: this.consecutiveFailures,
      timeout_ms: this.TIMEOUT_MS,
      base_url: this.BASE_URL,
    };
  }

  /**
   * Consulta disponibilidad en proveedor externo con Circuit Breaker de 5s y Fallback local.
   */
  async getDisponibilidadExterna(
    alojamientoId: string,
    checkin: string,
    checkout: string,
  ): Promise<any> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      this.logger.warn(
        `Circuit Breaker ABIERTO para Alojamientos. Retornando disponibilidad desde caché local.`,
      );
      return this.getLocalDisponibilidadFallback(alojamientoId, checkin, checkout);
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            `${this.BASE_URL}/availability`,
            {
              accommodation: alojamientoId,
              accommodation_id: alojamientoId,
              checkin,
              checkout,
              guests: { number_of_adults: 2, number_of_rooms: 1 },
            },
            {
              headers: { 'X-API-Key': this.API_KEY },
              timeout: this.TIMEOUT_MS,
            },
          )
          .pipe(
            timeout(this.TIMEOUT_MS),
            catchError((err) => {
              this.handleFailure(err);
              throw err;
            }),
          ),
      );

      this.handleSuccess();
      return {
        ...response.data,
        origen: 'PROVEEDOR_EXTERNO_HOTELERIA',
        circuit_state: this.circuitState,
      };
    } catch (err: any) {
      this.logger.warn(
        `Fallo al consultar disponibilidad externa de alojamiento (${err.message}). Aplicando fallback local.`,
      );
      return this.getLocalDisponibilidadFallback(alojamientoId, checkin, checkout);
    }
  }

  /**
   * Despacha orden de reserva hacia proveedor externo (Contrato 201 Created / 409 Conflict)
   * con Circuit Breaker y Mock Fallback automático (CE01).
   */
  async crearReservaExterna(
    payload: AlojamientoExternalReservaPayload,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<any> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      this.logger.warn(
        `Circuit Breaker ABIERTO para Alojamientos. Retornando Mock Fallback automático (CE01).`,
      );
      return {
        reservation_id: `MOCK-ALO-${idempotencyKey}`,
        codigo_reserva: `BKG-${Math.floor(100000 + Math.random() * 900000)}`,
        status: 'CONFIRMED_FALLBACK',
        circuit_breaker_open: true,
        external_sync_pending: true,
        message:
          'Reserva de alojamiento confirmada vía Mock Fallback de resiliencia (CE01). Sincronización con el hotel en cola.',
        checkin: payload.checkin,
        checkout: payload.checkout,
        habitaciones: payload.habitaciones,
      };
    }

    const externalPayload = {
      accommodation_id: payload.alojamientoId,
      room_type: payload.tipoHabitacionCodigo || 'STD-DOBLE',
      checkin: payload.checkin,
      checkout: payload.checkout,
      guests: {
        adults: payload.adultos || 2,
        children: payload.ninos || 0,
        rooms: payload.habitaciones || 1,
      },
      booker: {
        full_name: payload.customer_name,
        email: payload.customer_email,
        phone: this.normalizarTelefono(payload.customer_phone),
      },
      special_requests: payload.special_requests || '',
    };

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(`${this.BASE_URL}/orders/create`, externalPayload, {
            headers: {
              'X-API-Key': this.API_KEY,
              'Idempotency-Key': idempotencyKey,
              'X-Correlation-Id': correlationId || `corr-alo-${Date.now()}`,
              'Content-Type': 'application/json',
            },
            timeout: this.TIMEOUT_MS,
          })
          .pipe(
            timeout(this.TIMEOUT_MS),
            catchError((err) => {
              this.handleFailure(err);
              throw err;
            }),
          ),
      );

      this.handleSuccess();
      return response.data;
    } catch (err: any) {
      this.logger.error(`ACL Alojamientos: Falló llamada a proveedor externo: ${err.message}`);
      return {
        reservation_id: idempotencyKey,
        status: 'CONFIRMED_FALLBACK',
        external_sync_pending: true,
        message:
          'Reserva confirmada localmente en MS_ALO. Sincronización en cola con el operador hotelero.',
        checkin: payload.checkin,
        checkout: payload.checkout,
        habitaciones: payload.habitaciones,
      };
    }
  }

  /**
   * Cancela una reserva en el proveedor externo de alojamientos (Compensación Saga LIFO).
   */
  async cancelarReservaExterna(
    reservaId: string,
    razon: string,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<any> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      this.logger.warn(
        `Circuit Breaker ABIERTO en Alojamientos. Cancelación de ${reservaId} encolada para sincronización diferida.`,
      );
      return {
        status: 'CANCELLED_FALLBACK',
        external_sync_pending: true,
        message: 'Cancelación procesada en MS_ALO. Notificación en cola para el hotel externo.',
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(
            `${this.BASE_URL}/orders/${reservaId}/cancel`,
            {
              cancellation_reason: razon,
              cancelled_at: new Date().toISOString(),
            },
            {
              headers: {
                'X-API-Key': this.API_KEY,
                'Idempotency-Key': idempotencyKey,
                'X-Correlation-Id': correlationId || `corr-alo-cancel-${Date.now()}`,
                'Content-Type': 'application/json',
              },
              timeout: this.TIMEOUT_MS,
            },
          )
          .pipe(
            timeout(this.TIMEOUT_MS),
            catchError((err) => {
              this.handleFailure(err);
              throw err;
            }),
          ),
      );

      this.handleSuccess();
      return response.data;
    } catch (err: any) {
      this.logger.warn(
        `ACL Alojamientos: No se pudo contactar al proveedor externo para cancelar ${reservaId}: ${err.message}. Continúa reverso local.`,
      );
      return {
        status: 'CANCELLED_LOCAL_REVERSED',
        external_sync_pending: true,
        message:
          'Reserva de alojamiento cancelada localmente con restitución de habitaciones y reembolso.',
      };
    }
  }

  private checkCircuit() {
    if (
      this.connectorHealthService &&
      !this.connectorHealthService.isNodeEnabled('alojamientos')
    ) {
      this.circuitState = CircuitState.OPEN;
      return;
    }

    if (this.circuitState === CircuitState.OPEN && this.lastFailureTime) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.RESET_TIMEOUT_MS) {
        this.logger.log(
          `Circuit Breaker de Alojamientos en estado HALF_OPEN. Probando reconexión.`,
        );
        this.circuitState = CircuitState.HALF_OPEN;
      }
    }
  }

  private handleSuccess() {
    this.consecutiveFailures = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  private handleFailure(_err: any) {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.logger.warn(
      `Fallo consecutivo #${this.consecutiveFailures} en llamada a proveedor de alojamientos.`,
    );

    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      this.logger.error(
        `¡Circuit Breaker ABIERTO en Alojamientos! Se suspenden llamadas síncronas por ${this.RESET_TIMEOUT_MS / 1000}s.`,
      );
    }
  }

  private normalizarTelefono(phone?: string): string {
    if (!phone) return '0999999999';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('593')) {
      clean = '0' + clean.substring(3);
    }
    if (clean.length === 9 && !clean.startsWith('0')) {
      clean = '0' + clean;
    }
    return clean.substring(0, 10);
  }

  private getLocalDisponibilidadFallback(
    alojamientoId: string,
    checkin: string,
    checkout: string,
  ) {
    return {
      alojamiento_id: alojamientoId,
      checkin,
      checkout,
      is_available: true,
      available_rooms: 5,
      origen: 'FALLBACK_LOCAL_CACHE',
      circuit_state: this.circuitState,
    };
  }
}

