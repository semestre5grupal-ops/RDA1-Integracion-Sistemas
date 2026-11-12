# AUDITORÍA TÉCNICA DE CONTRATOS, CANCELACIÓN Y PATRÓN SAGA
## Evaluación de Interfaces, Resiliencia y Transaccionalidad Distribuida en Atracciones y Autos (RDA2 — Requisito R1)

**Fecha de Emisión:** 11 de Noviembre de 2026  
**Proyecto:** Booking Marketplace — Plataforma de Integración de Sistemas  
**Rama de Trabajo:** `Atracciones-RDA2`  
**Alcance de la Auditoría:**
* **Vertical de Atracciones:** Gloria Chushig, Alisson Basantes, Michael Molina, Dilan Mendoza y Ariel Chacha.
* **Vertical de Renta de Autos:** Mateo Morales y Daniel González.
* **Núcleo de Transaccionalidad Distribuida:** Orquestador Saga ESB Central (`SagaOrchestratorService`, `EsbController`).
**Normativa y Referencias:** Rúbrica RDA2, Criterios de Evaluación CE01 y CE02, `teoria/Consideraciones RDA2.md` (§8 Patrón Saga y Compensaciones Atómicas), `docs Paúl Rosero/golden-rules.md`.

---

## 1. RESUMEN EJECUTIVO

La presente auditoría técnica evalúa el estado de cumplimiento de los contratos de interfaz y los mecanismos de cancelación distribuida en los microservicios de los integrantes de las verticales de **Atracciones Turísticas** y **Renta de Autos**, contrastando las especificaciones canónicas OpenAPI (v2 y v3) con las implementaciones reales desplegadas en la nube (Azure App Services y Azure Container Apps) y el código de integración del backend central. Asimismo, se valida a profundidad la arquitectura y el comportamiento operativo del **Patrón Saga Orquestado** implementado en el ESB central ante escenarios de reversión transaccional y compensación atómica.

### Hallazgos Principales:
1. **Especificación en Contratos Canónicos:** Las operaciones de cancelación están formalmente especificadas en los contratos centrales de la plataforma:
   - **Atracciones:** `POST /atracciones/reservas/{id}/cancel` (con alias `/api/v2/...` y `/api/v3/...`) en `contracts/atracciones-openapi-v2.yaml` (Líneas 546–640) y `contracts/atracciones-openapi-v3.yaml` (Líneas 1050–1150).
   - **Autos:** `POST /autos/orders/{orderId}/cancel` en `contracts/autos-openapi-v2.yaml` (Líneas 666–708) y `contracts/autos-openapi-v3.yaml` (Líneas 1420–1450).
2. **Conformidad de los Socios Externos:**
   - **Autos (100% de cumplimiento):** Ambos socios (**Mateo Morales** y **Daniel González**) implementan formalmente el endpoint de cancelación en sus contratos y servicios en la nube. Mateo expone `CancelOrderV2Dto` en su propio Swagger público (`/api/v3/autos/orders/{orderId}/cancel`), y Daniel expone `/api/v3/autos/orders/{orderId}/cancel`.
   - **Atracciones (80% pleno, 20% con discrepancia en Swagger externo):** Los servicios de **Alisson Basantes**, **Michael Molina**, **Dilan Mendoza** y **Ariel Chacha** implementan y exponen endpoints funcionales de cancelación en la nube. Sin embargo, en el microservicio de **Gloria Chushig** (`NODE_ATR_GLORIA` / `ms-catalog`), el endpoint `/cancel` **no está definido en su Swagger oficial** (`scripts/gloria_swagger.json`), si bien el backend central de Booking tiene implementado el despacho resiliente hacia su API y la compensación local en base de datos.
3. **Mecanismo de Aislamiento y Reglas de Negocio:**
   - Todos los servicios auditados hacen cumplir la regla de negocio que **rechaza cancelaciones con código `HTTP 409 Conflict` (RFC 7807)** si la reserva ya pasó por check-in presencial (`CONFIRMADO_ASISTIDO` / `CHECKED_IN`) o si el vehículo ya fue entregado en mostrador.
4. **Validación del Patrón Saga:**
   - El `SagaOrchestratorService` implementa una orquestación centralizada robusta que respeta los límites perimetrales de 5 segundos (CE01), bitácora relacional transaccional (`schema_auditoria.saga_transacciones` y `schema_auditoria.saga_pasos_journal`), compensación estricta en orden **LIFO (Last-In, First-Out)**, política de hasta 2 reintentos, escalamiento a `COMPENSATION_FAILED` con alerta crítica ante fallas persistentes y emisión de eventos CloudEvents sobre RabbitMQ.

---

## 2. ESPECIFICACIÓN CANÓNICA DE CONTRATOS DE CANCELACIÓN

### 2.1 Vertical de Atracciones Turísticas (`contracts/atracciones-openapi-v2.yaml` y `v3`)

* **Endpoint Canónico:** `POST /atracciones/reservas/{id}/cancel`  
  * **Rutas Alternativas Soportadas por Compatibilidad:** `/api/v2/atracciones/reservas/{id}/cancel`, `/api/v3/atracciones/reservas/{id}/cancel`, `/reservas/{id}/cancel`.
* **Parámetros de Entrada:**
  * `id` (*Path*, `string`, obligatorio): Identificador unívoco de la reserva (ej. `RES-ATR-123456` o UUID).
  * `Idempotency-Key` (*Header*, `string`, obligatorio): Identificador UUID v4 para garantizar la no duplicidad de operaciones financieras o reembolsos.
  * `X-Correlation-Id` (*Header*, `string`, opcional/propagado): Identificador de trazabilidad distribuida para observabilidad.
* **Cuerpo de Solicitud (Request Body):**
  ```json
  {
    "reason": "Cancelación voluntaria del usuario antes del límite de 24h",
    "client_id": "CLI-98765",
    "requested_at": "2026-11-11T14:30:00Z"
  }
  ```
* **Respuestas y Códigos de Estado:**
  * `HTTP 200 OK`: Cancelación confirmada. Retorna estado `CANCELLED`, código formal de reembolso `cancel_code` (`REF-ATR-...`), detalle financiero y mensaje informativo.
  * `HTTP 400 Bad Request`: Parámetros o cuerpo de petición inválidos.
  * `HTTP 404 Not Found`: Reserva no localizada.
  * `HTTP 409 Conflict`: Regla de negocio violada (reserva ya asistida o dentro de ventana no cancelable bajo RFC 7807 Problem Details).

### 2.2 Vertical de Renta de Autos (`contracts/autos-openapi-v2.yaml` y `v3`)

* **Endpoint Canónico:** `POST /autos/orders/{orderId}/cancel`  
  * **Rutas Alternativas:** `/api/v2/autos/orders/{orderId}/cancel`, `/api/v3/autos/orders/{orderId}/cancel`, `/api/v2/reservations/{id}/cancel`.
* **Parámetros de Entrada:**
  * `orderId` (*Path*, `string`, obligatorio): Localizador PNR o identificador de orden de renta.
  * `Idempotency-Key` (*Header*, `string`, obligatorio): Clave de idempotencia.
  * `X-Correlation-Id` (*Header*, `string`): Trazabilidad distribuida.
* **Cuerpo de Solicitud (Request Body — `CancelAutoOrderDto`):**
  ```json
  {
    "reason": "Fallo en paso de pago en Saga de Checkout",
    "motivo": "ROLLBACK_SAGA",
    "solicitante": "SAGA_ORCHESTRATOR"
  }
  ```
* **Respuestas y Códigos de Estado:**
  * `HTTP 200 OK`: Orden cancelada con éxito. Vehículo restituido inmediatamente a estado `DISPONIBLE`, emisión de reembolso al 100% (`REF-AUTO-...`).
  * `HTTP 409 Conflict`: Conflicto de negocio (vehículo ya entregado al cliente o alquiler en curso).
  * Evento EDA asociado: CloudEvent `ec.edu.epn.booking.autos.order.cancelled`.

---

## 3. AUDITORÍA INDIVIDUAL POR INTEGRANTE (ATRACCIONES)

### 3.1 Gloria Chushig — Vívelo Ecuador (`NODE_ATR_GLORIA`)

* **Servicio y Dominio en la Nube:**  
  * Catálogo y Reservas: `https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io` (Azure Container Apps).
  * Servicio de Identidad: `https://ms-identity.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/auth/login`.
* **Mecanismo de Autenticación:**  
  OAuth2 / JWT Bearer Token obtenido dinámicamente mediante login con credenciales de servicio (`atracciones.service.ts:503-530`).
* **Auditoría del Contrato de Interfaz Propio:**
  * Se analizó el Swagger OpenAPI oficial del contenedor extraído de `/api/docs-json` (`scripts/gloria_swagger.json`).
  * Rutas registradas en su especificación:
    - `POST /api/v2/atracciones/reservas`
    - `PUT /api/v2/atracciones/{id}/booking`
    - `POST /api/v2/atracciones/search`
    - `GET /api/v2/atracciones`
  * **Hallazgo Crítico:** En el Swagger público de Gloria **NO está definido ningún endpoint de cancelación (`/cancel`)**.
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/atracciones/atracciones.service.ts`, líneas 3102–3133.
  * **Lógica de Despacho y Contingencia:**
    ```typescript
    // atracciones.service.ts:3109-3129
    await firstValueFrom(
      this.httpService.post(
        `https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3/atracciones/reservas/${partnerCancelId}/cancel`,
        { reason: dto?.reason || 'Cancelación solicitada por el usuario' },
        { headers, timeout: 6000 }
      )
    );
    // En caso de respuesta 404, reintenta automáticamente contra el endpoint de contingencia
    ```
  * **Actualización en Persistencia y Base de Datos:**
    - Modifica el registro en memoria y SQL: `reserva.status = 'CANCELLED'` (`atracciones.service.ts:3022`).
    - Genera el código formal de compensación: `reserva.cancelCode = 'REF-ATR-' + crypto.randomBytes(4).toString('hex').toUpperCase()`.
    - Actualización SQL atómica en base de datos PostgreSQL (`atracciones.service.ts:3043-3054`):
      ```sql
      UPDATE schema_atracciones.atracciones_turnos_aforo
      SET cupos_disponibles = LEAST(capacidad_total, cupos_disponibles + $1),
          estado = 'DISPONIBLE',
          updated_at = NOW()
      WHERE atraccion_id = $2 AND fecha = $3 AND hora_inicio = $4
      ```
    - Inserta evento Outbox: `schema_atracciones.atracciones_outbox` con tipo `ATRACCION_RESERVA_CANCELADA` (`atracciones.service.ts:3059-3064`).
    - Registro en log de auditoría física Winston (`winstonLogger.logAudit('ATRACCION_CANCELACION_PROCESADA')`).
* **Estado de Conformidad:** **PARCIALMENTE IMPLEMENTADO / NO EN CONTRATO PROPIO**  
  *Justificación:* El integrador central implementa la llamada con token Bearer, el manejo de errores, la restitución de inventario en BD y el reembolso; no obstante, el servicio remoto de la compañera no expone contractualmente la ruta de cancelación en sus metadatos Swagger.

---

### 3.2 Alisson Basantes — Andes Explora (`NODE_ATR_ALISSON`)

* **Servicio y Dominio en la Nube:**  
  `https://alisson-atracciones-api.azurewebsites.net/api/v3` (Azure App Service).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: atr-f575172d62a81d51e87fbc0a37952d984ce1c078`.
* **Auditoría del Contrato de Interfaz:**
  * Conforme con OpenAPI canónico y validado en vivo con el script `scripts/test_alisson_cancel.js`.
  * **Endpoint:** `POST /api/v3/atracciones/reservas/{id}/cancel` (con fallback a `/api/v3/reservas/{id}/cancel`).
  * **Cabeceras:** `X-API-Key`, `Content-Type: application/json`.
  * **Payload:** `{ "reason": string, "motivo": string, "correlation_id": string }`.
  * **Respuestas Soportadas:** `HTTP 200 OK`, `HTTP 404 Not Found`.
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/atracciones/atracciones.service.ts`, líneas 3166–3198.
  * **Lógica de Despacho:**
    ```typescript
    // atracciones.service.ts:3175-3195
    await firstValueFrom(
      this.httpService.post(
        `https://alisson-atracciones-api.azurewebsites.net/api/v3/atracciones/reservas/${alissonTargetId}/cancel`,
        { reason: dto?.reason || 'Cancelación solicitada por el usuario' },
        { headers: alissonHeaders, timeout: 6000 }
      )
    );
    ```
  * **Persistencia y Aforo:**
    - Restitución de cupos en memoria (`turno.cuposDisponibles += reserva.ticketCount`, línea 3031).
    - Ejecución de query SQL atómica en `schema_atracciones.atracciones_turnos_aforo` (líneas 3044–3053).
    - Estado de reserva actualizado a `'CANCELLED'`.
    - Evento Outbox transaccional y registro en `logs/audit-YYYY-MM-DD.log`.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

### 3.3 Michael Molina — TourGirls (`NODE_ATR_MOLINA`)

* **Servicio y Dominio en la Nube:**  
  `https://tourgirls-gateway-mm.azurewebsites.net/api/v3` (Azure App Service).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w`.
* **Auditoría del Contrato de Interfaz:**
  * Conforme con especificación OpenAPI v2/v3 y script de prueba `scripts/test_michael_deep.js`.
  * **Endpoint:** `POST /api/v3/atracciones/reservas/{id}/cancel` (alias de contingencia: `/api/v3/reservas/{id}/cancel`).
  * **Cabeceras:** `X-API-Key`, `Content-Type: application/json`.
  * **Payload:** `{ "reason": string }`.
  * **Respuestas Soportadas:** `HTTP 200 OK`, `HTTP 404 Not Found`.
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/atracciones/atracciones.service.ts`, líneas 3199–3231.
  * **Lógica de Despacho:**
    ```typescript
    // atracciones.service.ts:3208-3228
    await firstValueFrom(
      this.httpService.post(
        `https://tourgirls-gateway-mm.azurewebsites.net/api/v3/atracciones/reservas/${michaelTargetId}/cancel`,
        { reason: dto?.reason || 'Cancelación solicitada por el usuario' },
        { headers: michaelHeaders, timeout: 5000 }
      )
    );
    ```
  * **Persistencia y Aforo:**
    - Se verifica que no se encuentre asistido (línea 3004).
    - Actualización de stock en base de datos PostgreSQL (`atracciones_turnos_aforo`).
    - Estado marcado como `CANCELLED`, asignación de `cancel_code` y despacho a Outbox.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

### 3.4 Dilan Mendoza — Descubre EC (`NODE_ATR_DILAN`)

* **Servicio y Dominio en la Nube:**  
  `https://descubreec.com/api/v2` / `https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3` (Azure Container Apps).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: 40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568`.
* **Auditoría del Contrato de Interfaz:**
  * Es el proveedor de referencia adoptado en los contratos centrales: `contracts/atracciones-openapi-v2.yaml:546-640`, `contracts/atracciones-openapi-v3.yaml:8, 2018, 2306`, y `contracts/schemas/atracciones.schema.json:278`.
  * **Endpoint:** `POST /reservas/{id}/cancel` (y `/api/v3/reservas/{id}/cancel`).
  * **Cabeceras:** `Idempotency-Key` (UUID v4), `X-Correlation-Id`, `X-API-Key`.
  * **Payload:** `{ "reason": string, "cancelled_at": string }`.
  * **Respuestas Soportadas:** `HTTP 200 OK` (retorna `released_stock`), `HTTP 409 Conflict` (Problem Details si ya fue asistida).
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/atracciones/acl/dilan-atracciones.adapter.ts`, líneas 199–245 (`cancelarReserva`), conectado en `atracciones.service.ts:3234`.
  * **Patrón Circuit Breaker y Timeout:**
    ```typescript
    // dilan-atracciones.adapter.ts:200-244
    this.checkCircuit();
    if (this.circuitState === CircuitState.OPEN) {
      return { status: 'CANCELLED_FALLBACK', external_sync_pending: true };
    }
    await firstValueFrom(
      this.httpService.post(`${this.BASE_URL}/reservas/${reservaId}/cancel`, {
        reason: razon,
        cancelled_at: new Date().toISOString()
      }, { headers, timeout: 5000 })
    );
    ```
  * **Persistencia y Aforo:**
    - Transición a `CANCELLED`, restitución de tickets en `atracciones_turnos_aforo`, evento outbox y log físico.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

### 3.5 Ariel Chacha — Ecuatravel (`NODE_ATR_ARIEL`)

* **Servicio y Dominio en la Nube:**  
  `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3` (Azure App Service).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: atr-ariel-ecua-travel-2026`.
* **Auditoría del Contrato de Interfaz:**
  * Especificado en `contracts/atracciones-openapi-v2.yaml` y script de validación `scripts/sync-ariel.js`.
  * **Endpoint:** `POST /api/v3/reservas/{id}/cancel`.
  * **Cabeceras:** `X-API-Key`, `Content-Type: application/json`.
  * **Payload:** `{ "reason": string }`.
  * **Respuestas Soportadas:** `HTTP 200 OK`, `HTTP 404 Not Found`, `HTTP 409 Conflict`.
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/atracciones/atracciones.service.ts`, líneas 3134–3165.
  * **Lógica de Despacho:**
    ```typescript
    // atracciones.service.ts:3142-3162
    await firstValueFrom(
      this.httpService.post(
        `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3/reservas/${partnerCancelId}/cancel`,
        { reason: dto?.reason || 'Cancelación solicitada por el usuario' },
        { headers: arielHeaders, timeout: 6000 }
      )
    );
    ```
  * **Persistencia y Aforo:**
    - Restitución de cupos en aforo de base de datos relacional (`schema_atracciones.atracciones_turnos_aforo`), evento Outbox y registro en Winston.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

## 4. AUDITORÍA INDIVIDUAL POR INTEGRANTE (RENTAL DE AUTOS)

### 4.1 Mateo Morales — Maneja de Una / MDU (`NODE_AUT_MDU`)

* **Servicio y Dominio en la Nube:**  
  `https://maneja-de-una-autos-api.azurewebsites.net/api/v3` (Azure App Service).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=`.
* **Auditoría del Contrato de Interfaz Propio:**
  * Inspección directa del Swagger OpenAPI oficial de Mateo (`scripts/mateo_swagger.json`).
  * **Rutas Expuestas en su Swagger:**
    - `POST /api/v3/autos/orders/{orderId}/cancel`
    - `POST /api/v2/autos/orders/{orderId}/cancel`
    - `POST /api/v2/reservations/{id}/cancel`
  * **DTO del Contrato:** `CancelOrderV2Dto` (`reason`: string, `motivo`: string, `solicitante`: enum `['CLIENTE', 'SAGA_ORCHESTRATOR', 'ADMIN']`).
  * **Respuestas:** `HTTP 200 OK`, `HTTP 409 Conflict` (alquiler ya iniciado).
* **Implementación en el Código del Proyecto:**
  * **Ubicación:**
    - Controlador de Autos: `src/modules/autos/autos.controller.ts`, líneas 111–134 (`POST /autos/orders/:orderId/cancel`).
    - Servicio de Autos: `src/modules/autos/autos.service.ts`, líneas 1608–1739 (`cancelOrder`).
    - Adaptador Circuit Breaker: `src/modules/autos/acl/autos-circuit-breaker.adapter.ts`, líneas 927–957 y 1001–1020.
  * **Lógica de Despacho y Manejo de Conflictos:**
    ```typescript
    // autos-circuit-breaker.adapter.ts:930-954
    await firstValueFrom(
      this.httpService.post(
        `https://maneja-de-una-autos-api.azurewebsites.net/api/v3/autos/orders/${cleanId}/cancel`,
        { reason },
        { headers: { 'X-API-Key': 'Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=' }, timeout: 5000 }
      )
    );
    ```
  * **Actualización en Base de Datos y Flota:**
    - El vehículo asociado transiciona inmediatamente a `EstadoVehiculo.DISPONIBLE` en memoria y se persiste en `schema_autos.autos_vehiculos` (`autos.service.ts:1678-1685`).
    - Emisión formal de código de reembolso `REF-AUTO-...` al 100% (`autos.service.ts:1688-1698`).
    - Orden transiciona a `CANCELLED`.
    - Llamada de sincronización al adaptador de circuito: `circuitBreakerAdapter.markOrderAsCancelled(orderId)`.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

### 4.2 Daniel González — RutaLibre (`NODE_AUT_RUTALIBRE`)

* **Servicio y Dominio en la Nube:**  
  `https://rutalibre-autos-api.azurewebsites.net/api/v3` (Azure App Service).
* **Mecanismo de Autenticación:**  
  API Key vía cabecera HTTP: `X-API-Key: LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA`.
* **Auditoría del Contrato de Interfaz:**
  * Conforme con `contracts/autos-openapi-v2.yaml:666-708` y validado en `scripts/test_daniel_integration.js`.
  * **Endpoint:** `POST /api/v3/autos/orders/{orderId}/cancel` (con fallback de ruta a `POST /api/v3/orders/{orderId}/cancel`).
  * **Cabeceras:** `X-API-Key`, `Idempotency-Key`, `Content-Type: application/json`.
  * **Payload:** `{ "reason": string }`.
  * **Respuestas:** `HTTP 200 OK`, `HTTP 404 Not Found`, `HTTP 409 Conflict`.
* **Implementación en el Código del Proyecto:**
  * **Ubicación:** `src/modules/autos/acl/autos-circuit-breaker.adapter.ts`, líneas 959–1000, y `src/modules/autos/autos.service.ts`, líneas 1608–1739.
  * **Lógica de Despacho y Resiliencia Dual:**
    ```typescript
    // autos-circuit-breaker.adapter.ts:963-993
    try {
      await firstValueFrom(
        this.httpService.post(
          `https://rutalibre-autos-api.azurewebsites.net/api/v3/autos/orders/${cleanId}/cancel`,
          { reason },
          { headers: { 'X-API-Key': key }, timeout: 4000 }
        )
      );
    } catch (err1) {
      if (err1.response?.status === 409) throw new HttpException(..., HttpStatus.CONFLICT);
      if (err1.response?.status === 404) {
        // Fallback a ruta alternativa canónica:
        await firstValueFrom(this.httpService.post(`.../api/v3/orders/${cleanId}/cancel`, ...));
      }
    }
    ```
  * **Actualización en Base de Datos y Flota:**
    - Liberación de vehículo a `DISPONIBLE`, orden a `CANCELLED`, emisión de reembolso formal `REF-AUTO-...`, CloudEvent `auto.order.cancelled` y registro en Winston.
* **Estado de Conformidad:** **IMPLEMENTADO**

---

## 5. MATRIZ CONSOLIDADA DE ESTADO POR SOCIO

| Dominio | Integrante / Socio | Nodo / Servicio | Contrato OpenAPI | Implementación Código Backend | Manejo de Estado e Inventario | Estado Final Auditoría |
|---|---|---|---|---|---|:---:|
| **Atracciones** | **Dilan Mendoza** | `NODE_ATR_DILAN` (Descubre EC) | Canónico OpenAPI v2/v3 (`POST /reservas/{id}/cancel`) | `dilan-atracciones.adapter.ts:199` y `atracciones.service.ts:3234` | Reintegra cupos en `atracciones_turnos_aforo`, estado `CANCELLED` | **IMPLEMENTADO** |
| **Atracciones** | **Ariel Chacha** | `NODE_ATR_ARIEL` (Ecuatravel) | Canónico OpenAPI v2/v3 (`POST /api/v3/reservas/{id}/cancel`) | `atracciones.service.ts:3134-3165` (con fallback de ID) | Reintegra cupos en BD y memoria; valida rechazo 409 post check-in | **IMPLEMENTADO** |
| **Atracciones** | **Alisson Basantes** | `NODE_ATR_ALISSON` (Andes Explora) | Canónico OpenAPI v2/v3 (`POST /api/v3/atracciones/reservas/{id}/cancel`) | `atracciones.service.ts:3166-3198` (dual-path `/reservas`) | Reintegra cupos en BD, estado `CANCELLED`, emite Outbox | **IMPLEMENTADO** |
| **Atracciones** | **Michael Molina** | `NODE_ATR_MOLINA` (TourGirls) | Canónico OpenAPI v2/v3 (`POST /api/v3/atracciones/reservas/{id}/cancel`) | `atracciones.service.ts:3199-3231` (dual-path `/reservas`) | Reintegra cupos en BD, estado `CANCELLED`, emite Outbox | **IMPLEMENTADO** |
| **Atracciones** | **Gloria Chushig** | `NODE_ATR_GLORIA` (Vívelo Ecuador / ms-catalog) | **NO EN CONTRATO PROPIO** (Omitido en `scripts/gloria_swagger.json`) | `atracciones.service.ts:3102-3133` (despacho con Bearer JWT) | Reintegra cupos en BD central, emite reembolso `REF-ATR-...` | **PARCIALMENTE IMPLEMENTADO / NO EN CONTRATO PROPIO** |
| **Autos** | **Mateo Morales** | `NODE_AUT_MDU` (Maneja de Una) | En Swagger propio v2/v3 (`CancelOrderV2Dto`) y OpenAPI canónico | `autos.controller.ts:111`, `autos.service.ts:1608`, `autos-circuit-breaker.adapter.ts:927` | Vehículo pasa a `DISPONIBLE`, orden a `CANCELLED`, reembolso 100% | **IMPLEMENTADO** |
| **Autos** | **Daniel González** | `NODE_AUT_RUTALIBRE` (RutaLibre) | Canónico OpenAPI v2/v3 (`POST /api/v3/autos/orders/{id}/cancel`) | `autos-circuit-breaker.adapter.ts:959`, `autos.service.ts:1608` | Vehículo pasa a `DISPONIBLE`, orden a `CANCELLED`, reembolso 100% | **IMPLEMENTADO** |

---

## 6. VALIDACIÓN TÉCNICA DEL PATRÓN SAGA Y COMPENSACIÓN

### 6.1 Arquitectura del Orquestador Central
* **Clase Responsable:** `SagaOrchestratorService` en `src/modules/esb/interna/saga-orchestrator.service.ts`.
* **Punto de Entrada ESB:** `EsbController` en `src/modules/esb/esb.controller.ts`, endpoint `POST /api/v2/esb/checkout-saga`.
* **Modelo de Persistencia de la Transacción Distribuida:**
  * Tabla Maestra: `schema_auditoria.saga_transacciones` (`src/modules/esb/entities/saga-transaccion.entity.ts`). Registra `correlation_id`, `estado` (`IN_PROGRESS`, `COMPENSATING`, `COMPLETED`, `FAILED`, `COMPENSATION_FAILED`), montos totales y metadatos.
  * Bitácora de Pasos (Journal): `schema_auditoria.saga_pasos_journal` (`src/modules/esb/entities/saga-paso-journal.entity.ts`). Registra cada paso individual ejecutado con éxito, los datos de la operación, el timestamp y el estado de la compensación.
* **Aislamiento de Persistencia (Criterio CE02):** El orquestador interactúa exclusivamente a través de las interfaces de servicio de cada dominio (`AtraccionesService`, `AutosService`, `PagosService`, `FinanzasService`). **No existen SQL JOINs entre tablas de diferentes módulos**.

```
                           ┌────────────────────────┐
                           │   Cliente / Gateway    │
                           └───────────┬────────────┘
                                       │ POST /api/v2/esb/checkout-saga
                                       ▼
                           ┌────────────────────────┐
                           │     EsbController      │
                           └───────────┬────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       SagaOrchestratorService                               │
 │                                                                             │
 │  1. executeWithTimeout (5s per step - CE01)                                 │
 │  2. SAGA_STARTED -> RabbitMQ                                               │
 │  3. Journaling: schema_auditoria.saga_pasos_journal                          │
 └───────┬─────────────────────────────┬───────────────────────────────┬───────┘
         │ (Paso 1: Reserva)           │ (Paso 2: Cobro)               │ (Paso 3: Finanzas)
         ▼                             ▼                               ▼
 ┌───────────────┐             ┌───────────────┐               ┌───────────────┐
 │ MS Atracciones│             │   MS Pagos    │               │  MS Finanzas  │
 │  & MS Autos   │             │               │               │               │
 └───────┬───────┘             └───────┬───────┘               └───────┬───────┘
         │ Compensación                │ Compensación                  │
         │ LIFO: cancelar              │ LIFO: reembolsar              │
         ▼                             ▼                               ▼
   [Paso.pop()]                  [Paso.pop()]                          │
         ▲                             ▲                               │
         └─────────────────────────────┴───────────────────────────────┘
                     (Orden Inverso LIFO ante Excepción)
```

### 6.2 Flujo Hacia Adelante (Forward Reservation Flow)
1. **Control de Timeout Perimetral Estricto (5 Segundos — CE01):**
   - Implementado mediante la función `executeWithTimeout(promise, 5000, fallback)` (`saga-orchestrator.service.ts:92-115`).
   - Evita el bloqueo del hilo de Node.js ante eventuales caídas o latencias en los microservicios externos de Azure.
2. **Paso 1 — Reserva de Inventario en Dominios Verticales:**
   - **Atracciones (`MS_ATR`):** Invoca `this.atraccionesService.reservar(...)` (líneas 186–201). Apila dinámicamente en memoria la función de cierre compensatorio:
     ```typescript
     // saga-orchestrator.service.ts:208-216
     compensacion_fn: async () => {
       return this.atraccionesService!.cancelarReserva(
         reservaGenerada.reservation_id,
         { reason: 'Rollback compensatorio automático Saga' },
         `idem-comp-${correlationId}`,
         correlationId
       );
     }
     ```
   - **Autos (`MS_AUT`):** Invoca `this.autosService.createOrder(...)` (líneas 218–232). Apila la función compensatoria:
     ```typescript
     // saga-orchestrator.service.ts:238-245
     compensacion_fn: async () => {
       return this.autosService!.cancelOrder(
         reservaGenerada.pnr,
         { reason: 'Rollback compensatorio automático Saga' },
         `idem-comp-${correlationId}`
       );
     }
     ```
   - Cada reserva exitosa genera una entrada en el Journal relacional (`SagaPasoJournal`) y emite el evento `SAGA_STEP_COMPLETED`.
3. **Paso 2 — Cobro Síncrono Transaccional (`MS_PAG`):**
   - Se ejecuta `this.pagosService.procesarPago(...)` con timeout de 5000 ms (líneas 309–326).
   - Apila la compensación de reverso financiero: `this.pagosService.procesarReembolso(...)` (líneas 333–347).
4. **Paso 3 — Registro y Liquidación de Comisiones (`MS_FIN`):**
   - Ejecuta `this.finanzasService.registrarVentaYCalcularComision(...)` (líneas 373–382).
5. **Cierre Exitoso:**
   - La saga se sella como `'COMPLETED'`, emite el CloudEvent `ORDER_CONFIRMED` hacia RabbitMQ mediante `KafkaRabbitBridgeService` y escribe en el log de auditoría física Winston.

### 6.3 Flujo Hacia Atrás (Backward Compensation Flow — LIFO)
1. **Captura del Fallo:**
   - Si ocurre una excepción en cualquier paso (ej. fondos insuficientes o timeout de pasarela en `MS_PAG`), el bloque `catch (error)` se activa (`saga-orchestrator.service.ts:431-561`).
2. **Transición Inmediata a `'COMPENSATING'`:**
   - Se genera el código formal de compensación `codigoCompensacion = 'REF-SAGA-' + crypto.randomBytes(3).toString('hex').toUpperCase()` y se publica el evento `SAGA_COMPENSATING` en RabbitMQ.
3. **Desapilado en Orden LIFO Estricto:**
   - Las compensaciones se extraen secuencialmente mediante:
     ```typescript
     while (pasosEjecutadosConExito.length > 0) {
       const paso = pasosEjecutadosConExito.pop();
       // ... ejecuta paso.compensacion_fn()
     }
     ```
   - Esto garantiza que si el pago llegó a procesarse, **primero se reembolsa el dinero en `MS_PAG`, luego se cancela el vehículo en `MS_AUT`, y finalmente se libera el aforo en `MS_ATR`**.
4. **Política de Reintentos de Compensación:**
   - Cada paso compensatorio cuenta con un ciclo de hasta **2 reintentos** (`maxReintentos = 2`, líneas 460–483) con espera de backoff.
5. **Manejo de Errores Críticos (`COMPENSATION_FAILED`):**
   - Si un microservicio externo no responde tras agotar los reintentos, el orquestador **no silencia el error**: marca la transacción como `'COMPENSATION_FAILED'`, emite la alerta crítica de seguridad en Winston (`SAGA_COMPENSATION_FAILED_CRITICAL`), y despacha `SAGA_STEP_FAILED` a RabbitMQ para conciliación manual.
   - Si todos los pasos se compensan correctamente, la saga transiciona a `'FAILED'` (o `'COMPENSATED'`) y se audita `SAGA_CHECKOUT_ROLLBACK_COMPENSADO`.
6. **Respuesta Estandarizada al Cliente:**
   - Retorna un `HTTP 409 Conflict` bajo RFC 7807 (`type: ".../saga-rollback"`), detallando cada paso revertido y el comprobante `REF-SAGA-...`.

---

## 7. EVIDENCIAS TÉCNICAS Y SUITES DE PRUEBAS AUTOMATIZADAS

### 7.1 Suite de Integración de la Saga Transaccional
La suite automatizada oficial se encuentra en `test/i05-saga-compensacion.spec.ts`. Cubre 5 escenarios exhaustivos:
1. **Camino Feliz:** Ejecución multidominio completa (Atracciones + Autos + Pagos + Finanzas) $\to$ Estado `COMPLETED`.
2. **Reversión LIFO por Rechazo de Pago:** Falla simulada en `MS_PAG` (`RECHAZO_FONDOS`) $\to$ Verifica que `executionOrderLog` ejecute `COMP:CANCELAR_AUTO` y luego `COMP:CANCELAR_ATRACCION`.
3. **Escalamiento a `COMPENSATION_FAILED`:** Simulación de fallo en el conector externo que agota los 2 reintentos $\to$ Valida alerta crítica Winston y estado en BD.
4. **Control de Idempotencia:** Reenvío de la misma `Idempotency-Key` $\to$ Evita duplicidad transaccional.
5. **Resiliencia ante Caída de RabbitMQ:** Falla en el broker de mensajería no interrumpe la compensación central en base de datos.

*Comando de Verificación:*
```powershell
npx jest --rootDir . test/i05-saga-compensacion.spec.ts --verbose
```
*Resultado:* **5 tests passed, 100% exitoso.**

### 7.2 Comprobación Programática de Swaggers Públicos
Script de validación entre el Swagger de Gloria Chushig y el de Mateo Morales:
```powershell
node -e "const fs = require('fs'); const g = JSON.parse(fs.readFileSync('scripts/gloria_swagger.json')); console.log('Rutas Gloria con cancel:', Object.keys(g.paths).filter(p => p.includes('cancel'))); const m = JSON.parse(fs.readFileSync('scripts/mateo_swagger.json')); console.log('Rutas Mateo con cancel:', Object.keys(m.paths).filter(p => p.includes('cancel')));"
```
*Salida:*
* Rutas Gloria: `[]` (Sin endpoint `/cancel` en su contrato público).
* Rutas Mateo: `[ '/api/v2/autos/orders/{orderId}/cancel', '/api/v3/autos/orders/{orderId}/cancel', '/api/v2/reservations/{id}/cancel' ]`.

---

## 8. CONCLUSIONES Y RECOMENDACIONES TÉCNICAS

1. **Robustez de la Cancelación y la Saga:**  
   El backend central de Booking cuenta con una arquitectura de orquestación distribuida madura y sólida. La implementación del patrón Saga en `SagaOrchestratorService` cumple a cabalidad con los principios teóricos de transaccionalidad por compensación y los requerimientos de la Rúbrica RDA2 (§8).
2. **Recomendación para Gloria Chushig:**  
   Se recomienda al equipo de Gloria publicar formalmente la operación `POST /api/v3/atracciones/reservas/{id}/cancel` en la especificación OpenAPI de su microservicio `ms-catalog` para alinearse plenamente con los contratos canónicos del marketplace. Mientras tanto, los mecanismos de fallback y desacoplamiento implementados en Booking garantizan la continuidad operativa y la liberación local del aforo.
3. **Protección Perimetral Garantizada:**  
   La combinación de límites de tiempo de 5 segundos (`executeWithTimeout`), Circuit Breakers individuales y bitácora persistente en `schema_auditoria` protege eficazmente al sistema frente a fallos en cascada provocados por microservicios de terceros.
