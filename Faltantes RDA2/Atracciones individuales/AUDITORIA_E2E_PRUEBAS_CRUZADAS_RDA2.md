# 🛡️ Informe Oficial de Auditoría E2E: Pruebas Cruzadas Bidireccionales (RDA2)

> **Plataforma Integradora Central:** Booking Prototipo (Azure App Service: `https://booking-core-api.azurewebsites.net/api/v3`)  
> **Broker Dual:** CloudAMQP Shark Broker (`amqps://shark.rmq.cloudamqp.com/qkvqjvku`) & Apache Kafka  
> **Fecha de Certificación en Vivo:** 4/11/2026, 11:53:53 a. m.  
> **Responsable:** Paúl Rosero (Líder Técnico de Integración - Booking Central)  
> **Cobertura Global Bidireccional:** **35 / 35 Pruebas Exitosas (100%)**

---

## 1. Matriz Consolidada de Pruebas Cruzadas Bidireccionales

| # | Compañero | Vertical | Nodo | Flujo 1A: Socio -> Booking | Flujo 1B: Booking -> Socio | Idempotencia | Saga LIFO | Promociones B2B | Estado Final |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Dilan Mendoza** | ATRACCIONES | `NODE_ATR_DILAN` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 2 | **Ariel Chacha** | ATRACCIONES | `NODE_ATR_ARIEL` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 3 | **Gloria Chushig** | ATRACCIONES | `NODE_ATR_GLORIA` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 4 | **Alisson Basantes** | ATRACCIONES | `NODE_ATR_ALISSON` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 5 | **Michael Molina** | ATRACCIONES | `NODE_ATR_MOLINA` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 6 | **Daniel González** | AUTOS | `NODE_AUT_RUTALIBRE` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 7 | **Mateo Morales** | AUTOS | `NODE_AUT_MDU` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |

---

## 2. Explicación de los Flujos de Prueba Cruzada Evaluados

1. **Flujo 1A (Socio individual -> Booking Central):**  
   Se reserva en la página web o API individual del compañero hasta agotar cupos o fijar entrega de auto. El cambio de stock se notifica/sincroniza con Booking Central. Desde Booking Central se intenta reservar ese mismo recurso agotado o en período de limpieza (14:00 tras entrega a las 13:00). **Booking Central rechaza con HTTP 409 Conflict** (`OUT_OF_STOCK` o `VEHICLE_IN_CLEANING_COOLDOWN`).

2. **Flujo 1B (Booking Central -> Socio individual — Flujo Reverso):**  
   El cliente realiza la reserva desde la plataforma integradora **Booking Central**. La reserva es confirmada por el microservicio del socio, consumiendo los cupos del turno o pasando el auto a estado `RESERVADO`. Inmediatamente, un usuario directo entra a la **página web / API individual del socio** e intenta reservar para ese mismo horario / período. **La API individual del socio rechaza con HTTP 409 Conflict**, garantizando aislamiento atómico e imposibilitando la sobreventa en ambas direcciones.

3. **Prueba 2 (Idempotencia Transaccional UUID v4):**  
   Ataque de doble clic simultáneo con la misma cabecera `Idempotency-Key`. El microservicio debe responder idéntico resultado sin duplicar cargos ni reservas.

4. **Prueba 3 (Compensación Saga LIFO con Reembolso 100%):**  
   Cancelación formal de la reserva creada (`POST .../cancel`), liberando inmediatamente el inventario a `DISPONIBLE` y generando el identificador de reembolso.

5. **Prueba 4 (Acuerdo Comercial B2B Promociones y Combos):**  
   Consulta de `GET .../promociones/contrato` validando el porcentaje de descuento acordado (15%).

---

## 3. Auditoría Detallada y Evidencias por Compañero

### 🟢 3.1. Dilan Mendoza — Descubre EC (`NODE_ATR_DILAN`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3`
* **API Key:** `40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1559 ms | Tras reservar 14 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 933 ms | La reserva efectuada desde Booking Central consumió el aforo (14 cupos). Al intentar comprar 2 cupos directamente en la página individual de Descubre EC, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 427 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (DEC-UEWJ6R) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2856 ms | Reserva cancelada exitosamente. Se liberaron los 14 cupos del aforo y se emitió reembolso: REM-000000156 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 406 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Dilan Mendoza** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Dilan Mendoza:

> ¡Excelente trabajo, Dilan! 🎉
>
> Tu sistema **Descubre EC (`NODE_ATR_DILAN`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (1559 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (933 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (427 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2856 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (406 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.2. Ariel Chacha — Ecuatravel (`NODE_ATR_ARIEL`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3`
* **API Key:** `atr-ariel-ecua-travel-2026`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 390 ms | Tras reservar 12 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 682 ms | La reserva efectuada desde Booking Central consumió el aforo (12 cupos). Al intentar comprar 2 cupos directamente en la página individual de Ecuatravel, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 474 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ECT-6CHTV9) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2175 ms | Reserva cancelada exitosamente. Se liberaron los 12 cupos del aforo y se emitió reembolso: REF-ECT-6CHTV9 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 695 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Ariel Chacha** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Ariel Chacha:

> ¡Excelente trabajo, Ariel! 🎉
>
> Tu sistema **Ecuatravel (`NODE_ATR_ARIEL`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (390 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (682 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (474 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2175 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (695 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.3. Gloria Chushig — Vívelo Ecuador (`NODE_ATR_GLORIA`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3`
* **API Key:** `No requerida`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 2116 ms | Tras reservar 30 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1991 ms | La reserva efectuada desde Booking Central consumió el aforo (30 cupos). Al intentar comprar 2 cupos directamente en la página individual de Vívelo Ecuador, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 1202 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (e59c1c72-c905-4d8c-8e0e-1ffdddddeb1f) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2073 ms | Reserva cancelada exitosamente. Se liberaron los 30 cupos del aforo y se emitió reembolso: OK |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 458 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Gloria Chushig** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Gloria Chushig:

> ¡Excelente trabajo, Gloria! 🎉
>
> Tu sistema **Vívelo Ecuador (`NODE_ATR_GLORIA`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (2116 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (1991 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (1202 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2073 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (458 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.4. Alisson Basantes — Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://alisson-atracciones-api.azurewebsites.net/api/v3`
* **API Key:** `atr-f575172d62a81d51e87fbc0a37952d984ce1c078`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1595 ms | Tras reservar 20 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1854 ms | La reserva efectuada desde Booking Central consumió el aforo (20 cupos). Al intentar comprar 2 cupos directamente en la página individual de Atracciones Turísticas del Ecuador, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 1480 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ATR-BKT3PDK) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2864 ms | Reserva cancelada exitosamente. Se liberaron los 20 cupos del aforo y se emitió reembolso: REF-ATR-BKT3PDK |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 382 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Alisson Basantes** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Alisson Basantes:

> ¡Excelente trabajo, Alisson! 🎉
>
> Tu sistema **Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (1595 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (1854 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (1480 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2864 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (382 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.5. Michael Molina — TourGirls (`NODE_ATR_MOLINA`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://tourgirls-gateway-mm.azurewebsites.net/api/v3`
* **API Key:** `Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 11977 ms | Tras reservar 20 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 7200 ms | La reserva efectuada desde Booking Central consumió el aforo (20 cupos). Al intentar comprar 2 cupos directamente en la página individual de TourGirls, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 492 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (DEC-J5PMGC) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 5622 ms | Reserva cancelada exitosamente. Se liberaron los 20 cupos del aforo y se emitió reembolso: REF-ATR-49D6P9 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 1808 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Michael Molina** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Michael Molina:

> ¡Excelente trabajo, Michael! 🎉
>
> Tu sistema **TourGirls (`NODE_ATR_MOLINA`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (11977 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (7200 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (492 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (5622 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (1808 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.6. Daniel González — RutaLibre (`NODE_AUT_RUTALIBRE`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://rutalibre-autos-api.azurewebsites.net/api/v3`
* **API Key:** `LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-AUT-01A` | **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (VEHICLE_IN_CLEANING_COOLDOWN / VEHICLE_UNAVAILABLE)` | `HTTP 409 (Rechazado exitosamente)` | 589 ms | El sistema bloqueó la renta solicitada para las 14:00:00 porque el vehículo entregado a las 13:00:00 se encuentra en ventana de desinfección obligatoria de 120 minutos (ADR-004). |
| `TEST-AUT-01B` | **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (VEHICLE_UNAVAILABLE / VEHICULO_NO_DISPONIBLE)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 468 ms | La reserva realizada desde Booking Central fijó el auto auto-pdb-1517 en estado RESERVADO. Al intentar reservarlo directamente desde la página individual de RutaLibre, el sistema rechazó la solicitud con HTTP 409 (VEHICLE_UNAVAILABLE: El vehículo ya está reservado o en el taller en esas fechas). |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 333 ms | La petición duplicada fue interceptada por el guard de idempotencia devolviendo la misma respuesta (PNR: CAR532X9) sin duplicar el cobro ni crear otra orden. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 200` | 589 ms | Vehículo auto-pdb-1517 liberado a DISPONIBLE y compensación ejecutada: Reembolso 100% (REF-AUTO-532X9). |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 200` | 290 ms | Términos recuperados: Descuento autorizado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Daniel González** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Daniel González:

> ¡Excelente trabajo, Daniel! 🎉
>
> Tu sistema **RutaLibre (`NODE_AUT_RUTALIBRE`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** (*Socio individual -> Booking Central*): APROBADO (589 ms)
> - ✅ **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** (*Booking Central -> Socio individual*): APROBADO (468 ms)
> - ✅ **Idempotencia Transaccional en Renta de Autos** (*Idempotency Guard Bidireccional*): APROBADO (333 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (589 ms)
> - ✅ **Acuerdo B2B de Combos y Descuento en Flota** (*B2B Commercial Contract*): APROBADO (290 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟢 3.7. Mateo Morales — MANEJA DE UNA (`NODE_AUT_MDU`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://maneja-de-una-autos-api.azurewebsites.net/api/v3`
* **API Key:** `Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-AUT-01A` | **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (VEHICLE_IN_CLEANING_COOLDOWN / VEHICLE_UNAVAILABLE)` | `HTTP 409 (Rechazado exitosamente)` | 188 ms | El sistema bloqueó la renta solicitada para las 14:00 porque el vehículo entregado a las 13:00 se encuentra en ventana de desinfección obligatoria de 120 minutos (ADR-004). |
| `TEST-AUT-01B` | **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (VEHICLE_UNAVAILABLE / VEHICULO_NO_DISPONIBLE)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 181 ms | La reserva realizada desde Booking Central fijó el auto 10000000-0000-4000-8000-000000000118 en estado RESERVADO. Al intentar reservarlo directamente desde la página individual de MANEJA DE UNA, el sistema rechazó la solicitud con HTTP 409 (VEHICLE_UNAVAILABLE: El vehículo ya está reservado para ese período.). |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 215 ms | La petición duplicada fue interceptada por el guard de idempotencia devolviendo la misma respuesta (PNR: MDU-39239390) sin duplicar el cobro ni crear otra orden. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 200` | 276 ms | Vehículo 10000000-0000-4000-8000-000000000118 liberado a DISPONIBLE y compensación ejecutada: Reembolso 100% (PROCESADO). |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 200` | 189 ms | Términos recuperados: Descuento autorizado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Mateo Morales** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Mateo Morales:

> ¡Excelente trabajo, Mateo! 🎉
>
> Tu sistema **MANEJA DE UNA (`NODE_AUT_MDU`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** (*Socio individual -> Booking Central*): APROBADO (188 ms)
> - ✅ **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** (*Booking Central -> Socio individual*): APROBADO (181 ms)
> - ✅ **Idempotencia Transaccional en Renta de Autos** (*Idempotency Guard Bidireccional*): APROBADO (215 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (276 ms)
> - ✅ **Acuerdo B2B de Combos y Descuento en Flota** (*B2B Commercial Contract*): APROBADO (189 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

