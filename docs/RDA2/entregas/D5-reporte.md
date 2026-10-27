# Reporte D5 — Plan de integración

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| [`docs/RDA2/PLAN_DE_INTEGRACION.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/PLAN_DE_INTEGRACION.md) | Creado | Plan Maestro de Integración del ecosistema Booking Prototipo (RDA2). Contiene mapa de contexto arquitectónico (Mermaid `graph TD`), matriz de integración detallada por cada una de las 4 tiendas satélites y pasarela SOA, 6 diagramas de secuencia exhaustivos (`sequenceDiagram`), especificación de contratos de datos compartidos, tabla de equivalencia de eventos, cronograma de 5 hitos en Gantt con DoD enlazado a CPs de D3, matriz de 5 riesgos técnicos críticos con mitigaciones y checklist formal de integración para equipos de tiendas. |
| [`docs/RDA2/entregas/D5-reporte.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/entregas/D5-reporte.md) | Creado | Reporte formal de entrega de la tarea D5 en estricto cumplimiento de la sección 10 de `00-REGLAS-COMUNES.md`. |

---

## Cobertura de rutas (controlador vs contrato)

La siguiente tabla consolida todas las rutas, handlers y canales de integración orquestados en el Plan Maestro de Integración, vinculando cada interfaz con su respectivo contrato formal versionado v2:

| Método | Ruta / Canal de Integración | Controlador / Handler | En el contrato | x-status |
|:---:|---|---|---|:---:|
| `POST` | `/api/v2/esb/checkout-saga` | `EsbController.checkoutSaga` | [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/pagos/procesar` | `PagosController.procesar` | [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/pagos/reembolsos` | `PagosController.procesarReembolso` | [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/webhooks/vuelos` | `WebhooksController.handleVuelosWebhook` | [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/webhooks/autos` | `WebhooksController.handleAutosWebhook` | [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/webhooks/atracciones` | `WebhooksController.handleAtraccionesWebhook` | [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/atracciones/reservas` | `AtraccionesController.crearReserva` | [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/atracciones/reservas/:id/cancel` | `AtraccionesController.cancelarReserva` | [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/v2/autos/search` | `AutosController.search` | [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/autos/orders` | `AutosController.crearOrden` | [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/autos/orders/:id/cancel` | `AutosController.cancelarOrden` | [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/vuelos/v2/holds` | `VuelosController.hold` | [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/vuelos/v2/bookings/issue-tickets` | `VuelosController.issueTickets` | [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/v2/alojamientos` | `AlojamientosController.catalogo` | [`contracts/alojamientos-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/alojamientos-openapi.yaml) | `implemented` |
| `RPC`  | `PushStockUpdate` (:50051) | `InventoryStockService.pushStockUpdate` | [`src/proto/inventory.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/proto/inventory.proto) | `implemented` |
| `AMQP` | `booking.events` | `DualEventBusService.publish` | [`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) | `implemented` |
| `GET`  | `/graphql` | `GraphqlBffResolver.catalogoUnificado` | [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) | `implemented` |

---

## Validación (comando y resultado resumido)

### 1. Validación de Diagramas Mermaid
- **Total de diagramas incluidos:** 8 diagramas (supera con creces el mínimo obligatorio de 6 diagramas).
  - 1 Diagrama de Contexto Arquitectónico (`graph TD`) con 6 subgrafos y enlaces HTTP/gRPC/AMQP.
  - 6 Diagramas de Secuencia (`sequenceDiagram`) con numeración automática (`autonumber`) y notas operativas:
    1. Checkout Feliz Multivertical (Hold → Pago → Emisión → Factura).
    2. Saga con Fallo y Compensación LIFO (con identificador `REF-SAGA-XXXXXX`).
    3. Receptor de Webhooks Inbound con firma criptográfica HMAC-SHA256 y desduplicación.
    4. Sincronización continua de inventario gRPC HTTP/2 en puerto 50051.
    5. Reembolso financiero indemnizatorio directo desde portal de usuario.
    6. Circuit Breaker perimetral ante tienda caída con Mock Fallback (Criterio CE01).
  - 1 Diagrama Gantt de Cronograma de Hitos y dependencias técnicas.
- **Validación Sintáctica:** Revisión manual exhaustiva de sintaxis Mermaid (declaración explícita de actores/participantes, etiquetas con comillas sin caracteres ilegales, bloques `alt/else` correctamente emparejados y pares `activate/deactivate` balanceados).

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

### 4. Compilación de Protocol Buffers y Esquema GraphQL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **gRPC OK, GraphQL OK (código de salida 0).**

---

## Supuestos y decisiones tomadas

1. **Diagramas Mermaid Superando el Requisito Mínimo:**
   - Se diseñaron 8 diagramas en lugar del mínimo de 6 para abarcar tanto el mapa de contexto global y el cronograma Gantt como los 6 flujos de interacción críticos requeridos por el estándar RDA2.
2. **Representación de las 4 Tiendas Satélites:**
   - El documento modela detalladamente las 4 verticales externas (Atracciones - Descubre EC / Dilan, Autos - Partner Flota, Vuelos - GDS Flight Core / Alejo, Alojamientos - GDS Hoteles / Lizz) y el simulador interno de Pasarela de Pagos SOA.
3. **Mecanismo de Resiliencia CE01 (Circuit Breakers):**
   - Se documentó el comportamiento ante caídas de proveedores: timeout estricto de $\le 5000\text{ ms}$, apertura de circuito tras 3 fallos y mock fallback con bandera `CONFIRMED_FALLBACK` garantizando que la plataforma Booking nunca emita respuestas 500 ni se congele.
4. **Contratos de Datos Compartidos y Trazabilidad:**
   - Se estandarizaron los formatos canónicos: IDs con prefijos (`RES-ATR-...`, `ORD-AUT-...`, `EQ-7421`), código de pago `paymentReference` (`PAY-...`), correlación universal `correlation_id` (`cid-...`), marcas de tiempo ISO 8601 UTC y moneda base USD con 2 decimales.
5. **Tabla de Equivalencia de Eventos:**
   - Se incluyó la correspondencia unívoca entre los nombres de eventos semánticos de Booking (`order.confirmed`, `order.cancelled`, `stock.updated`, etc.) y las nomenclaturas particulares de cada tienda asociada.
6. **Desacoplamiento Absoluto de Persistencia y Logs (ADR-002 y ADR-003):**
   - Se ratifica que Booking almacena datos transaccionales en 12 esquemas independientes de Supabase PostgreSQL sin llaves foráneas cruzadas, y destina el 100% de la telemetría a Apache Kafka y logs técnicos a archivos físicos rotativos Winston (`logs/*.log`), con cero tablas de log en base de datos.

---

## Hallazgos registrados (IDs)

El plan de integración solventa y mitiga los riesgos derivados de los siguientes hallazgos de `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
* `H-P01-01`: Falta de Guards en `EsbController` mitigada mediante especificación de seguridad perimetral en el Gateway.
* `H-P01-04`: Falta de publicación en RabbitMQ mitigada con el flujo secuencial de la Saga y el `RabbitKafkaBridgeService`.
* `H-P09-01` y `H-P09-02`: Falta de verificación HMAC-SHA256 y bypass de webhooks mitigados mediante el diagrama secuencial 3.3 con middleware de firma y caché de desduplicación.
* `H-P02-01`: Falta de autenticación en pasarela mitigada con `SupabaseBearer` y clave administrativa `X-Admin-Key`.

---

## Dudas para el revisor

1. **Protocolo de Pruebas Conjuntas con Tiendas Externas:** Se recomienda acordar una ventana de pruebas de integración en vivo con los equipos de Vuelos, Autos, Alojamientos y Atracciones para validar la recepción de webhooks HMAC y la ingesta de stock por gRPC en el puerto `50051`.
