# Reporte P08 — Nodos, Telemetría e Inventario v2 (contrato OpenAPI)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/observabilidad-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 de observabilidad, monitor de nodos, semáforo LED, kill-switches, ingesta de telemetría, consultas REST de inventario gRPC inbound y diseño planificado de grafos de trazas. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P08-01 a H-P08-06 (kill-switch público desprotegido, rutas administrativas mutantes abiertas en `/nodes`, persistencia sincrónica de telemetría en Postgres vs Kafka, fragmentación de kill-switches, falta de rate limiting y endpoints de inventario sin autenticación). |
| `docs/RDA2/entregas/P08-reporte.md` | Creado | Reporte formal de entrega de la tarea P08. |

---

## Cobertura de rutas y clasificación (código vs contrato v2)

El contrato formaliza **15 rutas implementadas** en el backend más **1 ruta planificada** requerida por la cátedra para el monitor tipo grafo de observabilidad distribuida:

| Método | Ruta | Handler / Controlador | ¿Existe en código? | x-status | x-microservice | Propósito / Alcance |
|---|---|---|:---:|---|---|---|
| `GET` | `/nodes` | `NodesController.listarNodos` | **Sí** | `implemented` | `MS_PROV` | Consulta pública del catálogo de socios con semáforo LED (🟢/🟡/🔴) y latencia |
| `POST` | `/nodes` | `NodesController.crearNodoPublic` | **Sí** | `implemented` | `MS_PROV` | Registro de nuevos socios en `schema_proveedores.config_proveedor` |
| `PUT` | `/nodes/{codigoNodo}` | `NodesController.actualizarNodoPublic` | **Sí** | `implemented` | `MS_PROV` | Actualización de URLs de conexión REST/gRPC y contacto del nodo socio |
| `DELETE` | `/nodes/{codigoNodo}` | `NodesController.eliminarNodoPublic` | **Sí** | `implemented` | `MS_PROV` | Eliminación del registro del nodo proveedor en base de datos |
| `POST` | `/nodes/{codigoNodo}/ping` | `NodesController.pingNodoPublic` | **Sí** | `implemented` | `MS_PROV` | Sonda de diagnóstico HTTP con medición de latencia y timeout de 5 s |
| `POST` | `/nodes/{codigoNodo}/sync` | `NodesController.sincronizarCatalogoPublic` | **Sí** | `implemented` | `MS_PROV` | Sincronización e importación del catálogo remoto de atracciones a PostgreSQL |
| `POST` | `/nodes/{codigoNodo}/toggle` | `NodesController.toggleNodePublic` | **Sí** | `implemented` | `MS_PROV` | Conmutación del Kill-Switch del conector (Alerta: expuesto sin autenticación) |
| `GET` | `/admin/nodes` | `NodesController.listarNodosAdmin` | **Sí** | `implemented` | `MS_PROV` | Consulta protegida de nodos con RBAC (`ADMIN` / `X-Admin-Key`) |
| `PUT` | `/admin/nodes/{codigoNodo}` | `NodesController.actualizarNodo` | **Sí** | `implemented` | `MS_PROV` | Parametrización en vivo de URLs oficiales REST/gRPC por el Administrador (CE01) |
| `PATCH` | `/admin/nodes/{codigoNodo}` | `NodesController.parchearNodo` | **Sí** | `implemented` | `MS_PROV` | Modificación parcial protegida de parámetros de red del nodo |
| `POST` | `/admin/nodes/{codigoNodo}/toggle-killswitch` | `NodesController.toggleKillSwitch` | **Sí** | `implemented` | `MS_PROV` | Conmutación oficial protegida de Kill-Switch sincronizando BD y memoria |
| `POST` | `/admin/nodes/{codigoNodo}/ping` | `NodesController.pingNodo` | **Sí** | `implemented` | `MS_PROV` | Diagnóstico de latencia autenticado con rol `ADMIN` |
| `POST` | `/telemetry/events` | `TelemetryController.trackEvent` | **Sí** | `implemented` | `MS_AUD` | Ingesta de eventos de navegación y embudo de conversión del frontend |
| `GET` | `/inventory/status` | `InventoryGrpcController.getStatus` | **Sí** | `implemented` | `MS_STK` | Estado del socket listener gRPC en puerto 50051 y tamaño del registro |
| `GET` | `/inventory` | `InventoryGrpcController.getInventory` | **Sí** | `implemented` | `MS_STK` | Consulta REST del inventario y cupos en memoria sincronizados por gRPC |
| `GET` | `/observabilidad/trazas/{correlationId}` | n/a (Cátedra Semana 8) | **No** | `planned` | `MS_AUD` | Reconstrucción del grafo acíclico dirigido (DAG) de trazas para el monitor visual |

> **Gobernanza de endpoints en memoria:** Los endpoints `GET /admin/nodes/health`, `POST /admin/nodes/{serviceId}/toggle` y `POST /admin/nodes/{serviceId}/ping` implementados en `AdminController` corresponden al contrato [admin-openapi-v2.yaml](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) (P07) y fueron enlazados como referencias cruzadas.

---

## Reglas de Resiliencia, Semáforo y Circuit Breakers (ADR-006)

1. **Semáforo Visual de Conectividad LED (Panel 1):**
   - 🟢 **Verde (`HEALTHY`):** Latencia HTTP < 500 ms, tasa de fallos < 5%, Circuit Breaker `CLOSED`.
   - 🟡 **Amarillo (`DEGRADED`):** Latencia entre 500 ms y 2,000 ms, o tasa de fallos entre 5% y 50%.
   - 🔴 **Rojo (`DOWN`):** Latencia > 2,000 ms, error HTTP 5xx persistente o Circuit Breaker `OPEN`.
   - 🔴 **Rojo (`KILL_SWITCH_ACTIVE`):** Nodo apagado voluntariamente por el operador (`MANUALLY_OPEN`).
2. **Timeout Reglamentario de Red:**
   - Se verificó en `ConnectorHealthService` (líneas 257-258) y `NodesService` la aplicación de un timeout estricto de **5,000 ms (5 s)** en todas las llamadas de diagnóstico y transaccionales, impidiendo bloqueos indefinidos del Gateway.
3. **Mecanismo de Aislamiento y Fallback (Contingencia):**
   - Al conmutar el Kill-Switch de un nodo socio, el Gateway intercepta las llamadas de búsqueda y reserva hacia dicha vertical, respondiendo con catálogos cacheados localmente y confirmaciones en modo diferido (`CONFIRMED_FALLBACK` con flag `external_sync_pending: true`).

---

## Telemetría y Dualidad de Mensajería: RabbitMQ vs Apache Kafka (Cátedra Semana 8)

El contrato documenta la divergencia entre la implementación de código actual y la arquitectura objetivo establecida en la cátedra:

1. **Eventos Transaccionales (RabbitMQ):**
   - Operaciones críticas del ciclo de vida de la compra: `PedidoCreado`, `InventarioReservado`, `PagoProcesado` y sus respectivas compensaciones (`RestaurarInventario`, `ReembolsarPago`). RabbitMQ actúa como el broker autoritativo y transaccional con colas dedicadas y DLQs.
2. **Eventos de Telemetría y Analítica (Apache Kafka):**
   - El hook `useTelemetry` (`frontend/src/hooks/useTelemetry.js`) emite eventos del embudo de conversión: `search_submitted`, `checkout_started`, `form_step_completed`, `payment_started`, `payment_succeeded`, `payment_failed` y `booking_confirmed`.
   - **Hallazgo Arquitectónico H-P08-03:** En el código actual, `TelemetryService` almacena estos eventos ejecutando `INSERT` directo en la tabla `telemetry_events` de PostgreSQL. El contrato v2 define el esquema unificado `TelemetryEventDto` y documenta la necesidad de redirigir esta ingesta hacia particiones de Kafka para garantizar escalabilidad masiva sin saturar la base de datos relacional.

---

## Sincronización de Inventario gRPC Inbound y Mapeo Relacional

1. **Controlador Híbrido Inbound (`InventoryGrpcController`):**
   - Escucha RPCs binarias sobre HTTP/2 en el puerto `50051` (`PushStockUpdate` y `StreamInventoryChanges` definidas en `src/proto/inventory.proto`) y expone simultáneamente endpoints de monitoreo REST sobre HTTP/1.1 (`/inventory/status` y `/inventory`).
2. **Almacenamiento en Memoria y Replicación a Base de Datos:**
   - Las variaciones de inventario se asientan inmediatamente en el `stockRegistry` (Map en memoria para baja latencia) y se replican asincrónicamente a las tablas relacionales:
     - Vertical Autos: Actualiza `schema_autos.autos_catalogo` (`estado_operativo = 'DISPONIBLE' | 'RESERVADO'`).
     - Vertical Atracciones: Realiza un `UPSERT` en `schema_atracciones.atracciones_turnos_aforo` recalculando `cupos_disponibles` y `estado` (`DISPONIBLE`, `ULTIMOS_CUPOS`, `AGOTADO`).

---

## Diseño de la Ruta Planificada para el Dashboard de Trazas

Para dar cumplimiento al requerimiento docente de observabilidad en sistemas orientados a eventos (EDA):
* **Endpoint:** `GET /observabilidad/trazas/{correlationId}` (`x-status: planned`).
* **Propósito:** Reconstruir el grafo acíclico dirigido (DAG) de dependencias de una transacción completa a partir del `correlation_id` universal.
* **Estructura del Grafo:**
  - `nodes`: Representa los microservicios intervenidos (`MS_ESB`, `MS_VUE`, `MS_AUT`, `MS_PAG`, `MS_FAC`), con su estado (`SUCCESS` -> 🟢 Verde, `ERROR` -> 🔴 Rojo, `COMPENSATED` -> 🟡 Amarillo), latencia y marca de tiempo.
  - `edges`: Representa los canales de comunicación y transporte (`REST`, `GRPC`, `RABBITMQ_AMQP`, `KAFKA_STREAMING`), permitiendo visualizar el flujo asíncrono y los puntos de falla o compensación.

---

## Validación con Redocly CLI

```bash
npx --yes @redocly/cli@1 lint contracts/observabilidad-openapi-v2.yaml
```

**Resultado de la ejecución:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[0].url` (`http://localhost:3000/api/v2`), convención requerida para desarrollo local del proyecto.

---

## Supuestos y decisiones de diseño

1. **Distinción entre Nodos Persistidos y Nodos en Memoria:**
   - Se identificó que `NodesController` gestiona los socios registrados en la base de datos relacional (`schema_proveedores.config_proveedor`), mientras que `ConnectorHealthService` gestiona un mapa en memoria con 5 nodos (`atracciones`, `autos`, `alojamientos`, `vuelos`, `grpc_inventory`). El contrato documenta `NodesController` y formaliza la sincronización que `NodesService.toggleKillSwitch` efectúa sobre `ConnectorHealthService`.
2. **Mapeo del Semáforo Visual a Componentes OpenAPI:**
   - La propiedad calculada `semaforo_led` (`icono: '🟢' | '🟡' | '🔴'`, `estado: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'KILL_SWITCH_ACTIVE'`) se modeló explícitamente en el esquema `SemaforoLed` para garantizar compatibilidad con los componentes gráficos de React en `Panel1_NodosProveedores.jsx`.
3. **Manejo de Respuestas 4XX en Operaciones de Lectura:**
   - Conforme a las reglas de validación de Redocly (`operation-4xx-response`), se incluyó la respuesta estándar `429 Too Many Requests` (referenciada a `components-v2.yaml#/components/responses/Problem429`) en las consultas `GET /nodes`, `GET /inventory/status` y `GET /inventory`.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P08-01** | Alta | Kill-switch público sin autenticación en `POST /nodes/{codigoNodo}/toggle`: permite a usuarios anónimos desconectar tiendas externas de la plataforma. |
| **H-P08-02** | Alta | Operaciones administrativas de infraestructura expuestas públicamente en `/nodes` (`POST /nodes`, `PUT /nodes/:id`, `DELETE /nodes/:id`) sin protección RBAC. |
| **H-P08-03** | Media | Persistencia sincrónica de telemetría en PostgreSQL en lugar de streaming en Apache Kafka, generando riesgo de contención de I/O ante ráfagas de tráfico. |
| **H-P08-04** | Media | Tres implementaciones divergentes de Kill-Switches (`AdminController` vs `NodesController`), provocando fragmentación de estado entre memoria y base de datos. |
| **H-P08-05** | Baja | Ausencia de Rate Limiting y validación estricta de DTO en `POST /telemetry/events`. |
| **H-P08-06** | Baja | Endpoints REST de inventario gRPC (`GET /inventory`, `GET /inventory/status`) expuestos sin autenticación ni restricción de roles. |

---

## Dudas para el revisor

1. ¿Se autoriza depreciar definitivamente el endpoint público `POST /nodes/{codigoNodo}/toggle` para obligar al frontend a utilizar exclusivamente la ruta protegida `POST /admin/nodes/{codigoNodo}/toggle-killswitch`?
2. Para la ruta planificada del monitor tipo grafo `GET /observabilidad/trazas/{correlationId}`, ¿se consolidará la información leyendo los archivos físicos de Winston o se integrará un colector de OpenTelemetry / Jaeger?
