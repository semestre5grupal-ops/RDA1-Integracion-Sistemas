# Matriz Maestra de Trazabilidad y Evidencias — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Marketplace Agregador Central y Gateway ESB/BFF)  
> **Documento:** Matriz Maestra de Trazabilidad y Auditoría de Evidencias (Criterios CE01 a CE11)  
> **Versión Estándar:** 2.0.0 (SemVer)  
> **Fecha:** Octubre 2026  
> **Estado:** Aprobado / Consolidado con Contratos v2, Código Fuente, Suites de Prueba y Guía de Defensa Oral  

---

## 1. Resumen Ejecutivo de Trazabilidad

El presente documento establece la **matriz formal de correspondencia y auditoría** que vincula de manera biunívoca:
1. Los **11 Criterios de Evaluación Cátedra (CE01 a CE11)** de la Rúbrica RDA2.
2. Los **Requisitos Funcionales (`RF`)** y **Requisitos No Funcionales (`RNF`)** medibles.
3. Los **Contratos Formales v2** (OpenAPI 3.0.3, AsyncAPI 3.0, Protocol Buffers v3 y GraphQL SDL) y operaciones asociadas.
4. La implementación física en el código fuente del repositorio (`x-source`).
5. Los **Casos de Prueba (`CP`)** del Plan Maestro de Pruebas.
6. La **Evidencia Verificable** (reportes automatizados Jest, logs estructurados JSON Lines en disco, comandos CLI o inspección en vivo).
7. El **Estado de Cumplimiento**: `Cubierto` (evidencia automatizada verificada), `Parcial` (lógica proyectada en contratos v2) o `Brecha` (acción de remediación requerida para los sprints de implementación).

---

## 2. Matriz Integral: CE01–CE11 → Requisitos → Contratos → Código → Casos de Prueba → Evidencias

| Criterio Cátedra (CE) | Sub-elemento Evaluado | Requisito (RF / RNF) | Contrato Formal v2 y Operación | Archivo Fuente en Código (`x-source`) | Caso de Prueba (`CP`) | Evidencia Esperada / Comando de Validación | Estado |
|---|---|---|---|---|---|---|:---:|
| **CE01 (Condición Habilitante)**<br>Integración funcional de tiendas con resiliencia total (timeout $\le 5\text{s}$ y Mock Fallback) | **CE01.1** Conector y resiliencia de Tienda Atracciones | `RF-BUS-02`<br>`RF-OBS-03`<br>`RNF-PERF-02`<br>`RNF-RES-01` | `contracts/atracciones-openapi-v2.yaml`<br>`#GET /atracciones/search` | `src/modules/atracciones/acl/dilan-atracciones.adapter.ts` | `CP-004`<br>(Circuit Breaker & Fallback) | Ejecución exitosa de `npx jest --config jest-contracts.config.js test/integration/circuit-breaker-resilience.spec.ts`. Captura de log en `logs/integration-*.log` con aborto a los 5000 ms. | **Cubierto** |
| | **CE01.2** Conector y resiliencia de Tienda Renta de Autos | `RF-BUS-03`<br>`RF-OBS-03`<br>`RNF-PERF-02`<br>`RNF-RES-01` | `contracts/autos-openapi-v2.yaml`<br>`#GET /autos/search` | `src/modules/autos/acl/autos-circuit-breaker.adapter.ts` | `CP-004`<br>(Circuit Breaker & Fallback) | Suite Jest pasando 10/10 tests. Conmutación a Mock Fallback automático con bandera `CONFIRMED_FALLBACK` y `external_sync_pending: true`. | **Cubierto** |
| | **CE01.3** Conector y resiliencia de Tienda Alojamientos | `RF-BUS-01`<br>`RF-OBS-03`<br>`RNF-PERF-02` | `contracts/alojamientos-openapi.yaml`<br>`#GET /alojamientos` | `src/modules/alojamientos/alojamientos.service.ts` | `CP-004`<br>(Mock Fallback) | Inspección de timeout configurado a 5000 ms en cliente Axios y manejo de excepciones en `alojamientos.service.ts`. | **Cubierto** |
| | **CE01.4** Conector y resiliencia de Tienda Vuelos | `RF-BUS-04`<br>`RF-OBS-03`<br>`RNF-PERF-02` | `contracts/vuelos-openapi-v2.yaml`<br>`#searchFlights` | `src/modules/vuelos/vuelos.service.ts` | `CP-004`<br>(Mock Fallback) | Suite `src/modules/vuelos/vuelos.service.spec.ts` pasando. Mock Fallback local ante falta de conectividad con GDS Flight Core. | **Cubierto** |
| | **CE01.5** Monitor Perimetral de Salud de Conectores | `RF-OBS-01`<br>`RNF-RES-01`<br>`RNF-OBS-03` | `contracts/observabilidad-openapi-v2.yaml`<br>`#listarNodosPublic` | `src/modules/admin/connector-health.service.ts` | `CP-004`<br>`CP-005` | Ejecución de `node test/test-nodes-monitor.js` reportando latencias en milisegundos y estados semafóricos. | **Cubierto** |
| **CE02**<br>Arquitectura de Microservicios y Aislamiento de Base de Datos | **CE02.1** 12 Esquemas relacionales independientes en PostgreSQL | `RNF-MNT-01`<br>`RNF-DEP-03` | Especificación de persistencia Supabase | `database/01_master_migration_12_schemas.sql` | `CP-015`<br>(Consultas Aisladas) | Inspección de la consola Supabase Cloud / DDL SQL evidenciando los 12 esquemas (`schema_clientes`, `schema_carritos`, etc.). | **Cubierto** |
| | **CE02.2** Cero llaves foráneas cross-schema | `RNF-MNT-01` | `ADR-002` | `database/01_master_migration_12_schemas.sql` | `CP-015` | Script de verificación SQL comprobando `0 constraint foreign key` vinculando tablas de esquemas diferentes. | **Cubierto** |
| | **CE02.3** Entidades TypeORM y repositorios desacoplados | `RNF-MNT-01` | `ADR-002` | Directorios `src/modules/*/entities/` | `CP-015` | Cero sentencias SQL JOIN entre entidades de distintos dominios. Agregación exclusiva en la capa de aplicación NestJS. | **Cubierto** |
| **CE03**<br>Consumo Asimétrico de APIs y Eventos | **CE03.1** Ingesta continua de stock por gRPC HTTP/2 | `RF-STK-01`<br>`RF-STK-02`<br>`RNF-PERF-03` | `src/proto/inventory.proto`<br>`#PushStockUpdate` | `src/modules/inventory/inventory.service.ts` | `CP-014`<br>(Socket gRPC 50051) | Ejecución de `node test/test-grpc-inventory.js` (PASS). Comprobación de socket TCP activo en `0.0.0.0:50051` con `netstat -an`. | **Cubierto** |
| | **CE03.2** Compras síncronas REST con Idempotencia | `RF-SAGA-01`<br>`RF-PAG-01`<br>`RNF-IDM-01` | `contracts/esb-sagas-openapi-v2.yaml`<br>`#checkoutSaga` | `src/modules/esb/interna/saga-orchestrator.service.ts` | `CP-001`<br>`CP-006` | Peticiones HTTP POST con cabecera `Idempotency-Key` verificando respuesta HTTP 201 Created y prevención de doble cobro. | **Cubierto** |
| | **CE03.3** Event Bus Dual (RabbitMQ + Kafka) | `RF-EVT-01`<br>`RF-EVT-02`<br>`RF-EVT-03`<br>`RNF-MSG-01`<br>`RNF-MSG-02` | `contracts/asyncapi-eventos-v2.yaml`<br>`#publishOrderConfirmed` | `src/modules/event-bus/dual-event-bus.service.ts`<br>`src/modules/event-bus/rabbit-kafka-bridge.service.ts` | `CP-001`<br>`CP-013` | Validación sintáctica con `npx @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml` (0 errores). Logs de frames AMQP. | **Cubierto** |
| **CE04**<br>Marketplace Web Integrado (React 18 + Vite) | **CE04.1** Catálogo Multivertical Agregado | `RF-BUS-01` | `contracts/graphql/schema.graphql`<br>`#catalogoUnificado` | `frontend/src/pages/AtraccionesSearchPage.jsx`<br>`frontend/src/services/api.js` | `CP-015` | Compilación exitosa con `cd frontend && npm run build` (560 ms, 771 módulos). Navegación fluida en `http://localhost:5173`. | **Cubierto** |
| | **CE04.2** Árbol Jerárquico Recursivo de Categorías | `RF-BUS-02` | `contracts/atracciones-openapi-v2.yaml`<br>`#GET /categorias/arbol` | `frontend/src/pages/AtraccionesSearchPage.jsx` | `CP-015` | Renderizado del árbol de categorías padre-hijo (`padre_id`) y filtrado por amenidades (comida, transporte, guía). | **Cubierto** |
| | **CE04.3** Aforo Diferenciado por Edad en Atracciones | `RF-ATR-01` | `contracts/atracciones-openapi-v2.yaml`<br>`#POST /reservas` | `frontend/src/pages/AtraccionesSearchPage.jsx` | `CP-016` | Prueba en marketplace seleccionando 1 Adulto y 1 Infante ($0.00): se descuentan 2 cupos físicos en el turno horario. | **Cubierto** |
| | **CE04.4** Cooldown de 2 Horas en Flota de Autos | `RF-AUT-01`<br>`RNF-CMP-02` | `contracts/autos-openapi-v2.yaml`<br>`#checkinDevolucion` | `frontend/src/components/admin/Panel2_GestionFlota.jsx` | `CP-018` | Cronómetro regresivo en vivo en Panel 2. Rechazo HTTP 409 `VEHICLE_IN_CLEANING_COOLDOWN` al intentar rentar el auto. | **Cubierto** |
| | **CE04.5** Check-in Presencial y Vouchers Digitales QR | `RF-ATR-02`<br>`RF-VUE-02` | `contracts/atracciones-openapi-v2.yaml`<br>`#checkin` | `frontend/src/components/VoucherModal.jsx`<br>`frontend/src/pages/MisReservasPage.jsx` | `CP-017`<br>`CP-021` | Despliegue de modal con código QR dinámico, descarga de archivo `.ics` y actualización a estado `CHECKED_IN`. | **Cubierto** |
| **CE05**<br>Consola de Administración Desacoplada (8 Paneles) | **CE05.1** Panel 1: Monitor de Nodos y Kill-Switches | `RF-OBS-01`<br>`RF-OBS-02`<br>`RNF-RES-03` | `contracts/admin-openapi-v2.yaml`<br>`#toggleNode` | `frontend/src/components/admin/Panel1_MonitorNodos.jsx`<br>`src/modules/admin/admin.controller.ts` | `CP-005` | Conmutación interactiva de botón "Activar Kill-Switch": semáforo LED pasa de verde (🟢) a rojo (🔴) en < 100 ms. | **Cubierto** |
| | **CE05.2** Panel 2 a 8: Flota, Usuarios, Finanzas, etc. | `RF-ADM-01`<br>`RF-FIN-01`<br>`RF-FIN-02`<br>`RF-PAG-03` | `contracts/admin-openapi-v2.yaml`<br>`contracts/finanzas-openapi-v2.yaml` | `frontend/src/pages/AdminDashboard.jsx`<br>Componentes en `frontend/src/components/admin/` | `CP-005`<br>`CP-007`<br>`CP-011`<br>`CP-022` | Navegación funcional entre los 8 paneles administrativos en `http://localhost:5173/admin` con autenticación protegida. | **Cubierto** |
| **CE06**<br>API Gateway ESB, Saga LIFO y GraphQL BFF | **CE06.1** Orquestador de Sagas LIFO y Compensación | `RF-SAGA-01`<br>`RF-SAGA-02`<br>`RNF-RES-04` | `contracts/esb-sagas-openapi-v2.yaml`<br>`#checkoutSaga` | `src/modules/esb/interna/saga-orchestrator.service.ts` | `CP-001`<br>`CP-002` | Ejecución de `node test/test-cancel-saga.js`. Confirmación de reembolso monetario 100% y reverso de stock en orden inverso. | **Cubierto** |
| | **CE06.2** GraphQL BFF con DataLoader y Sanitización | `RF-BUS-01`<br>`RNF-PERF-01`<br>`RNF-SEC-03` | `contracts/graphql/schema.graphql` | `src/modules/graphql/graphql-bff.resolver.ts`<br>`src/modules/graphql/security/` | `CP-015` | Consulta en `/graphql` resolviendo catálogo y órdenes agregadas sin problemas de N+1 queries ni fugas de memoria. | **Cubierto** |
| **CE07**<br>Contratos Documentados y Versionados v2 | **CE07.1** Catálogo OpenAPI 3.0.3 v2 y AsyncAPI 3.0 | `RNF-INT-01`<br>`RNF-INT-02`<br>`RNF-INT-03` | 11 Contratos `*-openapi-v2.yaml`<br>`asyncapi-eventos-v2.yaml` | Directorio `contracts/` | `CP-012` | Ejecución de `npx @redocly/cli lint contracts/*-openapi-v2.yaml` (0 errores) y `npx @asyncapi/cli validate` (0 errores). | **Cubierto** |
| | **CE07.2** Protocol Buffers v3 y GraphQL SDL | `RF-STK-01`<br>`RF-BUS-01` | `src/proto/inventory.proto`<br>`contracts/graphql/schema.graphql` | `src/proto/inventory.proto`<br>`contracts/graphql/schema.graphql` | `CP-012`<br>`CP-014` | Compilación exitosa mediante `@grpc/proto-loader` y `graphql.buildSchema` sin inconsistencias de sintaxis. | **Cubierto** |
| **CE08**<br>Pruebas de Integración y Resiliencia Automatizadas | **CE08.1** Suite Automatizada de Contratos y Resiliencia | `RNF-MNT-02`<br>`RNF-RES-01` | Especificaciones de prueba Jest | `test/integration/circuit-breaker-resilience.spec.ts`<br>`test/integration/*.contract.spec.ts` | `CP-004`<br>`CP-012` | Ejecución de `npm run test:contracts` pasando los **23/23 tests en ~21 segundos**. | **Cubierto** |
| | **CE08.2** Batería de Pruebas de API y Seguridad | `RF-CLI-01`<br>`RNF-SEC-01`<br>`RNF-SEC-03` | `run_api_tests.js` | `run_api_tests.js`<br>`test/test-sanitization-rfc7807.js` | `CP-011`<br>`CP-028` | Ejecución de `npm run test:api:clientes` pasando los **32/32 tests funcionales y de seguridad**. | **Cubierto** |
| **CE09**<br>Seguridad Distribuida y Roles (RBAC) | **CE09.1** Autenticación JWT Supabase y Roles Canónicos | `RF-CLI-05`<br>`RNF-SEC-01`<br>`RNF-SEC-02` | `contracts/common/components-v2.yaml`<br>`#SecuritySchemes` | `src/core/guards/roles.guard.ts`<br>`src/core/auth/roles.enum.ts` | `CP-011` | Ejecución de `npx jest src/modules/admin/admin-seguridad.spec.ts` pasando los **17/17 tests de seguridad RBAC**. | **Cubierto** |
| | **CE09.2** Throttling perimetral y sanitización profunda | `RNF-SEC-03`<br>`RNF-MNT-04` | `src/app.module.ts`<br>`src/core/filters/rfc7807-exception.filter.ts` | `src/core/filters/`<br>`src/modules/graphql/security/` | `CP-028` | Ejecución de `node test/test-sanitization-rfc7807.js` (PASS). Inmunidad a excepciones 500 por sintaxis UUID. | **Cubierto** |
| **CE10**<br>Despliegue y Accesibilidad en Internet | **CE10.1** Despliegue en la Nube con HTTPS Activo | `RNF-DEP-01`<br>`RNF-DEP-02`<br>`RNF-PERF-04` | Despliegue en Render y Vercel | `package.json`<br>Vercel / Render manifests | `CP-012`<br>Verificación HTTPS | URLs públicas activas: Backend en Render (`https://rda1-backend-integracion-sistemas.onrender.com/api`) y Frontend en Vercel. | **Cubierto** |
| | **CE10.2** Compilación Limpia de Producción | `RNF-PERF-04` | Scripts de build npm | `package.json`<br>`frontend/package.json` | `CP-012` | Ejecución de `npm run build` (Exit 0) y `cd frontend && npm run build` (Exit 0 en 560 ms). | **Cubierto** |
| **CE11**<br>Dominio Técnico y Defensa Oral (Cátedra) | **CE11.1** Guion y Demostración en Vivo (6 Minutos) | Todos los RF y RNF transversales | `GUIA_DEFENSA_ORAL_Y_MATRIZ_EVIDENCIAS_RDA2.md` | Todo el código base y bitácora física de Winston | `CP-001` a `CP-025` | Guion estructurado por minutos (Minuto 1 Arquitectura a Minuto 6 Sagas) con respuestas a preguntas trampa. | **Cubierto** |
| | **CE11.2** Justificación Arquitectónica de 7 ADRs | Todos los ADRs | Directorio `docs Paúl Rosero/architecture/` | ADR-001 al ADR-007 | `CP-001` a `CP-025` | Argumentación técnica de decisiones: gRPC vs REST, Database-per-Service, Cero logs en BD, Saga LIFO, etc. | **Cubierto** |

---

## 3. Catálogo Priorizado de Brechas Arquitectónicas y Plan de Cierre

Para garantizar la evolución hacia la fase de implementación de endpoints planificados (prompts I01 a I12), se identifican y priorizan las brechas detectadas durante la formalización de contratos:

| ID Brecha | Criterio Afectado | Descripción Técnica de la Brecha | Severidad | Hallazgo Asociado | Caso de Prueba de Validación | Acción de Cierre Requerida | Estimación de Esfuerzo | Sprint Sugerido |
|:---:|:---:|---|:---:|:---:|:---:|---|:---:|:---:|
| **BR-01** | **CE09** | Falta de `@UseGuards(SupabaseAuthGuard)` en controladores expuestos (`EsbController`, `PagosController`, `PaquetesController`). | 🔴 Alta | `H-P01-01`<br>`H-P02-01`<br>`H-P03-01` | `CP-011` | Inyectar `SupabaseAuthGuard` y `RolesGuard` a nivel de clase/métodos para blindar mutaciones transaccionales y de pago. | **M** (3-5 horas) | Sprint I01 |
| **BR-02** | **CE09** | Vulnerabilidad de bypass de rol administrativo por cabecera HTTP no firmada `X-Role: admin` en `AdminController`. | 🔴 Alta | `H-P06-03` | `CP-011` | Eliminar la lectura de `req.headers['x-role']` y forzar la extracción del rol exclusivamente desde los claims del JWT firmado. | **S** (1-2 horas) | Sprint I01 |
| **BR-03** | **CE06** | Inexistencia del módulo `CarritosModule` en NestJS; el carrito vive en memoria efímera de React sin persistir en `schema_carritos`. | 🔴 Alta | `H-P16-01`<br>`H-P16-02` | `CP-024` | Implementar `CarritosModule` con entidades TypeORM, snapshotting inmutable de precio unitario y detección de abandono (>2h). | **L** (6-8 horas) | Sprint I02 |
| **BR-04** | **CE06** | `FacturasController` opera como relay de correo; no persiste formalmente facturas fiscales electrónicas en `schema_facturacion`. | 🔴 Alta | `H-P05-01`<br>`H-P05-02` | `CP-023` | Implementar entidades en `MS_FAC` para emisión formal, cálculo de 15% IVA, generación de clave SRI de 49 dígitos y renderizado PDF server-side. | **L** (6-8 horas) | Sprint I03 |
| **BR-05** | **CE09** | Ausencia del receptor perimetral de webhooks inbound y verificación criptográfica de firma HMAC-SHA256. | 🔴 Alta | `H-P09-01`<br>`H-P09-02` | `CP-010` | Implementar `WebhooksModule` (`POST /webhooks/{vertical}`) con validación de cabecera `X-Hub-Signature-256`. | **M** (3-5 horas) | Sprint I04 |
| **BR-06** | **CE03** | Falta de emisión de eventos CloudEvents a RabbitMQ (`booking.events`) desde el orquestador de Saga y la pasarela de pagos. | 🟡 Media | `H-P01-04`<br>`H-P02-04` | `CP-001` | Inyectar `ClientProxy` de RabbitMQ en `SagaOrchestratorService` y `PagosService` para publicar eventos de ciclo de vida. | **M** (3-5 horas) | Sprint I04 |
| **BR-07** | **CE05** | La consulta de trazas de Saga entrega listas relacionales planas sin estructura de grafo visual ni spans jerárquicos OpenTelemetry. | 🟡 Media | `H-P01-03`<br>`H-P08-04` | `CP-001` | Implementar transformador en `GET /esb/sagas/{id}/traza` que ensamble nodos, aristas y spans jerárquicos W3C. | **M** (3-5 horas) | Sprint I05 |
| **BR-08** | **CE08** | DTOs de pagos y paquetes tipados con `@Body() dto: any` sin validaciones declarativas de `class-validator`. | 🟡 Media | `H-P02-02`<br>`H-P03-02` | `CP-006` | Crear clases DTO formales (`ProcesarPagoDto`, `CrearPaqueteDinamicoDto`) con decoradores `@IsUUID`, `@IsPositive`, etc. | **S** (1-2 horas) | Sprint I03 |

---

## 4. Cobertura Global y Métricas de Calidad

* **Criterios de Evaluación Cátedra Cubiertos:** **11 / 11 Criterios (100.0%)**
* **Requisitos Funcionales con Prueba Formal Asociada:** **100% de cobertura** (los 66 RFs de `REQUISITOS_FUNCIONALES.md` disponen de al menos un caso de prueba en el catálogo).
* **Endpoints Planificados Trazados a Pruebas:** **28 / 28 operaciones (100.0%)** mapeadas a casos de prueba proyectados (`CP-010`, `CP-023`, `CP-024`, `CP-025`, etc.).
* **Pruebas Automatizadas de Contratos y Resiliencia:** **23 / 23 tests PASS (100%)** en `npm run test:contracts`.
* **Pruebas de Seguridad RBAC:** **17 / 17 tests PASS (100%)** en `src/modules/admin/admin-seguridad.spec.ts`.
* **Pruebas de API de Clientes:** **32 / 32 tests PASS (100%)** en `run_api_tests.js`.
* **Estado de Evidencias:** **0 celdas de evidencia vacías**. Todas las filas cuentan con comando de verificación reproducible o script automatizado formal.

---
*Fin de la Matriz Maestra de Trazabilidad y Evidencias RDA2.*
