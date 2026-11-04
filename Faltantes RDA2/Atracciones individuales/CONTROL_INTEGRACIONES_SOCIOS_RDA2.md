# Matriz de Control y Estado de Integraciones RDA2 (Azure & CloudAMQP)

> **Plataforma Central Integradora:** Booking Prototipo (Azure App Service: `https://booking-core-api.azurewebsites.net`)  
> **Broker Central:** CloudAMQP Shark Broker (`amqps://qkvqjvku:...@shark.rmq.cloudamqp.com/qkvqjvku`)  
> **Última Actualización:** 30 de Octubre de 2026  
> **Responsable:** Paúl Rosero (Líder Técnico Booking)

---

## 1. Tablero General de Estado por Compañero

| # | Compañero | Vertical | Sistema / Marca | Código de Nodo | Entorno Actual | Estado Integración | Acciones Pendientes |
|:---:|---|:---:|---|:---:|:---:|:---:|---|
| 1 | **Dilan Mendoza** | Atracciones | Descubre EC | `NODE_ATR_DILAN` | **Azure Container Apps** (Chile) | 🟢 **100% EXITOSA** | Ninguna. 11 microservicios en línea, 24 tours sincronizados, reservas y cancelaciones probadas. |
| 2 | **Ariel Chacha** | Atracciones | Ecuatravel | `NODE_ATR_ARIEL` | **Azure App Service** | 🟢 **100% EXITOSA** | Ninguna. 33 tours sincronizados, `/search`, disponibilidad, reservas (`ECT-GMZQ4L`) y cancelaciones operativas. |
| 3 | **Daniel González** | Autos | RutaLibre | `NODE_AUT_RUTALIBRE` | **Azure App Service** | 🟢 **100% EXITOSA** | Ninguna. Flota de 34 autos conectada, Cooldown 2h activo, stock fallback habilitado. |
| 4 | **Mateo Morales** | Autos | MANEJA DE UNA | `NODE_AUT_MDU` | **Azure App Service** | 🟢 **100% EXITOSA** | Ninguna. Flota de 27 autos, autenticación X-API-Key resuelta, promociones, reservas (`MDU-2DCB9078`) y cancelaciones Saga probadas. |
| 5 | **Michael Molina** | Atracciones | TourGirls | `NODE_ATR_MOLINA` | **Azure App Service** | 🟢 **100% EXITOSA** | Ninguna. 18 tours sincronizados, health UP, disponibilidad (?fecha= y ?date=), creación de reserva (`DEC-D2QJSF`) y cancelación Saga (`REF-ATR-7YGADV`) probadas. Conectado a CloudAMQP (8 colas). |
| 6 | **Gloria Chushig** | Atracciones | Vívelo Ecuador | `NODE_ATR_GLORIA` | **Azure Container Apps** | 🟢 **100% EXITOSA** | Ninguna. 11 tours sincronizados, `/health` 200 UP, disponibilidad por turnos, reservas con UUID (`db8c56dc`) y cancelaciones Saga probadas. |
| 7 | **Alisson Basantes**| Atracciones | Atracciones Turísticas del Ecuador | `NODE_ATR_ALISSON` | **Azure App Service** | 🟢 **100% EXITOSA** | Ninguna. 16 microservicios (3 gRPC + 13 REST), 5 tours sincronizados, reservas y cancelaciones probadas. |

---

## 2. Fichas Técnicas Detalladas de Integración

### 🟢 2.1. Ariel Chacha — Ecuatravel (`NODE_ATR_ARIEL`)
* **Estado:** Totalmente Operativo y Certificado.
* **URL Base Azure:** `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3`
* **Health / Telemetría:** `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3/health` (Latencia: ~11 ms, Database: UP)
* **X-API-Key:** `atr-ariel-ecua-travel-2026`
* **Catálogo Sincronizado en Booking:** 33 atracciones y tours turísticos en Ecuador.
* **Pruebas Validadas:**
  - `GET /api/v3/health` -> HTTP 200 (UP)
  - `GET /api/v3/atracciones?page=1&limit=20` -> HTTP 200 (Catálogo de 33 tours con fotos y precios)
  - `POST /api/v3/atracciones/search` -> HTTP 200 (Búsqueda por país/ciudad/filas)
  - `GET /api/v3/atracciones/:id/disponibilidad?fecha=2026-11-10` -> HTTP 200 (Slots: `slot-20261110-0900`, 12 cupos)
  - `GET /api/v3/atracciones/categorias/arbol` -> HTTP 200 (Árbol con flags `incluye_comida`, `incluye_transporte`, `incluye_guia`)
  - `GET /api/v3/atracciones/promociones/contrato` -> HTTP 200 (Descuento combo 15% acordado)
  - `POST /api/v3/atracciones/reservas` -> HTTP 201 Created (Generó reserva `49dc85e3-3e2d-482d-9b39-6d3a9e6c982e` con código `ECT-GMZQ4L` y voucher QR)
  - `POST /api/v3/atracciones/reservas/:id/cancel` -> HTTP 200 (Compensación Saga ejecutada: liberó cupos y emitió reembolso `REF-ECT-GMZQ4L` por $125.00 USD)
* **Particularidad Técnica para Integración:**
  - En `POST /atracciones/reservas`, el atributo `payment_method` debe ser un objeto con formato `{ "method": "CREDIT_CARD" }` (admite `CREDIT_CARD`, `DEBIT_CARD`, `PAYPAL`, `TRANSFER`).
  - La cédula del cliente (`document_id`) pasa por validador estricto de módulo 10 ecuatoriano.

---

### 🟢 2.2. Dilan Mendoza — Descubre EC (`NODE_ATR_DILAN`)
* **Estado:** Totalmente Operativo y Certificado.
* **URL Base Azure:** `https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3`
* **Health / Telemetría:** `https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3/health` (11 microservicios UP)
* **X-API-Key:** `40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568`
* **Catálogo Sincronizado en Booking:** 24 experiencias y expediciones.
* **Pruebas Validadas:**
  - `GET /api/v3/health` -> HTTP 200 (11 microservicios: catálogo, orden, inventario, precios, pagos, etc.)
  - `GET /api/v3/atracciones` -> HTTP 200 (24 tours con desgloses de rating e itinerarios)
  - `GET /api/v3/atracciones/:id/disponibilidad` -> HTTP 200 (Turnos y aforo en vivo)
  - `POST /api/v3/reservas` -> HTTP 201 Created (Reserva `DEC-NG4PBA`, voucher QR y enlace calendario `.ics`)
  - `POST /api/v3/reservas/:id/cancel` -> HTTP 200 (Reembolso `REM-000000138` por $165.00 USD procesado)
  - `POST /api/v3/inventory/stock` (Inbound Booking) -> HTTP 200 (Sincronización de aforo confirmada)

---

### 🟢 2.3. Daniel González — RutaLibre Renta de Autos (`NODE_AUT_RUTALIBRE`)
* **Estado:** Totalmente Operativo, Homologado y Certificado al 100%.
* **URL Base Azure:** `https://rutalibre-autos-api.azurewebsites.net/api/v3`
* **Health / Telemetría:** `https://rutalibre-autos-api.azurewebsites.net/api/v3/health` y `/autos/health` (Status: `HEALTHY`, 37 vehículos activos, latencia: ~21 ms, Circuit Breaker: `CLOSED`).
* **X-API-Key Registrada en Booking:** `LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA` (Confirmada y vinculada en `config_proveedor`).
* **Catálogo & Búsqueda:** `GET /api/v3/autos` y `POST /api/v3/autos/search` (Catálogo de 37 vehículos con filtrado por categoría SUV, compacto, transmisión y ubicación).
* **Pruebas Validadas:**
  - `GET /health` y `/autos/health` -> HTTP 200 OK (`HEALTHY`).
  - `POST /autos/orders/create` (Contrato v3 con Idempotency-Key UUID v4) -> HTTP 201 Created (Generó órdenes `CARPA2MZ` y `CARV5PKW` con voucher QR).
  - `POST /autos/orders/:id/cancel` -> HTTP 200 OK (Compensación Saga LIFO ejecutada: emitió reembolso total `REF-AUTO-PA2MZ` y liberó vehículo a `DISPONIBLE`).
  - **Regla Cooldown 2 Horas (ADR-004):** Si un auto se devuelve a las 13:00, reservas antes de las 15:00 son rechazadas con HTTP 409 (`VEHICLE_IN_CLEANING_COOLDOWN`).
  - **Sincronización de Stock HTTP Inbound:** `POST https://booking-core-api.azurewebsites.net/api/v3/inventory/stock` probado exitosamente con HTTP 200 (`acknowledged: true`).
* **Especificación para Avisos de Stock hacia Booking Central:**
  - **URL:** `POST https://booking-core-api.azurewebsites.net/api/v3/inventory/stock`
  - **Headers:** `Content-Type: application/json` y `X-API-Key: LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA`
  - **Body Canónico:**
    ```json
    {
      "service_id": "NODE_AUT_RUTALIBRE",
      "item_id": "auto-pdb-1517",
      "available_units": 1,
      "date": "2026-11-25",
      "time_slot": "DEFAULT"
    }
    ```
    *(Nota de Resiliencia: Booking también tolera alias como `vehicle_id`, `auto_id`, `stock` y `cantidad`)*.

---

### 🟢 2.4. Mateo Morales — MANEJA DE UNA (`NODE_AUT_MDU`)
* **Estado:** Totalmente Operativo y Certificado (100% superado).
* **URL Base Azure:** `https://maneja-de-una-autos-api.azurewebsites.net/api/v3`
* **Health / Telemetría:** `https://maneja-de-una-autos-api.azurewebsites.net/api/v3/health` (Status: HEALTHY, total vehículos: 27, circuit_breaker: CLOSED, latencia: ~48 ms).
* **X-API-Key:** `Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=`
* **Catálogo Sincronizado en Booking:** 10 vehículos registrados en `schema_autos.autos_catalogo` (Suzuki Swift, etc.). Total flota remota: 27 vehículos.
* **Pruebas Validadas en Vivo:**
  - `GET /api/v3/health` -> HTTP 200 OK.
  - `GET /api/v3/autos` -> HTTP 200 OK (Catálogo completo de vehículos).
  - `GET /api/v3/autos/flota` -> HTTP 200 OK (Telemetría de cooldown y estado operativo).
  - `POST /api/v3/autos/search` -> HTTP 200 OK (Requiere contrato `SearchAutosRequestV2`: `pickup_location`, `pickup_date`, `pickup_time`, `dropoff_date`, `dropoff_time`, `driver_age`).
  - `GET /api/v3/autos/promociones/contrato` -> HTTP 200 OK con `X-API-Key` válida (Resuelto error 401; clave no autorizada responde 401 correctamente).
  - `POST /api/v3/autos/orders/create` -> HTTP 201 Created (Generó orden `2dcb9078-6a58-48ab-a09f-b58ee42c9d83`, PNR `MDU-2DCB9078`, voucher QR `BOOKING-CAR-MDU-2DCB9078`, total $156.00 USD).
  - `GET /api/v3/autos/orders/:id` -> HTTP 200 OK (Consulta tanto por UUID como por PNR `MDU-2DCB9078` y `MDU-9FA5B216`).
  - `POST /api/v2/autos/orders/:id/cancel` -> HTTP 200 OK (Compensación Saga LIFO exitosa: reembolso `MOCK-REFUND-24D0D19D`, vehículo liberado y estado `CANCELLED`).
  - **Event Bus RabbitMQ (CloudAMQP) Certificado:** Conexión TLS 1.3 a `shark.rmq.cloudamqp.com`, topic exchange `booking.events`, routing key `stock.updated`. Evento con `messageId: NODE_AUT_MDU:10000000-0000-4000-8000-000000000118:1793499598800` recibido en `q.stock.actualizado`, procesado y confirmado con ACK.
* **Particularidad Técnica para Integración:**
  - En `POST /orders/create`, el esquema debe coincidir estrictamente con `CreateAutoOrderRequestV2`: `vehicle_id`, `pickup_date`, `pickup_time`, `dropoff_date`, `dropoff_time`, `coverage_type: "TOTAL"|"BASICA"` y el objeto anidado `driver` (`full_name`, `email`, `phone`, `license_number`, `age`).
  - La cancelación compensatoria se procesa a través del enlace devuelto en la orden (`/api/v2/autos/orders/:order_id/cancel`).

---

### 🟢 2.5. Michael Molina — TourGirls (`NODE_ATR_MOLINA`)
* **Estado:** Totalmente Operativo y Certificado (100% superado).
* **URL Base Azure:** `https://tourgirls-gateway-mm.azurewebsites.net/api/v3`
* **Health / Telemetría:** `https://tourgirls-gateway-mm.azurewebsites.net/api/v3/atracciones/health` (Status: UP, database_connected: true, latencia: ~1486 ms, node_code: `NODE_ATR_MOLINA`).
* **X-API-Key:** `Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w`
* **Catálogo Sincronizado en Booking:** 18 atracciones y experiencias registradas en `schema_atracciones.atracciones_items` (Tortuga Bay, TelefériQo Quito, Templo del Sol, Pailón del Diablo, etc.).
* **Pruebas Validadas en Vivo:**
  - `GET /api/v3/atracciones/health` -> HTTP 200 OK (Status: UP, base de datos conectada).
  - `GET /api/v3/atracciones?limit=50` -> HTTP 200 OK (18 tours con fotos, precios, duración y turnos).
  - `GET /api/v3/atracciones/categorias/arbol` -> HTTP 200 OK (Taxonomía jerárquica cargada).
  - `GET /api/v3/atracciones/promociones/contrato` -> HTTP 200 OK.
  - `POST /api/v3/atracciones/search` -> HTTP 200 OK (Búsqueda por filtros operativa).
  - `GET /api/v3/atracciones/:id/disponibilidad?fecha=2026-11-04` -> HTTP 200 OK (Soporta `?fecha=` y `?date=`).
  - `POST /api/v3/atracciones/reservas` -> HTTP 201 Created (Generó reserva `b5983977-5f32-49eb-862d-e4e5737f28cc` con PNR `DEC-D2QJSF`, voucher QR JWT y estado `CONFIRMED`).
  - `POST /api/v3/atracciones/reservas/:id/cancel` -> HTTP 200 OK (Saga compensatoria ejecutada con éxito: liberó cupos, estado `CANCELLED` y emitió reembolso `REF-ATR-7YGADV` por $70.00 USD).
  - `POST /api/v3/atracciones/reservas/:id/checkin` -> HTTP 200/404 operacional con validación de `documento_identidad`.
  - **Event Bus RabbitMQ (CloudAMQP):** 8 colas activas vinculadas al exchange `booking.events` en `shark.rmq.cloudamqp.com` con 1 consumidor por cola.
* **Particularidad Técnica para Integración:**
  - En `POST /reservas`, el objeto `payment_method` debe ser `{ "method": "CREDIT_CARD" }` (o `DEBIT_CARD`, `PAYPAL`, `TRANSFER`).
  - El documento del cliente (`document_id`) valida el algoritmo de módulo 10 de cédula ecuatoriana.
  - El timeout interno entre microservicios fue ampliado a 65 segundos, resolviendo el error 503 por latencia entre regiones.

---

### 🟢 2.6. Gloria Chushig — Vívelo Ecuador (`NODE_ATR_GLORIA`)
* **Estado:** Totalmente Operativo y Certificado (100% superado).
* **URL Base Azure:** `https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3`
* **Health / Telemetría:** `GET /api/v3/health` -> HTTP 200 OK (`{"status":"UP","database_connected":true,"service":"Atracciones"}`).
* **X-API-Key:** No requerida en endpoints públicos.
* **Catálogo Sincronizado en Booking:** 11 atracciones turísticas registradas en `schema_atracciones.atracciones_items` (Mitad del Mundo y Museo Intiñan, etc.).
* **Pruebas Validadas en Vivo:**
  - `GET /api/v3/health` -> HTTP 200 OK (Mapeado a la raíz de la API).
  - `GET /api/v3/atracciones` -> HTTP 200 OK (Catálogo completo de 11 tours turísticos).
  - `POST /api/v3/atracciones/search` -> HTTP 200 OK (Búsqueda por filtros operativa).
  - `GET /api/v3/atracciones/:id/disponibilidad?fecha=2026-11-15&personas=2` -> HTTP 200 OK (Retorna horarios habilitados: `08:00`, `10:00`, `14:00`).
  - `POST /api/v3/atracciones/reservas` con UUID -> HTTP 201 Created (Generó reserva `db8c56dc-09b6-4803-abcd-3603c6905476` con estado `CONFIRMADA` usando el UUID `1bb26d24-f79d-4833-b9da-a35b8d5ef44d`).
  - `POST /api/v3/atracciones/reservas/:id/cancel` -> HTTP 200 OK (Saga compensatoria ejecutada con éxito: canceló reserva y retornó estado `CANCELADA`).
  - Broker RabbitMQ configurado hacia `amqps://...shark.rmq.cloudamqp.com/qkvqjvku` con exchange `booking.events`.

---

### 🟢 2.7. Alisson Basantes — Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)
* **Estado:** Totalmente Operativo y Certificado.
* **URL Base Azure:** `https://alisson-atracciones-api.azurewebsites.net/api/v3`
* **Health / Telemetría General:** `https://alisson-atracciones-api.azurewebsites.net/api/v3/health` (Latencia: ~61 ms, Status: UP, Database Connected: true, Memoria: 75 MB)
* **Telemetría Microservicios:** `https://alisson-atracciones-api.azurewebsites.net/api/v3/ms/health` (13/13 microservicios activos: `billing_profile`, `audit`, `catalog`, `payment`, `location`, `review`, `support`, `cart`, `invoicing`, `pricing` [gRPC], `coupon`, `refund`, `identity`)
* **X-API-Key:** `atr-f575172d62a81d51e87fbc0a37952d984ce1c078`
* **Catálogo Sincronizado en Booking:** 5 tours y experiencias turísticas (Centro Histórico de Quito `PRhu4UBTWPBC`, etc.)
* **Pruebas Validadas:**
  - `GET /api/v3/health` -> HTTP 200 (UP, telemetría y gRPC a Booking habilitados)
  - `GET /api/v3/ms/health` -> HTTP 200 (13 microservicios UP en paralelo)
  - `GET /api/v3/atracciones?page=1&limit=20` -> HTTP 200 (5 experiencias cargadas)
  - `POST /api/v3/atracciones/search` -> HTTP 200 (Búsqueda por filtros funcional)
  - `GET /api/v3/atracciones/:id/disponibilidad?fecha=2026-11-15` -> HTTP 200 (Turnos `slot-20261115-0900`, 20 cupos disponibles)
  - `GET /api/v3/atracciones/categorias/arbol` -> HTTP 200
  - `GET /api/v3/atracciones/promociones/contrato` -> HTTP 200
  - `POST /api/v3/reservas` -> HTTP 201 Created (Generó reserva `e0c19b7e-6e94-4ed4-a321-95698cfa0d37`, código `ATR-M39RQWP`, voucher QR JWT firmado y enlace `.ics` de calendario)
  - `POST /api/v3/atracciones/reservas/:id/cancel` -> HTTP 200 (Saga compensatoria ejecutada con éxito: canceló reserva y emitió reembolso `REF-ATR-M39RQWP` por $25.00 USD)
  - `POST /api/v3/inventory/stock` (Inbound hacia Booking Azure) -> HTTP 200 (Sincronización bidireccional de aforo confirmada con su API Key)
* **Particularidad Técnica para Integración:**
  - En `POST /reservas` se requiere el contrato estricto `CreateReservaRequestV3`: campos obligatorios `slot_id`, `time` (ej. `09:00:00`), `date`, `adult_count`, `customer` (`full_name`, `email`, `phone`, `document_type`, `document_id`) y `payment_method: { method: 'CREDIT_CARD' }`.

---

## 3. Resumen Cuantitativo del Ecosistema Booking

```
Total Nodos Evaluados: 7 / 7 (100% de la clase migró a Azure)
  ├── 🟢 Integraciones 100% Certificadas: 7 / 7 (100%) -> ¡PLENO TOTAL DE LA CLASE! (Dilan, Ariel, Daniel, Mateo, Michael, Gloria, Alisson)
  ├── 🟡 Desplegados en Azure con ajustes menores: 0 (0%)
  └── 🔴 Pendientes de Migración a Azure: 0 (0%)

Total Catálogo Externo Sincronizado en Booking en la Nube (PostgreSQL Supabase):
  ├── Atracciones Descubre EC (Dilan): 24 tours
  ├── Atracciones Ecuatravel (Ariel): 33 tours
  ├── Atracciones Turísticas del Ecuador (Alisson): 5 tours
  ├── Atracciones Vívelo Ecuador (Gloria): 11 tours
  ├── Atracciones TourGirls (Michael): 18 tours
  ├── Total Experiencias Activas: 91 tours en vivo en PostgreSQL Supabase
  │
  ├── Autos RutaLibre (Daniel): 34 autos
  ├── Autos MANEJA DE UNA (Mateo): 10 autos
  └── Total Flota de Autos Activa: 44 vehículos en vivo en PostgreSQL Supabase
```
