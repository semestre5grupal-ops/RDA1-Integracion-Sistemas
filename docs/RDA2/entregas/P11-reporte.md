# Reporte P11 — Eventos Asíncronos Duales v2 (contrato AsyncAPI 3.0)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/asyncapi-eventos-v2.yaml` | Creado | Contrato AsyncAPI 3.0.0 que formaliza la arquitectura orientada a eventos (EDA) dual de Booking: Topic Exchange en RabbitMQ (`booking.events`) y topics de streaming en Apache Kafka, puente dual (`KafkaRabbitBridgeService`), CloudEvents v1.0 y trazabilidad W3C. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P11-01 a H-P11-04 (desconexión entre `SagaOrchestratorService` y el Event Bus dual, divergencia de nombres de colas entre código y Blueprint §7, ausencia de consumidores activos en el Gateway, falta de W3C Trace Context en propiedades de cabecera AMQP). |
| `docs/RDA2/entregas/P11-reporte.md` | Creado | Reporte formal de entrega de la tarea P11. |

---

## Cobertura de Canales y Operaciones AsyncAPI 3.0

El contrato formaliza **10 canales de comunicación** (6 en RabbitMQ y 4 en Apache Kafka), divididos entre la topología implementada en el código y las especificaciones objetivo:

| Canal (Address) | Broker | Operación | x-status | x-microservice | Propósito / Alcance |
|---|---|---|:---:|---|---|
| `search.query` | RabbitMQ | `publishSearchQuery` (send) | `implemented` | `MS_ESB` | Amortiguamiento de búsquedas masivas de catálogo hacia `q.busquedas.masivas` |
| `stock.updated` | RabbitMQ | `publishStockUpdated` (send) | `implemented` | `MS_STK` | Distribución interna de variaciones de cupos desde el socket gRPC hacia `q.stock.actualizado` |
| `order.confirmed` | RabbitMQ | `publishOrderConfirmed` (send) | `implemented` | `MS_PAG` | Emisión autoritativa de órdenes confirmadas y pagos hacia `q.ordenes.confirmadas` |
| `saga.compensate` | RabbitMQ | `publishSagaCompensate` (send) | `implemented` | `MS_ESB` | Despacho de compensaciones LIFO hacia `q.sagas.compensacion` ante fallos de compra |
| `general.event` | RabbitMQ | `publishGeneralEvent` (send) | `implemented` | `MS_ESB` | Canal de amortiguamiento para eventos misceláneos de dominio |
| `q.dead_letter` | RabbitMQ | `consumeDeadLetter` (receive) | `implemented` | `MS_AUD` | Aislamiento e inspección de mensajes fallidos con reintentos agotados (DLQ) |
| `topic-catalogo-sync` | Apache Kafka | `publishKafkaCatalogoSync` (send) | `implemented` | `MS_STK` | Streaming B2B de deltas de catálogo particionado por vertical para analítica |
| `topic-ordenes-b2b` | Apache Kafka | `publishKafkaOrdenesB2b` (send) | `implemented` | `MS_FIN` | Commit Log inmutable de transacciones B2B particionado por `cliente_id` |
| `topic-auditoria-sagas` | Apache Kafka | `publishKafkaAuditoriaSagas` (send) | `implemented` | `MS_AUD` | Traza forense de ejecución y reversión de Sagas para el monitor tipo grafo |
| `booking.telemetry.events`| Apache Kafka | `publishKafkaTelemetryEvents` (send)| `planned` | `MS_AUD` | Ingesta en streaming masivo de eventos de navegación del frontend (Cátedra Semana 8) |

---

## Arquitectura Dual: RabbitMQ Transaccional vs Apache Kafka Analítico

Conforme al lineamiento de la Semana 8 y las Consideraciones RDA2:
1. **RabbitMQ (Broker Transaccional AMQP 0-9-1):**
   - Canal autoritativo y prioritario para los flujos que **no pueden fallar** ni perder mensajes: compras compuestas, confirmación de pagos, orquestación de Sagas y compensaciones automáticas.
   - Implementa acuse de recibo manual (`basicAck`), persistencia en disco (`delivery_mode: 2`) y enrutamiento por Topic Exchange (`booking.events`).
2. **Apache Kafka (Event Streaming & Commit Log Distribuido):**
   - Canal de alto rendimiento para flujos que requieren **escalabilidad masiva**: telemetría de navegación, analítica histórica, auditoría forense inmutable y capacidades de reprocesamiento (*replay* mediante offsets).
   - Desacoplado del ciclo de compra para garantizar que una saturación en la analítica no bloquee el checkout transaccional.

---

## El Puente Cruzado (`KafkaRabbitBridgeService`) y Trazabilidad

- El servicio `KafkaRabbitBridgeService` intercepta cada evento emitido en el Gateway y lo bifurca atómicamente:
  - Lo envía a la routing key adecuada de RabbitMQ (`search.query`, `stock.updated`, `order.confirmed`, `saga.compensate`).
  - Lo replica al tópico correspondiente de Apache Kafka (`topic-catalogo-sync`, `topic-ordenes-b2b`, `topic-auditoria-sagas`).
- **Preservación Invariable de Trazabilidad:** El puente propaga el `correlation_id`, `trace_id` (W3C `traceparent`) y `span_id` en las cabeceras de ambos brokers, garantizando la reconstrucción completa del grafo de dependencias en el monitor visual.
- **Resiliencia en Memoria (Fallback):** Si los brokers externos no están disponibles en tiempo de ejecución, ambos adaptadores capturan la contingencia y asientan el evento en la bitácora física forense de Winston con la etiqueta auditada `IN_MEMORY`.

---

## Matriz Comparativa: Vista Hoy (Código) vs Vista Objetivo (Blueprint §7)

| Característica / Dominio | Vista Hoy en Código (`src/modules/event-bus/`) | Vista Objetivo (`ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md` §7) | Acción Requerida para Convergencia |
|---|---|---|---|
| **Exchange RabbitMQ** | `booking.events` (Topic Exchange) | `booking.events.topic` (Topic Exchange) | Homologar nombre mediante alias en topología AMQP |
| **Cola Búsquedas** | `q.busquedas.masivas` (`search.*`) | `eventos.busquedas` (`busqueda.catalogo.*`, TTL 10s) | Configurar TTL de 10s en binding de RabbitMQ |
| **Cola Órdenes** | `q.ordenes.confirmadas` (`order.confirmed`) | `ordenes.confirmadas` (`orden.factura.confirmada`) | Unificar routing key canónica con prefijo de dominio |
| **Cola Sagas Compensación**| `q.sagas.compensacion` (`saga.compensate`) | `sagas.compensacion` (`saga.compensacion.trigger`) | Vincular listener automático de reversión en ESB |
| **Cola Stock Inbound** | `q.stock.actualizado` (`stock.updated`) | `stock.actualizado` (`stock.delta.notificacion`) | Conectar emisor gRPC `applyStockDelta` |
| **Cola Mensajes Muertos** | `q.dead_letter` | `booking.dlx` / `q.dead_letter` | Implementado en código y consistente con el blueprint |
| **Tópico Kafka Catálogo** | `topic-catalogo-sync` | `booking.catalogo.stream` (4 particiones por vertical) | Particionar por `vertical` (`vuelos`, `autos`, etc.) |
| **Tópico Kafka Órdenes** | `topic-ordenes-b2b` | `booking.compras.audit` (6 particiones por `cliente_id`) | Estandarizar retención de 7 días con compactación |
| **Tópico Kafka Auditoría** | `topic-auditoria-sagas` | `booking.compras.audit` / `schema_auditoria` | Integrar journal de pasos de `SagaOrchestratorService` |
| **Telemetría Frontend** | Tabla PostgreSQL `telemetry_events` | Tópico Kafka `booking.telemetria.nodes` | Migrar `TelemetryService` para emitir a Kafka (H-P08-03) |

---

## Catálogo de Eventos del Ciclo de Vida de Sagas

| Nombre Semántico del Evento | Canal RabbitMQ | Tópico Kafka | Emisor | Estado en Código | Significado Transaccional |
|---|---|---|---|:---:|---|
| `saga.started` | `general.event` | `topic-auditoria-sagas` | `MS_ESB` | `planned` | Inicio de checkout multidominio con desglose de ítems |
| `saga.step.completed` | `general.event` | `topic-auditoria-sagas` | `MS_ESB` | `planned` | Reserva exitosa de un ítem individual en tienda socia |
| `saga.step.failed` | `saga.compensate` | `topic-auditoria-sagas` | `MS_ESB` | `planned` | Falla o agotamiento de cupo en un paso intermedio |
| `saga.compensating` | `saga.compensate` | `topic-auditoria-sagas` | `MS_ESB` | `implemented` | Disparo de compensaciones en orden inverso (LIFO) |
| `saga.compensated` | `saga.compensate` | `topic-auditoria-sagas` | `MS_ESB` | `implemented` | Reintegro exitoso de cupos y reembolso completado |
| `saga.completed` | `order.confirmed` | `topic-ordenes-b2b` | `MS_ESB` | `implemented` | Compra finalizada exitosamente y factura emitida |

---

## Validación con AsyncAPI CLI

```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```

**Resultado de la ejecución:**
- **0 errores** (`File contracts/asyncapi-eventos-v2.yaml is valid`).
- **0 warnings**.
- **1 aviso informativo de versión:** AsyncAPI CLI sugiere opcionalmente actualizar a la versión minor `3.1.0` (actualmente `3.0.0` conforme a la especificación de la tarea).

---

## Supuestos y decisiones de diseño

1. **Alineación con AsyncAPI 3.0.0:**
   - Se estructuraron los canales bajo la especificación 3.0, separando las definiciones de `channels` (direcciones y metadatos de transporte) de las `operations` (`send` / `receive`), asegurando compatibilidad completa con herramientas de validación de última generación.
2. **Corrección de Bindings AMQP:**
   - La especificación de AMQP 0-9-1 exige que cuando un canal se define como routing key (`is: routingKey`), la propiedad `queue` no debe estar presente en el binding del canal. Se adaptaron los bindings respetando esta regla normativa.
3. **Persistencia de Trazabilidad en Envoltorios de Mensajes:**
   - Se diseñó el esquema `KafkaRecordEnvelope` y los payloads de RabbitMQ para que contengan invariablemente los campos `correlation_id`, `traceparent` y marcas de tiempo ISO 8601 UTC.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P11-01** | Media | Desconexión entre `SagaOrchestratorService` y el Event Bus dual: las Sagas no emiten eventos hacia RabbitMQ ni Kafka durante sus transiciones de estado. |
| **H-P11-02** | Media | Divergencia de nomenclatura de colas y tópicos entre el código (`q.*`, `topic-*`) y el Blueprint de arquitectura (§7.2/§7.3). |
| **H-P11-03** | Baja | Ausencia de consumidores activos para las colas de RabbitMQ en el Gateway central (`channel.consume()`). |
| **H-P11-04** | Baja | Falta de propagación de W3C Trace Context en las propiedades nativas de cabecera AMQP (`properties.headers`). |

---

## Dudas para el revisor

1. ¿Se aprueba unificar en la fase de implementación los nombres de colas de RabbitMQ para adoptar directamente la convención del Blueprint (`eventos.busquedas`, `ordenes.confirmadas`, `stock.actualizado`, `sagas.compensacion`)?
2. Para los eventos de Sagas, ¿se prefiere que `SagaOrchestratorService` publique mediante `KafkaRabbitBridgeService` o que se configure un listener que lea los cambios de estado en `schema_auditoria.saga_paso_journal`?
