# I02 — Correlación y trazabilidad de extremo a extremo

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Debe ir **antes** de I03, I05 e I08.

## Objetivo
Que todo proceso lleve `X-Correlation-Id`, `traceparent` (W3C) y `node_id` desde el cliente hasta las tiendas y los eventos.

## Lee primero
`src/main.ts` (middleware actual de `X-Correlation-Id`), `contracts/common/components-v2.yaml`, `contracts/asyncapi-eventos-v2.yaml`, `src/modules/esb/*`, `src/modules/vuelos|autos|atracciones|alojamientos/**` (clientes HTTP salientes), `src/modules/event-bus/*`, `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md`.

## Alcance
1. **Contexto de petición** (AsyncLocalStorage o equivalente ya presente): `correlationId`, `traceId`, `spanId`, `parentSpanId`, `nodeId`. Si llega `traceparent` válido se continúa; si no, se genera. `X-Correlation-Id` siempre en la respuesta.
2. **Propagación saliente:** todas las llamadas HTTP a tiendas y servicios envían `X-Correlation-Id`, `traceparent` (nuevo `span_id`) y, en la identidad hacia las tiendas, `X-User-Id`/`X-User-Roles` si el contrato lo exige.
3. **Eventos:** todo evento publicado (RabbitMQ y Kafka) incluye `correlationid`, `traceparent` y `node_id` como atributos CloudEvents.
4. **Errores:** `ProblemDetails.correlation_id` presente en todas las respuestas de error.
5. Variable `NODE_ID` (en `.env.example`) para identificar la instancia.

## Criterios de aceptación
- [ ] Prueba: una petición con `traceparent` produce llamadas salientes con el mismo `trace-id` y distinto `span-id`.
- [ ] Prueba: respuesta de error 4xx/5xx contiene `correlation_id`.
- [ ] Prueba: evento publicado contiene los tres atributos.
- [ ] `/api/v1` sin cambios de comportamiento.

## Entrega
Commit: `feat(observability): propaga correlation-id, traceparent y node_id [I02]`
