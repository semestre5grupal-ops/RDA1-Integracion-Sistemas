# I01 — Cierre de brechas de seguridad

> Lee primero `docs/RDA2/opencode/implementacion/00-REGLAS-IMPLEMENTACION.md`. Orden: **primera** (no depende de otras).

## Objetivo
Corregir los hallazgos de severidad Alta/Media de seguridad detectados al documentar los contratos.

## Lee primero
`docs/RDA2/HALLAZGOS_CONTRATOS.md` (filtra seguridad), `contracts/observabilidad-openapi-v2.yaml`, `contracts/chatbot-openapi-v2.yaml`, `contracts/admin-openapi-v2.yaml`, `src/core/guards/*`, `src/modules/nodes/nodes.controller.ts`, `src/modules/telemetry/*`, `src/modules/inventory/inventory-grpc.controller.ts`, `src/modules/chatbot/*`.

## Alcance
1. **`POST /nodes/{codigoNodo}/toggle` (público):** exigir `SupabaseAuthGuard` + rol `ADMIN`/`MANTENIMIENTO`. Revisa si el frontend lo llama sin sesión y ajusta el frontend en lo mínimo.
2. **`POST /telemetry/events`:** límite de tamaño del cuerpo, validación estricta del DTO (lista blanca de `event_name`, tamaño de `properties`) y *rate limit* por IP/sesión (usa `@nestjs/throttler` si ya está; si no, un limitador simple en memoria detrás de flag).
3. **`GET /inventory` y `GET /inventory/status`:** protegerlos (rol `ADMIN`/`MANTENIMIENTO` o `X-Api-Key` de servicio) y actualizar el contrato.
4. **Chatbot:** que las herramientas con efectos (crear/cancelar/pagar) **exijan sesión**; sin sesión, solo herramientas de lectura. Añade límite de frecuencia a `/chatbot/mensaje`.
5. **Cualquier otro hallazgo de seguridad Alta/Media** listado en `HALLAZGOS_CONTRATOS.md` que no esté en esta lista: incluirlo solo si su arreglo es pequeño; si no, anótalo en el reporte para otra tarea.

## Criterios de aceptación
- [ ] Pruebas que demuestran 401/403 sin credenciales y 200 con rol correcto, para cada ruta.
- [ ] Pruebas de límite de frecuencia (429) y de tamaño (413).
- [ ] Rutas v1 siguen respondiendo igual para usuarios autorizados.
- [ ] Contratos actualizados (`security`, respuestas 401/403/429) y lint en verde.

## Entrega
Commit: `fix(security): cierra brechas de nodos, telemetria, inventario y chatbot [I01]`
