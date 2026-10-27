# Reporte D7 — Backlog priorizado de implementación

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| [`docs/RDA2/BACKLOG_IMPLEMENTACION.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/BACKLOG_IMPLEMENTACION.md) | Creado | Backlog Priorizado de Implementación consolidado con 55 ítems de trabajo (`BL-001` a `BL-055`). Cubre el 100% de los hallazgos de severidad Alta (17) y Media (30), el 100% de los endpoints planificados (28) y las 8 brechas arquitectónicas de la matriz de trazabilidad. Organizado estrictamente por el orden obligatorio de la cátedra (Seguridad Alta $\rightarrow$ Cumplimiento Cátedra/Blueprint $\rightarrow$ Funcionalidades para la Defensa $\rightarrow$ Pruebas Faltantes $\rightarrow$ Resto), incluyendo plan detallado de 3 Sprints con cronograma Gantt y catálogo de decisiones pendientes para el equipo. |
| [`docs/RDA2/entregas/D7-reporte.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/entregas/D7-reporte.md) | Creado | Reporte formal de entrega de la tarea D7 en estricto cumplimiento de la sección 10 de `00-REGLAS-COMUNES.md`. |

---

## Cobertura de rutas (controlador vs contrato)

La siguiente tabla sintetiza la correspondencia entre los controladores del backend, las operaciones de los contratos OpenAPI v2 y los ítems del backlog que gobiernan su evolución o blindaje:

| Método | Ruta / Interfaz | Controlador / Handler | En el contrato | x-status | Ítem(s) de Backlog Asociado(s) |
|:---:|---|---|---|:---:|:---:|
| `ALL`  | `/nodes/*` | `NodesController` | `admin-openapi-v2.yaml` | `implemented` | **BL-001** (Protección RBAC y blindaje de infraestructura) |
| `POST` | `/admin/nodes/:id/toggle` | `AdminController.toggleNode` | `admin-openapi-v2.yaml` | `implemented` | **BL-001**, **BL-018** (Unificación canónica de Kill-Switches) |
| `POST` | `/api/v2/esb/checkout-saga` | `EsbController.checkoutSaga` | `esb-sagas-openapi-v2.yaml` | `implemented` | **BL-003** (Guards), **BL-013** (RabbitMQ), **BL-047** (Idempotencia) |
| `POST` | `/api/v2/pagos/procesar` | `PagosController.procesar` | `pagos-openapi-v2.yaml` | `implemented` | **BL-004** (Guards), **BL-012** (DTO), **BL-014** (Event Bus) |
| `POST` | `/api/v2/pagos/simulador/config` | `PagosController.configSimulador`| `pagos-openapi-v2.yaml` | `implemented` | **BL-004** (Restricción exclusiva con `X-Admin-Key`) |
| `GET`  | `/api/v2/pagos/{ref}` | `PagosController.validarPago` | `pagos-openapi-v2.yaml` | `planned` | **BL-036** (Validación B2B síncrona), **BL-044** (Pruebas CP-025) |
| `POST` | `/api/v2/paquetes/dinamico` | `PaquetesController.crearDinamico`| `paquetes-openapi-v2.yaml` | `implemented` | **BL-005** (Guards de sesión), **BL-012** (DTO con class-validator) |
| `PUT`  | `/api/v2/paquetes/contratos/:id`| `PaquetesController.syncContrato`| `paquetes-openapi-v2.yaml` | `planned` | **BL-037** (Sincronización B2B de promociones) |
| `POST` | `/api/v2/carritos` | `CarritosController.crear` | `carritos-openapi-v2.yaml` | `planned` | **BL-025** (Creación en `schema_carritos`), **BL-041** (Pruebas) |
| `GET`  | `/api/v2/carritos/activo` | `CarritosController.obtenerActivo` | `carritos-openapi-v2.yaml` | `planned` | **BL-026** (Sincronización multidispositivo) |
| `POST` | `/api/v2/carritos/:id/items` | `CarritosController.agregarItem` | `carritos-openapi-v2.yaml` | `planned` | **BL-028** (Snapshotting inmutable de precio unitario) |
| `POST` | `/api/v2/carritos/:id/checkout`| `CarritosController.checkout` | `carritos-openapi-v2.yaml` | `planned` | **BL-029** (Transición atómica a Saga del ESB) |
| `POST` | `/api/v2/facturas` | `FacturasController.emitir` | `facturacion-openapi-v2.yaml` | `planned` | **BL-031** (Persistencia fiscal 15% IVA), **BL-042** (Pruebas) |
| `GET`  | `/api/v2/facturas/:id/pdf` | `FacturasController.descargarPdf` | `facturacion-openapi-v2.yaml` | `planned` | **BL-033** (Renderizado server-side con clave SRI) |
| `GET`  | `/api/v2/clientes/:id` | `ClientesController.obtenerFicha` | `clientes-openapi-v2.yaml` | `planned` | **BL-035** (Ficha canónica sin SQL JOINs) |
| `PATCH`| `/api/v2/clientes/:id/rol` | `ClientesController.asignarRol` | `clientes-openapi-v2.yaml` | `planned` | **BL-009** (Gestión de roles administrativos en BD) |
| `POST` | `/api/v2/webhooks/:vertical` | `WebhooksController.handleInbound` | `webhooks-inbound-openapi-v2.yaml`| `planned` | **BL-011**, **BL-038** (Verificación HMAC-SHA256), **BL-043** |
| `GET`  | `/api/v2/auditoria/transacciones`| `AuditoriaController.listarTx`| `auditoria-openapi-v2.yaml` | `planned` | **BL-040** (Consultas forenses en `schema_auditoria`) |
| `GET`  | `/api/v2/esb/sagas/:id/traza` | `EsbController.obtenerTrazaGrafo` | `esb-sagas-openapi-v2.yaml` | `planned` | **BL-023** (Grafo visual de ejecución y spans W3C) |
| `RPC`  | `PushStockUpdate` (:50051) | `InventoryStockService` | `src/proto/inventory.proto` | `implemented` | **BL-006** (Auth metadata), **BL-021** (Proto unificado) |
| `POST` | `/graphql` | `GraphqlBffResolver` | `contracts/graphql/schema.graphql`| `implemented` | **BL-007** (GqlAuthGuard), **BL-008** (Prod), **BL-055** (Inputs) |

---

## Validación (comando y resultado resumido)

### 1. Validación de Cobertura Total de Hallazgos y Endpoints Planificados
- **Hallazgos de Severidad Alta:** **17 / 17 cubiertos (100.0%)** en ítems de backlog formales.
- **Hallazgos de Severidad Media:** **30 / 30 cubiertos (100.0%)** en ítems de backlog formales.
- **Hallazgos de Severidad Baja:** 8 ítems incorporados formalmente en el grupo de hardening y resto.
- **Endpoints Planificados:** **28 / 28 operaciones planificadas (100.0%)** asociadas a ítems del backlog.
- **Brechas Arquitectónicas de Matriz:** **8 / 8 brechas (`BR-01` a `BR-08`)** asignadas con código de cierre, estimación de esfuerzo y caso de prueba.

### 2. Validación de Contratos OpenAPI v2 (Redocly CLI)
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
```
- **Resultado:** **0 errores en los 11 contratos OpenAPI v2.**

### 3. Validación de Event Bus AsyncAPI 3.0
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores, 0 advertencias.**

### 4. Compilación de Protocol Buffers y Esquema GraphQL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **gRPC OK, GraphQL OK (código de salida 0).**

---

## Supuestos y decisiones tomadas

1. **Ordenamiento Normativo de Cátedra:**
   - Se estructuró el backlog en los 5 bloques requeridos de manera estricta: Seguridad Alta (`BL-001` a `BL-012`), Cumplimiento de Cátedra y Blueprint (`BL-013` a `BL-024`), Funcionalidades Planificadas para la Defensa (`BL-025` a `BL-040`), Pruebas Faltantes (`BL-041` a `BL-046`) y Resto/Hardening (`BL-047` a `BL-055`).
2. **Propuesta de 3 Sprints Equilibrados:**
   - **Sprint 1:** Seguridad Perimetral, Cierre de Vulnerabilidades y Carrito Multivertical (`MS_CAR`).
   - **Sprint 2:** Transaccionalidad Saga, Facturación Fiscal Server-Side y Event Bus Dual (`RabbitMQ/Kafka`).
   - **Sprint 3:** Webhooks Inbound HMAC, Observabilidad Forense y Hardening de Despliegue.
3. **Decisiones Pendientes Documentadas:**
   - Se identificaron 4 decisiones de diseño no triviales para el equipo: modalidad de prueba gRPC para la evaluación docente, adopción de CloudAMQP en nube vs fallback in-memory, migración a motor PDF server-side y fecha de purga del bypass `X-Role: admin`.
4. **Cero Modificaciones de Código Fuente:**
   - La tarea se limitó exclusivamente a la creación y estructuración de la documentación en `docs/RDA2/**`, preservando la regla de oro: *"No implementes nada"*.

---

## Hallazgos registrados (IDs)

El backlog priorizado contiene la hoja de ruta formal para cerrar todos los hallazgos de `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
* Seguridad Alta: `H-P01-01`, `H-P02-01`, `H-P03-01`, `H-P05-01`, `H-P06-01`, `H-P06-03`, `H-P08-01`, `H-P08-02`, `H-P09-01`, `H-P09-02`, `H-P12-02`, `H-P13-01`, `H-P15-01`, `H-P16-01`, `H-P16-02`, `H-P17-01`, `H-P17-02`.
* Cumplimiento y Dominio Medio: `H-P01-02`, `H-P01-03`, `H-P01-04`, `H-P02-02`, `H-P02-03`, `H-P02-04`, `H-P02-05`, `H-P03-02`, `H-P03-03`, `H-P04-01`, `H-P04-02`, `H-P05-02`, `H-P05-03`, `H-P06-02`, `H-P07-01`, `H-P07-02`, `H-P08-03`, `H-P08-04`, `H-P09-03`, `H-P11-01`, `H-P11-02`, `H-P12-01`, `H-P12-03`, `H-P12-04`, `H-P13-02`, `H-P13-03`, `H-P16-03`, `H-P16-04`, `H-P17-03`, `H-P17-04`.

---

## Dudas para el revisor

1. **Alineación con la Fase de Implementación (I01 a I12):** Con el backlog formalmente consolidado en 55 ítems y distribuido en 3 sprints, la plataforma cuenta con la base técnica definitiva para dar inicio a los prompts de implementación de código fuente (I01–I12).
