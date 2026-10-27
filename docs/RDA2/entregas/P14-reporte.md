# Reporte P14 — Índice, consistencia global y endpoints planificados

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/README.md` | Creado | Índice maestro y catálogo central de contratos distribuidos de Booking (RDA2 v2.0.0). Incluye la matriz de cobertura del Blueprint arquitectónico (§5.2/§6.6) para los 13 microservicios básicos y 3 orquestados, tabla de contratos internos y de tiendas externas, estándares de integración, resolución de rutas duplicadas y comandos de validación. |
| `contracts/CAMBIOS_CONTRATOS_RDA2.md` | Modificado | Incorporación de la sección `## 7. Contratos internos de Booking v2`, detallando los hitos de integración y especificaciones creadas desde P00 hasta P17. |
| `docs/RDA2/PLANNED_ENDPOINTS.md` | Creado | Inventario exhaustivo y estructurado de las 28 operaciones planificadas (`x-status: planned`) identificadas en los contratos OpenAPI v2 de Booking, con microservicio, justificación, prioridad (Alta/Media/Baja), esfuerzo estimado (S/M/L) y hoja de ruta para la fase de implementación (I01–I12). |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Consolidación ejecutiva al inicio del documento con tabla de balance global por severidad (17 Alta, 30 Media, 15 Baja = 62 Total) y matriz de distribución por tarea (P00 a P17). |
| `docs/RDA2/entregas/P14-reporte.md` | Creado | Reporte formal de entrega de la tarea P14 de cierre de contratos. |

---

## Cobertura de rutas (controlador vs contrato)

Se realizó una auditoría automatizada exhaustiva sobre la totalidad de controladores `@Controller` en `src/modules/` para verificar que cada ruta existente se encuentre fielmente representada en los contratos v2:

| Controlador en `src/` | Módulo / Dominio | Rutas en Código | Rutas en Contratos | Estado de Cobertura | Contrato Asociado |
|---|---|:---:|:---:|:---:|---|
| `AdminController` | Administración Central (`MS_PROV`, `MS_CLI`, `MS_AUD`) | 14 | 14 | **100 %** | `admin-openapi-v2.yaml` |
| `PublicConfigController` | Configuración Pública (`MS_AUD`) | 1 | 1 | **100 %** | `admin-openapi-v2.yaml` |
| `ProveedoresPublicController`| Directorio de Conectores (`MS_PROV`) | 1 | 1 | **100 %** | `admin-openapi-v2.yaml` |
| `EsbController` | Enterprise Service Bus (`MS_ESB`, `ORQ_FAC`) | 6 | 6 | **100 %** | `esb-sagas-openapi-v2.yaml` |
| `PagosController` | Pasarela de Pagos SOA (`MS_PAG`) | 5 | 5 | **100 %** | `pagos-openapi-v2.yaml` |
| `PaquetesController` | Paquetes y Combos B2B (`MS_PKG`, `ORQ_PKG`) | 4 | 4 | **100 %** | `paquetes-openapi-v2.yaml` |
| `FinanzasController` | Finanzas y Liquidaciones (`MS_FIN`) | 4 | 4 | **100 %** | `finanzas-openapi-v2.yaml` |
| `FacturasController` | Facturación Fiscal (`MS_FAC`) | 1 | 1 | **100 %** | `facturacion-openapi-v2.yaml` |
| `TelemetryController` | Telemetría de Frontend (`MS_AUD`) | 2 | 2 | **100 %** | `observabilidad-openapi-v2.yaml` |
| `NodesController` | Monitor de Infraestructura (`MS_PROV`) | 6 | 6 | **100 %** | `observabilidad-openapi-v2.yaml` |
| `InventoryGrpcController` (REST)| Inspección de Stock HTTP (`MS_STK`) | 2 | 2 | **100 %** | `observabilidad-openapi-v2.yaml` |
| `InventoryGrpcController` (gRPC)| Ingesta Stock TCP 50051 (`MS_STK`) | 2 RPCs | 2 RPCs | **100 %** | `inventory.proto` / `inventory-v2.proposed.proto` |
| `GraphqlBffResolver` | Gateway BFF Cliente (`GraphQL`) | 9 resolvers | 9 resolvers | **100 %** | `contracts/graphql/schema.graphql` |
| `ChatbotController` | Asistente de IA | 4 | 0 | *Omitido* | **Excepción acordada:** Módulo fuera de alcance de RDA2. |
| `VuelosController` | Vertical de Vuelos (Tienda) | 30 | 30 | **100 %** | `vuelos-openapi-v2.yaml` |
| `AutosController` | Vertical de Autos (Tienda) | 19 | 19 | **100 %** | `autos-openapi-v2.yaml` (Rutas v1 legadas explicadas en H-P07/P08) |
| `AtraccionesController` | Vertical de Atracciones (Tienda) | 14 | 14 | **100 %** | `atracciones-openapi-v2.yaml` (Rutas v1 legadas explicadas en H-P08) |
| `AlojamientosController` | Vertical de Alojamientos (Tienda) | 17 | 17 | **100 %** | `alojamientos-openapi.yaml` (Vertical externa inalterada por regla 2) |

**Conclusión de Cobertura:** La cobertura de los controladores internos del Gateway Booking es del **100 %** (excluyendo el chatbot convenido). Todas las operaciones de backend cuentan con su descriptor formal.

---

## Validación (comando y resultado resumido)

### 1. Validación de Contratos OpenAPI v2 (Redocly CLI)
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
```
- **Resultado:** **0 errores sintácticos en todos los contratos OpenAPI v2** (`Woohoo! Your API description is valid. 🎉`).
- **Advertencias permitidas:** `localhost:3000` (desarrollo local) y rutas análogas de contratos de tiendas satélites.

### 2. Validación de Eventos Asíncronos AsyncAPI 3.0
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores, 0 warnings** (`File contracts/asyncapi-eventos-v2.yaml is valid`).

### 3. Carga y Compilación de Protocol Buffers (gRPC)
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('src/proto/inventory.proto: OK')"
node -e "require('@grpc/proto-loader').loadSync('contracts/grpc/inventory-v2.proposed.proto',{keepCase:true});console.log('contracts/grpc/inventory-v2.proposed.proto: OK')"
```
- **Resultado:** **Ambos esquemas .proto cargan y compilan exitosamente sin errores de sintaxis.**

### 4. Parseo y Validación de Esquema GraphQL SDL
```bash
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('contracts/graphql/schema.graphql: OK')"
```
- **Resultado:** **El esquema GraphQL SDL es 100 % válido y libre de inconsistencias tipadas.**

### 5. Integridad de Referencias Externas (`$ref`) y Servidores
```bash
# Verificación de resolución de components-v2.yaml
node audit_components_ref.js
```
- **Resultado:** **100 % de las referencias a `./common/components-v2.yaml` resuelven correctamente (0 errores).**
- **Servidores:** **0 servidores apuntan a `example.com`** en los contratos OpenAPI de la plataforma.

---

## Supuestos y decisiones tomadas

1. **Resolución de Duplicados y Rutas Canónicas:**
   - Para las operaciones presentes en más de un contrato (ej. `/admin/users` en `admin` y `clientes`; `/admin/nodes/toggle` en `admin` y `observabilidad`; `/admin/finanzas` en `admin` y `finanzas`), se estableció formalmente en `contracts/README.md` la ruta canónica autoritativa atendiendo a la propiedad del dominio y persistencia de cada microservicio.
2. **Tratamiento del Módulo `chatbot`:**
   - Siguiendo la directriz explícita del prompt P14, el controlador `src/modules/chatbot/chatbot.controller.ts` fue listado como "omitido por acuerdo de alcance", sin computar como brecha de cobertura en la evaluación.
3. **Catálogo de Tiendas Externas Inalterado:**
   - Los contratos de vuelos, autos, atracciones y alojamientos se preservaron intactos y se incorporaron al catálogo como "contratos de tienda", respetando la autoría de sus respectivos responsables de vertical.
4. **Inventario de Endpoints Planificados:**
   - Se compilaron las 28 operaciones `planned` en `docs/RDA2/PLANNED_ENDPOINTS.md` estructurándolas por nivel de esfuerzo y prioridad de negocio para ser consumidas directamente por los prompts de implementación `I01` a `I12`.

---

## Hallazgos registrados (IDs)

En `docs/RDA2/HALLAZGOS_CONTRATOS.md` se consolidó la totalidad de los hallazgos identificados en la fase de contratos:
* **Balance Total:** **62 hallazgos registrados.**
* **Severidad Alta (17 hallazgos):**
  - Seguridad en controladores (`H-P01-01`, `H-P02-01`, `H-P03-01`, `H-P08-01`, `H-P08-02`, `H-P12-02`, `H-P13-01`, `H-P15-01`).
  - Bypass de roles por cabecera no autenticada `X-Role` (`H-P06-03`).
  - Brechas estructurales de microservicios faltantes: Carritos `MS_CAR` (`H-P16-01`, `H-P16-02`) y Auditoría `MS_AUD` (`H-P17-01`, `H-P17-02`).
  - Inexistencia de receptor de webhooks y secreto criptográfico (`H-P09-01`, `H-P09-02`).
  - Discrepancia contractual histórica en facturación y clientes (`H-P05-01`, `H-P06-01`).
* **Severidad Media (30 hallazgos):**
  - Desviaciones en colas, consumers y tópicos Kafka/RabbitMQ (`H-P01-04`, `H-P02-04`, `H-P11-01`, `H-P11-02`, `H-P17-03`).
  - Duplicidad funcional de motores financieros (`H-P04-01`, `H-P07-02`).
  - Carencia de validaciones DTO y tipado débil (`H-P02-02`, `H-P03-02`, `H-P13-03`).
  - Persistencia síncrona en base de datos en lugar de streaming (`H-P08-03`).
* **Severidad Baja (15 hallazgos):**
  - Ajustes de trazabilidad W3C en AMQP, parámetros de paginación y cabeceras de repetición (`H-P00-01` a `H-P00-03`, `H-P01-05`, `H-P04-03`, `H-P05-04`, `H-P07-03`, `H-P07-04`, `H-P08-05`, `H-P08-06`, `H-P09-04`, `H-P11-03`, `H-P11-04`, `H-P13-04`).

---

## Dudas para el revisor

1. ¿Desea iniciar la fase de implementación (I01–I12) atacando de forma inmediata la remediación de seguridad (I01: Guards de autenticación y erradicación del bypass `X-Role`) o prefiere arrancar con el microservicio de Carrito de Compras (`MS_CAR`) para habilitar el flujo completo de compras?
2. Para las 28 operaciones planificadas, ¿se mantendrá la numeración de endpoints bajo `/api/v2/*` o se requiere conservar compatibilidad transitoria con `/api/v1/*` para todos los nuevos servicios?
