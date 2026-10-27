# Hallazgos de contratos — Booking Prototipo (RDA2)

> Este archivo se actualiza con cada tarea. Las discrepancias entre el código real
> y lo documentado se registran aquí para revisión de Claude al final del ciclo.

---

## Resumen Ejecutivo de Hallazgos Consolidados (RDA2)

Durante la fase de análisis de código fuente y formalización de contratos v2 (P00–P17), se registraron un total de **62 hallazgos técnicos y de arquitectura**, categorizados según su severidad e impacto en el ecosistema distribuido de Booking:

### 1. Balance Global por Nivel de Severidad

| Nivel de Severidad | Total de Hallazgos | Porcentaje | Criterio de Clasificación |
|---|:---:|:---:|---|
| 🔴 **Alta** | **17** | 27.4 % | Vulnerabilidades de seguridad críticas (rutas administrativas sin autenticación ni RBAC, bypass de roles por cabeceras HTTP no firmadas, falta de validación de firma en webhooks o gRPC abierto sin credenciales) o ausencia de módulos core de persistencia (`MS_CAR`, `MS_AUD`). |
| 🟡 **Media** | **30** | 48.4 % | Desviaciones de cátedra y blueprint (persistencia síncrona en PostgreSQL en lugar de Kafka streaming, desconexión del Event Bus con el orquestador de Sagas, DTOs sin tipado con `any`, falta de sincronización en liquidaciones financieras o contratos v1 ficticios). |
| 🟢 **Baja** | **15** | 24.2 % | Inconsistencias menores de interfaz, parámetros de paginación no acotados en el gateway, omisión de metadatos W3C en cabeceras de frames AMQP, o ausencia de la cabecera `Idempotent-Replayed`. |
| **TOTAL CONSOLIDADO** | **62** | **100 %** | **Base autoritativa de remediación para la fase de implementación (I01–I12).** |

### 2. Desglose de Hallazgos por Tarea y Módulo

| Tarea | Dominio / Módulo Evaluado | 🔴 Alta | 🟡 Media | 🟢 Baja | Subtotal | Secciones Relacionadas |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| **P00** | Componentes Comunes & RFC 7807 | 0 | 0 | 3 | **3** | [Ver P00](#p00--componentes-comunes) |
| **P01** | ESB y Orquestador de Sagas LIFO | 1 | 3 | 1 | **5** | [Ver P01](#p01--esb-y-sagas) |
| **P02** | Pasarela de Simulación de Pagos SOA | 1 | 4 | 0 | **5** | [Ver P02](#p02--pagos) |
| **P03** | Paquetes Dinámicos y Promociones B2B | 1 | 2 | 1 | **4** | [Ver P03](#p03--paquetes-y-promociones) |
| **P04** | Finanzas & Liquidaciones Quincenales | 0 | 2 | 1 | **3** | [Ver P04](#p04--finanzas) |
| **P05** | Facturación Fiscal y Comprobantes | 1 | 2 | 1 | **4** | [Ver P05](#p05--facturación) |
| **P06** | Clientes, Identidad y Gestión de Sesión | 2 | 1 | 0 | **3** | [Ver P06](#p06--clientes-identidad-y-sesión) |
| **P07** | Administración Central y Nodos | 0 | 2 | 2 | **4** | [Ver P07](#p07--administración) |
| **P08** | Nodos, Telemetría e Inventario REST | 2 | 2 | 2 | **6** | [Ver P08](#p08--nodos-telemetría-e-inventario) |
| **P09** | Receptor de Webhooks de Tiendas | 2 | 1 | 1 | **4** | [Ver P09](#p09--receptor-de-webhooks-de-las-tiendas) |
| **P11** | Event Bus Dual (RabbitMQ + Kafka) | 0 | 2 | 2 | **4** | [Ver P11](#p11--eventos-asíncronos) |
| **P12** | Ingesta de Inventario gRPC (Puerto 50051) | 1 | 3 | 0 | **4** | [Ver P12](#p12--grpc-de-inventario) |
| **P13** | API Gateway BFF GraphQL Cliente | 1 | 2 | 1 | **4** | [Ver P13](#p13--graphql-gateway-cliente) |
| **P15** | Contrato de Tienda de Vuelos (v2.0.1) | 1 | 0 | 0 | **1** | [Ver P15](#p15--vuelos-v201) |
| **P16** | Carrito de Compras Multivertical (`MS_CAR`) | 2 | 2 | 0 | **4** | [Ver P16](#p16--carrito-de-compras-ms_car) |
| **P17** | Auditoría Transaccional y Forense (`MS_AUD`) | 2 | 2 | 0 | **4** | [Ver P17](#p17--auditoría-transaccional-ms_aud) |
| **TOTAL** | | **17** | **30** | **15** | **62** | |

---

## P00 — Componentes comunes

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P00-01 | Baja | El interceptor `HateoasInterceptor` usa `baseUrl` con `/api/v1` hardcodeado en lugar de `/api/v2`, aunque el contrato documenta v2 | `src/core/interceptors/hateoas.interceptor.ts` línea 9 | Actualizar el interceptor para detectar la versión de la ruta o usar una constante configurable; por ahora los `_links` de respuesta apuntan a v1 |
| H-P00-02 | Baja | **Resuelto en I02.** El filtro RFC 7807 no incluía `correlation_id` ni `timestamp` en el cuerpo del error. | `src/core/filters/rfc7807-exception.filter.ts` | El filtro ahora incluye ambos campos en todas las respuestas RFC 7807. |
| H-P00-03 | Baja | No hay parámetros de paginación `limit`/`cursor` en el middleware global; se verificará en cada módulo | `src/main.ts` — ausentes en nivel global | Verificar en módulos que usen paginación (atracciones, vuelos) si usan `limit`/`cursor` y documentarlo en los contratos respectivos |

---

## P01 — ESB y Sagas

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P01-01 | Alta | `EsbController` no declara ningún Guard de autenticación (`@UseGuards(SupabaseAuthGuard)` ausente tanto a nivel de clase como en los 5 métodos). Cualquier cliente anónimo puede disparar compras compuestas multivertical (`POST /esb/checkout-saga`), consultar detalles de cualquier Saga (`GET /esb/sagas/{correlationId}`), listar transacciones (`GET /esb/sagas`), consultar reservas de cualquier usuario (`GET /esb/aggregate/mis-reservas/{cliente}`) y extraer facturas fiscales con datos de contribuyentes (`GET /esb/aggregate/facturas/{facturaId}`). | `src/modules/esb/esb.controller.ts` líneas 6-54 | Añadir `@UseGuards(SupabaseAuthGuard)` con verificación de roles (`CLIENTE`, `ADMIN`) para proteger datos sensibles y mutaciones financieras. En el contrato se documenta `security: []` reflejando fielmente el código actual. |
| H-P01-02 | Media | **Resuelto en I05.** Soporte de idempotencia estricta en `POST /esb/checkout-saga` mediante almacenamiento en caché por `Idempotency-Key` y emisión de encabezado `Idempotent-Replayed: true` en peticiones repetidas. | `src/modules/esb/esb.controller.ts` | Manejo de idempotencia con almacenamiento y respuesta unificada sin re-ejecutar cobros ni reservas. |
| H-P01-03 | Media | `GET /esb/sagas/{correlationId}` devuelve una lista plana de registros relacionales (`saga_pasos_journal`), pero los requisitos de observabilidad de la cátedra (§6.5 y Semana 8) exigen un **Dashboard de Monitoreo Tipo Grafo** con semáforos por nodo (🟢/🟡/🔴) y árbol de spans W3C Trace Context (OpenTelemetry). | `src/modules/esb/interna/saga-orchestrator.service.ts` líneas 330-345 | Se documenta `GET /esb/sagas/{correlationId}/traza` con `x-status: planned` para transformar la bitácora relacional en estructura de nodos, aristas y spans jerárquicos consumibles por el dashboard React. |
| H-P01-04 | Media | **Resuelto en I05.** Los eventos del ciclo de vida de la Saga (`saga.started`, `saga.step.completed`, `saga.compensating`, `saga.compensated`, `order.confirmed`) se emiten formalmente hacia RabbitMQ (`booking.events`) a través de `KafkaRabbitBridgeService`. | `src/modules/esb/interna/saga-orchestrator.service.ts` | Emisión autoritativa de eventos de Saga hacia RabbitMQ con CloudEvents y trazabilidad W3C. |
| H-P01-05 | Baja | `GET /esb/sagas` solo acepta un parámetro numérico `limit` (default 20) sin validación de límite superior ni paginación formal por cursor/offset, ni metadatos de respuesta (`total`, `has_more`, `next_cursor`). | `src/modules/esb/esb.controller.ts` línea 37 y `saga-orchestrator.service.ts` línea 347 | Implementar paginación estandarizada por cursor o `limit`/`offset` con límite máximo de seguridad (ej. 100). |

---

## P02 — Pagos

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P02-01 | Alta | `PagosController` no protegía sus rutas. **Parcial en I06:** el acceso a referencias de pago está restringido a ADMIN/SERVICE o API key asociada al carrito, y la configuración del simulador exige ADMIN en producción; cobros, reembolsos e historial aún no tienen Guard. | `src/modules/pagos/pagos.controller.ts` | Completar la protección de cobros, reembolsos e historial con roles autenticados, manteniendo la compatibilidad v1 acordada. |
| H-P02-02 | Media | Los DTOs de entrada en `PagosController` carecían de tipado y validación. **Resuelto para Pagos en I06:** cobros, reembolsos y configuración usan DTOs `class-validator`; el ítem BL-012 sigue pendiente para Paquetes. | `src/modules/pagos/dto/pago.dto.ts` | Mantener validaciones positivas, UUIDs y lista de escenarios permitidos en Pagos; completar los DTOs de Paquetes en una tarea posterior. |
| H-P02-03 | Media | El frontend genera referencias de pago sintéticas aleatorias en el navegador (`pay_${uuid.slice(0,18)}`) sin consultar a `POST /pagos/procesar`. Por ende, los `paymentReference` enviados a las tiendas satélites (como vuelos) no existen en `schema_pagos.transacciones_pago`, impidiendo la validación B2B. | `frontend/src/components/FormularioReserva.jsx` línea 335, `ModalPostventa.jsx` línea 135, `ModalCambioFecha.jsx` línea 144 | Conectar el frontend con `POST /pagos/procesar` antes de llamar a las APIs satélites y utilizar el `transaccion_id` devuelto como `paymentReference`. |
| H-P02-04 | Media | **Parcial en I06:** `MS_PAG` publica `payment.completed` y `payment.refunded` en RabbitMQ (`booking.events`) con eventos sin datos de tarjeta. La réplica Kafka no se implementó en este alcance. | `src/modules/pagos/pagos.service.ts`, `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts` | Si se requiere réplica, conectar la publicación al bridge Kafka ya existente en una tarea posterior. |
| H-P02-05 | Media | **Resuelto en I06:** existe `GET /pagos/{paymentReference}` para ADMIN/SERVICE o API key de tienda limitada al `carrito_id` configurado. La respuesta incluye estado, montos, fecha y reservas asociadas, sin datos de tarjeta. | `src/modules/pagos/pagos.controller.ts`, `src/modules/pagos/pagos.service.ts` | Mantener la validación de propiedad de tienda y el esquema de respuesta sin datos de tarjeta. |

### Estado I06

| ID | Estado | Nota |
|---|---|---|
| H-P02-01 | Parcial | La consulta B2B y la configuración de simulador en producción están protegidas; cobros, reembolsos e historial siguen pendientes para no alterar autenticación preexistente de `/api/v1`. |
| H-P02-02 | Resuelto en Pagos | DTOs validados para cobro, reembolso, configuración y asociación; queda completar Paquetes en BL-012. |
| H-P02-04 | Parcial | Eventos publicados a RabbitMQ; replicación Kafka sigue fuera del alcance I06. |
| H-P02-05 | Resuelto | Consulta de referencia y asociación de reservas implementadas y probadas. |

---

## P03 — Paquetes y Promociones

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P03-01 | Alta | `PaquetesController` no declara Guards de autenticación (`@UseGuards(SupabaseAuthGuard)` ausente en la clase y métodos). Cualquier cliente anónimo en internet puede crear paquetes dinámicos arbitrarios (`POST /paquetes/dinamico`) o consultar condiciones comerciales privadas y acuerdos de descuento de los socios (`GET /paquetes/contratos`). | `src/modules/paquetes/paquetes.controller.ts` líneas 5-40 | Proteger el controlador con `SupabaseAuthGuard`. Requerir autenticación para creación de paquetes dinámicos y restringir la consulta detallada de contratos comerciales B2B a roles administrativos. |
| H-P03-02 | Media | El cuerpo de `POST /paquetes/dinamico` no está tipado ni validado (`@Body() dto: any`), careciendo de validaciones de `class-validator` para número mínimo de ítems, precios positivos, tipos de vertical, etc. | `src/modules/paquetes/paquetes.controller.ts` línea 37 | Crear la clase DTO formal `CrearPaqueteDinamicoDto` con decoradores `@IsArray`, `@ArrayMinSize(2)`, `@ValidateNested`, etc. y activar `ValidationPipe`. |
| H-P03-03 | Media | Inexistencia de endpoint para actualizar o sincronizar los contratos de promociones en Booking (`PUT /paquetes/contratos/{proveedorCodigo}`). Actualmente solo existe `GET /paquetes/contratos`; los acuerdos comerciales deben ser insertados por seed SQL o directamente en base de datos, impidiendo la sincronización automática cuando las tiendas socias actualizan sus condiciones en `PUT /{vertical}/promociones/contrato`. | `src/modules/paquetes/paquetes.controller.ts` (ausente) | Se diseñó la ruta planificada `PUT /paquetes/contratos/{proveedorCodigo}` (`x-status: planned`) en el contrato OpenAPI para habilitar la sincronización B2B. |
| H-P03-04 | Baja | Discrepancia con el modelo objetivo de `Faltantes RDA2`: El diseño objetivo contemplaba la tabla `schema_paquetes.paquete_versiones` (`PaqueteVersion`) para versionado histórico y auditoría de cambios. El código actual no implementa esta entidad; la inmutabilidad se preserva fijando directamente los importes calculados en las columnas `precio_base_total`, `descuento_combo_pct` y `precio_final_paquete` de `schema_paquetes.paquetes`. | `src/modules/paquetes/entities/` vs `Faltantes RDA2/src/modules/promotions-packages/entities/paquete-versiones.entity.ts` | Si en el futuro se requiere auditoría de modificaciones a combos existentes, incorporar la entidad `PaqueteVersion`; para el flujo actual de paquetes creados una sola vez, la persistencia inmutable directa es suficiente. |

---

## P04 — Finanzas

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P04-01 | Media | Solapamiento y duplicidad funcional entre `FinanzasController` (`/finanzas/*`, `MS_FIN`) y `AdminFinanzasService` (`/admin/finanzas`, `/admin/payouts`): El repositorio implementa dos motores de liquidaciones paralelos. `MS_FIN` opera sobre `schema_finanzas` con períodos quincenales (`Q1`/`Q2`) y es consumido por el Panel 4 RDA2 (`Panel4_LiquidacionesFinanzas.jsx`), mientras que `AdminFinanzasService` recalcula métricas agregadas al vuelo cruzando tablas de otras verticales y persistiendo en `panel_liquidaciones` con cortes mensuales (`YYYY-MM`) para `AdminDashboard.jsx`. | `src/modules/finanzas/finanzas.controller.ts` vs `src/modules/admin/admin-finanzas.service.ts` | Consolidar la lógica financiera exclusivamente en `MS_FIN`, migrando las consultas del `AdminDashboard` a `/finanzas/resumen` y eliminando la dependencia cruzada entre módulos. |
| H-P04-02 | Media | Los reembolsos procesados en `MS_PAG` no se debitan automáticamente de las liquidaciones quincenales en `schema_finanzas.liquidaciones_proveedores`. Si una orden es compensada por la Saga, la liquidación quincenal acumulada del socio no refleja el descuento del reembolso, generando riesgo de sobrepago al proveedor si no se concilia manualmente. | `src/modules/finanzas/finanzas.service.ts` (ausencia de método para procesar notas de crédito o reversos) | Incorporar en `FinanzasService` un método `registrarReembolsoYDescontarComision()` que descuente el importe reembolsado de la liquidación quincenal pendiente del socio. |
| H-P04-03 | Baja | `POST /finanzas/liquidaciones/:id/pagar` no valida idempotencia ante liquidaciones que ya fueron pagadas: al recibir una petición repetida, sobrescribe la fecha de pago y el comprobante sin advertir o rechazar la duplicidad. | `src/modules/finanzas/finanzas.service.ts` líneas 124-133 | Verificar si `liquidacion.estado === 'PAGADO'` y devolver el comprobante existente sin modificar la fecha de pago histórica. |

---

## P05 — Facturación

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P05-01 | Alta | Discrepancia crítica entre contrato v1 y código real: El contrato `facturacion-openapi.yaml` (v1) definía 5 endpoints (`POST /facturas`, `GET /facturas`, `GET /facturas/{id}`, `GET /facturas/{id}/pdf`, `PATCH /facturas/{id}/anular`), pero `FacturasController` solo expone una única ruta: `POST /facturas/enviar`. No existe ningún endpoint en el controlador para emitir facturas en base de datos, listar comprobantes del usuario ni anularlas. | `src/modules/facturas/facturas.controller.ts` líneas 18-56 vs `contracts/facturacion-openapi.yaml` | Clasificar en el contrato v2 la ruta `POST /facturas/enviar` como `implemented` y las rutas v1 no implementadas como `planned` (soportadas por las entidades `Factura` y `FacturaItem`), evitando inducir a error a los consumidores del API. |
| H-P05-02 | Media | Inconsistencia en la generación de comprobantes y validez legal: El documento PDF no es generado en el backend; se construye en el navegador del cliente mediante la librería `jsPDF` (`frontend/src/utils/facturaPdf.js`), la cual genera una clave de acceso sintética de 49 dígitos con números aleatorios (`generarClaveAcceso()`) y un secuencial ficticio (`001-002-XXXXXXXXX`). El backend actúa únicamente como relay de transporte SMTP (`POST /facturas/enviar`). | `frontend/src/utils/facturaPdf.js` líneas 38-43 y 75-76; `frontend/src/services/facturasApi.js` líneas 15-18 | Desarrollar en `MS_FAC` un motor de renderizado server-side (`GET /facturas/{id}/pdf`) que genere PDFs consistentes basados en los registros de `schema_facturacion` y que se integre con los servicios de firma electrónica y autorización del SRI. |
| H-P05-03 | Media | Desconexión entre persistencia relacional y flujos de compra: Existen las tablas `schema_facturacion.facturas_encabezado` y `facturas_detalle` y las entidades TypeORM `Factura` y `FacturaItem`, y el ESB dispone de un ensamblador (`GET /esb/aggregate/facturas/{facturaId}`), pero ningún flujo transaccional (ni la Saga de checkout en `SagaOrchestratorService`, ni el módulo de pagos, ni listeners de eventos) inserta filas en estas tablas al concretar una compra. | `src/modules/esb/interna/saga-orchestrator.service.ts` (sin llamadas a facturación) y `src/modules/facturas/facturas.service.ts` | Conectar la emisión de facturas como un paso en la Saga de checkout multivertical o suscribir a `MS_FAC` a los eventos de dominio (`booking.ticket_issued`, `order.confirmed`) para poblar automáticamente `schema_facturacion`. |
| H-P05-04 | Baja | Discrepancia en la documentación histórica de cambios: `contracts/CAMBIOS_CONTRATOS.md` afirmaba que el contrato v1 de facturación estaba completo y cubría los criterios C04, C06 y C07 ("Diseño API-First... contrato define la interfaz antes de la implementación"), omitiendo documentar que ninguno de los endpoints declarados de persistencia o consulta fiscal había sido implementado en el backend NestJS. | `contracts/CAMBIOS_CONTRATOS.md` líneas 21-70 y 164-170 | Actualizar la bitácora de contratos dejando constancia explícita de la brecha entre el contrato prospectivo v1 y la implementación real del código para la evaluación RDA2. |

---

## P06 — Clientes, identidad y sesión

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P06-01 | Alta | Contrato v1 ficticio vs arquitectura real delegada en Supabase Auth: El contrato `clientes-openapi.yaml` (v1) documentaba endpoints como `/register`, `/auth/token`, `/me` asumiendo que el backend de Booking era un IdP emisor de JWTs. En la realidad, el backend no expone ningún controlador de clientes; el frontend gestiona el registro y login directamente contra Supabase Auth SDK (`supabase.auth.*`), y el backend se limita a validar los JWTs mediante `SupabaseAuthGuard`. | `contracts/clientes-openapi.yaml` vs `frontend/src/pages/LoginPage.jsx` y `RegisterPage.jsx` | Clasificar las operaciones de autenticación de clientes como `delegated` (Supabase Auth) y las operaciones de auditoría como `implemented` (`AdminController`), marcando las rutas v1 como obsoletas/reemplazadas. |
| H-P06-02 | Media | Lista de administradores fija en código duro (`ADMIN_EMAILS`): En `src/core/auth/administradores.ts` línea 14, los correos de administración (`admin@booking.com`, `alejandroflores@booking.com`) están fijados estáticamente en el código TypeScript en lugar de consultarse desde la base de datos relacional o variables de entorno. Cualquier alta o baja de superadministrador exige modificar código fuente y re-desplegar la aplicación. | `src/core/auth/administradores.ts` líneas 14 y 24-27 | Centralizar la asignación de administradores exclusivamente en `app_metadata.role` de Supabase Auth o mediante la tabla relacional `schema_clientes.clientes`, manteniendo `ADMIN_EMAILS` solo como un fallback de emergencia durante el arranque. |
| H-P06-03 | Alta | Riesgo de escalamiento de privilegios por bypass técnico de roles (`X-Role`): `SupabaseAuthGuard` (`src/core/guards/supabase-auth.guard.ts` líneas 50-59) acepta la cabecera HTTP no autenticada `X-Role` (incorporada para evaluación académica RDA2 §5) si falta `Authorization`, inyectando cualquier rol arbitrario en `req.user` sin verificar firma criptográfica. Si la API se expone públicamente sin un reverse proxy que purgue dicha cabecera, un atacante anónimo podría acceder a paneles administrativos (`ADMIN` o `MANTENIMIENTO`) simplemente enviando `X-Role: admin`. | `src/core/guards/supabase-auth.guard.ts` líneas 50-59 | Deshabilitar el bypass de `X-Role` en entornos de producción (`process.env.NODE_ENV === 'production'`) o restringirlo estrictamente a conexiones originadas desde `localhost`. |

---

## P07 — Administración

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P07-01 | Media | Tres rutas divergentes para conmutar kill-switches de nodos: El backend implementa tres endpoints distintos para activar/desactivar conectores de proveedores: 1) `POST /admin/nodes/:serviceId/toggle` (`AdminController`), que altera el estado en memoria en `ConnectorHealthService` (consumido por `AdminDashboard.jsx`); 2) `POST /nodes/:codigoNodo/toggle` (`NodesController`), que actualiza el flag `activo` en la tabla `schema_admin.nodos_conectores` (consumido por `Panel1_NodosProveedores.jsx`); y 3) `POST /admin/nodes/:codigoNodo/toggle-killswitch` (`NodesController`), que sincroniza ambos estados. Esta dispersión genera desalineación entre paneles si el administrador usa un dashboard u otro. | `src/modules/admin/admin.controller.ts` l. 81 vs `src/modules/nodes/nodes.controller.ts` l. 35 y 47; `frontend/src/pages/AdminDashboard.jsx` vs `Panel1_NodosProveedores.jsx` | Unificar el control de kill-switches en una sola ruta canónica (`POST /admin/nodes/{id}/toggle`), asegurando que actualice atómicamente la base de datos `nodos_conectores` y refresque el mapa en memoria de `ConnectorHealthService`. |
| H-P07-02 | Media | Solapamiento y doble cómputo en liquidaciones a proveedores: `AdminFinanzasService` (`/admin/finanzas`, `/admin/payouts`) calcula agregados y registra pagos mensuales en la tabla `panel_liquidaciones` cruzando en caliente tablas de reservas, mientras que `FinanzasService` (`MS_FIN`, `/finanzas/liquidaciones`) gestiona liquidaciones quincenales formales en `schema_finanzas.liquidaciones_proveedores`. Los dos motores no comparten estado transaccional, por lo que marcar un payout como pagado en `/admin/payouts/aprobar` no impacta el estado de `MS_FIN`. | `src/modules/admin/admin-finanzas.service.ts` líneas 33-145 vs `src/modules/finanzas/finanzas.service.ts` líneas 65-140 | Delegar todo el procesamiento de liquidaciones y pagos de proveedores a `MS_FIN`, transformando `AdminFinanzasService` en un cliente que consuma las APIs de `FinanzasService`. |
| H-P07-03 | Baja | Ausencia de soporte para cabecera `Idempotency-Key` en operaciones mutantes administrativas: Rutas críticas como `PUT /admin/reservas/{tipo}/{id}/cancelar` y `POST /admin/payouts/aprobar` no aceptan ni validan la cabecera `Idempotency-Key`. En caso de desconexión o reintento de red desde el frontend de administración, podrían dispararse dobles aprobaciones o inconsistencias en los estados auditados. | `src/modules/admin/admin.controller.ts` líneas 155-161 y 201-207 | Incorporar el parámetro opcional `Idempotency-Key` en las mutaciones administrativas críticas y registrar el token en la traza de auditoría física forense. |
| H-P07-04 | Baja | Reenvío de comprobantes de reserva simulado: El endpoint `PUT /admin/reservas/{tipo}/{id}/reenviar` responde `{ success: true, message: 'Comprobante reenviado exitosamente a ...' }`, pero en el backend (`AdminService.reenviarComprobante`) no invoca ningún servicio de correo (como `MailerService` o `FacturasService.enviarFactura`), constituyendo un mock operacional. | `src/modules/admin/admin.service.ts` líneas 315-325 | Conectar `reenviarComprobante` con `FacturasService` o el transporte de notificaciones para despachar efectivamente el PDF o correo de confirmación al usuario. |

---

## P08 — Nodos, telemetría e inventario

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P08-01 | Alta | **Resuelto en I01:** Kill-switch público sin autenticación en `POST /nodes/{codigoNodo}/toggle`. | `src/modules/nodes/nodes.controller.ts` — `toggleNodePublic` ahora exige autenticación y rol `ADMIN` o `MANTENIMIENTO`; el frontend usa `/admin/nodes/{codigoNodo}/toggle-killswitch`. | Mantener la ruta compatible, pero protegida; validar 401/403 y acceso con rol autorizado. |
| H-P08-02 | Alta | **Resuelto en I01:** Operaciones administrativas de infraestructura expuestas públicamente en `/nodes`. | `src/modules/nodes/nodes.controller.ts` — creación, actualización, eliminación, ping y sync tienen guards y roles administrativos. | Mantener autenticación Supabase y RBAC; `GET /nodes` continúa público. |
| H-P08-03 | Media | Persistencia sincrónica de telemetría en PostgreSQL en lugar de Apache Kafka: `TelemetryService.trackEvent` persiste los eventos del frontend (`telemetry_events`) ejecutando directamente sentencias SQL `INSERT` contra la base de datos relacional de PostgreSQL. Esto contradice el lineamiento arquitectónico de la cátedra (Semana 8: "RabbitMQ para transacciones, Kafka para telemetría masiva y analítica"), introduciendo contención de I/O y riesgo de saturación del pool de conexiones ante ráfagas de usuarios. | `src/modules/telemetry/telemetry.service.ts` líneas 27-60 y 70-90 | Migrar la ingesta de telemetría para que publique los eventos en un topic particionado de Apache Kafka (`booking.telemetry.events`), desacoplando la persistencia en base de datos mediante un consumidor en streaming. |
| H-P08-04 | Media | **Pendiente tras I01:** Tres implementaciones divergentes de Kill-Switches; el panel Panel 1 ya usa la ruta protegida canónica `/admin/nodes/:codigoNodo/toggle-killswitch`, pero `AdminController` aún mantiene un toggle distinto en memoria. | `src/modules/nodes/nodes.controller.ts` vs `src/modules/admin/admin.controller.ts` | Unificar los tres estados y rutas en otra tarea; I01 no cambia la lógica de almacenamiento ni elimina rutas existentes. |
| H-P08-05 | Baja | **Resuelto en I01:** `POST /telemetry/events` ahora aplica DTO estricto con lista blanca, máximo de 8 KiB para `properties`, cuerpo máximo de 16 KiB y rate limit configurable por IP/sesión (60/minuto por defecto). | `src/modules/telemetry/telemetry.controller.ts`, `dto/telemetry-event.dto.ts`, `telemetry-body-size.interceptor.ts`, `telemetry-rate-limit.guard.ts` | Mantener los límites configurados mediante `.env.example` y monitorizar ajustes por ambiente. |
| H-P08-06 | Baja | **Resuelto en I01:** `GET /inventory` y `GET /inventory/status` requieren rol `ADMIN` o `MANTENIMIENTO`. | `src/modules/inventory/inventory-grpc.controller.ts` | Conservar RBAC y documentar los errores 401/403 en el contrato. |

### Estado de implementación I01

| ID | Estado | Nota |
|---|---|---|
| H-P08-01 | Resuelto | Toggle público protegido por roles. |
| H-P08-02 | Resuelto | Rutas mutantes y acciones de infraestructura protegidas. |
| H-P08-03 | Pendiente | Migración de persistencia PostgreSQL a Kafka queda fuera del alcance de I01. |
| H-P08-04 | Parcial | Panel 1 usa la ruta protegida canónica; quedan rutas divergentes y unificación de estado. |
| H-P08-05 | Resuelto | Validación, límite de cuerpo y rate limit implementados. |
| H-P08-06 | Resuelto | Consultas REST de inventario restringidas por RBAC. |

H-P06-03 queda resuelto en I01: los headers de evaluación `X-Role` y `X-Admin-Key` son rechazados en producción y su uso local requiere modo de pruebas o `SECURITY_ALLOW_TEST_AUTH=true` desde loopback.

---

## P09 — Receptor de webhooks de las tiendas

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P09-01 | Alta | Inexistencia de receptor de webhooks inbound en Booking: A pesar de que los contratos v2 de Vuelos, Autos y Atracciones estipulan que notificarán hechos de dominio mediante callbacks HTTP firmados con HMAC-SHA256 (ej. `POST https://.../api/v2/webhooks/vuelos`), el backend NestJS no tiene implementado ningún controlador, middleware ni endpoint para recibir dichos eventos. Booking queda ciego ante cancelaciones de vuelos, emisión asíncrona de tickets y alertas de mantenimiento. | `contracts/vuelos-openapi-v2.yaml` líneas 1405-1445 y 3249 vs `src/` (búsqueda de rutas webhook inbound) | Implementar en `src/modules/webhooks/` el receptor canónico diseñado en `webhooks-inbound-openapi-v2.yaml` (`POST /webhooks/{vertical}`), delegando el procesamiento asíncrono hacia colas de RabbitMQ. |
| H-P09-02 | Alta | Ausencia de almacenamiento para el secreto compartido de webhooks (`webhook_secret`): La entidad `ConfigProveedor` (`src/modules/nodes/entities/config-proveedor.entity.ts`, tabla `schema_proveedores.config_proveedor`) no contempla columnas para almacenar el secreto criptográfico del socio (`webhook_secret`) ni las URLs de suscripción. Sin este almacenamiento, el Gateway no puede verificar criptográficamente la cabecera `X-Webhook-Signature` por cada proveedor. | `src/modules/nodes/entities/config-proveedor.entity.ts` líneas 5-63 | I07 usa la alternativa permitida de secreto referenciado por variables de entorno `WEBHOOK_SECRET_{VERTICAL}`; no persiste claves ni URLs en `ConfigProveedor`. |
| H-P09-03 | Media | Discrepancia semántica y falta de estandarización en nombres de eventos CloudEvents entre tiendas: Las verticales utilizan nomenclaturas heterogéneas para el campo `type` de CloudEvents (ej. Vuelos: `ec.edu.epn.booking.vuelos.booking.ticket_issued`; Autos: `auto.order.confirmed`; Atracciones: `atraccion.order.confirmed`), lo que obliga a Booking a mantener tablas de traducción y adaptadores específicos para cada socio. | `contracts/vuelos-openapi-v2.yaml` l. 3222 vs `contracts/autos-openapi-v2.yaml` l. 438 | Establecer en la gobernanza de integración un prefijo semántico común `com.booking.{vertical}.{entidad}.{accion}` y utilizar la tabla de equivalencias de P09 como puente de compatibilidad. |
| H-P09-04 | Baja | Ausencia de cabecera `Idempotent-Replayed` en el backend para reintentos de red: Ningún controlador del Gateway emite la cabecera HTTP estándar `Idempotent-Replayed: true` cuando se detecta un evento repetido, impidiendo que el worker emisor del socio identifique con certeza si la respuesta corresponde a un evento nuevo o a una deduplicación idempotente. | `src/core/filters/` y controladores varios | Incorporar en el interceptor de idempotencia la inyección de `Idempotent-Replayed: true` en respuestas 200 OK ante peticiones con hash o `id` repetido. |

### Estado I07

| ID | Estado | Resultado |
|---|---|---|
| H-P09-01 | Resuelto | `POST /api/v2/webhooks/{vertical}` valida HMAC/CloudEvent, persiste la entrega y publica el evento a RabbitMQ; el historial `GET` exige ADMIN. |
| H-P09-02 | Resuelto con alternativa | Se usan secretos por vertical referenciados en entorno; no se almacenan secretos en BD. La migración añade solo la bitácora de entregas. |
| H-P09-03 | Pendiente | Se conserva el `type` enviado por cada socio para compatibilidad; la normalización de nomenclatura requiere acuerdo entre equipos. |
| H-P09-04 | Resuelto | Un evento repetido recibe HTTP 200 y `Idempotent-Replayed: true`. |

---

## P11 — Eventos asíncronos

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P11-01 | Media | Desconexión entre el orquestador de Sagas y el Event Bus dual: `SagaOrchestratorService` gestiona el checkout compuesto persistiendo el journal en `schema_auditoria.saga_transacciones` y `saga_paso_journal`, pero no inyecta `KafkaRabbitBridgeService` ni emite los eventos del ciclo de vida (`saga.compensate`, `order.confirmed`, `topic-auditoria-sagas`) hacia RabbitMQ o Kafka. El bus de eventos no se entera en tiempo real del progreso de las Sagas. | `src/modules/esb/interna/saga-orchestrator.service.ts` líneas 33-43 (constructor sin EventBus) | Inyectar `KafkaRabbitBridgeService` en `SagaOrchestratorService` y disparar `bridgeEvent` en cada transición de estado de la Saga (`IN_PROGRESS`, `COMPENSATING`, `COMPENSATED`, `COMPLETED`). |
| H-P11-02 | Media | Divergencia de nomenclatura de colas y tópicos entre el código y el Blueprint (§7.2/§7.3): El código usa prefijos `q.*` (`q.busquedas.masivas`, `q.ordenes.confirmadas`, `q.sagas.compensacion`, `q.stock.actualizado`) y tópicos Kafka como `topic-ordenes-b2b`, mientras que el Blueprint §7 define `eventos.busquedas` (`busqueda.catalogo.*`), `ordenes.confirmadas` (`orden.factura.confirmada`) y `booking.compras.audit`. | `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts` l. 13-18 vs `ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md` §7.2 | Declarar en RabbitMQ los nombres del Blueprint como bindings alternativos en el Topic Exchange para permitir compatibilidad y migración fluida. |
| H-P11-03 | Baja | **Resuelto en I04.** Implementado `RabbitMqConsumerService` y `EventConsumerIdempotencyService` con soporte de deduplicación de CloudEvents, 3 reintentos con backoff exponencial y despacho a Dead Letter Queue (`q.dead_letter`). | `src/modules/event-bus/consumer/rabbitmq-consumer.service.ts` | Implementados consumidores e idempotencia en NestJS para colas autoritativas y aislamiento en DLQ. |
| H-P11-04 | Baja | **Resuelto en I02.** `RabbitMqEventBusService.publish` no inyectaba el contexto de correlación en las cabeceras AMQP. | `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts` | La publicación incluye `correlation_id` y `headers` con `x-correlation-id`, `traceparent` y `node_id`; el envelope conserva el payload previo y añade atributos CloudEvents. |

---

## P12 — gRPC de inventario

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P12-01 | Media | Coexistencia de versiones divergentes de Protobuf en el repositorio: El microservicio gRPC en ejecución (`src/main.ts`) carga `src/proto/inventory.proto` (paquete `inventory`, servicio `InventoryStockService` con 2 RPCs), mientras que en `Faltantes RDA2/src/proto/v1/` existe una especificación incompatible (`booking.inventory.v1`, servicio `InventoryService` con 4 RPCs y tipos comunes `v1/common.proto`), la cual además contiene artefactos de copiado (`EOF\necho "ok"`) que impiden su compilación. | `src/main.ts` líneas 144-164 vs `Faltantes RDA2/src/proto/v1/inventory.proto` líneas 3-32 y 112-113 | Adoptar formalmente la especificación `contracts/grpc/inventory-v2.proposed.proto` como contrato objetivo y eliminar o limpiar los archivos huérfanos de `Faltantes RDA2`. |
| H-P12-02 | Alta | Microservicio gRPC sin autenticación ni validación de credenciales: `InventoryGrpcController` (`src/modules/inventory/inventory-grpc.controller.ts`) expone las RPCs `PushStockUpdate` y `StreamInventoryChanges` en el puerto 50051 sin interceptores gRPC (`GrpcAuthGuard` o interceptor de metadata). Cualquier cliente con acceso TCP a la red puede inyectar o modificar el stock disponible sin presentar `x-api-key` ni token válido. | `src/modules/inventory/inventory-grpc.controller.ts` líneas 1-68 (sin `@UseGuards` ni validación de metadata) | Implementar un interceptor gRPC en NestJS que verifique la cabecera metadata `x-api-key` contra la tabla `schema_proveedores.config_proveedor` antes de delegar la ejecución a `InventoryService`. |
| H-P12-03 | Media | Endpoints REST de inventario no estandarizados ni unificados con la API v2: `InventoryGrpcController` expone `GET /inventory` y `GET /inventory/status` (sin prefijo de versión y duplicando la observabilidad de `MS_STK` documentada en `observabilidad-openapi-v2.yaml` bajo `/api/v2/inventory`), generando ambigüedad entre controladores de NestJS. | `src/modules/inventory/inventory-grpc.controller.ts` líneas 73-92 | Trasladar la consulta del inventario sincronizado a un módulo REST dedicado con prefijo `/api/v2/inventory` y separar estrictamente el controlador gRPC del controlador HTTP. |
| H-P12-04 | Media | Riesgo de incompatibilidad de puerto secundario gRPC (puerto 50051) en hosting Render: En los planes web estándar de Render, la plataforma enruta únicamente el tráfico HTTP público del puerto 443 hacia `process.env.PORT` (3000), bloqueando o no publicando el puerto secundario 50051 hacia Internet. Sin configuración de red privada o servicio privado Docker, los socios externos no podrán conectarse vía gRPC. | `src/main.ts` líneas 152-164 (`grpcPort = 50051`) vs arquitectura Render Web Services | Documentar en la guía de integración la alternativa de endpoint REST equivalente (`POST /api/v2/inventory/stock`) y evaluar el despliegue de Booking como Render Private Service o con gRPC-Web / túnel de red. |

---

## P13 — GraphQL (gateway cliente)

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P13-01 | Alta | Mutaciones transaccionales y queries privadas de GraphQL sin guard de autenticación ni RBAC: `GraphqlBffResolver` expone consultas de información privada del cliente (`misReservas`) y mutaciones con severo impacto financiero (`checkoutOrquestado`, `cancelarReservaConSaga`, `realizarCheckInDigital`) sin guards de autenticación (`SupabaseAuthGuard` o `GqlAuthGuard`). Solo aplica `GqlThrottlerGuard` (limitador de tasa por IP), permitiendo que usuarios no autenticados ejecuten compras, cancelen reservas ajenas o consulten reservas de terceros arbitrariamente. | `src/modules/graphql/graphql-bff.resolver.ts` líneas 13-98 | Implementar un `GqlAuthGuard` que extraiga y valide el Bearer JWT de Supabase desde `context.req.headers.authorization`, inyectando la identidad del usuario y exigiendo rol `CLIENTE` o `ADMIN` en cada resolver. |
| H-P13-02 | Media | Playground e introspección de GraphQL habilitados incondicionalmente en producción: En `src/modules/graphql/graphql-bff.module.ts`, la configuración de `GraphQLModule.forRoot<ApolloDriverConfig>` define de forma estática `playground: true`, sin verificar si el entorno es productivo (`process.env.NODE_ENV !== 'production'`). Esto expone la consola interactiva de Apollo y la introspección completa del esquema a cualquier visitante público en `POST /graphql`. | `src/modules/graphql/graphql-bff.module.ts` línea 25 (`playground: true`) | Parametrizar `playground: process.env.NODE_ENV !== 'production'` e `introspection: process.env.NODE_ENV !== 'production'` para salvaguardar el esquema en despliegues reales. |
| H-P13-03 | Media | Tipado débil mediante JSON strings sin validación de esquema en `metadata_json` y `detallesReservaJson`: Los modelos `CatalogoItemModel` y `CheckoutItemInput` emplean campos tipo `String` que contienen JSON serializado y son parseados manualmente con `JSON.parse()` en el servicio, perdiendo los beneficios del tipado estricto, autocompletado y validación sintáctica que ofrece GraphQL SDL. | `src/modules/graphql/models/catalogo.model.ts` l. 36 y `checkout.model.ts` l. 21 | Definir tipos `input` específicos por vertical (ej. `DetalleReservaAtraccionInput`, `DetalleReservaAutoInput`) como `union` o `Scalar JSON` tipado con validadores de esquema. |
| H-P13-04 | Baja | Inexistencia de arquitectura federada (Reto 3 - Supergrafo): El API Gateway opera como un monolito BFF que consulta tablas SQL locales directamente para las 4 verticales en lugar de componer un supergrafo federado con subgrafos distribuidos por tienda mediante Apollo Federation v2. | `src/modules/graphql/graphql-bff.service.ts` líneas 43-157 vs `ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md` §8.2 / §9.2 | Planificar la migración a Apollo Federation v2 asignando directivas `@key` en cada microservicio y utilizando Apollo Router como punto de entrada unificado. |

---

## P16 — Carrito de compras (MS_CAR)

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P16-01 | Alta | Inexistencia del microservicio `MS_CAR` en el backend NestJS: A pesar de que el Blueprint (§4, §5.2, §5.4) y el script maestro de base de datos (`schema_carritos.carritos`, `schema_carritos.carrito_items`) definen formalmente el microservicio de Carrito de Compras (`MS_CAR`), en `src/modules/` no existe ninguna implementación de `CarritosModule`, `carritos.controller.ts`, ni `carritos.service.ts`. | `src/modules/` (ausencia del directorio `carritos`) vs `ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md` §5.4 | Implementar el módulo `CarritosModule` en NestJS siguiendo el contrato OpenAPI `contracts/carritos-openapi-v2.yaml` y mapeando las entidades TypeORM a `schema_carritos`. |
| H-P16-02 | Alta | Carrito volátil e inseguridad de precios transmitidos por el cliente: El carrito opera únicamente como estado efímero en memoria del frontend (React) y como arreglos planos transmitidos a GraphQL (`checkoutOrquestado`) y al ESB (`POST /esb/checkout-saga`). El backend no realiza snapshotting inmutable en base de datos ni recalcula los precios de forma autoritativa, confiando en los importes monetarios enviados por el navegador. | `src/modules/esb/interna/saga-orchestrator.service.ts` l. 18-25 (`items` en DTO sin validar contra BD) | Forzar que `POST /esb/checkout-saga` reciba un `carrito_id` o que el backend valide y congele el precio consultando el catálogo de cada vertical antes de aceptar el ítem. |
| H-P16-03 | Media | Imposibilidad de disparar el evento de dominio `carritos.abandonados`: Sin un servicio que persista la marca temporal `updated_at` de los carritos en `schema_carritos.carritos`, el sistema no puede detectar inactividad (umbral de 2 horas) ni emitir el CloudEvent `carritos.abandonados` hacia RabbitMQ y Kafka para remarketing y analítica. | `src/modules/event-bus/` (sin emisor de `carritos.abandonados`) | Programar un worker o cron job en NestJS que escanee periódicamente `schema_carritos.carritos` y emita el CloudEvent canónico ante inactividad > 2h. |
| H-P16-04 | Media | Ausencia de sincronización multidispositivo para el cliente: Al no persistirse el carrito activo bajo el identificador del usuario (`cliente_id`), un cliente autenticado que agregue productos en su teléfono móvil o en una sesión web diferente pierde sus ítems en cola de compra. | `frontend/src/` (estado local sin llamadas a `/carritos`) | Integrar el frontend con `GET /api/v2/carritos/activo` y `POST /api/v2/carritos/{id}/items` para sincronizar el estado del carrito en la nube. |

---

## P17 — Auditoría transaccional (MS_AUD)

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P17-01 | Alta | Inexistencia del microservicio `MS_AUD` dedicado en `src/modules/`: Aunque `schema_auditoria` (`auditoria_transaccional`, `saga_transacciones`, `saga_pasos_journal`) está definido en la migración maestra y el blueprint §5.2/§5.4 estipula el microservicio `MS_AUD`, no existe un módulo `AuditoriaModule` ni endpoints `/auditoria/**`. La funcionalidad de auditoría está dispersa entre `AdminAuditService` (que lee logs en disco) y llamadas ad-hoc de TypeORM en `SagaOrchestratorService`. | `src/modules/` (ausencia de `auditoria.module.ts`) vs `ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md` §5.4 | Implementar el módulo `AuditoriaModule` en NestJS exponiendo los endpoints diseñados en `contracts/auditoria-openapi-v2.yaml`. |
| H-P17-02 | Alta | Falta de persistencia de transacciones de compra en `schema_auditoria.auditoria_transaccional`: Al confirmarse una orden en `SagaOrchestratorService` o emitirse un pago en `PagosService`, el sistema no persiste el registro de compra ("quién compró", `cliente_id`, monto, IP, `correlation_id`) en `schema_auditoria.auditoria_transaccional`. Las consultas del panel de auditoría dependen de escanear tablas de reservas de esquemas ajenos (`schema_vuelos.vuelos_reservas`, `schema_autos.autos_reservas`), violando el principio de Database-per-Service. | `src/modules/admin/admin-audit.service.ts` líneas 107-115 (SELECTs a tablas de reservas) | Inyectar un repositorio o evento para asentar en `schema_auditoria.auditoria_transaccional` cada compra confirmada de forma centralizada. |
| H-P17-03 | Media | Desconexión del consumidor de Apache Kafka (`cg-audit-analytics`): El flujo previsto en el Blueprint §7.4 donde el consumidor de Kafka lee `booking.compras.audit` / `topic-ordenes-b2b` y persiste asíncronamente en `schema_auditoria.auditoria_transaccional` no está implementado en `src/modules/event-bus/`. | `src/modules/event-bus/kafka/kafka-event-bus.service.ts` líneas 1-80 (solo productor, sin consumidor) | Implementar el grupo de consumidores Kafka `cg-audit-analytics` para escuchar los tópicos de compras y alimentar la tabla de auditoría en background. |
| H-P17-04 | Media | Ausencia de snapshots estructurados de cambios administrativos en base de datos: Cuando un administrador cambia configuraciones (`updateConfig`) o commuta kill-switches (`toggleNode`), los cambios se asientan solo en archivos físicos `.log` mediante `WinstonPhysicalLoggerService`, pero no en `schema_auditoria` con comparativas tipadas `antes/despues` para trazabilidad forense por SQL. | `src/modules/admin/admin.controller.ts` l. 46-52 y l. 226 | Modificar `AdminAuditService.registrar` para persistir también en `schema_auditoria.auditoria_transaccional` cuando la acción provenga de un operador `ADMIN`. |

## P15 — Vuelos v2.0.1

| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P15-01 | Alta | Las rutas implementadas de vuelos no aplican un guard de autenticación, aunque el contrato documenta OAuth2 de partner para proteger las operaciones privadas. El contrato conserva las dos capas de seguridad solicitadas; el backend actual no impone la capa de servicio a servicio. | `src/modules/vuelos/vuelos.controller.ts` línea 120 y métodos 137-790; no hay uso de `@UseGuards` en el controlador | Aplicar validación de token de partner en el gateway o controlador antes de exponer las rutas privadas, manteniendo la capa de identidad del usuario en Booking. |

## Seguimiento I03 — Logs JSON Lines

| Hallazgo / Estado | Evidencia | Resultado |
|---|---|---|
| No existía una implementación de logging HTTP por petición registrada en `src/` o `database/`. | Búsqueda de `api_request_logs`, `request_log` y `RequestLog`: sin escrituras; los únicos matches son `DROP TABLE` históricos de la tabla. | Resuelto por I03: middleware escribe cada respuesta HTTP en archivos JSONL con correlación; no se agregó persistencia de logs a base de datos. |
| H-P17-01..04 | Auditoría transaccional `MS_AUD` y snapshots administrativos son distintos de logs técnicos de petición. | Permanecen sin cambios y no se marcan resueltos por I03. |
