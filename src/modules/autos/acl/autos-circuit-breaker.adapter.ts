import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ConnectorHealthService } from '../../admin/connector-health.service';
import { TraceContextService } from '../../../core/tracing/trace-context.service';
import { DataSource } from 'typeorm';

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
  private readonly cancelledOrderIds = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly connectorHealthService?: ConnectorHealthService,
    @Optional() private readonly traceContext?: TraceContextService,
    @Optional() private readonly dataSource?: DataSource,
  ) {
    this.traceContext?.instrumentAxios(this.httpService.axiosRef);
  }


  // ===========================================================================
  // Socios de AUTOS que se cargan desde el panel (schema_proveedores.config_proveedor)
  // Anthony (RentaFacil EC) y RodadoEc. Código de nodo, URL y X-API-Key salen del
  // nodo AUTOS registrado en el panel; respaldo por variables de entorno.
  // Cada auto y cada reserva se enruta al socio del que vino (no por adivinanza):
  //  - vehículos: se recuerdan al leer el catálogo; respaldo por patrón de id.
  //  - PNR: se recuerdan al crear/leer órdenes. RodadoEc usa CARxxxxx igual que
  //    RutaLibre, así que para él solo vale lo registrado (se refresca si falta).
  // Para sumar otro socio basta agregar una entrada en SOCIOS_PANEL.
  // ===========================================================================
  private readonly SOCIOS_PANEL: Array<{
    clave: string; nombre: string; nodoDefecto: string; urlMatch: string; baseDefecto: string;
    env: string; proveedorId: number; vehRegex?: RegExp; pnrRegex?: RegExp; apiKeyDefecto?: string;
  }> = [
    {
      clave: 'RENTAFACIL', nombre: 'RentaFacil EC', nodoDefecto: 'NODE_AUT_RENTAFACIL', urlMatch: 'rentafacil',
      baseDefecto: 'https://rentafacil-autos-api.azurewebsites.net/api/v3', env: 'RENTAFACIL', proveedorId: 6,
      vehRegex: /^VEH-\d+$/, pnrRegex: /^RF[A-Z0-9]{6}$/,
    },
    {
      clave: 'RODADO', nombre: 'RodadoEc', nodoDefecto: 'NODE_AUT_RODADOEC', urlMatch: 'rodadoec',
      baseDefecto: 'https://rodadoec-api.azurewebsites.net/api/v3', env: 'RODADO', proveedorId: 7,
      vehRegex: /^veh-\d+$/,
    },
    {
      clave: 'AUTOSPOT', nombre: 'AutoSpot (Esteban)', nodoDefecto: 'NODE_AUT_AUTOSPOT', urlMatch: 'alquiler-vehiculos-ijx3',
      baseDefecto: 'https://alquiler-vehiculos-ijx3.onrender.com/api/v3', env: 'AUTOSPOT', proveedorId: 8,
      apiKeyDefecto: 'xSQILcF-wlDGZ44NFmLpLbJlsX7rWooq',
      vehRegex: /^auto-\d+$/i,
      pnrRegex: /^CAR[A-Z0-9]{5,6}$/i,
    },
  ];
  private readonly socioCfgCache = new Map<string, { nodo: string; baseUrl: string; apiKey: string; activo: boolean; at: number }>();
  private readonly socioVehiculos = new Map<string, string>(); // vehicle_id → clave del socio
  private readonly socioPnrs = new Map<string, string>();      // PNR (mayúsculas) → clave del socio

  private async getSocioConfig(def: any): Promise<{ nodo: string; baseUrl: string; apiKey: string; activo: boolean }> {
    const cached = this.socioCfgCache.get(def.clave);
    if (cached && Date.now() - cached.at < 60000) return cached;
    let nodo = process.env[`${def.env}_NODO`] || def.nodoDefecto;
    let baseUrl = process.env[`${def.env}_BASE_URL`] || def.baseDefecto;
    let apiKey = process.env[`${def.env}_API_KEY`] || def.apiKeyDefecto || '';
    let activo = true;
    try {
      const rows = await this.dataSource?.query(
        `SELECT codigo_nodo, base_url_rest, api_key, kill_switch_activo
           FROM schema_proveedores.config_proveedor
          WHERE codigo_nodo = $1
             OR (UPPER(vertical) = 'AUTOS' AND base_url_rest ILIKE $2)
          ORDER BY (codigo_nodo = $1) DESC
          LIMIT 1`,
        [nodo, `%${def.urlMatch}%`],
      );
      if (rows && rows.length > 0) {
        if (rows[0].codigo_nodo) nodo = String(rows[0].codigo_nodo);
        if (rows[0].base_url_rest) baseUrl = String(rows[0].base_url_rest);
        if (rows[0].api_key) apiKey = String(rows[0].api_key);
        activo = rows[0].kill_switch_activo !== true;
      }
    } catch (err: any) {
      this.logger.debug(`[${def.nombre}] No se pudo leer config_proveedor: ${err.message}`);
    }
    const cfg = { nodo, baseUrl: baseUrl.replace(/\/$/, ''), apiKey, activo, at: Date.now() };
    this.socioCfgCache.set(def.clave, cfg);
    return cfg;
  }

  private socioHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}), ...extra };
  }

  /** Socio del panel dueño de un vehículo (por código de nodo, por catálogo leído o por patrón de id). */
  private socioDeVehiculo(vehicleId?: string, proveedorCodigo?: string): any | undefined {
    if (proveedorCodigo) {
      const porNodo = this.SOCIOS_PANEL.find((d) =>
        proveedorCodigo === this.socioCfgCache.get(d.clave)?.nodo || proveedorCodigo.startsWith(d.nodoDefecto.slice(0, 17)));
      if (porNodo) return porNodo;
    }
    if (!vehicleId) return undefined;
    const clave = this.socioVehiculos.get(String(vehicleId));
    if (clave) return this.SOCIOS_PANEL.find((d) => d.clave === clave);
    return this.SOCIOS_PANEL.find((d) => d.vehRegex && d.vehRegex.test(String(vehicleId)));
  }

  /** Lee las órdenes de un socio del panel y las deja normalizadas (estados, fechas, conductor). */
  private async fetchSocioOrders(def: any): Promise<any[]> {
    const cfg = await this.getSocioConfig(def);
    if (!cfg.activo) return [];
    const res = await firstValueFrom(
      this.httpService.get(`${cfg.baseUrl}/autos/orders`, { headers: this.socioHeaders(cfg.apiKey), timeout: 5000 }),
    );
    const data = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || res.data?.value || []);
    if (!Array.isArray(data)) return [];
    for (const r of data) {
      const st = (r.status || r.estado || '').toUpperCase();
      // Solo RodadoEc: su entrega queda como ENTREGADO; Booking la reconoce como CONFIRMADO_ASISTIDO.
      const rodadoEntregado = def.clave === 'RODADO' && st === 'ENTREGADO';
      if (st === 'CONFIRMADO_ASISTIDO' || r.rental_status === 'PICKED_UP' || r.checkin_status === 'COMPLETED' || rodadoEntregado) {
        r.status = 'CONFIRMADO_ASISTIDO';
        r.estado = 'CONFIRMADO_ASISTIDO';
      } else if (st === 'RESERVADO' || st === 'CONFIRMED') {
        r.status = 'RESERVADO';
        r.estado = 'RESERVADO';
      }
      if (!r.pickup_date) r.pickup_date = this.fechaEcuador(r.recogida?.fecha_hora);
      if (!r.dropoff_date) r.dropoff_date = this.fechaEcuador(r.devolucion?.fecha_hora);
      if (!r.driver && r.conductor) {
        r.driver = {
          full_name: r.conductor.nombre,
          email: r.conductor.email,
          phone: r.conductor.telefono,
          license_number: r.conductor.licencia_conducir || r.conductor.identificacion,
        };
      }
      if (!r.client_email && r.driver?.email) r.client_email = r.driver.email;
      r.proveedor_codigo = cfg.nodo;
      const pnr = r.pnr || r.codigo_reserva || r.order_id;
      if (pnr) this.socioPnrs.set(String(pnr).toUpperCase(), def.clave);
    }
    return data;
  }

  /** Socio del panel dueño de un PNR. Si no se conoce, refresca las órdenes de los socios sin patrón propio. */
  private async socioDePnr(id?: string): Promise<any | undefined> {
    if (!id) return undefined;
    const up = id.toUpperCase();
    const buscar = () => {
      const clave = this.socioPnrs.get(up);
      return clave ? this.SOCIOS_PANEL.find((d) => d.clave === clave) : undefined;
    };
    const conocido = buscar() || this.SOCIOS_PANEL.find((d) => d.pnrRegex && d.pnrRegex.test(up));
    if (conocido) return conocido;
    for (const def of this.SOCIOS_PANEL.filter((d) => !d.pnrRegex)) {
      try { await this.fetchSocioOrders(def); } catch (_) {}
    }
    return buscar();
  }

  /** Fecha AAAA-MM-DD en hora de Ecuador a partir de un ISO. */
  private fechaEcuador(iso?: string): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
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

    const sociosCfg = await Promise.all(this.SOCIOS_PANEL.map((d) => this.getSocioConfig(d)));

    // 1. Consultar flota canónica OpenAPI v3 de RutaLibre (Daniel González) y Maneja de Una (Mateo Morales) en paralelo (limit=100 para no truncar la flota)
    const [danielRes, mateoRes, ...sociosRes] = await Promise.allSettled([
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
      ...sociosCfg.map((cfg, idx) => {
        const def = this.SOCIOS_PANEL[idx];
        if (!cfg.activo) {
          return Promise.reject(new Error(`${def.nombre} desactivado (kill switch)`));
        }
        // Si es AutoSpot o RodadoEc y se proporcionaron fechas de búsqueda, usar POST /autos/search para disponibilidad real por fechas
        if ((def.clave === 'AUTOSPOT' || def.clave === 'RODADO') && searchParams?.pickup_date && searchParams?.dropoff_date) {
          const searchPayload: Record<string, string> = {
            pickup_date: searchParams.pickup_date,
            dropoff_date: searchParams.dropoff_date,
            pickup_time: searchParams.pickup_time || '10:00',
            dropoff_time: searchParams.dropoff_time || '10:00',
            fecha_inicio: searchParams.pickup_date,
            fecha_fin: searchParams.dropoff_date,
          };
          // RODADO requiere pickup_location no vacío; AUTOSPOT acepta campo adicional dropoff_location
          const rawLoc = searchParams.pickup_location || searchParams.q || '';
          searchPayload.pickup_location = rawLoc || 'Quito';
          if (def.clave === 'AUTOSPOT') {
            searchPayload.dropoff_location = searchParams.dropoff_location || rawLoc || 'Quito Aeropuerto';
          }
          return firstValueFrom(
            this.httpService.post(`${cfg.baseUrl}/autos/search`, searchPayload, {
              headers: this.socioHeaders(cfg.apiKey, correlationId ? { 'X-Correlation-Id': correlationId } : {}),
              timeout: this.TIMEOUT_MS,
            }),
          ).catch(() =>
            firstValueFrom(
              this.httpService.get(`${cfg.baseUrl}/autos?limit=100`, {
                headers: this.socioHeaders(cfg.apiKey),
                timeout: this.TIMEOUT_MS,
              }),
            ),
          );
        }
        return firstValueFrom(
          this.httpService.get(`${cfg.baseUrl}/autos?limit=100`, {
            headers: this.socioHeaders(cfg.apiKey),
            timeout: this.TIMEOUT_MS,
          }),
        );
      }),
    ]);

    // Procesar flota de Daniel (RutaLibre - NODE_AUT_RUTALIBRE)
    if (danielRes.status === 'fulfilled' && danielRes.value?.data) {
      const rawCars = Array.isArray(danielRes.value.data)
        ? danielRes.value.data
        : (danielRes.value.data?.items || danielRes.value.data?.data || []);
      for (const c of rawCars) {
        const vId = c.vehicle_id || c.auto_id || c.id;
        if (!vId) continue;
        const baseP = Number(c.precio_diario || c.daily_price || 39.0);
        // Daniel aplica 15% IVA en su catálogo y reservas (PVP Daniel: $72.00 base + 15% IVA = $82.80)
        const finalPvp = Number((baseP * 1.15).toFixed(2));
        const ivaMonto = Number((finalPvp - baseP).toFixed(2));

        allCars.push({
          vehicle_id: vId,
          marca: c.marca || c.brand || 'Toyota',
          modelo: c.modelo || c.model || 'Vehículo',
          categoria: (c.categoria || c.category || 'COMPACTO').toUpperCase(),
          precio_diario: finalPvp,
          precio_base: baseP,
          price: finalPvp,
          daily_price: finalPvp,
          iva_monto: ivaMonto,
          tasa_iva: 0.15,
          impuestos_incluidos: true,
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
        const stockDisp = Number(c.stock_disponible ?? c.unidades_disponibles ?? c.stock ?? c.available_units ?? 3);
        const stockTotal = Number(c.stock_total ?? c.stock ?? stockDisp);
        const rawSt = String(c.estado || c.status || 'DISPONIBLE').toUpperCase();
        const isAvail = (rawSt === 'DISPONIBLE' || rawSt === 'AVAILABLE' || rawSt === 'ACTIVO' || rawSt === 'ACTIVE') && !c.mantenimiento_requerido && stockDisp > 0;
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
          stock_total: stockTotal,
          unidades_totales: stockTotal,
          stock_disponible: stockDisp,
          unidades_disponibles: stockDisp,
          estado: isAvail ? 'DISPONIBLE' : (c.mantenimiento_requerido ? 'MANTENIMIENTO' : 'RESERVADO'),
          images: [c.foto_url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'],
        });
      }
    }

    // Procesar flota de los socios del panel (Anthony - RentaFacil EC, RodadoEc)
    sociosRes.forEach((res, idx) => {
      const def = this.SOCIOS_PANEL[idx];
      const cfg = sociosCfg[idx];
      if (res.status !== 'fulfilled' || !res.value?.data) {
        if (res.status === 'rejected') this.logger.warn(`[${def.nombre}] Catálogo no disponible: ${(res as any).reason?.message}`);
        return;
      }
      const rawCars = Array.isArray(res.value.data) ? res.value.data : (res.value.data?.data || res.value.data?.items || []);
      for (const c of rawCars) {
        const vId = c.vehicle_id || c.auto_id || c.id;
        if (!vId) continue;
        this.socioVehiculos.set(String(vId), def.clave);
        allCars.push({
          vehicle_id: vId,
          marca: c.marca || c.brand || 'Vehículo',
          modelo: c.modelo || c.model || '',
          categoria: (c.categoria || c.category || 'COMPACTO').toUpperCase(),
          precio_diario: Number(c.precio_diario || c.daily_price || 0),
          precio_base: Number(c.precio_diario || c.daily_price || 0),
          recargo_conductor_joven: 0,
          moneda: c.moneda || 'USD',
          transmision: c.transmision === 'AUTOMATICO' || c.transmission === 'AUTOMATIC' ? 'Automático' : 'Manual',
          asientos: c.asientos || c.seats || 5,
          puertas: c.puertas || c.doors || 4,
          bag_capacity: c.maletas_grandes || 2,
          maletas_grandes: c.maletas_grandes || 2,
          maletas_pequenas: c.maletas_pequenas || 1,
          aire_acondicionado: c.aire_acondicionado !== false,
          kilometraje_ilimitado: c.kilometraje_ilimitado !== false,
          politica_combustible: 'Lleno a lleno',
          cancelacion_gratuita: c.cancelacion_gratuita !== false,
          proveedor_id: def.proveedorId,
          proveedor_codigo: cfg.nodo,
          proveedor: {
            nombre: `${def.nombre} (${cfg.nodo})`,
            rating: Number(c.proveedor?.rating || 9.0),
            ubicacion: c.proveedor?.ubicacion || c.agencia?.nombre || 'Quito',
          },
          estado: c.estado || c.status || 'DISPONIBLE',
          images: Array.isArray(c.images) && c.images.length > 0 ? c.images : [c.foto_url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'],
        });
      }
    });

    if (allCars.length > 0) {
      // 1b. Cruzar con órdenes activas y validar estado operativo de la unidad.
      // Regla de Negocio General (Mateo, Daniel y todos los socios):
      // Si un vehículo tiene una orden activa (CONFIRMED, RESERVADO, PICKED_UP, ENTREGADO) o su estado físico reportado
      // por el socio NO es 'DISPONIBLE', el auto queda BLOQUEADO para fechas futuras hasta que sea físicamente devuelto.
      try {
        const activeOrders = await this.getOrdersDirect();
        const searchPickup = searchParams?.pickup_date;
        const searchDropoff = searchParams?.dropoff_date;

        for (const car of allCars) {
          // Si el vehículo ya viene con estado no disponible desde el socio (ej. RESERVADO, ENTREGADO, MANTENIMIENTO, ALQUILADO)
          const rawCarState = (car.estado || '').toUpperCase();
          const esNoDisponibleEnSocio = !['DISPONIBLE', 'AVAILABLE', 'ACTIVO', 'ACTIVE', ''].includes(rawCarState);
          const totalUnits = Number(car.unidades_totales ?? car.unidades_disponibles ?? car.stock ?? 1);

          const matchingOrders = activeOrders.filter((o: any) => {
            const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase().replace(/^auto-/, '');
            const cVid = car.vehicle_id.toLowerCase().replace(/^auto-/, '');
            return oVid === cVid && o.status !== 'CANCELLED' && o.status !== 'CANCELADA';
          });

          let overlappingCount = 0;
          let isAssisted = false;

          for (const ord of matchingOrders) {
            const ordStatus = (ord.status || ord.estado || '').toUpperCase();
            const oPickup = ord.pickup_date || ord.retiro?.fecha || ord.pickup || ord.fecha_inicio;
            const oDropoff = ord.dropoff_date || ord.devolucion?.fecha || ord.dropoff || ord.fecha_fin;
            if (ordStatus === 'CONFIRMADO_ASISTIDO' || ordStatus === 'ENTREGADO' || ord.rentalStatus === 'PICKED_UP' || ord.rental_status === 'PICKED_UP') {
              // Solo bloquear si las fechas de búsqueda solapan con el período real de la orden;
              // si ya terminó (oDropoff < searchPickup) o es para fechas futuras distintas, el auto queda libre.
              if (searchPickup && searchDropoff && oPickup && oDropoff) {
                if (searchPickup <= oDropoff && searchDropoff >= oPickup) {
                  isAssisted = true;
                  overlappingCount++;
                }
                // Si no hay solapamiento, la orden ya terminó → no bloquear
              } else {
                // Sin fechas de búsqueda: bloquear por precaución (comportamiento previo conservador)
                isAssisted = true;
                overlappingCount++;
              }
            } else if (ordStatus === 'RESERVADO' || ordStatus === 'CONFIRMED' || ordStatus === 'PENDING') {
              if (searchPickup && searchDropoff) {
                if (oPickup && oDropoff) {
                  if (searchPickup <= oDropoff && searchDropoff >= oPickup) {
                    overlappingCount++;
                  }
                } else {
                  overlappingCount++;
                }
              } else {
                overlappingCount++;
              }
            }
          }

          if (car.unidades_disponibles !== undefined) {
            car.unidades_disponibles = Math.max(0, totalUnits - overlappingCount);
          }

          if (isAssisted && totalUnits <= 1) {
            car.estado = 'CONFIRMADO_ASISTIDO';
          } else if (esNoDisponibleEnSocio || overlappingCount >= totalUnits) {
            car.estado = esNoDisponibleEnSocio ? (rawCarState || 'RESERVADO') : 'RESERVADO';
            if (car.unidades_disponibles !== undefined) car.unidades_disponibles = 0;
          } else {
            car.estado = 'DISPONIBLE';
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
    const cleanId = (vehicleId || '').toLowerCase().replace(/^auto-/, '');
    const occupied: { pickup: string; dropoff: string }[] = [];

    // 1. Si es vehículo de Mateo (UUID de 36 caracteres)
    if (cleanId.length === 36) {
      try {
        const mateoKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
        const mRes = await firstValueFrom(
          this.httpService.get('https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/orders', {
            headers: { 'X-API-Key': mateoKey },
            timeout: 4000,
          })
        );
        const list = Array.isArray(mRes.data) ? mRes.data : (mRes.data?.data || []);
        for (const o of list) {
          const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase();
          const oStatus = (o.status || o.estado || '').toUpperCase();
          if (oVid === cleanId && (oStatus === 'RESERVADO' || oStatus === 'CONFIRMED' || oStatus === 'PENDING' || oStatus === 'ENTREGADO' || oStatus === 'CONFIRMADO_ASISTIDO')) {
            const p = o.pickup_date || o.pickup;
            const d = o.dropoff_date || o.dropoff;
            if (p && d) occupied.push({ pickup: p, dropoff: d });
          }
        }
        return occupied;
      } catch (_) {
        return occupied;
      }
    }

    // 2. Socios del panel (AutoSpot / Esteban, RentaFacil, RodadoEc)
    const socio = this.socioDeVehiculo(vehicleId);
    if (socio) {
      try {
        const orders = await this.fetchSocioOrders(socio);
        for (const o of orders) {
          const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase().replace(/^auto-/, '');
          const oVidRaw = (o.auto_id || o.vehicle_id || '').toLowerCase();
          const oStatus = (o.status || o.estado || '').toUpperCase();
          if (
            (oVid === cleanId || oVidRaw === (vehicleId || '').toLowerCase()) &&
            oStatus !== 'CANCELLED' &&
            oStatus !== 'CANCELADA' &&
            oStatus !== 'COMPLETED' &&
            oStatus !== 'COMPLETADA'
          ) {
            const p = o.pickup_date || o.recogida?.fecha_hora || o.pickup;
            const d = o.dropoff_date || o.devolucion?.fecha_hora || o.dropoff;
            if (p && d) occupied.push({ pickup: String(p).split('T')[0], dropoff: String(d).split('T')[0] });
          }
        }
        return occupied;
      } catch (_) {
        return occupied;
      }
    }

    // 3. Daniel (RutaLibre)
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
      const orders = Array.isArray(response.data) ? response.data : [];
      return orders
        .filter((o: any) => {
          const oId = (o.id || o.order_id || o.pnr || '').toUpperCase();
          if (this.cancelledOrderIds.has(oId) || this.cancelledOrderIds.has(o.id) || this.cancelledOrderIds.has(o.pnr)) {
            return false;
          }
          const oVid = (o.auto_id || o.vehicle_id || '').toLowerCase().replace(/^auto-/, '');
          return oVid === cleanId && o.status !== 'CANCELLED';
        })
        .map((o: any) => ({
          pickup: o.retiro?.fecha || o.pickup_date,
          dropoff: o.devolucion?.fecha || o.dropoff_date,
        }))
        .filter((o: any) => o.pickup && o.dropoff);
    } catch (_) {
      return occupied;
    }
  }

  /**
   * Resuelve los datos completos de un vehículo externo por ID o placa
   * consultando la flota interna de Daniel (RutaLibre) o Mateo (Maneja de Una).
   */
  async fetchExternalCarById(vehicleId: string): Promise<any> {
    if (!vehicleId) return null;
    const cleanId = vehicleId.toLowerCase().replace(/^auto-/, '');

    // 1. Probar resolviendo en endpoint v3 de Daniel (RutaLibre)
    try {
      const v3DirectRes = await firstValueFrom(
        this.httpService.get(`https://rutalibre-autos-api.azurewebsites.net/api/v3/autos/auto-${cleanId}`, {
          headers: { 'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA' },
          timeout: 4000,
        }),
      );
      if (v3DirectRes.status === 200 && v3DirectRes.data) {
        const c = v3DirectRes.data;
        const baseP = Number(c.precio_diario || c.daily_price || 72.0);
        const finalPvp = Number((baseP * 1.15).toFixed(2));
        const ivaMonto = Number((finalPvp - baseP).toFixed(2));
        return {
          vehicle_id: c.vehicle_id || `auto-${cleanId}`,
          id: c.vehicle_id || `auto-${cleanId}`,
          auto_id: c.vehicle_id || `auto-${cleanId}`,
          marca: c.marca || c.brand || 'Mercedes',
          modelo: c.modelo || c.model || 'RutaLibre Lunes',
          categoria: (c.categoria || c.category || 'SUV').toUpperCase(),
          precio_diario: finalPvp,
          precio_base: baseP,
          price: finalPvp,
          daily_price: finalPvp,
          iva_monto: ivaMonto,
          tasa_iva: 0.15,
          impuestos_incluidos: true,
          moneda: 'USD',
          transmision: c.transmision === 'AUTOMATICO' || c.transmission === 'AUTOMATICO' ? 'Automático' : 'Manual',
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
            ubicacion: c.ubicacion?.agencia || 'Pacífico — Aeropuerto José Joaquín de Olmedo (GYE)',
          },
          estado: c.estado || c.status || 'DISPONIBLE',
          disponible_desde: new Date().toISOString(),
          images: Array.isArray(c.images) && c.images.length > 0 ? c.images : [this.resolveImageUrl(c.foto_url)],
        };
      }
    } catch (_) {}

    // 1b. Probar resolviendo en la flota y modelos de Daniel (RutaLibre)
    try {
      const token = await this.getRutaLibreToken();
      if (token) {
        const [modelsRes, fleetRes] = await Promise.allSettled([
          firstValueFrom(
            this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/admin/models', {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 4000,
            }),
          ),
          firstValueFrom(
            this.httpService.get('https://rutalibre-autos-api.azurewebsites.net/api/admin/fleet', {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 4000,
            }),
          ),
        ]);

        const models = modelsRes.status === 'fulfilled' ? (modelsRes.value.data || []) : [];
        const fleet = fleetRes.status === 'fulfilled' ? (fleetRes.value.data || []) : [];

        // Buscar unidad por placa o vehicleModelId o id
        const unit = fleet.find((f: any) =>
          (f.plate && f.plate.toLowerCase() === cleanId) ||
          f.id === vehicleId ||
          f.id === cleanId ||
          f.vehicleModelId === vehicleId,
        );

        if (unit) {
          const m = models.find((mod: any) => mod.id === unit.vehicleModelId) || unit.vehicleModel || {};
          const isAvail = unit.status === 'AVAILABLE' && unit.active !== false;
          const catCode = (m.category?.name || m.category?.code || 'SEDAN').toUpperCase();
          const isSuv = catCode === 'SUV' || (m.model || '').includes('Lunes');
          const baseP = isSuv ? 72.0 : Number(m.precio_diario || 45.0);
          const finalPvp = Number((baseP * 1.15).toFixed(2));
          const ivaMonto = Number((finalPvp - baseP).toFixed(2));

          return {
            vehicle_id: vehicleId,
            id: vehicleId,
            auto_id: vehicleId,
            marca: m.make || 'Mercedes',
            modelo: m.model || 'RutaLibre',
            categoria: catCode,
            precio_diario: finalPvp,
            precio_base: baseP,
            price: finalPvp,
            daily_price: finalPvp,
            iva_monto: ivaMonto,
            tasa_iva: 0.15,
            impuestos_incluidos: true,
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
              ubicacion: unit.depot?.name || 'Andes — Aeropuerto Mariscal Sucre (UIO)',
            },
            estado: isAvail ? 'DISPONIBLE' : 'RESERVADO',
            disponible_desde: new Date().toISOString(),
            images: [this.resolveImageUrl(m.imageUrl)],
          };
        }
      }
    } catch (e: any) {
      this.logger.debug(`[fetchExternalCarById] Falló consulta de rescate en Daniel: ${e.message}`);
    }

    return null;
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
      const dData = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.orders || response.data?.items || []);
      if (Array.isArray(dData)) {
        orders.push(...dData);
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
            const existing = orders.find(o => {
              const oPnr = (o.pnr || o.order_id || o.codigo_reserva || o.id || '').toUpperCase();
              return oPnr === loc || (r.id && oPnr === String(r.id).toUpperCase());
            });
            const isAssisted = r.rentalStatus === 'PICKED_UP' ||
                               r.rentalStatus === 'RETURNED' ||
                               r.status === 'CONFIRMADO_ASISTIDO' ||
                               r.status === 'COMPLETED' ||
                               r.status === 'ENTREGADO' ||
                               r.status === 'ASISTIDO';
            if (existing) {
              existing.rentalStatus = r.rentalStatus;
              existing.rental_status = r.rentalStatus;
              if (r.plate) existing.plate = r.plate;
              if (isAssisted && existing.status !== 'CANCELLED') {
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
          if (
            mStatus === 'CONFIRMADO_ASISTIDO' ||
            mStatus === 'COMPLETED' ||
            mStatus === 'ASISTIDO' ||
            mStatus === 'PICKED_UP' ||
            mStatus === 'ENTREGADO' ||
            m.rental_status === 'PICKED_UP' ||
            m.rental_status === 'RETURNED' ||
            m.checkin_status === 'COMPLETED'
          ) {
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

    // 3. Socios del panel (Anthony - RentaFacil EC, RodadoEc)
    for (const def of this.SOCIOS_PANEL) {
      try {
        orders.push(...(await this.fetchSocioOrders(def)));
      } catch (err: any) {
        this.logger.debug(`[${def.nombre}] No se pudieron leer órdenes: ${err.response?.status || err.message}`);
      }
    }

    // Sobrescribir inmediatamente el estado a CANCELLED para órdenes canceladas registradas
    for (const ord of orders) {
      const id1 = ord.id ? String(ord.id).toUpperCase() : '';
      const id2 = ord.order_id ? String(ord.order_id).toUpperCase() : '';
      const id3 = ord.pnr ? String(ord.pnr).toUpperCase() : '';
      const id4 = ord.codigo_reserva ? String(ord.codigo_reserva).toUpperCase() : '';
      if (
        this.cancelledOrderIds.has(id1) ||
        this.cancelledOrderIds.has(id2) ||
        this.cancelledOrderIds.has(id3) ||
        this.cancelledOrderIds.has(id4)
      ) {
        ord.status = 'CANCELLED';
        ord.estado = 'CANCELLED';
      }
    }

    return orders;
  }

  /**
   * Consulta si una orden ha sido marcada como cancelada en memoria de resiliencia.
   */
  isOrderCancelled(orderId: string): boolean {
    if (!orderId) return false;
    const up = orderId.toUpperCase();
    const clean = up.replace(/^MDU-/, '').replace(/^AUTO-/, '');
    return (
      this.cancelledOrderIds.has(orderId) ||
      this.cancelledOrderIds.has(up) ||
      this.cancelledOrderIds.has(clean) ||
      this.cancelledOrderIds.has(`MDU-${clean}`)
    );
  }

  /**
   * Registra manualmente un ID de orden como cancelado para actualización inmediata de inventario.
   */
  markOrderAsCancelled(orderId: string): void {
    if (!orderId) return;
    const up = orderId.toUpperCase();
    const clean = up.replace(/^MDU-/, '').replace(/^AUTO-/, '');
    this.cancelledOrderIds.add(orderId);
    this.cancelledOrderIds.add(up);
    this.cancelledOrderIds.add(orderId.toLowerCase());
    this.cancelledOrderIds.add(clean);
    this.cancelledOrderIds.add(`MDU-${clean}`);
  }

  /**
   * Notifica el check-in digital al socio externo correspondiente (ej. Maneja de Una).
   */
  async notifyCheckinToPartner(orderIdOrPnr: string, documento: string): Promise<boolean> {
    if (!orderIdOrPnr) return false;
    const cleanId = orderIdOrPnr.toUpperCase();
    if (cleanId.startsWith('MDU-') || orderIdOrPnr.length === 36) {
      try {
        const mKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
        await firstValueFrom(
          this.httpService.post(
            `https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/reservas/${orderIdOrPnr}/checkin`,
            { documento_identidad: documento || '1720375003' },
            { headers: { 'X-API-Key': mKey, 'Content-Type': 'application/json' }, timeout: 5000 }
          )
        );
        this.logger.log(`[AutosCircuitBreaker] Check-in digital propagado a Maneja de Una: ${orderIdOrPnr}`);
        return true;
      } catch (err: any) {
        this.logger.debug(`[AutosCircuitBreaker] Aviso propagando check-in a Mateo: ${err.message}`);
        return false;
      }
    }
    return false;
  }

  /**
   * Notifica el check-in de devolución (retorno) a socios externos que lo soporten (ej. AutoSpot con km entero).
   */
  async notifyDevolucionToPartner(orderIdOrPnr: string, kmRetorno: number): Promise<boolean> {
    if (!orderIdOrPnr) return false;
    const cleanId = orderIdOrPnr.toUpperCase();
    const integerKm = Math.round(Number(kmRetorno));
    if (cleanId.startsWith('CAR') || cleanId.startsWith('RF')) {
      try {
        await firstValueFrom(
          this.httpService.post(
            `https://alquiler-vehiculos-ijx3.onrender.com/api/v3/autos/orders/${orderIdOrPnr}/checkin-devolucion`,
            { km_retorno: integerKm },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'xSQILcF-wlDGZ44NFmLpLbJlsX7rWooq',
              },
              timeout: 8000,
            },
          ),
        );
        this.logger.log(`[AutosCircuitBreaker] Devolución propagada a AutoSpot: ${orderIdOrPnr} (km: ${integerKm})`);
        return true;
      } catch (err: any) {
        this.logger.debug(`[AutosCircuitBreaker] Aviso propagando devolución a AutoSpot: ${err.message}`);
        return false;
      }
    }
    return false;
  }

  /**
   * Notifica la cancelación de una orden al socio externo (RutaLibre o Maneja de Una) con resiliencia dual.
   */
  async cancelOrder(orderId: string, reason = 'Cancelado por el cliente'): Promise<boolean> {
    const cleanId = orderId.toUpperCase();
    this.markOrderAsCancelled(orderId);

    // 0. Socios del panel (Anthony RFxxxxxx, RodadoEc por PNR registrado, AutoSpot)
    const socioCancel = await this.socioDePnr(cleanId);
    if (socioCancel) {
      const cfg = await this.getSocioConfig(socioCancel);
      try {
        await firstValueFrom(
          this.httpService.post(
            `${cfg.baseUrl}/autos/orders/${cleanId}/cancel`,
            { reason, motivo: reason, solicitante: 'SAGA_ORCHESTRATOR' },
            { headers: this.socioHeaders(cfg.apiKey, { 'Idempotency-Key': uuidv4() }), timeout: 8000 }
          )
        );
        this.logger.log(`[AutosCircuitBreaker] Cancelación propagada a ${socioCancel.nombre}: ${cleanId}`);
        return true;
      } catch (err: any) {
        if (err.response?.status === 409) {
          const detail = err.response.data?.detail || 'Cancelación no permitida: el alquiler ya comenzó.';
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Cancelación No Permitida',
            status: HttpStatus.CONFLICT,
            detail,
          }, HttpStatus.CONFLICT);
        }
        this.logger.warn(`[AutosCircuitBreaker] No se pudo cancelar en ${socioCancel.nombre} (${cleanId}): ${err.response?.status || err.message}`);
        return false;
      }
    }

    // 1. Si coincide con formato Maneja de Una (MDU- o UUID)
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
        if (err.response?.status === 409) {
          const detail = err.response.data?.detail || err.response.data?.message || 'Cancelación no permitida: El alquiler ya comenzó o no se puede cancelar.';
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Cancelación No Permitida',
            status: HttpStatus.CONFLICT,
            detail: detail,
          }, HttpStatus.CONFLICT);
        }
        this.logger.warn(`[AutosCircuitBreaker] No se pudo cancelar en Maneja de Una (${orderId}): ${err.message}`);
      }
    }

    // 2. RutaLibre (Daniel) - Despacho con endpoint principal y fallback de ruta
    try {
      const key = this.EXTERNAL_API_KEY || process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      try {
        await firstValueFrom(
          this.httpService.post(
            `https://rutalibre-autos-api.azurewebsites.net/api/v3/autos/orders/${cleanId}/cancel`,
            { reason },
            { headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, timeout: 4000 }
          )
        );
        this.logger.log(`[AutosCircuitBreaker] Cancelación propagada exitosamente a RutaLibre (/autos/orders/...): ${cleanId}`);
        return true;
      } catch (err1: any) {
        if (err1.response?.status === 409) {
          const detail = err1.response.data?.detail || err1.response.data?.message || 'El alquiler ya comenzó; no se puede cancelar';
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Cancelación No Permitida',
            status: HttpStatus.CONFLICT,
            detail: detail,
          }, HttpStatus.CONFLICT);
        }
        if (err1.response?.status === 404) {
          await firstValueFrom(
            this.httpService.post(
              `https://rutalibre-autos-api.azurewebsites.net/api/v3/orders/${cleanId}/cancel`,
              { reason },
              { headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, timeout: 4000 }
            )
          );
          this.logger.log(`[AutosCircuitBreaker] Cancelación propagada exitosamente a RutaLibre (/orders/...): ${cleanId}`);
          return true;
        }
        throw err1;
      }
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.warn(`[AutosCircuitBreaker] No se pudo cancelar en RutaLibre (${orderId}): ${err.message}`);

      // Fallback resiliente: Si no era MDU pero falló en Daniel, intentar en Mateo
      if (!cleanId.startsWith('MDU-')) {
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
                timeout: 4000,
              }
            )
          );
          this.logger.log(`[AutosCircuitBreaker] Cancelación propagada como fallback a Maneja de Una: ${cleanId}`);
          return true;
        } catch (_) {}
      }
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

    // Despacho a socios del panel (Anthony - RentaFacil EC, RodadoEc)
    const socio = isMateo ? undefined : this.socioDeVehiculo(payload.vehicle_id, (payload as any).proveedor_codigo);
    if (socio) {
      const rf = await this.getSocioConfig(socio);
      const clientEmail = (payload.conductor.email || '').trim();
      const clientDoc = (payload.conductor.licencia || (payload.conductor as any).documento || (payload.conductor as any).identificacion || '').trim();
      const clientName = (payload.conductor.nombre || '').trim();
      const clientPhone = normalizedPhone || '';

      // 1-2. Sincronizar cliente (GET y, si no existe, POST /clientes)
      let clientExists = false;
      try {
        const checkRes = await firstValueFrom(
          this.httpService.get(
            `${rf.baseUrl}/clientes?email=${encodeURIComponent(clientEmail)}&identificacion=${encodeURIComponent(clientDoc)}`,
            { headers: this.socioHeaders(rf.apiKey), timeout: 8000 }
          )
        );
        clientExists = checkRes.status === 200 && !!checkRes.data;
      } catch (_) {}
      if (!clientExists) {
        try {
          await firstValueFrom(
            this.httpService.post(
              `${rf.baseUrl}/clientes`,
              { nombre: clientName, email: clientEmail, identificacion: clientDoc, telefono: clientPhone, licencia: clientDoc },
              { headers: this.socioHeaders(rf.apiKey), timeout: 8000 }
            )
          );
        } catch (regErr: any) {
          this.logger.warn(`[${socio.nombre}] Aviso al registrar cliente: ${regErr.response?.data?.detail || regErr.message}`);
        }
      }

      // 3. Crear la reserva
      const pickupTime = (payload as any).pickup_time || '10:00';
      const dropoffTime = (payload as any).dropoff_time || '10:00';
      const rfPayload = {
        vehicle_id: payload.vehicle_id,
        pickup_date: payload.pickup_date,
        dropoff_date: payload.dropoff_date,
        pickup_time: /^([01]\d|2[0-3]):(?:00|30)$/.test(pickupTime) ? pickupTime : '10:00',
        dropoff_time: /^([01]\d|2[0-3]):(?:00|30)$/.test(dropoffTime) ? dropoffTime : '10:00',
        pickup_location: payload.pickup_location,
        dropoff_location: payload.dropoff_location,
        coverage_type: payload.tipo_cobertura === 'TOTAL' ? 'TOTAL' : 'BASIC',
        driver: {
          full_name: clientName,
          email: clientEmail,
          phone: clientPhone,
          license_number: clientDoc,
          age: Number(payload.conductor.edad),
        },
      };

      try {
        const response = await firstValueFrom(
          this.httpService.post(`${rf.baseUrl}/autos/orders/create`, rfPayload, {
            headers: this.socioHeaders(rf.apiKey, {
              'Idempotency-Key': safeIdempotencyKey,
              'X-Correlation-Id': cId,
            }),
            timeout: 25000,
          })
        );
        this.handleSuccess();
        const pnr = response.data?.pnr || response.data?.codigo_reserva || response.data?.order_id;
        if (pnr) this.socioPnrs.set(String(pnr).toUpperCase(), socio.clave);
        return {
          external_order_id: pnr,
          status: 'CONFIRMED',
          pnr,
          auto_id: response.data?.auto_id || response.data?.vehicle_id || payload.vehicle_id,
          voucher_qr_data: response.data?.voucher_qr_data || response.data?.voucher_qr_payload || `BOOKING-CAR-${pnr}`,
          raw_response: response.data,
        };
      } catch (err: any) {
        this.logger.error(`[AutosCircuitBreaker] Error despachando a ${socio.nombre}: ${JSON.stringify(err.response?.data || err.message)}`);
        if (err.response?.status === 409) {
          const detail = err.response?.data?.detail || err.response?.data?.message || 'El vehículo no está disponible en las fechas solicitadas.';
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Vehículo No Disponible',
            status: HttpStatus.CONFLICT,
            statusCode: HttpStatus.CONFLICT,
            detail: detail,
            message: detail,
            code: 'VEHICLE_UNAVAILABLE',
            correlation_id: cId,
          }, HttpStatus.CONFLICT);
        }
        throw new HttpException({
          type: 'https://api.booking.local/errors/bad-request',
          title: 'Datos Inválidos',
          status: HttpStatus.BAD_REQUEST,
          detail: err.response?.data?.detail || err.response?.data?.message || `No se pudo crear la orden en ${socio.nombre}.`,
        }, HttpStatus.BAD_REQUEST);
      }
    }

    // Despacho a Maneja de Una (Mateo Morales - NODE_AUT_MDU)
    if (isMateo) {
      const clientEmail = (payload.conductor.email || 'conductor@booking.com').trim();
      const clientDoc = (payload.conductor.licencia || (payload.conductor as any).documento || (payload.conductor as any).identificacion || '1755073481').trim();
      const clientName = (payload.conductor.nombre || 'Conductor Booking').trim();
      const clientPhone = normalizedPhone || '+593999999999';
      const mateoKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
      const mateoBase = 'https://maneja-de-una-autos-api.azurewebsites.net/api/v3';

      // 1. Consultar si el cliente existe en Mateo priorizando IDENTIFICACIÓN (Resolución JIT)
      let clientExists = false;
      let mateoEmail = clientEmail;
      try {
        const checkUrl = `${mateoBase}/clientes?identificacion=${encodeURIComponent(clientDoc)}`;
        this.logger.log(`[Autos Mateo] Paso 1: Consultando existencia de cliente por identificación: ${checkUrl}`);
        const checkRes = await firstValueFrom(
          this.httpService.get(checkUrl, {
            headers: { 'X-API-Key': mateoKey },
            timeout: 5000,
          })
        );
        if (checkRes.status === 200 && checkRes.data) {
          const d = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
          if (d && (d.client_id || d.id || d.identificacion)) {
            clientExists = true;
            if (d.email) mateoEmail = d.email; // Aliasing
            this.logger.log(`[Autos Mateo JIT] Cliente ya existe en Maneja de Una. Email socio: ${mateoEmail}`);
          }
        }
      } catch (err: any) {
        this.logger.debug(`[Autos Mateo] Búsqueda por identificación retornó: ${err.response?.status || err.message}`);
      }

      // Si no se encontró por identificación, probar por email
      if (!clientExists) {
        try {
          const checkEmailUrl = `${mateoBase}/clientes?email=${encodeURIComponent(clientEmail)}`;
          const checkEmailRes = await firstValueFrom(
            this.httpService.get(checkEmailUrl, {
              headers: { 'X-API-Key': mateoKey },
              timeout: 4000,
            })
          );
          if (checkEmailRes.status === 200 && checkEmailRes.data) {
            clientExists = true;
          }
        } catch (_) {}
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
          email: mateoEmail || clientEmail,
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
          const detail = err.response?.data?.detail || err.response?.data?.message || 'El vehículo no está disponible en las fechas solicitadas.';
          throw new HttpException({
            type: 'https://api.booking.local/errors/conflict',
            title: 'Vehículo No Disponible',
            status: HttpStatus.CONFLICT,
            statusCode: HttpStatus.CONFLICT,
            detail: detail,
            message: detail,
            code: 'VEHICLE_UNAVAILABLE',
            correlation_id: cId,
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

    // Sincronizar conductor con microservicio de clientes en RutaLibre (Fase 1 Cross-Platform con Resolución JIT)
    let rutaLibreEmail = payload.conductor.email || 'conductor@booking.com';
    const rutaLibreDoc = payload.conductor.licencia || '1723456789';
    try {
      const checkRes = await firstValueFrom(
        this.httpService.get(
          `https://rutalibre-autos-api.azurewebsites.net/api/v3/clientes?identificacion=${encodeURIComponent(rutaLibreDoc)}`,
          {
            headers: { 'X-API-Key': key },
            timeout: 3000,
          },
        ),
      );
      if (checkRes.status === 200 && checkRes.data) {
        const d = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
        if (d && d.email) {
          rutaLibreEmail = d.email; // Aliasing
          this.logger.log(`[Autos RutaLibre JIT] Cliente existente por identificación en Daniel: email ${rutaLibreEmail}`);
        }
      }
    } catch (_) {
      try {
        await firstValueFrom(
          this.httpService.post(
            'https://rutalibre-autos-api.azurewebsites.net/api/v3/clientes',
            {
              nombre: payload.conductor.nombre,
              email: payload.conductor.email,
              identificacion: rutaLibreDoc,
              telefono: normalizedPhone,
              licencia: rutaLibreDoc,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': key,
              },
              timeout: 3000,
            },
          ),
        );
      } catch (_) {}
    }

    // Despachar orden canónica a RutaLibre v3: POST /api/v3/orders
    const requestPayload = {
      vehicle_id: payload.vehicle_id,
      pickup_date: payload.pickup_date || new Date().toISOString().split('T')[0],
      dropoff_date: payload.dropoff_date || new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0],
      pickup_location: payload.pickup_location || 'Quito Aeropuerto',
      dropoff_location: payload.dropoff_location || 'Quito Aeropuerto',
      driver: {
        full_name: payload.conductor.nombre || 'Conductor Booking',
        email: rutaLibreEmail,
        phone: normalizedPhone,
        license_number: rutaLibreDoc,
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
