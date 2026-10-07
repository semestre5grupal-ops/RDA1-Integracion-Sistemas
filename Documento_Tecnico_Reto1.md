# Documento Técnico — Reto 1: Booking Prototipo (API-First)

**Versión:** 1.1.0  
**Fecha:** 2026-10-07  
**Asignatura:** Integración de Sistemas  
**Equipo:** Semestre 5 Grupal  
**URL Producción (Frontend):** https://rda1-integracion-sistemas.vercel.app  
**URL Producción (Backend):** https://rda1-integracion-sistemas.onrender.com  
**Documentación Swagger:** `{backend_url}/api/docs`

---

## 1. Arquitectura del Sistema

### 1.1 Visión General — Patrón Cliente-Servidor y BFF Integrador

El sistema sigue una arquitectura **Cliente-Servidor estrictamente desacoplada**, donde el frontend y el backend son sistemas independientes que se comunican únicamente a través de la API REST documentada. Adicionalmente, las verticales como **Alojamientos** implementan el patrón **BFF (Backend For Frontend) e Integrador de Catálogos**, exponiendo contratos homologados con estándares GDS Core para búsqueda, cotización dinámica, emisión idempotente de órdenes y despacho de eventos asíncronos.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Cliente)                             │
│                   React 18 + Vite — Vercel                              │
│                                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │Alojamientos│  │   Vuelos   │  │   Autos    │  │  Atracciones   │   │
│  │   (SPA)    │  │   (SPA)    │  │   (SPA)    │  │    (SPA)       │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘   │
│                                                                         │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  AdminDashboard│  │ MisReservas  │  │ Auth (Supabase Client)   │   │
│  └────────────────┘  └──────────────┘  └──────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP REST / JSON
                                    │ Bearer JWT (Supabase)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Servidor)                              │
│             NestJS (Node.js) — Render                                   │
│                                                                         │
│  Prefijo global: /api/v1                                                │
│                                                                         │
│  ┌───────────────────────── Middleware Global ───────────────────────┐  │
│  │  ValidationPipe (whitelist + forbidNonWhitelisted)                │  │
│  │  Rfc7807ExceptionFilter  (application/problem+json)               │  │
│  │  HateoasInterceptor      (Richardson Level 3: _links en JSON)     │  │
│  │  CORS configurado para Vercel y Render                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  /vuelos     │  │/alojamientos │  │   /autos     │  │/atraccione│  │
│  │  VuelosModule│  │ AlojModule   │  │  AutosModule │  │AtracModule │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  /chatbot    │  │  /facturas   │  │  /admin      │  │/telemetry │  │
│  │  ChatbotMod. │  │  FactMod.    │  │  AdminModule │  │TelemetryM.│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                                         │
│  ┌──────────────────── Capa de Datos (ORM) ────────────────────────┐   │
│  │  TypeORM  →  PostgreSQL (Supabase)                               │   │
│  │  Entidades: Reserva, Vuelo, Segmento, Boleto, Pasajero, Auto,   │   │
│  │             Atraccion, Alojamiento, ReservaAlojamiento,         │   │
│  │             ResenaAlojamiento, WebhookAlojamiento, Factura...   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │   Supabase (PostgreSQL)   │
                    │   + Auth (JWT/RLS)        │
                    └───────────────────────────┘
```

### 1.2 Restricciones REST Implementadas

| Restricción | Implementación Concreta |
|---|---|
| **Cliente-Servidor** | Separación total: frontend en Vercel (React), backend en Render (NestJS). Comunicación exclusiva por HTTP REST. |
| **Stateless** | Autenticación mediante JWT de Supabase. El servidor no guarda estado de sesión. Cada request es auto-contenida. |
| **Cacheable** | `CacheModule` + `CacheInterceptor` de `@nestjs/cache-manager` aplicado en módulos de Atracciones, Alojamientos, Autos y Chatbot con TTL configurable (5s a 60s). |
| **Interfaz Uniforme** | Uso correcto de verbos HTTP (GET, POST, PUT, PATCH, DELETE). URIs con sustantivos en plural. Prefijo global `/api/v1`. Respuestas estandarizadas con hipermedios HATEOAS. |
| **Sistema en Capas** | CORS configurado para proxies y gateways intermedios. Soporte de cabeceras `Authorization`, `Idempotency-Key`, `X-Device-Fingerprint`. |

### 1.3 Nivel 3 de Madurez Richardson (HATEOAS)

Implementado mediante el `HateoasInterceptor` global (`src/core/interceptors/hateoas.interceptor.ts`), que inyecta automáticamente hipervínculos `_links` en las respuestas JSON:

```json
{
  "bookingId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "pnr": "AB1234",
  "_links": {
    "self":    { "href": "/api/v1/vuelos/bookings/{bookingId}", "method": "GET" },
    "tickets": { "href": "/api/v1/vuelos/bookings/{bookingId}/tickets", "method": "GET" },
    "cancel":  { "href": "/api/v1/vuelos/bookings/{bookingId}/cancel", "method": "POST" },
    "checkin": { "href": "/api/v1/vuelos/bookings/{bookingId}/check-in", "method": "POST" }
  }
}
```

En el módulo de Alojamientos, las entidades devueltas en `GET /alojamientos/:id` incorporan hipervínculos hacia disponibilidad, reseñas, cotización de órdenes y cancelación de reservas.

### 1.4 Patrón Wrapper (REST ↔ SOAP)

Implementado en `src/modules/atracciones/soap-wrapper.service.ts`. Cuando el módulo de Atracciones confirma una reserva, traduce el payload JSON a un Envelope SOAP y "envía" la petición a un sistema legado CML:

```
Frontend → REST/JSON → [Backend NestJS] → SOAP/XML → [Sistema Legado CML]
                                         ← JSON ←    ← XML ←
```

### 1.5 Manejo de Errores RFC 7807 (Problem Details)

El `Rfc7807ExceptionFilter` intercepta todas las excepciones globalmente y devuelve el formato estándar con `Content-Type: application/problem+json`:

```json
{
  "type": "urn:gds:error:validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "La petición no supera la validación del esquema.",
  "instance": "/api/v1/vuelos/bookings",
  "code": "VALIDATION_FAILED",
  "invalidParams": [
    { "name": "payment.paymentReference", "reason": "paymentReference es demasiado corto." }
  ]
}
```

#### Catálogo Homologado de Códigos de Error RFC 7807

La plataforma centraliza los códigos en `src/core/errors/codigo-error.ts`, soportando errores de vuelos y las extensiones para el dominio de **Alojamientos (Hospitality)**:

| Código (`code`) | HTTP Status | URI (`type`) | Dominio / Descripción |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | `urn:gds:error:validation-failed` | Parámetros de petición inválidos o incompletos |
| `SEAT_TAKEN` | 409 | `urn:gds:error:seat-taken` | Asiento previamente ocupado (Vuelos) |
| `AMOUNT_MISMATCH` | 409 | `urn:gds:error:amount-mismatch` | Discrepancia en el monto o moneda enviada |
| `BOOKING_NOT_CONFIRMED` | 409 | `urn:gds:error:booking-not-confirmed` | Conflicto con estado de reserva o colisión de Idempotency-Key |
| `ROOM_NO_LONGER_AVAILABLE` | 409 | `urn:gds:error:room-no-longer-available` | **Alojamientos:** La habitación seleccionada ya no tiene disponibilidad |
| `PRICE_CHANGED` | 409 | `urn:gds:error:price-changed` | **Alojamientos:** La tarifa ha cambiado entre la búsqueda y la orden |
| `CANCELLATION_NOT_ALLOWED` | 409 | `urn:gds:error:cancellation-not-allowed` | **Alojamientos:** Estancia finalizada o fuera de política de cancelación |
| `RATE_LIMIT_EXCEEDED` | 429 | `urn:gds:error:rate-limit-exceeded` | Límite de peticiones concurrentes superado |
| `PAYMENT_REFERENCE_INVALID` | 422 | `urn:gds:error:payment-reference-invalid` | Referencia de pago nula o con longitud incorrecta |
| `PAYMENT_NOT_AUTHORIZED` | 422 | `urn:gds:error:payment-not-authorized` | Fallo de pasarela o rechazo de pago |

---

## 2. Modelo de Datos

### 2.1 Diagrama Conceptual de Entidades

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     USUARIO      │──────▶│     RESERVA       │──────▶│     BOLETO       │
│ ─────────────── │  1:N  │ ──────────────── │  1:N  │ ──────────────── │
│ id (UUID)        │       │ id (UUID)         │       │ id (UUID)         │
│ nombre           │       │ pnr               │       │ ticketId (GDS)   │
│ apellido         │       │ status            │       │ pasajeroId       │
│ email            │       │ totalPrice        │       │ segmentoId       │
│ rol              │       │ currency          │       │ status           │
└──────────────────┘       │ propietarioId     │       └──────────────────┘
                           └────────┬──────────┘
                                    │ 1:N
                           ┌────────▼──────────┐
                           │   ITINERARIO      │
                           │ ──────────────── │
                           │ id (UUID)         │
                           │ origen            │
                           │ destino           │
                           │ orden             │
                           └────────┬──────────┘
                                    │ 1:N
                           ┌────────▼──────────┐
                           │    SEGMENTO       │
                           │ ──────────────── │
                           │ id (UUID)         │
                           │ flightNumber      │
                           │ departureDate     │
                           │ arrivalDate       │
                           │ origin (IATA)     │
                           │ destination (IATA)│
                           └───────────────────┘

┌──────────────────┐       ┌──────────────────┐
│   ATRACCION      │◀─────▶│   RESERVA_ATRAC  │
│ ──────────────── │  N:M  │ ──────────────── │
│ id               │       │ id               │
│ name             │       │ reservationId    │
│ product_type     │       │ email            │
│ operator         │       │ status           │
│ location         │       │ idempotencyKey   │
│ price            │       │ createdAt        │
│ currency         │       └──────────────────┘
│ availableTickets │
└──────────────────┘

┌──────────────────────┐       ┌──────────────────────┐
│     ALOJAMIENTO      │◀─────▶│ RESERVA_ALOJAMIENTO  │
│ ──────────────────── │  1:N  │ ──────────────────── │
│ id (VARCHAR 50)      │       │ id (UUID)            │
│ nombre               │       │ codigo_reserva (UNQ) │
│ descripcion          │       │ alojamiento_id (FK)  │
│ tipo_propiedad       │       │ cliente_nombre       │
│ destino              │       │ cliente_email        │
│ precio_noche         │       │ fecha_inicio (DATE)  │
│ tiene_piscina        │       │ fecha_fin (DATE)     │
│ ratings (JSONB)      │       │ noches, huespedes    │
│ amenidades (JSONB)   │       │ total (NUMERIC)      │
│ photos (JSONB)       │       │ total_price (JSONB)  │
│ host (JSONB)         │       │ estado               │
│ ubicacion (JSONB)    │       │ idempotency_key(UNQ) │
└──────────┬───────────┘       └──────────────────────┘
           │ 1:N
┌──────────▼───────────┐       ┌──────────────────────┐
│  RESENAS_ALOJAMIENTO │       │ WEBHOOKS_ALOJAMIENTO │
│ ──────────────────── │       │ ──────────────────── │
│ id (UUID)            │       │ id (UUID)            │
│ alojamiento_id (FK)  │       │ propietario_id       │
│ usuario_nombre       │       │ url                  │
│ comentario           │       │ events (JSONB)       │
│ puntuacion           │       │ secret               │
│ limpieza, servicio...│       │ activo (BOOLEAN)     │
└──────────────────────┘       └──────────────────────┘

┌──────────────────┐       ┌──────────────────┐
│    ORDEN_AUTO    │       │  SUPPORT_TICKET  │
│ ──────────────── │       │ ──────────────── │
│ id (UUID)        │       │ id (UUID)        │
│ vehicleId        │       │ email            │
│ email            │       │ subject          │
│ startDate        │       │ priority         │
│ endDate          │       │ status           │
│ status           │       │ resolution       │
│ totalPrice       │       │ created_at       │
└──────────────────┘       └──────────────────┘
```

### 2.2 Ciclos de Vida y Estados de Reserva

#### 2.2.1 Reserva de Vuelos
```
PENDING → PENDING_PAYMENT → TICKET_ISSUING → CONFIRMED
                                                   ↓
                            CHANGE_PENDING ←───────┤
                                   ↓               │
                                CONFIRMED ──────────┘
                                                   ↓
                           CANCELLATION_PENDING → CANCELLED
```

#### 2.2.2 Reserva de Alojamientos
```
POST /orders/create (con Idempotency-Key)
                  │
                  ▼
              CONFIRMED
              /       \
             /         \
 POST /orders/modify   POST /orders/cancel
          │                     │
          ▼                     ▼
      CONFIRMED             CANCELLED
 (fechas actualizadas) (valida checkout < now)
```

### 2.3 Tablas Principales en Supabase (PostgreSQL)

| Tabla | Vertical | Columnas Clave | Índices / Constricciones |
|---|---|---|---|
| `reserva` | Vuelos | `reserva_id`, `pnr`, `status`, `totalPrice`, `propietarioId` | PK `reserva_id`, UNIQUE `pnr` |
| `itinerario` | Vuelos | `reserva_id`, `origen`, `destino`, `orden` | FK `reserva_id` |
| `segmento` | Vuelos | `flightNumber`, `departureDate`, `origin`, `destination` | FK `itinerario_id` |
| `boleto` | Vuelos | `ticketId`, `pasajeroId`, `segmentoId`, `status` | PK `id`, UNIQUE `ticketId` |
| `pasajero` | Vuelos | `nombre`, `apellido`, `tipo_doc`, `numero_doc`, `tipo` | FK `reserva_id` |
| `bloqueo_oferta` | Vuelos | `holdId`, `offerId`, `propietarioId`, `expiresAt` | UNIQUE `holdId`, TTL 15-30 min |
| `atraccion` | Atracciones | `name`, `product_type`, `operator`, `price`, `availableTickets` | PK `id` |
| `reserva_atraccion` | Atracciones | `reservationId`, `email`, `status`, `idempotencyKey` | UNIQUE `idempotencyKey` |
| `alojamientos` | Alojamientos | `id`, `nombre`, `destino`, `tipo_propiedad`, `precio_noche`, `ratings`, `photos`, `amenidades` | PK `id`, IDX `destino`, IDX `precio_noche` |
| `reservas_alojamiento` | Alojamientos | `id`, `codigo_reserva`, `alojamiento_id`, `fecha_inicio`, `fecha_fin`, `total`, `total_price`, `estado`, `idempotency_key` | PK `id`, UNIQUE `codigo_reserva`, UNIQUE `idempotency_key`, FK `alojamiento_id` |
| `resenas_alojamiento` | Alojamientos | `id`, `alojamiento_id`, `usuario_nombre`, `comentario`, `puntuacion`, `limpieza`, `servicio`, `calidad` | PK `id`, IDX `alojamiento_id` |
| `webhooks_alojamiento` | Alojamientos | `id`, `propietario_id`, `url`, `events`, `secret`, `activo` | PK `id`, IDX `propietario_id` |
| `orden_auto` | Autos | `id`, `vehicleId`, `email`, `startDate`, `endDate`, `status`, `totalPrice` | PK `id` |
| `support_tickets` | Soporte | `email`, `subject`, `priority`, `status`, `resolution`, `created_at` | PK `id` |
| `telemetry_events` | Telemetría | `event_name`, `session_id`, `vertical`, `device`, `properties`, `created_at` | PK `id`, IDX `session_id` |

---

## 3. Contratos de API (Endpoints)

> **Prefijo global:** `/api/v1`  
> **Documentación interactiva:** `{backend_url}/api/docs` (Swagger UI / OpenAPI 3.0)  
> **Errores:** Todos los errores siguen el estándar **RFC 7807** con `Content-Type: application/problem+json`

### 3.1 Módulo Vuelos — `/api/v1/vuelos`

| Método | Endpoint | Descripción | Auth | Idempotency-Key |
|---|---|---|---|---|
| `POST` | `/search` | Búsqueda de vuelos (ida/vuelta/multidestino) | No | No |
| `POST` | `/offers/hold` | Bloquear inventario y congelar precio (15-30 min) | No | **Requerido** |
| `GET` | `/offers/hold/:holdId` | Consultar estado de un hold | No | No |
| `DELETE` | `/offers/hold/:holdId` | Liberar hold anticipadamente | No | No |
| `GET` | `/offers/:offerId/seatmap` | Mapa de asientos de una oferta | No | No |
| `POST` | `/bookings` | Crear reserva a partir de un hold | No | **Requerido** |
| `GET` | `/bookings` | Listar reservas del usuario (paginado por cursor) | No* | No |
| `GET` | `/bookings/:bookingId` | Detalle completo de una reserva | No* | No |
| `GET` | `/bookings/:bookingId/tickets` | Listar tickets de una reserva | No* | No |
| `POST` | `/bookings/:bookingId/tickets` | Emitir boletos de una reserva | No* | No |
| `GET` | `/bookings/:bookingId/tickets/:ticketId` | Detalle de un ticket | No* | No |
| `GET` | `/bookings/:bookingId/boarding-passes` | Listar pases de abordar | No* | No |
| `POST` | `/bookings/:bookingId/date-change/search` | Buscar disponibilidad para cambio de fecha | No* | No |
| `POST` | `/bookings/:bookingId/date-change` | Confirmar cambio de fecha | No* | **Requerido** |
| `GET` | `/bookings/:bookingId/baggage-options` | Opciones de equipaje post-emisión | No* | No |
| `POST` | `/bookings/:bookingId/check-in` | Realizar check-in | No* | No |
| `GET` | `/bookings/:bookingId/cancellation-quote` | Cotizar cancelación | No* | No |
| `POST` | `/bookings/:bookingId/cancel` | Cancelar reserva | No* | **Requerido** |
| `POST` | `/bookings/:bookingId/baggage` | Agregar maleta extra | No* | **Requerido** |
| `GET` | `/flights/:flightNumber/status` | Estado operativo de un vuelo (público) | No | No |
| `GET` | `/webhooks` | Listar suscripciones a webhooks | No* | No |
| `POST` | `/webhooks` | Registrar suscripción a webhook | No* | No |
| `DELETE` | `/webhooks/:id` | Eliminar suscripción | No* | No |

_*Usa `X-Device-Fingerprint` para identificar al propietario (UUID por sesión de navegador)._

### 3.2 Módulo Atracciones — `/api/v1/atracciones`

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| `POST` | `/search` | Búsqueda de atracciones con paginación por tokens | No |
| `POST` | `/details` | Obtener detalles de múltiples atracciones (batch) | No |
| `GET` | `/health` | Healthcheck del módulo | No |
| `GET` | `/` | Listar todas las atracciones (caché 60s) | No |
| `POST` | `/` | Registrar nueva atracción | No |
| `GET` | `/:id` | Detalle de una atracción (caché 60s, HATEOAS) | No |
| `PUT` | `/:id` | Reemplazar una atracción completa | No |
| `PATCH` | `/:id` | Actualizar parcialmente una atracción | No |
| `DELETE` | `/:id` | Eliminar una atracción | No |
| `GET` | `/:id/availability` | Consultar disponibilidad de cupos | No |
| `POST` | `/:id/reservations` | Reservar una atracción | **JWT** |
| `GET` | `/reservations` | Historial de reservas del usuario | **JWT** |
| `GET` | `/reservations/:id` | Detalle de una reserva específica | **JWT** |
| `POST` | `/reservations/:id/cancel` | Cancelar una reserva | **JWT** |

### 3.3 Módulo Alojamientos — `/api/v1/alojamientos` (BFF Integrador GDS Core)

El módulo de Alojamientos implementa la especificación completa del integrador hotelero para consumo frontend y federación entre socios. Soporta búsquedas avanzadas, agregación de detalles en lote, cotizaciones previas, mutaciones idempotentes y subscripción a webhooks:

#### 3.3.1 Búsqueda, Catálogo y Metadatos GDS Core

| Método | Endpoint | Descripción | DTO Entrada / Parámetros | DTO Salida / Caché |
|---|---|---|---|---|
| `POST` | `/search` | Búsqueda avanzada de alojamientos con filtros de destino, fechas, huéspedes, tarifas y servicios | `SearchAlojamientosRequestDto` | `AlojamientoResponseDto[]` |
| `POST` | `/details` | Consulta en bloque (batch) de detalles para múltiples propiedades | `DetailsRequestDto` (`ids: string[]`) | `AccommodationDetailsResponseDto[]` |
| `POST` | `/details/changes` | Detección de cambios y actualizaciones de inventario desde una marca temporal (`since`) | `DetailsChangesRequestDto` | `DetailsChangesResponseDto` |
| `POST` | `/chains` | Catálogo de cadenas hoteleras y operadores asociados | — | `ChainsResponseDto` |
| `POST` | `/constants` | Constantes maestras del sistema (tipos de habitación, monedas, políticas de check-in) | `ConstantsRequestDto` | `ConstantsResponseDto` |
| `POST` | `/reviews` | Consulta paginada del catálogo de opiniones de huéspedes | `ReviewsRequestDto` | `ReviewsResponseDto` |
| `POST` | `/reviews/scores` | Resumen cuantitativo de puntuaciones de satisfacción (limpieza, servicio, relación calidad-precio) | `ReviewsScoresRequestDto` | `ReviewsScoresResponseDto` |

#### 3.3.2 Disponibilidad y Precios Dinámicos

| Método | Endpoint | Descripción | DTO Entrada / Parámetros | DTO Salida |
|---|---|---|---|---|
| `POST` | `/availability` | Consulta de disponibilidad y cotización dinámica por rango de fechas para un hotel | `AvailabilityRequestDto` | `ContractAvailabilityResponseDto` |
| `POST` | `/bulk-availability` | Verificación masiva de disponibilidad para múltiples hoteles en paralelo | `BulkAvailabilityRequestDto` | `BulkAvailabilityResponseDto` |
| `GET` | `/:id/availability` | Consulta directa de disponibilidad de la propiedad por ID | `checkin`, `checkout` (Query) | `AvailabilityResponseDto` |
| `GET` | `/:id/resenas` | Listado de reseñas de huéspedes para la propiedad especificada | `id` (Param) | `ResenaAlojamiento[]` |

#### 3.3.3 Órdenes y Gestión Transaccional (Idempotencia y Políticas)

| Método | Endpoint | Descripción | Cabeceras Requeridas | DTO Entrada / Salida |
|---|---|---|---|---|
| `POST` | `/orders/preview` | Simulación y desglose previo de costos, impuestos y recargos antes de procesar el pago | — | In: `OrderPreviewRequestDto`<br>Out: `OrderPreviewResponseDto` |
| `POST` | `/orders/create` | Creación y confirmación definitiva de la orden con soporte estricto de idempotencia | `Idempotency-Key: <UUID>` | In: `OrderCreateRequestDto`<br>Out: `OrderDetailDto` |
| `GET` | `/orders/:orderId` | Consulta detallada del estado de una orden por ID o código de reserva | — | Out: `OrderDetailDto` |
| `POST` | `/orders/:orderId/modify` | Modificación de fechas o número de ocupantes en una orden existente | `Idempotency-Key: <UUID>` | In: `OrderModifyRequestDto`<br>Out: `OrderDetailDto` |
| `POST` | `/orders/:orderId/cancel` | Cancelación formal de la orden validando política de estancia (error 409 si ya finalizó) | `Idempotency-Key: <UUID>` | In: `CancelReservationRequestDto`<br>Out: `OrderDetailDto` |
| `GET` | `/reservations` | Listado de reservas activas e históricas | — | Out: `ReservationResponseDto[]` |
| `GET` | `/reservations/:reservationId` | Detalle específico de una reserva | — | Out: `ReservationResponseDto` |
| `POST` | `/reservations/:reservationId/cancel` | Cancelación rápida de reserva | — | In: `CancelReservationRequestDto`<br>Out: `ReservationResponseDto` |
| `POST` | `/:id/reservations` | Reserva directa sobre el recurso del alojamiento | `Idempotency-Key: <UUID>` (Opcional) | In: `ReservationRequestDto`<br>Out: `ReservationResponseDto` |

#### 3.3.4 Webhooks de Notificación Asíncrona

| Método | Endpoint | Descripción | DTO Entrada / Salida |
|---|---|---|---|
| `GET` | `/webhooks` | Listar suscripciones de webhooks activas para el propietario | Query: `propietarioId`<br>Out: `AccommodationWebhookSubscriptionDto[]` |
| `POST` | `/webhooks` | Registrar una nueva URL de webhook para eventos (`booking_created`, `booking_cancelled`) | In: `CreateAccommodationWebhookDto`<br>Out: `AccommodationWebhookSubscriptionDto` |
| `DELETE` | `/webhooks/:id` | Dar de baja una suscripción a webhook por su identificador UUID | Param: `id` (UUID)<br>Out: `204 No Content` |

#### 3.3.5 Operaciones CRUD y Healthcheck

| Método | Endpoint | Descripción | Caché / Observabilidad |
|---|---|---|---|
| `GET` | `/health` | Chequeo de estado y conectividad de la vertical | No Caché |
| `GET` | `/` | Catálogo general de alojamientos con filtros (`destino`, `tipo`, `tienePiscina`, `precioMaximo`) | Caché HTTP 60s |
| `POST` | `/` | Registro de una nueva propiedad hotelera | — |
| `GET` | `/:id` | Detalle completo de un alojamiento específico con hipermedios HATEOAS | Caché HTTP 60s |
| `PUT` | `/:id` | Actualización total de una propiedad | — |
| `PATCH` | `/:id` | Actualización parcial de atributos | — |
| `DELETE` | `/:id` | Eliminación lógica (soft-delete) de la propiedad | — |

---

### 3.4 Módulo Autos — `/api/v1/autos`

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| `POST` | `/search` | Buscar autos disponibles | No |
| `POST` | `/depots` | Listado de depósitos/sucursales | No |
| `POST` | `/constants` | Constantes del sistema de alquiler | No |
| `POST` | `/suppliers` | Listado de proveedores | No |
| `POST` | `/orders/create` | Crear orden de alquiler | No |
| `GET` | `/orders` | Listar órdenes del usuario (caché) | No |
| `GET` | `/orders/:orderId` | Detalle de una orden (caché) | No |
| `POST` | `/orders/:orderId/cancel` | Cancelar una orden | No |

### 3.5 Módulo Chatbot — `/api/v1/chatbot` (Soporte Multi-Vertical con Groq/LLaMA)

| Método | Endpoint | Descripción | Cache |
|---|---|---|---|
| `POST` | `/mensaje` | Enviar mensaje al chatbot con ejecución de herramientas en tiempo real | No |
| `POST` | `/nueva-conversacion` | Iniciar nueva conversación e inicializar memoria | No |
| `GET` | `/estado` | Estado de disponibilidad del servicio Groq | 5s |
| `GET` | `/alcance` | Descripción formal del alcance informativo y de solo lectura | No |

#### Nueva Herramienta Integrada: `consultar_alojamientos`
El chatbot incorpora en su motor de Function Calling la herramienta `consultar_alojamientos`, permitiendo a los clientes interactuar en lenguaje natural en español e inglés:
- **Declaración:** En `src/modules/chatbot/chatbot.tools.ts`, configurada con esquema JSON Schema estricto.
- **Parámetros:** `destino` (string), `checkin` (string YYYY-MM-DD), `checkout` (string YYYY-MM-DD), `adultos` (integer), `tienePiscina` (boolean), `precioMaximo` (number).
- **Ejecución:** En `ChatbotToolsExecutorService`, consume `GET /api/v1/alojamientos` con normalización de caracteres, tildes y diacríticos, filtrando por destino, comodidades y presupuesto, retornando hasta 5 alternativas estructuradas con puntuación y precio por noche.
- **Prompt:** Actualizado en `chatbot.prompt.ts` para instruir al modelo sobre la consulta de disponibilidad en las cuatro verticales (vuelos, alojamientos, autos y atracciones).

### 3.6 Módulo Facturas — `/api/v1/facturas`

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/enviar` | Enviar factura PDF por correo (SMTP Gmail con Nodemailer) |

### 3.7 Módulo Telemetría — `/api/v1/telemetry`

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/events` | Registrar evento de analítica (search_submitted, checkout_started, booking_confirmed, etc.) |

#### Eventos Emitidos por Alojamientos
- `booking_confirmed`: Registrado al procesar con éxito `POST /alojamientos/orders/create` o `POST /alojamientos/:id/reservations`. Propiedades: `order_id`, `codigo_reserva`, `alojamiento_id`, `total`.
- `booking_cancelled`: Registrado al procesar la cancelación de una orden en `POST /alojamientos/orders/:orderId/cancel`. Propiedades: `order_id`, `codigo_reserva`, `reason`.

---

## 4. Versionamiento y Fecha de Deprecación

Todas las rutas utilizan el prefijo `/api/v1` configurado globalmente en `main.ts`:

```typescript
app.setGlobalPrefix('api/v1');
```

Algunos endpoints llevan adicionalmente la cabecera de respuesta para controlar la deprecación controlada:

```
X-API-Deprecation-Date: 2027-12-31
```

---

## 5. Patrones de Integración Implementados

### 5.1 Verificación Síncrona de Pago

Antes de emitir cualquier ticket o confirmar una reserva que tenga costo adicional, el sistema valida que se haya recibido una `paymentReference` válida (mínimo 4, máximo 120 caracteres). Si no se provee, el sistema devuelve un `422 Unprocessable Entity`:

```typescript
if (Number(oferta.cambioTotalAPagar) > 0 && !dto.payment?.paymentReference) {
  throw new UnprocessableEntityException(
    'El cambio tiene un importe a pagar y no se ha recibido paymentReference.'
  );
}
```

### 5.2 Idempotencia en Operaciones de Escritura

Las operaciones transaccionales críticas requieren la cabecera HTTP `Idempotency-Key` (formato UUID v4):
- En **Vuelos:** En creación de holds, confirmación de bookings, cambios de fecha y cancelaciones.
- En **Alojamientos:** En `POST /orders/create`, `POST /orders/:orderId/modify` y `POST /orders/:orderId/cancel`. El servicio verifica la clave en la tabla `reservas_alojamiento(idempotency_key)`. Si la orden ya se encuentra en estado `CONFIRMED`, se emite un error estructurado RFC 7807 `409 BOOKING_NOT_CONFIRMED` o se retorna el estado preexistente sin duplicar cobros ni registros.

### 5.3 Telemetría y Preparación para EDA

El módulo `TelemetryModule` y los servicios de dominio capturan eventos clave (`search_submitted`, `checkout_started`, `booking_confirmed`, `booking_cancelled`). Los eventos se persisten directamente en PostgreSQL (`telemetry_events`), alimentando tanto el embudo en tiempo real del Panel de Administración como la preparación para el bus de eventos distribuido (EDA/SOA) del Reto 2.

### 5.4 Persistencia y Despacho de Webhooks

Tanto el módulo de Vuelos como el de **Alojamientos** implementan el patrón de notificación asíncrona mediante webhooks:
- **Almacenamiento:** Las suscripciones se registran en `webhooks_alojamiento` vinculadas a un `propietario_id`, especificando URL destino, lista de eventos suscritos y secreto para firma.
- **Despacho Resiliente:** Al confirmarse o cancelarse una orden, el servicio dispara solicitudes HTTP POST asíncronas con timeout estricto de 5 segundos hacia los endpoints de los socios, logueando el estado sin bloquear la respuesta al usuario final.

---

## 6. Puntos de Integración para el Reto 2

| Punto de Integración | Tipo | Descripción |
|---|---|---|
| `POST /api/v1/vuelos/webhooks` | Webhook Saliente | Notificación asíncrona de cambios de estado de reserva de vuelos a sistemas externos |
| `POST /api/v1/alojamientos/webhooks` | Webhook Saliente | Notificación asíncrona de confirmación y cancelación de órdenes de hospedaje para socios |
| `POST /api/v1/alojamientos/bulk-availability` | Endpoint Federado | Verificación de inventario masivo para metabuscadores y sistemas de distribución |
| `GET /api/v1/atracciones` | Endpoint Público | Consumo por el sistema central Booking Prototipo para catálogo federado |
| `SoapWrapperService` | Wrapper Interno | Preparado para conectarse a sistemas legados SOAP/XML sin modificar el contrato REST |
| `TelemetryModule` | Event Source | Fuente de eventos unificada para migración futura a Event Bus (RabbitMQ/Kafka) |

---

## 7. Stack Tecnológico

| Capa | Tecnología | Versión / Detalle |
|---|---|---|
| Frontend | React (Vite) | 18.x |
| Backend | NestJS | 10.x |
| ORM | TypeORM | 0.3.x |
| Base de Datos | PostgreSQL (Supabase) | 15.x |
| Autenticación | Supabase Auth (JWT / RLS) | — |
| IA & Chatbot | Groq SDK (LLaMA 3.3 70B Versatile) | Function Calling con herramientas REST |
| Documentación API | Swagger / OpenAPI 3.0 | @nestjs/swagger |
| Validación | class-validator + class-transformer | Pipes globales con whitelist |
| Caché | @nestjs/cache-manager | TTL dinámico por recurso |
| Despliegue Frontend | Vercel | — |
| Despliegue Backend | Render | — |
