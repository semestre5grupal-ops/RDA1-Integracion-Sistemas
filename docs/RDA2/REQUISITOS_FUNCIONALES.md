# Requisitos Funcionales — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Marketplace Agregador Central y Gateway ESB/BFF)  
> **Documento:** Especificación Unificada de Requisitos Funcionales y Matriz de Trazabilidad a Contratos  
> **Versión Estándar:** 2.0.0 (SemVer)  
> **Fecha:** Octubre 2026  
> **Estado:** Aprobado / Consolidado con Contratos Formales v2 (P00–P17) y Código Fuente  

---

## 1. Alcance y Actores del Sistema

### 1.1 Alcance del Producto
El **Booking Prototipo (RDA2)** constituye la plataforma central agregadora y orquestadora del ecosistema turístico digital. Opera bajo un modelo híbrido **API Gateway / Enterprise Service Bus (ESB) / Backend-for-Frontend (BFF)** implementado en NestJS 10.x, integrando cuatro tiendas satélites independientes provistas por los equipos de estudiantes:
1. **Tienda de Atracciones Turísticas (Descubre EC):** Catálogo jerárquico recursivo, franjas horarias (*time slots*), aforo diferenciado por edad (adulto/niño/infante), check-in presencial con guía y voucher QR.
2. **Tienda de Renta de Autos y Gestión de Flota:** Flota segmentada por gamas, validación perimetral de edad de conductor, máquina de estados finita de 6 fases, cooldown obligatorio de 2 horas de limpieza post-alquiler, actas de entrega/devolución y mantenimiento preventivo.
3. **Tienda de Vuelos (GDS Flight Core):** Búsqueda multidestino por códigos IATA, matriz de itinerarios y tarifas (Light/Standard/Flex), retención de cupos con TTL (*Hold*), emisión de PNRs, selección de asientos, check-in digital y tarjeta de embarque.
4. **Tienda de Alojamientos:** Catálogo de hoteles y habitaciones, disponibilidad en tiempo real, check-in digital a partir de las 14:00 y gestión de llaves de acceso.

El Booking Prototipo coordina transacciones complejas multivertical mediante el **Patrón Saga Orquestada LIFO**, garantiza resiliencia perimetral ante caídas de proveedores mediante **Circuit Breaker** (timeout estricto <= 5000 ms, Criterio Excluyente CE01), absorbe inventarios de alta frecuencia mediante **gRPC HTTP/2** (puerto `50051`), propaga eventos transaccionales y de telemetría a través de un **Event Bus Dual (RabbitMQ + Kafka)** y expone interfaces optimizadas mediante **REST OpenAPI v2** y **GraphQL BFF**.

---

### 1.2 Actores del Sistema

| Actor | Código | Descripción y Responsabilidad en el Ecosistema |
|---|:---:|---|
| **Cliente Final (Turista / Shopper)** | `CLIENTE` | Usuario consumidor que explora el catálogo multivertical unificado, arma carritos de compra persistentes o combos dinámicos, procesa pagos transaccionales mediante checkout orquestado, consulta su historial consolidado en "Mis Reservas", realiza el check-in digital adaptado y cancela reservas confirmadas obteniendo reembolsos compensatorios automáticos. |
| **Administrador del Sistema** | `ADMIN` | Personal técnico y operativo con privilegios elevados que supervisa en tiempo real la salud de la red de microservicios mediante el Semáforo LED de 5 nodos (🟢/🟡/🔴), conmuta Kill-Switches atómicos en caliente para aislar tiendas caídas, gestiona el directorio de usuarios y asignación de roles, audita cancelaciones de emergencia, aprueba liquidaciones financieras B2B y consulta la bitácora física de auditoría. |
| **Operador de Patio / Flota** | `MANTENIMIENTO` | Personal operativo asignado a la base de operaciones de vehículos que ejecuta las actas digitales de entrega y devolución de autos, registra lecturas de odómetro e inspección física de daños/combustible, supervisa el cronómetro regresivo de 2 horas de limpieza obligatoria y programa órdenes de taller preventivo. |
| **Tienda Externa / Proveedor B2B** | `PROV` | Sistemas satélites autónomos (Atracciones, Autos, Alojamientos, Vuelos) que interactúan con Booking mediante acuerdos comerciales: envían actualizaciones continuas de stock vía gRPC (`PushStockUpdate` / `StreamInventoryChanges`), responden llamadas REST con `Idempotency-Key`, formalizan acuerdos de promociones B2B (`PUT /{vertical}/promociones/contrato`) y notifican eventos asíncronos mediante webhooks entrantes firmados con HMAC-SHA256. |
| **Sistema / Servicios Autónomos** | `SYS` | Componentes internos en segundo plano y workers asíncronos del API Gateway NestJS: monitor periódico de latencia de conectores (`ConnectorHealthService`), orquestador de compensaciones Saga, tareas cron de detección de carritos abandonados (>2h), puente de replicación de eventos RabbitMQ-Kafka (`RabbitKafkaBridgeService`) y registrador inmutable en disco Winston. |

---

## 2. Requisitos Funcionales por Módulo

### 2.1 Búsqueda Unificada y Catálogo Multidominio

#### `RF-BUS-01`: Catálogo Multivertical Agregado en GraphQL BFF
- **Enunciado:** El sistema debe proporcionar una consulta centralizada en el API Gateway GraphQL BFF que consolide en tiempo real la oferta turística de las cuatro verticales (Atracciones, Autos, Alojamientos y Vuelos) sin realizar joins relacionales cross-schema, permitiendo filtros por ciudad de destino y vertical.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Query.catalogoUnificado`
- **Criterio de Aceptación:**
  - **Dado** que un cliente consulta el endpoint `/graphql` con la query `catalogoUnificado(destino: "Quito", vertical: "ATRACCIONES")`.
  - **Cuando** el Gateway resuelve la solicitud agregando los datos en memoria desde las cachés locales y adaptadores de integración.
  - **Entonces** el sistema responde con una lista de ítems homologados (`id`, `titulo`, `destino`, `precioBase`, `ratingPromedio`, `proveedorCodigo`) en menos de 500 ms y sin disparar excepciones 500 ante fallas parciales de otros nodos.
- **Fuente:** `src/modules/graphql/graphql-bff.resolver.ts` y `contracts/graphql/schema.graphql`.

#### `RF-BUS-02`: Búsqueda Jerárquica y Filtros Avanzados de Atracciones
- **Enunciado:** El sistema debe permitir la navegación del catálogo de atracciones turísticas mediante un árbol de categorías recursivo (Closure Table / CTE) y filtros por amenidades operativas (comida incluida, transporte, guía bilingüe y franja horaria).
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) `#GET /atracciones/search` y `#GET /atracciones/categorias/arbol`
- **Criterio de Aceptación:**
  - **Dado** que un usuario navega en el marketplace de atracciones y filtra por categoría padre con hijos jerárquicos y amenidad `incluye_comida=true`.
  - **Cuando** se ejecuta la consulta GET contra `/atracciones/search`.
  - **Entonces** se devuelven las atracciones asociadas a la categoría y sus subcategorías descendientes, indicando franjas horarias y desglose de precios diferenciados para adulto, niño e infante ($0.00 pero con reserva de cupo).
- **Fuente:** `Pendientes/modulo_atracciones.md` y `contracts/atracciones-openapi-v2.yaml`.

#### `RF-BUS-03`: Búsqueda de Vehículos por Aeropuerto/Depot y Coberturas
- **Enunciado:** El sistema debe permitir cotizar alquileres de autos filtrando por código IATA de aeropuerto o estación de entrega/devolución, fechas, edad del conductor (validando sobretasa joven <25 años o senior >70 años) y nivel de franquicia/cobertura de seguro.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) `#GET /autos/search` y `#GET /autos/flota`
- **Criterio de Aceptación:**
  - **Dado** que un conductor de 22 años cotiza un auto en el depot `UIO` desde fecha T1 a T2.
  - **Cuando** se invoca `/autos/search`.
  - **Entonces** el sistema aplica la tarifa diaria base, desglosa la sobretasa obligatoria por conductor joven bajo RFC 7807 y oculta los vehículos que se encuentren en estado `EN_LIMPIEZA` o con cooldown de 2 horas activo.
- **Fuente:** `Pendientes/modulo_renta_autos.md` y `contracts/autos-openapi-v2.yaml`.

#### `RF-BUS-04`: Búsqueda de Vuelos Multidestino con Segmentación Tarifaria
- **Enunciado:** El sistema debe permitir consultar vuelos por origen, destino, fechas y número de pasajeros, retornando combinaciones de itinerarios, escalas, mapa de cabina y paquetes de tarifas (Light, Standard, Flex).
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) `#searchFlights` y `#getSeatMap`
- **Criterio de Aceptación:**
  - **Dado** que un usuario busca un vuelo de `UIO` a `GPS` para 2 pasajeros adultos.
  - **Cuando** se ejecuta `POST /vuelos/v2/flights/search`.
  - **Entonces** el microservicio de vuelos entrega los vuelos activos con desglose de tasas aeroportuarias, asientos disponibles por fila y enlaces HATEOAS a la reserva y hold de cupo.
- **Fuente:** `Pendientes/modulo_vuelos.md` y `contracts/vuelos-openapi-v2.yaml`.

---

### 2.2 Checkout y Patrón Saga Orquestada

#### `RF-SAGA-01`: Orquestación Transaccional de Compra Compuesta LIFO
- **Enunciado:** El sistema debe orquestar el proceso de compra de carritos con ítems de múltiples verticales turísticas a través del ESB (`SagaOrchestratorService`), aplicando el patrón Saga orquestada en orden secuencial con reintentos y soporte de idempotencia estricta mediante `Idempotency-Key`.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) `#checkoutSaga` y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Mutation.checkoutOrquestado`
- **Criterio de Aceptación:**
  - **Dado** un payload de checkout compuesto que incluye 1 atracción, 1 auto y 1 vuelo con cabecera `Idempotency-Key: <UUID-v4>`.
  - **Cuando** se envía `POST /esb/checkout-saga`.
  - **Entonces** el ESB registra el paso en `schema_auditoria.saga_pasos_journal`, reserva en cada vertical participante, cobra mediante `MS_PAG` y retorna código HTTP 201 con `correlation_id` y estado `COMPLETED`.
- **Fuente:** `src/modules/esb/interna/saga-orchestrator.service.ts` y `contracts/esb-sagas-openapi-v2.yaml`.

#### `RF-SAGA-02`: Cancelación Transaccional Compensatoria y Reembolso Automático
- **Enunciado:** El sistema debe garantizar que si un paso de la compra compuesta falla (rechazo de reserva satélite o fondos insuficientes), o si el usuario solicita cancelar una reserva confirmada en "Mis Reservas", el orquestador ejecute la compensación atómica en orden inverso (LIFO): liberando cupos en la tienda, emitiendo el reembolso financiero del 100% en `MS_PAG` y registrando el evento en la auditoría física inmutable.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) `#checkoutSaga` (compensación) y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Mutation.cancelarReservaConSaga`
- **Criterio de Aceptación:**
  - **Dado** que la confirmación de la tienda de autos arroja un error 503 tras haberse debitado el dinero del usuario.
  - **Cuando** el orquestador detecta el fallo del paso transaccional.
  - **Entonces** invoca inmediatamente `POST /pagos/reembolsos` con el monto total, devuelve los cupos de la atracción previa, cambia el estado de la saga a `COMPENSATED` y emite el recibo `REF-...`.
- **Fuente:** `test/test-cancel-saga.js`, `src/modules/esb/interna/saga-orchestrator.service.ts` y `ADR-007`.

#### `RF-SAGA-03`: Consulta Agregada de Reservas Multidominio ("Mis Reservas")
- **Enunciado:** El sistema debe proporcionar una vista unificada para el usuario autenticado que consolide todas sus reservas activas, pasadas y canceladas en atracciones, autos, alojamientos y vuelos sin recurrir a SQL joins relacionales entre esquemas de base de datos.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) `#getMisReservasAgregadas` y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Query.misReservas`
- **Criterio de Aceptación:**
  - **Dado** un cliente con ID de usuario válido `usr-123`.
  - **Cuando** invoca `GET /esb/aggregate/mis-reservas/usr-123`.
  - **Entonces** el ESB consulta concurrentemente los repositorios de cada vertical mediante Promise.allSettled y retorna el objeto consolidado con los arrays `atracciones`, `autos`, `alojamientos` y `vuelos`.
- **Fuente:** `src/modules/esb/esb.controller.ts` y `contracts/esb-sagas-openapi-v2.yaml`.

#### `RF-SAGA-04`: Grafo Visual de Observabilidad y Spans W3C de la Saga
- **Enunciado:** El sistema debe transformar la bitácora relacional de pasos de la Saga en un grafo de ejecución distribuida con estados semafóricos por nodo y árbol de spans OpenTelemetry jerárquicos con `traceparent`.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) `#obtenerTrazaGrafoSaga`
- **Criterio de Aceptación:**
  - **Dado** un `correlation_id` correspondiente a una Saga procesada.
  - **Cuando** se solicita `GET /esb/sagas/{correlationId}/traza`.
  - **Entonces** el sistema responde con una estructura JSON conteniendo nodos (`id`, `label`, `estado`, `latenciaMs`) y aristas (`origen`, `destino`, `tipo`) para graficar en el panel React.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` (RF-OBS-02) y `contracts/esb-sagas-openapi-v2.yaml`.

#### `RF-SAGA-05`: Carrito de Compras Persistente Multivertical
- **Enunciado:** El sistema debe gestionar sesiones de carrito de compra persistentes en `schema_carritos`, congelando el snapshot de precio unitario de cada ítem para proteger al consumidor de variaciones tarifarias durante el checkout.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/carritos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/carritos-openapi-v2.yaml) `#inicializarCarrito`, `#obtenerCarritoActivo`, `#agregarItemCarrito` y `#vaciarCarrito`
- **Criterio de Aceptación:**
  - **Dado** un cliente autenticado que agrega un tour de atracciones y un vehículo a su carrito.
  - **Cuando** se envía `POST /carritos/{id}/items`.
  - **Entonces** el sistema guarda la línea en base de datos con `snapshot_precio_unitario`, valida el cupo en la vertical y recalcula subtotales en menos de 200 ms.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/carritos-openapi-v2.yaml`.

#### `RF-SAGA-06`: Transición Atómica de Carrito a Checkout Saga
- **Enunciado:** El sistema debe permitir convertir un carrito de compras activo en una orden de compra formal, bloqueando la adición de nuevos ítems y delegando la ejecución atómica al orquestador de Sagas del ESB.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/carritos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/carritos-openapi-v2.yaml) `#ejecutarCheckoutCarrito`
- **Criterio de Aceptación:**
  - **Dado** un carrito con 2 ítems en estado `ACTIVO`.
  - **Cuando** el cliente envía `POST /carritos/{id}/checkout` con su método de pago e `Idempotency-Key`.
  - **Entonces** el carrito transiciona a estado `PROCESANDO_CHECKOUT`, se genera la Saga en el ESB y, al finalizar exitosamente, el carrito queda en estado `COMPLETADO`.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/carritos-openapi-v2.yaml`.

#### `RF-SAGA-07`: Detección Automática de Carritos Abandonados
- **Enunciado:** El sistema debe ejecutar un proceso periódico programado (Cron Job) que identifique carritos inactivos por más de 2 horas, libere cupos provisionales en las verticales y emita el evento `carritos.abandonados` hacia el Event Bus.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/carritos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/carritos-openapi-v2.yaml) `#detectarCarritosAbandonados`
- **Criterio de Aceptación:**
  - **Dado** que existen 5 carritos sin actividad durante más de 120 minutos.
  - **Cuando** el worker ejecuta `POST /carritos/abandonados/detectar`.
  - **Entonces** se marcan como `ABANDONADO`, se publica el CloudEvent en RabbitMQ/Kafka y se devuelven los cupos reservados a la caché de inventario.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/carritos-openapi-v2.yaml`.

---

### 2.3 Simulación de Pagos SOA

#### `RF-PAG-01`: Procesamiento Idempotente de Pagos Simulados
- **Enunciado:** El sistema debe procesar transacciones de pago simuladas mediante el módulo SOA `MS_PAG`, validando parámetros financieros, formato de tarjeta simulada y garantizando idempotencia estricta para evitar dobles cobros.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) `#procesarPago`
- **Criterio de Aceptación:**
  - **Dado** un cobro de $145.50 con `Idempotency-Key: pay-key-001`.
  - **Cuando** se invoca `POST /pagos/procesar`.
  - **Entonces** el sistema persiste la transacción en `schema_pagos.transacciones_pago`, genera un `transaccion_id` único y devuelve código 201; si se reintenta con la misma clave, devuelve la respuesta cacheada sin re-procesar.
- **Fuente:** `src/modules/pagos/pagos.service.ts` y `contracts/pagos-openapi-v2.yaml`.

#### `RF-PAG-02`: Emisión de Reembolsos Financieros Compensatorios
- **Enunciado:** El sistema debe procesar solicitudes de reembolso financiero total o parcial asociadas a transacciones previas aprobadas, registrando el motivo y emitiendo el comprobante de reintegro monetario.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) `#procesarReembolso`
- **Criterio de Aceptación:**
  - **Dado** una transacción original exitosa `tx-789` por $80.00.
  - **Cuando** el orquestador Saga o un administrador envía `POST /pagos/reembolsos`.
  - **Entonces** el sistema registra el reverso en `transacciones_pago` con estado `REEMBOLSADO`, emite el comprobante `REF-PAG-789` y retorna HTTP 201.
- **Fuente:** `src/modules/pagos/pagos.service.ts` y `contracts/pagos-openapi-v2.yaml`.

#### `RF-PAG-03`: Inyección y Simulación Dinámica de Fallos Financieros
- **Enunciado:** El sistema debe permitir a los administradores y testers configurar en caliente el comportamiento del simulador de pagos (latencia artificial, inyección de `TIMEOUT_RED`, `RECHAZO_FONDOS` o `ERROR_SISTEMA`) para verificar la resiliencia de la Saga.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) `#getConfigSimulador` y `#updateConfigSimulador`
- **Criterio de Aceptación:**
  - **Dado** que se configura `modo: "FORZAR_RECHAZO"` vía `POST /pagos/simulador/config`.
  - **Cuando** cualquier módulo intenta procesar un pago.
  - **Entonces** el servicio responde inmediatamente con HTTP 402 / RFC 7807 `PAYMENT_REJECTED_INSUFFICIENT_FUNDS` sin congelar el backend.
- **Fuente:** `src/modules/pagos/pagos.controller.ts` y `contracts/pagos-openapi-v2.yaml`.

#### `RF-PAG-04`: Consulta y Auditoría de Transacciones de Pago
- **Enunciado:** El sistema debe proporcionar un endpoint administrativo para listar y filtrar el historial de transacciones de pago, estado de cobro, montos, pasarelas y marcas de tiempo.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) `#getTransacciones`
- **Criterio de Aceptación:**
  - **Dado** un operador financiero que consulta `GET /pagos/transacciones?estado=EXITOSO&limit=50`.
  - **Cuando** se evalúa la consulta.
  - **Entonces** el sistema retorna la colección de transacciones ordenadas cronológicamente con su correlation_id.
- **Fuente:** `src/modules/pagos/pagos.controller.ts` y `contracts/pagos-openapi-v2.yaml`.

#### `RF-PAG-05`: Validación Síncrona B2B de Referencia de Pago
- **Enunciado:** El sistema debe permitir a las tiendas satélites y aerolíneas verificar síncronamente la autenticidad y liquidación de un pago mediante su referencia única (`paymentReference`) antes de emitir tickets o boletos finales.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) `#validarPaymentReference`
- **Criterio de Aceptación:**
  - **Dado** que la tienda de vuelos recibe una orden con `paymentReference: "PAY-VUE-2026-X"`.
  - **Cuando** consulta `GET /pagos/{paymentReference}`.
  - **Entonces** el gateway confirma si el pago está `CAPTURADO`, el monto exacto y la moneda oficial.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/pagos-openapi-v2.yaml`.

---

### 2.4 Paquetes Dinámicos y Promociones B2B

#### `RF-PKG-01`: Generación de Paquetes Turísticos Dinámicos Multivertical
- **Enunciado:** El sistema debe permitir estructurar combos dinámicos que agrupen servicios de dos o más verticales distintas (ej. Vuelo + Hotel + Tour), aplicando descuentos promocionales que no excedan los topes comerciales pactados con cada socio.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) `#crearPaqueteDinamico`
- **Criterio de Aceptación:**
  - **Dado** una solicitud para crear un paquete con 1 vuelo ($200) y 1 tour de atracciones ($50) solicitando 25% de descuento.
  - **Cuando** se valida contra el contrato de promociones del socio que fija un tope máximo del 15%.
  - **Entonces** el sistema ajusta automáticamente el descuento al 15%, calcula el precio final inmutable en $212.50 y guarda el paquete en `schema_paquetes.paquetes`.
- **Fuente:** `src/modules/paquetes/paquetes.service.ts` y `contracts/paquetes-openapi-v2.yaml`.

#### `RF-PKG-02`: Consulta y Exposición de Combos Turísticos
- **Enunciado:** El sistema debe exponer el catálogo de paquetes turísticos vigentes tanto en REST como en GraphQL para que los usuarios finales exploren ofertas multidominio paquetizadas.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) `#listarPaquetes` y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Query.obtenerPaquetesDisponibles`
- **Criterio de Aceptación:**
  - **Dado** un cliente en la sección "Ofertas y Paquetes" de la web.
  - **Cuando** se invoca `GET /paquetes`.
  - **Entonces** se entregan los paquetes con vigencia activa, detalle de ítems componentes y ahorro económico total.
- **Fuente:** `src/modules/paquetes/paquetes.controller.ts` y `contracts/paquetes-openapi-v2.yaml`.

#### `RF-PKG-03`: Consulta de Acuerdos de Promoción B2B Vigentes
- **Enunciado:** El sistema debe permitir consultar los acuerdos y porcentajes de descuento combo pactados con los proveedores satélites almacenados en `schema_paquetes.contratos_promociones`.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) `#getContratosPromociones`
- **Criterio de Aceptación:**
  - **Dado** un administrador o servicio de cotización B2B.
  - **Cuando** solicita `GET /paquetes/contratos`.
  - **Entonces** se lista la matriz de proveedores con `permite_promociones`, `porcentaje_descuento_maximo` y fecha de vigencia.
- **Fuente:** `src/modules/paquetes/paquetes.controller.ts` y `contracts/paquetes-openapi-v2.yaml`.

#### `RF-PKG-04`: Sincronización Inbound de Acuerdos Comerciales B2B
- **Enunciado:** El sistema debe disponer de un endpoint B2B para que las tiendas socias actualicen directamente sus acuerdos comerciales y topes de descuento en Booking.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) `#actualizarContratoPromociones`
- **Criterio de Aceptación:**
  - **Dado** que la tienda de autos actualiza su descuento máximo al 12%.
  - **Cuando** envía `PUT /paquetes/contratos/autos` con su API key autorizada.
  - **Entonces** Booking actualiza la tabla relacional sin requerir intervención manual por base de datos.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/paquetes-openapi-v2.yaml`.

#### `RF-PKG-05`: Declaración Unilateral de Condiciones Comerciales por la Tienda
- **Enunciado:** Cada contrato de tienda externa debe formalizar el cuestionario B2B de cátedra (Mandato RDA2 pág. 149) respondiendo si acepta promociones y cuál es su porcentaje máximo de descuento.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) `#GET/PUT /atracciones/promociones/contrato`, [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) `#GET/PUT /autos/promociones/contrato` y [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) `#getPromotionAgreement` / `#putPromotionAgreement`
- **Criterio de Aceptación:**
  - **Dado** el contrato de una tienda socia v2.
  - **Cuando** se consulta o actualiza `/promociones/contrato`.
  - **Entonces** se devuelven los campos obligatorios: `permite_promociones`, `porcentaje_descuento_maximo`, `destinos_habilitados` y `vigencia_hasta`.
- **Fuente:** Contratos v2 de tiendas socias y Mandato de Cátedra RDA2.

---

### 2.5 Facturación Fiscal y Comprobantes

#### `RF-FAC-01`: Emisión y Persistencia de Facturas Fiscales Multi-Esquema
- **Enunciado:** El sistema debe registrar comprobantes fiscales en `schema_facturacion.facturas` calculando automáticamente subtotal, tarifa 0%, base imponible gravada con 15% IVA y desglose de líneas por cada servicio de la orden.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#emitirFactura`
- **Criterio de Aceptación:**
  - **Dado** una orden completada por $100.00 más IVA.
  - **Cuando** el ESB transiciona la Saga a éxito y dispara la facturación.
  - **Entonces** se genera el número secuencial oficial `001-001-XXXXXXXXX`, cálculo de $15.00 de IVA y estado `EMITIDA`.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/facturacion-openapi-v2.yaml`.

#### `RF-FAC-02`: Consulta y Listado de Comprobantes Fiscales de Usuario
- **Enunciado:** El sistema debe permitir al usuario autenticado consultar el historial de facturas emitidas a su nombre con soporte de paginación por cursor.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#listarFacturas` y `#obtenerFactura`
- **Criterio de Aceptación:**
  - **Dado** un cliente en su panel de "Mis Facturas".
  - **Cuando** invoca `GET /facturas`.
  - **Entonces** recibe los comprobantes asociados a su `cliente_id` con enlaces de descarga.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/facturacion-openapi-v2.yaml`.

#### `RF-FAC-03`: Renderizado Server-Side de Comprobantes PDF con Clave SRI
- **Enunciado:** El sistema debe renderizar comprobantes fiscales en formato binario `application/pdf` incorporando la clave de acceso oficial de 49 dígitos y código de barras bidimensional.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#descargarFacturaPdf`
- **Criterio de Aceptación:**
  - **Dado** una factura existente con UUID `fac-999`.
  - **Cuando** se solicita `GET /facturas/fac-999/pdf`.
  - **Entonces** el servidor retorna el stream binario PDF con cabecera `Content-Type: application/pdf` en menos de 2 segundos.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/facturacion-openapi-v2.yaml`.

#### `RF-FAC-04`: Anulación Fiscal de Facturas por Reversión Saga
- **Enunciado:** El sistema debe permitir la anulación fiscal de un comprobante y emisión de nota de crédito cuando una reserva sea cancelada y compensada monetariamente.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#anularFactura`
- **Criterio de Aceptación:**
  - **Dado** una factura en estado `EMITIDA`.
  - **Cuando** se solicita `PATCH /facturas/{id}/anular` con motivo justificado.
  - **Entonces** el estado cambia a `ANULADA` y se asienta el evento contable en `schema_facturacion`.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/facturacion-openapi-v2.yaml`.

#### `RF-FAC-05`: Ensamblado en Memoria ESB de Factura Completa (`ORQ_FAC`)
- **Enunciado:** El sistema debe consolidar en memoria de aplicación los datos fiscales del cliente, encabezado de factura y líneas de detalle de las distintas verticales turísticas sin realizar SQL joins entre esquemas independientes.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) `#getFacturaCompleta`, [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#getFacturaCompletaAgregada` y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Query.obtenerFacturaCompleta`
- **Criterio de Aceptación:**
  - **Dado** un ID de factura o número secuencial.
  - **Cuando** se invoca `GET /esb/aggregate/facturas/{facturaId}`.
  - **Entonces** el ESB resuelve concurrentemente cliente y reservas retornando el comprobante íntegro.
- **Fuente:** `src/modules/esb/esb.controller.ts` y `contracts/esb-sagas-openapi-v2.yaml`.

#### `RF-FAC-06`: Reenvío de Comprobantes por Correo Electrónico
- **Enunciado:** El sistema debe permitir el reenvío de la factura electrónica por correo electrónico al cliente a través del servicio de mensajería SMTP.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) `#enviarFactura`
- **Criterio de Aceptación:**
  - **Dado** una solicitud con correo destinatario y comprobante emitido.
  - **Cuando** se ejecuta `POST /facturas/enviar`.
  - **Entonces** el servicio despacha el correo y responde con HTTP 200 y confirmación de entrega.
- **Fuente:** `src/modules/facturas/facturas.controller.ts` y `contracts/facturacion-openapi-v2.yaml`.

---

### 2.6 Finanzas y Liquidaciones B2B

#### `RF-FIN-01`: Cómputo de Métricas y Resumen Financiero Consolidado
- **Enunciado:** El sistema debe calcular en tiempo real el balance financiero del marketplace: volumen bruto facturado, comisiones retenidas por Booking (ej. 10%-15%), montos por liquidar y pagos ejecutados a socios.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) `#getResumenFinanciero`
- **Criterio de Aceptación:**
  - **Dado** un usuario administrador en el Panel 4 de Finanzas.
  - **Cuando** invoca `GET /finanzas/resumen`.
  - **Entonces** el sistema computa los totales sobre `schema_finanzas` y entrega el resumen agregado por vertical.
- **Fuente:** `src/modules/finanzas/finanzas.service.ts` y `contracts/finanzas-openapi-v2.yaml`.

#### `RF-FIN-02`: Generación de Liquidaciones Quincenales por Proveedor
- **Enunciado:** El sistema debe agrupar las ventas netas por proveedor en cortes quincenales (`Q1`: días 1 al 15, `Q2`: días 16 a fin de mes) deduciendo la comisión pactada.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) `#getLiquidaciones`
- **Criterio de Aceptación:**
  - **Dado** el cierre de la quincena `2026-10-Q1`.
  - **Cuando** se consulta `GET /finanzas/liquidaciones?periodo=2026-10-Q1`.
  - **Entonces** se muestran las órdenes asociadas, comisión retenida y saldo a favor de cada socio comercial.
- **Fuente:** `src/modules/finanzas/finanzas.service.ts` y `contracts/finanzas-openapi-v2.yaml`.

#### `RF-FIN-03`: Registro y Conciliación de Pagos a Proveedores
- **Enunciado:** El sistema debe permitir registrar la transferencia bancaria o pago de liquidación a un socio, adjuntando número de comprobante y actualizando el estado a `PAGADO`.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) `#marcarLiquidacionPagada`
- **Criterio de Aceptación:**
  - **Dado** una liquidación en estado `PENDIENTE`.
  - **Cuando** se envía `POST /finanzas/liquidaciones/{id}/pagar` con `comprobante_bancario`.
  - **Entonces** se actualiza `fecha_pago`, se asienta en el libro mayor y se devuelve HTTP 200.
- **Fuente:** `src/modules/finanzas/finanzas.service.ts` y `contracts/finanzas-openapi-v2.yaml`.

#### `RF-FIN-04`: Consulta del Libro Mayor Contable Multidominio
- **Enunciado:** El sistema debe mantener una bitácora inmutable de partidas contables (débitos y créditos) por cada transacción comercial de Booking.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) `#getLibroMayor`
- **Criterio de Aceptación:**
  - **Dado** un auditor contable consultando el libro mayor.
  - **Cuando** solicita `GET /finanzas/libro-mayor`.
  - **Entonces** se retornan los asientos contables con partida doble y fecha de registro.
- **Fuente:** `src/modules/finanzas/finanzas.service.ts` y `contracts/finanzas-openapi-v2.yaml`.

---

### 2.7 Administración Central del Ecosistema

#### `RF-ADM-01`: Dashboard de Estadísticas Globales del Marketplace
- **Enunciado:** El sistema debe ofrecer a los administradores métricas consolidadas de usuarios activos, reservas globales por vertical, volumen transaccional y disponibilidad de nodos.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getAdminStats`
- **Criterio de Aceptación:**
  - **Dado** un usuario autenticado con rol `ADMIN`.
  - **Cuando** carga la pantalla principal de `/admin`.
  - **Entonces** el backend responde con el objeto de métricas agregadas en menos de 300 ms.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

#### `RF-ADM-02`: Gestión del Directorio de Usuarios y Roles RBAC
- **Enunciado:** El sistema debe permitir a los administradores listar, crear, auditar el historial de compras y suspender/activar usuarios en la plataforma.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#adminGetUsers`, `#adminCrearUsuario`, `#adminUserAction` y `#adminGetUserHistorial`
- **Criterio de Aceptación:**
  - **Dado** un usuario sospechoso de fraude.
  - **Cuando** el administrador ejecuta `PUT /admin/users/{id}/action` con acción `SUSPEND`.
  - **Entonces** el usuario queda inhabilitado para operar y se registra la traza en la bitácora administrativa.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

#### `RF-ADM-03`: Auditoría y Cancelación de Emergencia de Reservas Globales
- **Enunciado:** El sistema debe facultar a los administradores para inspeccionar todas las reservas del ecosistema y ejecutar cancelaciones administrativas forzadas ante contingencias operativas.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getReservasGlobales`, `#cancelarReservaAdmin`, `#getReservaDetallesAdmin` y `#reenviarComprobanteAdmin`
- **Criterio de Aceptación:**
  - **Dado** un tour cancelado por cierre vial de fuerza mayor.
  - **Cuando** el administrador invoca `POST /admin/reservas/{id}/cancelar`.
  - **Entonces** se cancela la reserva en la tienda externa y se dispara el reembolso compensatorio automático.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

#### `RF-ADM-04`: Gestión de Solicitudes y Conectores de Nuevos Proveedores
- **Enunciado:** El sistema debe gestionar el ciclo de postulación, evaluación técnica y aprobación de nuevos proveedores turísticos externos.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getSolicitudesProveedor`, `#revisarSolicitudProveedor` y `#postularProveedorPublico`
- **Criterio de Aceptación:**
  - **Dado** una postulación pública de un nuevo operador turístico.
  - **Cuando** el administrador aprueba la solicitud vía `POST /admin/proveedores/solicitudes/{id}/revisar`.
  - **Entonces** se crea el conector en `schema_proveedores.config_proveedor` y se asigna su API Key.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

#### `RF-ADM-05`: Configuración de Parámetros Globales del Sistema
- **Enunciado:** El sistema debe permitir consultar y modificar en caliente banderas operativas globales (mantenimiento, tasa de impuestos, pasarelas activas).
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getAdminConfig`, `#updateAdminConfig` y `#getPublicConfig`
- **Criterio de Aceptación:**
  - **Dado** un cambio en la tasa de IVA nacional.
  - **Cuando** el admin actualiza `tax_percentage` mediante `PUT /admin/config`.
  - **Entonces** los nuevos checkouts adoptan el porcentaje inmediatamente sin reiniciar el servicio.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

---

### 2.8 Nodos, Observabilidad y Resiliencia

#### `RF-OBS-01`: Semáforo LED y Monitoreo de Salud de 5 Nodos en Tiempo Real
- **Enunciado:** El sistema debe monitorear periódicamente la latencia y disponibilidad de los 5 nodos de la red (`atracciones`, `autos`, `alojamientos`, `vuelos` y `grpc_inventory`), exponiendo su estado semafórico (🟢 `<500ms`, 🟡 `500-2000ms`, 🔴 `>2000ms`/caído, ⚪ deshabilitado) y estado del Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`, `MANUALLY_OPEN`).
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getNodesHealth`, [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) `#listarNodosPublic`, `#listarNodosAdmin`, `#pingNodoPublic` y `#pingNodoAdmin`
- **Criterio de Aceptación:**
  - **Dado** el Panel 1 de Administración abierto.
  - **Cuando** el frontend o un usuario ejecuta un ping a los nodos.
  - **Entonces** el sistema responde con la latencia en milisegundos y color semafórico correspondiente.
- **Fuente:** `src/modules/admin/connector-health.service.ts` y `contracts/observabilidad-openapi-v2.yaml`.

#### `RF-OBS-02`: Conmutación de Kill-Switches Dinámicos en Caliente
- **Enunciado:** El sistema debe permitir al administrador desconectar o reconectar en caliente cualquier tienda satélite mediante un Kill-Switch atómico que actualiza simultáneamente la base de datos (`schema_proveedores.config_proveedor`) y la memoria del gateway, aislando el nodo caído sin reiniciar el proceso.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#toggleNode` y [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) `#toggleKillSwitchAdmin`
- **Criterio de Aceptación:**
  - **Dado** que la tienda de atracciones experimenta fallos severos.
  - **Cuando** el administrador pulsa "Activar Kill-Switch" enviando `POST /admin/nodes/atracciones/toggle-killswitch`.
  - **Entonces** el estado del nodo conmuta a `MANUALLY_OPEN` (🔴), el Gateway desvía el tráfico al Mock Fallback local y se graba el evento en los logs de auditoría Winston.
- **Fuente:** `src/modules/admin/admin.controller.ts` y `contracts/admin-openapi-v2.yaml`.

#### `RF-OBS-03`: Resiliencia Perimetral con Circuit Breaker y Timeout <= 5s (CE01)
- **Enunciado:** Todas las peticiones HTTP outbound dirigidas a tiendas externas deben estar protegidas por un Circuit Breaker con timeout perimetral estricto de 5000 ms; ante caídas o lentitud extrema, el sistema debe responder de inmediato con Mock Fallback sin congelar ni colapsar la experiencia del usuario.
- **Prioridad:** Must have (MoSCoW) — *Condición Habilitante Rúbrica RDA2*
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) y adaptadores ACL
- **Criterio de Aceptación:**
  - **Dado** que la tienda externa de autos está completamente apagada.
  - **Cuando** un usuario consulta disponibilidad o realiza checkout.
  - **Entonces** el conector aborta a los 5000 ms, abre el circuito tras 3 fallos y retorna el catálogo de contingencia con bandera `CONFIRMED_FALLBACK` y `external_sync_pending: true`.
- **Fuente:** `src/modules/atracciones/acl/dilan-atracciones.adapter.ts`, `src/modules/autos/acl/autos-circuit-breaker.adapter.ts` y `test/integration/circuit-breaker-resilience.spec.ts`.

#### `RF-OBS-04`: Trazabilidad Distribuida Transversal y Grafos de Ejecución
- **Enunciado:** El sistema debe propagar los identificadores de trazabilidad (`X-Correlation-Id`, `traceparent` W3C) a través de REST, gRPC, RabbitMQ y Kafka, permitiendo consultar el grafo transversal de un proceso de negocio.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) `#getTrazaGrafo`
- **Criterio de Aceptación:**
  - **Dado** una solicitud con encabezado `X-Correlation-Id: corr-abc-123`.
  - **Cuando** se consulta `GET /observabilidad/trazas/corr-abc-123`.
  - **Entonces** el endpoint reconstruye la cronología de llamadas HTTP, frames AMQP y registros de streaming involucrados.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/observabilidad-openapi-v2.yaml`.

#### `RF-OBS-05`: Telemetría e Ingesta de Métricas de Frontend
- **Enunciado:** El sistema debe absorber eventos de interacción, tiempos de carga y errores de navegación reportados por el cliente web React.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) `#trackEvent`
- **Criterio de Aceptación:**
  - **Dado** un evento de UI capturado en el navegador (`PAGE_VIEW`, `CHECKOUT_CLICK`).
  - **Cuando** el cliente envía `POST /telemetry/events`.
  - **Entonces** el backend procesa el evento y lo replica a Kafka para análisis forense.
- **Fuente:** `src/modules/telemetry/telemetry.controller.ts` y `contracts/observabilidad-openapi-v2.yaml`.

#### `RF-OBS-06`: Auditoría Transaccional y Forense en Base de Datos
- **Enunciado:** El sistema debe persistir en `schema_auditoria` eventos clave de negocio: quién compró, qué administrador alteró configuraciones o conmutó kill-switches (con snapshot comparativo `antes`/`despues`), y bitácora de transacciones Saga para análisis SQL.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/auditoria-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/auditoria-openapi-v2.yaml) `#listarAuditoriaTransacciones`, `#listarAuditoriaAdmin`, `#listarAuditoriaSagas`, `#obtenerDetalleForenseSaga` y `#asentarAuditoriaInterna`
- **Criterio de Aceptación:**
  - **Dado** un cambio administrativo o compra completada.
  - **Cuando** se consulta `GET /auditoria/transacciones` o `GET /auditoria/admin`.
  - **Entonces** se devuelven los registros con IP de origen, usuario, fecha y snapshots relacionales.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md`, `ADR-003` y `contracts/auditoria-openapi-v2.yaml`.

#### `RF-OBS-07`: Registro Inmutable Cero Logs Técnicos en Base de Datos (Winston)
- **Enunciado:** En estricto cumplimiento del Mandato §2 de Cátedra, los logs técnicos, trazas HTTP y eventos de depuración no deben almacenarse en PostgreSQL; deben escribirse directamente en archivos físicos rotativos JSON Lines (`logs/audit-YYYY-MM-DD.log`).
- **Prioridad:** Must have (MoSCoW) — *Mandato Obligatorio de Cátedra*
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) `#getAdminAuditoria` y [`contracts/auditoria-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/auditoria-openapi-v2.yaml) `#getAdminAuditoriaFisica`
- **Criterio de Aceptación:**
  - **Dado** cualquier operación transaccional ejecutada en el gateway.
  - **Cuando** el administrador consulta `GET /admin/auditoria`.
  - **Entonces** el backend lee directamente el stream del archivo físico en disco sin saturar las conexiones de datos de PostgreSQL.
- **Fuente:** `src/modules/admin/admin.controller.ts`, `ADR-003` y `docs Paúl Rosero/architecture/GUIA_DEFENSA_ORAL_Y_MATRIZ_EVIDENCIAS_RDA2.md`.

---

### 2.9 Chatbot Asistente con Inteligencia Artificial

> **Nota de Alcance:** El módulo de chatbot conversacional se encuentra completamente programado en `src/modules/chatbot/` pero fue excluido formalmente del alcance evaluativo de RDA2 por decisión estratégica del equipo (P10 omitida). Se documentan sus requerimientos funcionales para trazabilidad técnica del código existente:

#### `RF-BOT-01`: Procesamiento Conversacional de Consultas Turísticas (Groq LLM)
- **Enunciado:** El sistema debe procesar mensajes en lenguaje natural enviados por los usuarios en el widget flotante, interactuando con el modelo LLM externo (Groq) con límites de longitud y políticas de timeout.
- **Prioridad:** Won't have (en RDA2) / Could have (en RDA3)
- **Estado:** `implementado` en código fuente (`src/modules/chatbot/chatbot.controller.ts#enviarMensaje`), omitido de formalización v2 en RDA2.
- **Contrato y Operación:** `ChatbotController#POST /chatbot/mensaje`
- **Criterio de Aceptación:**
  - **Dado** un usuario que consulta "¿Qué tours gastronómicos tienen disponibles en Quito?".
  - **Cuando** se envía `POST /chatbot/mensaje` con `mensaje` y `conversacion_id`.
  - **Entonces** el servicio invoca el modelo, ejecuta herramientas internas de catálogo y responde con recomendaciones contextuales.
- **Fuente:** `src/modules/chatbot/chatbot.controller.ts` y `docs/Chatbot_Integracion.md`.

#### `RF-BOT-02`: Gestión y Reseteo de Sesiones Conversacionales
- **Enunciado:** El sistema debe permitir inicializar una nueva conversación reseteando la memoria de diálogo en el almacén en memoria (`chatbot.conversation.store.ts`).
- **Prioridad:** Won't have (en RDA2)
- **Estado:** `implementado` en código fuente (`ChatbotController#POST /chatbot/nueva-conversacion`).
- **Contrato y Operación:** `ChatbotController#POST /chatbot/nueva-conversacion`
- **Criterio de Aceptación:**
  - **Dado** una sesión con historial previo.
  - **Cuando** el usuario pulsa "Nueva Conversación".
  - **Entonces** se genera un nuevo UUID de conversación y se limpian los buffers de memoria.
- **Fuente:** `src/modules/chatbot/chatbot.controller.ts`.

#### `RF-BOT-03`: Consulta de Estado y Alcance del Asistente
- **Enunciado:** El sistema debe exponer endpoints públicos para verificar si el servicio de IA cuenta con credenciales activas (`GROQ_API_KEY`) y obtener la lista de temas y destinos cubiertos.
- **Prioridad:** Won't have (en RDA2)
- **Estado:** `implementado` en código fuente (`ChatbotController#GET /chatbot/estado` y `GET /chatbot/alcance`).
- **Contrato y Operación:** `ChatbotController#GET /chatbot/estado` y `#GET /chatbot/alcance`
- **Criterio de Aceptación:**
  - **Dado** el inicio del widget en frontend.
  - **Cuando** se solicita `GET /chatbot/estado`.
  - **Entonces** retorna `disponible: true/false`, modelo activo y advertencia de uso responsable.
- **Fuente:** `src/modules/chatbot/chatbot.controller.ts`.

#### `RF-BOT-04`: Ejecución Restringida de Herramientas Turísticas de Solo Lectura
- **Enunciado:** El asistente inteligente debe disponer de capacidades de Tool-Calling acotadas estrictamente a consultas de solo lectura (búsqueda de atracciones, autos y vuelos), sin autorización para mutaciones transaccionales ni cobros no consentidos.
- **Prioridad:** Won't have (en RDA2)
- **Estado:** `implementado` en código fuente (`src/modules/chatbot/chatbot.tools-executor.service.ts`).
- **Contrato y Operación:** `ChatbotToolsExecutorService`
- **Criterio de Aceptación:**
  - **Dado** una orden de usuario solicitando "Cancela mi reserva".
  - **Cuando** el modelo intenta procesar la instrucción.
  - **Entonces** el bot rechaza la acción indicando que solo está facultado para consultas informativas y remite al usuario a "Mis Reservas".
- **Fuente:** `src/modules/chatbot/chatbot.tools-executor.service.ts`.

---

### 2.10 Webhooks Inbound y Eventos Externos

#### `RF-WH-01`: Receptor Central Inbound de Eventos de Tiendas Satélites
- **Enunciado:** El sistema debe proporcionar un receptor HTTP perimetral para recibir notificaciones asíncronas de tiendas satélites (cambios de estado de vuelos, confirmación de entregas de autos, cancelaciones de tours) bajo el estándar CloudEvents v1.0.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) `#recibirWebhookVertical`
- **Criterio de Aceptación:**
  - **Dado** un evento emitido por la tienda de vuelos informando retraso de itinerario.
  - **When** la aerolínea envía `POST /webhooks/vuelos` con payload CloudEvent.
  - **Then** el gateway valida la carga, responde con HTTP 202 Accepted y enruta el evento al Event Bus.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/webhooks-inbound-openapi-v2.yaml`.

#### `RF-WH-02`: Verificación Criptográfica de Firmas HMAC-SHA256
- **Enunciado:** Todas las peticiones inbound de webhooks deben ser verificadas mediante firma digital `X-Hub-Signature-256` utilizando el secreto compartido de cada vertical para impedir ataques de suplantación o manipulación de estados.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) `#recibirWebhookVertical`
- **Criterio de Aceptación:**
  - **Dado** una petición con firma manipulada o secreto incorrecto.
  - **Cuando** el webhook receptor evalúa la cabecera `X-Hub-Signature-256`.
  - **Entonces** el sistema rechaza la petición con HTTP 401 Unauthorized / RFC 7807 `INVALID_WEBHOOK_SIGNATURE`.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md`, `H-P09-02` y `contracts/webhooks-inbound-openapi-v2.yaml`.

#### `RF-WH-03`: Consola Administrativa de Bitácora y Reintentos de Webhooks
- **Enunciado:** El sistema debe proveer una consola para administradores que permita auditar entregas de webhooks, inspeccionar payloads crudos y disparar reintentos ante fallas temporales de red.
- **Prioridad:** Could have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) `#listarEntregasWebhooksAdmin`
- **Criterio de Aceptación:**
  - **Dado** un administrador auditando sincronizaciones de tiendas.
  - **Cuando** consulta `GET /webhooks/{vertical}/entregas`.
  - **Entonces** se muestran los intentos, código HTTP retornado y latencia de entrega.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/webhooks-inbound-openapi-v2.yaml`.

---

### 2.11 Ingesta de Inventario de Alta Frecuencia gRPC

#### `RF-STK-01`: Ingesta Unidireccional de Stock mediante gRPC HTTP/2
- **Enunciado:** El sistema debe mantener un servidor gRPC activo en el puerto TCP `50051` bajo el servicio `InventoryStockService`, absorbiendo actualizaciones síncronas de cupos y disponibilidad de las tiendas satélites mediante mensajes Protocol Buffers v3.
- **Prioridad:** Must have (MoSCoW) — *Mandato de Cátedra RDA2*
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** `src/proto/inventory.proto` y [`contracts/grpc/inventory-v2.proposed.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/inventory-v2.proposed.proto) `#PushStockUpdate`
- **Criterio de Aceptación:**
  - **Dado** que la tienda de atracciones modifica los cupos de un tour a 4 unidades disponibles.
  - **Cuando** envía un mensaje binario `StockUpdateMessage` al puerto 50051.
  - **Entonces** el servidor gRPC actualiza el inventario en caché en menos de 20 ms y responde con `StockUpdateAck(success=true)`.
- **Fuente:** `src/modules/inventory/inventory.service.ts` y `contracts/grpc/README.md`.

#### `RF-STK-02`: Streaming de Cambios de Inventario por Lotes Continuos
- **Enunciado:** El sistema debe admitir canales de streaming gRPC unidireccionales desde el cliente (`StreamInventoryChanges`) para procesar ráfagas de deltas de stock continuo sin sobrecargar conexiones HTTP.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** `src/proto/inventory.proto` y [`contracts/grpc/inventory-v2.proposed.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/inventory-v2.proposed.proto) `#StreamInventoryChanges`
- **Criterio de Aceptación:**
  - **Dado** una secuencia de 50 eventos `StockChangeEvent` emitidos en streaming.
  - **Cuando** finaliza el stream de datos.
  - **Entonces** el servidor retorna `StreamSummary(total_events_processed=50, is_synchronized=true)`.
- **Fuente:** `src/modules/inventory/inventory.service.ts` y `src/proto/inventory.proto`.

#### `RF-STK-03`: Streaming Bidireccional y Verificación en Lote (Contrato Propuesto v2)
- **Enunciado:** El sistema debe soportar operaciones de actualización masiva por lotes (`BatchStockUpdate`) y verificación directa de disponibilidad (`CheckAvailability`) para sincronizaciones pesadas.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/grpc/inventory-v2.proposed.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/inventory-v2.proposed.proto) `#BatchStockUpdate`, `#BiDirectionalStockStream` y `#CheckAvailability`
- **Criterio de Aceptación:**
  - **Dado** un lote de 200 modificaciones de disponibilidad de vuelos y autos.
  - **Cuando** se ejecuta el RPC `BatchStockUpdate`.
  - **Entonces** el servicio valida y confirma la absorción de los registros con reporte de discrepancias.
- **Fuente:** `contracts/grpc/README.md` y `contracts/grpc/inventory-v2.proposed.proto`.

#### `RF-STK-04`: Inspección HTTP y Diagnóstico del Servicio gRPC
- **Enunciado:** El sistema debe proporcionar endpoints REST para que el panel administrativo y los monitores de infraestructura verifiquen el estado del socket gRPC y consulten los ítems en caché de memoria.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) `#getInventoryStatus` y `#getInventory`
- **Criterio de Aceptación:**
  - **Dado** un tester verificando el estado del puerto 50051.
  - **Cuando** invoca `GET /inventory/status`.
  - **Entonces** recibe `status: "ONLINE"`, puerto `50051` y conteo de servicios registrados.
- **Fuente:** `src/modules/inventory/inventory-grpc.controller.ts` y `contracts/observabilidad-openapi-v2.yaml`.

---

### 2.12 Clientes, Identidad y Seguridad RBAC

#### `RF-CLI-01`: Autenticación B2C y Ciclo de Sesión Supabase Auth
- **Enunciado:** El sistema debe delegar el registro, inicio de sesión, renovación de tokens JWT y revocación de sesión de los clientes finales en el servicio de identidad de Supabase Auth.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `delegado` (`x-status: delegated`)
- **Contrato y Operación:** [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml) `#supabaseSignUp`, `#supabaseSignInWithPassword`, `#supabaseGetUser` y `#supabaseSignOut`
- **Criterio de Aceptación:**
  - **Dado** un usuario que introduce sus credenciales válidas en el modal de login.
  - **Cuando** se autentica contra Supabase.
  - **Entonces** recibe un JWT Bearer válido con claims de usuario y expiración establecida.
- **Fuente:** `src/core/auth/` y `contracts/clientes-openapi-v2.yaml`.

#### `RF-CLI-02`: Consulta Canónica de Cliente en Base de Datos Relacional
- **Enunciado:** El sistema debe proporcionar un endpoint interno para que el ESB y los orquestadores consulten la ficha canónica del cliente en `schema_clientes.clientes` (datos de facturación, documento de identidad, dirección) sin acoplamientos ni joins de base de datos.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml) `#getClienteCanonico`
- **Criterio de Aceptación:**
  - **Dado** una orden que requiere emisión fiscal para el usuario `cli-456`.
  - **Cuando** el ESB invoca `GET /clientes/cli-456`.
  - **Entonces** se devuelven RUC/cédula, nombres y correo en un contrato normalizado.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/clientes-openapi-v2.yaml`.

#### `RF-CLI-03`: Actualización de Perfil y Datos Fiscales
- **Enunciado:** El sistema debe permitir a los clientes actualizar sus datos personales, fiscales y preferencias de viaje en su ficha de cliente.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml) `#updateClienteCanonico`
- **Criterio de Aceptación:**
  - **Dado** un cliente que actualiza su dirección fiscal.
  - **Cuando** envía `PATCH /clientes/{id}` con datos validados.
  - **Entonces** se persisten los cambios en `schema_clientes` y se devuelven los campos actualizados.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md` y `contracts/clientes-openapi-v2.yaml`.

#### `RF-CLI-04`: Asignación y Revocación Formal de Roles RBAC
- **Enunciado:** El sistema debe permitir a un administrador asignar o modificar formalmente el rol de un usuario en base de datos (`CLIENTE`, `ADMIN`, `MANTENIMIENTO`), eliminando cualquier bypass inseguro por cabeceras HTTP no firmadas.
- **Prioridad:** Must have (MoSCoW) — *Seguridad Crítica*
- **Estado:** `planificado` (`x-status: planned`)
- **Contrato y Operación:** [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml) `#updateClienteRol`
- **Criterio de Aceptación:**
  - **Dado** un usuario que requiere permisos de mantenimiento de flota.
  - **Cuando** un administrador con sesión activa ejecuta `PATCH /clientes/{id}/rol` con `rol: "MANTENIMIENTO"`.
  - **Entonces** el rol se asienta en la base de datos relacional y se audita la acción.
- **Fuente:** `docs/RDA2/PLANNED_ENDPOINTS.md`, `H-P06-03` y `contracts/clientes-openapi-v2.yaml`.

#### `RF-CLI-05`: Control de Acceso Basado en Roles Canónicos (RBAC)
- **Enunciado:** El sistema debe aplicar autorización perimetral en todos los controladores y endpoints según los roles canónicos (`CLIENTE`, `ADMIN`, `MANTENIMIENTO`), garantizando que solo usuarios autorizados accedan a paneles y operaciones críticas.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** `src/core/guards/roles.guard.ts`, `src/core/auth/roles.enum.ts` y [`contracts/common/components-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/common/components-v2.yaml) (Esquemas de seguridad)
- **Criterio de Aceptación:**
  - **Dado** un usuario con rol `CLIENTE` intentando acceder a `POST /admin/nodes/toggle`.
  - **Cuando** el guardia perimetral `RolesGuard` evalúa los claims del token.
  - **Entonces** se rechaza el acceso de forma inmediata con HTTP 403 Forbidden y respuesta estandarizada bajo RFC 7807.
- **Fuente:** `src/modules/admin/admin-seguridad.spec.ts` (17/17 tests PASS) y `contracts/common/components-v2.yaml`.

---

### 2.13 Event Bus Dual Asíncrono (RabbitMQ + Kafka)

#### `RF-EVT-01`: Publicación de Eventos Transaccionales y de Compensación a RabbitMQ
- **Enunciado:** El sistema debe publicar en RabbitMQ (`booking.events` / `q.sagas.compensacion`) eventos transaccionales autoritativos de ciclo de vida (`order.confirmed`, `saga.compensate`) garantizando entrega segura y procesamiento confiable.
- **Prioridad:** Must have (MoSCoW) — *Mandato de Cátedra Semana 8*
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) `#publishOrderConfirmed` y `#publishSagaCompensate`
- **Criterio de Aceptación:**
  - **Dado** una orden procesada por el orquestador.
  - **Cuando** finaliza el cobro exitosamente.
  - **Entonces** se emite el evento transaccional a la cola de RabbitMQ con `correlation_id` en las cabeceras AMQP.
- **Fuente:** `src/modules/event-bus/dual-event-bus.service.ts` y `contracts/asyncapi-eventos-v2.yaml`.

#### `RF-EVT-02`: Publicación y Consumo de Actualizaciones de Stock en Tiempo Real
- **Enunciado:** El sistema debe propagar eventos de deltas de stock (`stock.updated`) generados por compras o reabastecimientos para invalidar cachés locales en todos los nodos integrados.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) `#publishStockUpdated`
- **Criterio de Aceptación:**
  - **Dado** una reducción de aforo en la tienda de atracciones.
  - **Cuando** se confirma la compra.
  - **Entonces** el evento se difunde por el broker AMQP actualizando el inventario global.
- **Fuente:** `src/modules/event-bus/dual-event-bus.service.ts` y `contracts/asyncapi-eventos-v2.yaml`.

#### `RF-EVT-03`: Réplica Asíncrona de Auditoría, Catálogo y Telemetría a Kafka Streaming
- **Enunciado:** Una vez confirmados los eventos en RabbitMQ, el puente de integración (`RabbitKafkaBridgeService`) debe replicarlos asíncronamente a los topics de Apache Kafka (`booking.audit.sagas`, `booking.catalogo.sync`, `booking.telemetry.events`) conservando `correlation_id` y `traceparent` para auditoría forense inmutable y analítica.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) `#publishKafkaCatalogoSync`, `#publishKafkaAuditoriaSagas` y `#publishKafkaTelemetryEvents`
- **Criterio de Aceptación:**
  - **Dado** un evento transaccional confirmado en RabbitMQ.
  - **Cuando** el puente cross-broker procesa el frame.
  - **Entonces** se asienta en el topic correspondiente de Kafka con clave de partición uniforme.
- **Fuente:** `src/modules/event-bus/rabbit-kafka-bridge.service.ts` y `contracts/asyncapi-eventos-v2.yaml`.

---

### 2.14 Reglas Operativas y Ciclo de Vida de Verticales

#### `RF-ATR-01`: Aforo Diferenciado por Edad y Cupo Físico en Atracciones
- **Enunciado:** El sistema debe garantizar que al reservar un tour con boletos para adultos, niños e infantes, los infantes tengan tarifa de $0.00 pero consuman obligatoriamente 1 cupo físico en la capacidad total del turno.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) `#POST /atracciones/reservas`
- **Criterio de Aceptación:**
  - **Dado** un turno con 2 cupos libres.
  - **Cuando** un usuario intenta comprar 1 boleto Adulto ($30) y 2 boletos Infante ($0).
  - **Entonces** el sistema rechaza la compra por capacidad excedida (3 cupos requeridos vs 2 disponibles).
- **Fuente:** `Pendientes/modulo_atracciones.md` y `frontend/src/pages/AtraccionesSearchPage.jsx`.

#### `RF-ATR-02`: Check-in Presencial en Mostrador y Emisión de Voucher QR
- **Enunciado:** El sistema debe permitir a los turistas ver su voucher digital con código QR y a los guías completar el check-in presencial en mostrador asignando guía oficial y cambiando el estado a `CHECKED_IN`.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) `#POST /atracciones/reservas/{id}/checkin` y [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) `#Mutation.realizarCheckInDigital`
- **Criterio de Aceptación:**
  - **Dado** una reserva de tour confirmada.
  - **Cuando** el usuario o guía ejecuta el check-in con documento de identidad.
  - **Entonces** el voucher se actualiza con fecha/hora de validación presencial y guía asignado.
- **Fuente:** `frontend/src/components/VoucherModal.jsx` y `contracts/atracciones-openapi-v2.yaml`.

#### `RF-AUT-01`: Máquina de Estados Finita y Cooldown de 2 Horas de Limpieza
- **Enunciado:** La flota de autos debe transicionar por los estados finitos `DISPONIBLE` → `RESERVADO` → `LISTO_PARA_ENTREGAR` → `ENTREGADO` → `EN_LIMPIEZA` → (`DISPONIBLE` \| `EN_MANTENIMIENTO`). Tras la devolución del auto, este debe permanecer obligatoriamente durante 2 horas cronometradas en estado `EN_LIMPIEZA`, rechazando con HTTP 409 (`VEHICLE_IN_CLEANING_COOLDOWN`) cualquier intento de reserva prematura.
- **Prioridad:** Must have (MoSCoW) — *Mandato Rúbrica RDA2*
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) `#POST /autos/orders/{id}/checkin-devolucion`
- **Criterio de Aceptación:**
  - **Dado** un auto devuelto hace 45 minutos.
  - **Cuando** un cliente intenta reservar dicho vehículo.
  - **Entonces** el sistema bloquea la operación retornando HTTP 409 con el tiempo remanente en minutos del cronómetro de limpieza.
- **Fuente:** `Pendientes/modulo_renta_autos.md`, `ADR-004` y `contracts/autos-openapi-v2.yaml`.

#### `RF-AUT-02`: Inspección de Patio, Odómetro y Alertas de Taller Preventivo
- **Enunciado:** El sistema debe registrar las lecturas de odómetro en la entrega y devolución del auto; si el kilometraje acumulado supera el umbral configurado, el vehículo debe transicionar a `EN_MANTENIMIENTO` con orden de taller preventivo.
- **Prioridad:** Should have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) `#POST /autos/{id}/mantenimiento/registro`
- **Criterio de Aceptación:**
  - **Dado** un auto devuelto con 10,050 km superando el umbral de 10,000 km.
  - **Cuando** el operador de patio asienta el check-in de devolución.
  - **Entonces** el vehículo se bloquea para alquiler público y se lista en la pestaña de mantenimiento de la consola.
- **Fuente:** `src/modules/autos/` y `contracts/autos-openapi-v2.yaml`.

#### `RF-VUE-01`: Retención Temporal de Cupos (*Hold*) con TTL en Vuelos
- **Enunciado:** El sistema debe permitir retener temporalmente los asientos seleccionados de un vuelo mediante un *Hold* con tiempo de vida (TTL) de 15 minutos mientras el usuario completa el pago, liberándolos automáticamente si la sesión expira.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) `#createHold`, `#getHold` y `#releaseHold`
- **Criterio de Aceptación:**
  - **Dado** una selección de vuelo para 1 pasajero.
  - **Cuando** se ejecuta `POST /vuelos/v2/holds`.
  - **Entonces** se reservan los asientos temporalmente y se entrega el identificador `holdId` con timestamp de expiración.
- **Fuente:** `Pendientes/modulo_vuelos.md` y `contracts/vuelos-openapi-v2.yaml`.

#### `RF-VUE-02`: Check-in Digital y Tarjeta de Embarque con PNR
- **Enunciado:** El sistema debe permitir el check-in online para vuelos confirmados, asignación o cambio de asientos y emisión de la tarjeta de embarque con código PNR y documento electrónico.
- **Prioridad:** Must have (MoSCoW)
- **Estado:** `implementado` (`x-status: implemented`)
- **Contrato y Operación:** [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) `#checkIn` y `#listBoardingPasses`
- **Criterio de Aceptación:**
  - **Dado** una reserva de vuelo confirmada con código PNR `EQ-9876`.
  - **Cuando** el usuario ejecuta `POST /vuelos/v2/bookings/EQ-9876/check-in`.
  - **Entonces** se emite la tarjeta de embarque con el asiento asignado y código de barras digital.
- **Fuente:** `Pendientes/modulo_vuelos.md` y `contracts/vuelos-openapi-v2.yaml`.

---

## 3. Historias de Usuario Clave (HU-01 a HU-10)

### 🧑‍💼 HU-01: Búsqueda Multivertical y Descubrimiento Turístico Integrado
- **Actor:** `CLIENTE` (Turista)
- **Descripción:** *Como turista planificando mis vacaciones, quiero buscar simultáneamente tours, alquiler de autos y vuelos hacia mi destino en un solo portal, para cotizar mi viaje completo de manera ágil y sin saltar entre diferentes páginas web.*
- **Requisitos Vinculados:** `RF-BUS-01`, `RF-BUS-02`, `RF-BUS-03`, `RF-BUS-04`, `RF-STK-01`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que ingreso a la página principal de Booking Prototipo y digito "Galápagos" como destino.
  - **Cuando** pulso el botón "Buscar Experiencias y Viajes".
  - **Entonces** la interfaz presenta pestañas unificadas con resultados de tours, vehículos disponibles en la isla y opciones de vuelos con tarifas actualizadas en tiempo real desde la caché de inventario gRPC.

---

### 🛒 HU-02: Armado de Carrito Persistente y Combo Promocional con Descuento
- **Actor:** `CLIENTE` (Turista)
- **Descripción:** *Como cliente frecuente, quiero armar un paquete personalizado agregando un tour patrimonial y un auto económico, para aprovechar un descuento combo garantizado por los acuerdos comerciales B2B de los socios.*
- **Requisitos Vinculados:** `RF-PKG-01`, `RF-PKG-02`, `RF-PKG-03`, `RF-SAGA-05`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que tengo un tour de atracciones ($40) y un auto ($60) agregados en mi carrito de compras.
  - **Cuando** el sistema detecta que ambos proveedores tienen acuerdo comercial B2B activo con tope de descuento del 15%.
  - **Entonces** se aplica automáticamente un 10% de descuento combo, reflejando un total final inmutable de $90.00 ($10 de ahorro visible) congelado en `schema_carritos`.

---

### 💳 HU-03: Compra Segura Multitienda Mediante Saga Orquestada
- **Actor:** `CLIENTE` (Turista)
- **Descripción:** *Como comprador online, quiero pagar mi orden de compra compuesta mediante un proceso de checkout único, para tener la garantía de que todas mis reservas queden confirmadas atómicamente o se me devuelva el dinero íntegro si alguna tienda falla.*
- **Requisitos Vinculados:** `RF-SAGA-01`, `RF-PAG-01`, `RF-FAC-01`, `RF-FAC-05`, `RF-EVT-01`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que inicio el checkout enviando los datos de mi tarjeta y cabecera `Idempotency-Key`.
  - **Cuando** el ESB coordina la Saga LIFO reservando secuencialmente en atracciones, autos y procesando el cobro en la pasarela.
  - **Entonces** recibo la confirmación global de compra, mi número de factura electrónica con desglose de IVA y las órdenes aparecen confirmadas en "Mis Reservas".

---

### 🔄 HU-04: Cancelación Compensatoria y Reembolso Monetario 100%
- **Actor:** `CLIENTE` (Turista)
- **Descripción:** *Como usuario con un imprevisto de viaje, quiero cancelar una reserva de tour confirmada desde mi panel "Mis Reservas", para liberar mis cupos y recibir mi reembolso financiero de forma transparente e inmediata sin trámites burocráticos.*
- **Requisitos Vinculados:** `RF-SAGA-02`, `RF-SAGA-03`, `RF-PAG-02`, `RF-ATR-01`, `RF-EVT-01`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que tengo una reserva confirmada de atracción para 2 personas por $50.00.
  - **Cuando** presiono el botón "Cancelar reserva y solicitar reembolso" y confirmo en el modal de dos pasos.
  - **Entonces** el sistema restituye los 2 cupos al inventario del tour, emite el comprobante de reembolso monetario por $50.00 en `MS_PAG`, cambia el estado a `CANCELADA` y graba la traza compensatoria en la auditoría física inmutable Winston.

---

### 🎟️ HU-05: Check-in Presencial y Generación de Vouchers QR
- **Actor:** `CLIENTE` (Turista) y `PROV` (Guía Turístico)
- **Descripción:** *Como turista llegando al sitio del tour, quiero mostrar mi voucher digital en mi teléfono celular con código QR, para que el guía valide mi entrada en mostrador y me asigne al grupo de visita.*
- **Requisitos Vinculados:** `RF-BUS-01`, `RF-ATR-02`, `RF-VUE-02`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que accedo a "Mis Reservas" el día agendado para mi atracción.
  - **Cuando** pulso "Ver Voucher & Check-in Presencial".
  - **Entonces** se despliega el código QR con los datos del tour; al ingresar mi documento en mostrador, el guía completa el check-in y la reserva pasa a estado `CHECKED_IN` con el guía oficial asignado.

---

### 🔴 HU-06: Aislamiento en Caliente de Tiendas Caídas Mediante Kill-Switch
- **Actor:** `ADMIN` (Administrador del Sistema)
- **Descripción:** *Como administrador del sistema, quiero desconectar en caliente una tienda externa que presenta fallos reiterados desde el panel de control, para proteger la experiencia del usuario y evitar que el Gateway colapse esperando respuestas lentas.*
- **Requisitos Vinculados:** `RF-ADM-01`, `RF-ADM-06`, `RF-OBS-01`, `RF-OBS-02`, `RF-OBS-03`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que en el Semáforo LED el nodo de atracciones muestra latencia crítica de 4500 ms (🟡).
  - **Cuando** pulso el botón "🔴 Activar Kill-Switch" para el proveedor correspondiente.
  - **Entonces** el conector cambia su estado a `MANUALLY_OPEN` (🔴), las nuevas consultas conmutan de forma transparente al Mock Fallback local de contingencia y se asienta el evento administrativo en el log físico de auditoría.

---

### 🚗 HU-07: Inspección de Devolución de Auto e Inicio de Cooldown de Limpieza
- **Actor:** `MANTENIMIENTO` (Operador de Flota de Autos)
- **Descripción:** *Como operador de patio, quiero asentar el acta digital de devolución del vehículo registrando kilometraje y daños, para que el auto entre automáticamente en las 2 horas reglamentarias de limpieza antes de volver a ser rentado.*
- **Requisitos Vinculados:** `RF-AUT-01`, `RF-AUT-02`, `RF-CLI-05`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** un vehículo devuelto por un cliente en el depot de alquiler.
  - **Cuando** ingreso con rol `MANTENIMIENTO` e ingreso el kilometraje final y observaciones de inspección.
  - **Entonces** el estado del vehículo conmuta a `EN_LIMPIEZA`, se activa el cronómetro regresivo de 2 horas (120 minutos) y cualquier intento de reserva pública es rechazado con HTTP 409 `VEHICLE_IN_CLEANING_COOLDOWN`.

---

### 💼 HU-08: Corte Quincenal y Liquidación de Comisiones B2B
- **Actor:** `ADMIN` (Responsable Financiero)
- **Descripción:** *Como administrador contable, quiero generar el corte quincenal de liquidaciones por proveedor, para calcular las comisiones devengadas por Booking y registrar los pagos bancarios transferidos a los socios turísticos.*
- **Requisitos Vinculados:** `RF-FIN-01`, `RF-FIN-02`, `RF-FIN-03`, `RF-FIN-04`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** el cierre de quincena del mes en curso.
  - **Cuando** ingreso al Panel 4 y selecciono el período `YYYY-MM-Q1`.
  - **Entonces** el sistema lista el importe bruto vendido, retiene el 12% de comisión oficial de Booking, emite la liquidación neta y permite adjuntar el comprobante bancario cambiando el estado a `PAGADO`.

---

### ⚡ HU-09: Sincronización Continua de Inventarios Satélites vía gRPC
- **Actor:** `PROV` (Microservicio Satélite de Compañeros)
- **Descripción:** *Como sistema de información de una tienda asociada, quiero transmitir mis variaciones de stock al Booking Prototipo mediante gRPC de alta frecuencia, para que el marketplace mantenga cupos exactos sin saturar la red con consultas repetitivas.*
- **Requisitos Vinculados:** `RF-STK-01`, `RF-STK-02`, `RF-STK-04`, `RF-EVT-02`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que se confirma una reserva directa en el sistema de la tienda externa.
  - **Cuando** el microservicio emite un mensaje `PushStockUpdate` al puerto 50051 de Booking.
  - **Entonces** el servidor gRPC absorbe el cambio en menos de 20 ms, actualiza la caché en memoria y replica el evento al Event Bus.

---

### 🤖 HU-10: Asistencia Turística Conversacional Inteligente
- **Actor:** `CLIENTE` (Turista)
- **Descripción:** *Como usuario navegando en la tienda, quiero interactuar con un asistente virtual inteligente en lenguaje natural, para que me oriente sobre recomendaciones de viaje y resuelva dudas sobre servicios disponibles.*
- **Requisitos Vinculados:** `RF-BOT-01`, `RF-BOT-02`, `RF-BOT-03`, `RF-BOT-04`.
- **Criterios de Aceptación (Gherkin):**
  - **Dado** que el usuario abre el widget de chat flotante en el marketplace.
  - **When** escribe "¿Cuáles son las mejores opciones familiares de tours en Baños?".
  - **Then** el asistente analiza el catálogo de atracciones activas, filtra las opciones aptas para niños y entrega una recomendación con enlaces directos a las fichas de producto.

---

## 4. Fronteras del Sistema y Fuera de Alcance (Out of Scope)

Para delimitar con precisión la responsabilidad técnica de Booking Prototipo en RDA2:
1. **Tienda de Alojamientos (Contrato de Terceros):** La especificación, base de datos interna y reglas de check-in hotelero de alojamientos son administradas de forma autónoma por el equipo externo responsable de dicha vertical (`contracts/alojamientos-openapi.yaml` v1.0.0). Booking Prototipo consume sus endpoints como cliente REST y agrega su catálogo, pero no altera su esquema interno ni sus contratos fuente.
2. **Pasarela Bancaria con Cobro a Tarjetas Reales:** Queda fuera de alcance la conexión con redes financieras reales (Visa/Mastercard/Stripe en modo producción). Las operaciones se ejecutan a través de la pasarela de simulación SOA (`MS_PAG`) que reproduce fielmente respuestas exitosas, fondos insuficientes y timeouts.
3. **Modificación de Repositorios Privados de Compañeros:** El Gateway no accede ni modifica las bases de datos de los compañeros ni sus repositorios Git. Toda la interoperabilidad se produce exclusivamente a través de los contratos públicos expuestos (REST OpenAPI v2 y gRPC `inventory.proto`).
4. **Aplicación Móvil Nativa (Flutter / React Native):** El alcance de RDA2 se focaliza en el API Gateway NestJS, contratos v2, observabilidad y Frontend Web React 18 + Vite. Las aplicaciones móviles nativas corresponden a la evolución futura de la asignatura (RDA3).

---

## 5. Matriz de Trazabilidad Global: Requisitos Funcionales vs Contratos Formales

La siguiente matriz exhaustiva certifica que **el 100% de los contratos formales de Booking v2 (`*-v2.*`) y sus operaciones asociadas están debidamente cubiertos y trazados** contra los requisitos funcionales del sistema:

| ID Requisito | Dominio Funcional | Prioridad | Estado de Implementación | Contrato Formal v2 | Operación / Método Referenciado | Fuente en Código / Documento |
|---|---|:---:|:---:|---|---|---|
| `RF-BUS-01` | Búsqueda Unificada | Must | `implementado` | `contracts/graphql/schema.graphql` | `Query.catalogoUnificado` | `src/modules/graphql/graphql-bff.resolver.ts` |
| `RF-BUS-02` | Búsqueda Unificada | Must | `implementado` | `contracts/atracciones-openapi-v2.yaml` | `GET /atracciones/search`, `/categorias/arbol` | `Pendientes/modulo_atracciones.md` |
| `RF-BUS-03` | Búsqueda Unificada | Must | `implementado` | `contracts/autos-openapi-v2.yaml` | `GET /autos/search`, `/autos/flota` | `Pendientes/modulo_renta_autos.md` |
| `RF-BUS-04` | Búsqueda Unificada | Must | `implementado` | `contracts/vuelos-openapi-v2.yaml` | `searchFlights`, `getSeatMap` | `Pendientes/modulo_vuelos.md` |
| `RF-SAGA-01`| Checkout & Saga | Must | `implementado` | `contracts/esb-sagas-openapi-v2.yaml` | `checkoutSaga` | `src/modules/esb/interna/saga-orchestrator.service.ts` |
| `RF-SAGA-02`| Checkout & Saga | Must | `implementado` | `contracts/esb-sagas-openapi-v2.yaml` | `checkoutSaga` (compensación LIFO) | `test/test-cancel-saga.js` / `ADR-007` |
| `RF-SAGA-03`| Checkout & Saga | Must | `implementado` | `contracts/esb-sagas-openapi-v2.yaml` | `getMisReservasAgregadas` | `src/modules/esb/esb.controller.ts` |
| `RF-SAGA-04`| Checkout & Saga | Should | `planificado` | `contracts/esb-sagas-openapi-v2.yaml` | `obtenerTrazaGrafoSaga` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-SAGA-05`| Carritos Persistentes | Must | `planificado` | `contracts/carritos-openapi-v2.yaml` | `inicializarCarrito`, `agregarItemCarrito` | `docs/RDA2/PLANNED_ENDPOINTS.md` / `MS_CAR` |
| `RF-SAGA-06`| Carritos Persistentes | Must | `planificado` | `contracts/carritos-openapi-v2.yaml` | `ejecutarCheckoutCarrito` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-SAGA-07`| Carritos Persistentes | Should | `planificado` | `contracts/carritos-openapi-v2.yaml` | `detectarCarritosAbandonados` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-PAG-01` | Pagos SOA | Must | `implementado` | `contracts/pagos-openapi-v2.yaml` | `procesarPago` | `src/modules/pagos/pagos.service.ts` |
| `RF-PAG-02` | Pagos SOA | Must | `implementado` | `contracts/pagos-openapi-v2.yaml` | `procesarReembolso` | `src/modules/pagos/pagos.service.ts` |
| `RF-PAG-03` | Pagos SOA | Should | `implementado` | `contracts/pagos-openapi-v2.yaml` | `getConfigSimulador`, `updateConfigSimulador` | `src/modules/pagos/pagos.controller.ts` |
| `RF-PAG-04` | Pagos SOA | Should | `implementado` | `contracts/pagos-openapi-v2.yaml` | `getTransacciones` | `src/modules/pagos/pagos.controller.ts` |
| `RF-PAG-05` | Pagos SOA | Must | `planificado` | `contracts/pagos-openapi-v2.yaml` | `validarPaymentReference` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-PKG-01` | Paquetes & Promociones | Must | `implementado` | `contracts/paquetes-openapi-v2.yaml` | `crearPaqueteDinamico` | `src/modules/paquetes/paquetes.service.ts` |
| `RF-PKG-02` | Paquetes & Promociones | Should | `implementado` | `contracts/paquetes-openapi-v2.yaml` | `listarPaquetes`, `findPaqueteById` | `src/modules/paquetes/paquetes.controller.ts` |
| `RF-PKG-03` | Paquetes & Promociones | Should | `implementado` | `contracts/paquetes-openapi-v2.yaml` | `getContratosPromociones` | `src/modules/paquetes/paquetes.controller.ts` |
| `RF-PKG-04` | Paquetes & Promociones | Could | `planificado` | `contracts/paquetes-openapi-v2.yaml` | `actualizarContratoPromociones` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-PKG-05` | Acuerdos B2B Socios | Must | `implementado` | `contracts/atracciones-openapi-v2.yaml` | `GET/PUT /promociones/contrato` | Mandato de Cátedra RDA2 |
| `RF-FAC-01` | Facturación Fiscal | Must | `planificado` | `contracts/facturacion-openapi-v2.yaml` | `emitirFactura` | `docs/RDA2/PLANNED_ENDPOINTS.md` / `MS_FAC` |
| `RF-FAC-02` | Facturación Fiscal | Should | `planificado` | `contracts/facturacion-openapi-v2.yaml` | `listarFacturas`, `obtenerFactura` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-FAC-03` | Facturación Fiscal | Should | `planificado` | `contracts/facturacion-openapi-v2.yaml` | `descargarFacturaPdf` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-FAC-04` | Facturación Fiscal | Should | `planificado` | `contracts/facturacion-openapi-v2.yaml` | `anularFactura` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-FAC-05` | Facturación Fiscal | Must | `implementado` | `contracts/esb-sagas-openapi-v2.yaml` | `getFacturaCompleta` (`ORQ_FAC`) | `src/modules/esb/esb.controller.ts` |
| `RF-FAC-06` | Facturación Fiscal | Could | `implementado` | `contracts/facturacion-openapi-v2.yaml` | `enviarFactura` | `src/modules/facturas/facturas.controller.ts` |
| `RF-FIN-01` | Finanzas B2B | Must | `implementado` | `contracts/finanzas-openapi-v2.yaml` | `getResumenFinanciero` | `src/modules/finanzas/finanzas.service.ts` |
| `RF-FIN-02` | Finanzas B2B | Must | `implementado` | `contracts/finanzas-openapi-v2.yaml` | `getLiquidaciones` | `src/modules/finanzas/finanzas.service.ts` |
| `RF-FIN-03` | Finanzas B2B | Should | `implementado` | `contracts/finanzas-openapi-v2.yaml` | `marcarLiquidacionPagada` | `src/modules/finanzas/finanzas.service.ts` |
| `RF-FIN-04` | Finanzas B2B | Could | `implementado` | `contracts/finanzas-openapi-v2.yaml` | `getLibroMayor` | `src/modules/finanzas/finanzas.service.ts` |
| `RF-ADM-01` | Administración | Must | `implementado` | `contracts/admin-openapi-v2.yaml` | `getAdminStats` | `src/modules/admin/admin.controller.ts` |
| `RF-ADM-02` | Administración | Must | `implementado` | `contracts/admin-openapi-v2.yaml` | `adminGetUsers`, `adminUserAction` | `src/modules/admin/admin.controller.ts` |
| `RF-ADM-03` | Administración | Should | `implementado` | `contracts/admin-openapi-v2.yaml` | `getReservasGlobales`, `cancelarReservaAdmin` | `src/modules/admin/admin.controller.ts` |
| `RF-ADM-04` | Administración | Could | `implementado` | `contracts/admin-openapi-v2.yaml` | `getSolicitudesProveedor`, `revisarSolicitudProveedor` | `src/modules/admin/admin.controller.ts` |
| `RF-ADM-05` | Administración | Could | `implementado` | `contracts/admin-openapi-v2.yaml` | `getAdminConfig`, `updateAdminConfig` | `src/modules/admin/admin.controller.ts` |
| `RF-OBS-01` | Observabilidad | Must | `implementado` | `contracts/observabilidad-openapi-v2.yaml` | `listarNodosPublic`, `pingNodoPublic` | `src/modules/admin/connector-health.service.ts` |
| `RF-OBS-02` | Observabilidad | Must | `implementado` | `contracts/admin-openapi-v2.yaml` | `toggleNode`, `toggleKillSwitchAdmin` | `src/modules/admin/admin.controller.ts` |
| `RF-OBS-03` | Observabilidad | Must | `implementado` | Conectores ACL / Rúbrica RDA2 | Circuit Breaker Timeout 5s (CE01) | `src/modules/atracciones/acl/` / `autos/acl/` |
| `RF-OBS-04` | Observabilidad | Should | `planificado` | `contracts/observabilidad-openapi-v2.yaml` | `getTrazaGrafo` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-OBS-05` | Observabilidad | Could | `implementado` | `contracts/observabilidad-openapi-v2.yaml` | `trackEvent` | `src/modules/telemetry/telemetry.controller.ts` |
| `RF-OBS-06` | Auditoría Negocio | Must | `planificado` | `contracts/auditoria-openapi-v2.yaml` | `listarAuditoriaTransacciones`, `admin` | `docs/RDA2/PLANNED_ENDPOINTS.md` / `MS_AUD` |
| `RF-OBS-07` | Auditoría Física | Must | `implementado` | `contracts/admin-openapi-v2.yaml` | `getAdminAuditoria` / Winston disco | `ADR-003` / Mandato Cátedra §2 |
| `RF-BOT-01` | Chatbot IA | Won't/Could| `implementado*`| Código Fuente NestJS (Omitido v2) | `POST /chatbot/mensaje` | `src/modules/chatbot/chatbot.controller.ts` |
| `RF-BOT-02` | Chatbot IA | Won't/Could| `implementado*`| Código Fuente NestJS (Omitido v2) | `POST /chatbot/nueva-conversacion` | `src/modules/chatbot/chatbot.controller.ts` |
| `RF-BOT-03` | Chatbot IA | Won't/Could| `implementado*`| Código Fuente NestJS (Omitido v2) | `GET /chatbot/estado`, `/alcance` | `src/modules/chatbot/chatbot.controller.ts` |
| `RF-BOT-04` | Chatbot IA | Won't/Could| `implementado*`| Código Fuente NestJS (Omitido v2) | Herramientas Solo Lectura | `src/modules/chatbot/chatbot.tools.ts` |
| `RF-WH-01`  | Webhooks Inbound | Must | `planificado` | `contracts/webhooks-inbound-openapi-v2.yaml` | `recibirWebhookVertical` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-WH-02`  | Webhooks Inbound | Must | `planificado` | `contracts/webhooks-inbound-openapi-v2.yaml` | Validación Firma HMAC-SHA256 | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-WH-03`  | Webhooks Inbound | Could | `planificado` | `contracts/webhooks-inbound-openapi-v2.yaml` | `listarEntregasWebhooksAdmin` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-STK-01` | Inventario gRPC | Must | `implementado` | `src/proto/inventory.proto` | `PushStockUpdate` (puerto 50051) | `src/modules/inventory/inventory.service.ts` |
| `RF-STK-02` | Inventario gRPC | Must | `implementado` | `src/proto/inventory.proto` | `StreamInventoryChanges` | `src/modules/inventory/inventory.service.ts` |
| `RF-STK-03` | Inventario gRPC | Should | `planificado` | `contracts/grpc/inventory-v2.proposed.proto` | `BatchStockUpdate`, `CheckAvailability` | `contracts/grpc/README.md` |
| `RF-STK-04` | Inventario gRPC | Should | `implementado` | `contracts/observabilidad-openapi-v2.yaml` | `getInventoryStatus`, `getInventory` | `src/modules/inventory/inventory-grpc.controller.ts` |
| `RF-CLI-01` | Clientes & Identidad | Must | `delegado` | `contracts/clientes-openapi-v2.yaml` | `supabaseSignUp`, `supabaseSignIn` | `src/core/auth/` / Supabase Auth |
| `RF-CLI-02` | Clientes & Identidad | Must | `planificado` | `contracts/clientes-openapi-v2.yaml` | `getClienteCanonico` | `docs/RDA2/PLANNED_ENDPOINTS.md` / `MS_CLI` |
| `RF-CLI-03` | Clientes & Identidad | Should | `planificado` | `contracts/clientes-openapi-v2.yaml` | `updateClienteCanonico` | `docs/RDA2/PLANNED_ENDPOINTS.md` |
| `RF-CLI-04` | Clientes & Identidad | Must | `planificado` | `contracts/clientes-openapi-v2.yaml` | `updateClienteRol` | `docs/RDA2/PLANNED_ENDPOINTS.md` / `H-P06-03` |
| `RF-CLI-05` | Seguridad RBAC | Must | `implementado` | `contracts/common/components-v2.yaml` | Roles `CLIENTE`, `ADMIN`, `MANTENIMIENTO` | `src/core/guards/roles.guard.ts` |
| `RF-EVT-01` | Dual Event Bus | Must | `implementado` | `contracts/asyncapi-eventos-v2.yaml` | `publishOrderConfirmed`, `publishSagaCompensate` | `src/modules/event-bus/dual-event-bus.service.ts` |
| `RF-EVT-02` | Dual Event Bus | Must | `implementado` | `contracts/asyncapi-eventos-v2.yaml` | `publishStockUpdated` | `src/modules/event-bus/dual-event-bus.service.ts` |
| `RF-EVT-03` | Dual Event Bus | Should | `implementado` | `contracts/asyncapi-eventos-v2.yaml` | `publishKafkaCatalogoSync`, `publishKafkaAuditoriaSagas` | `src/modules/event-bus/rabbit-kafka-bridge.service.ts` |
| `RF-ATR-01` | Tienda Atracciones | Must | `implementado` | `contracts/atracciones-openapi-v2.yaml` | `POST /atracciones/reservas` (Cupo infantes) | `Pendientes/modulo_atracciones.md` |
| `RF-ATR-02` | Tienda Atracciones | Must | `implementado` | `contracts/atracciones-openapi-v2.yaml` | `POST /atracciones/reservas/{id}/checkin` | `frontend/src/components/VoucherModal.jsx` |
| `RF-AUT-01` | Tienda Autos | Must | `implementado` | `contracts/autos-openapi-v2.yaml` | `POST /autos/orders/{id}/checkin-devolucion` (2h) | `ADR-004` / Mandato Rúbrica RDA2 |
| `RF-AUT-02` | Tienda Autos | Should | `implementado` | `contracts/autos-openapi-v2.yaml` | `POST /autos/{id}/mantenimiento/registro` | `src/modules/autos/` |
| `RF-VUE-01` | Tienda Vuelos | Must | `implementado` | `contracts/vuelos-openapi-v2.yaml` | `createHold`, `releaseHold` | `Pendientes/modulo_vuelos.md` |
| `RF-VUE-02` | Tienda Vuelos | Must | `implementado` | `contracts/vuelos-openapi-v2.yaml` | `checkIn`, `listBoardingPasses` | `Pendientes/modulo_vuelos.md` |

---
*Fin del Documento de Requisitos Funcionales RDA2.*
