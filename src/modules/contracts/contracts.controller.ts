import { Controller, Get, Param, Res, NotFoundException, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export interface ContractInfo {
  microservicio: string;
  vertical: string;
  version: string;
  archivo: string;
  formato: string;
  descripcion: string;
  url_descarga: string;
}

@ApiTags('Contratos por Microservicio (RDA2)')
@Controller({ path: 'contracts', version: ['1', '2', '3'] })
export class ContractsController {
  private readonly contractsList: ContractInfo[] = [
    {
      microservicio: 'MS_ATR (Atracciones Turísticas)',
      vertical: 'ATRACCIONES',
      version: '3.0.3 (Canónica v3)',
      archivo: 'atracciones-openapi-v3.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Contrato canónico en inglés con time_slots, aforo atómico y reglas RFC 7807',
      url_descarga: '/api/v3/contracts/atracciones-openapi-v3.yaml',
    },
    {
      microservicio: 'MS_ATR (Atracciones Turísticas v2)',
      vertical: 'ATRACCIONES',
      version: '2.0.0 (Compatibilidad v2)',
      archivo: 'atracciones-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Contrato B2B v2 de tours y expediciones turísticas',
      url_descarga: '/api/v3/contracts/atracciones-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_AUT (Renta de Autos y Flota)',
      vertical: 'AUTOS',
      version: '3.0.0 (Canónica v3)',
      archivo: 'autos-openapi-v3.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Contrato canónico de flota con regla de Cooldown de 2h y mantenimiento',
      url_descarga: '/api/v3/contracts/autos-openapi-v3.yaml',
    },
    {
      microservicio: 'MS_AUT (Renta de Autos v2)',
      vertical: 'AUTOS',
      version: '2.0.0 (Compatibilidad v2)',
      archivo: 'autos-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Contrato de flota de vehículos y alquileres diarios',
      url_descarga: '/api/v3/contracts/autos-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_VUE (Vuelos y Rutas Aéreas)',
      vertical: 'VUELOS',
      version: '2.0.1 (GDS Flight Core)',
      archivo: 'vuelos-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Búsqueda de tarifas, hold de cupos con TTL, emisión de PNRs y postventa',
      url_descarga: '/api/v3/contracts/vuelos-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_ALO (Alojamientos y Hoteles)',
      vertical: 'ALOJAMIENTOS',
      version: '1.0.0 (GDS Alojamientos Core)',
      archivo: 'alojamientos-openapi.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Catálogo de habitaciones, disponibilidad, tarifas por noche y check-in 14:00',
      url_descarga: '/api/v3/contracts/alojamientos-openapi.yaml',
    },
    {
      microservicio: 'MS_PAG (Pasarela de Pagos SOA)',
      vertical: 'PAGOS',
      version: '2.0.0',
      archivo: 'pagos-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Procesamiento de transacciones, simulación de fallos inyectables y reembolsos',
      url_descarga: '/api/v3/contracts/pagos-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_FAC (Facturación Fiscal SRI)',
      vertical: 'FACTURACION',
      version: '2.0.0',
      archivo: 'facturacion-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Emisión de facturas fiscales electrónicas y desglose tributario IVA',
      url_descarga: '/api/v3/contracts/facturacion-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_PKG (Paquetes y Promociones B2B)',
      vertical: 'PAQUETES',
      version: '2.0.0',
      archivo: 'paquetes-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Ensamblado dinámico de combos multivertical con topes máximos de descuento',
      url_descarga: '/api/v3/contracts/paquetes-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_FIN (Finanzas y Liquidaciones)',
      vertical: 'FINANZAS',
      version: '2.0.0',
      archivo: 'finanzas-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Cálculo de comisiones Booking y liquidaciones quincenales (Q1/Q2) a socios',
      url_descarga: '/api/v3/contracts/finanzas-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_CAR (Carritos de Compra)',
      vertical: 'CARRITOS',
      version: '2.0.0',
      archivo: 'carritos-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Snapshotting de precios, bloqueo transaccional y detección de abandono (>2h)',
      url_descarga: '/api/v3/contracts/carritos-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_CLI (Clientes y Autenticación)',
      vertical: 'CLIENTES',
      version: '2.0.0',
      archivo: 'clientes-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Gestión de perfiles de viajeros, identidad y roles RBAC',
      url_descarga: '/api/v3/contracts/clientes-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_ESB (ESB Orquestador de Sagas LIFO)',
      vertical: 'ORQUESTACION',
      version: '2.0.0',
      archivo: 'esb-sagas-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Coordinación transaccional distribuida y compensaciones automáticas LIFO',
      url_descarga: '/api/v3/contracts/esb-sagas-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_ADM (Administración Central)',
      vertical: 'ADMINISTRACION',
      version: '2.0.0',
      archivo: 'admin-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Control maestro de operadores, auditoría y kill-switches de emergencia',
      url_descarga: '/api/v3/contracts/admin-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_OBS (Observabilidad y Semáforos LED)',
      vertical: 'OBSERVABILIDAD',
      version: '2.0.0',
      archivo: 'observabilidad-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Monitoreo de latencia en vivo de los 20 nodos y health checks automáticos',
      url_descarga: '/api/v3/contracts/observabilidad-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_AUD (Auditoría Forense y Trazas)',
      vertical: 'AUDITORIA',
      version: '2.0.0',
      archivo: 'auditoria-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Registro inmutable de transacciones, correlación universal y logs de cumplimiento',
      url_descarga: '/api/v3/contracts/auditoria-openapi-v2.yaml',
    },
    {
      microservicio: 'MS_ASYNC (Event Bus EDA RabbitMQ + Kafka)',
      vertical: 'EVENT_BUS',
      version: '2.0.0',
      archivo: 'asyncapi-eventos-v2.yaml',
      formato: 'AsyncAPI 3.0.0 (YAML)',
      descripcion: 'Arquitectura orientada a eventos con colas transaccionales y DLQ dlx.booking',
      url_descarga: '/api/v3/contracts/asyncapi-eventos-v2.yaml',
    },
    {
      microservicio: 'MS_WEBHOOKS (Webhooks Inbound Socios)',
      vertical: 'INTEGRACION',
      version: '2.0.0',
      archivo: 'webhooks-inbound-openapi-v2.yaml',
      formato: 'OpenAPI 3.0.3 (YAML)',
      descripcion: 'Receptor de notificaciones asíncronas con firma criptográfica HMAC-SHA256',
      url_descarga: '/api/v3/contracts/webhooks-inbound-openapi-v2.yaml',
    },
  ];

  @Get()
  @ApiOperation({
    summary: 'Listar todos los contratos formales (.yaml) por microservicio',
    description:
      'Retorna el catálogo maestro de contratos OpenAPI 3.0 y AsyncAPI estipulados para cada microservicio del ecosistema Booking (Cátedra RDA2).',
  })
  @ApiResponse({ status: 200, description: 'Catálogo de contratos retornado exitosamente' })
  listarContratos() {
    return {
      total_contratos: this.contractsList.length,
      descripcion: 'Catálogo de Contratos Formales por Microservicio (Cátedra RDA2 - Integración de Sistemas)',
      repositorio_base: 'https://github.com/semestre5grupal-ops/RDA1-Integracion-Sistemas/tree/main/contracts',
      contratos: this.contractsList,
    };
  }

  @Get(':filename')
  @ApiOperation({
    summary: 'Descargar o visualizar el archivo .yaml de un microservicio específico',
    description: 'Devuelve el contenido crudo del contrato YAML solicitado (ej. atracciones-openapi-v3.yaml).',
  })
  @Header('Content-Type', 'text/yaml; charset=utf-8')
  obtenerContrato(@Param('filename') filename: string, @Res() res: Response) {
    // Normalizar filename
    let cleanName = filename.trim();
    if (!cleanName.endsWith('.yaml') && !cleanName.endsWith('.yml')) {
      cleanName += '.yaml';
    }

    // Buscar en directorio contracts o src/modules
    const possiblePaths = [
      path.join(process.cwd(), 'contracts', cleanName),
      path.join(process.cwd(), 'contracts', filename),
      path.join(__dirname, '..', '..', '..', 'contracts', cleanName),
      path.join(__dirname, '..', cleanName),
    ];

    const foundPath = possiblePaths.find((p) => fs.existsSync(p));

    if (!foundPath) {
      throw new NotFoundException(
        `El contrato '${filename}' no existe en el catálogo. Consulta GET /api/v3/contracts para ver los archivos disponibles.`,
      );
    }

    const content = fs.readFileSync(foundPath, 'utf8');
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${cleanName}"`);
    return res.send(content);
  }
}
