# Reporte D3 — Plan de pruebas

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `docs/RDA2/PLAN_DE_PRUEBAS.md` | Creado | Plan maestro de pruebas de software, resiliencia y validación de contratos distribuidos para RDA2. Contiene la estrategia y pirámide de pruebas (5 niveles), inventario de pruebas existentes en el repositorio, especificación de 25 casos de prueba (`CP-001` a `CP-025`) con los 12 casos obligatorios de cátedra (Saga feliz, compensación LIFO, Circuit Breaker CE01, Kill-Switches, idempotencia, simulador de pagos, reembolsos, tope B2B, webhooks HMAC, RBAC, validación sintáctica de contratos y trazabilidad `X-Correlation-Id`), pruebas de carga y estrés con autocannon, criterios de entrada/salida y enlace a la matriz de trazabilidad. |
| `docs/RDA2/MATRIZ_TRAZABILIDAD.md` | Creado | Matriz integral de trazabilidad que vincula los 11 Criterios de Evaluación Cátedra (CE01 a CE11) con Requisitos Funcionales y No Funcionales, Contratos v2, código fuente (`x-source`), Casos de Prueba (`CP`), evidencias reproducibles y análisis de brechas priorizadas para la fase de implementación. |
| `docs/RDA2/entregas/D3-reporte.md` | Creado | Reporte formal de entrega de la tarea D3. |

---

## Cobertura de rutas (controlador vs contrato)

A continuación se muestra el mapeo de los casos de prueba del plan sobre los controladores y operaciones del Gateway NestJS:

| Método | Ruta / Operación | Handler / Controlador | En el contrato | x-status | Caso de Prueba Vinculado |
|:---:|---|---|---|:---:|:---:|
| `POST`| `/esb/checkout-saga` | `EsbController.checkoutSaga` | `esb-sagas-openapi-v2.yaml#checkoutSaga` | `implemented` | `CP-001` (Saga feliz)<br>`CP-002` (Compensación LIFO) |
| `POST`| `/graphql` (`checkoutOrquestado`)| `GraphqlBffResolver.checkoutOrquestado` | `schema.graphql#checkoutOrquestado` | `implemented` | `CP-001` (Saga feliz) |
| `POST`| `/graphql` (`cancelarReservaConSaga`)| `GraphqlBffResolver.cancelarReserva` | `schema.graphql#cancelarReservaConSaga` | `implemented` | `CP-002` (Compensación LIFO) |
| `GET` | `/graphql` (`catalogoUnificado`)| `GraphqlBffResolver.catalogoUnificado` | `schema.graphql#catalogoUnificado` | `implemented` | `CP-015` (Catálogo agregado) |
| `POST`| `/pagos/procesar` | `PagosController.procesarPago` | `pagos-openapi-v2.yaml#procesarPago` | `implemented` | `CP-006` (Idempotency-Key) |
| `POST`| `/pagos/reembolsos` | `PagosController.procesarReembolso` | `pagos-openapi-v2.yaml#procesarReembolso` | `implemented` | `CP-008` (Reembolso idempotente) |
| `POST`| `/pagos/simulador/config` | `PagosController.updateSimulador` | `pagos-openapi-v2.yaml#updateConfigSimulador` | `implemented` | `CP-007` (Inyección de fallos) |
| `GET` | `/admin/nodes/health` | `ConnectorHealthService` | `observabilidad-openapi-v2.yaml#listarNodos` | `implemented` | `CP-004` (Circuit Breaker 5s)<br>`CP-005` (Semáforo LED) |
| `POST`| `/admin/nodes/:id/toggle-killswitch`| `AdminController.toggleKillSwitch` | `admin-openapi-v2.yaml#toggleNode` | `implemented` | `CP-005` (Kill-Switch atómico) |
| `GET` | `/admin/stats` | `AdminController.getStats` | `admin-openapi-v2.yaml#getAdminStats` | `implemented` | `CP-011` (RBAC intento CLIENTE) |
| `POST`| `/paquetes/dinamico` | `PaquetesController.crearDinamico` | `paquetes-openapi-v2.yaml#crearPaqueteDinamico`| `implemented` | `CP-009` (Tope de descuento B2B) |
| `POST`| `/atracciones/reservas` | `AtraccionesController.reservar` | `atracciones-openapi-v2.yaml#reservas` | `implemented` | `CP-016` (Aforo infantes $0 pero 1 cupo) |
| `POST`| `/atracciones/reservas/:id/checkin`| `AtraccionesController.checkin` | `atracciones-openapi-v2.yaml#checkin` | `implemented` | `CP-017` (Check-in QR voucher) |
| `POST`| `/autos/orders/:id/checkin-devolucion`| `AutosController.checkinDev` | `autos-openapi-v2.yaml#checkinDevolucion` | `implemented` | `CP-018` (Cooldown 2h en flota) |
| `POST`| `/autos/:id/mantenimiento/registro`| `AutosController.mantenimiento` | `autos-openapi-v2.yaml#mantenimiento` | `implemented` | `CP-019` (Alerta kilometraje) |
| `POST`| `/vuelos/v2/holds` | `VuelosController.createHold` | `vuelos-openapi-v2.yaml#createHold` | `implemented` | `CP-020` (Hold TTL 15 min) |
| `POST`| `/vuelos/v2/bookings/:pnr/check-in`| `VuelosController.checkIn` | `vuelos-openapi-v2.yaml#checkIn` | `implemented` | `CP-021` (Pase abordar PNR) |
| `GET` | `/finanzas/liquidaciones` | `FinanzasController.getLiquidaciones` | `finanzas-openapi-v2.yaml#getLiquidaciones` | `implemented` | `CP-022` (Liquidaciones Q1/Q2) |
| `GET` | `/esb/aggregate/facturas/:id` | `EsbController.getFacturaCompleta` | `esb-sagas-openapi-v2.yaml#getFacturaCompleta` | `implemented` | `CP-023` (Factura compuesta ESB) |
| `RPC` | `PushStockUpdate` (:50051) | `InventoryStockService` | `src/proto/inventory.proto` | `implemented` | `CP-014` (Ingesta stock gRPC) |
| `POST`| `/webhooks/{vertical}` | `WebhooksModule` | `webhooks-inbound-openapi-v2.yaml` | `planned` | `CP-010` (Firma HMAC-SHA256) |
| `POST`| `/carritos/{id}/items` | `CarritosModule` | `carritos-openapi-v2.yaml` | `planned` | `CP-024` (Snapshot precios) |
| `GET` | `/auditoria/transacciones` | `AuditoriaModule` | `auditoria-openapi-v2.yaml` | `planned` | `CP-025` (Auditoría SQL) |

---

## Validación (comando y resultado resumido)

### 1. Validación de Sintaxis Markdown y Estructura
- Los documentos `docs/RDA2/PLAN_DE_PRUEBAS.md` y `docs/RDA2/MATRIZ_TRAZABILIDAD.md` fueron validados bajo GitHub Flavored Markdown (GFM), verificando tablas alineadas, enlaces cruzados funcionales y diagramas Mermaid válidos.

### 2. Validación de Contratos OpenAPI v2 (Redocly CLI)
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
```
- **Resultado:** **0 errores sintácticos en los 11 contratos OpenAPI v2.**

### 3. Validación de Event Bus AsyncAPI 3.0
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores, 0 advertencias.**

### 4. Compilación de Protocol Buffers (gRPC) y GraphQL SDL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **Ambos esquemas compilan exitosamente con código de salida 0.**

---

## Supuestos y decisiones tomadas

1. **Alineación con Pruebas Existentes:**
   - El plan de pruebas cataloga y referencia las suites que ya corren y pasan en el proyecto (`test/integration/circuit-breaker-resilience.spec.ts` 10/10 PASS, `src/modules/admin/admin-seguridad.spec.ts` 17/17 PASS, `test/test-cancel-saga.js`, `test/test-nodes-monitor.js`, `test/test-grpc-inventory.js`, `test/test-sanitization-rfc7807.js`, `npm run test:api:clientes` 32/32 PASS y `npm run test:contracts` 23/23 PASS).
2. **Cobertura de Casos Obligatorios:**
   - Se diseñaron formalmente los 12 casos obligatorios exigidos por el prompt D3 (`CP-001` a `CP-013`), incluyendo datos de prueba específicos (payloads JSON y comandos de consola).
3. **Todo RF Implementado con Caso de Prueba:**
   - El 100% de los requisitos funcionales con `x-status: implemented` estipulados en `REQUISITOS_FUNCIONALES.md` cuentan con al menos un caso de prueba asociado en la matriz.
4. **No Creación de Código de Pruebas Nuevo en `src/` ni `test/`:**
   - En estricto cumplimiento de la regla de la tarea D3, no se modificaron ni crearon archivos de código en `src/` ni `test/`. Los casos para endpoints planificados (`CP-010`, `CP-024`, `CP-025`) se catalogaron como `Por Crear` y proyectados con sus precondiciones y payloads de prueba listos para su automatización durante los sprints I01 a I12.
5. **Creación Temprana de la Matriz de Trazabilidad (`MATRIZ_TRAZABILIDAD.md`):**
   - Siguiendo la indicación de la Sección 7 del prompt D3, se generó el documento maestro `docs/RDA2/MATRIZ_TRAZABILIDAD.md` vinculando los 11 Criterios de Evaluación Cátedra (CE01 a CE11) con sus evidencias reproducibles, dejando la base lista para la tarea D4.

---

## Hallazgos registrados (IDs)

Los casos de prueba proyectados para endpoints planificados y las pruebas de seguridad que revelan vulnerabilidades en el código se trazaron contra los hallazgos de `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
* `CP-010`: Webhooks inbound con firma HMAC-SHA256 (`H-P09-01`, `H-P09-02`).
* `CP-011`: Vulnerabilidad de bypass `X-Role: admin` en `AdminController` (`H-P06-03`).
* `CP-006` y `CP-001`: Falta de `SupabaseAuthGuard` en `EsbController`, `PagosController` y `PaquetesController` (`H-P01-01`, `H-P02-01`, `H-P03-01`).
* `CP-024`: Falta de persistencia en `schema_carritos` y snapshot de precios (`H-P16-01`, `H-P16-02`).
* `CP-025`: Endpoints de auditoría transaccional en `schema_auditoria` planificados (`H-P17-01`, `H-P17-02`).

---

## Dudas para el revisor

1. **Automatización en Fase de Implementación:** Los casos catalogados como `Por Crear` (`CP-010`, `CP-024`, `CP-025`) serán automatizados en Jest conforme se desarrollen los módulos `WebhooksModule`, `CarritosModule` y `AuditoriaModule` en los sprints I01 a I12.
