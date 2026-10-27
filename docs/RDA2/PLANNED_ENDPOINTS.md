# Endpoints Planificados (`x-status: planned`) — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Marketplace Agregador Central)  
> **Documento:** Inventario de Endpoints Planificados y Brechas de Implementación  
> **Fase:** Transición de Contratos (P00–P17) a Implementación (I01–I12)  
> **Total de Endpoints Planificados:** 28 operaciones

---

## 1. Resumen Ejecutivo

Durante la fase de diseño y formalización de contratos v2 (P00–P17), se aplicó el principio rector: **documentar fielmente lo que el código hace como `implemented` y clasificar como `planned` aquellos endpoints requeridos por el Blueprint Arquitectónico o las especificaciones de negocio que aún no cuentan con soporte en los controladores NestJS**.

Este documento consolida las **28 operaciones planificadas** identificadas a lo largo de los contratos OpenAPI v2 de Booking, categorizadas por microservicio, prioridad y estimación de esfuerzo (T-shirt sizing: **S** = 1-2 horas, **M** = 3-5 horas, **L** = 6-8+ horas), sirviendo como backlog autoritativo para la fase de implementación (I01–I12).

### Distribución por Microservicio y Prioridad

| Microservicio | Dominio | Alta | Media | Baja | Total |
|:---:|---|:---:|:---:|:---:|:---:|
| `MS_CAR` | Carrito de Compras Persistente | 4 | 5 | 0 | **9** |
| `MS_FAC` | Facturación Fiscal y Comprobantes | 1 | 4 | 0 | **5** |
| `MS_AUD` | Auditoría Transaccional y Forense | 3 | 4 | 1 | **8** |
| `MS_CLI` | Clientes, Identidad y Perfiles | 2 | 1 | 0 | **3** |
| `MS_PAG` | Pasarela de Pagos (Validación B2B) | 1 | 0 | 0 | **1** |
| `MS_PKG` | Paquetes y Promociones (Sincronización B2B) | 0 | 1 | 0 | **1** |
| `MS_ESB` | Orquestador Saga (Trazas OpenTelemetry) | 0 | 1 | 0 | **1** |
| **TOTAL** | | **11** | **16** | **1** | **28** |

---

## 2. Catálogo Detallado de Operaciones Planificadas

| Método | Ruta | Contrato OpenAPI | Microservicio | Justificación Técnica & Arquitectónica | Prioridad | Esfuerzo | Requisito / ADR Relacionado |
|:---:|---|---|:---:|---|:---:|:---:|---|
| `POST` | `/carritos` | `carritos-openapi-v2.yaml` | `MS_CAR` | Inicializar un nuevo carrito de compras persistente en `schema_carritos.carritos` para clientes registrados o sesiones anónimas. | **Alta** | M | RF-CAR-01 / Blueprint §5.2 |
| `GET` | `/carritos/activo` | `carritos-openapi-v2.yaml` | `MS_CAR` | Obtener el carrito de compras activo del cliente autenticado (`cliente_id`), permitiendo sincronización multidispositivo. | **Alta** | S | RF-CAR-02 / H-P16-04 |
| `GET` | `/carritos/{id}` | `carritos-openapi-v2.yaml` | `MS_CAR` | Consultar la composición y estado de un carrito específico por su UUID. | Media | S | RF-CAR-03 |
| `POST` | `/carritos/{id}/items` | `carritos-openapi-v2.yaml` | `MS_CAR` | Agregar un ítem al carrito persistente validando disponibilidad con la vertical y congelando el snapshot de precio unitario en el backend. | **Alta** | M | RF-CAR-04 / H-P16-02 |
| `DELETE`| `/carritos/{id}/items` | `carritos-openapi-v2.yaml` | `MS_CAR` | Vaciar todos los ítems del carrito de compras activo. | Media | S | RF-CAR-05 |
| `PATCH`| `/carritos/{id}/items/{itemId}` | `carritos-openapi-v2.yaml` | `MS_CAR` | Actualizar la cantidad o pasajeros de una línea del carrito recalculando subtotales. | Media | S | RF-CAR-06 |
| `DELETE`| `/carritos/{id}/items/{itemId}` | `carritos-openapi-v2.yaml` | `MS_CAR` | Remover un ítem individual del carrito. | Media | S | RF-CAR-07 |
| `POST` | `/carritos/{id}/checkout` | `carritos-openapi-v2.yaml` | `MS_CAR` | Transicionar el carrito de compras a orden transaccional y delegar la orquestación Saga al ESB (`POST /esb/checkout-saga`). | **Alta** | L | RF-SAGA-01 / Blueprint §6.5 |
| `POST` | `/carritos/abandonados/detectar` | `carritos-openapi-v2.yaml` | `MS_CAR` | Tarea programada (Cron) para detectar carritos inactivos (> 2 horas) y emitir el CloudEvent `carritos.abandonados` a RabbitMQ y Kafka. | Media | M | RF-CAR-08 / Blueprint §5.2 |
| `POST` | `/facturas` | `facturacion-openapi-v2.yaml` | `MS_FAC` | Emitir una nueva factura fiscal en base de datos (`schema_facturacion`) con cálculo formal de subtotal, tarifa 0%, 15% IVA y desglose de líneas. | **Alta** | L | RF-FAC-01 / H-P05-01 |
| `GET` | `/facturas` | `facturacion-openapi-v2.yaml` | `MS_FAC` | Listar comprobantes fiscales emitidos para el usuario autenticado con soporte de paginación por cursor. | Media | M | RF-FAC-02 / H-P05-01 |
| `GET` | `/facturas/{facturaId}` | `facturacion-openapi-v2.yaml` | `MS_FAC` | Consultar la ficha fiscal completa de una factura por UUID desde `schema_facturacion`. | Media | S | RF-FAC-03 / H-P05-01 |
| `GET` | `/facturas/{facturaId}/pdf` | `facturacion-openapi-v2.yaml` | `MS_FAC` | Renderizado server-side y descarga en formato binario `application/pdf` con clave de acceso SRI de 49 dígitos. | Media | L | RF-FAC-04 / H-P05-02 |
| `PATCH`| `/facturas/{facturaId}/anular` | `facturacion-openapi-v2.yaml` | `MS_FAC` | Anular fiscalmente una factura por reversión Saga o emisión de nota de crédito autorizada. | Media | M | RF-FAC-05 / H-P05-01 |
| `GET` | `/clientes/{id}` | `clientes-openapi-v2.yaml` | `MS_CLI` | Ficha canónica del cliente en `schema_clientes.clientes` requerida por el ESB para ensamblado fiscal sin SQL JOINs (`ORQ_FAC`). | **Alta** | M | RF-CLI-01 / Blueprint §5.2 |
| `PATCH`| `/clientes/{id}` | `clientes-openapi-v2.yaml` | `MS_CLI` | Actualización de perfil y datos fiscales (RUC/cédula, dirección, razón social) en base de datos relacional. | Media | M | RF-CLI-02 / Blueprint §5.2 |
| `PATCH`| `/clientes/{id}/rol` | `clientes-openapi-v2.yaml` | `MS_CLI` | Asignación y revocación formal de roles administrativos en la base de datos sin bypass de cabeceras inseguras. | **Alta** | S | RF-CLI-03 / H-P06-02 / H-P06-03 |
| `GET` | `/pagos/{paymentReference}` | `pagos-openapi-v2.yaml` | `MS_PAG` | Validación síncrona de pagos para aerolíneas y socios externos mediante referencia única antes de emisión de PNRs/vouchers. | **Alta** | S | RF-PAG-03 / H-P02-05 |

> `GET /pagos/{paymentReference}` fue implementado en I06 como operación v2; requiere ADMIN/SERVICE o `X-Api-Key` limitada al `carrito_id` asociado.
| `PUT` | `/paquetes/contratos/{proveedorCodigo}` | `paquetes-openapi-v2.yaml` | `MS_PKG` | Endpoint B2B para actualizar y sincronizar en Booking los acuerdos comerciales y porcentajes de descuento combo de los socios. | Media | S | RF-PKG-02 / H-P03-03 |
| `POST` | `/webhooks/{vertical}` | `webhooks-inbound-openapi-v2.yaml` | `MS_AUD` | Receptor HTTP inbound para absorber eventos CloudEvents firmados con HMAC-SHA256 emitidos por las tiendas satélites. | **Alta** | M | RF-WH-01 / H-P09-01 / H-P09-02 |
| `GET` | `/webhooks/{vertical}/entregas` | `webhooks-inbound-openapi-v2.yaml` | `MS_AUD` | Consola ADMIN paginada para revisar entregas aceptadas, su estado y correlación; firmas inválidas se auditan sin persistir IDs no autenticados. | Baja | S | RF-WH-02 / H-P09-01 |

> I07 implementó ambas rutas en `/api/v2`: el `POST` valida HMAC-SHA256 sobre el cuerpo crudo y deduplica eventos; el `GET` requiere ADMIN y pagina la bitácora durable.
| `GET` | `/esb/sagas/{correlationId}/traza` | `esb-sagas-openapi-v2.yaml` | `MS_AUD` / `MS_ESB` | Transforma el journal de pasos de la Saga en un grafo de observabilidad con semáforos LED (🟢/🟡/🔴) y árbol de spans W3C. | Media | L | RF-OBS-02 / Semana 8 |
| `GET` | `/observabilidad/trazas/{correlationId}` | `observabilidad-openapi-v2.yaml` | `MS_AUD` | Consulta del grafo de ejecución transversal de un proceso distribuido uniendo llamadas REST, RabbitMQ y Kafka. | Media | L | RF-OBS-03 / Semana 8 |
| `GET` | `/auditoria/transacciones` | `auditoria-openapi-v2.yaml` | `MS_AUD` | Consulta forense por SQL en `schema_auditoria.auditoria_transaccional` ("quién compró", montos, IPs, paginación por cursor). | **Alta** | M | RF-AUD-01 / ADR-003 / H-P17-02 |
| `GET` | `/auditoria/admin` | `auditoria-openapi-v2.yaml` | `MS_AUD` | Registro estructurado de acciones administrativas con snapshots comparativos del estado `antes` y `despues`. | **Alta** | M | RF-AUD-02 / ADR-003 / H-P17-04 |
| `GET` | `/auditoria/sagas` | `auditoria-openapi-v2.yaml` | `MS_AUD` | Listado consolidado de transacciones Saga para análisis forense y detección de compensaciones frecuentes. | Media | M | RF-SAGA-03 / Semana 8 |
| `GET` | `/auditoria/sagas/{correlationId}` | `auditoria-openapi-v2.yaml` | `MS_AUD` | Detalle forense post-mortem de una Saga y su bitácora secuencial de compensaciones LIFO. | Media | M | RF-SAGA-04 / Semana 8 |
| `POST` | `/auditoria/transacciones/ingesta` | `auditoria-openapi-v2.yaml` | `MS_AUD` | Ingesta interna asíncrona para que workers de RabbitMQ y consumidores de Kafka persistan compras confirmadas. | Media | S | Blueprint §7.4 / H-P17-03 |

---

## 3. Hoja de Ruta de Implementación Sugerida

Para la ejecución de las tareas de implementación (prompts I01–I12):

1. **Sprint 1 — Seguridad e Integridad Core (Prioridad Alta):**
   - Proteger controladores expuestos con `SupabaseAuthGuard` y eliminar bypass de `X-Role` (H-P06-03, H-P08-01, H-P01-01, H-P02-01).
   - Implementar `GET /clientes/{id}` y `PATCH /clientes/{id}/rol` en `MS_CLI` sobre `schema_clientes.clientes`.
   - Implementar `GET /pagos/{paymentReference}` en `MS_PAG` para validación de compras satélites.
2. **Sprint 2 — Persistencia y Dominio de Carrito (Prioridad Alta):**
   - Implementar `CarritosModule` en NestJS (`POST /carritos`, `POST /carritos/{id}/items`, `GET /carritos/activo`, `POST /carritos/{id}/checkout`) mapeando a `schema_carritos` y congelando precios.
   - Conectar la Saga de checkout para que reciba `carrito_id` en lugar de arreglos de ítems manipulables por el cliente.
3. **Sprint 3 — Facturación Fiscal Server-Side (Prioridad Alta/Media):**
   - Crear entidades TypeORM y controlador en `MS_FAC` para `POST /facturas`, `GET /facturas` y `GET /facturas/{id}/pdf` con motor server-side.
   - Sincronizar la confirmación de la Saga en `SagaOrchestratorService` con la inserción automática de facturas en `schema_facturacion`.
4. **Sprint 4 — Webhooks Inbound y Auditoría de Negocio (Prioridad Alta/Media):**
   - Desarrollar `WebhooksModule` (`POST /webhooks/{vertical}`) con verificación criptográfica HMAC-SHA256 (`webhook_secret`).
   - Implementar `AuditoriaModule` (`GET /auditoria/transacciones`, `GET /auditoria/admin`) consumiendo desde `schema_auditoria` alimentada por el Kafka Bridge (`cg-audit-analytics`).
5. **Sprint 5 — Observabilidad Visual y Grafos Saga (Prioridad Media/Baja):**
   - Implementar transformador de grafos de ejecución para `GET /esb/sagas/{correlationId}/traza` y alimentar el Dashboard visual de monitoreo.
