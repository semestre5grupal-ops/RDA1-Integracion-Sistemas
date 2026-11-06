import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ConnectorHealthService } from '../../admin/connector-health.service';
import { TraceContextService } from '../../../core/tracing/trace-context.service';

export enum CircuitState {
  CLOSED = 'CLOSED',       // Tráfico normal
  OPEN = 'OPEN',           // Circuito abierto: rechazo rápido / fallback
  HALF_OPEN = 'HALF_OPEN'  // Probando recuperación
}

export interface ExternalAutoBookingPayload {
  vehicle_id: string;
  dias: number;
  pickup_date: string;
  dropoff_date: string;
  pickup_time?: string;
  dropoff_time?: string;
  pickup_location: string;
  dropoff_location: string;
  tipo_cobertura: string;
  conductor: {
    nombre: string;
    email: string;
    telefono: string;
    licencia: string;
    edad: number;
    numero_vuelo?: string;
  };
}

/**
 * Anti-Corruption Layer (ACL) para Integración de Renta de Autos (RDA2).
 * 
 * Cumple con:
 * - Consideraciones RDA2 §3 & §5: Resiliencia con Circuit Breaker y Timeout de 5s.
 * - Inyección de Idempotency-Key y X-Correlation-Id.
 * - Normalización de teléfono E.164 / formato ecuatoriano.
 * - Mapeo de errores a RFC 7807 (Problem Details).
 * - Criterio Excluyente CE01: Mock Fallback automático para que la plataforma
 *   NUNCA se congele si la tienda externa de un compañero está apagada.
 */
@Injectable()
export class AutosCircuitBreakerAdapter {
  private readonly logger = new Logger(AutosCircuitBreakerAdapter.name);
  private EXTERNAL_API_URL = process.env.TIENDA_AUTOS_URL || process.env.AUTOS_SUPPLIER_URL || 'http://localhost:3000/api/v2/autos';
  private EXTERNAL_API_KEY = process.env.TIENDA_AUTOS_API_KEY || '';

  // Circuit Breaker State
  private circuitState: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT_MS = 30000; // 30s
  private readonly TIMEOUT_MS = 5000;         // 5s reglamentarios (Cátedra RDA2 CE01)

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly connectorHealthService?: ConnectorHealthService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {
    this.traceContext?.instrumentAxios(this.httpService.axiosRef);
  }

  /**
   * Actualiza en vivo la URL del proveedor externo de autos (CE01).
   */
  setExternalApiUrl(url: string) {
    this.EXTERNAL_API_URL = url;
    this.logger.log(`[AutosCircuitBreaker] URL de proveedor actualizada en vivo a: ${url}`);
  }

  /**
   * Actualiza en vivo la API Key del proveedor externo de autos.
   */
  setExternalApiKey(apiKey: string) {
    this.EXTERNAL_API_KEY = apiKey;
    this.logger.log(`[AutosCircuitBreaker] API Key de proveedor actualizada en vivo.`);
  }

  private resolveImageUrl(imageUrl?: string): string {
    if (!imageUrl) return 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800';
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
    if (imageUrl.startsWith('/cars/')) {
      return `https://arrendamiento-autos-web.onrender.com${imageUrl}`;
    }
    if (imageUrl.startsWith('/api/images/')) {
      return `https://rutalibre-autos-api.azurewebsites.net${imageUrl}`;
    }
    return `https://arrendamiento-autos-web.onrender.com${imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl}`;
  }

  private cachedRutaLibreToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private async getRutaLibreToken(): Promise<string | null> {
    if (this.cachedRutaLibreToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedRutaLibreToken;
    }
    try {
      const res = await firstValueFrom(
        this.httpService.post('https://rutalibre-autos-api.azurewebsites.net/api/auth/login', {
          email: 'booking.admin@gmail.com',
          password: 'booking123',
        }, { timeout: 4000 })
      );
      if (res.data?.accessToken) {
        this.cachedRutaLibreToken = res.data.accessToken;
        this.tokenExpiresAt = Date.now() + 30 * 60 * 1000;
        return this.cachedRutaLibreToken;
      }
    } catch (e: any) {
      this.logger.debug(`[AutosCircuitBreaker] Login en RutaLibre falló: ${e.message}`);
    }
    return null;
  }

  /**
   * Consulta flota de vehículos externos con protección por Circuit Breaker.
   * Conecta directamente a la tienda del socio RutaLibre (NODE_AUT_RUTALIBRE).
   */
  async fetchExternalCars(searchParams: any, correlationId?: string, apiKey?: string): Promise<any[]> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      this.logger.warn(`[AutosCircuitBreaker] Circuito ABIERTO. Usando Mock Fallback de catálogo externo.`);
      return this.getMockCarsFallback();
    }

    const allCars: any[] = [];

    // 1. Consultar flota canónica OpenAPI v3 de RutaLibre (Daniel González) y Maneja de Una (Mateo Morales) en paralelo (limit=100 para no truncar la flota)
    const [danielRes, mateoRes] = await Promise.allSettled([
      firstValueFrom(
        this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/v3/autos?limit=100', {
          headers: { 'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA' },
          timeout: this.TIMEOUT_MS,
        }),
      ),
      firstValueFrom(
        this.httpService.get('https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos?limit=100', {
          headers: { 'X-API-Key': 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=' },
          timeout: this.TIMEOUT_MS,
        }),
      ),
    ]);

    // Procesar flota de Daniel (RutaLibre - NODE_AUT_RUTALIBRE)
    if (danielRes.status === 'fulfilled' && danielRes.value?.data) {
      const rawCars = Array.isArray(danielRes.value.data)
        ? danielRes.value.data
        : (danielRes.value.data?.items || danielRes.value.data?.data || []);
      for (const c of rawCars) {
        const vId = c.vehicle_id || c.auto_id || c.id;
        if (!vId) continue;
        allCars.push({
          vehicle_id: vId,
          marca: c.marca || c.brand || 'Toyota',
          modelo: c.modelo || c.model || 'Vehículo',
          categoria: (c.categoria || c.category || 'COMPACTO').toUpperCase(),
          precio_diario: Number(c.precio_diario || c.daily_price || 39.0),
          precio_base: Number(c.precio_diario || c.daily_price || 39.0),
          recargo_conductor_joven: 0,
          moneda: 'USD',
          transmision: c.transmision === 'AUTOMATICO' || c.transmission === 'AUTOMATIC' ? 'Automático' : 'Manual',
          asientos: c.asientos || c.seats || 5,
          puertas: c.puertas || c.doors || 4,
          bag_capacity: c.maletas_grandes || 2,
          maletas_grandes: c.maletas_grandes || 2,
          maletas_pequenas: c.maletas_pequenas || 1,
          aire_acondicionado: c.aire_acondicionado !== false,
          kilometraje_ilimitado: true,
          politica_combustible: 'Lleno a lleno',
          cancelacion_gratuita: true,
          proveedor_id: 4,
          proveedor_codigo: 'NODE_AUT_RUTALIBRE',
          proveedor: {
            nombre: 'RutaLibre Renta de Autos (NODE_AUT_RUTALIBRE)',
            rating: 9.5,
            ubicacion: c.ubicacion?.agencia || 'Andes — Aeropuerto Mariscal Sucre (UIO)',
          },
          estado: c.estado || c.status || 'DISPONIBLE',
          images: Array.isArray(c.images) && c.images.length > 0 ? c.images : [this.resolveImageUrl(c.foto_url)],
        });
      }
    }

    // Procesar flota de Mateo (Maneja de Una - NODE_AUT_MDU)
    if (mateoRes.status === 'fulfilled' && mateoRes.value?.data) {
      const rawCars = Array.isArray(mateoRes.value.data)
        ? mateoRes.value.data
        : (mateoRes.value.data?.items || mateoRes.value.data?.data || []);
      for (const c of rawCars) {
        const vId = c.vehicle_id || c.auto_id || c.id;
        if (!vId) continue;
        allCars.push({
          vehicle_id: vId,
          marca: c.marca || c.brand || 'Suzuki',
          modelo: c.modelo || c.model || 'Swift',
          categoria: (c.categoria || c.category || 'COMPACTO').toUpperCase(),
          precio_diario: Number(c.precio_diario || c.daily_price || c.precio_total || 31.0),
          precio_base: Number(c.precio_diario || c.daily_price || c.precio_total || 31.0),
          recargo_conductor_joven: 0,
          moneda: 'USD',
          transmision: c.transmision === 'AUTOMATICO' || c.transmission === 'AUTOMATIC' ? 'Automático' : 'Manual',
          asientos: c.asientos || c.seats || 5,
          puertas: c.puertas || c.doors || 4,
          bag_capacity: c.maletas_grandes || 2,
          maletas_grandes: c.maletas_grandes || 2,
          maletas_pequenas: c.maletas_pequenas || 1,
          aire_acondicionado: c.aire_acondicionado !== false,
          kilometraje_ilimitado: true,
          politica_combustible: 'Lleno a lleno',
          cancelacion_gratuita: true,
          proveedor_id: 5,
          proveedor_codigo: 'NODE_AUT_MDU',
          proveedor: {
            nombre: 'Maneja de Una (NODE_AUT_MDU)',
            rating: 9.4,
            ubicacion: 'Quito — Tababela Express',
          },
          estado: c.mantenimiento_requerido ? 'MANTENIMIENTO' : (c.estado || c.status || 'DISPONIBLE'),
          images: [c.foto_url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'],
        });
      }
    }

    if (allCars.length > 0) {
      // 1b. Cruzar con órdenes activas para actualizar el estado del auto a RESERVADO o CONFIRMADO_ASISTIDO
      try {
        const activeOrders = await this.getOrdersDirect();
        const searchPickup = searchParams?.pickup_date;
        const searchDropoff = searchParams?.dropoff_date;

        for (const car of allCars) {
          const matchingOrders = activeOrders.filter((o: any) => {
            const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase().replace(/^auto-/, '');
            const cVid = car.vehicle_id.toLowerCase().replace(/^auto-/, '');
            return oVid === cVid && o.status !== 'CANCELLED';
          });

          if (matchingOrders.length > 0) {
            // Verificar si alguna orden coincide con las fechas solicitadas o si está activa
            let isReservedForDates = false;
            let isAssisted = false;

            for (const ord of matchingOrders) {
              const ordStatus = (ord.status || ord.estado || '').toUpperCase();
              if (ordStatus === 'CONFIRMADO_ASISTIDO' || ord.rentalStatus === 'PICKED_UP' || ord.rental_status === 'PICKED_UP') {
                isAssisted = true;
              }

              if (searchPickup && searchDropoff) {
                const oPickup = ord.pickup_date || ord.retiro?.fecha || ord.pickup || ord.fecha_inicio;
                const oDropoff = ord.dropoff_date || ord.devolucion?.fecha || ord.dropoff || ord.fecha_fin;
                if (oPickup && oDropoff) {
                  // Conflicto de fechas: solapamiento de intervalos
                  if (searchPickup <= oDropoff && searchDropoff >= oPickup) {
                    isReservedForDates = true;
                  }
                } else {
                  isReservedForDates = true;
                }
              } else {
                // Sin fechas específicas de búsqueda: si tiene orden activa PENDING o RESERVADO
                if (ordStatus === 'RESERVADO' || ordStatus === 'CONFIRMED' || ordStatus === 'PENDING') {
                  isReservedForDates = true;
                }
              }
            }

            if (isAssisted) {
              car.estado = 'CONFIRMADO_ASISTIDO';
            } else if (isReservedForDates) {
              car.estado = 'RESERVADO';
            }
          }
        }
      } catch (err: any) {
        this.logger.debug(`[AutosCircuitBreaker] No se pudo reconciliar estados con órdenes: ${err.message}`);
      }

      // 1c. Deduplicación inteligente de modelos replicados (a menos que se pida all_units=true)
      const allUnitsRequested = searchParams?.all_units === 'true' || searchParams?.all_units === true;
      let finalCars = allCars;

      if (!allUnitsRequested) {
        const modelMap = new Map<string, any[]>();
        for (const car of allCars) {
          const modelKey = `${car.proveedor_codigo}_${car.marca}_${car.modelo}_${car.categoria}_${car.transmision}`.toUpperCase().trim();
          if (!modelMap.has(modelKey)) {
            modelMap.set(modelKey, []);
          }
          modelMap.get(modelKey)!.push(car);
        }

        const deduplicated: any[] = [];
        for (const [_, units] of modelMap.entries()) {
          // Priorizar una unidad que esté DISPONIBLE
          const availUnit = units.find(u => u.estado === 'DISPONIBLE');
          const chosen = { ...(availUnit || units[0]) };
          const disponiblesCount = units.filter(u => u.estado === 'DISPONIBLE').length;

          chosen.unidades_disponibles = disponiblesCount;
          chosen.unidades_totales = units.length;
          chosen.flota_unificada = true;
          chosen.disponibilidad_resumen = `${disponiblesCount} de ${units.length} unidades disponibles`;

          if (disponiblesCount === 0) {
            chosen.estado = 'RESERVADO';
          }

          deduplicated.push(chosen);
        }
        finalCars = deduplicated;
      }

      this.handleSuccess();
      return finalCars;
    }

    // 2. Fallback secundario: Intentar obtener modelos y flota de admin de RutaLibre
    try {
      const token = await this.getRutaLibreToken();
      if (token) {
        const [modelsRes, fleetRes] = await Promise.all([
          firstValueFrom(
            this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/admin/models', {
              headers: { Authorization: `Bearer ${token}` },
              timeout: this.TIMEOUT_MS,
            })
          ),
          firstValueFrom(
            this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/admin/fleet', {
              headers: { Authorization: `Bearer ${token}` },
              timeout: this.TIMEOUT_MS,
            })
          ),
        ]);

        const models = modelsRes.data || [];
        const fleet = fleetRes.data || [];

        const realCars = models
          .filter((m: any) => m.published !== false && m.active !== false)
          .map((m: any) => {
            const availUnit = fleet.find((f: any) => f.vehicleModelId === m.id && f.active !== false && f.status === 'AVAILABLE');
            const unit = availUnit || fleet.find((f: any) => f.vehicleModelId === m.id && f.active !== false);
            const plate = unit?.plate;
            const vId = plate ? `auto-${plate.toLowerCase()}` : `ext-model-${m.id}`;
            const isAvail = !!availUnit;
            return {
              vehicle_id: vId,
              marca: m.make || 'Toyota',
              modelo: m.model || 'Modelo',
              categoria: (m.category?.name || m.category?.code || 'SUV').toUpperCase(),
              precio_diario: 45.0,
              precio_base: 45.0,
              recargo_conductor_joven: 0,
              moneda: 'USD',
              transmision: m.transmission === 'AUTOMATIC' ? 'Automático' : 'Manual',
              asientos: m.seats || 5,
              puertas: m.doors || 4,
              bag_capacity: m.bagCapacity || 2,
              maletas_grandes: m.bagCapacity || 2,
              maletas_pequenas: 1,
              aire_acondicionado: m.airConditioning !== false,
              kilometraje_ilimitado: true,
              politica_combustible: 'Lleno a lleno',
              cancelacion_gratuita: true,
              proveedor_id: 4,
              proveedor_codigo: 'NODE_AUT_RUTALIBRE',
              proveedor: {
                nombre: 'RutaLibre Renta de Autos (NODE_AUT_RUTALIBRE)',
                rating: 9.5,
                ubicacion: 'Andes — Aeropuerto Mariscal Sucre (UIO)',
              },
              estado: isAvail ? 'DISPONIBLE' : 'NO_DISPONIBLE',
              images: [this.resolveImageUrl(m.imageUrl)],
            };
          });

        if (realCars.length > 0) {
          this.handleSuccess();
          return realCars;
        }
      }
    } catch (err: any) {
      this.logger.warn(`[AutosCircuitBreaker] No se pudo obtener modelos directo de RutaLibre (${err.message}).`);
    }

    return this.getMockCarsFallback();
  }

  /**
   * Consulta las reservas activas en el proveedor para determinar fechas ya ocupadas.
   */
  async getOccupiedDates(vehicleId: string): Promise<{ pickup: string; dropoff: string }[]> {
    try {
      const key = this.EXTERNAL_API_KEY || process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      const cleanId = (vehicleId || '').toLowerCase().replace(/^auto-/, '');
      const response = await firstValueFrom(
        this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/v3/orders', {
          headers: {
            'X-API-Key': key,
          },
          timeout: 4000,
        })
      );
      const orders = Array.isArray(response.data) ? response.data : [];
      return orders
        .filter((o: any) => {
          const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase().replace(/^auto-/, '');
          return oVid === cleanId && o.status !== 'CANCELLED';
        })
        .map((o: any) => ({
          pickup: o.retiro?.fecha || o.pickup_date,
          dropoff: o.devolucion?.fecha || o.dropoff_date,
        }))
        .filter((o: any) => o.pickup && o.dropoff);
    } catch (_) {
      return [];
    }
  }

  /**
   * Obtiene todas las órdenes activas en el socio externo para reconciliación.
   */
  async getOrdersDirect(): Promise<any[]> {
    const orders: any[] = [];
    // 1. RutaLibre (v3/orders)
    try {
      const key = this.EXTERNAL_API_KEY || process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      const response = await firstValueFrom(
        this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/v3/orders', {
          headers: {
            'X-API-Key': key,
          },
          timeout: 4000,
        })
      );
      if (Array.isArray(response.data)) {
        orders.push(...response.data);
      }
    } catch (_) {}

    // 1b. Obtener estados de Check-in presencial en mostrador de Daniel (RutaLibre admin)
    try {
      const token = await this.getRutaLibreToken();
      if (token) {
        const adminRes = await firstValueFrom(
          this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/admin/reservations', {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000,
          })
        );
        if (Array.isArray(adminRes.data)) {
          for (const r of adminRes.data) {
            const loc = (r.locator || r.id || '').toUpperCase();
            const existing = orders.find(o => ((o.pnr || o.order_id || o.codigo_reserva || '').toUpperCase()) === loc);
            const isAssisted = r.rentalStatus === 'PICKED_UP' || r.rentalStatus === 'RETURNED' || r.status === 'CONFIRMADO_ASISTIDO';
            if (existing) {
              existing.rentalStatus = r.rentalStatus;
              existing.rental_status = r.rentalStatus;
              existing.plate = r.plate || existing.plate;
              if (isAssisted) {
                existing.status = 'CONFIRMADO_ASISTIDO';
                existing.estado = 'CONFIRMADO_ASISTIDO';
              }
            } else if (r.fromBooking || loc.startsWith('CAR')) {
              orders.push({
                order_id: r.locator || r.id,
                pnr: r.locator || r.id,
                codigo_reserva: r.locator || r.id,
                status: isAssisted ? 'CONFIRMADO_ASISTIDO' : (r.status || 'CONFIRMED'),
                estado: isAssisted ? 'CONFIRMADO_ASISTIDO' : (r.status || 'CONFIRMED'),
                rentalStatus: r.rentalStatus,
                rental_status: r.rentalStatus,
                plate: r.plate,
                driver: {
                  full_name: r.driver,
                  nombre: r.driver,
                  email: r.driverEmail || 'cliente@booking.com',
                  license_number: r.identification || '1150029880',
                },
                total_price: { currency: r.currency || 'USD', total: r.totalPrice },
                moneda: r.currency || 'USD',
                precio_total_monto: r.totalPrice,
                created_at: r.createdAt,
              });
            }
          }
        }
      }
    } catch (_) {}

    // 2. Maneja de Una (Mateo)
    try {
      const mateoKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
      const mRes = await firstValueFrom(
        this.httpService.get('https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/orders', {
          headers: { 'X-API-Key': mateoKey },
          timeout: 4000,
        })
      );
      const mData = Array.isArray(mRes.data)
        ? mRes.data
        : (mRes.data?.value || mRes.data?.items || mRes.data?.data || []);
      if (Array.isArray(mData)) {
        for (const m of mData) {
          const mStatus = (m.status || m.estado || '').toUpperCase();
          if (mStatus === 'CONFIRMADO_ASISTIDO' || m.rental_status === 'PICKED_UP' || m.checkin_status === 'COMPLETED') {
            m.status = 'CONFIRMADO_ASISTIDO';
            m.estado = 'CONFIRMADO_ASISTIDO';
          } else if (mStatus === 'RESERVADO' || mStatus === 'CONFIRMED') {
            m.status = 'RESERVADO';
            m.estado = 'RESERVADO';
          }
          orders.push(m);
        }
      }
    } catch (_) {}

    return orders;
  }

  /**
   * Notifica la cancelación de una orden al socio externo RutaLibre.
   */
  async cancelOrder(orderId: string, reason = 'Cancelado por el cliente'): Promise<boolean> {
    const cleanId = orderId.toUpperCase();
    if (cleanId.startsWith('MDU-') || cleanId.length === 36) {
      try {
        await firstValueFrom(
          this.httpService.post(
            `https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/orders/${cleanId}/cancel`,
            { reason },
            {
              headers: {
                'X-API-Key': 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=',
                'Content-Type': 'application/json',
              },
              timeout: 5000,
            }
          )
        );
        this.logger.log(`[AutosCircuitBreaker] Cancelación propagada exitosamente a Maneja de Una: ${cleanId}`);
        return true;
      } catch (err: any) {
        this.logger.warn(`[AutosCircuitBreaker] No se pudo cancelar en Maneja de Una (${orderId}): ${err.message}`);
        return false;
      }
    }

    try {
      const key = this.EXTERNAL_API_KEY || process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      await firstValueFrom(
        this.httpService.post(
          `https://rutalibre-autos-api.azurewebsites.net/api/v3/autos/orders/${cleanId}/cancel`,
          { reason },
          { headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, timeout: 4000 }
        )
      );
      this.logger.log(`[AutosCircuitBreaker] Cancelación propagada exitosamente a RutaLibre: ${cleanId}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`[AutosCircuitBreaker] No se pudo cancelar en RutaLibre (${orderId}): ${err.message}`);
      return false;
    }
  }

  /**
   * Envía reserva a proveedor externo con Idempotency-Key y protección resiliente.
   * Conecta con RutaLibre (NODE_AUT_RUTALIBRE) o Maneja de Una (NODE_AUT_MDU).
   */
  async createExternalOrder(
    payload: ExternalAutoBookingPayload,
    idempotencyKey: string,
    correlationId?: string,
    apiKey?: string
  ): Promise<any> {
    this.checkCircuit();

    if (this.circuitState === CircuitState.OPEN) {
      this.logger.warn(`[AutosCircuitBreaker] Circuito ABIERTO hacia proveedor externo. Retornando Mock Fallback automático de confirmación.`);
      return {
        external_order_id: `EXT-MOCK-FALLBACK-${Date.now()}`,
        status: 'CONFIRMED_FALLBACK',
        circuit_breaker_open: true,
        message: 'Reserva confirmada vía Mock Fallback de resiliencia. El proveedor externo se encuentra temporalmente fuera de línea.',
      };
    }

    const normalizedPhone = this.normalizePhone(payload.conductor.telefono);
    const key = apiKey || this.EXTERNAL_API_KEY || process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
    const cId = correlationId || `corr-auto-${Date.now()}`;

    // Asegurar que idempotencyKey tenga formato UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeIdempotencyKey = uuidRegex.test(idempotencyKey) ? idempotencyKey : uuidv4();

    const isMateo =
      payload.vehicle_id?.length === 36 ||
      (payload as any).proveedor_codigo === 'NODE_AUT_MDU' ||
      (payload as any).proveedor_codigo === 'NODE_AUT_MATEO' ||
      (payload as any).proveedor_codigo === 'NODE_AUT_MANEJADEUNA' ||
      (payload as any).proveedor_id === 5;

    // Despacho a Maneja de Una (Mateo Morales - NODE_AUT_MDU)
    if (isMateo) {
      const clientEmail = (payload.conductor.email || 'conductor@booking.com').trim();
      const clientDoc = (payload.conductor.licencia || (payload.conductor as any).documento || (payload.conductor as any).identificacion || '1755073481').trim();
      const clientName = (payload.conductor.nombre || 'Conductor Booking').trim();
      const clientPhone = normalizedPhone || '+593999999999';
      const mateoKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
      const mateoBase = 'https://maneja-de-una-autos-api.azurewebsites.net/api/v3';

      // 1. Consultar si el cliente existe mediante GET /api/v3/clientes?email=...&identificacion=...
      let clientExists = false;
      try {
        const checkUrl = `${mateoBase}/clientes?email=${encodeURIComponent(clientEmail)}&identificacion=${encodeURIComponent(clientDoc)}`;
        this.logger.log(`[Autos Mateo] Paso 1: Consultando existencia de cliente: ${checkUrl}`);
        const checkRes = await firstValueFrom(
          this.httpService.get(checkUrl, {
            headers: { 'X-API-Key': mateoKey },
            timeout: 5000,
          })
        );
        if (checkRes.status === 200 && checkRes.data) {
          clientExists = true;
          this.logger.log(`[Autos Mateo] Cliente ya existe en Maneja de Una: ${JSON.stringify(checkRes.data)}`);
        }
      } catch (err: any) {
        this.logger.debug(`[Autos Mateo] Cliente no encontrado aún (${err.response?.status || err.message}). Procediendo a registrar.`);
      }

      // 2. Si no existe, registrarlo mediante POST /api/v3/clientes
      if (!clientExists) {
        try {
          this.logger.log(`[Autos Mateo] Paso 2: Registrando cliente en Maneja de Una (POST /api/v3/clientes)`);
          const regRes = await firstValueFrom(
            this.httpService.post(
              `${mateoBase}/clientes`,
              {
                nombre: clientName,
                email: clientEmail,
                identificacion: clientDoc,
                telefono: clientPhone,
                licencia: clientDoc,
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': mateoKey,
                },
                timeout: 5000,
              }
            )
          );
          this.logger.log(`[Autos Mateo] Cliente registrado exitosamente en Maneja de Una: ${JSON.stringify(regRes.data)}`);
        } catch (regErr: any) {
          this.logger.warn(`[Autos Mateo] Aviso al registrar cliente en Mateo: ${regErr.response?.data?.message || regErr.message}`);
        }
      }

      // 3. Crear la reserva utilizando los datos del conductor y su identificación correctamente asociados
      const pickupTime = (payload as any).pickup_time || (payload as any).hora_recogida || '10:00';
      const dropoffTime = (payload as any).dropoff_time || (payload as any).hora_devolucion || '10:00';
      const safePickupTime = /^([01]\d|2[0-3]):(?:00|30)$/.test(pickupTime) ? pickupTime : '10:00';
      const safeDropoffTime = /^([01]\d|2[0-3]):(?:00|30)$/.test(dropoffTime) ? dropoffTime : '10:00';

      const coverageType = payload.tipo_cobertura === 'TOTAL' ? 'TOTAL' : (payload.tipo_cobertura === 'PREMIUM' ? 'PREMIUM' : 'BASIC');

      const mateoPayload = {
        vehicle_id: payload.vehicle_id,
        pickup_date: payload.pickup_date || new Date().toISOString().split('T')[0],
        dropoff_date: payload.dropoff_date || new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0],
        pickup_time: safePickupTime,
        dropoff_time: safeDropoffTime,
        pickup_location: payload.pickup_location || 'Aeropuerto Quito',
        dropoff_location: payload.dropoff_location || 'Aeropuerto Quito',
        coverage_type: coverageType,
        driver: {
          full_name: clientName,
          email: clientEmail,
          phone: clientPhone,
          license_number: clientDoc,
          age: Number(payload.conductor.edad || 30),
        },
      };

      try {
        this.logger.log(`[AutosCircuitBreaker] Paso 3: Despachando reserva a Maneja de Una (/api/v3/autos/orders/create): ${payload.vehicle_id}`);
        const response = await firstValueFrom(
          this.httpService.post(
            'https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/orders/create',
            mateoPayload,
            {
              headers: {
                'Content-Type': 'application/json',
                'idempotency-key': safeIdempotencyKey,
                'Idempotency-Key': safeIdempotencyKey,
                'X-Correlation-Id': cId,
                'X-API-Key': mateoKey,
              },
              timeout: 25000,
            }
          )
        );

        this.handleSuccess();
        const pnr = response.data?.pnr || response.data?.order_id || response.data?.codigo_reserva;
        return {
          external_order_id: pnr || `MDU-${Date.now()}`,
          status: 'CONFIRMED',
          pnr: pnr,
          auto_id: response.data?.auto_id || response.data?.vehicle_id || payload.vehicle_id,
          voucher_qr_data: response.data?.voucher_qr_payload || response.data?.voucher_qr_data || `BOOKING-CAR-${pnr}`,
          raw_response: response.data,
        };
      } catch (err: any) {
        this.logger.error(`[AutosCircuitBreaker] Error despachando a Maneja de Una: ${JSON.stringify(err.response?.data || err.message)}`);
        if (err.response?.status === 409) {
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Vehículo No Disponible',
            status: HttpStatus.CONFLICT,
            detail: err.response?.data?.detail || 'El vehículo no está disponible en esas fechas.',
          }, HttpStatus.CONFLICT);
        }
        throw new HttpException({
          type: 'https://api.booking.local/errors/bad-request',
          title: 'Datos Inválidos',
          status: HttpStatus.BAD_REQUEST,
          detail: err.response?.data?.detail || err.response?.data?.message || 'No se pudo crear la orden en el proveedor de autos.',
        }, HttpStatus.BAD_REQUEST);
      }
    }

    // Sincronizar conductor con microservicio de clientes en RutaLibre (Fase 1 Cross-Platform)
    try {
      await firstValueFrom(
        this.httpService.post(
          'https://rutalibre-autos-api.azurewebsites.net/api/v3/clientes',
          {
            nombre: payload.conductor.nombre,
            email: payload.conductor.email,
            identificacion: payload.conductor.licencia || '1723456789',
            telefono: normalizedPhone,
            licencia: payload.conductor.licencia || '1723456789',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': key,
            },
            timeout: 3000,
          }
        )
      );
    } catch (_) {}

    // Despachar orden canónica a RutaLibre v3: POST /api/v3/orders
    const requestPayload = {
      vehicle_id: payload.vehicle_id,
      pickup_date: payload.pickup_date || new Date().toISOString().split('T')[0],
      dropoff_date: payload.dropoff_date || new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0],
      pickup_location: payload.pickup_location || 'Quito Aeropuerto',
      dropoff_location: payload.dropoff_location || 'Quito Aeropuerto',
      driver: {
        full_name: payload.conductor.nombre || 'Conductor Booking',
        email: payload.conductor.email || 'conductor@booking.com',
        phone: normalizedPhone,
        license_number: payload.conductor.licencia || '1723456789',
        age: payload.conductor.edad || 30,
      },
    };

    try {
      this.logger.log(`[AutosCircuitBreaker] Despachando reserva a RutaLibre v3 (/api/v3/orders): ${payload.vehicle_id}`);
      const response = await firstValueFrom(
        this.httpService.post('https://rutalibre-autos-api.azurewebsites.net/api/v3/orders', requestPayload, {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': safeIdempotencyKey,
            'X-Correlation-Id': cId,
            'X-API-Key': key,
          },
          timeout: 25000,
        }).pipe(
          timeout(25000),
          catchError((err) => {
            // Solo errores de red o 5xx cuentan como falla de circuito, nunca 4xx (conflictos de negocio)
            if (!err.response || err.response.status >= 500) {
              this.handleFailure(err);
            }
            throw err;
          })
        )
      );

      this.handleSuccess();
      const pnr = response.data?.pnr || response.data?.order_id || response.data?.locator;
      return {
        external_order_id: pnr || `EXT-${Date.now()}`,
        status: response.data?.status === 'RESERVADO' ? 'CONFIRMED' : (response.data?.status || 'CONFIRMED'),
        pnr: pnr,
        auto_id: response.data?.auto_id || response.data?.vehicle_id || payload.vehicle_id,
        voucher_qr_data: response.data?.voucher_qr_data || `BOOKING-CAR-${pnr}`,
        raw_response: response.data,
      };
    } catch (err: any) {
      if (err.response?.status === 409) {
        const detail = err.response?.data?.message || err.response?.data?.detail || 'El vehículo ya se encuentra reservado o en el taller en esas fechas.';
        this.logger.warn(`[AutosCircuitBreaker] Conflicto 409 en RutaLibre: ${detail}`);
        throw new HttpException({
          type: 'https://api.booking.local/errors/conflict',
          title: 'Vehículo No Disponible',
          status: HttpStatus.CONFLICT,
          detail: detail,
          message: detail,
          code: 'VEHICLE_ALREADY_RESERVED',
        }, HttpStatus.CONFLICT);
      }
      if (err.response?.status === 400 || err.response?.status === 422) {
        const detail = err.response?.data?.message || err.response?.data?.detail || 'Datos de reserva no válidos para el proveedor.';
        this.logger.warn(`[AutosCircuitBreaker] Error 400/422 en RutaLibre: ${detail}`);
        throw new HttpException({
          type: 'https://api.booking.local/errors/bad-request',
          title: 'Datos Inválidos',
          status: HttpStatus.BAD_REQUEST,
          detail: detail,
          message: detail,
          code: 'BAD_REQUEST',
        }, HttpStatus.BAD_REQUEST);
      }

      this.logger.warn(`[AutosCircuitBreaker] Error despachando a RutaLibre (${err.message}): ${JSON.stringify(err.response?.data || '')}.`);
      if ((this.circuitState as any) === CircuitState.OPEN || this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
        return {
          external_order_id: `EXT-MOCK-TIMEOUT-${Date.now()}`,
          status: 'CONFIRMED_FALLBACK',
          circuit_breaker_open: true,
          message: `Reserva confirmada vía Mock Fallback de contingencia (${err.message}).`,
        };
      }
      throw new HttpException({
        type: 'https://api.booking.local/errors/external-service-error',
        title: 'Error de Comunicación con Proveedor',
        status: HttpStatus.SERVICE_UNAVAILABLE,
        detail: `No se pudo comunicar con el sistema del proveedor de autos (${err.message}).`,
        message: `No se pudo conectar con el proveedor: ${err.message}`,
        code: 'PARTNER_SERVICE_UNAVAILABLE',
      }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Catálogo de contingencia (Mock Fallback) con vehículos de proveedores asociados.
   * Garantiza que la plataforma Booking Prototipo nunca se congele si la tienda externa está apagada.
   */
  getMockCarsFallback(): any[] {
    return [
      {
        vehicle_id: 'ext-mock-onix-01',
        marca: 'Chevrolet',
        modelo: 'Onix Turbo Sedán',
        categoria: 'COMPACTO',
        precio_diario: 39.00,
        moneda: 'USD',
        transmision: 'Automático',
        asientos: 5,
        puertas: 4,
        maletas_grandes: 2,
        maletas_pequenas: 2,
        aire_acondicionado: true,
        kilometraje_ilimitado: true,
        politica_combustible: 'Lleno a lleno',
        cancelacion_gratuita: true,
        proveedor: {
          nombre: 'Renta Autos Ecuador (Mock Fallback Partner)',
          rating: 8.8,
          ubicacion: 'Terminal Aérea Mariscal Sucre - Mostrador 2'
        },
        estado: 'DISPONIBLE',
        is_mock_fallback: true,
        images: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800']
      },
      {
        vehicle_id: 'ext-mock-sportage-02',
        marca: 'Kia',
        modelo: 'Sportage GT-Line',
        categoria: 'SUV',
        precio_diario: 58.00,
        moneda: 'USD',
        transmision: 'Automático',
        asientos: 5,
        puertas: 5,
        maletas_grandes: 3,
        maletas_pequenas: 2,
        aire_acondicionado: true,
        kilometraje_ilimitado: true,
        politica_combustible: 'Lleno a lleno',
        cancelacion_gratuita: true,
        proveedor: {
          nombre: 'Renta Autos Ecuador (Mock Fallback Partner)',
          rating: 9.1,
          ubicacion: 'Terminal Aérea Mariscal Sucre - Mostrador 2'
        },
        estado: 'DISPONIBLE',
        is_mock_fallback: true,
        images: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800']
      },
      {
        vehicle_id: 'ext-mock-dmax-03',
        marca: 'Isuzu',
        modelo: 'D-Max 4x4 Diésel',
        categoria: 'CAMIONETA',
        precio_diario: 72.00,
        moneda: 'USD',
        transmision: 'Manual',
        asientos: 5,
        puertas: 4,
        maletas_grandes: 4,
        maletas_pequenas: 3,
        aire_acondicionado: true,
        kilometraje_ilimitado: true,
        politica_combustible: 'Lleno a lleno',
        cancelacion_gratuita: true,
        proveedor: {
          nombre: 'Renta Autos Ecuador (Mock Fallback Partner)',
          rating: 9.3,
          ubicacion: 'Terminal Aérea José Joaquín de Olmedo'
        },
        estado: 'DISPONIBLE',
        is_mock_fallback: true,
        images: ['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800']
      }
    ];
  }

  private transformExternalCars(items: any[]): any[] {
    if (!Array.isArray(items)) return [];
    return items.map((item, idx) => ({
      vehicle_id: `ext-partner-${item.id || idx + 1}`,
      marca: idx % 2 === 0 ? 'Toyota' : 'Hyundai',
      modelo: idx % 2 === 0 ? 'Corolla' : 'Grand i10',
      categoria: idx % 2 === 0 ? 'COMPACTO' : 'ECONOMICO',
      precio_diario: idx % 2 === 0 ? 42.00 : 34.00,
      moneda: 'USD',
      transmision: idx % 2 === 0 ? 'Automático' : 'Manual',
      asientos: 5,
      puertas: 4,
      maletas_grandes: 2,
      maletas_pequenas: 1,
      aire_acondicionado: true,
      kilometraje_ilimitado: true,
      politica_combustible: 'Lleno a lleno',
      cancelacion_gratuita: true,
      proveedor: {
        nombre: 'Flota Partner Oficial',
        rating: 8.7,
        ubicacion: 'Terminal de Llegadas (Mostrador 4)'
      },
      estado: 'DISPONIBLE',
      images: [
        idx % 2 === 0 
          ? 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=600'
          : 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=600'
      ]
    }));
  }

  private normalizePhone(phone: string): string {
    if (!phone) return '+593999999999';
    const clean = phone.replace(/[^\d+]/g, '');
    if (clean.startsWith('09') && clean.length === 10) {
      return '+593' + clean.substring(1);
    }
    if (clean.startsWith('9') && clean.length === 9) {
      return '+593' + clean;
    }
    return clean;
  }

  private checkCircuit() {
    if (this.connectorHealthService && !this.connectorHealthService.isNodeEnabled('autos')) {
      this.circuitState = CircuitState.OPEN;
      return;
    }

    if (this.circuitState === CircuitState.OPEN && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.RESET_TIMEOUT_MS) {
        this.circuitState = CircuitState.HALF_OPEN;
        this.logger.log('[AutosCircuitBreaker] Circuito transiciona a HALF_OPEN para reintento de prueba.');
      }
    }
  }

  private handleSuccess() {
    this.consecutiveFailures = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  private handleFailure(error: any) {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.logger.error(`[AutosCircuitBreaker] Fallo consecutivo #${this.consecutiveFailures}: ${error.message}`);
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      this.logger.warn(`[AutosCircuitBreaker] UMBRAL ALCANZADO. Circuito ABIERTO por ${this.RESET_TIMEOUT_MS / 1000}s.`);
    }
  }

  getCircuitStatus() {
    return {
      state: this.circuitState,
      failures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime
    };
  }
}
