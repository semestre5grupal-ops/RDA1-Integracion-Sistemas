import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MergeClientesDto } from './dto/merge-clientes.dto';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';
import { KafkaEventBusService } from '../event-bus/kafka/kafka-event-bus.service';
import { RabbitMqEventBusService } from '../event-bus/rabbitmq/rabbitmq-event-bus.service';

export interface ValidacionIdentificacionResult {
  valido: boolean;
  tipo: 'CEDULA' | 'PASAPORTE';
  identificacion: string;
  razon?: string;
}

export interface ResolucionJitResult {
  mapped: boolean;
  externalClientId: string;
  emailParaSocio: string;
  identificacionParaSocio: string;
  nombreParaSocio: string;
  origen: string;
  codigoNodo: string;
  metadata?: any;
}

@Injectable()
export class CustomerMergeService {
  private readonly logger = new Logger(CustomerMergeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
    private readonly winstonLogger: WinstonPhysicalLoggerService,
    private readonly kafkaBus: KafkaEventBusService,
    private readonly rabbitBus: RabbitMqEventBusService,
  ) {}

  // ===========================================================================
  // 1. VALIDACIÓN DE IDENTIFICACIÓN (CÉDULA MÓDULO 10 VS PASAPORTE)
  // ===========================================================================
  validarIdentificacion(identificacion: string, tipo?: 'CEDULA' | 'PASAPORTE'): ValidacionIdentificacionResult {
    const raw = (identificacion || '').trim();
    if (!raw) {
      return { valido: false, tipo: tipo || 'CEDULA', identificacion: raw, razon: 'El número de identificación no puede estar vacío' };
    }

    // Auto-detectar o usar tipo explícito
    const tipoEfectivo: 'CEDULA' | 'PASAPORTE' = tipo || (/^\d{10}$/.test(raw) ? 'CEDULA' : 'PASAPORTE');

    if (tipoEfectivo === 'PASAPORTE') {
      const regexPasaporte = /^[A-Za-z0-9]{6,15}$/;
      if (!regexPasaporte.test(raw)) {
        return {
          valido: false,
          tipo: 'PASAPORTE',
          identificacion: raw,
          razon: 'El pasaporte debe ser alfanumérico y tener entre 6 y 15 caracteres',
        };
      }
      return { valido: true, tipo: 'PASAPORTE', identificacion: raw };
    }

    // Validación Cédula Ecuatoriana (10 dígitos con Módulo 10)
    if (raw.length !== 10 || !/^\d{10}$/.test(raw)) {
      return {
        valido: false,
        tipo: 'CEDULA',
        identificacion: raw,
        razon: 'La cédula ecuatoriana debe tener exactamente 10 dígitos numéricos',
      };
    }

    const digitoRegion = parseInt(raw.substring(0, 2), 10);
    if ((digitoRegion < 1 || digitoRegion > 24) && digitoRegion !== 30) {
      return {
        valido: false,
        tipo: 'CEDULA',
        identificacion: raw,
        razon: 'El código de provincia (primeros 2 dígitos) no es válido para Ecuador',
      };
    }

    const tercerDigito = parseInt(raw.substring(2, 3), 10);
    if (tercerDigito >= 6) {
      return {
        valido: false,
        tipo: 'CEDULA',
        identificacion: raw,
        razon: 'El tercer dígito de la cédula de persona natural debe ser menor a 6',
      };
    }

    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    const verificador = parseInt(raw.substring(9, 10), 10);
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let valor = parseInt(raw.charAt(i), 10) * coeficientes[i];
      if (valor >= 10) valor -= 9;
      suma += valor;
    }
    const digitoCalculado = (Math.ceil(suma / 10) * 10) - suma;
    const finalCalculado = digitoCalculado === 10 ? 0 : digitoCalculado;

    if (finalCalculado !== verificador) {
      return {
        valido: false,
        tipo: 'CEDULA',
        identificacion: raw,
        razon: 'Dígito verificador de cédula no coincide con el algoritmo Módulo 10',
      };
    }

    return { valido: true, tipo: 'CEDULA', identificacion: raw };
  }

  // ===========================================================================
  // 2. RESOLUCIÓN JIT (JUST-IN-TIME) DE IDENTIDADES MULTIPLATAFORMA
  // ===========================================================================
  /**
   * Resuelve la identidad del cliente en el nodo socio al momento de reservar.
   * Evita duplicados y previene el error 409 usando mapeo previo o consulta JIT.
   */
  async resolverIdentidadJit(params: {
    clienteId: string;
    codigoNodo: string;
    nombre?: string;
    email?: string;
    identificacion?: string;
    telefono?: string;
  }): Promise<ResolucionJitResult> {
    const { clienteId, codigoNodo } = params;
    let { nombre, email, identificacion, telefono } = params;

    // A. Si faltan datos, obtener el registro canónico de Booking
    if (!email || !identificacion) {
      try {
        const rows = await this.dataSource.query(
          `SELECT nombre, email, cedula_ruc, telefono 
           FROM schema_clientes.clientes 
           WHERE id = $1 LIMIT 1`,
          [clienteId],
        );
        if (rows && rows.length > 0) {
          nombre = nombre || rows[0].nombre;
          email = email || rows[0].email;
          identificacion = identificacion || rows[0].cedula_ruc;
          telefono = telefono || rows[0].telefono;
        }
      } catch (err: any) {
        this.logger.warn(`[Service Merge] Error consultando cliente canónico ${clienteId}: ${err.message}`);
      }
    }

    // B. Revisar si ya existe el mapeo en schema_clientes.clientes_socios_mapeo
    try {
      const mappingRows = await this.dataSource.query(
        `SELECT external_client_id, metadata 
         FROM schema_clientes.clientes_socios_mapeo 
         WHERE cliente_id = $1 AND codigo_nodo = $2 
         LIMIT 1`,
        [clienteId, codigoNodo],
      );

      if (mappingRows && mappingRows.length > 0) {
        const meta = mappingRows[0].metadata || {};
        const emailParaSocio = meta.alias_email || email || '';
        this.logger.log(`[Service Merge JIT] Mapeo existente recuperado para ${clienteId} en ${codigoNodo}: ${mappingRows[0].external_client_id} (email socio: ${emailParaSocio})`);
        return {
          mapped: true,
          externalClientId: mappingRows[0].external_client_id,
          emailParaSocio,
          identificacionParaSocio: meta.identificacion || identificacion || '',
          nombreParaSocio: meta.nombre || nombre || 'Cliente Booking',
          origen: 'MAPEO_LOCAL_EXISTENTE',
          codigoNodo,
          metadata: meta,
        };
      }
    } catch (e: any) {
      this.logger.warn(`[Service Merge JIT] Error en consulta de tabla de mapeo: ${e.message}`);
    }

    // C. Resolver URL y credenciales del socio
    const { baseUrl, apiKey } = await this.obtenerCredencialesSocio(codigoNodo);

    if (!baseUrl) {
      const fallbackId = `CLI-AUTO-${clienteId.slice(0, 8)}`;
      await this.guardarMapeoLocal(clienteId, codigoNodo, fallbackId, {
        alias_email: email,
        identificacion,
        nombre,
        fallback: true,
        razon: 'SOCIO_SIN_URL_CONFIGURADA',
      });
      return {
        mapped: true,
        externalClientId: fallbackId,
        emailParaSocio: email || '',
        identificacionParaSocio: identificacion || '',
        nombreParaSocio: nombre || 'Cliente Booking',
        origen: 'FALLBACK_LOCAL_SIN_URL',
        codigoNodo,
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `corr-merge-jit-${Date.now()}`,
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    };

    let externalClientId: string | null = null;
    let emailParaSocio = email || '';
    let origen = 'SOCIO_NUEVO_CREADO';

    // D. Consultar si ya existe en el socio por IDENTIFICACIÓN (Cédula o Pasaporte)
    if (identificacion) {
      try {
        const searchUrl = `${baseUrl}/clientes?identificacion=${encodeURIComponent(identificacion)}`;
        this.logger.log(`[Service Merge JIT] Consultando identidad en socio ${codigoNodo}: ${searchUrl}`);
        const res = await firstValueFrom(
          this.httpService.get(searchUrl, { headers, timeout: 4000 }),
        );
        if (res.status === 200 && res.data) {
          const d = Array.isArray(res.data) ? res.data[0] : res.data;
          if (d && (d.client_id || d.cliente_id || d.id || d.identificacion)) {
            externalClientId = d.client_id || d.cliente_id || d.id || `CLI-${identificacion}`;
            if (d.email) {
              emailParaSocio = d.email; // Aliasing: Usar el email registrado en el socio para evitar 409
              this.logger.log(`[Service Merge JIT] Aliasing detectado para socio ${codigoNodo}: usando email registrado '${emailParaSocio}' (Booking: '${email}')`);
            }
            origen = 'SOCIO_REUTILIZADO_JIT';
          }
        }
      } catch (err: any) {
        this.logger.debug(`[Service Merge JIT] Búsqueda por identificación en socio retornó: ${err.response?.status || err.message}`);
      }
    }

    // E. Si no existe por identificación, consultar por email para detectar posible cuenta previa
    if (!externalClientId && email) {
      try {
        const searchEmailUrl = `${baseUrl}/clientes?email=${encodeURIComponent(email)}`;
        const resEmail = await firstValueFrom(
          this.httpService.get(searchEmailUrl, { headers, timeout: 4000 }),
        );
        if (resEmail.status === 200 && resEmail.data) {
          const d = Array.isArray(resEmail.data) ? resEmail.data[0] : resEmail.data;
          if (d && (d.client_id || d.cliente_id || d.id)) {
            externalClientId = d.client_id || d.cliente_id || d.id;
            origen = 'SOCIO_REUTILIZADO_JIT_POR_EMAIL';
            this.logger.log(`[Service Merge JIT] Cliente existente por email en socio ${codigoNodo}: ${externalClientId}`);
          }
        }
      } catch (_) {}
    }

    // F. Si no existe en el socio, darlo de alta (POST /clientes)
    if (!externalClientId) {
      try {
        const createUrl = `${baseUrl}/clientes`;
        this.logger.log(`[Service Merge JIT] Creando cliente en socio ${codigoNodo}: ${createUrl}`);
        const createRes = await firstValueFrom(
          this.httpService.post(
            createUrl,
            {
              nombre: nombre || 'Cliente Booking',
              email: email || 'cliente@booking.com',
              identificacion: identificacion || '1710034065',
              telefono: telefono || '0999999999',
              licencia: identificacion || '1710034065',
              booking_cliente_id: clienteId,
            },
            { headers, timeout: 4000 },
          ),
        );
        if (createRes.data) {
          const cd = createRes.data;
          externalClientId = cd.client_id || cd.cliente_id || cd.id || cd.external_client_id;
        }
      } catch (err: any) {
        this.logger.warn(`[Service Merge JIT] Socio ${codigoNodo} no completó POST /clientes (${err.response?.status || err.message}). Aplicando fallback determinista.`);
      }
    }

    // Fallback determinista si el socio no provee /clientes
    if (!externalClientId) {
      externalClientId = `CLI-${codigoNodo.replace('NODE_', '')}-${clienteId.slice(0, 8)}`;
      origen = 'FALLBACK_DETERMINISTA';
    }

    // G. Persistir el mapeo y los alias en schema_clientes.clientes_socios_mapeo
    const metadata = {
      alias_email: emailParaSocio,
      identificacion,
      nombre,
      origen,
      fecha_resolucion: new Date().toISOString(),
    };
    await this.guardarMapeoLocal(clienteId, codigoNodo, externalClientId, metadata);

    return {
      mapped: true,
      externalClientId,
      emailParaSocio,
      identificacionParaSocio: identificacion || '',
      nombreParaSocio: nombre || 'Cliente Booking',
      origen,
      codigoNodo,
      metadata,
    };
  }

  // ===========================================================================
  // 3. FUSIÓN EXPLÍCITA DE CLIENTES (POST /api/v1/clientes/merge)
  // ===========================================================================
  /**
   * Consolida dos clientes reasignando reservas y facturas al cliente principal,
   * marcando al cliente secundario como FUSIONADO con auditoría completa.
   */
  async fusionarClientes(
    dto: MergeClientesDto,
    contextoSeguridad: { esAdmin: boolean; socioCodigoNodo?: string; userId?: string },
  ) {
    const { cliente_id_origen, cliente_id_destino, motivo, dry_run = false, codigo_nodo } = dto;

    if (cliente_id_origen === cliente_id_destino) {
      throw new BadRequestException('El cliente origen y destino no pueden ser el mismo ID.');
    }

    // Control de Ámbito (Scope Isolation): si la petición viene de un socio M2M
    if (!contextoSeguridad.esAdmin && contextoSeguridad.socioCodigoNodo) {
      if (codigo_nodo && codigo_nodo !== contextoSeguridad.socioCodigoNodo) {
        throw new ForbiddenException(`No tiene permisos para modificar mapeos fuera de su nodo (${contextoSeguridad.socioCodigoNodo}).`);
      }
    }

    // Verificar existencia de ambos clientes en schema_clientes.clientes
    const [origenRows, destinoRows] = await Promise.all([
      this.dataSource.query(`SELECT id, nombre, email, cedula_ruc, estado FROM schema_clientes.clientes WHERE id = $1 LIMIT 1`, [cliente_id_origen]),
      this.dataSource.query(`SELECT id, nombre, email, cedula_ruc, estado FROM schema_clientes.clientes WHERE id = $1 LIMIT 1`, [cliente_id_destino]),
    ]);

    if (!origenRows || origenRows.length === 0) {
      throw new NotFoundException(`Cliente origen con ID ${cliente_id_origen} no existe.`);
    }
    if (!destinoRows || destinoRows.length === 0) {
      throw new NotFoundException(`Cliente destino con ID ${cliente_id_destino} no existe.`);
    }

    const clienteOrigen = origenRows[0];
    const clienteDestino = destinoRows[0];

    if (clienteOrigen.estado === 'FUSIONADO') {
      throw new BadRequestException(`El cliente origen ${cliente_id_origen} ya se encuentra en estado FUSIONADO.`);
    }

    // Contar registros afectados
    const [atraccionesCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_atracciones.atracciones_reservas WHERE cliente_id::text = $1 OR customer_email = $2`,
      [cliente_id_origen, clienteOrigen.email],
    ).catch(() => [{ count: 0 }]);

    const [autosCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_autos.autos_reservas WHERE cliente_id::text = $1`,
      [cliente_id_origen],
    ).catch(() => [{ count: 0 }]);

    const [alojamientosCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_alojamientos.alojamientos_reservas WHERE cliente_id::text = $1 OR email_titular = $2`,
      [cliente_id_origen, clienteOrigen.email],
    ).catch(() => [{ count: 0 }]);

    const [vuelosCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_vuelos.vuelos_reservas WHERE cliente_id::text = $1`,
      [cliente_id_origen],
    ).catch(() => [{ count: 0 }]);

    const [facturasCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_facturacion.facturas_encabezado WHERE cliente_id::text = $1`,
      [cliente_id_origen],
    ).catch(() => [{ count: 0 }]);

    const [mapeosCount] = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM schema_clientes.clientes_socios_mapeo WHERE cliente_id = $1`,
      [cliente_id_origen],
    ).catch(() => [{ count: 0 }]);

    const preview = {
      simulacion: dry_run,
      cliente_origen: { id: clienteOrigen.id, nombre: clienteOrigen.nombre, email: clienteOrigen.email, cedula: clienteOrigen.cedula_ruc },
      cliente_destino: { id: clienteDestino.id, nombre: clienteDestino.nombre, email: clienteDestino.email, cedula: clienteDestino.cedula_ruc },
      registros_a_reasignar: {
        atracciones: atraccionesCount?.count || 0,
        autos: autosCount?.count || 0,
        alojamientos: alojamientosCount?.count || 0,
        vuelos: vuelosCount?.count || 0,
        facturas: facturasCount?.count || 0,
        mapeos_socios: mapeosCount?.count || 0,
      },
      motivo,
    };

    if (dry_run) {
      return {
        status: 'DRY_RUN_COMPLETADO',
        mensaje: 'Simulación de fusión ejecutada. No se realizaron cambios en la base de datos.',
        ...preview,
      };
    }

    // Ejecución Atómica con Transacción
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Reasignar reservas de atracciones
      await queryRunner.query(
        `UPDATE schema_atracciones.atracciones_reservas 
         SET cliente_id = $1 
         WHERE cliente_id::text = $2`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`No se actualizó atracciones_reservas: ${e.message}`));

      // 2. Reasignar reservas de autos
      await queryRunner.query(
        `UPDATE schema_autos.autos_reservas 
         SET cliente_id = $1 
         WHERE cliente_id::text = $2`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`No se actualizó autos_reservas: ${e.message}`));

      // 3. Reasignar reservas de alojamientos
      await queryRunner.query(
        `UPDATE schema_alojamientos.alojamientos_reservas 
         SET cliente_id = $1 
         WHERE cliente_id::text = $2`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`No se actualizó alojamientos_reservas: ${e.message}`));

      // 4. Reasignar reservas de vuelos
      await queryRunner.query(
        `UPDATE schema_vuelos.vuelos_reservas 
         SET cliente_id = $1 
         WHERE cliente_id::text = $2`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`No se actualizó vuelos_reservas: ${e.message}`));

      // 5. Reasignar facturas
      await queryRunner.query(
        `UPDATE schema_facturacion.facturas_encabezado 
         SET cliente_id = $1 
         WHERE cliente_id::text = $2`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`No se actualizó facturas_encabezado: ${e.message}`));

      // 6. Transferir mapeos de socios (evitando colisión de UNIQUE(cliente_id, codigo_nodo))
      await queryRunner.query(
        `UPDATE schema_clientes.clientes_socios_mapeo 
         SET cliente_id = $1 
         WHERE cliente_id = $2 
           AND codigo_nodo NOT IN (
             SELECT codigo_nodo FROM schema_clientes.clientes_socios_mapeo WHERE cliente_id = $1
           )`,
        [cliente_id_destino, cliente_id_origen],
      ).catch((e) => this.logger.warn(`Transferencia de mapeos socios: ${e.message}`));

      // 7. Marcar cliente secundario como FUSIONADO
      await queryRunner.query(
        `UPDATE schema_clientes.clientes 
         SET estado = 'FUSIONADO' 
         WHERE id = $1`,
        [cliente_id_origen],
      );

      // Confirmar transacción
      await queryRunner.commitTransaction();
      this.logger.log(`[Service Merge] Fusión exitosa de ${cliente_id_origen} -> ${cliente_id_destino}`);
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`[Service Merge] Error durante la transacción de fusión: ${error.message}`);
      throw new BadRequestException(`Fallo en transacción atómica de fusión: ${error.message}`);
    } finally {
      await queryRunner.release();
    }

    // 8. Publicar evento de telemetría y auditoría en Kafka
    const eventoMerge = {
      event_type: 'CustomerMerged',
      cliente_origen: cliente_id_origen,
      cliente_destino: cliente_id_destino,
      motivo,
      operador: contextoSeguridad.userId || 'SISTEMA',
      timestamp: new Date().toISOString(),
    };

    try {
      await this.kafkaBus.emitTelemetryEvent(cliente_id_destino, eventoMerge);
      await this.rabbitBus.publish('cliente.identidad.fusionada', eventoMerge);
    } catch (e: any) {
      this.logger.warn(`[Service Merge] Event bus emit warning: ${e.message}`);
    }

    // 9. Registrar auditoría física con Winston
    this.winstonLogger.logAudit('SERVICE_MERGE_CLIENTES_COMPLETADO', eventoMerge);

    return {
      status: 'EXITO',
      mensaje: `Clientes fusionados exitosamente. Reservas y comprobantes reasignados al cliente ${cliente_id_destino}.`,
      ...preview,
      simulacion: false,
    };
  }

  // ===========================================================================
  // 4. CONSULTA DE MAPEOS POR CLIENTE
  // ===========================================================================
  async getMapeosPorCliente(clienteId: string): Promise<any[]> {
    return this.dataSource.query(
      `SELECT m.*, p.nombre_proveedor, p.vertical 
       FROM schema_clientes.clientes_socios_mapeo m
       LEFT JOIN schema_proveedores.config_proveedor p ON p.codigo_nodo = m.codigo_nodo
       WHERE m.cliente_id = $1`,
      [clienteId],
    );
  }

  // ===========================================================================
  // HELPERS PRIVADOS
  // ===========================================================================
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
          UNIQUE(cliente_id, codigo_nodo)
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

  private async obtenerCredencialesSocio(codigoNodo: string): Promise<{ baseUrl: string; apiKey: string }> {
    let baseUrl = '';
    let apiKey = '';

    try {
      const rows = await this.dataSource.query(
        `SELECT base_url_rest, api_key 
         FROM schema_proveedores.config_proveedor 
         WHERE codigo_nodo = $1 LIMIT 1`,
        [codigoNodo],
      );
      if (rows && rows.length > 0 && rows[0].base_url_rest) {
        baseUrl = rows[0].base_url_rest.replace(/\/$/, '');
        apiKey = rows[0].api_key || '';
      }
    } catch (_) {}

    // Fallbacks si no están en base de datos
    if (!baseUrl) {
      if (codigoNodo === 'NODE_AUT_MATEO' || codigoNodo === 'NODE_AUT_MDU' || codigoNodo === 'NODE_AUT_MANEJADEUNA' || codigoNodo === 'NODE_AUT_2') {
        baseUrl = 'https://maneja-de-una-autos-api.azurewebsites.net/api/v3';
        apiKey = 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=';
      } else if (codigoNodo === 'NODE_AUT_RUTALIBRE' || codigoNodo?.includes('AUT')) {
        baseUrl = process.env.TIENDA_AUTOS_URL || 'https://rutalibre-autos-api.azurewebsites.net/api/v3';
        apiKey = process.env.TIENDA_AUTOS_API_KEY || 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
      } else if (codigoNodo === 'NODE_ATR_GLORIA') {
        baseUrl = 'https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3';
      } else if (codigoNodo === 'NODE_ATR_ALISSON' || codigoNodo?.includes('ATR')) {
        baseUrl = 'https://alisson-atracciones-api.azurewebsites.net/api/v3';
        apiKey = 'atr-f575172d62a81d51e87fbc0a37952d984ce1c078';
      }
    }

    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
  }
}
