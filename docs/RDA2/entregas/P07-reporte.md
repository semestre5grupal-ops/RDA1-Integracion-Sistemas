# Reporte P07 — Administración y Operaciones v2 (contrato OpenAPI)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/admin-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del módulo de administración, gobernanza y observabilidad del Gateway Booking (`MS_AUD`), cubriendo los 23 endpoints implementados en el backend. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P07-01 a H-P07-04 (tres rutas divergentes de kill-switches, solapamiento en liquidaciones entre `AdminFinanzasService` y `MS_FIN`, ausencia de idempotencia en mutaciones operativas, reenvío de comprobantes simulado). |
| `docs/RDA2/entregas/P07-reporte.md` | Creado | Reporte formal de entrega de la tarea P07. |

---

## Cobertura de rutas y clasificación (código vs contrato v2)

Dado que en la versión 1 no existía un contrato OpenAPI para el módulo de administración (`admin-openapi.yaml`), este contrato formaliza el 100% de los endpoints operativos expuestos en el backend de Booking:

| Método | Ruta | Handler / Controlador | ¿Existe en código? | x-status | x-microservice | Panel del Dashboard / Funcionalidad |
|---|---|---|:---:|---|---|---|
| `GET` | `/admin/nodes/health` | `AdminController.getNodesHealth` | **Sí** | `implemented` | `MS_AUD` | **Panel 1**: Salud en vivo de tiendas externas y latencias |
| `POST` | `/admin/nodes/{serviceId}/toggle` | `AdminController.toggleNode` | **Sí** | `implemented` | `MS_AUD` | **Panel 1**: Conmutar kill-switch del conector externo |
| `POST` | `/admin/nodes/{serviceId}/ping` | `AdminController.pingNode` | **Sí** | `implemented` | `MS_AUD` | **Panel 1**: Testeo manual de conectividad HTTP hacia el conector |
| `GET` | `/admin/stats` | `AdminController.getStats` | **Sí** | `implemented` | `MS_AUD` | **Panel 2**: Métricas, KPIs financieros y embudo de conversión |
| `GET` | `/admin/users` | `AdminController.getUsers` | **Sí** | `implemented` | `MS_CLI` / Admin | **Panel 3**: Directorio consolidado de usuarios en `auth.users` |
| `POST` | `/admin/users` | `AdminController.crearUsuario` | **Sí** | `implemented` | `MS_CLI` / Admin | **Panel 3**: Creación manual de usuarios clientes y administradores |
| `PUT` | `/admin/users/{id}/action` | `AdminController.userAction` | **Sí** | `implemented` | `MS_CLI` / Admin | **Panel 3**: Bloqueo, desbloqueo, promoción y reseteo de claves |
| `GET` | `/admin/users/{id}/historial` | `AdminController.getUserHistorial` | **Sí** | `implemented` | `MS_CLI` / Admin | **Panel 3**: Historial consolidado multivertical de reservas del cliente |
| `GET` | `/admin/reservas` | `AdminController.getReservas` | **Sí** | `implemented` | `MS_AUD` | **Panel 4**: Explorador multivertical unificado de reservas |
| `PUT` | `/admin/reservas/{tipo}/{id}/cancelar` | `AdminController.cancelarReserva` | **Sí** | `implemented` | `MS_AUD` | **Panel 4**: Cancelación forzosa con motivo auditado |
| `GET` | `/admin/reservas/{tipo}/{id}/detalles` | `AdminController.getDetalleReserva` | **Sí** | `implemented` | `MS_AUD` | **Panel 4**: Inspección técnica del payload del proveedor y tickets |
| `PUT` | `/admin/reservas/{tipo}/{id}/reenviar` | `AdminController.reenviarComprobante` | **Sí** | `implemented` | `MS_AUD` | **Panel 4**: Reenvío manual de confirmación al correo del cliente |
| `GET` | `/admin/finanzas` | `AdminController.getFinanzas` | **Sí** | `implemented` | `MS_AUD` | **Panel 5**: Resumen de ingresos brutos, comisiones y pasarelas |
| `GET` | `/admin/payouts` | `AdminController.getPayouts` | **Sí** | `implemented` | `MS_AUD` | **Panel 5**: Listado de cortes mensuales de liquidación a socios |
| `POST` | `/admin/payouts/aprobar` | `AdminController.aprobarPayout` | **Sí** | `implemented` | `MS_AUD` | **Panel 5**: Aprobación y registro de transferencia bancaria al socio |
| `GET` | `/admin/auditoria` | `AdminController.getAudit` | **Sí** | `implemented` | `MS_AUD` | **Panel 6**: Streaming forense de líneas desde `logs/audit-*.log` |
| `POST` | `/admin/auditoria` | `AdminController.registrarAuditoria` | **Sí** | `implemented` | `MS_AUD` | **Panel 6**: Inyección de eventos forenses en el log rotativo |
| `GET` | `/admin/proveedores/solicitudes` | `AdminController.getSolicitudesProveedores`| **Sí** | `implemented` | `MS_AUD` | **Panel 7**: Bandeja de solicitudes de afiliación de prestadores |
| `PUT` | `/admin/proveedores/solicitudes/{id}` | `AdminController.actualizarSolicitudProveedor`| **Sí**| `implemented`| `MS_AUD` | **Panel 7**: Aprobación o rechazo de solicitud con notas internas |
| `GET` | `/admin/config` | `AdminController.getConfig` | **Sí** | `implemented` | `MS_AUD` | **Panel 8**: Inspección de parámetros de plataforma en memoria |
| `PUT` | `/admin/config` | `AdminController.updateConfig` | **Sí** | `implemented` | `MS_AUD` | **Panel 8**: Mutación de comisiones, pasarela y modo mantenimiento |
| `POST` | `/proveedores/solicitudes` | `ProveedoresPublicController.crearSolicitud`| **Sí** | `implemented` | `MS_AUD` | **Público**: Formulario web abierto para nuevos prestadores |
| `GET` | `/config/public` | `PublicConfigController.getPublic` | **Sí** | `implemented` | `MS_AUD` | **Público**: Verificación abierta de mantenimiento y pasarela activa |

---

## Matriz de Cobertura de Subpaneles del Dashboard de Administración (RDA2 §5)

El frontend administrativo (`frontend/src/pages/AdminDashboard.jsx`) se estructura en 8 subpaneles de control. Todos ellos se encuentran completamente respaldados por las APIs documentadas en `admin-openapi-v2.yaml`:

| Subpanel | Título en Dashboard | Endpoints Backend Consumidos | Funcionalidad Operativa |
|:---:|---|---|---|
| **Panel 1** | **Nodos y Kill-Switches** | `GET /admin/nodes/health`<br>`POST /admin/nodes/{id}/toggle`<br>`POST /admin/nodes/{id}/ping` | Monitoreo del estado de Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`, `MANUALLY_OPEN`), latencia en milisegundos y conmutación en tiempo real para aislar proveedores degradados activando contingencias locales. |
| **Panel 2** | **Estadísticas y KPIs** | `GET /admin/stats` | Visualización de volumen transaccional, tasa de conversión del embudo (`telemetry_events`), usuarios activos y métricas de error agregadas. |
| **Panel 3** | **Gestión de Usuarios** | `GET /admin/users`<br>`POST /admin/users`<br>`PUT /admin/users/{id}/action`<br>`GET /admin/users/{id}/historial` | Administración de identidades en `auth.users`, asignación de roles privilegiados (`ADMIN`, `MANTENIMIENTO`), bloqueo de accesos y visualización del historial multivertical de compras. |
| **Panel 4** | **Gestión de Reservas** | `GET /admin/reservas`<br>`PUT /admin/reservas/{tipo}/{id}/cancelar`<br>`GET /admin/reservas/{tipo}/{id}/detalles`<br>`PUT /admin/reservas/{tipo}/{id}/reenviar` | Búsqueda unificada en los 4 esquemas de reservas (`vuelos`, `autos`, `atracciones`, `hospedaje`), inspección de payloads JSON originales, cancelación forzosa y reenvío de comprobantes. |
| **Panel 5** | **Finanzas y Liquidaciones** | `GET /admin/finanzas`<br>`GET /admin/payouts`<br>`POST /admin/payouts/aprobar` | Control de comisiones retenidas por Booking, balance por pasarela de pago (Payphone vs Mock) y conciliación mensual de pagos a socios externos. |
| **Panel 6** | **Auditoría Forense** | `GET /admin/auditoria`<br>`POST /admin/auditoria` | Visualización en vivo de la traza de seguridad (ADR-003) leída directamente desde archivos rotativos físicos (`logs/audit-YYYY-MM-DD.log`), garantizando inmutabilidad y protección contra manipulaciones de base de datos. |
| **Panel 7** | **Proveedores y Solicitudes**| `GET /admin/proveedores/solicitudes`<br>`PUT /admin/proveedores/solicitudes/{id}` | Gestión del pipeline de afiliación comercial: revisión de RUC, tipo de servicio, ciudad y contacto, permitiendo aprobar o rechazar con bitácora interna. |
| **Panel 8** | **Configuración del Sistema** | `GET /admin/config`<br>`PUT /admin/config` | Control de variables globales: porcentaje de comisión del marketplace, pasarela de pago predeterminada, tiempo de expiración de cotizaciones y activación del `modoMantenimiento`. |

---

## Validación con Redocly CLI

```bash
npx --yes @redocly/cli@1 lint contracts/admin-openapi-v2.yaml
```

**Resultado de la ejecución:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[0].url` (`http://localhost:3000/api/v2`), requerido por convención de desarrollo local del proyecto.

---

## Supuestos y decisiones de diseño

1. **Creación del Primer Contrato Formal de Administración (v2):**
   - A diferencia de los otros microservicios que disponían de versiones preliminares (`v1`), el módulo de administración carecía de contrato OpenAPI formal. `contracts/admin-openapi-v2.yaml` se diseñó partiendo estrictamente del código fuente real (`AdminController`, `ProveedoresPublicController`, `PublicConfigController`, `AdminService`, `ConnectorHealthService`, `AdminAuditService`, `AdminConfigService`, `AdminFinanzasService`).
2. **Auditoría Forense Física Inmutable (ADR-003):**
   - El endpoint `GET /admin/auditoria` no realiza consultas a PostgreSQL. Lee directamente las líneas del archivo físico `logs/audit-YYYY-MM-DD.log` gestionado por `WinstonPhysicalLoggerService`. Esto cumple con el requerimiento de resiliencia forense: la auditoría no se pierde si la base de datos se satura o cae, y no puede ser alterada mediante inyecciones SQL.
3. **Mapeo de Tipos de Reservas Multivertical:**
   - Se validó en `AdminService` que el parámetro de ruta `{tipo}` en `/admin/reservas/{tipo}/{id}/*` está tipado estrictamente con el enum `[vuelos, autos, atracciones, hospedaje]`, consultando respectivamente las tablas `schema_vuelos.reservas_vuelos`, `schema_autos.ordenes`, `schema_atracciones.reservas_atracciones` y `schema_hospedaje.reservas_hospedaje`.
4. **Manejo Específico de Errores con `AdminErrorsInterceptor`:**
   - Toda la API de administración está interceptada por `AdminErrorsInterceptor`. Si un servicio subyacente falla con una excepción genérica no HTTP, el interceptor la transforma en un `InternalServerErrorException` enriquecido con el mensaje técnico real del error (`application/problem+json`), permitiendo que el panel de control muestre una retroalimentación accionable al administrador.
5. **Documentación del Estado de Kill-Switches (H-P07-01):**
   - Se explicitó en la descripción del contrato que `POST /admin/nodes/{serviceId}/toggle` conmuta el estado en memoria en `ConnectorHealthService` (empleado por `AdminDashboard.jsx`), señalando en los hallazgos la necesidad de unificarlo con `NodesController`.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P07-01** | Media | Tres rutas divergentes para conmutar kill-switches de nodos (`/admin/nodes/:serviceId/toggle`, `/nodes/:codigoNodo/toggle`, `/admin/nodes/:codigoNodo/toggle-killswitch`), provocando posible desincronización entre memoria y base de datos. |
| **H-P07-02** | Media | Solapamiento y doble cómputo en liquidaciones a socios: `AdminFinanzasService` calcula liquidaciones mensuales cruzando reservas al vuelo, sin compartir estado transaccional con las liquidaciones quincenales de `MS_FIN` (`schema_finanzas`). |
| **H-P07-03** | Baja | Ausencia de soporte para cabecera `Idempotency-Key` en operaciones mutantes administrativas críticas (`/admin/reservas/{tipo}/{id}/cancelar`, `/admin/payouts/aprobar`). |
| **H-P07-04** | Baja | Reenvío de comprobantes de reserva simulado: `PUT /admin/reservas/{tipo}/{id}/reenviar` responde confirmación de éxito sin invocar ningún despachador de correo electrónico real. |

---

## Dudas para el revisor

1. ¿Se prevé unificar en una siguiente iteración los controladores `AdminController` y `NodesController` para que exista un único endpoint canónico de kill-switches que actualice la base de datos `schema_admin.nodos_conectores` y notifique mediante eventos al gateway?
2. Para el reenvío de comprobantes (`/admin/reservas/{tipo}/{id}/reenviar`), ¿se conectará directamente con `FacturasService.enviarFactura` o se delegará a un microservicio de notificaciones asíncronas vía RabbitMQ/Redis?
