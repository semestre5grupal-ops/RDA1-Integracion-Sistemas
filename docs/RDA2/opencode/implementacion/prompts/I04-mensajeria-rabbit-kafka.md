# I04 — Mensajería: RabbitMQ transaccional, Kafka solo telemetría

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Depende de I02.

## Objetivo
Alinear el bus de eventos con la cátedra (Semana 8) y con `contracts/asyncapi-eventos-v2.yaml` (columna "Objetivo" de la tabla Hoy vs Objetivo).

## Lee primero
`src/modules/event-bus/*` (bridge y consumidores), `src/modules/esb/*`, `src/modules/telemetry/*`, `contracts/asyncapi-eventos-v2.yaml`, `docs/RDA2/entregas/P11-reporte.md`.

## Alcance
1. **Bridge:** los eventos de orden, reserva, pago, stock y compensación se publican **solo en RabbitMQ**. Quitar el reenvío de ORDER/RESERVA/PAGO a `topic-ordenes-b2b` y `topic-auditoria-sagas`.
2. **Kafka:** solo telemetría/analítica (`POST /telemetry/events`, búsquedas, embudo) y `topic-catalogo-sync` si el contrato lo mantiene como analítica. Ajusta nombres a los del AsyncAPI.
3. **Modo desarrollo sin brokers:** variable `EVENT_BUS_MODE=memory|rabbitmq` (y `TELEMETRY_SINK=kafka|file|none`). Por defecto `memory`, para que `npm test` no necesite brokers.
4. **Idempotencia del consumidor:** dedupe por `id` del CloudEvent (tabla/caché con TTL; si requiere tabla, SQL en `database/migrations/` sin aplicar).
5. **DLQ y reintentos** en RabbitMQ (cola `*.dlq`, 3 reintentos con backoff) donde el AsyncAPI lo indique.
6. Actualiza el AsyncAPI si algo cambió y valida: `npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml`.

## Criterios de aceptación
- [ ] Prueba (con publisher simulado): un evento de pago/orden **no** llega al publisher de Kafka; uno de telemetría **no** llega a RabbitMQ.
- [ ] Prueba: el mismo evento dos veces se procesa una sola vez.
- [ ] `npm test` pasa con `EVENT_BUS_MODE=memory`.
- [ ] AsyncAPI valida.

## Entrega
Commit: `refactor(event-bus): transaccional por RabbitMQ y Kafka solo telemetria [I04]`
