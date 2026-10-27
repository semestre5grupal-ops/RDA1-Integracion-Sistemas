# P08 — Nodos, telemetría e inventario (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar la parte REST de la observabilidad de Booking: monitor de nodos (semáforo 🟢🟡🔴 y kill-switch), eventos de telemetría del frontend y consulta del inventario recibido por gRPC. Diseñar lo que falta para el **dashboard de trazas** que pide la cátedra.

## Salida
- `contracts/observabilidad-openapi-v2.yaml`
- `docs/RDA2/entregas/P08-reporte.md`
- Sección P08 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/nodes/nodes.controller.ts`, `nodes.service.ts`, `entities/config-proveedor.entity.ts`
- `src/modules/telemetry/telemetry.controller.ts`, `telemetry.service.ts`
- `src/modules/inventory/inventory-grpc.controller.ts` (**solo** las rutas REST `GET /inventory/status` y `GET /inventory`; el gRPC va en P12) y `inventory.service.ts` (`getStatus`, `getInventory`)
- `src/modules/admin/connector-health.service.ts` (cómo se calcula el semáforo, el circuit breaker y el timeout de 5 s)
- `docs Paúl Rosero/architecture/ADR-006-panel-monitoreo-nodos-semaforo.md`
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md` (monitoreo tipo grafo y logs mínimos)
- `contracts/common/components-v2.yaml`

## Rutas implementadas
| Método | Ruta | Handler | Guard |
|---|---|---|---|
| GET | `/nodes` | `listarNodos` | verifica |
| POST | `/nodes/{codigoNodo}/toggle` | `toggleNodePublic` | **verifica: parece no tener** |
| GET | `/admin/nodes` | `listarNodosAdmin` | Supabase + rol ADMIN |
| PUT | `/admin/nodes/{codigoNodo}` | `actualizarNodo` | Supabase + rol ADMIN |
| PATCH | `/admin/nodes/{codigoNodo}` | `parchearNodo` | Supabase + rol ADMIN |
| POST | `/admin/nodes/{codigoNodo}/toggle-killswitch` | verifica | verifica |
| POST | `/admin/nodes/{codigoNodo}/ping` | verifica | verifica |
| POST | `/telemetry/events` | `trackEvent` | verifica |
| GET | `/inventory/status` | `getStatus` | verifica |
| GET | `/inventory` (`item_id`, `date`) | `getInventory` | verifica |

> `GET /admin/nodes/health`, `POST /admin/nodes/{serviceId}/toggle|ping` pertenecen a `AdminController` y están en **P07**: aquí solo enlázalos en la descripción.

## Ruta planificada (`x-status: planned`)
| Método | Ruta | Para qué |
|---|---|---|
| GET | `/observabilidad/trazas/{correlationId}` | Devuelve la traza completa de un proceso (saga + llamadas REST + eventos RabbitMQ/Kafka) para pintar el **grafo**: nodos con `status` (verde/rojo), `span_id`, `parent_span_id`, `duration_ms`, errores y compensaciones. Si `GET /esb/sagas/{correlationId}` ya cubre parte, dilo y describe solo lo que falta. |

## Qué debe documentar
1. **Semáforo:** estados (`HEALTHY`/`DEGRADED`/`DOWN` o los reales), umbrales de latencia, circuit breaker (`CLOSED`/`OPEN`/`HALF_OPEN`), timeout de **5 s** y mock fallback (`CONFIRMED_FALLBACK`, `external_sync_pending`).
2. **Kill-switch:** efecto sobre las búsquedas y compras de esa vertical.
3. **Parametrización de nodos:** `baseUrlRest`, `endpointGrpc`, `nombreProveedor` (y que **no** se exponen secretos).
4. **Telemetría del frontend:** schema de `POST /telemetry/events` (`event_name`, `session_id`, `user_id`, `vertical`, `device`, `properties`), eventos del embudo (`search_performed`, …) que usa el frontend (búscalos en `frontend/src`) y el destino objetivo (Kafka, ver P11).
5. **Inventario recibido por gRPC:** schema de la respuesta REST y su relación con el proto (referencia a P12).

## Discrepancias ya detectadas (verifícalas y regístralas)
- **`POST /nodes/{codigoNodo}/toggle` sin guard**: un kill-switch público. (Alta si se confirma.)
- Tres formas de conmutar un nodo (ver P07).
- `POST /telemetry/events` sin guard ni límite de tamaño ni *rate limit* documentado.
- `GET /inventory*` sin guard.
- Si la telemetría se guarda en base de datos en vez de Kafka/archivos (contradice la cátedra: "logs en archivos", "telemetría en Kafka").

## Criterios de aceptación
- [ ] Las 10 rutas están en el contrato (más la planificada).
- [ ] Redocly lint sin errores.
- [ ] Reporte con cobertura, supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P08 nodos-observabilidad openapi v2`
