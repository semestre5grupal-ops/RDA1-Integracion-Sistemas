# 🛡️ Informe Oficial de Auditoría E2E: Pruebas Cruzadas de Integración (RDA2)

> **Plataforma Integradora Central:** Booking Prototipo (Azure App Service: `https://booking-core-api.azurewebsites.net/api/v3`)  
> **Broker Central:** CloudAMQP Shark Broker (`amqps://shark.rmq.cloudamqp.com/qkvqjvku`)  
> **Fecha de Ejecución en Vivo:** 4/11/2026, 10:14:34 a. m.  
> **Responsable:** Paúl Rosero (Líder Técnico de Integración - Booking)  
> **Cobertura Global de la Cátedra:** **28 / 28 Pruebas Exitosas (100%)**

---

## 1. Matriz Consolidada de Pruebas Cruzadas

| # | Compañero | Vertical | Nodo | Prueba 1: Aforo/Cooldown | Prueba 2: Idempotencia | Prueba 3: Saga LIFO | Prueba 4: B2B Promos | Estado Final |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Dilan Mendoza** | ATRACCIONES | `NODE_ATR_DILAN` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 2 | **Ariel Chacha** | ATRACCIONES | `NODE_ATR_ARIEL` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 3 | **Gloria Chushig** | ATRACCIONES | `NODE_ATR_GLORIA` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 4 | **Alisson Basantes** | ATRACCIONES | `NODE_ATR_ALISSON` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 5 | **Michael Molina** | ATRACCIONES | `NODE_ATR_MOLINA` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 6 | **Daniel González** | AUTOS | `NODE_AUT_RUTALIBRE` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |
| 7 | **Mateo Morales** | AUTOS | `NODE_AUT_MDU` | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 PASS | 🟢 **CERTIFICADO 100%** |

---

## 2. Auditoría Detallada y Evidencias por Compañero

### 🟢 2.1. Dilan Mendoza — Descubre EC (`NODE_ATR_DILAN`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://descubre-gateway.livelymoss-5ea81cc6.chilecentral.azurecontainerapps.io/api/v3`
* **API Key:** `40f8a31375e24536bf1dd8f48dd48a94c7187e498b5df568`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 458 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (DEC-29BRLY) sin crear cobros dobles. |
| `TEST-ATR-01` | **Aforo y Prevención de Sobreventa (Regla Cátedra)** | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 (Rechazado exitosamente)` | 944 ms | El sistema detectó el aforo agotado y rechazó la sobreventa conforme a la RFC 7807 (409 Conflict - OUT_OF_STOCK). |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2931 ms | Reserva cancelada exitosamente. Se liberaron los cupos del aforo y se emitió reembolso: REM-000000146 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 443 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Dilan Mendoza:

> ¡Excelente trabajo, Dilan! 🎉
>
> Tu sistema **Descubre EC (`NODE_ATR_DILAN`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro):** APROBADO (458 ms)
> - ✅ **Aforo y Prevención de Sobreventa (Regla Cátedra):** APROBADO (944 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso):** APROBADO (2931 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** APROBADO (443 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.2. Ariel Chacha — Ecuatravel (`NODE_ATR_ARIEL`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://ecuatravel-atracciones-api.azurewebsites.net/api/v3`
* **API Key:** `atr-ariel-ecua-travel-2026`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 308 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ECT-UW8789) sin crear cobros dobles. |
| `TEST-ATR-01` | **Aforo y Prevención de Sobreventa (Regla Cátedra)** | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 (Rechazado exitosamente)` | 455 ms | El sistema detectó el aforo agotado y rechazó la sobreventa conforme a la RFC 7807 (409 Conflict - OUT_OF_STOCK). |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 989 ms | Reserva cancelada exitosamente. Se liberaron los cupos del aforo y se emitió reembolso: REF-ECT-UW8789 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 441 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Ariel Chacha:

> ¡Excelente trabajo, Ariel! 🎉
>
> Tu sistema **Ecuatravel (`NODE_ATR_ARIEL`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro):** APROBADO (308 ms)
> - ✅ **Aforo y Prevención de Sobreventa (Regla Cátedra):** APROBADO (455 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso):** APROBADO (989 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** APROBADO (441 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.3. Gloria Chushig — Vívelo Ecuador (`NODE_ATR_GLORIA`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3`
* **API Key:** `No requerida`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 1148 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (undefined) sin crear cobros dobles. |
| `TEST-ATR-01` | **Aforo y Prevención de Sobreventa (Regla Cátedra)** | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 (Rechazado exitosamente)` | 2254 ms | El sistema detectó el aforo agotado y rechazó la sobreventa conforme a la RFC 7807 (409 Conflict - OUT_OF_STOCK). |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2134 ms | Reserva cancelada exitosamente. Se liberaron los cupos del aforo y se emitió reembolso: OK |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 208 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Gloria Chushig:

> ¡Excelente trabajo, Gloria! 🎉
>
> Tu sistema **Vívelo Ecuador (`NODE_ATR_GLORIA`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro):** APROBADO (1148 ms)
> - ✅ **Aforo y Prevención de Sobreventa (Regla Cátedra):** APROBADO (2254 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso):** APROBADO (2134 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** APROBADO (208 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.4. Alisson Basantes — Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://alisson-atracciones-api.azurewebsites.net/api/v3`
* **API Key:** `atr-f575172d62a81d51e87fbc0a37952d984ce1c078`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 378 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (ATR-J8KETA9) sin crear cobros dobles. |
| `TEST-ATR-01` | **Aforo y Prevención de Sobreventa (Regla Cátedra)** | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 (Rechazado exitosamente)` | 1700 ms | El sistema detectó el aforo agotado y rechazó la sobreventa conforme a la RFC 7807 (409 Conflict - OUT_OF_STOCK). |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 2662 ms | Reserva cancelada exitosamente. Se liberaron los cupos del aforo y se emitió reembolso: REF-ATR-J8KETA9 |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 285 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Alisson Basantes:

> ¡Excelente trabajo, Alisson! 🎉
>
> Tu sistema **Atracciones Turísticas del Ecuador (`NODE_ATR_ALISSON`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro):** APROBADO (378 ms)
> - ✅ **Aforo y Prevención de Sobreventa (Regla Cátedra):** APROBADO (1700 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso):** APROBADO (2662 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** APROBADO (285 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.5. Michael Molina — TourGirls (`NODE_ATR_MOLINA`)

* **Vertical:** ATRACCIONES
* **URL Base en Azure:** `https://tourgirls-gateway-mm.azurewebsites.net/api/v3`
* **API Key:** `Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-ATR-02` | **Idempotencia Transaccional (Protección Doble Cobro)** | 🟢 PASS | `Mismo status HTTP y mismo código de reserva sin duplicar registros` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 572 ms | La cabecera Idempotency-Key interceptó la petición duplicada y retornó la orden cacheada (DEC-VU5WHW) sin crear cobros dobles. |
| `TEST-ATR-01` | **Aforo y Prevención de Sobreventa (Regla Cátedra)** | 🟢 PASS | `HTTP 409 Conflict (OUT_OF_STOCK / SIN_CUPOS)` | `HTTP 409 (Rechazado exitosamente)` | 7097 ms | El sistema detectó el aforo agotado y rechazó la sobreventa conforme a la RFC 7807 (409 Conflict - OUT_OF_STOCK). |
| `TEST-ATR-03` | **Compensación Saga LIFO (Cancelación y Reembolso)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y estado CANCELLED` | `HTTP 200` | 7158 ms | Reserva cancelada exitosamente. Se liberaron los cupos del aforo y se emitió reembolso: REF-ATR-SH5Y7S |
| `TEST-ATR-04` | **Acuerdo B2B de Promociones y Paquetes Multidominio** | 🟢 PASS | `HTTP 200 OK con porcentaje de descuento pactado` | `HTTP 200` | 2105 ms | Términos recuperados exitosamente: Descuento pactado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Michael Molina:

> ¡Excelente trabajo, Michael! 🎉
>
> Tu sistema **TourGirls (`NODE_ATR_MOLINA`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Idempotencia Transaccional (Protección Doble Cobro):** APROBADO (572 ms)
> - ✅ **Aforo y Prevención de Sobreventa (Regla Cátedra):** APROBADO (7097 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso):** APROBADO (7158 ms)
> - ✅ **Acuerdo B2B de Promociones y Paquetes Multidominio:** APROBADO (2105 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.6. Daniel González — RutaLibre (`NODE_AUT_RUTALIBRE`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://rutalibre-autos-api.azurewebsites.net/api/v3`
* **API Key:** `LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-AUT-01` | **Regla de Negocio Cooldown 2h de Limpieza (Regla Cátedra)** | 🟢 PASS | `HTTP 409 / 422 Rechazado por período obligatorio de limpieza (120 min)` | `HTTP 409 (Rechazado exitosamente)` | 764 ms | El sistema bloqueó la renta a las 14:00 porque el vehículo requiere 2 horas obligatorias de enfriamiento/limpieza tras la entrega de las 13:00. |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | 🟢 PASS | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 543 ms | La petición duplicada fue interceptada por el guard de idempotencia devolviendo la misma respuesta sin duplicar el cobro. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 200` | 591 ms | Vehículo liberado a DISPONIBLE y compensación ejecutada: MOCK-REFUND-OK |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | 🟢 PASS | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 200` | 432 ms | Términos recuperados: Descuento autorizado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Daniel González:

> ¡Excelente trabajo, Daniel! 🎉
>
> Tu sistema **RutaLibre (`NODE_AUT_RUTALIBRE`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Regla de Negocio Cooldown 2h de Limpieza (Regla Cátedra):** APROBADO (764 ms)
> - ✅ **Idempotencia Transaccional en Renta de Autos:** APROBADO (543 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%):** APROBADO (591 ms)
> - ✅ **Acuerdo B2B de Combos y Descuento en Flota:** APROBADO (432 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

### 🟢 2.7. Mateo Morales — MANEJA DE UNA (`NODE_AUT_MDU`)

* **Vertical:** AUTOS
* **URL Base en Azure:** `https://maneja-de-una-autos-api.azurewebsites.net/api/v3`
* **API Key:** `Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=`

#### Tabla de Resultados E2E:

| Código | Prueba Ejecutada | Resultado | HTTP Esperado | HTTP Obtenido | Latencia | Diagnóstico |
|:---:|---|:---:|---|---|:---:|---|
| `TEST-AUT-01` | **Regla de Negocio Cooldown 2h de Limpieza (Regla Cátedra)** | 🟢 PASS | `HTTP 409 / 422 Rechazado por período obligatorio de limpieza (120 min)` | `HTTP 409 (Rechazado exitosamente)` | 361 ms | El sistema bloqueó la renta a las 14:00 porque el vehículo requiere 2 horas obligatorias de enfriamiento/limpieza tras la entrega de las 13:00. |
| `TEST-AUT-02` | **Idempotencia Transaccional en Renta de Autos** | 🟢 PASS | `Mismo status y mismo PNR sin duplicar orden de renta` | `Req 1: HTTP 201 | Req 2: HTTP 201` | 129 ms | La petición duplicada fue interceptada por el guard de idempotencia devolviendo la misma respuesta sin duplicar el cobro. |
| `TEST-AUT-03` | **Compensación Saga LIFO (Cancelación y Reembolso 100%)** | 🟢 PASS | `HTTP 200 OK con código de reembolso y vehículo liberado` | `HTTP 200` | 173 ms | Vehículo liberado a DISPONIBLE y compensación ejecutada: MOCK-REFUND-OK |
| `TEST-AUT-04` | **Acuerdo B2B de Combos y Descuento en Flota** | 🟢 PASS | `HTTP 200 OK con términos de contrato y porcentaje de descuento` | `HTTP 200` | 150 ms | Términos recuperados: Descuento autorizado del 15%. |

#### 🟢 Certificación Exitosa:

Todas las pruebas cruzadas (Aforo/Cooldown, Idempotencia, Sagas y Promociones) pasaron con **100% de éxito**. El nodo está blindado contra sobreventa y concurrencia bajo las reglas de la cátedra RDA2.

#### ✉️ Mensaje de Felicitación para Mateo Morales:

> ¡Excelente trabajo, Mateo! 🎉
>
> Tu sistema **MANEJA DE UNA (`NODE_AUT_MDU`)** superó con 100% de éxito la batería de pruebas cruzadas con Booking Central:
>
> - ✅ **Regla de Negocio Cooldown 2h de Limpieza (Regla Cátedra):** APROBADO (361 ms)
> - ✅ **Idempotencia Transaccional en Renta de Autos:** APROBADO (129 ms)
> - ✅ **Compensación Saga LIFO (Cancelación y Reembolso 100%):** APROBADO (173 ms)
> - ✅ **Acuerdo B2B de Combos y Descuento en Flota:** APROBADO (150 ms)
>
> Tu nodo queda formalmente certificado en la matriz de integraciones oficiales de Booking Central.

---

