# Reporte P09 — Receptor de Webhooks de las Tiendas v2 (contrato OpenAPI, diseño)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/webhooks-inbound-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del receptor inbound de webhooks de las cuatro tiendas externas (`vuelos`, `autos`, `atracciones`, `alojamientos`), con validación criptográfica HMAC-SHA256, CloudEvents v1.0, idempotencia y consulta de auditoría de entregas (todo `x-status: planned`). |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P09-01 a H-P09-04 (inexistencia de receptor de webhooks en Booking, falta de persistencia de secretos por proveedor en `schema_proveedores`, heterogeneidad de nombres CloudEvents entre tiendas y ausencia de cabecera `Idempotent-Replayed`). |
| `docs/RDA2/entregas/P09-reporte.md` | Creado | Reporte formal de entrega de la tarea P09. |

---

## Cobertura de rutas y clasificación (código vs contrato v2)

Actualmente Booking **no tiene** implementado un receptor de webhooks en el backend NestJS (Hallazgo H-P09-01). Por ende, las dos operaciones diseñadas se clasifican formalmente como `planned`:

| Método | Ruta | Handler / Controlador | ¿Existe en código? | x-status | x-microservice | Propósito / Alcance |
|---|---|---|:---:|---|---|---|
| `POST` | `/webhooks/{vertical}` | n/a (diseñado) | **No** | `planned` | `MS_AUD` | Receptor universal de CloudEvents por vertical con validación HMAC-SHA256 y respuesta 202 en < 1s |
| `GET` | `/webhooks/{vertical}/entregas` | n/a (diseñado) | **No** | `planned` | `MS_AUD` | Consulta administrativa de entregas recibidas, firmas, estados de validación y correlaciones |

---

## Protocolo Criptográfico de Autenticidad (HMAC-SHA256)

Para proteger al Gateway central de ataques de spoofing e inyección de eventos fraudulentos:
1. **Cabecera Requerida:** `X-Webhook-Signature: sha256=<hex_digest_64>`.
2. **Cálculo de la Firma:** Se genera aplicando HMAC con función de dispersión SHA-256 sobre el cuerpo **crudo** (raw body sin parsear) de la petición HTTP, utilizando el secreto compartido exclusivo del socio (`webhook_secret`):
   ```javascript
   // Ejemplo en Node.js / NestJS
   const crypto = require('crypto');
   const rawBody = req.rawBody; // Buffer UTF-8
   const signatureHeader = req.headers['x-webhook-signature']; // sha256=...
   const expectedSignature = 'sha256=' + crypto
     .createHmac('sha256', proveedor.webhook_secret)
     .update(rawBody)
     .digest('hex');

   const isValid = crypto.timingSafeEqual(
     Buffer.from(signatureHeader),
     Buffer.from(expectedSignature)
   );
   ```
3. **Manejo de Errores:** Si la cabecera no se envía, tiene un formato incorrecto o el hash difiere, el servidor responde inmediatamente **HTTP 401 Unauthorized** (`ProblemDetails`) y registra el incidente en `logs/audit-YYYY-MM-DD.log`.

---

## Estándar de Mensajes: CloudEvents v1.0

Todo payload inbound debe cumplir con la especificación estructurada CloudEvents v1.0 (`application/cloudevents+json`), extendido con los atributos de trazabilidad definidos en `contracts/common/components-v2.yaml#/components/schemas/CloudEventBase`:
- `specversion`: `"1.0"`.
- `id`: UUID v4 unívoco generado por la tienda emisora.
- `source`: URI que identifica al microservicio emisor (ej. `https://vuelos.booking.epn.edu.ec`).
- `type`: Nombre del evento de dominio (ej. `ec.edu.epn.booking.vuelos.booking.ticket_issued`).
- `time`: Timestamp UTC en formato ISO 8601 (`2026-10-24T22:30:00.000Z`).
- `datacontenttype`: `"application/json"`.
- `correlationid`: Identificador universal del proceso de negocio (`corr-*` o UUID).
- `traceparent`: Contexto W3C Trace Context (`00-<32hex>-<16hex>-<2hex>`).
- `data`: Objeto con la información transaccional específica de la tienda.

---

## Idempotencia y SLA de Respuesta Rápida (< 1 s)

1. **Deduplicación por `id`:** El receptor consulta la existencia previa del atributo `id` del evento en caché o base de datos. Si el evento ya fue aceptado o procesado, responde **HTTP 200 OK** con la cabecera `Idempotent-Replayed: true`, cortando el procesamiento posterior.
2. **Respuesta Asíncrona Inmediata (HTTP 202 Accepted):** Para no provocar reintentos accidentales por timeouts en los workers emisores, Booking no ejecuta la lógica de negocio sincrónicamente. Valida la firma criptográfica, almacena la entrega y encola el evento en RabbitMQ (`booking.webhooks.inbound.{vertical}`), respondiendo en menos de 1,000 ms.

---

## Matriz de Reacciones de Booking ante Eventos de Dominio

| Evento Recibido | Vertical | Reacción de Booking en el Ecosistema | Estado en Booking |
|---|---|---|:---:|
| `booking.ticket_issued` | Vuelos | Confirmar orden multivertical, emitir comprobante y disparar orquestación de facturación (`MS_FAC`) | `planned` |
| `flight.status_changed` | Vuelos | Notificar al cliente; si el retraso excede 4 horas, ajustar automáticamente los horarios de recogida de autos y check-in en hotel | `planned` |
| `flight.cancelled` | Vuelos | Disparar Saga compensatoria LIFO: reembolsar vuelo y cancelar las reservas asociadas de hotel y auto | `planned` |
| `hold.expired` | Vuelos | Liberar el bloqueo temporal de cupos y remover el ítem del carrito de compras (`MS_CAR`) | `planned` |
| `auto.order.confirmed` | Autos | Enlazar el código QR y localizador PNR al expediente consolidado y asentar pasivo en finanzas (`MS_FIN`) | `planned` |
| `auto.order.cancelled` | Autos | Reversar el cobro en pasarela (`MS_PAG`) y actualizar la liquidación quincenal del socio proveedor | `planned` |
| `auto.cleaning.cooldown.started` | Autos | Ocultar inmediatamente el vehículo de las búsquedas públicas durante las 2 horas de enfriamiento | `planned` |
| `auto.mantenimiento.alerta` | Autos | Publicar alerta en el Panel 1 de Administración para retiro preventivo del vehículo en inventario | `planned` |
| `atraccion.order.confirmed` | Atracciones | Generar voucher digital para check-in presencial con guía turístico | `planned` |
| `atraccion.order.cancelled` | Atracciones | Reintegrar cupos al aforo del turno en `schema_atracciones.turnos_aforo` y autorizar reembolso | `planned` |
| `hotel.order.confirmed` | Alojamientos | Bloquear habitación en inventario local y emitir voucher de confirmación de estancia | `planned` |
| `hotel.order.cancelled` | Alojamientos | Liberar fechas en el calendario y liquidar penalidades según política de cancelación | `planned` |

---

## Tabla de Equivalencias de Eventos entre Verticales

| Concepto Canónico de Negocio | Vuelos (`vuelos-openapi-v2.yaml`) | Autos (`autos-openapi-v2.yaml`) | Atracciones (`atracciones-openapi-v2.yaml`) | Alojamientos (`alojamientos-openapi.yaml`) |
|---|---|---|---|---|
| **Reserva Confirmada** | `booking.confirmed`<br>`booking.ticket_issued` | `auto.order.confirmed` | `atraccion.order.confirmed` | `hotel.order.confirmed` |
| **Cancelación / Reversión** | `booking.cancelled` | `auto.order.cancelled` | `atraccion.order.cancelled` | `hotel.order.cancelled` |
| **Expiración de Bloqueo** | `hold.expired` | n/a (reserva directa) | `atraccion.hold.expired` | `hotel.hold.expired` |
| **Alerta Operativa / Falla**| `flight.status_changed`<br>`flight.cancelled` | `auto.mantenimiento.alerta` | `atraccion.aforo.agotado` | `hotel.room.unavailable` |
| **Transición de Estado** | `booking.checked_in` | `auto.cleaning.cooldown.started` | `atraccion.checked_in` | `hotel.guest.checked_in` |

---

## Reintentos del Emisor y Respaldo Outbox

1. **Backoff Exponencial:** Los emisores aplicarán la política reglamentaria especificada en `vuelos-openapi-v2.yaml`:
   - 1er reintento: a 1 minuto.
   - 2do reintento: a 5 minutos.
   - 3er reintento: a 30 minutos.
   - 4to reintento: a 2 horas.
   - 5to reintento: a 6 horas.
2. **Respaldo Outbox:** Si el webhook falla tras agotar los 5 intentos, el evento permanece disponible en el endpoint Outbox del microservicio socio (`GET /{vertical}/eventos`), permitiendo que el worker de reconciliación de Booking recupere eventos no entregados mediante sondeo periódico.

---

## Registro de Suscripciones y Persistencia de Secretos

Para que las tiendas conozcan a dónde enviar las notificaciones:
1. **Suscripción Programática:** Booking invoca el endpoint de suscripción de la tienda (`POST /{vertical}/webhooks`) indicando:
   - `url`: `https://rda1-backend-integracion-sistemas.onrender.com/api/v2/webhooks/{vertical}`.
   - `events`: Listado de tipos de evento requeridos.
   - `secret`: Clave criptográfica aleatoria de 32 bytes generada por Booking.
2. **Propuesta DDL en Base de Datos (Hallazgo H-P09-02):**
   Actualmente `schema_proveedores.config_proveedor` no posee columnas para secretos. Se propone la siguiente migración SQL:
   ```sql
   ALTER TABLE schema_proveedores.config_proveedor
     ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(120),
     ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(255),
     ADD COLUMN IF NOT EXISTS webhook_activo BOOLEAN DEFAULT true;
   ```

---

## Validación con Redocly CLI

```bash
npx --yes @redocly/cli@1 lint contracts/webhooks-inbound-openapi-v2.yaml
```

**Resultado de la ejecución:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[0].url` (`http://localhost:3000/api/v2`), requerido para pruebas locales.

---

## Supuestos y decisiones de diseño

1. **Receptor Diseñado bajo `x-status: planned`:**
   - La inspección del código fuente reveló que no existe ningún endpoint para recepción de webhooks en Booking. Conforme a las reglas de la cátedra, todo el contrato se diseñó formalmente como `planned` con `x-source: n/a`.
2. **Firma HMAC en Cabecera `X-Webhook-Signature`:**
   - Se adoptó el estándar de firma de `contracts/vuelos-openapi-v2.yaml` (`sha256=<hex>`), que coincide con las prácticas de la industria (GitHub, Stripe, Shopify).
3. **Desacoplamiento Asíncrono con HTTP 202 Accepted:**
   - Para garantizar que el webhook responda en menos de 1 segundo, la recepción solo efectúa la verificación criptográfica y deduplicación, delegando el procesamiento pesado al broker RabbitMQ.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P09-01** | Alta | Inexistencia de receptor de webhooks inbound en Booking, dejando al agregador ciego ante eventos asíncronos de las tiendas. |
| **H-P09-02** | Alta | Ausencia de almacenamiento para el secreto compartido (`webhook_secret`) en la entidad `ConfigProveedor` de `schema_proveedores`. |
| **H-P09-03** | Media | Heterogeneidad y discrepancia semántica en nombres de eventos CloudEvents entre las verticales socias. |
| **H-P09-04** | Baja | Ausencia de cabecera HTTP estándar `Idempotent-Replayed: true` en el backend para distinguir eventos deduplicados. |

---

## Dudas para el revisor

1. ¿Se aprueba ejecutar la migración DDL en `schema_proveedores.config_proveedor` para incorporar los campos `webhook_secret`, `webhook_url` y `webhook_activo` en la siguiente fase de implementación?
2. Para el procesamiento asíncrono tras el `HTTP 202 Accepted`, ¿se utilizará un exchange de RabbitMQ por cada vertical (`booking.webhooks.vuelos`, `booking.webhooks.autos`, etc.) o un exchange común con routing key (`booking.webhooks.{vertical}`)?
