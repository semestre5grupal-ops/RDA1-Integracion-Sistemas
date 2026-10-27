# P07 — Administración (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**. Es la tarea más grande de contratos: trabaja por bloques.

## Objetivo
Documentar la API del panel de administración (8 paneles), la solicitud pública de proveedores y la configuración pública.

## Salida
- `contracts/admin-openapi-v2.yaml`
- `docs/RDA2/entregas/P07-reporte.md`
- Sección P07 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (por bloques)
1. `src/modules/admin/admin.controller.ts` (rutas, guards, parámetros)
2. Servicios: `admin.service.ts`, `admin-audit.service.ts`, `admin-config.service.ts`, `admin-finanzas.service.ts`, `admin-proveedores.service.ts`, `connector-health.service.ts` (solo lo necesario para campos de entrada/salida)
3. `src/modules/admin/proveedores-public.controller.ts`, `public-config.controller.ts`
4. `src/modules/admin/admin-errors.interceptor.ts`, `admin-seguridad.spec.ts` (qué se prueba ya)
5. `contracts/common/components-v2.yaml`

## Rutas que debe cubrir
`AdminController` (`@Controller('admin')`, guards `SupabaseAuthGuard` + `AdminRoleGuard`):

| Grupo (tag) | Rutas |
|---|---|
| Nodos | `GET /admin/nodes/health` (`probe`), `POST /admin/nodes/{serviceId}/toggle`, `POST /admin/nodes/{serviceId}/ping` |
| Estadísticas | `GET /admin/stats` |
| Usuarios | `GET /admin/users`, `POST /admin/users`, `PUT /admin/users/{id}/action`, `GET /admin/users/{id}/historial` |
| Reservas | `GET /admin/reservas`, `PUT /admin/reservas/{tipo}/{id}/cancelar`, `GET /admin/reservas/{tipo}/{id}/detalles`, `PUT /admin/reservas/{tipo}/{id}/reenviar` |
| Finanzas | `GET /admin/finanzas`, `GET /admin/payouts`, `POST /admin/payouts/aprobar` |
| Auditoría | `GET /admin/auditoria` (`limit`), `POST /admin/auditoria` |
| Proveedores | `GET /admin/proveedores/solicitudes` (`estado`), `PUT /admin/proveedores/solicitudes/{id}` |
| Configuración | `GET /admin/config`, `PUT /admin/config` |

Controladores públicos (sin login):
- `POST /proveedores/solicitudes` ("Quiero ser proveedor")
- `GET /config/public`

> **Verifica** la lista contra el archivo: si el controlador tiene más o menos rutas que esta tabla, **gana el código**.

## Qué debe documentar
1. Cada **panel** del frontend con las rutas que consume (busca en `frontend/src/components/admin/` y `frontend/src/pages/AdminDashboard.jsx` qué llama a qué).
2. Valores permitidos de `tipo` en `/admin/reservas/{tipo}/{id}/...` (vuelos, autos, atracciones, alojamientos…): léelos del servicio.
3. **Acciones sobre usuarios** (`PUT users/{id}/action`): valores permitidos y efecto.
4. **Auditoría:** qué se registra, formato del registro y el hecho de que **los logs crudos van a archivos JSON Lines, no a la base de datos** (ADR-003): aclara qué es lo que sí vive en la tabla de auditoría.
5. Payouts: flujo `GET payouts` → `POST payouts/aprobar`, relación con P04.
6. Solicitud de proveedor: campos, moderación (`PENDIENTE`/`APROBADA`/`RECHAZADA` o los reales), qué pasa al aprobar.
7. Respuestas de error del `AdminErrorsInterceptor`: ¿mantienen RFC 7807?

## Discrepancias ya detectadas (verifícalas y regístralas)
- **Tres formas de conmutar un nodo** (`/admin/nodes/{serviceId}/toggle` aquí, `/admin/nodes/{codigoNodo}/toggle-killswitch` y `/nodes/{codigoNodo}/toggle` en `NodesController`). Detalla cuál usa el frontend.
- Solapamiento de finanzas con P04.
- Rutas de admin que dependan de `X-Admin-Key` en vez de sesión.
- Endpoints de escritura sin `Idempotency-Key` ni auditoría automática.

## Criterios de aceptación
- [ ] Todas las rutas de los 3 controladores están en el contrato (la tabla de cobertura del reporte lo prueba).
- [ ] Tags por panel; seguridad explícita en cada operación.
- [ ] Redocly lint sin errores.
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P07 admin openapi v2`
