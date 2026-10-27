# P09 — Receptor de webhooks de las tiendas (contrato OpenAPI, diseño)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Booking **no tiene** hoy un endpoint para recibir los eventos que las tiendas le envían por webhook (los contratos de vuelos, autos y atracciones v2 dicen que Booking se suscribe y los recibe). Esta tarea **diseña** ese contrato. Todo va como `x-status: planned`.

## Salida
- `contracts/webhooks-inbound-openapi-v2.yaml`
- `docs/RDA2/entregas/P09-reporte.md`
- Sección P09 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `contracts/vuelos-openapi-v2.yaml`: secciones 8 (eventos) y la ruta `POST /vuelos/webhooks` (callback `vuelosEvent`, firma `X-Webhook-Signature`, reintentos) y los schemas `Event*` / `VuelosCloudEvent`
- `contracts/autos-openapi-v2.yaml` y `contracts/atracciones-openapi-v2.yaml`: sus CloudEvents y cómo describen el feed `GET .../eventos`
- `src/modules/alojamientos/alojamientos.controller.ts`: solo las rutas `webhooks` (aquí las **expone** la vertical; confirma que no existe un receptor en Booking)
- `grep -rn "webhook" src --include=*.ts` fuera de `vuelos/` y `alojamientos/` (solo `admin.service.ts` aparece: mira para qué)
- `src/modules/nodes/entities/config-proveedor.entity.ts` (¿hay dónde guardar el `secret` por proveedor?)
- `Faltantes RDA2/docs/PROTO_CLOUD_EVENTS.md`
- `contracts/common/components-v2.yaml`

## Rutas a diseñar (`x-status: planned`, `x-source: n/a`)
| Método | Ruta | Para qué |
|---|---|---|
| POST | `/webhooks/{vertical}` | Recibe un CloudEvent de la tienda. `vertical` ∈ `vuelos`, `autos`, `atracciones`, `alojamientos`. |
| GET | `/webhooks/{vertical}/entregas` | (Admin) Lista los eventos recibidos: `event_id`, `type`, `received_at`, `status` (`PROCESADO`/`DUPLICADO`/`FIRMA_INVALIDA`/`ERROR`), `correlationid`. Con `limit` y `cursor`. |

## Qué debe documentar
1. **Autenticidad:** encabezado `X-Webhook-Signature: sha256=<HMAC-SHA256(secret, cuerpo crudo)>`; el secreto es por proveedor; 401 si la firma no coincide. Ejemplo de cálculo.
2. **Contenido:** `application/cloudevents+json` (CloudEvents estructurado) con `correlationid` y `traceparent`. El `oneOf` del cuerpo referencia los eventos de las tres tiendas mediante `$ref` a sus contratos (ej. `./vuelos-openapi-v2.yaml#/components/schemas/VuelosCloudEvent`). Si un `$ref` externo da error en el lint, **copia los schemas** a este archivo y anótalo.
3. **Idempotencia:** deduplicar por `id` del evento. Un evento repetido responde **200** con `Idempotent-Replayed: true` (no se vuelve a procesar).
4. **Respuesta rápida:** **202** en cuanto el evento se guarda; el procesamiento es asíncrono (publicar a RabbitMQ). Objetivo: responder en menos de 1 s para no provocar reintentos.
5. **Errores:** 400 (no es CloudEvent válido), 401 (firma), 404 (`vertical` desconocida), 413 (cuerpo demasiado grande), 429.
6. **Tabla de reacciones:** qué hace Booking con cada evento (ej. `booking.ticket_issued` → crear factura; `flight.status_changed` → notificar y avisar a autos/alojamientos; `booking.cancelled` → compensar combo; `hold.expired` → limpiar carrito). Marca cada reacción como `existe` / `planned`.
7. **Reintentos del emisor:** descríbelos (backoff 1 min, 5 min, 30 min, 2 h, 6 h, según el contrato de vuelos) y el respaldo `GET /{vertical}/eventos`.
8. **Registro de la suscripción:** cómo Booking se suscribe en cada tienda (`POST /{vertical}/webhooks` con `url`, `events`, `secret`) y dónde se guarda el secreto.

## Discrepancias ya detectadas (verifícalas y regístralas)
- No existe receptor de webhooks en Booking (Alta para el flujo de eventos de las tiendas).
- No hay dónde guardar el secreto por proveedor (verifica la entidad `config_proveedor`).
- Los contratos de autos y atracciones usan nombres de evento distintos a los de vuelos: lista la tabla de equivalencias.

## Criterios de aceptación
- [ ] Las dos rutas diseñadas están completas, con ejemplos de cuerpo, firma y respuestas.
- [ ] Tabla de reacciones y de equivalencia de eventos entre tiendas.
- [ ] Redocly lint sin errores.
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P09 webhooks-entrantes openapi v2 (planned)`
