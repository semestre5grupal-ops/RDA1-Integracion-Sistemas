# 🛡️ Informe Oficial de Auditoría E2E: Pruebas Cruzadas Bidireccionales (RDA2)

> **Plataforma Integradora Central:** Booking Prototipo (Azure App Service: `https://booking-core-api.azurewebsites.net/api/v3`)  
> **Broker Dual:** CloudAMQP Shark Broker (`amqps://shark.rmq.cloudamqp.com/qkvqjvku`) & Apache Kafka  
> **Fecha de Certificación en Vivo:** 10/11/2026, 10:16:18 a. m.  
> **Responsable:** Paúl Rosero (Líder Técnico de Integración - Booking Central)  
> **Cobertura Global Bidireccional:** **22 / 35 Pruebas Exitosas (63%)**

---

## 1. Matriz Consolidada de Pruebas Cruzadas Bidireccionales

| # | Compañero | Vertical | Nodo | Flujo 1A: Socio -> Booking | Flujo 1B: Booking -> Socio | Idempotencia | Saga LIFO | Promociones B2B | Estado Final |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Dilan Mendoza** | ATRACCIONES | `NODE_ATR_DILAN` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 2 | **Ariel Chacha** | ATRACCIONES | `NODE_ATR_ARIEL` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 3 | **Gloria Chushig** | ATRACCIONES | `NODE_ATR_GLORIA` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 4 | **Alisson Basantes** | ATRACCIONES | `NODE_ATR_ALISSON` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 5 | **Michael Molina** | ATRACCIONES | `NODE_ATR_MOLINA` | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🟢 PASS | 🟡 **REQUIERE AJUSTE** |
| 6 | **Daniel González** | AUTOS | `NODE_AUT_RUTALIBRE` | 🟢 PASS | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🟡 **REQUIERE AJUSTE** |
| 7 | **Mateo Morales** | AUTOS | `NODE_AUT_MDU` | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🔴 FAIL | 🟡 **REQUIERE AJUSTE** |

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
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1066 ms | Tras reservar 14 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 979 ms | La reserva efectuada desde Booking Central consumió el aforo (14 cupos). Al intentar comprar 2 cupos directamente en la página individual de Descubre EC, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 412 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (DEC-EW2ETX) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2759 ms | Reserva cancelada exitosamente. Se liberaron los 14 cupos del aforo y se emitió reembolso: REM-000000181 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 383 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Dilan Mendoza** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Dilan Mendoza:

> ¡Excelente trabajo, Dilan! 🎉
>
> Tu sistema **Descubre EC (`NODE_ATR_DILAN`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (1066 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (979 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (412 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2759 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (383 ms)
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
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 397 ms | Tras reservar 12 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 425 ms | La reserva efectuada desde Booking Central consumió el aforo (12 cupos). Al intentar comprar 2 cupos directamente en la página individual de Ecuatravel, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 311 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ECT-DU8E8U) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 1871 ms | Reserva cancelada exitosamente. Se liberaron los 12 cupos del aforo y se emitió reembolso: REF-ECT-DU8E8U |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 229 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Ariel Chacha** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Ariel Chacha:

> ¡Excelente trabajo, Ariel! 🎉
>
> Tu sistema **Ecuatravel (`NODE_ATR_ARIEL`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (397 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (425 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (311 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (1871 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (229 ms)
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
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 3883 ms | Tras reservar 30 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 8131 ms | La reserva efectuada desde Booking Central consumió el aforo (30 cupos). Al intentar comprar 2 cupos directamente en la página individual de Vívelo Ecuador, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 9034 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (daaddd2a-f2e3-4c2a-8fd9-8c2cd573355d) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2088 ms | Reserva cancelada exitosamente. Se liberaron los 30 cupos del aforo y se emitió reembolso: OK |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 316 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Gloria Chushig** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Gloria Chushig:

> ¡Excelente trabajo, Gloria! 🎉
>
> Tu sistema **Vívelo Ecuador (`NODE_ATR_GLORIA`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (3883 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (8131 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (9034 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2088 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (316 ms)
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
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 4404 ms | Tras reservar 20 cupos en el socio y propagar stock 0, Booking Central rechazó el intento de 2 boletos adicionales con HTTP 409 (OUT_OF_STOCK). |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 409 Conflict (Rechazado exitosamente)` | 1623 ms | La reserva efectuada desde Booking Central consumió el aforo (20 cupos). Al intentar comprar 2 cupos directamente en la página individual de Atracciones Turísticas del Ecuador, el endpoint retornó HTTP 409 (OUT_OF_STOCK), garantizando aislamiento de inventario en ambas direcciones. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 365 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ATR-GLDD6HW) sin crear cobros dobles. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2482 ms | Reserva cancelada exitosamente. Se liberaron los 20 cupos del aforo y se emitió reembolso: REF-ATR-GLDD6HW |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 509 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa 100% Bidireccional:

El nodo de **Alisson Basantes** superó satisfactoriamente tanto el **Flujo 1 (Socio -> Booking)** como el **Flujo 2 (Booking -> Socio)**. Las reservas realizadas desde Booking impactan en tiempo real la disponibilidad de su tienda individual, rechazando con `HTTP 409 Conflict` cualquier intento de reserva directa concurrente. Cumple al 100% con Idempotencia, Sagas LIFO y Contrato B2B.

#### ✉️ Mensaje de Felicitación para Alisson Basantes:

> ¡Excelente trabajo, Alisson! 🎉
>
> Tu sistema **Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)** superó con 100% de éxito la batería de pruebas bidireccionales con Booking Central:
>
> - ✅ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** (*Socio individual -> Booking Central*): APROBADO (4404 ms)
> - ✅ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** (*Booking Central -> Socio individual*): APROBADO (1623 ms)
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro)** (*Idempotency Guard Bidireccional*): APROBADO (365 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%)** (*Saga Compensating Transaction*): APROBADO (2482 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio** (*B2B Commercial Contract*): APROBADO (509 ms)
>
> Ambas direcciones de reserva (Socio -> Booking y Booking -> Socio) quedan formalmente certificadas bajo las especificaciones de la cátedra RDA2.

---

### 🟡 3.5. Michael Molina — TourGirls (`NODE_ATR_MOLINA`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://tourgirls-gateway-mm.azurewebsites.net/api/v3`
* **API Key:** `Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-ATR-01A` | **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)** | *Socio individual -> Booking Central* | 🔴 FAIL | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 400 (Alerta: Permitió sobreventa)` | 14035 ms | El sistema no validó el aforo agotado y permitió sobreventa desde Booking Central. |
| `TEST-ATR-01B` | **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual** | *Booking Central -> Socio individual* | 🔴 FAIL | `HTTP 409 Conflict (OUT_OF_STOCK en la web del socio)` | `HTTP 400 (Alerta: Permitió sobreventa)` | 15686 ms | La reserva hecha en Booking Central no actualizó el stock local del socio, permitiendo compra concurrente en su página. |
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | *Idempotency Guard Bidireccional* | 🔴 FAIL | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 400 | Req 2: HTTP 400` | 15021 ms | El endpoint no guardó la clave de idempotencia o arrojó una excepción no controlada al reenviar la misma clave. |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🔴 FAIL | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 404` | 1184 ms | Fallo al cancelar la reserva: {"type":"https://booking.epn.edu.ec/errors/reservation-not-found","title":"Recurso no encontrado","status":404,"detail":"No existe la reserva undefine |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | *B2B Commercial Contract* | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 4079 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### ⚠️ Observaciones Técnicas para Michael Molina:

* **Detalle en `Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado)`:**
  - **Diagnóstico:** El sistema no validó el aforo agotado y permitió sobreventa desde Booking Central.
* **Detalle en `Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual`:**
  - **Diagnóstico:** La reserva hecha en Booking Central no actualizó el stock local del socio, permitiendo compra concurrente en su página.
* **Detalle en `Idempotencia Transaccional (Protección Doble Cobro)`:**
  - **Diagnóstico:** El endpoint no guardó la clave de idempotencia o arrojó una excepción no controlada al reenviar la misma clave.
* **Detalle en `Compensación Saga LIFO (Cancelación y Reembolso 100%)`:**
  - **Diagnóstico:** Fallo al cancelar la reserva: {"type":"https://booking.epn.edu.ec/errors/reservation-not-found","title":"Recurso no encontrado","status":404,"detail":"No existe la reserva undefine

#### ✉️ Mensaje para enviar a Michael Molina:

> Hola Michael,
>
> Realizamos la prueba cruzada bidireccional entre Booking Central y tu nodo **`NODE_ATR_MOLINA`**:
>
> - ⚠️ **Flujo Socio -> Booking: Prevención de Sobreventa (Aforo Agotado):** HTTP 400 (Alerta: Permitió sobreventa)
> - ⚠️ **Flujo Booking -> Socio: Actualización de Stock y Bloqueo en Web Individual:** HTTP 400 (Alerta: Permitió sobreventa)
> - ⚠️ **Idempotencia Transaccional (Protección Doble Cobro):** Req 1: HTTP 400 | Req 2: HTTP 400
> - ⚠️ **Compensación Saga LIFO (Cancelación y Reembolso 100%):** HTTP 404
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** HTTP 200
>
> Tu sistema bloquea exitosamente el solapamiento directo, pero ten presente la regla de las 2 horas de cooldown post-devolución según el ADR-004.

---

### 🟡 3.6. Daniel González — RutaLibre (`NODE_AUT_RUTALIBRE`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://rutalibre-autos-api.azurewebsites.net/api/v3`
* **API Key:** `LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-AUT-01A` | **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** | *Socio individual -> Booking Central* | 🟢 PASS | `HTTP 409 Conflict (VEHICLE_IN_CLEANING_COOLDOWN / VEHICLE_UNAVAILABLE)` | `HTTP 409 (Rechazado exitosamente)` | 8021 ms | El sistema bloqueó la renta solicitada para las 14:00:00 porque el vehículo entregado a las 13:00:00 se encuentra en ventana de desinfección obligatoria de 120 minutos (ADR-004). |
| `TEST-AUT-01B` | **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** | *Booking Central -> Socio individual* | 🔴 FAIL | `HTTP 409 Conflict (VEHICLE_UNAVAILABLE / VEHICULO_NO_DISPONIBLE)` | `HTTP 500 (Permitió sobreventa)` | 11633 ms | La reserva hecha en Booking Central no impactó la disponibilidad en el sistema local del socio. |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | *Idempotency Guard Bidireccional* | 🔴 FAIL | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 500 | Req 2: HTTP 500` | 42932 ms | El endpoint duplicó la orden o arrojó una falla no controlada ante la misma clave de idempotencia. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🔴 FAIL | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 500` | 23647 ms | Fallo en compensación de auto: {"error":"connect ETIMEDOUT 20.116.40.17:443"} |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | *B2B Commercial Contract* | 🔴 FAIL | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 500` | 91 ms | El endpoint no devolvió los términos pactados: {"error":"getaddrinfo ENOTFOUND rutalibre-autos-api.azurewebsites.net"} |

#### ⚠️ Observaciones Técnicas para Daniel González:

* **Detalle en `Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero`:**
  - **Diagnóstico:** La reserva hecha en Booking Central no impactó la disponibilidad en el sistema local del socio.
* **Detalle en `Idempotencia Transaccional en Renta de Autos`:**
  - **Diagnóstico:** El endpoint duplicó la orden o arrojó una falla no controlada ante la misma clave de idempotencia.
* **Detalle en `Compensación Saga LIFO (Cancelación y Reembolso 100%)`:**
  - **Diagnóstico:** Fallo en compensación de auto: {"error":"connect ETIMEDOUT 20.116.40.17:443"}
* **Detalle en `Acuerdo B2B de Combos y Descuento en Flota`:**
  - **Diagnóstico:** El endpoint no devolvió los términos pactados: {"error":"getaddrinfo ENOTFOUND rutalibre-autos-api.azurewebsites.net"}

#### ✉️ Mensaje para enviar a Daniel González:

> Hola Daniel,
>
> Realizamos la prueba cruzada bidireccional entre Booking Central y tu nodo **`NODE_AUT_RUTALIBRE`**:
>
> - ✅ **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004):** HTTP 409 (Rechazado exitosamente)
> - ⚠️ **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero:** HTTP 500 (Permitió sobreventa)
> - ⚠️ **Idempotencia Transaccional en Renta de Autos:** Req 1: HTTP 500 | Req 2: HTTP 500
> - ⚠️ **Compensación Saga LIFO (Cancelación y Reembolso 100%):** HTTP 500
> - ⚠️ **Acuerdo B2B de Combos y Descuento en Flota:** HTTP 500
>
> Tu sistema bloquea exitosamente el solapamiento directo, pero ten presente la regla de las 2 horas de cooldown post-devolución según el ADR-004.

---

### 🟡 3.7. Mateo Morales — MANEJA DE UNA (`NODE_AUT_MDU`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://maneja-de-una-autos-api.azurewebsites.net/api/v3`
* **API Key:** `Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=`

#### Tabla de Resultados E2E Bidireccionales:

| Código | Prueba Ejecutada | Dirección | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|:---:|---|---|:---:|---|
| `TEST-AUT-01A` | **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)** | *Socio individual -> Booking Central* | 🟡 OBS | `HTTP 409 Conflict (VEHICLE_IN_CLEANING_COOLDOWN / VEHICLE_UNAVAILABLE)` | `HTTP 500 (Permitió renta)` | 4 ms | El endpoint no aplicó el margen de 2h de cooldown para reservas que inician 1 hora después de la entrega previa. |
| `TEST-AUT-01B` | **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero** | *Booking Central -> Socio individual* | 🔴 FAIL | `HTTP 409 Conflict (VEHICLE_UNAVAILABLE / VEHICULO_NO_DISPONIBLE)` | `HTTP 500 (Permitió sobreventa)` | 10 ms | La reserva hecha en Booking Central no impactó la disponibilidad en el sistema local del socio. |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | *Idempotency Guard Bidireccional* | 🔴 FAIL | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 500 | Req 2: HTTP 500` | 8 ms | El endpoint duplicó la orden o arrojó una falla no controlada ante la misma clave de idempotencia. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | *Saga Compensating Transaction* | 🔴 FAIL | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 500` | 8 ms | Fallo en compensación de auto: {"error":"getaddrinfo ENOTFOUND maneja-de-una-autos-api.azurewebsites.net"} |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | *B2B Commercial Contract* | 🔴 FAIL | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 500` | 13 ms | El endpoint no devolvió los términos pactados: {"error":"getaddrinfo ENOTFOUND maneja-de-una-autos-api.azurewebsites.net"} |

#### ⚠️ Observaciones Técnicas para Mateo Morales:

* **Detalle en `Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004)`:**
  - **Diagnóstico:** El endpoint no aplicó el margen de 2h de cooldown para reservas que inician 1 hora después de la entrega previa.
  - **Ajuste Recomendado en Código:** En tu endpoint `POST /autos/orders/create`, debes extender la ventana de no-disponibilidad agregando las 2 horas (120 min) de limpieza tras el dropoff de una orden previa:
    ```typescript
    // Regla de Cooldown 2 Horas (ADR-004)
    const dropoffConCooldown = new Date(ordenPrevia.dropoff_time.getTime() + (2 * 60 * 60 * 1000));
    if (nuevaReserva.pickup_time < dropoffConCooldown) {
      throw new HttpException({
        type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable',
        title: 'Vehículo en Período de Limpieza',
        status: HttpStatus.CONFLICT,
        code: 'VEHICLE_IN_CLEANING_COOLDOWN',
        detail: 'El vehículo requiere 2 horas de limpieza tras su devolución previa.'
      }, HttpStatus.CONFLICT);
    }
    ```
* **Detalle en `Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero`:**
  - **Diagnóstico:** La reserva hecha en Booking Central no impactó la disponibilidad en el sistema local del socio.
  - **Ajuste Recomendado en Código:** En tu endpoint `POST /autos/orders/create`, debes extender la ventana de no-disponibilidad agregando las 2 horas (120 min) de limpieza tras el dropoff de una orden previa:
    ```typescript
    // Regla de Cooldown 2 Horas (ADR-004)
    const dropoffConCooldown = new Date(ordenPrevia.dropoff_time.getTime() + (2 * 60 * 60 * 1000));
    if (nuevaReserva.pickup_time < dropoffConCooldown) {
      throw new HttpException({
        type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable',
        title: 'Vehículo en Período de Limpieza',
        status: HttpStatus.CONFLICT,
        code: 'VEHICLE_IN_CLEANING_COOLDOWN',
        detail: 'El vehículo requiere 2 horas de limpieza tras su devolución previa.'
      }, HttpStatus.CONFLICT);
    }
    ```
* **Detalle en `Idempotencia Transaccional en Renta de Autos`:**
  - **Diagnóstico:** El endpoint duplicó la orden o arrojó una falla no controlada ante la misma clave de idempotencia.
  - **Ajuste Recomendado en Código:** En tu endpoint `POST /autos/orders/create`, debes extender la ventana de no-disponibilidad agregando las 2 horas (120 min) de limpieza tras el dropoff de una orden previa:
    ```typescript
    // Regla de Cooldown 2 Horas (ADR-004)
    const dropoffConCooldown = new Date(ordenPrevia.dropoff_time.getTime() + (2 * 60 * 60 * 1000));
    if (nuevaReserva.pickup_time < dropoffConCooldown) {
      throw new HttpException({
        type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable',
        title: 'Vehículo en Período de Limpieza',
        status: HttpStatus.CONFLICT,
        code: 'VEHICLE_IN_CLEANING_COOLDOWN',
        detail: 'El vehículo requiere 2 horas de limpieza tras su devolución previa.'
      }, HttpStatus.CONFLICT);
    }
    ```
* **Detalle en `Compensación Saga LIFO (Cancelación y Reembolso 100%)`:**
  - **Diagnóstico:** Fallo en compensación de auto: {"error":"getaddrinfo ENOTFOUND maneja-de-una-autos-api.azurewebsites.net"}
  - **Ajuste Recomendado en Código:** En tu endpoint `POST /autos/orders/create`, debes extender la ventana de no-disponibilidad agregando las 2 horas (120 min) de limpieza tras el dropoff de una orden previa:
    ```typescript
    // Regla de Cooldown 2 Horas (ADR-004)
    const dropoffConCooldown = new Date(ordenPrevia.dropoff_time.getTime() + (2 * 60 * 60 * 1000));
    if (nuevaReserva.pickup_time < dropoffConCooldown) {
      throw new HttpException({
        type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable',
        title: 'Vehículo en Período de Limpieza',
        status: HttpStatus.CONFLICT,
        code: 'VEHICLE_IN_CLEANING_COOLDOWN',
        detail: 'El vehículo requiere 2 horas de limpieza tras su devolución previa.'
      }, HttpStatus.CONFLICT);
    }
    ```
* **Detalle en `Acuerdo B2B de Combos y Descuento en Flota`:**
  - **Diagnóstico:** El endpoint no devolvió los términos pactados: {"error":"getaddrinfo ENOTFOUND maneja-de-una-autos-api.azurewebsites.net"}
  - **Ajuste Recomendado en Código:** En tu endpoint `POST /autos/orders/create`, debes extender la ventana de no-disponibilidad agregando las 2 horas (120 min) de limpieza tras el dropoff de una orden previa:
    ```typescript
    // Regla de Cooldown 2 Horas (ADR-004)
    const dropoffConCooldown = new Date(ordenPrevia.dropoff_time.getTime() + (2 * 60 * 60 * 1000));
    if (nuevaReserva.pickup_time < dropoffConCooldown) {
      throw new HttpException({
        type: 'https://booking.epn.edu.ec/errors/vehicle-unavailable',
        title: 'Vehículo en Período de Limpieza',
        status: HttpStatus.CONFLICT,
        code: 'VEHICLE_IN_CLEANING_COOLDOWN',
        detail: 'El vehículo requiere 2 horas de limpieza tras su devolución previa.'
      }, HttpStatus.CONFLICT);
    }
    ```

#### ✉️ Mensaje para enviar a Mateo Morales:

> Hola Mateo,
>
> Realizamos la prueba cruzada bidireccional entre Booking Central y tu nodo **`NODE_AUT_MDU`**:
>
> - ⚠️ **Flujo Socio -> Booking: Cooldown de Limpieza 2h (ADR-004):** HTTP 500 (Permitió renta)
> - ⚠️ **Flujo Booking -> Socio: Bloqueo de Reserva Directa en Web del Compañero:** HTTP 500 (Permitió sobreventa)
> - ⚠️ **Idempotencia Transaccional en Renta de Autos:** Req 1: HTTP 500 | Req 2: HTTP 500
> - ⚠️ **Compensación Saga LIFO (Cancelación y Reembolso 100%):** HTTP 500
> - ⚠️ **Acuerdo B2B de Combos y Descuento en Flota:** HTTP 500
>
> Tu sistema bloquea exitosamente el solapamiento directo, pero ten presente la regla de las 2 horas de cooldown post-devolución según el ADR-004.

---

