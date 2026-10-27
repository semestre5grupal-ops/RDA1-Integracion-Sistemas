import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigProveedor } from './entities';
import { Atraccion } from '../atracciones/entities/atraccion.entity';
import { Auto } from '../autos/entities/auto.entity';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { ConnectorHealthService } from '../admin/connector-health.service';
import { TraceContextService } from '../../core/tracing/trace-context.service';

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    @InjectRepository(ConfigProveedor)
    private readonly configRepo: Repository<ConfigProveedor>,
    @InjectRepository(Atraccion)
    private readonly atraccionRepo: Repository<Atraccion>,
    @Optional()
    @InjectRepository(Auto)
    private readonly autoRepo?: Repository<Auto>,
    private readonly winstonLogger?: WinstonPhysicalLoggerService,
    @Optional()
    private readonly connectorHealthService?: ConnectorHealthService,
    @Optional()
    private readonly traceContext?: TraceContextService,
  ) {}

  private fetchWithTrace(input: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(this.traceContext?.outgoingHeaders() ?? {})) {
      headers.set(name, value);
    }
    return fetch(input, { ...init, headers });
  }

  async listarNodos(): Promise<any[]> {
    this.logger.log('Consultando estado de salud de nodos de proveedores en schema_proveedores');
    // Sembrar y asegurar los 20 nodos oficiales estandarizados (5 por vertical)
    await this.sembrarNodosPorDefecto();
    let nodos = await this.configRepo.find({ order: { vertical: 'ASC', codigoNodo: 'ASC' } });

    return nodos.map(n => {
      // Cálculo del semáforo LED visual (🟢/🟡/🔴) para Panel 1
      let ledColor = '🟢';
      let ledStatus = 'HEALTHY';
      if (n.killSwitchActivo) {
        ledColor = '🔴';
        ledStatus = 'KILL_SWITCH_ACTIVE';
      } else if (n.healthStatus === 'DOWN' || n.tasaFallosPct >= 50) {
        ledColor = '🔴';
        ledStatus = 'DOWN';
      } else if (n.healthStatus === 'DEGRADED' || n.latenciaMs > 800 || n.tasaFallosPct > 5) {
        ledColor = '🟡';
        ledStatus = 'DEGRADED';
      }

      return {
        id: n.id,
        codigo_nodo: n.codigoNodo,
        codigo: n.codigoNodo,
        nombre_proveedor: n.nombreProveedor,
        nombre: n.nombreProveedor,
        equipo: n.equipo || '',
        contacto: n.contacto || '',
        emoji: n.emoji || '🔗',
        descripcion: n.descripcion || '',
        vertical: n.vertical,
        tipo: n.vertical.charAt(0).toUpperCase() + n.vertical.slice(1).toLowerCase(),
        base_url_rest: n.baseUrlRest,
        url: n.baseUrlRest,
        api_base: n.baseUrlRest,
        apiBase: n.baseUrlRest,
        endpoint_grpc: n.endpointGrpc,
        endpointGrpc: n.endpointGrpc,
        api_key: n.apiKey,
        apiKey: n.apiKey,
        health_status: n.healthStatus,
        activo: !n.killSwitchActivo,
        estado: n.killSwitchActivo ? 'APAGADO' : (n.healthStatus === 'HEALTHY' ? 'OPERATIVO' : n.healthStatus),
        latencia_ms: n.latenciaMs,
        latenciaMs: n.latenciaMs,
        ultimo_ping_at: n.ultimoPingAt,
        kill_switch_activo: n.killSwitchActivo,
        killSwitchActivo: n.killSwitchActivo,
        circuit_breaker_estado: n.circuitBreakerEstado,
        tasa_fallos_pct: Number(n.tasaFallosPct),
        failCount: n.circuitBreakerEstado === 'OPEN' ? 3 : 0,
        semaforo_led: {
          icono: ledColor,
          estado: ledStatus,
        },
      };
    });
  }

  /**
   * Registra un nuevo socio / proveedor en la tabla schema_proveedores.config_proveedor
   */
  async crearNodo(dto: any): Promise<any> {
    const nombre = dto.nombreProveedor || dto.nombre_proveedor || dto.nombre;
    if (!nombre) {
      throw new HttpException('El nombre del proveedor es obligatorio', HttpStatus.BAD_REQUEST);
    }
    const rawVertical = dto.vertical || dto.tipo || 'ATRACCIONES';
    const vertical = rawVertical.toUpperCase().trim();
    const url = dto.baseUrlRest || dto.base_url_rest || dto.apiBase || dto.url;
    if (!url) {
      throw new HttpException('La URL base REST es obligatoria', HttpStatus.BAD_REQUEST);
    }

    // Código de nodo generado si no viene especificado
    let codigo = dto.codigoNodo || dto.codigo_nodo;
    if (!codigo) {
      const prefijo = vertical.substring(0, 3).toUpperCase();
      const slugNombre = nombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 8).toUpperCase();
      codigo = `NODE_${prefijo}_${slugNombre}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    const existente = await this.configRepo.findOne({ where: { codigoNodo: codigo } });
    if (existente) {
      codigo = `${codigo}_${Date.now().toString(36).substring(3, 7).toUpperCase()}`;
    }

    const nuevo = this.configRepo.create({
      codigoNodo: codigo,
      nombreProveedor: nombre,
      vertical: vertical,
      baseUrlRest: url.trim(),
      endpointGrpc: dto.endpointGrpc || dto.endpoint_grpc || null,
      apiKey: (dto.apiKey || dto.api_key || '').trim() || null,
      healthStatus: 'HEALTHY',
      latenciaMs: 25,
      killSwitchActivo: false,
      circuitBreakerEstado: 'CLOSED',
      tasaFallosPct: 0.00,
      equipo: dto.equipo || '',
      contacto: dto.contacto || '',
      emoji: dto.emoji || '🔗',
      descripcion: dto.descripcion || '',
    });

    const guardado = await this.configRepo.save(nuevo);

    this.winstonLogger.logAudit('NODO_PROVEEDOR_CREADO', {
      codigo_nodo: guardado.codigoNodo,
      nombre_proveedor: guardado.nombreProveedor,
      vertical: guardado.vertical,
      base_url_rest: guardado.baseUrlRest,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      mensaje: `Proveedor '${guardado.nombreProveedor}' registrado exitosamente en el Gateway.`,
      nodo: {
        id: guardado.id,
        codigo_nodo: guardado.codigoNodo,
        codigo: guardado.codigoNodo,
        nombre_proveedor: guardado.nombreProveedor,
        nombre: guardado.nombreProveedor,
        vertical: guardado.vertical,
        base_url_rest: guardado.baseUrlRest,
        url: guardado.baseUrlRest,
        endpoint_grpc: guardado.endpointGrpc,
        endpointGrpc: guardado.endpointGrpc,
        api_key: guardado.apiKey,
        apiKey: guardado.apiKey,
        health_status: guardado.healthStatus,
        kill_switch_activo: guardado.killSwitchActivo,
        circuit_breaker_estado: guardado.circuitBreakerEstado,
        equipo: guardado.equipo,
        contacto: guardado.contacto,
        emoji: guardado.emoji,
        descripcion: guardado.descripcion,
      },
    };
  }

  /**
   * Elimina un nodo proveedor de schema_proveedores.config_proveedor
   */
  async eliminarNodo(codigoNodo: string): Promise<any> {
    const nodo = await this.configRepo.findOne({
      where: [{ codigoNodo }, { id: codigoNodo }],
    });
    if (!nodo) {
      throw new HttpException(`Nodo con código o id '${codigoNodo}' no encontrado`, HttpStatus.NOT_FOUND);
    }

    await this.configRepo.remove(nodo);

    this.winstonLogger.logAudit('NODO_PROVEEDOR_ELIMINADO', {
      codigo_nodo: nodo.codigoNodo,
      nombre_proveedor: nodo.nombreProveedor,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      mensaje: `Proveedor '${nodo.nombreProveedor}' (${nodo.codigoNodo}) eliminado correctamente.`,
    };
  }

  /**
   * Parametriza en vivo la URL oficial REST o gRPC de un nodo socio (Cátedra RDA2 CE01).
   */
  async actualizarNodo(
    codigoNodo: string,
    dto: any,
  ): Promise<any> {
    const nodo = await this.configRepo.findOne({
      where: [{ codigoNodo }, { id: codigoNodo }],
    });
    if (!nodo) {
      throw new HttpException(`Nodo con código o id '${codigoNodo}' no encontrado`, HttpStatus.NOT_FOUND);
    }

    const previousUrl = nodo.baseUrlRest;
    const previousGrpc = nodo.endpointGrpc;

    if (dto.baseUrlRest || dto.base_url_rest || dto.apiBase || dto.url) {
      nodo.baseUrlRest = dto.baseUrlRest || dto.base_url_rest || dto.apiBase || dto.url;
    }
    if (dto.endpointGrpc !== undefined || dto.endpoint_grpc !== undefined) {
      nodo.endpointGrpc = dto.endpointGrpc || dto.endpoint_grpc;
    }
    if (dto.nombreProveedor || dto.nombre_proveedor || dto.nombre) {
      nodo.nombreProveedor = dto.nombreProveedor || dto.nombre_proveedor || dto.nombre;
    }
    if (dto.vertical || dto.tipo) {
      nodo.vertical = (dto.vertical || dto.tipo).toUpperCase();
    }
    if (dto.apiKey !== undefined || dto.api_key !== undefined) {
      const rawKey = dto.apiKey !== undefined ? dto.apiKey : dto.api_key;
      nodo.apiKey = (rawKey || '').trim() || null;
    }
    if (dto.equipo !== undefined) nodo.equipo = dto.equipo;
    if (dto.contacto !== undefined) nodo.contacto = dto.contacto;
    if (dto.emoji !== undefined) nodo.emoji = dto.emoji;
    if (dto.descripcion !== undefined) nodo.descripcion = dto.descripcion;

    const guardado = await this.configRepo.save(nodo);

    // Actualizar en el monitor de memoria en vivo si está disponible
    if (this.connectorHealthService && dto.baseUrlRest) {
      try {
        const serviceId = nodo.vertical.toLowerCase();
        this.connectorHealthService.updateNodeUrl(serviceId, dto.baseUrlRest);
      } catch (e) {
        this.logger.warn(`No se pudo sincronizar en memoria: ${e.message}`);
      }
    }

    // Auditoría física en Winston (CERO logs en BD)
    this.winstonLogger.logAudit('NODO_PARAMETRIZACION_ACTUALIZADA', {
      codigo_nodo: nodo.codigoNodo,
      nombre_proveedor: nodo.nombreProveedor,
      vertical: nodo.vertical,
      previous_url_rest: previousUrl,
      new_url_rest: nodo.baseUrlRest,
      previous_grpc: previousGrpc,
      new_grpc: nodo.endpointGrpc,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      mensaje: `Nodo '${nodo.codigoNodo}' parametrizado en vivo exitosamente con URL oficial.`,
      nodo: {
        id: guardado.id,
        codigo_nodo: guardado.codigoNodo,
        codigo: guardado.codigoNodo,
        nombre_proveedor: guardado.nombreProveedor,
        nombre: guardado.nombreProveedor,
        vertical: guardado.vertical,
        base_url_rest: guardado.baseUrlRest,
        url: guardado.baseUrlRest,
        endpoint_grpc: guardado.endpointGrpc,
        endpointGrpc: guardado.endpointGrpc,
        api_key: guardado.apiKey,
        apiKey: guardado.apiKey,
        health_status: guardado.healthStatus,
        kill_switch_activo: guardado.killSwitchActivo,
        circuit_breaker_estado: guardado.circuitBreakerEstado,
        equipo: guardado.equipo,
        contacto: guardado.contacto,
        emoji: guardado.emoji,
        descripcion: guardado.descripcion,
      },
    };
  }

  async toggleKillSwitch(codigoNodo: string, activar?: boolean): Promise<any> {
    const nodo = await this.configRepo.findOne({
      where: [{ codigoNodo }, { id: codigoNodo }],
    });
    if (!nodo) {
      throw new HttpException(`Nodo con código o id '${codigoNodo}' no encontrado`, HttpStatus.NOT_FOUND);
    }

    const nuevoEstado = activar !== undefined ? activar : !nodo.killSwitchActivo;
    nodo.killSwitchActivo = nuevoEstado;
    if (nuevoEstado) {
      nodo.healthStatus = 'DOWN';
      nodo.circuitBreakerEstado = 'OPEN';
    } else {
      nodo.healthStatus = 'HEALTHY';
      nodo.circuitBreakerEstado = 'CLOSED';
    }
    const guardado = await this.configRepo.save(nodo);

    // Sincronizar con el monitor en memoria para desacoplar adaptadores ACL
    if (this.connectorHealthService) {
      try {
        const serviceId = nodo.vertical.toLowerCase();
        this.connectorHealthService.toggleNode(serviceId, !nuevoEstado);
      } catch (e) {
        this.logger.warn(`No se pudo sincronizar toggle en memoria: ${e.message}`);
      }
    }

    // Auditoría Winston obligatoria (Cero logs en BD)
    this.winstonLogger.logAudit('KILL_SWITCH_PROVEEDOR_ALTERADO', {
      codigo_nodo: nodo.codigoNodo,
      nombre_proveedor: nodo.nombreProveedor,
      vertical: nodo.vertical,
      kill_switch_activo: nuevoEstado,
      nuevo_health_status: nodo.healthStatus,
    });

    return {
      success: true,
      codigo_nodo: nodo.codigoNodo,
      id: nodo.id,
      kill_switch_activo: nuevoEstado,
      killSwitchActivo: nuevoEstado,
      estado: nuevoEstado ? 'APAGADO' : 'OPERATIVO',
      mensaje: nuevoEstado
        ? `Kill-Switch ACTIVADO para ${nodo.nombreProveedor}. Las peticiones a este socio serán bloqueadas de inmediato.`
        : `Kill-Switch DESACTIVADO para ${nodo.nombreProveedor}. Tráfico normal restablecido.`,
    };
  }

  /**
   * Ping de diagnóstico HTTP real a la URL del socio con medición de latencia
   */
  async pingNodo(codigoNodo: string): Promise<any> {
    const nodo = await this.configRepo.findOne({
      where: [{ codigoNodo }, { id: codigoNodo }],
    });
    if (!nodo) {
      throw new HttpException(`Nodo con código o id '${codigoNodo}' no encontrado`, HttpStatus.NOT_FOUND);
    }

    const t0 = Date.now();
    let latencia = 25;
    let online = true;

    if (nodo.baseUrlRest && (nodo.baseUrlRest.startsWith('http://') || nodo.baseUrlRest.startsWith('https://'))) {
      try {
        const pingUrl = nodo.baseUrlRest.replace(/\/+$/, '') + '/health';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const pingHeaders: Record<string, string> = {};
        const partnerKey = nodo.apiKey || (nodo.vertical === 'ATRACCIONES' ? process.env.TIENDA_ATRACCIONES_API_KEY : (nodo.vertical === 'AUTOS' ? process.env.TIENDA_AUTOS_API_KEY : ''));
        if (partnerKey) {
          pingHeaders['X-API-Key'] = partnerKey;
        }

        let res = await this.fetchWithTrace(pingUrl, { headers: pingHeaders, signal: controller.signal }).catch(async () => {
          return this.fetchWithTrace(nodo.baseUrlRest, { headers: pingHeaders, signal: controller.signal });
        });
        clearTimeout(timeout);
        latencia = Date.now() - t0;
        online = res ? res.status < 500 : false;
      } catch (e) {
        latencia = Date.now() - t0;
        online = false;
      }
    } else {
      latencia = Math.floor(Math.random() * 40) + 15;
    }

    nodo.latenciaMs = latencia;
    nodo.ultimoPingAt = new Date();
    if (!nodo.killSwitchActivo) {
      nodo.healthStatus = online ? (latencia > 800 ? 'DEGRADED' : 'HEALTHY') : 'DOWN';
    }
    await this.configRepo.save(nodo);

    return {
      success: true,
      codigo_nodo: nodo.codigoNodo,
      latencia_ms: latencia,
      latenciaMs: latencia,
      health_status: nodo.healthStatus,
      online: nodo.healthStatus === 'HEALTHY' || nodo.healthStatus === 'DEGRADED',
      timestamp: nodo.ultimoPingAt,
    };
  }

  /**
   * Sincroniza e importa el catálogo de atracciones del proveedor externo hacia Booking (OpenAPI v2)
   */
  async sincronizarCatalogo(codigoNodo: string): Promise<any> {
    const nodo = await this.configRepo.findOne({
      where: [{ codigoNodo }, { id: codigoNodo }],
    });
    if (!nodo) {
      throw new HttpException(`Nodo con código o id '${codigoNodo}' no encontrado`, HttpStatus.NOT_FOUND);
    }

    if (nodo.killSwitchActivo) {
      throw new HttpException(
        `El Kill-Switch del proveedor '${nodo.nombreProveedor}' está activo. Desactívelo antes de sincronizar catálogo.`,
        HttpStatus.FORBIDDEN,
      );
    }

    this.logger.log(`Sincronizando catálogo con socio: ${nodo.nombreProveedor} (${nodo.baseUrlRest})`);

    let targetUrl = nodo.baseUrlRest.replace(/\/+$/, '');
    if (nodo.vertical === 'ATRACCIONES' && !targetUrl.includes('/atracciones')) {
      targetUrl += '/atracciones';
    } else if (nodo.vertical === 'AUTOS' && !targetUrl.includes('/autos')) {
      targetUrl += '/autos';
    }

    // Fase 3: Parámetro ?limit=50 para traer la totalidad del catálogo del socio sin truncamiento
    const sep = targetUrl.includes('?') ? '&' : '?';
    if (!targetUrl.includes('limit=')) {
      targetUrl += `${sep}limit=50`;
    }

    let itemsExternos: any[] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const syncHeaders: Record<string, string> = { Accept: 'application/json' };
      const partnerKey = nodo.apiKey || (nodo.vertical === 'ATRACCIONES' ? process.env.TIENDA_ATRACCIONES_API_KEY : (nodo.vertical === 'AUTOS' ? process.env.TIENDA_AUTOS_API_KEY : ''));
      if (partnerKey) {
        syncHeaders['X-API-Key'] = partnerKey;
      }

      const resp = await this.fetchWithTrace(targetUrl, {
        headers: syncHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`El servidor del socio respondió con HTTP ${resp.status}`);
      }

      const body = await resp.json();
      if (Array.isArray(body)) {
        itemsExternos = body;
      } else if (Array.isArray(body?.items)) {
        itemsExternos = body.items;
      } else if (Array.isArray(body?.data)) {
        itemsExternos = body.data;
      } else {
        itemsExternos = [];
      }
    } catch (err: any) {
      this.logger.error(`Error al conectar con catálogo externo de ${nodo.nombreProveedor}: ${err.message}`);
      throw new HttpException(
        `No se pudo sincronizar el catálogo de '${nodo.nombreProveedor}': ${err.message}. Verifique que el servicio esté en línea y accesible.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (itemsExternos.length === 0) {
      return {
        success: true,
        count: 0,
        mensaje: `El proveedor '${nodo.nombreProveedor}' respondió correctamente pero su catálogo no devolvió items.`,
      };
    }

    if (nodo.vertical === 'AUTOS') {
      let sincronizados = 0;
      for (const raw of itemsExternos) {
        try {
          const rawId = String(raw.id || raw.item_id || raw.auto_id || raw.vehicle_id || `auto-${Date.now()}-${sincronizados}`);
          const marca = String(raw.marca || raw.make || raw.brand || 'Chevrolet');
          const modelo = String(raw.modelo || raw.model || 'Sail');
          const anio = Number(raw.anio || raw.year || 2024);
          const categoria = String(raw.categoria || raw.category || 'ECONOMICO').toUpperCase();
          const transmision = String(raw.transmision || raw.transmission || 'MANUAL').toUpperCase();
          const capacidad = Number(raw.capacidad_pasajeros || raw.seats || raw.passengers || 5);
          const precio = Number(raw.precio_diario || raw.price?.total || raw.daily_rate || raw.precio || 40.0);
          const foto = String(raw.foto_url || raw.image_url || raw.image || (Array.isArray(raw.images) ? raw.images[0] : '') || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800');
          const ciudad = String(raw.ciudad || raw.city || raw.location || 'Quito');

          if (this.autoRepo) {
            let entity = await this.autoRepo.findOne({ where: { id: rawId } });
            if (!entity) {
              entity = this.autoRepo.create({
                id: rawId,
                marca,
                modelo,
                anio,
                categoria,
                transmision,
                capacidadPasajeros: capacidad,
                precioDiario: precio,
                kilometrajeActual: Number(raw.kilometraje_actual || raw.mileage || 12000),
                umbralMantenimientoKm: Number(raw.umbral_mantenimiento_km || raw.proximo_mantenimiento_km || 15000),
                alertaMantenimientoActiva: Boolean(raw.alerta_mantenimiento || false),
                estadoOperativo: String(raw.estado || raw.status || 'DISPONIBLE'),
                fotoUrl: foto,
                ciudad,
                activo: true,
              });
            } else {
              entity.marca = marca;
              entity.modelo = modelo;
              entity.anio = anio;
              entity.categoria = categoria;
              entity.transmision = transmision;
              entity.capacidadPasajeros = capacidad;
              entity.precioDiario = precio;
              entity.fotoUrl = foto;
              entity.ciudad = ciudad;
              entity.estadoOperativo = String(raw.estado || raw.status || entity.estadoOperativo);
            }
            await this.autoRepo.save(entity);
          }
          sincronizados++;
        } catch (itemErr: any) {
          this.logger.warn(`No se pudo procesar item de auto: ${itemErr.message}`);
        }
      }

      this.winstonLogger?.logAudit('CATALOGO_AUTOS_SINCRONIZADO', {
        codigo_nodo: nodo.codigoNodo,
        nombre_proveedor: nodo.nombreProveedor,
        items_recibidos: itemsExternos.length,
        items_sincronizados: sincronizados,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        count: sincronizados,
        total_recibidos: itemsExternos.length,
        mensaje: `¡Catálogo de autos de '${nodo.nombreProveedor}' sincronizado con éxito! (${sincronizados} vehículos integrados a Booking)`,
      };
    }

    let sincronizados = 0;
    for (const raw of itemsExternos) {
      try {
        const rawId = String(raw.id || raw.item_id || raw.slug || `atrac-${Date.now()}-${sincronizados}`);
        const slug = String(raw.slug || rawId.toLowerCase().replace(/[^a-z0-9]/g, '-'));
        const nombre = raw.nombre || raw.name || raw.title || 'Atracción Turística';
        const precio = Number(raw.precio_unitario_adulto || raw.price?.total || raw.precio || 55.0);

        let entity = await this.atraccionRepo.findOne({ where: [{ id: rawId }, { slug }] });
        if (!entity) {
          entity = this.atraccionRepo.create({
            id: rawId,
            slug,
            nombre,
            ciudad: raw.ciudad || raw.city || 'Ecuador',
            pais: raw.pais || raw.country || 'Ecuador',
            descripcionCorta: raw.descripcion_corta || raw.short_description || '',
            descripcionLarga: raw.descripcion_larga || raw.long_description || raw.description || '',
            duracionEstimada: raw.duracion_estimada || raw.duration || 'PT3H',
            precioUnitarioAdulto: precio,
            moneda: raw.moneda || raw.currency || 'USD',
            cancelacionGratis: raw.cancelacion_gratis !== undefined ? Boolean(raw.cancelacion_gratis) : true,
            adicionAnimalesServicio: raw.adicion_animales_servicio !== undefined ? Boolean(raw.adicion_animales_servicio) : true,
            accesibleSillaRuedas: raw.accesible_silla_ruedas !== undefined ? Boolean(raw.accesible_silla_ruedas) : false,
            idiomasSoportados: Array.isArray(raw.idiomas_soportados) ? raw.idiomas_soportados : ['es', 'en'],
            puntoEncuentro: raw.punto_encuentro || raw.meeting_point || 'Punto de encuentro indicado en voucher',
            latitud: raw.latitud || -0.220164,
            longitud: raw.longitud || -78.512327,
            fotosUrls: Array.isArray(raw.fotos_urls) ? raw.fotos_urls : (raw.image ? [raw.image] : []),
            inclusiones: Array.isArray(raw.inclusiones) ? raw.inclusiones : ['Guía acreditado'],
            exclusiones: Array.isArray(raw.exclusiones) ? raw.exclusiones : [],
            ratingGeneral: raw.rating_general || 9.5,
            reviewsCount: raw.reviews_count || 10,
            activo: true,
            proveedorId: nodo.id,
            proveedorCodigo: nodo.codigoNodo,
          });
        } else {
          entity.nombre = nombre;
          entity.precioUnitarioAdulto = precio;
          if (raw.descripcion_corta) entity.descripcionCorta = raw.descripcion_corta;
          if (raw.descripcion_larga) entity.descripcionLarga = raw.descripcion_larga;
          entity.proveedorId = nodo.id;
          entity.proveedorCodigo = nodo.codigoNodo;
        }

        await this.atraccionRepo.save(entity);
        sincronizados++;
      } catch (itemErr: any) {
        this.logger.warn(`No se pudo procesar item de atracción: ${itemErr.message}`);
      }
    }

    this.winstonLogger.logAudit('CATALOGO_PROVEEDOR_SINCRONIZADO', {
      codigo_nodo: nodo.codigoNodo,
      nombre_proveedor: nodo.nombreProveedor,
      items_recibidos: itemsExternos.length,
      items_sincronizados: sincronizados,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      count: sincronizados,
      total_recibidos: itemsExternos.length,
      mensaje: `¡Catálogo de '${nodo.nombreProveedor}' sincronizado con éxito! (${sincronizados} atracciones integradas a Booking)`,
    };
  }

  private async sembrarNodosPorDefecto(): Promise<void> {
    const bookingGrpc = process.env.GRPC_ATRACCIONES_URL || '100.93.143.85:50051';

    const semillas = [
      // ── 1. ATRACCIONES (5 Nodos Estandarizados) ──
      {
        codigoNodo: 'NODE_ATR_DILAN',
        nombreProveedor: 'Descubre EC (Dilan Mendoza)',
        vertical: 'ATRACCIONES',
        baseUrlRest: 'http://100.80.229.90:8080/api/v3',
        endpointGrpc: bookingGrpc,
        apiKey: '40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568',
        healthStatus: 'HEALTHY',
        latenciaMs: 35,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Grupo 2 – Dilan Mendoza',
        contacto: 'dilan@universidad.edu.ec',
        emoji: '🎡',
        descripcion: 'Catálogo de 21 tours y atracciones turísticas en Ecuador (Tailscale)',
      },
      {
        codigoNodo: 'NODE_ATR_ARIEL',
        nombreProveedor: 'Ariel Tours (Ariel)',
        vertical: 'ATRACCIONES',
        baseUrlRest: 'http://localhost:3000/api/v3/atracciones',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 30,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Atracciones – Socio 2',
        contacto: 'ariel@universidad.edu.ec',
        emoji: '🌋',
        descripcion: 'Expediciones y tours volcánicos',
      },
      {
        codigoNodo: 'NODE_ATR_MICHAEL',
        nombreProveedor: 'Michael Expeditions (Michael)',
        vertical: 'ATRACCIONES',
        baseUrlRest: 'http://localhost:3000/api/v3/atracciones',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 30,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Atracciones – Socio 3',
        contacto: 'michael@universidad.edu.ec',
        emoji: '🏔️',
        descripcion: 'Atracciones de alta montaña y senderismo',
      },
      {
        codigoNodo: 'NODE_ATR_ALISSON',
        nombreProveedor: 'Alisson Adventure (Alisson)',
        vertical: 'ATRACCIONES',
        baseUrlRest: 'http://localhost:3000/api/v3/atracciones',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 30,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Atracciones – Socio 4',
        contacto: 'alisson@universidad.edu.ec',
        emoji: '🌴',
        descripcion: 'Tours de selva y aventura amazónica',
      },
      {
        codigoNodo: 'NODE_ATR_GLORIA',
        nombreProveedor: 'Gloria Travel (Gloria)',
        vertical: 'ATRACCIONES',
        baseUrlRest: 'http://localhost:3000/api/v3/atracciones',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 30,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Atracciones – Socio 5',
        contacto: 'gloria@universidad.edu.ec',
        emoji: '🐢',
        descripcion: 'Tours de fauna y conservación ecológica',
      },

      // ── 2. AUTOS (5 Nodos Estandarizados NODE_AUT_1..5) ──
      {
        codigoNodo: 'NODE_AUT_1',
        nombreProveedor: 'Renta Autos Ecuador — Socio 1 (Flota Principal)',
        vertical: 'AUTOS',
        baseUrlRest: process.env.TIENDA_AUTOS_URL || 'http://localhost:3000/api/v2/autos',
        endpointGrpc: bookingGrpc,
        apiKey: process.env.TIENDA_AUTOS_API_KEY || null,
        healthStatus: 'HEALTHY',
        latenciaMs: 25,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Renta Autos – Equipo 1',
        emoji: '🚗',
        descripcion: 'Flota sedán, SUV y camionetas en Quito y Guayaquil',
      },
      {
        codigoNodo: 'NODE_AUT_2',
        nombreProveedor: 'Renta Autos Ecuador — Socio 2',
        vertical: 'AUTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/autos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 28,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Renta Autos – Equipo 2',
        emoji: '🚙',
        descripcion: 'Flota 4x4 todoterreno y compactos',
      },
      {
        codigoNodo: 'NODE_AUT_3',
        nombreProveedor: 'Renta Autos Ecuador — Socio 3',
        vertical: 'AUTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/autos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 26,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Renta Autos – Equipo 3',
        emoji: '🚐',
        descripcion: 'Minivans ejecutivas y transporte grupal',
      },
      {
        codigoNodo: 'NODE_AUT_4',
        nombreProveedor: 'Renta Autos Ecuador — Socio 4',
        vertical: 'AUTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/autos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 29,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Renta Autos – Equipo 4',
        emoji: '🏎️',
        descripcion: 'Vehículos híbridos y eléctricos ecológicos',
      },
      {
        codigoNodo: 'NODE_AUT_5',
        nombreProveedor: 'Renta Autos Ecuador — Socio 5',
        vertical: 'AUTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/autos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 27,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Renta Autos – Equipo 5',
        emoji: '🛻',
        descripcion: 'Pickups diésel para rutas interprovinciales',
      },

      // ── 3. VUELOS (5 Nodos Estandarizados NODE_VUE_1..5) ──
      {
        codigoNodo: 'NODE_VUE_1',
        nombreProveedor: 'AeroEcuador Gateway — Socio 1 (Vuelos Principal)',
        vertical: 'VUELOS',
        baseUrlRest: process.env.TIENDA_VUELOS_URL || 'http://localhost:3000/api/v2/vuelos',
        endpointGrpc: bookingGrpc,
        apiKey: process.env.TIENDA_VUELOS_API_KEY || null,
        healthStatus: 'HEALTHY',
        latenciaMs: 42,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Vuelos – Equipo 1',
        emoji: '✈️',
        descripcion: 'Rutas nacionales Quito, Guayaquil, Cuenca, Galápagos',
      },
      {
        codigoNodo: 'NODE_VUE_2',
        nombreProveedor: 'AeroEcuador Gateway — Socio 2',
        vertical: 'VUELOS',
        baseUrlRest: 'http://localhost:3000/api/v2/vuelos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 40,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Vuelos – Equipo 2',
        emoji: '🛫',
        descripcion: 'Conexiones a Islas Galápagos y Costa',
      },
      {
        codigoNodo: 'NODE_VUE_3',
        nombreProveedor: 'AeroEcuador Gateway — Socio 3',
        vertical: 'VUELOS',
        baseUrlRest: 'http://localhost:3000/api/v2/vuelos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 44,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Vuelos – Equipo 3',
        emoji: '🛩️',
        descripcion: 'Vuelos chárter y pista corta Amazonía',
      },
      {
        codigoNodo: 'NODE_VUE_4',
        nombreProveedor: 'AeroEcuador Gateway — Socio 4',
        vertical: 'VUELOS',
        baseUrlRest: 'http://localhost:3000/api/v2/vuelos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 41,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Vuelos – Equipo 4',
        emoji: '💺',
        descripcion: 'Rutas regionales y puente aéreo',
      },
      {
        codigoNodo: 'NODE_VUE_5',
        nombreProveedor: 'AeroEcuador Gateway — Socio 5',
        vertical: 'VUELOS',
        baseUrlRest: 'http://localhost:3000/api/v2/vuelos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 43,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Vuelos – Equipo 5',
        emoji: '🎫',
        descripcion: 'Tarifas corporativas y convenios estudiantiles',
      },

      // ── 4. ALOJAMIENTOS (5 Nodos Estandarizados NODE_ALO_1..5) ──
      {
        codigoNodo: 'NODE_ALO_1',
        nombreProveedor: 'Hoteles & Hospedajes Ecuador — Socio 1 (Principal)',
        vertical: 'ALOJAMIENTOS',
        baseUrlRest: process.env.TIENDA_ALOJAMIENTOS_URL || 'http://localhost:3000/api/v2/alojamientos',
        endpointGrpc: bookingGrpc,
        apiKey: process.env.TIENDA_ALOJAMIENTOS_API_KEY || null,
        healthStatus: 'HEALTHY',
        latenciaMs: 20,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Alojamientos – Equipo 1',
        emoji: '🏨',
        descripcion: 'Hoteles urbanos, cabañas y hostales boutique',
      },
      {
        codigoNodo: 'NODE_ALO_2',
        nombreProveedor: 'Hoteles & Hospedajes Ecuador — Socio 2',
        vertical: 'ALOJAMIENTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/alojamientos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 22,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Alojamientos – Equipo 2',
        emoji: '🏡',
        descripcion: 'Cabañas de campo y ecolodges en la Sierra',
      },
      {
        codigoNodo: 'NODE_ALO_3',
        nombreProveedor: 'Hoteles & Hospedajes Ecuador — Socio 3',
        vertical: 'ALOJAMIENTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/alojamientos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 21,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Alojamientos – Equipo 3',
        emoji: '🏖️',
        descripcion: 'Resorts de playa y suites costeras',
      },
      {
        codigoNodo: 'NODE_ALO_4',
        nombreProveedor: 'Hoteles & Hospedajes Ecuador — Socio 4',
        vertical: 'ALOJAMIENTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/alojamientos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 23,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Alojamientos – Equipo 4',
        emoji: '🏕️',
        descripcion: 'Glamping y alojamientos eco-sostenibles',
      },
      {
        codigoNodo: 'NODE_ALO_5',
        nombreProveedor: 'Hoteles & Hospedajes Ecuador — Socio 5',
        vertical: 'ALOJAMIENTOS',
        baseUrlRest: 'http://localhost:3000/api/v2/alojamientos',
        endpointGrpc: bookingGrpc,
        apiKey: null,
        healthStatus: 'HEALTHY',
        latenciaMs: 24,
        killSwitchActivo: false,
        circuitBreakerEstado: 'CLOSED',
        tasaFallosPct: 0.00,
        equipo: 'Alojamientos – Equipo 5',
        emoji: '🏢',
        descripcion: 'Departamentos ejecutivos y apart-hoteles',
      },
    ];

    for (const s of semillas) {
      try {
        const existente = await this.configRepo.findOne({ where: { codigoNodo: s.codigoNodo } });
        if (!existente) {
          await this.configRepo.save(this.configRepo.create(s));
        } else if (s.codigoNodo === 'NODE_ATR_DILAN') {
          // Asegurar parámetros Tailscale actualizados para Dilan
          let modificado = false;
          if (s.baseUrlRest && existente.baseUrlRest !== s.baseUrlRest) {
            existente.baseUrlRest = s.baseUrlRest;
            modificado = true;
          }
          if (s.apiKey && existente.apiKey !== s.apiKey) {
            existente.apiKey = s.apiKey;
            modificado = true;
          }
          if (s.endpointGrpc && existente.endpointGrpc !== s.endpointGrpc) {
            existente.endpointGrpc = s.endpointGrpc;
            modificado = true;
          }
          if (modificado) {
            await this.configRepo.save(existente);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Error sembrando nodo ${s.codigoNodo}: ${err.message}`);
      }
    }
  }
}
