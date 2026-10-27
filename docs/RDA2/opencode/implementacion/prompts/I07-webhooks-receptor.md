# I07 — Receptor de webhooks de las tiendas

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Depende de I02 e I04.

## Objetivo
Implementar lo diseñado en `contracts/webhooks-inbound-openapi-v2.yaml`.

## Lee primero
`contracts/webhooks-inbound-openapi-v2.yaml`, `docs/RDA2/entregas/P09-reporte.md`, `src/modules/nodes/entities/config-proveedor.entity.ts`, `src/modules/event-bus/*`, contratos de vuelos/autos/atracciones (eventos y firma).

## Alcance
1. **`POST /webhooks/{vertical}`** (público, sin sesión): lee el **cuerpo crudo** (`rawBody`), valida `X-Webhook-Signature: sha256=<HMAC>` con **comparación en tiempo constante** y el secreto del proveedor; valida que sea CloudEvent; responde **202** y procesa de forma asíncrona.
2. **Secreto por proveedor:** columna o tabla para guardarlo **cifrado o referenciado por variable de entorno** (SQL sin aplicar en `database/migrations/`); nunca se devuelve por API ni se loguea.
3. **Idempotencia:** deduplicar por `id` del evento (tabla `webhook_entregas`: `event_id`, `vertical`, `type`, `received_at`, `status`, `correlation_id`). Duplicado → 200 + `Idempotent-Replayed: true`.
4. **Procesamiento:** publicar el evento al bus (RabbitMQ) y aplicar las **reacciones marcadas `existe`/`planned`** de la tabla del contrato que sean pequeñas (p. ej. `booking.ticket_issued` → registrar/enlazar factura; `booking.cancelled` → disparar compensación). Las demás, solo publicar y dejar TODO documentado en el reporte.
5. **`GET /webhooks/{vertical}/entregas`** (rol `ADMIN`) con `limit` y `cursor`.
6. Límites: tamaño máximo del cuerpo (413) y *rate limit* (429).
7. Utilidad `scripts/webhooks/sign.js` para firmar un cuerpo de ejemplo (para pruebas manuales).

## Criterios de aceptación
- [ ] Pruebas: firma válida (202), inválida (401), duplicado (200 + replayed), vertical desconocida (404), no-CloudEvent (400), cuerpo grande (413).
- [ ] La comparación de firma usa `crypto.timingSafeEqual`.
- [ ] Contrato `x-status` → `implemented` donde corresponda y lint en verde.

## Entrega
Commit: `feat(webhooks): receptor con HMAC, idempotencia y 202 asincrono [I07]`
