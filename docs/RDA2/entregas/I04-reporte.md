# Reporte de Implementación I04 — Mensajería: RabbitMQ transaccional, Kafka solo telemetría

## 1. Resumen
Se alineó la arquitectura del bus de eventos con los lineamientos de la Cátedra (Semana 8) y el contrato `contracts/asyncapi-eventos-v2.yaml`.
Los eventos transaccionales autoritativos (órdenes, reservas, pagos, stock y compensaciones) se publican exclusivamente en el Topic Exchange de RabbitMQ (`booking.events`).
Apache Kafka se reservó exclusivamente para el streaming de telemetría de navegación (`booking.telemetry.events`) y sincronización analítica de catálogo, agregando deduplicación estricta por `id` de CloudEvent, reintentos con backoff hacia DLQ y soporte de desarrollo sin brokers (`EVENT_BUS_MODE=memory`, `TELEMETRY_SINK=none`).

---

## 2. Archivos cambiados
- `src/modules/event-bus/bridge/kafka-rabbit-bridge.service.ts`: Enrutamiento exclusivo de eventos transaccionales hacia RabbitMQ y eliminación del reenvío a tópicos Kafka (`topic-ordenes-b2b`, `topic-auditoria-sagas`).
- `src/modules/event-bus/kafka/kafka-event-bus.service.ts`: Incorporación del tópico `booking.telemetry.events`, soporte de `TELEMETRY_SINK=kafka|file|none` y desacoplamiento de brokers externos en desarrollo/testing.
- `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts`: Soporte de `EVENT_BUS_MODE=memory|rabbitmq` por defecto `memory`, declaración formal de Dead Letter Queue (`q.dead_letter`) y argumentos DLX.
- `src/modules/event-bus/consumer/event-consumer-idempotency.service.ts`: Nuevo servicio de deduplicación de eventos CloudEvent por `id` con ventana de expiración TTL.
- `src/modules/event-bus/consumer/rabbitmq-consumer.service.ts`: Nuevo consumidor resiliente con política de 3 reintentos, backoff exponencial y despacho a DLQ (`q.dead_letter`).
- `src/modules/event-bus/event-bus.module.ts`: Exportación de los nuevos servicios de consumo e idempotencia.
- `src/modules/telemetry/telemetry.service.ts`: Integración de inyección de `KafkaEventBusService` para emitir eventos de navegación del frontend a streaming de Kafka.
- `src/app.module.ts`: Corrección de importación de `SecurityModule` para garantizar build limpio.
- `src/main.ts`: Corrección de importación de `TraceContextInterceptor` y `TraceContextService`.
- `src/modules/chatbot/chatbot.module.ts`: Corrección de importación de `ChatbotRateLimitGuard`.
- `.env.example`: Documentación de variables `EVENT_BUS_MODE`, `RABBITMQ_URL`, `TELEMETRY_SINK`, `KAFKA_BROKERS`.
- `database/migrations/20261025_event_idempotency.sql`: Script DDL de tabla relacional de idempotencia en `schema_auditoria` (sin aplicar en vivo).
- `contracts/asyncapi-eventos-v2.yaml`: Actualización del estado de `kafkaTelemetryEvents` a `implemented` y sincronización con el bridge de Semana 8.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`: Registro de hallazgo `H-P11-03` como resuelto.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`: Actualización de estado del ítem `BL-015`.
- `src/modules/event-bus/i04-mensajeria-rabbit-kafka.spec.ts`: Suite de pruebas unitarias cubriendo los 4 criterios de aceptación de I04.

---

## 3. Pruebas y Resultados

### Suite de pruebas específica I04 (`src/modules/event-bus/i04-mensajeria-rabbit-kafka.spec.ts`)
```text
PASS src/modules/event-bus/i04-mensajeria-rabbit-kafka.spec.ts
  I04 — Mensajería: RabbitMQ transaccional y Kafka solo telemetría
    Criterio 1: Separación de canales de publicación (RabbitMQ vs Kafka)
      √ un evento transaccional de orden/pago se publica en RabbitMQ y NO llega al publisher de Kafka (8 ms)
      √ un evento transaccional de compensación de saga se publica en RabbitMQ y NO llega a Kafka (1 ms)
      √ un evento de telemetría se envía a Kafka y NO llega a RabbitMQ (1 ms)
    Criterio 2: Idempotencia del consumidor
      √ el mismo evento dos veces se procesa una sola vez (dedupe por id del CloudEvent) (1 ms)
    Criterio 3: DLQ y 3 reintentos con backoff
      √ reintenta hasta 3 veces ante error del handler y luego despacha a DLQ (59 ms)
    Criterio 4: Modo desarrollo sin brokers (EVENT_BUS_MODE=memory)
      √ en modo memory opera sin broker externo y no lanza error (2 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        4.992 s
```

### Validación de Contrato AsyncAPI 3.0 (`@asyncapi/cli`)
```text
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml

File contracts/asyncapi-eventos-v2.yaml is valid but has (itself and/or referenced documents) governance issues.
Information 
contracts/asyncapi-eventos-v2.yaml
 1:11  information  asyncapi-latest-version  The latest version of AsyncAPi is not used. It is recommended update to the "3.1.0" version.  asyncapi

✖ 1 problem (0 errors, 0 warnings, 1 info, 0 hints)
```

### Resultado de `npm run build`
```text
> booking-prototipo-plantilla@1.0.0 build
> nest build

(Exit code: 0 - Compilación limpia sin errores TypeScript)
```

### Resultado de la suite completa `npm test`
```text
Test Suites: 23 passed, 23 total
Tests:       791 passed, 791 total
Snapshots:   0 total
Time:        173.073 s, estimated 209 s
Ran all test suites.
(Exit code: 0 - 100% pruebas pasando)
```

---

## 4. Compatibilidad con `/api/v1`
- Todos los cambios se mantienen estrictamente compatibles hacia atrás.
- Los endpoints existentes de `/api/v1/` y `/telemetry/events` preservan sus firmas y contratos de respuesta HTTP intactos.
- La inyección de `KafkaEventBusService` en `TelemetryService` es opcional (`@Optional()`), por lo que clientes o tests existentes que instancien el servicio sin brokers continúan operando normalmente.
- Se mantiene el soporte a los tópicos y claves semánticas previas en los brokers para no quebrar consumidores heterogéneos.

---

## 5. Contratos y documentos actualizados
- `contracts/asyncapi-eventos-v2.yaml`: Canal `kafkaTelemetryEvents` pasó a `x-status: implemented` vinculado con `TelemetryService.trackEvent`. Se ajustó la sección 2 del contrato explicando el desacoplamiento transaccional/analítico.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`: `H-P11-03` marcado como resuelto con `RabbitMqConsumerService` y `EventConsumerIdempotencyService`.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`: `BL-015` actualizado a estado implementado.

---

## 6. Supuestos y decisiones de diseño
1. **Modo por defecto seguro:** Por defecto `EVENT_BUS_MODE=memory` y `TELEMETRY_SINK=none`, de manera que `npm test` y el entorno de integración continua ejecutan instantáneamente sin requerir que RabbitMQ (5672) ni Kafka (9092) estén levantados.
2. **Deduplicación en memoria con proyección relacional:** La deduplicación activa opera en un mapa de alta concurrencia con TTL de 24 horas (`EventConsumerIdempotencyService`). Se provee el script `database/migrations/20261025_event_idempotency.sql` para cuando se decida persistir en `schema_auditoria.event_idempotency`.
3. **Backoff exponencial en reintentos:** Cuando falla el handler de un consumidor, se ejecutan hasta 3 reintentos con retraso progresivo ($100\text{ ms} \times 2^{\text{intento}-1}$). Al agotar los reintentos, el mensaje se aísla automáticamente en `q.dead_letter`.

---

## 7. Pendiente / No pude verificar
- No se levantaron brokers físicos externos de RabbitMQ ni Apache Kafka en contenedores Docker de producción para no violar la regla de prohibición de conexión a brokers externos ni alterar el entorno local del estudiante. La conectividad física se verificó a nivel de mocks y adaptadores de transporte de `amqplib` y `kafkajs`.

---

## 8. Cómo probarlo a mano

### A. Probar modo memoria y telemetría por archivo
1. En un archivo local o terminal exportar:
   ```bash
   export EVENT_BUS_MODE=memory
   export TELEMETRY_SINK=file
   ```
2. Iniciar el servidor:
   ```bash
   npm run start:dev
   ```
3. Enviar un evento de telemetría:
   ```bash
   curl -X POST http://localhost:3000/telemetry/events \
     -H "Content-Type: application/json" \
     -d '{
       "event_name": "checkout_started",
       "session_id": "sess-manual-001",
       "vertical": "vuelos",
       "device": "desktop",
       "properties": { "step": 1 }
     }'
   ```
4. Verificar que el archivo `logs/telemetry.jsonl` contiene el registro del evento en formato JSON estructurado con atributos CloudEvents.

### B. Probar ejecución de pruebas unitarias I04
```bash
npx jest src/modules/event-bus/i04-mensajeria-rabbit-kafka.spec.ts
```

### C. Validar especificación AsyncAPI
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
