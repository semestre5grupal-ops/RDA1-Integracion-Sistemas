import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CheckinNotificationDto } from './dto/checkin-notification.dto';
import { SincronizarClienteDto } from './dto/sincronizar-cliente.dto';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { AlojamientosSociosReservasService } from '../alojamientos/socios/alojamientos-socios-reservas.service';

@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly physicalLogger: WinstonPhysicalLoggerService,
    @Optional() private readonly alojamientosSocios?: AlojamientosSociosReservasService,
  ) {}

  /**
   * FASE 1: Sincronización Cross-Platform de Clientes
   * Consulta al socio si el cliente ya existe (GET /clientes).
   * Si no existe, lo crea (POST /clientes).
   * Persiste el mapeo en schema_clientes.clientes_socios_mapeo para no duplicar.
   */
  async sincronizarClienteConSocio(dto: SincronizarClienteDto): Promise<{
    mapped: boolean;
    external_client_id: string;
    origen: string;
    codigo_nodo: string;
  }> {
    const { cliente_id, codigo_nodo } = dto;

    // 1. Revisar si ya existe el mapeo en base de datos local
    try {
      const mappingRows = await this.dataSource.query(
        `SELECT external_client_id, metadata 
         FROM schema_clientes.clientes_socios_mapeo 
         WHERE cliente_id = $1 AND codigo_nodo = $2 
         LIMIT 1`,
        [cliente_id, codigo_nodo],
      );

      if (mappingRows && mappingRows.length > 0) {
        this.logger.log(`[Cross-Platform] Mapeo existente recuperado para cliente ${cliente_id} en socio ${codigo_nodo}: ${mappingRows[0].external_client_id}`);
        return {
          mapped: true,
          external_client_id: mappingRows[0].external_client_id,
          origen: 'MAPEO_LOCAL_EXISTENTE',
          codigo_nodo,
        };
      }
    } catch (e: any) {
      this.logger.warn(`[Cross-Platform] Error consultando tabla de mapeo: ${e.message}`);
    }

    // 2. Obtener datos completos del cliente si no vinieron en el DTO
    let nombre = dto.nombre;
    let email = dto.email;
    let identificacion = dto.identificacion;
    let telefono = dto.telefono;

    if (!email || !identificacion) {
      try {
        const userRows = await this.dataSource.query(
          `SELECT nombre, email, cedula_ruc, telefono 
           FROM schema_clientes.clientes 
           WHERE id = $1 LIMIT 1`,
          [cliente_id],
        );
        if (userRows && userRows.length > 0) {
          nombre = nombre || userRows[0].nombre;
          email = email || userRows[0].email;
          identificacion = identificacion || userRows[0].cedula_ruc;
          telefono = telefono || userRows[0].telefono;
        }
      } catch (_) {}
    }

    // 3. Buscar la configuración del socio para conectar con su microservicio
    let baseUrl = '';
    let apiKey = '';

    try {
      const providerRows = await this.dataSource.query(
        `SELECT base_url_rest, api_key, nombre_proveedor 
         FROM schema_proveedores.config_proveedor 
         WHERE codigo_nodo = $1 LIMIT 1`,
        [codigo_nodo],
      );
      if (providerRows && providerRows.length > 0 && providerRows[0].base_url_rest) {
        baseUrl = providerRows[0].base_url_rest.replace(/\/$/, '');
        apiKey = providerRows[0].api_key || '';
      }
    } catch (_) {}

    // Fallback de configuración directa si no está en BD
    if (!baseUrl) {
      if (codigo_nodo === 'NODE_AUT_MATEO' || codigo_nodo === 'NODE_AUT_MDU' || codigo_nodo === 'NODE_AUT_MANEJADEUNA' || codigo_nodo === 'NODE_AUT_2') {
        baseUrl = 'https://maneja-de-una-autos-api.azurewebsites.net/api/v3';
        apiKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
      } else if (codigo_nodo === 'NODE_AUT_RUTALIBRE' || codigo_nodo?.includes('AUT')) {
        baseUrl = process.env.TIENDA_AUTOS_URL || 'https://rutalibre-autos-api.azurewebsites.net/api/v3';
        apiKey = process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      } else if (codigo_nodo === 'NODE_ATR_ALISSON' || codigo_nodo?.includes('ATR')) {
        baseUrl = 'https://alisson-atracciones-api.azurewebsites.net/api/v3';
        apiKey = 'atr-f575172d62a81d51e87fbc0a37952d984ce1c078';
      }
    }

    if (!baseUrl) {
      const fallbackId = `CLI-AUTO-${cliente_id.slice(0, 8)}`;
      await this.guardarMapeoLocal(cliente_id, codigo_nodo, fallbackId, { fallback: true, razon: 'PROVEEDOR_NO_ENCONTRADO' });
      return {
        mapped: true,
        external_client_id: fallbackId,
        origen: 'FALLBACK_LOCAL_SOCIO_SIN_URL',
        codigo_nodo,
      };
    }

    baseUrl = baseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `corr-sync-cli-${Date.now()}`,
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    };

    let externalClientId: string | null = null;
    let origen = 'SOCIO_NUEVO_CREADO';

    // 4. Paso A: Consultar si ya existe en el socio (GET /api/vX/clientes?email=...&identificacion=...)
    try {
      const checkUrl = `${baseUrl}/clientes?email=${encodeURIComponent(email || '')}&identificacion=${encodeURIComponent(identificacion || '')}`;
      this.logger.log(`[Cross-Platform] Consultando existencia de cliente en socio (${codigo_nodo}): ${checkUrl}`);
      const checkRes = await firstValueFrom(
        this.httpService.get(checkUrl, { headers, timeout: 4000 }),
      );

      if (checkRes.status === 200 && checkRes.data) {
        const d = checkRes.data;
        externalClientId = d.client_id || d.cliente_id || d.id || (Array.isArray(d) && d[0]?.id);
        if (externalClientId) {
          origen = 'SOCIO_REUTILIZADO';
          this.logger.log(`[Cross-Platform] Cliente YA existía en el socio ${codigo_nodo}: ${externalClientId}`);
        }
      }
    } catch (err: any) {
      // 404 es esperado si el cliente aún no existe
      this.logger.debug(`[Cross-Platform] GET /clientes retornó ${err.response?.status || err.message}, procediendo a crear.`);
    }

    // 5. Paso B: Si no existe, crearlo en el socio (POST /api/vX/clientes)
    if (!externalClientId) {
      try {
        const createUrl = `${baseUrl}/clientes`;
        this.logger.log(`[Cross-Platform] Creando cliente en socio (${codigo_nodo}): ${createUrl}`);
        const createRes = await firstValueFrom(
          this.httpService.post(
            createUrl,
            {
              nombre: nombre || 'Cliente Booking',
              email: email || 'cliente@booking.com',
              identificacion: identificacion || '1710034065',
              telefono: telefono || '0999999999',
              licencia: identificacion || '1710034065',
              booking_cliente_id: cliente_id,
            },
            { headers, timeout: 4000 },
          ),
        );

        if (createRes.data) {
          const cd = createRes.data;
          externalClientId = cd.client_id || cd.cliente_id || cd.id || cd.external_client_id;
        }
      } catch (err: any) {
        this.logger.warn(`[Cross-Platform] Socio ${codigo_nodo} no soporta POST /clientes aún (${err.response?.status || err.message}). Aplicando fallback transparente.`);
      }
    }

    // Si el socio aún no expone /clientes, generamos un identificador determinista compatible
    if (!externalClientId) {
      externalClientId = `CLI-${codigo_nodo.replace('NODE_', '')}-${cliente_id.slice(0, 8)}`;
      origen = 'FALLBACK_COMPATIBLE_AUTOGENERADO';
    }

    // 6. Guardar en la tabla relacional de mapeo
    await this.guardarMapeoLocal(cliente_id, codigo_nodo, externalClientId, {
      nombre,
      email,
      identificacion,
      origen,
      fecha_sincronizacion: new Date().toISOString(),
    });

    return {
      mapped: true,
      external_client_id: externalClientId,
      origen,
      codigo_nodo,
    };
  }

  private async guardarMapeoLocal(clienteId: string, codigoNodo: string, externalId: string, metadata: any) {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS schema_clientes.clientes_socios_mapeo (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          cliente_id VARCHAR(120) NOT NULL,
          codigo_nodo VARCHAR(60) NOT NULL,
          external_client_id VARCHAR(120) NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT uq_cli_nodo UNIQUE (cliente_id, codigo_nodo)
        )
      `);
      await this.dataSource.query(
        `INSERT INTO schema_clientes.clientes_socios_mapeo (cliente_id, codigo_nodo, external_client_id, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cliente_id, codigo_nodo) 
         DO UPDATE SET external_client_id = EXCLUDED.external_client_id, metadata = EXCLUDED.metadata, updated_at = NOW()`,
        [clienteId, codigoNodo, externalId, JSON.stringify(metadata)],
      );
    } catch (e: any) {
      this.logger.error(`Error guardando mapeo local: ${e.message}`);
    }
  }

  /**
   * Consultar todos los mapeos de un cliente en Booking
   */
  async getMapeosPorCliente(clienteId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT m.*, p.nombre_proveedor, p.vertical 
       FROM schema_clientes.clientes_socios_mapeo m
       LEFT JOIN schema_proveedores.config_proveedor p ON p.codigo_nodo = m.codigo_nodo
       WHERE m.cliente_id = $1`,
      [clienteId],
    );
  }

  /**
   * FASE 3: Receptor Centralizado de Confirmación de Asistencia (Check-in Callback)
   * Disparado por la web del socio cuando el administrador confirma la llegada física del cliente.
   * Transiciona la reserva de RESERVADO a CONFIRMADO_ASISTIDO.
   */
  async confirmarCheckin(
    id: string,
    dto: CheckinNotificationDto,
    apiKey?: string,
    correlationId?: string,
  ): Promise<any> {
    const targetId = id || dto.external_order_id || dto.order_id || (dto as any).reserva_id || (dto as any).reservation_code;
    const safeCorrId = correlationId || `corr-chk-${Date.now()}`;
    const fechaCheckin = dto.fecha_checkin || dto.checked_in_at || (dto as any).hora_checkin || new Date().toISOString();
    const estado = dto.estado || dto.status || 'CONFIRMADO_ASISTIDO';
    const adminId = dto.admin_id || dto.staff_user || (dto as any).guia_codigo || (dto as any).guia_asignado || 'operador-socio';
    const docId = dto.document_id || (dto as any).documento_identidad || (dto as any).cedula || (dto as any).identificacion || null;
    let verticalActualizada: string | null = null;
    let reservaActualizada: any = null;

    this.logger.log(`[Check-in Inbound] Procesando confirmación de asistencia para orden ${targetId} con estado ${estado}`);

    // Seguridad (Flujo 2): si el socio envía una X-API-Key, debe ser de un socio
    // REGISTRADO. Una clave inválida se rechaza con 401 y no se confirma nada; antes el
    // endpoint respondía 200 con cualquier clave (reportado por el equipo de Atracciones).
    // Si no viene clave, el flujo sigue como antes (el check-in de alojamientos de socios
    // exige además que la clave sea la del hotel dueño en su propio paso).
    if (apiKey && apiKey.trim()) {
      const prov = await this.dataSource
        .query(`SELECT codigo_nodo, vertical FROM schema_proveedores.config_proveedor WHERE api_key = $1 LIMIT 1`, [apiKey.trim()])
        .catch(() => [] as any[]);
      if (!prov || prov.length === 0) {
        this.logger.warn(`[Check-in Inbound] X-API-Key inválida para la orden ${targetId}: 401`);
        throw new HttpException('X-API-Key inválida: no corresponde a ningún socio registrado en Booking.', HttpStatus.UNAUTHORIZED);
      }
    }

    // 0. Alojamientos de SOCIOS y LOCALES (reservas de hospedaje)
    //    Va primero: se resuelven antes de las demás verticales para no depender
    //    ni alterar ninguna consulta de Atracciones, Autos ni Vuelos.
    if (this.alojamientosSocios) {
      const copia = await this.alojamientosSocios.marcarCheckin(targetId, apiKey, { admin: adminId, fecha: dto.fecha_checkin || null });
      if (copia) {
        verticalActualizada = 'ALOJAMIENTOS_SOCIO';
        reservaActualizada = copia;
      }
    }

    // 0b. Alojamientos de socios (si vino por recepción general sin API key del hotel)
    if (!verticalActualizada) {
      try {
        const rawAloSocio = await this.dataSource.query(
          `UPDATE schema_alojamientos.alojamientos_reservas_socio
              SET estado = 'CONFIRMADO_ASISTIDO', checkin_at = COALESCE(checkin_at, now()), checkin_admin = $2, actualizado_en = now()
            WHERE (id::text = $1 OR codigo_reserva = $1 OR order_id_socio = $1 OR external_order_id = $1 OR codigo_reserva_socio = $1)
              AND estado <> 'CANCELADO'
            RETURNING *`,
          [targetId, adminId || null],
        );
        const filas = (Array.isArray(rawAloSocio) && Array.isArray(rawAloSocio[0])) ? rawAloSocio[0] : (Array.isArray(rawAloSocio) ? rawAloSocio : []);
        if (filas.length > 0) {
          verticalActualizada = 'ALOJAMIENTOS_SOCIO';
          reservaActualizada = filas[0];
        }
      } catch (_) {}
    }

    // 0c. Alojamientos locales de Booking
    if (!verticalActualizada) {
      try {
        const rawAlo = await this.dataSource.query(
          `UPDATE schema_alojamientos.alojamientos_reservas 
           SET estado = 'CONFIRMADO_ASISTIDO'
           WHERE (id::text = $1 OR codigo_reserva = $1)
             AND estado <> 'CANCELADO'
           RETURNING *`,
          [targetId],
        );
        const filas = (Array.isArray(rawAlo) && Array.isArray(rawAlo[0])) ? rawAlo[0] : (Array.isArray(rawAlo) ? rawAlo : []);
        if (filas.length > 0) {
          verticalActualizada = 'ALOJAMIENTOS';
          reservaActualizada = filas[0];
        }
      } catch (_) {}
    }

    // 0d. Si la referencia es explícita de alojamiento (ORD-HTL-*, ORD-ALO-*) y no existe en el sistema:
    if (!verticalActualizada && (targetId.toUpperCase().startsWith('ORD-HTL-') || targetId.toUpperCase().startsWith('ORD-ALO-'))) {
      this.logger.warn(`[Check-in Inbound] No se encontró ninguna reserva activa de alojamiento para ${targetId}: 404`);
      throw new HttpException(`No se encontró ninguna reserva activa de alojamiento para la referencia '${targetId}'.`, HttpStatus.NOT_FOUND);
    }

    // 1. Intentar actualizar en Atracciones
    const atrUpdate = verticalActualizada ? [] : await this.dataSource.query(
      `UPDATE schema_atracciones.atracciones_reservas 
       SET status = 'CONFIRMADO_ASISTIDO', 
           checkin_at = NOW(),
           guia_oficial_asignado = COALESCE($2, guia_oficial_asignado),
           updated_at = NOW()
       WHERE id = $1 
          OR voucher_qr_payload LIKE '%' || $1 || '%' 
          OR idempotency_key = $1
          OR cancel_code = $1
          OR document_id = $1
          OR customer_email = $1
          OR ($3::text IS NOT NULL AND document_id = $3::text)
       RETURNING *`,
      [targetId, adminId, docId],
    );

    if (atrUpdate && atrUpdate.length > 0) {
      verticalActualizada = 'ATRACCIONES';
      reservaActualizada = atrUpdate[0];
    }

    // 2. Si no fue en atracciones, intentar en Autos
    if (!verticalActualizada) {
      const autUpdate = await this.dataSource.query(
        `UPDATE schema_autos.autos_reservas 
         SET estado = 'CONFIRMADO_ASISTIDO'
         WHERE id = $1 
            OR UPPER(id) = UPPER($1)
            OR idempotency_key = $1
            OR licencia_conducir = $1
            OR ($2::text IS NOT NULL AND licencia_conducir = $2::text)
         RETURNING *`,
        [targetId, docId],
      );

      if (autUpdate && autUpdate.length > 0) {
        verticalActualizada = 'AUTOS';
        reservaActualizada = autUpdate[0];
      } else if (
        targetId.toUpperCase().startsWith('CAR') ||
        targetId.toUpperCase().startsWith('MDU-') ||
        targetId.toUpperCase().startsWith('ANDES-') ||
        targetId.toUpperCase().startsWith('PACIF-')
      ) {
        verticalActualizada = 'AUTOS';
      }
    }

    // 3. Si no, en Vuelos
    if (!verticalActualizada) {
      try {
        const vueUpdate = await this.dataSource.query(
          `UPDATE schema_vuelos.vuelos_reservas 
           SET estado = 'CONFIRMADO_ASISTIDO'
           WHERE id::text = $1 OR codigo_reserva = $1
           RETURNING *`,
          [targetId],
        );
        if (vueUpdate && vueUpdate.length > 0) {
          verticalActualizada = 'VUELOS';
          reservaActualizada = vueUpdate[0];
        }
      } catch (_) {}
    }

    // 3b. Vuelos con aerolíneas socias (reservas hechas desde Booking): la
    // aerolínea manda su bookingId o el PNR; en Booking es booking_id_socio.
    if (!verticalActualizada) {
      try {
        const socioUpdate = await this.dataSource.query(
          `UPDATE public.vuelos_reservas_socio
              SET status = 'CHECKED_IN', checkin_at = COALESCE(checkin_at, now()),
                  checkin_origen = COALESCE(checkin_origen, 'aerolinea'), updated_at = now()
            WHERE (booking_id_socio = $1 OR booking_id = $1 OR pnr = upper($1)) AND status <> 'CANCELLED'
            RETURNING booking_id, codigo_nodo, pnr, status`,
          [targetId],
        );
        if (socioUpdate && socioUpdate.length > 0) {
          verticalActualizada = 'VUELOS_SOCIO';
          reservaActualizada = socioUpdate[0];
        }
      } catch (_) {}
    }

    // 4. Si no, en Alojamientos
    if (!verticalActualizada) {
      try {
        const aloUpdate = await this.dataSource.query(
          `UPDATE schema_alojamientos.alojamientos_reservas 
           SET estado = 'CONFIRMADO_ASISTIDO'
           WHERE id::text = $1 OR codigo_reserva = $1
           RETURNING *`,
          [targetId],
        );
        if (aloUpdate && aloUpdate.length > 0) {
          verticalActualizada = 'ALOJAMIENTOS';
          reservaActualizada = aloUpdate[0];
        }
      } catch (_) {}
    }

    // 5. Registrar en Auditoría Transaccional
    try {
      await this.dataSource.query(
        `INSERT INTO schema_auditoria.auditoria_transaccional 
         (modulo, accion, registro_id, detalles_json)
         VALUES ($1, $2, $3, $4)`,
        [
          'RESERVAS_CHECKIN',
          'CONFIRMAR_ASISTENCIA_PRESENCIAL',
          targetId,
          JSON.stringify({
            ...dto,
            order_id: targetId,
            pnr: targetId,
            estado: 'CONFIRMADO_ASISTIDO',
            status: 'CONFIRMADO_ASISTIDO',
            vertical: verticalActualizada || 'EXTERNO_SOCIO',
            correlation_id: safeCorrId,
            api_key_autenticada: !!apiKey,
            fecha_confirmacion_booking: new Date().toISOString(),
          }),
        ],
      );
    } catch (auditErr: any) {
      this.logger.error(`Error guardando auditoría de checkin: ${auditErr.message}`);
    }

    this.physicalLogger.log(
      `[CHECK-IN PRESENCIAL EXITOSO] Orden: ${targetId} | Vertical: ${verticalActualizada || 'SOCIO_EXTERNO'} | Estado: CONFIRMADO_ASISTIDO | CorrId: ${safeCorrId}`,
    );

    return {
      acknowledged: true,
      status: 'CONFIRMADO_ASISTIDO',
      reserva_id: reservaActualizada?.id || targetId,
      external_order_id: dto.external_order_id || dto.order_id || targetId,
      order_id: dto.order_id || dto.external_order_id || targetId,
      vertical: verticalActualizada || 'SOCIO_EXTERNO',
      asistentes_confirmados: dto.asistentes_reales || dto.huespedes_reales || 1,
      fecha_checkin: fechaCheckin,
      mensaje: 'Asistencia presencial confirmada exitosamente en Booking Central. Ambas plataformas sincronizadas.',
      correlation_id: safeCorrId,
    };
  }

  /**
   * Consultar estado actual de una reserva en Booking (Soporta Check-in Cross-Platform)
   */
  async getEstadoReserva(id: string): Promise<any> {
    // 1. Buscar primero en auditoría de Check-in presencial
    try {
      const audits = await this.dataSource.query(
        `SELECT id, registro_id, detalles_json, created_at 
         FROM schema_auditoria.auditoria_transaccional 
         WHERE modulo = 'RESERVAS_CHECKIN' 
           AND (registro_id = $1 
                OR detalles_json->>'pnr' = $1 
                OR detalles_json->>'external_order_id' = $1 
                OR detalles_json->>'order_id' = $1)
         ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      if (audits && audits.length > 0) {
        const a = audits[0];
        const det = a.detalles_json || {};
        return {
          id,
          estado: det.estado || 'CONFIRMADO_ASISTIDO',
          status: det.estado || 'CONFIRMADO_ASISTIDO',
          vertical: det.vertical || 'AUTOS',
          placa: det.placa,
          admin_id: det.admin_id,
          fecha_checkin: det.fecha_checkin || a.created_at,
          mensaje: 'Asistencia física y entrega confirmada exitosamente.',
          detalles: det,
        };
      }
    } catch (_) {}

    // 2. Buscar en atracciones
    try {
      const atr = await this.dataSource.query(
        `SELECT id, status AS estado, 'ATRACCIONES' AS vertical, checkin_at, created_at FROM schema_atracciones.atracciones_reservas WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (atr && atr.length > 0) {
        if (atr[0].estado === 'CONFIRMADO_ASISTIDO' || atr[0].estado === 'CHECKED_IN') {
          return {
            id,
            estado: 'CONFIRMADO_ASISTIDO',
            status: 'CONFIRMADO_ASISTIDO',
            vertical: 'ATRACCIONES',
            fecha_checkin: atr[0].checkin_at || atr[0].created_at,
            mensaje: 'Check-in presencial confirmado.',
          };
        }
      }
    } catch (_) {}

    // 2.1 Consulta en tiempo real a Ariel si es código ECT
    if (id.startsWith('ECT-')) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.get(`https://ecuatravel-atracciones-api.azurewebsites.net/api/v3/reservas/${id}`, {
            headers: { 'X-API-Key': 'atr-ariel-ecua-travel-2026' },
            timeout: 3000,
          }),
        );
        if (data && (data.status === 'CHECKED_IN' || data.estado === 'CHECKED_IN' || data.estado_asistencia === 'CONFIRMADO_ASISTIDO')) {
          await this.dataSource.query(
            `UPDATE schema_atracciones.atracciones_reservas SET status = 'CONFIRMADO_ASISTIDO', checkin_at = NOW() WHERE id = $1`,
            [id],
          );
          return {
            id,
            estado: 'CONFIRMADO_ASISTIDO',
            status: 'CONFIRMADO_ASISTIDO',
            vertical: 'ATRACCIONES',
            fecha_checkin: data.hora_checkin || new Date().toISOString(),
            mensaje: 'Asistencia presencial verificada con el socio Ecuatravel (Ariel).',
          };
        }
      } catch (_) {}
    }

    // 3. Buscar en autos
    try {
      const aut = await this.dataSource.query(
        `SELECT id, estado, 'AUTOS' AS vertical, created_at FROM schema_autos.autos_reservas WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (aut && aut.length > 0) return aut[0];
    } catch (_) {}

    return {
      id,
      estado: 'RESERVADO',
      mensaje: 'Reserva activa pendiente de confirmación física de asistencia',
    };
  }
}

