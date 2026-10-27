# Backlog Priorizado de Implementación — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Marketplace Agregador Central, API Gateway ESB y BFF)  
> **Documento:** Backlog Consolidado y Priorizado para la Fase de Implementación (I01–I12)  
> **Versión Estándar:** 2.0.0 (SemVer)  
> **Fecha de Emisión:** Octubre 2026  
> **Estado:** Aprobado / Consolidado con Hallazgos (P00–P17), Endpoints Planificados y Brechas de Matriz  

---

## 1. Resumen Ejecutivo y Estructura del Backlog

Este documento transforma formalmente el diagnóstico técnico de la plataforma en un **Backlog Ejecutable y Priorizado**. Consolida el 100% de los **hallazgos de severidad Alta y Media** ([`docs/RDA2/HALLAZGOS_CONTRATOS.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/HALLAZGOS_CONTRATOS.md)), la totalidad de los **28 endpoints planificados** ([`docs/RDA2/PLANNED_ENDPOINTS.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/PLANNED_ENDPOINTS.md)), las **8 brechas de arquitectura** ([`docs/RDA2/MATRIZ_TRAZABILIDAD.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/MATRIZ_TRAZABILIDAD.md)), las restricciones operativas de despliegue ([`docs/RDA2/PLAN_DE_DESPLIEGUE.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/PLAN_DE_DESPLIEGUE.md)) y los requisitos no funcionales ([`docs/RDA2/REQUISITOS_NO_FUNCIONALES.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/REQUISITOS_NO_FUNCIONALES.md)).

El backlog se compone de **56 ítems de trabajo (`BL-001` a `BL-056`)** organizados rigurosamente bajo el orden normativo de la cátedra:
1. **Seguridad Alta:** Mitigación de accesos perimetrales no autenticados, bypass de roles y blindaje de endpoints con efectos colaterales financieros.
2. **Cumplimiento de Cátedra y Blueprint:** Event Bus dual (RabbitMQ/Kafka), propagación de W3C Trace Context, observabilidad de grafos, deduplicación e idempotencia.
3. **Funcionalidades Planificadas para la Defensa:** Microservicios faltantes (`MS_CAR`, `MS_FAC`, `MS_AUD`, `MS_CLI`), recepción de webhooks HMAC y verificación síncrona B2B.
4. **Pruebas Faltantes y Suites de Integración:** Cobertura automatizada de casos de prueba críticos (CP-010, CP-022, CP-023, CP-024, CP-025).
5. **Resto y Mejoras Menores:** Hardening de interfaces, corrección de HATEOAS, RFC 7807 y estandarizaciones de formato.

---

## 2. Tabla Maestra del Backlog Priorizado (`BL-001` a `BL-056`)

| ID | Título del Ítem | Tipo | Origen | Criterios / RF / RNF | Severidad / Prioridad | Esfuerzo | Dependencias | Criterio de Hecho (DoD) | Archivos Probables (`src/...`) | Responsable Sugerido |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|---|---|:---:|
| **BL-001** | Blindaje y protección con Guards en `NodesController` (`/nodes/*`) | Seguridad | `H-P08-01`<br>`H-P08-02`<br>`BR-01` | **CE09**<br>RNF-SEC-01 | 🔴 **Alta** | **S** (1-2h) | Ninguna | Endpoints `POST/PUT/DELETE /nodes` y `POST /nodes/:id/toggle` exigen token JWT de Supabase con rol `ADMIN`; responden 401/403 a anónimos. | `src/modules/nodes/nodes.controller.ts` | Booking Gateway |
| **BL-002** | Eliminación de bypass inseguro de cabecera `X-Role: admin` en `SupabaseAuthGuard` | Seguridad | `H-P06-03`<br>`BR-02` | **CE09**<br>RNF-SEC-02 | 🔴 **Alta** | **S** (1-2h) | Ninguna | En producción (`NODE_ENV === 'production'`), la cabecera `X-Role` es ignorada; los roles se extraen exclusivamente de los claims del JWT firmado. | `src/core/guards/supabase-auth.guard.ts` | Booking Gateway |
| **BL-003** | Blindaje de orquestación Saga y mutaciones en `EsbController` | Seguridad | `H-P01-01`<br>`BR-01` | **CE09**<br>RNF-SEC-01 | 🔴 **Alta** | **S** (1-2h) | BL-002 | `EsbController` decorado con `@UseGuards(SupabaseAuthGuard)`; compras exigen rol `CLIENTE` o `ADMIN`; consultas de sagas aisladas por usuario. | `src/modules/esb/esb.controller.ts` | Booking Gateway |
| **BL-004** | Protección perimetral y RBAC en Pasarela de Pagos SOA (`PagosController`) | Seguridad | `H-P02-01`<br>`BR-01` | **CE09**<br>RNF-SEC-01 | 🔴 **Alta** | **S** (1-2h) | BL-002 | Cobros y reembolsos exigen usuario autenticado; inyección de fallos (`/simulador/config`) restringida a rol `ADMIN` con `X-Admin-Key`. | `src/modules/pagos/pagos.controller.ts` | Booking Gateway |
| **BL-005** | Autenticación y restricción de acuerdos B2B en `PaquetesController` | Seguridad | `H-P03-01`<br>`BR-01` | **CE09**<br>RNF-SEC-01 | 🔴 **Alta** | **S** (1-2h) | BL-002 | `POST /paquetes/dinamico` exige autenticación; lectura detallada de contratos comerciales (`GET /paquetes/contratos`) exige rol `ADMIN`. | `src/modules/paquetes/paquetes.controller.ts` | Booking Gateway |
| **BL-006** | Interceptor gRPC de autenticación y validación de `x-api-key` (:50051) | Seguridad | `H-P12-02` | **CE03**<br>**CE09** | 🔴 **Alta** | **M** (3-5h) | Ninguna | Socket `:50051` intercepta metadata `x-api-key`; si la llave no coincide con un socio activo en `schema_proveedores.config_proveedor`, aborta con `UNAUTHENTICATED`. | `src/modules/inventory/inventory-grpc.controller.ts`<br>`src/modules/inventory/guards/grpc-auth.guard.ts` | Booking Gateway |
| **BL-007** | Implementación de `GqlAuthGuard` en GraphQL BFF Resolver | Seguridad | `H-P13-01` | **CE04**<br>**CE09** | 🔴 **Alta** | **M** (3-5h) | BL-002 | Mutaciones `checkoutOrquestado` y consultas privadas exigen JWT Bearer en cabecera HTTP; inyectan `req.user` en el contexto GraphQL. | `src/modules/graphql/graphql-bff.resolver.ts`<br>`src/modules/graphql/guards/gql-auth.guard.ts` | Booking Gateway |
| **BL-008** | Desactivación de Apollo Playground e introspección en producción | Seguridad | `H-P13-02` | **CE04**<br>**CE09** | 🟡 **Media** | **S** (1-2h) | Ninguna | `playground` e `introspection` fijados condicionalmente a `process.env.NODE_ENV !== 'production'`. | `src/modules/graphql/graphql-bff.module.ts` | Booking Gateway |
| **BL-009** | Asignación y revocación segura de roles administrativos (`PATCH /clientes/{id}/rol`) | Seguridad | `H-P06-03`<br>`PLANNED` | **CE09**<br>RF-CLI-03 | 🔴 **Alta** | **S** (1-2h) | BL-002 | Endpoint expuesto en `MS_CLI`; exige rol `ADMIN`; actualiza `schema_clientes.clientes.rol` y sincroniza metadatos de Supabase Auth. | `src/modules/clientes/clientes.controller.ts` | Booking Gateway |
| **BL-010** | Centralización de superadministradores y retiro de `ADMIN_EMAILS` estático | Seguridad | `H-P06-02` | **CE09** | 🟡 **Media** | **S** (1-2h) | BL-009 | Permisos de superadministrador se determinan por rol en base de datos; la lista estática en `administradores.ts` se retira o se usa solo como fallback de arranque. | `src/core/auth/administradores.ts` | Booking Gateway |
| **BL-011** | Validación criptográfica HMAC-SHA256 y secreto por proveedor en webhooks | Seguridad | `H-P09-01`<br>`H-P09-02`<br>`BR-05` | **CE09**<br>RNF-SEC-03 | 🔴 **Alta** | **M** (3-5h) | Ninguna | I07: HMAC sobre cuerpo crudo validado con `timingSafeEqual`; secretos referenciados por `WEBHOOK_SECRET_{VERTICAL}` y comparación inválida responde 401. | `src/modules/webhooks/webhooks.service.ts`<br>`.env.example` | Booking Gateway |
| **BL-012** | Tipado y validación de DTOs con `class-validator` en Pagos, Paquetes y Telemetría | Seguridad | `H-P02-02`<br>`H-P03-02`<br>`H-P08-05`<br>`BR-08` | **CE08**<br>RNF-REL-01 | 🟡 **Media** | **S** (1-2h) | Ninguna | DTOs creados con decoradores `@IsUUID`, `@IsPositive`, `@IsArray`; cargas inválidas o campos no permitidos son rechazados con HTTP 400 RFC 7807. | `src/modules/pagos/dto/`<br>`src/modules/paquetes/dto/`<br>`src/modules/telemetry/dto/` | Booking Gateway |
| **BL-013** | Publicación de eventos de ciclo de vida Saga en RabbitMQ (`booking.events`) | Cumplimiento Cátedra | `H-P01-04`<br>`H-P11-01`<br>`BR-06` | **CE03**<br>**CE06** | 🟡 **Media** | **M** (3-5h) | Ninguna | ✅ Implementado en I05: `SagaOrchestratorService` emite CloudEvents a `booking.events` (`saga.started`, `saga.step.completed`, `saga.compensating`, `saga.compensated`, `order.confirmed`). | `src/modules/esb/interna/saga-orchestrator.service.ts` | Booking Gateway |
| **BL-014** | Emisión de eventos financieros en RabbitMQ desde Pasarela SOA | Cumplimiento Cátedra | `H-P02-04`<br>`BR-06` | **CE03**<br>**CE06** | 🟡 **Media** | **M** (3-5h) | Ninguna | `PagosService` emite `payment.completed` y `payment.refunded` a RabbitMQ ante cada cobro terminado o reembolso. | `src/modules/pagos/pagos.service.ts` | Booking Gateway |
| **BL-015** | Ingesta de telemetría masiva desacoplada hacia Apache Kafka Streaming | Cumplimiento Cátedra | `H-P08-03`<br>ADR-003 | **CE03**<br>ADR-003 | 🟡 **Media** | **M** (3-5h) | Ninguna | `TelemetryService.trackEvent` publica a tópico Kafka `booking.telemetry.events` sin ejecutar sentencias SQL `INSERT` síncronas en PostgreSQL. | `src/modules/telemetry/telemetry.service.ts` | Booking Gateway |
| **BL-016** | Normalización de colas y tópicos con nomenclatura del Blueprint §7.2 / §7.3 | Cumplimiento Cátedra | `H-P11-02` | **CE03** | 🟡 **Media** | **S** (1-2h) | BL-013 | Configuración de bindings alternativos en RabbitMQ (`eventos.busquedas`, `ordenes.confirmadas`) y tópicos Kafka compatibles con la cátedra. | `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts` | Booking Gateway |
| **BL-017** | Inyección y propagación de W3C Trace Context en encabezados AMQP | Cumplimiento Cátedra | `H-P11-04` | **CE03**<br>**CE05** | 🟢 **Baja** | **S** (1-2h) | BL-013 | ✅ Implementado en I02: `RabbitMqEventBusService.publish` inyecta `traceparent`, `x-correlation-id` y `node_id` en `properties.headers`. | `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts` | Booking Gateway |
| **BL-018** | Unificación de Kill-Switches en endpoint canónico (`POST /admin/nodes/:id/toggle-killswitch`) | Cumplimiento Cátedra | `H-P07-01`<br>`H-P08-04` | **CE05** | 🟡 **Media** | **S** (1-2h) | BL-001 | Sincronización atómica entre el registro en base de datos (`nodos_conectores`) y el estado en memoria de `ConnectorHealthService`. | `src/modules/admin/admin.controller.ts`<br>`src/modules/nodes/nodes.controller.ts` | Booking Gateway |
| **BL-019** | Consolidación del motor financiero de liquidaciones exclusivamente en `MS_FIN` | Cumplimiento Cátedra | `H-P04-01`<br>`H-P07-02` | **CE02**<br>**CE04** | 🟡 **Media** | **M** (3-5h) | Ninguna | Eliminar duplicidad de `AdminFinanzasService`; `AdminDashboard` consume liquidaciones quincenales (`Q1`/`Q2`) de `schema_finanzas`. | `src/modules/finanzas/finanzas.service.ts`<br>`src/modules/admin/admin-finanzas.service.ts` | Booking Gateway |
| **BL-020** | Deducción automática de reembolsos en liquidaciones de proveedores | Cumplimiento Cátedra | `H-P04-02` | **CE06**<br>**CE11** | 🟡 **Media** | **M** (3-5h) | BL-019 | Reversión de Saga o reembolso en pasarela genera registro de débito en `schema_finanzas.liquidaciones_proveedores` evitando sobrepagos. | `src/modules/finanzas/finanzas.service.ts` | Booking Gateway |
| **BL-021** | Eliminación de Protobufs incompatibles y unificación en `inventory.proto` | Cumplimiento Cátedra | `H-P12-01` | **CE03**<br>**CE07** | 🟡 **Media** | **S** (1-2h) | Ninguna | Purgar archivos corruptos de `Faltantes RDA2`; compilar limpiamente `inventory.proto` versionado para clientes y servidores. | `contracts/grpc/`<br>`src/proto/inventory.proto` | Booking Gateway |
| **BL-022** | Migración de endpoints REST de inventario hacia `/api/v2/inventory` | Cumplimiento Cátedra | `H-P12-03` | **CE03**<br>**CE05** | 🟡 **Media** | **S** (1-2h) | Ninguna | Reubicar `GET /inventory` a `/api/v2/inventory/stock` con prefijo oficial de versión y roles de observabilidad restringidos. | `src/modules/inventory/inventory.controller.ts` | Booking Gateway |
| **BL-023** | Transformador de trazas Saga en Grafo de Nodos, Aristas y Spans W3C | Cumplimiento Cátedra | `H-P01-03`<br>`PLANNED`<br>`BR-07` | **CE05**<br>RNF-OBS-02 | 🟡 **Media** | **L** (6-8h) | BL-013 | `GET /esb/sagas/{correlationId}/traza` devuelve estructura JSON de nodos (🟢/🟡/🔴) y árbol de spans consumible por `Panel8_AuditoriaSagas.jsx`. | `src/modules/esb/esb.controller.ts`<br>`src/modules/esb/interna/saga-orchestrator.service.ts` | Booking Gateway |
| **BL-024** | Consumidor Kafka `cg-audit-analytics` para persistencia en `schema_auditoria` | Cumplimiento Cátedra | `H-P17-03` | **CE03**<br>ADR-003 | 🟡 **Media** | **M** (3-5h) | BL-013 | Worker de Kafka consume `booking.compras.audit` y persiste compras confirmadas en `schema_auditoria.auditoria_transaccional` sin bloquear el checkout. | `src/modules/event-bus/kafka/consumers/audit.consumer.ts` | Booking Gateway |
| **BL-025** | Implementación del módulo de Carrito de Compras Persistente (`CarritosModule`) | Funcionalidad | `H-P16-01`<br>`PLANNED`<br>`BR-03` | **CE06**<br>RF-CAR-01 | 🔴 **Alta** | **M** (3-5h) | Ninguna | Módulo `CarritosModule` en NestJS; endpoint `POST /carritos` crea registros en `schema_carritos.carritos` con UUID y estado `ACTIVE`. | `src/modules/carritos/carritos.module.ts`<br>`carritos.controller.ts` | Booking Gateway |
| **BL-026** | Consulta de Carrito Activo y Sincronización Multidispositivo (`GET /carritos/activo`) | Funcionalidad | `H-P16-04`<br>`PLANNED` | **CE06**<br>RF-CAR-02 | 🔴 **Alta** | **S** (1-2h) | BL-025 | Devuelve el carrito activo asociado al `cliente_id` del token JWT; permite retomar carritos entre sesiones web y móviles. | `src/modules/carritos/carritos.controller.ts` | Booking Gateway |
| **BL-027** | Consulta de Carrito Específico por UUID (`GET /carritos/{id}`) | Funcionalidad | `PLANNED` | **CE06**<br>RF-CAR-03 | 🟡 **Media** | **S** (1-2h) | BL-025 | Retorna detalle de cabecera y lista de ítems calculando subtotales y fecha de expiración. | `src/modules/carritos/carritos.controller.ts` | Booking Gateway |
| **BL-028** | Mutaciones de ítems en carrito con snapshotting inmutable de precios unitarios | Funcionalidad | `H-P16-02`<br>`PLANNED` | **CE06**<br>RF-CAR-04/07 | 🔴 **Alta** | **M** (3-5h) | BL-025 | Endpoints `POST/PATCH/DELETE /carritos/{id}/items`; consulta disponibilidad a la vertical y congela precio unitario en BD previniendo manipulaciones del cliente. | `src/modules/carritos/carritos.service.ts` | Booking Gateway |
| **BL-029** | Transición de Carrito Persistente a Checkout Orquestado (`POST /carritos/{id}/checkout`) | Funcionalidad | `PLANNED` | **CE06**<br>RF-SAGA-01 | 🔴 **Alta** | **L** (6-8h) | BL-028<br>BL-003 | Lee ítems autoritativos del carrito congelado y dispara la Saga multivertical; transiciona estado a `CHECKED_OUT`. | `src/modules/carritos/carritos.service.ts`<br>`src/modules/esb/interna/saga-orchestrator.service.ts` | Booking Gateway |
| **BL-030** | Detección periódica de Carritos Abandonados (> 2 horas) y emisión CloudEvent | Funcionalidad | `H-P16-03`<br>`PLANNED` | **CE03**<br>RF-CAR-08 | 🟡 **Media** | **M** (3-5h) | BL-025 | Tarea programada (Cron) detecta carritos inactivos $> 2\text{ horas}$, transiciona a `ABANDONED` y emite `carritos.abandonados` a RabbitMQ y Kafka. | `src/modules/carritos/tasks/carritos-abandonados.task.ts` | Booking Gateway |
| **BL-031** | Emisión y persistencia fiscal formal en `schema_facturacion` (`POST /facturas`) | Funcionalidad | `H-P05-01`<br>`H-P05-03`<br>`PLANNED`<br>`BR-04` | **CE06**<br>RF-FAC-01 | 🔴 **Alta** | **L** (6-8h) | Ninguna | Módulo `FacturasModule` emite comprobantes en `schema_facturacion.facturas_encabezado` con cálculo de 15% IVA y desglose de líneas. | `src/modules/facturas/facturas.controller.ts`<br>`facturas.service.ts` | Booking Gateway |
| **BL-032** | Consultas fiscales de comprobantes del cliente (`GET /facturas`, `GET /facturas/{id}`) | Funcionalidad | `H-P05-01`<br>`PLANNED` | **CE06**<br>RF-FAC-02/03 | 🟡 **Media** | **M** (3-5h) | BL-031 | Listado paginado de facturas emitidas por usuario y consulta de ficha fiscal por UUID. | `src/modules/facturas/facturas.controller.ts` | Booking Gateway |
| **BL-033** | Renderizado server-side de facturas en PDF con clave SRI (`GET /facturas/{id}/pdf`) | Funcionalidad | `H-P05-02`<br>`PLANNED` | **CE06**<br>RF-FAC-04 | 🟡 **Media** | **L** (6-8h) | BL-031 | Genera buffer binario PDF con clave de acceso de 49 dígitos, secuencial SRI y desglose fiscal; descarga directa en navegador. | `src/modules/facturas/services/factura-pdf.service.ts` | Booking Gateway |
| **BL-034** | Anulación fiscal de comprobantes y emisión de notas de crédito | Funcionalidad | `H-P05-01`<br>`PLANNED` | **CE06**<br>RF-FAC-05 | 🟡 **Media** | **M** (3-5h) | BL-031 | `PATCH /facturas/{id}/anular` actualiza estado a `ANULADA` ante compensación de Saga o cancelación voluntaria. | `src/modules/facturas/facturas.controller.ts` | Booking Gateway |
| **BL-035** | Módulo Canónico de Clientes y Ficha Fiscal (`GET/PATCH /clientes/{id}`) | Funcionalidad | `H-P06-01`<br>`PLANNED` | **CE02**<br>RF-CLI-01/02 | 🔴 **Alta** | **M** (3-5h) | Ninguna | Módulo `ClientesModule` sobre `schema_clientes.clientes`; expone ficha canónica para ensamblado de facturas sin SQL JOINs. | `src/modules/clientes/clientes.module.ts`<br>`clientes.controller.ts` | Booking Gateway |
| **BL-036** | Validación síncrona de pagos por referencia única B2B (`GET /pagos/{ref}`) | Funcionalidad | `H-P02-05`<br>`PLANNED` | **CE06**<br>RF-PAG-03 | 🔴 **Alta** | **S** (1-2h) | Ninguna | Endpoint con acceso ADMIN/SERVICE o API key de tienda limitada a su `carrito_id`, estado y monto de pago, reservas asociadas, y respuesta sin datos de tarjeta. | `src/modules/pagos/pagos.controller.ts` | Booking Gateway |
| **BL-037** | Endpoint B2B para actualización de contratos de promoción (`PUT /paquetes/contratos/{id}`) | Funcionalidad | `H-P03-03`<br>`PLANNED` | **CE04**<br>RF-PKG-02 | 🟡 **Media** | **S** (1-2h) | BL-005 | Permite a las tiendas socias actualizar descuentos y acuerdos comerciales B2B mediante invocación HTTP segura. | `src/modules/paquetes/paquetes.controller.ts` | Booking Gateway |
| **BL-038** | Receptor de Webhooks Inbound con desduplicación (`POST /webhooks/{vertical}`) | Funcionalidad | `H-P09-01`<br>`PLANNED`<br>`BR-05` | **CE03**<br>RF-WH-01 | 🔴 **Alta** | **M** (3-5h) | BL-011 | I07: Recibe CloudEvents, valida HMAC, deduplica por `event.id`, persiste y publica asíncronamente a `booking.webhooks.inbound.{vertical}`; tamaño máximo 1 MB y límite de solicitudes por IP. | `src/modules/webhooks/webhooks.module.ts`<br>`webhooks.controller.ts` | Booking Gateway |
| **BL-039** | Consola de inspección de entregas de webhooks (`GET /webhooks/{vertical}/entregas`) | Funcionalidad | `PLANNED` | **CE05**<br>RF-WH-02 | 🟢 **Baja** | **S** (1-2h) | BL-038 | I07: Historial ADMIN paginado por cursor y límite, con filtros por estado y correlación; firmas inválidas quedan en auditoría de seguridad y no se persisten como eventos aceptados. | `src/modules/webhooks/webhooks.controller.ts` | Booking Gateway |
| **BL-040** | Módulo de Auditoría Transaccional y Forense (`AuditoriaModule`) en NestJS | Funcionalidad | `H-P17-01`<br>`H-P17-02`<br>`H-P17-04`<br>`PLANNED` | **CE02**<br>**CE05**<br>ADR-003 | 🔴 **Alta** | **M** (3-5h) | Ninguna | Módulo `AuditoriaModule`; endpoints `/auditoria/transacciones` y `/auditoria/admin` consultan `schema_auditoria` con paginación por cursor. | `src/modules/auditoria/auditoria.module.ts`<br>`auditoria.controller.ts` | Booking Gateway |
| **BL-041** | Suite de pruebas de integración para Carrito de Compras Persistente (`CP-024`) | Prueba | `MATRIZ`<br>`CP-024` | **CE06**<br>**CE08** | 🔴 **Alta** | **M** (3-5h) | BL-025<br>BL-028 | Suite Jest automatizada que valida creación, adición de ítems con precio congelado, vaciado y checkout. | `test/integration/carritos.integration.spec.ts` | Booking Gateway |
| **BL-042** | Suite de pruebas automatizadas de emisión fiscal y cálculo de IVA (`CP-023`) | Prueba | `MATRIZ`<br>`CP-023` | **CE06**<br>**CE08** | 🔴 **Alta** | **M** (3-5h) | BL-031<br>BL-033 | Valida cálculo exacto de 15% IVA, generación de clave SRI de 49 dígitos y generación binaria de PDF. | `test/integration/facturacion-fiscal.spec.ts` | Booking Gateway |
| **BL-043** | Pruebas de verificación de firma criptográfica HMAC en Webhooks (`CP-010`) | Prueba | `MATRIZ`<br>`CP-010` | **CE08**<br>**CE09** | 🔴 **Alta** | **M** (3-5h) | BL-038 | I07: Pruebas HTTP validan 202 con raw body válido, 401 ante firma alterada, duplicado 200, CloudEvent incorrecto 400, vertical desconocida 404 y cuerpo mayor de 1 MB 413. | `src/modules/webhooks/webhooks.controller.spec.ts` | Booking Gateway |
| **BL-044** | Pruebas de validación síncrona de pagos para tiendas externas (`CP-025`) | Prueba | `PLANNED` | **CE06**<br>**CE08** | 🟡 **Media** | **S** (1-2h) | BL-036 | Valida acceso autorizado, aislamiento por tienda, 404 en referencias inexistentes y ausencia de datos de tarjeta. | `src/modules/pagos/pagos.service.spec.ts`<br>`src/modules/pagos/guards/payment-reference-access.guard.spec.ts` | Booking Gateway |
| **BL-045** | Pruebas de trazabilidad cross-broker (RabbitMQ $\rightarrow$ Bridge $\rightarrow$ Kafka) | Prueba | `MATRIZ`<br>`CP-013` | **CE03**<br>**CE08** | 🟡 **Media** | **M** (3-5h) | BL-013 | Valida publicación en `booking.events`, captura por el bridge y replicación intacta de correlationId en Kafka. | `test/integration/dual-event-bus.spec.ts` | Booking Gateway |
| **BL-046** | Pruebas de liquidaciones quincenales y deducción de compensaciones (`CP-022`) | Prueba | `MATRIZ`<br>`CP-022` | **CE06**<br>**CE08** | 🟡 **Media** | **S** (1-2h) | BL-020 | Valida cuadre contable quincenal (`Q1`/`Q2`) restando comisiones y notas de crédito de reembolsos. | `test/integration/finanzas-liquidaciones.spec.ts` | Booking Gateway |
| **BL-047** | Validación obligatoria de cabecera `Idempotency-Key` en `POST /esb/checkout-saga` | Cumplimiento Cátedra | `H-P01-02` | **CE06** | 🟡 **Media** | **S** (1-2h) | BL-003 | Si falta la cabecera UUID, responde 400 `MISSING_IDEMPOTENCY_KEY`; elimina la autogeneración silenciosa en backend. | `src/modules/esb/esb.controller.ts` | Booking Gateway |
| **BL-048** | Inyección de cabecera `Idempotent-Replayed: true` ante peticiones repetidas | Cumplimiento Cátedra | `H-P09-04` | **CE06** | 🟢 **Baja** | **S** (1-2h) | Ninguna | I07: La ruta inbound responde 200 con `Idempotent-Replayed: true` cuando vuelve a recibir un `event.id` persistido. | `src/modules/webhooks/webhooks.controller.ts` | Booking Gateway |
| **BL-049** | Conexión de Frontend con `POST /pagos/procesar` para `paymentReference` real | Funcionalidad | `H-P02-03` | **CE06** | 🟡 **Media** | **M** (3-5h) | BL-004 | Frontend sustituye strings sintéticos `pay_*` por llamadas al API de pagos antes de invocar APIs satélites. | `frontend/src/components/FormularioReserva.jsx` | Booking Frontend |
| **BL-050** | Corrección de `baseUrl` v2 en enlaces HATEOAS (`HateoasInterceptor`) | Documentación | `H-P00-01` | **CE07** | 🟢 **Baja** | **S** (1-2h) | Ninguna | Interceptor detecta dinámicamente la versión del prefijo de ruta para construir URLs canónicas en `_links`. | `src/core/interceptors/hateoas.interceptor.ts` | Booking Gateway |
| **BL-051** | Inclusión de `correlation_id` y `timestamp` en respuestas RFC 7807 | Cumplimiento Cátedra | `H-P00-02` | **CE07** | 🟢 **Baja** | **S** (1-2h) | Ninguna | ✅ Implementado en I02: filtro global inyecta `correlation_id` y `timestamp` en el cuerpo JSON de errores estándar de la plataforma. | `src/core/filters/rfc7807-exception.filter.ts` | Booking Gateway |
| **BL-052** | Paginación estandarizada por cursor/límite en `GET /esb/sagas` | Funcionalidad | `H-P01-05` | **CE07** | 🟢 **Baja** | **S** (1-2h) | Ninguna | Valida límite superior (máx. 100) e incluye metadatos de respuesta (`has_more`, `next_cursor`). | `src/modules/esb/esb.controller.ts` | Booking Gateway |
| **BL-053** | Validación de idempotencia en pago de liquidaciones (`POST /finanzas/.../pagar`) | Funcionalidad | `H-P04-03` | **CE06** | 🟢 **Baja** | **S** (1-2h) | BL-019 | Si la liquidación ya tiene estado `PAGADO`, devuelve comprobante existente sin alterar la marca de tiempo histórica. | `src/modules/finanzas/finanzas.service.ts` | Booking Gateway |
| **BL-054** | Despacho real de correos electrónicos en reenvío administrativo de comprobantes | Funcionalidad | `H-P07-04` | **CE05** | 🟢 **Baja** | **S** (1-2h) | BL-031 | Conectar `AdminService.reenviarComprobante` con `FacturasService` para despachar el correo transaccional real. | `src/modules/admin/admin.service.ts` | Booking Gateway |
| **BL-055** | Tipado estricto de esquemas Input en GraphQL BFF reemplazando JSON Strings | Funcionalidad | `H-P13-03` | **CE04** | 🟡 **Media** | **M** (3-5h) | BL-007 | Modelar `InputType` específicos por vertical para checkout en GraphQL eliminando `JSON.parse` manuales. | `src/modules/graphql/models/` | Booking Gateway |
| **BL-056** | Logging HTTP JSON Lines por servicio con redacción, retención y consulta por correlación | Observabilidad | `ADR-003`<br>`I03` | **CE05**<br>RNF-OBS | 🟡 **Media** | **S** (1-2h) | Ninguna | Cada petición queda en archivo diario JSONL, sin secretos ni escritura técnica en BD; trace.js imprime la correlación. | `src/core/logger/`<br>`scripts/logs/trace.js` | Booking Gateway |

### Estado I03

| ID | Estado |
|---|---|
| BL-056 | Resuelto en I03 |

---

### Estado de implementación I01

| ID | Estado | Nota |
|---|---|---|
| BL-001 | Resuelto | Rutas de mutación y acciones de nodos protegidas; toggle de Panel 1 usa la ruta canónica. |
| BL-002 | Resuelto | Bypass `X-Role`/`X-Admin-Key` deshabilitado en producción y restringido localmente. |
| BL-012 | Parcial | Telemetría y Pagos implementados (I01/I06); DTOs de Paquetes pendientes. |
| BL-018 | Pendiente | La ruta canónica ya se usa en Panel 1, pero no se unificaron los stores de todos los kill-switches. |

### Estado de implementación I06

| ID | Estado | Nota |
|---|---|---|
| BL-014 | Resuelto en I06 | `payment.completed` y `payment.refunded` se publican en RabbitMQ y quedan enlazados a sus colas. |
| BL-036 | Resuelto en I06 | Referencias B2B, autorización por rol/API key, aislamiento por carrito y asociación explícita de reservas. |
| BL-044 | Resuelto en I06 | Pruebas unitarias de consulta permitida/denegada, referencia inexistente y redacción de datos de tarjeta. |

### Estado de implementación I07

| ID | Estado | Nota |
|---|---|---|
| BL-011 | Resuelto en I07 | HMAC-SHA256 sobre raw body con comparación en tiempo constante; secretos por vertical en variables de entorno, sin almacenarlos ni exponerlos en API/logs. |
| BL-038 | Resuelto en I07 | Ingesta pública autenticada por HMAC, CloudEvents, deduplicación durable, respuesta 202 y publicación asíncrona en RabbitMQ. |
| BL-039 | Resuelto en I07 | Consulta de entregas restringida a ADMIN con limit/cursor y filtros. |
| BL-043 | Resuelto en I07 | Pruebas HTTP y de servicio para firma, CloudEvent, idempotencia, tamaño de cuerpo y vertical. |
| BL-048 | Resuelto en I07 | Respuesta duplicada 200 incluye `Idempotent-Replayed: true`. |

## 3. Matriz de Trazabilidad y Verificación de Cobertura

### 3.1 Cobertura de Hallazgos Alta y Media (`docs/RDA2/HALLAZGOS_CONTRATOS.md`)

| Severidad | Total Hallazgos | Cobertura en Backlog | IDs de Hallazgos Vinculados a Ítems `BL-NNN` |
|:---:|:---:|:---:|---|
| 🔴 **Alta** | **17** | **17 / 17 (100.0%)** | `H-P01-01` (BL-003), `H-P02-01` (BL-004), `H-P03-01` (BL-005), `H-P05-01` (BL-031, BL-034), `H-P06-01` (BL-035), `H-P06-03` (BL-002, BL-009), `H-P08-01` (BL-001), `H-P08-02` (BL-001), `H-P09-01` (BL-011, BL-038), `H-P09-02` (BL-011), `H-P12-02` (BL-006), `H-P13-01` (BL-007), `H-P15-01` (BL-036), `H-P16-01` (BL-025), `H-P16-02` (BL-028), `H-P17-01` (BL-040), `H-P17-02` (BL-040). |
| 🟡 **Media** | **30** | **30 / 30 (100.0%)** | `H-P01-02` (BL-047), `H-P01-03` (BL-023), `H-P01-04` (BL-013), `H-P02-02` (BL-012), `H-P02-03` (BL-049), `H-P02-04` (BL-014), `H-P02-05` (BL-036), `H-P03-02` (BL-012), `H-P03-03` (BL-037), `H-P04-01` (BL-019), `H-P04-02` (BL-020), `H-P05-02` (BL-033), `H-P05-03` (BL-031), `H-P06-02` (BL-010), `H-P07-01` (BL-018), `H-P07-02` (BL-019), `H-P08-03` (BL-015), `H-P08-04` (BL-018), `H-P09-03` (BL-038), `H-P11-01` (BL-013), `H-P11-02` (BL-016), `H-P12-01` (BL-021), `H-P12-03` (BL-022), `H-P12-04` (BL-022), `H-P13-02` (BL-008), `H-P13-03` (BL-055), `H-P16-03` (BL-030), `H-P16-04` (BL-026), `H-P17-03` (BL-024), `H-P17-04` (BL-040). |
| 🟢 **Baja** | **15** | **8 incorporados formalmente** | `H-P00-01` (BL-050), `H-P00-02` (BL-051), `H-P01-05` (BL-052), `H-P04-03` (BL-053), `H-P07-04` (BL-054), `H-P09-04` (BL-048), `H-P11-04` (BL-017), `H-P08-05` (BL-012). *(Los restantes 7 hallazgos cosméticos quedan documentados para refinamientos futuros).* |

### 3.2 Cobertura de Endpoints Planificados (`docs/RDA2/PLANNED_ENDPOINTS.md`)

* **Total de Operaciones Planificadas:** **28 / 28 (100.0% cubiertas con ítems BL)**
  - `MS_CAR` (9 operaciones): BL-025, BL-026, BL-027, BL-028, BL-029, BL-030.
  - `MS_FAC` (5 operaciones): BL-031, BL-032, BL-033, BL-034.
  - `MS_CLI` (3 operaciones): BL-009, BL-035.
  - `MS_PAG` (1 operación): BL-036.
  - `MS_PKG` (1 operación): BL-037.
  - `MS_WH` / `MS_AUD` (2 operaciones): BL-038, BL-039.
  - `MS_ESB` / `MS_OBS` (2 operaciones): BL-023.
  - `MS_AUD` (5 operaciones): BL-040.

---

## 4. Propuesta de Sprints de Implementación

Para asegurar el cierre metódico del backlog antes de la evaluación docente, se estructuran **3 Sprints de Desarrollo e Integración**:

```mermaid
gantt
    title Plan de Sprints de Implementacion RDA2
    dateFormat  YYYY-MM-DD
    section Sprints
    Sprint 1: Seguridad Perimetral y Carrito MS_CAR      :active, sp1, 2026-10-25, 2026-10-28
    Sprint 2: Transaccionalidad, Facturacion y Event Bus :        sp2, 2026-10-28, 2026-10-31
    Sprint 3: Webhooks HMAC, Observabilidad y Hardening  :        sp3, 2026-10-31, 2026-11-03
```

### 4.1 Sprint 1 — Seguridad Perimetral, Cierre de Vulnerabilidades y Carrito Multivertical
* **Objetivo del Sprint:** Blindar el perímetro de la API eliminando cualquier vector de denegación de servicio o bypass de roles, y construir el microservicio de Carrito de Compras Persistente (`MS_CAR`) con snapshotting inmutable de precios.
* **Alcance Técnico:**
  - `BL-001` a `BL-012`: Blindaje con `SupabaseAuthGuard` en `NodesController`, `EsbController`, `PagosController`, `PaquetesController`, gRPC y GraphQL; eliminación del bypass de `X-Role`; validación DTO con `class-validator`.
  - `BL-025` a `BL-029`: Implementación completa de `CarritosModule` (`POST /carritos`, `GET /carritos/activo`, `POST /carritos/{id}/items` y checkout orquestado).
  - `BL-041`: Suite Jest automatizada de pruebas de integración para el carrito (`CP-024`).
* **Entregable del Sprint:** API Gateway con 100% de rutas protegidas y carrito de compras funcional sobre `schema_carritos`.

### 4.2 Sprint 2 — Transaccionalidad Saga, Facturación Fiscal Server-Side y Event Bus Dual
* **Objetivo del Sprint:** Consolidar el flujo de compras compuestas enlazando la Saga con la emisión de comprobantes fiscales electrónicos en backend y la publicación asíncrona de eventos a RabbitMQ y Kafka.
* **Alcance Técnico:**
  - `BL-013` a `BL-017`: Emisión de CloudEvents desde la Saga y la pasarela de pagos hacia RabbitMQ (`booking.events`) y replicación a Kafka vía bridge con W3C Trace Context.
  - `BL-031` a `BL-034`: Implementación de `FacturasModule` sobre `schema_facturacion`, cálculo de 15% IVA y generación de PDFs server-side con clave de acceso SRI.
  - `BL-035` y `BL-036`: Ficha canónica en `MS_CLI` y validación síncrona B2B de pagos por `paymentReference`.
  - `BL-042` y `BL-045`: Suites de prueba automatizadas para facturación fiscal (`CP-023`) y Event Bus dual (`CP-013`).
* **Entregable del Sprint:** Checkout completo de compras con persistencia fiscal real y mensajería asíncrona operativa.

### 4.3 Sprint 3 — Webhooks Inbound HMAC, Observabilidad Forense y Hardening de Despliegue
* **Objetivo del Sprint:** Implementar la absorción segura de eventos de tiendas externas con validación criptográfica HMAC, montar el módulo de auditoría forense `MS_AUD` con grafos visuales y ejecutar el plan de puesta en marcha para la defensa.
* **Alcance Técnico:**
  - `BL-038` a `BL-039`: Módulo `WebhooksModule` (`POST /webhooks/{vertical}`) con verificación de firma `X-Hub-Signature-256` y desduplicación de eventos.
  - `BL-040`: Implementación de `AuditoriaModule` (`MS_AUD`) consumiendo desde `schema_auditoria`.
  - `BL-018` a `BL-024`: Unificación de kill-switches, consolidación financiera en `MS_FIN`, transformador de grafo Saga (`GET /esb/sagas/{id}/traza`) y consumidor Kafka `cg-audit-analytics`.
  - `BL-043`, `BL-044`, `BL-046`: Baterías de pruebas de webhooks (`CP-010`), pagos B2B (`CP-025`) y liquidaciones (`CP-022`).
  - `BL-047` a `BL-055`: Hardening final (idempotencia estricta, HATEOAS v2, RFC 7807 enriquecido y tipos GraphQL).
* **Entregable del Sprint:** Plataforma lista para la defensa oral, 100% resiliente y con observabilidad de 5 nodos y sagas en vivo.

---

## 5. Decisiones Pendientes para el Equipo

Antes de dar inicio formal a la codificación de los sprints de implementación, el equipo de desarrollo debe acordar y ratificar las siguientes **4 decisiones arquitectónicas**:

1. **Estrategia de Demostración para gRPC (Puerto 50051):**
   - *Contexto:* Render Free Web Service restringe el enrutamiento a un solo puerto público (`PORT`).
   - *Opciones:* **A)** Ejecutar demostración en entorno local con túnel `ngrok tcp 50051` para la interconexión con las laptops de los compañeros en el aula; o **B)** Demostrar el socket mediante el script de validación automatizada `test-grpc-inventory.js` y el Panel 7 de monitoreo en la consola.
   - *Recomendación del Backlog:* **Opción A** como demostración principal y **Opción B** como respaldo inmediato ante problemas de conectividad en el aula.
2. **Generación de Factura PDF (Cliente vs Servidor):**
   - *Contexto:* El frontend actual genera el PDF mediante `jsPDF` en el navegador y el backend solo actúa como relay de transporte de correo.
   - *Decisión:* Ratificar la migración al motor server-side en `MS_FAC` (`BL-033`) para garantizar validez legal y cálculo autoritativo del SRI, manteniendo la generación en cliente como fallback transitorio.
3. **Aprovisionamiento de Brokers Cloud para la Nube:**
   - *Contexto:* La plataforma cuenta con fallback in-memory hacia Winston en caso de ausencia de broker externo.
   - *Decisión:* Crear la instancia gratuita en CloudAMQP (*Little Lemur*) para que el backend desplegado en Render publique eventos AMQP reales durante la evaluación o apoyarse en el fallback de logs físicos en disco.
4. **Fecha Límite de Purgado del Bypass `X-Role: admin`:**
   - *Contexto:* `SupabaseAuthGuard` admite la cabecera `X-Role` para facilitar la evaluación académica rápida de roles.
   - *Decisión:* Establecer que al cierre del Sprint 1 (`BL-002`) el bypass se inhabilite estrictamente cuando `NODE_ENV === 'production'`, permitiéndolo únicamente en pruebas locales bajo `localhost`.

---
*Fin del Backlog Priorizado de Implementación RDA2.*
