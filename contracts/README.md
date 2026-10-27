# Índice Maestro de Contratos — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Marketplace Agregador Central)  
> **Documento:** Catálogo e Índice Maestro de Contratos Distribuidos  
> **Versión Estándar:** 2.0.0 (SemVer)  
> **Fecha:** Octubre 2026  
> **Estado:** Fase de Contratos Completada (P00–P17)

---

## 1. Cobertura del Blueprint Arquitectónico

La siguiente matriz contrasta los **13 microservicios básicos** (`MS_CLI`…`MS_AUD`) y los **3 microservicios orquestados** (`ORQ_FAC`, `ORQ_PKG`, `ORQ_STK`) estipulados en el Blueprint Maestro de Arquitectura ([`ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs%20Pa%C3%BAl%20Rosero/architecture/ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md) §5.2 y §6.6) contra los contratos que los formalizan y su estado de implementación real en el código:

| Clave | Microservicio | Esquema DB / Persistencia | Contrato Formal que lo Cubre | Estado de Implementación | Observación Arquitectónica |
|:---:|---|---|---|:---:|---|
| `MS_CLI` | Clientes & Autenticación | `schema_clientes` | [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml)<br>[`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | **Parcial** | Autenticación B2C delegada en Supabase Auth (`delegated`); gestión de usuarios en `AdminController` (`implemented`); endpoints canónicos `/clientes/{id}` en base de datos planificados (`planned`). |
| `MS_CAR` | Carrito de Compras | `schema_carritos` | [`contracts/carritos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/carritos-openapi-v2.yaml) | **Planificado** | En NestJS no existe `CarritosModule` (el carrito vive efímero en React / GraphQL). Contrato diseñado con persistencia en `schema_carritos`, snapshotting de precios y detección de abandono (>2h). |
| `MS_FAC` | Facturación Fiscal | `schema_facturacion` | [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) | **Parcial** | `POST /facturas/enviar` implementado (relay de correo); persistencia y descarga fiscal server-side diseñadas como `planned`. Ensamblado compuesto cubierto por `ORQ_FAC`. |
| `MS_PAG` | Simulación Pagos (SOA) | `schema_pagos` | [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) | **Parcial** | Pasarela de simulación con inyección de fallos (`TIMEOUT_RED`, `RECHAZO_FONDOS`), procesamiento y reembolsos implementada (`implemented`); consulta de validación por `paymentReference` planificada (`planned`). |
| `MS_PKG` | Paquetes y Promociones | `schema_paquetes` | [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) | **Parcial** | Generador de combos dinámicos multivertical y consulta de contratos implementados (`implemented`); sincronización inbound `PUT /paquetes/contratos/{proveedorCodigo}` planificada (`planned`). |
| `MS_FIN` | Finanzas & Liquidaciones | `schema_finanzas` | [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) | **Implementado** | Cómputo de comisiones, cortes quincenales (`Q1`/`Q2`), liquidaciones a socios y registro de comprobantes de pago operativos en backend y consumidos por Panel 4. |
| `MS_PROV`| Monitor de Nodos & Conectores | `schema_proveedores` | [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml)<br>[`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | **Implementado** | Grafo visual de nodos (🟢/🔴), semáforo LED de latencia, configuración de URLs y conmutación de Kill-Switches atómicos en memoria y base de datos. |
| `MS_ATR` | Tienda Atracciones | `schema_atracciones` | [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) | **Implementado** | Contrato de tienda externa v2 (Dilan). Árbol recursivo de categorías, franjas horarias (slots), check-in presencial y voucher QR. |
| `MS_AUT` | Tienda Renta de Autos | `schema_autos` | [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) | **Implementado** | Contrato de tienda externa v2 (responsable de autos). Máquina de estados de 6 fases, cooldown obligatorio de 2h de limpieza, mantenimiento preventivo y acuerdos B2B. |
| `MS_ALO` | Tienda Alojamientos | `schema_alojamientos`| [`contracts/alojamientos-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/alojamientos-openapi.yaml) | **Implementado** | Contrato de tienda externa v1/v2 (responsable de alojamientos). Catálogo, disponibilidad, check-in 14:00 y gestión de habitaciones. |
| `MS_VUE` | Tienda Vuelos | `schema_vuelos` | [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) | **Implementado** | Contrato de tienda externa v2.0.1 (GDS Flight Core). Búsqueda de tarifas, hold de cupos con TTL, emisión de PNRs, postventa y webhooks outbound. |
| `MS_STK` | Ingesta de Stock e Inventario | Memoria RAM / Redis Buffer | [`contracts/grpc/README.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/README.md)<br>[`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) | **Parcial** | Servidor gRPC en puerto 50051 (`inventory.proto`) y endpoints de inspección REST implementados; contrato propuesto v2 con streaming y batch sync planificado. |
| `MS_AUD` | Auditoría Transaccional y Forense | `schema_auditoria` + Disco (`logs/`) | [`contracts/auditoria-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/auditoria-openapi-v2.yaml)<br>[`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | **Parcial** | Streaming de logs físicos rotativos en disco operativo (`/admin/auditoria`, ADR-003); endpoints de auditoría relacional por SQL (`/auditoria/**`) planificados. |
| `ORQ_FAC`| Factura Orquestada | Memoria ESB (Multi-schema) | [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) | **Implementado** | Ensamblado en memoria de encabezado de factura + datos fiscales del cliente + detalles de reservas sin cross-schema SQL JOINs (`GET /esb/aggregate/facturas/{facturaId}`). |
| `ORQ_PKG`| Paquetes Dinámicos Orquestados | Memoria ESB | [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml)<br>[`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) | **Implementado** | Validación de reglas de negocio cruzadas, topes comerciales de descuento combo y persistencia inmutable del paquete. |
| `ORQ_STK`| Stock Orquestado en Tiempo Real | Memoria RAM + Event Bus | [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql)<br>[`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) | **Implementado** | Exposición de catálogo multivertical en GraphQL unificado (`catalogoGlobal`, `estadoInventarioEnVivo`) con propagación de deltas desde gRPC y RabbitMQ. |

---

## 2. Catálogo e Índice Maestro de Contratos

### 2.1 Contratos del Ecosistema Interno de Booking (Gateway / BFF / Core)

| Archivo de Contrato | Protocolo / Tecnología | Versión | Dominio Funcional / Microservicio | Operaciones | Estado General | Consumidor Primario |
|---|:---:|:---:|---|:---:|:---:|---|
| [`contracts/common/components-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/common/components-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Componentes Comunes Reutilizables** (RFC 7807 Problem Details, Headers de Correlación, Errores HTTP 4xx/5xx) | *Biblioteca ($ref)* | Implementado | Todos los contratos Booking v2 |
| [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Enterprise Service Bus (ESB) & Orquestación Saga LIFO** (`MS_ESB`, `ORQ_FAC`) | 6 | Parcial | Frontend Web, App Móvil, Pasarela de Checkout |
| [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Pasarela de Pagos SOA y Simulación Transaccional** (`MS_PAG`) | 6 | Parcial | ESB Checkout Saga, Panel 6 (Simulador de Fallos), Socios |
| [`contracts/paquetes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/paquetes-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Paquetes Turísticos Dinámicos y Promociones B2B** (`MS_PKG`, `ORQ_PKG`) | 5 | Parcial | Frontend Web (Combos), Tiendas Socias B2B |
| [`contracts/finanzas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/finanzas-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Finanzas, Comisiones y Liquidaciones a Proveedores** (`MS_FIN`) | 4 | Implementado | Panel 4 (Liquidaciones y Finanzas), Contabilidad |
| [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Facturación Fiscal y Comprobantes** (`MS_FAC`, `ORQ_FAC`) | 7 | Parcial | ESB Checkout Saga, Frontend Web, Servicio SMTP |
| [`contracts/clientes-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Clientes, Identidad y Gestión de Sesión** (`MS_CLI`) | 12 | Parcial | Frontend Web (AuthContext), Panel 3 (Directorio Usuarios) |
| [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Administración Central, Observabilidad y Nodos** (`MS_PROV`, `MS_CLI`, `MS_AUD`) | 23 | Implementado | Panel de Administración (`AdminDashboard.jsx`), Operadores |
| [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Observabilidad, Nodos, Telemetría e Inventario** (`MS_PROV`, `MS_STK`, `MS_AUD`) | 16 | Parcial | Panel 1 (Nodos y Semáforo LED), Telemetría Frontend |
| [`contracts/webhooks-inbound-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/webhooks-inbound-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Receptor Inbound de Webhooks con Firma HMAC-SHA256** (`MS_AUD`) | 2 | Planificado | Tiendas Socias Externas (Vuelos, Autos, Atracciones) |
| [`contracts/carritos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/carritos-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Carrito de Compras Multivertical Persistente** (`MS_CAR`) | 9 | Planificado | Frontend Web, App Móvil, Worker de Abandono |
| [`contracts/auditoria-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/auditoria-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Auditoría Transaccional y Forense** (`MS_AUD`) | 7 | Parcial | Consola de Auditoría Legal/Fiscal, Administradores |
| [`contracts/asyncapi-eventos-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/asyncapi-eventos-v2.yaml) | AsyncAPI 3.0.0 | 2.0.0 | **Event Bus Dual Asíncrono (RabbitMQ Transaccional + Kafka Streaming)** | 10 canales / 10 operaciones | Implementado | Workers NestJS, SagaOrchestrator, Bridge Cross-Broker |
| [`contracts/grpc/README.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/README.md) & [`inventory-v2.proposed.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/grpc/inventory-v2.proposed.proto) | gRPC / Protocol Buffers v3 | 2.0.0 | **Ingesta de Stock e Inventario de Alta Frecuencia HTTP/2** (`MS_STK`, puerto 50051) | 4 RPCs | Parcial | Tiendas Externas (Atracciones, Autos, Alojamientos, Vuelos) |
| [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) | GraphQL SDL | 2.0.0 | **API Gateway BFF GraphQL Cliente** (Catálogo Unificado, Checkout Orquestado, Check-in) | 5 Queries / 4 Mutations | Implementado | Frontend Web React, Clientes Móviles |

---

### 2.2 Contratos de Tiendas Socias Externas (Verticales Especializadas)

> **Nota de Gobernanza:** Los siguientes contratos pertenecen a los equipos responsables de cada vertical externa y se mantienen inalterados como especificaciones autoritativas de integración de tienda:

| Archivo de Contrato | Protocolo / Tecnología | Versión | Tienda / Vertical | Operaciones | Responsable / Rol |
|---|:---:|:---:|---|:---:|---|
| [`contracts/atracciones-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Atracciones Turísticas (Descubre EC)** | 14 | Tienda Socia Externa (Dilan) |
| [`contracts/autos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.0 | **Renta de Autos y Gestión de Flota** | 19 | Tienda Socia Externa (Autos) |
| [`contracts/vuelos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi-v2.yaml) | OpenAPI 3.0.3 | 2.0.1 | **GDS Flight Core (Aerolíneas)** | 30 | Tienda Socia Externa (Vuelos) |
| [`contracts/alojamientos-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/alojamientos-openapi.yaml) | OpenAPI 3.0.3 | 1.0.0 | **GDS Alojamientos Core** | 17 | Tienda Socia Externa (Alojamientos) |
| [`contracts/atracciones-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi.yaml) | OpenAPI 3.0.3 | 1.0.0 | Atracciones Turísticas (Legacy v1) | 9 | Referencia histórica |
| [`contracts/autos-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/autos-openapi.yaml) | OpenAPI 3.0.3 | 1.0.0 | Renta de Autos (Legacy v1) | 15 | Referencia histórica |
| [`contracts/vuelos-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/vuelos-openapi.yaml) | OpenAPI 3.0.3 | 1.5.0 | GDS Flight Core (Legacy v1) | 22 | Referencia histórica |
| [`contracts/clientes-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/clientes-openapi.yaml) | OpenAPI 3.0.3 | 1.1.0 | Clientes & Identidad (Legacy v1 ficticio) | 5 | Reemplazado por `clientes-openapi-v2.yaml` |
| [`contracts/facturacion-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi.yaml) | OpenAPI 3.0.3 | 1.0.0 | Facturación Fiscal (Legacy v1 prospectivo) | 5 | Reemplazado por `facturacion-openapi-v2.yaml` |

---

## 3. Políticas y Estándares Comunes de Integración v2

1. **Versionamiento por URI (`/api/v2`):**  
   El backend expone simultáneamente `/api/v1` y `/api/v2`. Todos los contratos v2 documentan servidores bajo `/api/v2` y declaran sus rutas sin el prefijo del servidor (ej. `/pagos/procesar`).
2. **Componentes Comunes Reutilizables:**  
   Todo contrato v2 de Booking enlaza directamente a [`contracts/common/components-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/common/components-v2.yaml) para evitar duplicación y garantizar consistencia en los encabezados de trazabilidad (`X-Correlation-Id`, `traceparent`), idempotencia (`Idempotency-Key`) y respuestas de error RFC 7807 (`application/problem+json`).
3. **Idempotencia Estricta en Mutaciones Transaccionales:**  
   Las mutaciones financieras y orquestadas (`POST /esb/checkout-saga`, `POST /pagos/procesar`, `POST /facturas`, `POST /carritos/{id}/checkout`) exigen o soportan la cabecera `Idempotency-Key` para prevenir dobles cobros o reservas duplicadas ante reintentos de red.
4. **Propagación del Contexto de Correlación:**  
   El identificador de correlación (`correlation_id`) se genera en el perímetro del API Gateway y viaja a través de REST HTTP (`X-Correlation-Id`), frames AMQP de RabbitMQ (`headers`), registros de Apache Kafka y metadata de gRPC, vinculando la traza distribuida transversal.
5. **Separación Estricta: Auditoría de Negocio vs Logs Técnicos (ADR-003):**  
   - **Auditoría de Negocio:** Se almacena en PostgreSQL bajo `schema_auditoria` (`auditoria_transaccional`, `saga_transacciones`, `saga_pasos_journal`) registrando quién compró y qué administrador modificó configuraciones o conmutó kill-switches (con snapshot `antes`/`despues`).
   - **Logs Técnicos:** Residen exclusivamente en el sistema de archivos rotativo (`logs/*.log`). **Cero logs técnicos en la base de datos relacional.**

---

## 4. Matriz de Resolución de Conflictos y Duplicados ("Cuál Responde Qué")

Para solventar ambigüedades derivadas de la coexistencia de módulos administrativos y de dominio en el backend NestJS:

| Dominio / Funcionalidad | Endpoints en Conflicto | Contratos Involucrados | Ruta Canónica Autoritativa | Justificación Arquitectónica |
|---|---|---|---|---|
| **Gestión de Usuarios** | `GET/POST /admin/users`<br>`PUT /admin/users/{id}/action`<br>`GET /admin/users/{id}/historial` | `admin-openapi-v2.yaml`<br>`clientes-openapi-v2.yaml` | **`admin-openapi-v2.yaml`** | Corresponde al módulo administrativo `AdminController` que consulta `auth.users` y consolida reservas multivertical. En `clientes-openapi-v2.yaml` se documenta como vista de identidad. |
| **Kill-Switches de Nodos** | `POST /admin/nodes/{id}/toggle`<br>`POST /nodes/{codigoNodo}/toggle`<br>`POST /admin/nodes/{codigoNodo}/toggle-killswitch` | `admin-openapi-v2.yaml`<br>`observabilidad-openapi-v2.yaml` | **`POST /admin/nodes/{codigoNodo}/toggle-killswitch`** | Es la única ruta que garantiza coherencia atómica actualizando `schema_proveedores.config_proveedor` en base de datos y refrescando el mapa en memoria de `ConnectorHealthService`. |
| **Finanzas y Liquidaciones** | `GET /admin/finanzas`<br>`GET /admin/payouts`<br>`vs`<br>`GET /finanzas/resumen`<br>`GET /finanzas/liquidaciones` | `admin-openapi-v2.yaml`<br>`finanzas-openapi-v2.yaml` | **`finanzas-openapi-v2.yaml`** (`MS_FIN`) | `MS_FIN` opera formalmente sobre `schema_finanzas` con períodos quincenales (`Q1`/`Q2`) auditables y comprobantes bancarios. Las rutas de `admin` son vistas agregadas en caliente para el dashboard. |
| **Auditoría de Operaciones** | `GET /admin/auditoria`<br>`vs`<br>`GET /auditoria/transacciones`<br>`GET /auditoria/admin`<br>`GET /auditoria/sagas` | `admin-openapi-v2.yaml`<br>`auditoria-openapi-v2.yaml` | **`GET /admin/auditoria`** (Técnica)<br>**`GET /auditoria/*`** (Negocio) | `/admin/auditoria` lee en tiempo real el streaming de archivos planos `logs/audit-*.log` (ADR-003). `/auditoria/*` consulta la base de datos relacional `schema_auditoria` para trazabilidad forense por SQL. |
| **Ensamblado de Facturas** | `GET /esb/aggregate/facturas/{id}` | `esb-sagas-openapi-v2.yaml`<br>`facturacion-openapi-v2.yaml` | **`esb-sagas-openapi-v2.yaml`** (`ORQ_FAC`) | El ensamblado en memoria de datos fiscales sin cross-schema SQL JOINs es responsabilidad exclusiva del ESB (`MS_ESB`). En facturación se enlaza como comprobante fiscal. |
| **Telemetría e Inventario REST** | `GET /inventory`<br>`GET /inventory/status` | `inventory-grpc.controller.ts`<br>`observabilidad-openapi-v2.yaml` | **`observabilidad-openapi-v2.yaml`** | Los endpoints HTTP para inspeccionar el estado del socket gRPC en puerto 50051 pertenecen al dominio de observabilidad de infraestructura (`MS_STK` / `MS_PROV`). |

---

## 5. Protocolo de Validación Global de Contratos

La suite completa de contratos ha sido verificada contra los estándares del sector mediante validación sintáctica automatizada:

```bash
# 1. Validación de contratos OpenAPI v2 (0 errores)
npx --yes @redocly/cli@1 lint contracts/admin-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/esb-sagas-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/pagos-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/paquetes-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/finanzas-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/facturacion-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/clientes-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/observabilidad-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/webhooks-inbound-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/carritos-openapi-v2.yaml
npx --yes @redocly/cli@1 lint contracts/auditoria-openapi-v2.yaml

# 2. Validación de eventos asíncronos AsyncAPI 3.0 (0 errores)
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml

# 3. Compilación sintáctica de Protocol Buffers v3 (gRPC)
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('OK')"
node -e "require('@grpc/proto-loader').loadSync('contracts/grpc/inventory-v2.proposed.proto',{keepCase:true});console.log('OK')"

# 4. Parseo y tipado de esquema GraphQL SDL
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('OK')"
```
