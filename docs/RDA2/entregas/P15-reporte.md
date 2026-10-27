# Reporte P15 — Parche vuelos v2.0.1

## Archivos creados o modificados
- `contracts/vuelos-openapi-v2.yaml`
- `contracts/README-vuelos-v2.md`
- `docs/RDA2/HALLAZGOS_CONTRATOS.md` (hallazgo H-P15-01)
- `docs/RDA2/entregas/P15-reporte.md`

## Cobertura de rutas (controlador vs contrato)
| Método | Ruta | Handler | En el contrato | x-status |
|---|---|---|---|---|
| POST | `/vuelos/search` | `searchFlights` | Sí | implemented |
| POST | `/vuelos/offers/hold` | `createHold` | Sí | implemented |
| GET | `/vuelos/offers/hold/{holdId}` | `getHoldStatus` | Sí | implemented |
| DELETE | `/vuelos/offers/hold/{holdId}` | `deleteHold` | Sí | implemented |
| POST | `/vuelos/bookings` | `createBooking` | Sí | implemented |
| GET | `/vuelos/offers/{offerId}/seatmap` | `getSeatMap` | Sí | implemented |
| GET | `/vuelos/bookings` | `listarReservas` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}` | `obtenerReserva` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}/tickets` | `listarTickets` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/tickets` | `emitirTickets` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}/tickets/{ticketId}` | `obtenerTicket` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}/boarding-passes` | `listarPases` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/date-change/search` | `buscarCambioFecha` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/date-change` | `confirmarCambioFecha` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}/baggage-options` | `opcionesEquipaje` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/check-in` | `checkIn` | Sí | implemented |
| GET | `/vuelos/bookings/{bookingId}/cancellation-quote` | `cotizarCancelacion` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/cancel` | `cancelar` | Sí | implemented |
| POST | `/vuelos/bookings/{bookingId}/baggage` | `agregarEquipaje` | Sí | implemented |
| GET | `/vuelos/flights/{flightNumber}/status` | `estadoVuelo` | Sí | implemented |
| GET | `/vuelos/webhooks` | `listarWebhooks` | Sí | implemented |
| POST | `/vuelos/webhooks` | `crearWebhook` | Sí | implemented |
| DELETE | `/vuelos/webhooks/{id}` | `eliminarWebhook` | Sí | implemented |

El contrato mantiene 7 operaciones `planned` sin handler en el controlador: `GET /vuelos/health`, `GET /vuelos/eventos`,
`GET` y `PUT /vuelos/promociones/contrato`, `PATCH /vuelos/flights/{flightNumber}/status`,
`GET /vuelos/operaciones/vuelos` y `PUT /vuelos/bookings/{bookingId}/seats`.
La operación callback `deliverFlightEvent` describe la entrega al suscriptor (no es una ruta del controlador) y también
se marca `planned`.

## Validación (comando y resultado resumido)
- `npx --yes @redocly/cli@1 lint contracts/vuelos-openapi-v2.yaml` — válido, **0 errores y 5 warnings**.
- Warnings: falta `info.license.url`; servidor local `localhost`; ambigüedad entre `/vuelos/offers/{offerId}/seatmap` y `/vuelos/offers/hold/{holdId}`; respuesta sin 4XX en `/vuelos/health`; callback webhook sin 4XX.

### Diff compatible de 2.0.0 a 2.0.1
El diff completo del contrato confirma cambios de redacción y metadatos, parámetros y atributos opcionales, sin eliminar ni renombrar operaciones o campos, sin cambios de tipos y sin cambios de seguridad.

```diff
--- a/contracts/vuelos-openapi-v2.yaml
+++ b/contracts/vuelos-openapi-v2.yaml
@@ -4 +4 @@ info:
-  version: 2.0.0
+  version: 2.0.1
@@ -85,5 +85,6 @@ info:
-       * **RabbitMQ:** propiedad AMQP `correlation_id` + atributo `correlationid` del CloudEvent.
-       * **Kafka:** header `correlationid` + atributo del CloudEvent.
-    4. Cada servicio registra cada paso con `correlation_id`, `request_id`, `service`, `operation`, `status`, `latency_ms`,
-       `timestamp` (en Booking: tabla `api_request_logs`). Reconstruir el proceso es:
-       `SELECT * FROM api_request_logs WHERE correlation_id = 'corr-123' ORDER BY timestamp;`
+       * **RabbitMQ:** propiedad AMQP `correlation_id` + atributos `correlationid` y `traceparent` del CloudEvent.
+       * **Kafka:** solo réplica posterior al acuse de RabbitMQ mediante `RabbitKafkaBridgeService` de Booking; conserva
+         `correlation_id`, `trace_id` y `span_id` en los headers.
+    4. Cada servicio registra cada paso en archivos JSON Lines (`logs/<servicio>/YYYY-MM-DD.jsonl`) con los campos
+       `timestamp`, `level`, `service`, `correlation_id`, `trace_id`, `span_id`, `node_id`, `event`, `message` y
+       `duration_ms`, conforme a `LogEstructurado` de P00. No se almacenan logs de petición en base de datos.
@@ -96 +97 @@ info:
-    | **Bus de eventos** (asíncrono) | Notificar **hechos ya ocurridos** sin acoplarse | CloudEvents vía webhooks a Booking y RabbitMQ/Kafka (§8) |
+    | **Bus de eventos** (asíncrono) | Notificar **hechos ya ocurridos** sin acoplarse | CloudEvents vía webhooks; RabbitMQ autoritativo y Kafka como réplica (§8) |
@@ -113 +114,2 @@ info:
-    * `type` = `ec.edu.epn.booking.vuelos.<evento>` · `source` = `/aerolineas/{codigo}/vuelos` · extensión `correlationid`.
+    * `type` = `ec.edu.epn.booking.vuelos.<evento>` · `source` = `/aerolineas/{codigo}/vuelos` · extensiones `correlationid`,
+      `traceparent` y `node_id` (las dos últimas opcionales).
@@ -115,2 +117,5 @@ info:
-    * **Bus interno opcional del ecosistema:** RabbitMQ exchange `booking.events` (routing key `vuelos.<evento>`) y
-      Kafka topic `topic-ordenes-b2b` (key = `bookingId`).
+    * **Mensajería transaccional:** RabbitMQ exchange `booking.events` (routing key `vuelos.<evento>`) es el canal
+      autoritativo para transacciones, sagas y compensaciones. Tras el acuse de RabbitMQ, el puente
+      `RabbitKafkaBridgeService` de Booking puede replicar los eventos a Kafka para auditoría y telemetría
+      (topic `topic-ordenes-b2b`, key = `bookingId`), conservando `correlation_id`, `trace_id` y `span_id`.
+      Kafka no decide ni completa compras, pagos o compensaciones.
@@ -215,0 +221,6 @@ info:
+
+    ## 14. Cambios de v2.0.1 (compatibles)
+    * Los logs técnicos pasan a archivos JSON Lines según `LogEstructurado` de P00; no se guardan logs de petición en BD.
+    * RabbitMQ queda documentado como canal autoritativo; Kafka solo recibe réplicas del puente de Booking.
+    * Se añaden los encabezados opcionales `traceparent` y `node_id`, y las extensiones opcionales homónimas de CloudEvents.
+    * Se documenta la propagación de `correlation_id`, `trace_id` y `span_id` en la réplica Kafka.
@@ -280,0 +292,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -288,0 +302,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -309,0 +325,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -318,0 +336,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -359,0 +379,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -366,0 +388,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -383,0 +407,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -394,0 +420,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -436,0 +464,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#searchFlights
+      x-status: implemented
@@ -444,0 +474,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -475,0 +507,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#getSeatMap
+      x-status: implemented
@@ -487,0 +521,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -508,0 +544,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#estadoVuelo
+      x-status: implemented
@@ -521,0 +559,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -536,0 +576,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -548,0 +590,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -585,0 +629,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -595,0 +641,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -651,0 +699,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#createHold
+      x-status: implemented
@@ -663,0 +713,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -710,0 +762,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#getHoldStatus
+      x-status: implemented
@@ -717,0 +771,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -735,0 +791,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#deleteHold
+      x-status: implemented
@@ -746,0 +804,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -767,0 +827,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#listarReservas
+      x-status: implemented
@@ -774,0 +836,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -812,0 +876,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#createBooking
+      x-status: implemented
@@ -826,0 +892,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -884,0 +952,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#obtenerReserva
+      x-status: implemented
@@ -891,0 +961,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -912,0 +984,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#emitirTickets
+      x-status: implemented
@@ -924,0 +998,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -948,0 +1024,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#listarTickets
+      x-status: implemented
@@ -955,0 +1033,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -975,0 +1055,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#obtenerTicket
+      x-status: implemented
@@ -990,0 +1072,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1013,0 +1097,2 @@ paths:
+      x-source: n/a
+      x-status: planned
@@ -1027,0 +1113,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1059,0 +1147,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#checkIn
+      x-status: implemented
@@ -1070,0 +1160,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1096,0 +1188,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#listarPases
+      x-status: implemented
@@ -1103,0 +1197,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1128,0 +1224,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#opcionesEquipaje
+      x-status: implemented
@@ -1135,0 +1233,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1155,0 +1255,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#agregarEquipaje
+      x-status: implemented
@@ -1164,0 +1266,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1201,0 +1305,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#buscarCambioFecha
+      x-status: implemented
@@ -1208,0 +1314,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1238,0 +1346,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#confirmarCambioFecha
+      x-status: implemented
@@ -1249,0 +1359,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1292,0 +1404,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#cotizarCancelacion
+      x-status: implemented
@@ -1300,0 +1414,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1322,0 +1438,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#cancelar
+      x-status: implemented
@@ -1336,0 +1454,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1380,0 +1500,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#listarWebhooks
+      x-status: implemented
@@ -1386,0 +1508,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1403,0 +1527,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#crearWebhook
+      x-status: implemented
@@ -1414,0 +1540,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1425,0 +1553,3 @@ paths:
+              operationId: deliverFlightEvent
+              x-source: n/a
+              x-status: planned
@@ -1433,0 +1564,2 @@ paths:
+                - $ref: '#/components/parameters/Traceparent'
+                - $ref: '#/components/parameters/NodeId'
@@ -1468,0 +1601,2 @@ paths:
+      x-source: src/modules/vuelos/vuelos.controller.ts#eliminarWebhook
+      x-status: implemented
@@ -1480,0 +1615,2 @@ paths:
+        - $ref: '#/components/parameters/Traceparent'
+        - $ref: '#/components/parameters/NodeId'
@@ -1524,0 +1661,17 @@ components:
+    Traceparent:
+      name: traceparent
+      in: header
+      required: false
+      description: Contexto de traza W3C Trace Context propagado sin modificaciones.
+      schema:
+        type: string
+        pattern: ^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$
+      example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
+    NodeId:
+      name: node_id
+      in: header
+      required: false
+      description: Identificador del nodo que procesa la petición.
+      schema:
+        type: string
+      example: NODE_VUE_ECOAIRLINES
@@ -3304,0 +3458,9 @@ components:
+        traceparent:
+          type: string
+          description: Extensión opcional W3C Trace Context para propagar la traza distribuida.
+          pattern: ^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$
+          example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
+        node_id:
+          type: string
+          description: Extensión opcional que identifica el nodo emisor del evento.
+          example: NODE_VUE_ECOAIRLINES

```

## Supuestos y decisiones tomadas
- Se mantuvieron las rutas, parámetros, campos, tipos, modelo de pagos, ventana de check-in de 48 h y seguridad de dos capas.
- `traceparent` y `node_id` son opcionales tanto en encabezados HTTP como en CloudEvents; ninguno se agregó a `required`.
- `x-source` y `x-status` documentan el controlador actual; las 7 operaciones sin handler se marcan `planned` con `x-source: n/a`.

## Hallazgos registrados (IDs)
- H-P15-01

## Dudas para el revisor
- El contrato conserva la autenticación OAuth2 del partner según el alcance de P15. H-P15-01 deja constancia de que el controlador actual no aplica un guard de autenticación.
