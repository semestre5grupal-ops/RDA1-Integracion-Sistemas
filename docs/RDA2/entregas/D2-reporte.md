# Reporte D2 — Requisitos no funcionales

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `docs/RDA2/REQUISITOS_NO_FUNCIONALES.md` | Creado | Documento maestro consolidado de Requisitos No Funcionales medibles para Booking Prototipo (RDA2). Comprende 40 requisitos no funcionales distribuidos en 10 categorías obligatorias (Rendimiento, Disponibilidad y Resiliencia, Seguridad, Observabilidad, Consistencia e Idempotencia, Mensajería, Interoperabilidad, Mantenibilidad, Portabilidad/Despliegue y Cumplimiento B2B), con métricas cuantificables, umbrales explícitos basados en el repo, métodos de verificación, estado de cumplimiento (29 Cumple, 8 Parcial, 3 No Cumple) y trazabilidad completa a los hallazgos registrados. |
| `docs/RDA2/entregas/D2-reporte.md` | Creado | Reporte formal de entrega de la tarea D2. |

---

## Cobertura de rutas (controlador vs contrato)

El documento de Requisitos No Funcionales evalúa transversalmente los controladores y canales del Gateway, evaluando los mecanismos perimetrales (latencias, seguridad, Circuit Breakers, idempotencia y observabilidad) de cada endpoint:

| Método | Ruta / Canal | Handler / Componente | En el contrato | x-status | Requisito No Funcional Asociado |
|:---:|---|---|---|:---:|:---:|
| `ALL` | `/api/v2/**` | `CorrelationIdMiddleware` | `components-v2.yaml#CorrelationId` | `implemented` | `RNF-OBS-01` (Trazabilidad universal) |
| `ALL` | `/api/v2/**` | `Rfc7807ExceptionFilter` | `components-v2.yaml#ProblemDetails`| `implemented` | `RNF-INT-02` (RFC 7807 estándar) |
| `ALL` | `/api/v1/**` y `/api/v2/**` | `NestJS Versioning Router` | Servidores v1 y v2 | `implemented` | `RNF-INT-01` (Versionamiento dual URI) |
| `GET` | `/graphql` | `GraphqlBffResolver` | `schema.graphql` | `implemented` | `RNF-PERF-01` ($P_{95} \le 500\text{ ms}$) |
| `REST`| Llamadas salientes a tiendas | `DilanAtraccionesAdapter` / `AutosCB` | Adaptadores ACL | `implemented` | `RNF-PERF-02` / `RNF-RES-01` (Timeout 5s / CB) |
| `POST`| `/esb/checkout-saga` | `EsbController.checkoutSaga` | `esb-sagas-openapi-v2.yaml#checkoutSaga` | `implemented` | `RNF-RES-04` / `RNF-IDM-03` (Saga LIFO / Idemp) |
| `POST`| `/pagos/procesar` | `PagosController.procesarPago` | `pagos-openapi-v2.yaml#procesarPago` | `implemented` | `RNF-IDM-01` (Idempotency-Key anti doble cobro) |
| `POST`| `/pagos/reembolsos` | `PagosController.procesarReembolso` | `pagos-openapi-v2.yaml#procesarReembolso` | `implemented` | `RNF-RES-04` (Reembolso compensatorio 100%) |
| `GET` | `/admin/nodes/health` | `ConnectorHealthService` | `observabilidad-openapi-v2.yaml#listarNodos` | `implemented` | `RNF-OBS-03` (Semáforo 5 nodos 🟢/🟡/🔴) |
| `POST`| `/admin/nodes/:id/toggle-killswitch`| `AdminController.toggleKillSwitch` | `admin-openapi-v2.yaml#toggleNode` | `implemented` | `RNF-RES-03` (Kill-Switch dinámico < 100ms) |
| `GET` | `/admin/auditoria` | `AdminController.getAuditoria` | `admin-openapi-v2.yaml#getAdminAuditoria` | `implemented` | `RNF-OBS-02` (Cero logs en BD / Winston disco) |
| `POST`| `/autos/orders/:id/checkin-devolucion`| `AutosController.checkinDevolucion`| `autos-openapi-v2.yaml#checkinDevolucion` | `implemented` | `RNF-CMP-02` (Cooldown de 2 horas en flota) |
| `RPC` | `PushStockUpdate` (:50051) | `InventoryStockService` | `src/proto/inventory.proto` | `implemented` | `RNF-PERF-03` (Latencia gRPC $\le 50\text{ ms}$) |
| `AMQP`| `booking.events` | `DualEventBusService` | `asyncapi-eventos-v2.yaml` | `implemented` | `RNF-MSG-01` (RabbitMQ transaccional autoritativo)|
| `KAFKA`| `booking.audit.sagas` | `RabbitKafkaBridgeService` | `asyncapi-eventos-v2.yaml` | `implemented` | `RNF-MSG-02` (Kafka réplica y telemetría) |
| `POST`| `/webhooks/{vertical}` | `WebhooksModule` | `webhooks-inbound-openapi-v2.yaml` | `planned` | `RNF-SEC-06` (Firma HMAC-SHA256) |
| `POST`| `/carritos/{id}/items` | `CarritosModule` | `carritos-openapi-v2.yaml#agregarItem` | `planned` | `RNF-IDM-04` (Snapshot inmutable de precios) |
| `GET` | `/esb/sagas/:corrId/traza` | `EsbController.traza` | `esb-sagas-openapi-v2.yaml#obtenerTrazaGrafo`| `planned` | `RNF-OBS-04` (Grafo Saga con spans W3C) |

---

## Validación (comando y resultado resumido)

### 1. Validación de Sintaxis y Formato Markdown
- El documento `docs/RDA2/REQUISITOS_NO_FUNCIONALES.md` fue verificado con formato GitHub Flavored Markdown (GFM), tablas normalizadas con métricas numéricas precisas, notación LaTeX para percentiles ($P_{95}$) e inclusión del diagrama de Hoja de Ruta Mermaid.

### 2. Verificación de Contratos OpenAPI v2 y Estándares
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
```
- **Resultado:** **0 errores sintácticos en los 11 contratos OpenAPI v2.**

### 3. Verificación de Event Bus AsyncAPI 3.0
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores, 0 advertencias.**

### 4. Compilación de Protocol Buffers y Esquema GraphQL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **Ambos esquemas compilan limpiamente.**

---

## Supuestos y decisiones tomadas

1. **Cuantificación Objetiva de Umbrales:**
   - Todos los umbrales numéricos provienen directamente de fuentes canónicas del repositorio:
     - Timeout de integración de 5000 ms: fijado por el Criterio Excluyente CE01 de cátedra y verificado en `circuit-breaker-resilience.spec.ts`.
     - Cooldown de 2 horas (120 minutos): fijado por el Mandato de Flota RDA2 y documentado en `ADR-004`.
     - Cero logs técnicos en BD: fijado por el Mandato §2 de Cátedra y documentado en `ADR-003`.
     - Puerto gRPC 50051 y latencia < 50 ms: fijado por `technical-requirements.md` y `ADR-001`.
2. **Criterio de Clasificación de Estados:**
   - **Cumple (29 RNF / 72.5%):** Requisitos cuyo código y pruebas automatizadas demuestran su operatividad real en el repositorio.
   - **Parcial (8 RNF / 20.0%):** Requisitos formalizados en los contratos v2 y enrutadores pero cuya lógica completa reside en los endpoints planificados (I01–I12).
   - **No Cumple (3 RNF / 7.5%):** Vulnerabilidades reales existentes en el código (`H-P01-01`/`H-P02-01`/`H-P03-01` por falta de Guards, `H-P06-03` por bypass de `X-Role`, y `H-P02-02`/`H-P03-02` por DTOs con `any`), documentadas con total transparencia técnica para su remediación en los primeros sprints de implementación.
3. **Rol de RabbitMQ y Kafka:**
   - En apego estricto a las consideraciones de la Semana 8 y al diseño arquitectónico del equipo (`RabbitKafkaBridgeService`), se estableció que RabbitMQ es el broker autoritativo y transaccional, mientras que Kafka actúa como plataforma de commit log distribuido para réplica inmutable, analítica, auditoría forense y telemetría masiva sin comprometer la velocidad del checkout.

---

## Hallazgos registrados (IDs)

Los 3 requisitos marcados como "No Cumple" y los 8 marcados como "Parcial" se encuentran vinculados a los hallazgos de `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
* `H-P01-01`: Falta de `@UseGuards` en `EsbController` (`RNF-SEC-05`).
* `H-P01-02`: `Idempotency-Key` opcional en checkout de Saga (`RNF-IDM-03`).
* `H-P01-03`: Trazas en formato relacional en lugar de grafo visual con spans W3C (`RNF-OBS-04`).
* `H-P01-04`: Falta de publicación AMQP en ciclo de vida de la Saga (`RNF-MSG-03`).
* `H-P02-01`: Falta de `@UseGuards` en `PagosController` (`RNF-SEC-05`).
* `H-P02-02`: DTOs con `any` sin validación formal en `PagosController` (`RNF-MNT-03`).
* `H-P03-01`: Falta de `@UseGuards` en `PaquetesController` (`RNF-SEC-05`).
* `H-P03-02`: DTOs con `any` en `PaquetesController` (`RNF-MNT-03`).
* `H-P06-03`: Bypass de rol administrativo por cabecera `X-Role` no firmada (`RNF-SEC-04`).
* `H-P09-01` y `H-P09-02`: Ausencia de receptor y verificación HMAC-SHA256 en webhooks (`RNF-SEC-06`).
* `H-P16-01` y `H-P16-02`: Falta de persistencia en `schema_carritos` y snapshot de precios (`RNF-IDM-04`).

---

## Dudas para el revisor

1. **Priorización de Remediación:** La matriz de brechas y la línea de tiempo Mermaid detallada en la Sección 4 de `REQUISITOS_NO_FUNCIONALES.md` orienta la secuencia lógica de resolución en los prompts I01 a I05.
