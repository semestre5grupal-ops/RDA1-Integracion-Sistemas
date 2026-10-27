# P11 — Eventos asíncronos (AsyncAPI 3.0)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00** y se apoya en P01 (sagas).

## Objetivo
Documentar el bus de eventos de Booking con **dos vistas separadas**: (A) **como está hoy** en el código y (B) **objetivo** según la cátedra (Semana 8): RabbitMQ para sagas/transacciones/compensaciones y Kafka solo para telemetría/analítica.

## Salida
- `contracts/asyncapi-eventos-v2.yaml` (AsyncAPI 3.0)
- `docs/RDA2/entregas/P11-reporte.md`
- Sección P11 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/event-bus/` completo (bridge, publishers, consumers, tipos de evento)
- `src/modules/esb/` (publicación de eventos de saga y compensación)
- `src/modules/telemetry/telemetry.service.ts`
- `docs Paúl Rosero/architecture/ADR-001…007` (los de mensajería y logs)
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md`
- `Faltantes RDA2/docs/PROTO_CLOUD_EVENTS.md`
- `contracts/common/components-v2.yaml` (`CloudEventBase`)
- Eventos descritos en `contracts/vuelos-openapi-v2.yaml` (los que las tiendas emiten)

## Qué debe contener
1. **Servidores:** `rabbitmq` (amqp) y `kafka` con variables de host (sin credenciales).
2. **Canales RabbitMQ** (exchange, routing keys reales): `search.query`, `stock.updated`, `order.confirmed`, `saga.compensate`, `general.event` y los demás que encuentres. Para cada uno: mensaje (CloudEvents con `correlationid`, `traceparent`, `node_id`), productor, consumidor, garantías (ack, reintentos, DLQ si existe).
3. **Canales Kafka:** `topic-catalogo-sync`, `topic-ordenes-b2b`, `topic-auditoria-sagas` y los de telemetría. Indica qué se publica en cada uno hoy.
4. **Catálogo de eventos de saga:** `saga.started`, `saga.step.completed`, `saga.step.failed`, `saga.compensating`, `saga.compensated`, `saga.completed` (usa los nombres reales del código; los que falten, márcalos `planned`).
5. **Eventos entrantes de las tiendas** (webhooks, ver P09) y cómo se re-publican internamente.
6. **Tabla Hoy vs Objetivo:** por cada tipo de evento, broker actual, broker objetivo, acción para migrar.
7. Convención de nombres, versionado de eventos (`dataschema`, sufijo `.v1`) y política de idempotencia del consumidor.

## Discrepancias ya detectadas (verifícalas y regístralas)
- **El bridge enruta eventos ORDER/RESERVA/PAGO también a Kafka** (`topic-ordenes-b2b`, `topic-auditoria-sagas`), contra la regla "transacciones por RabbitMQ; Kafka solo telemetría". (Alta.)
- Eventos sin `correlationid` o sin `traceparent`.
- Brokers en Render: ¿existe configuración real para ambos o hay un modo simulado/en memoria?
- Consumidores sin idempotencia.

## Criterios de aceptación
- [ ] `npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml` sin errores.
- [ ] Cada canal tiene `x-source` y `x-status`.
- [ ] Tabla Hoy vs Objetivo completa.
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P11 asyncapi eventos v2`
