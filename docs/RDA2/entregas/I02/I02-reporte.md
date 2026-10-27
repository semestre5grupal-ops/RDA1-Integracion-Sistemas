# Entrega I02 — Correlación y trazabilidad de extremo a extremo

## Resultado

Implementada en `rda2/implI02`, creada desde `main` (`cff709a`). El contexto de
petición usa `AsyncLocalStorage` y conserva el comportamiento de `/api/v1`:
los endpoints y sus cuerpos de éxito no cambian; se añaden cabeceras de
observabilidad y campos opcionales en errores y eventos.

## Cambios

- El middleware global conserva un `traceparent` W3C v00 válido o genera un
  trace/span nuevo, asigna `correlation_id` y `NODE_ID`, y devuelve
  `X-Correlation-Id`, `traceparent` y `node_id` en la respuesta.
- El contexto propagado a llamadas Axios y `fetch` incluye un span hijo,
  `X-Correlation-Id` estable y `node_id`. Se instrumentaron los clientes HTTP
  de autos, atracciones, alojamientos, administración, chatbot y nodos.
- Se capturan `id`/`sub` y roles ya autenticados por los guards para permitir
  reenviar `X-User-Id`/`X-User-Roles` solo cuando una integración lo requiera;
  no se reenvía identidad por defecto a endpoints de terceros.
- RabbitMQ y Kafka publican atributos CloudEvents (`specversion`, `id`, `source`,
  `type`, `time`, `datacontenttype`, `correlationid`, `traceparent`, `node_id`
  y `data`). RabbitMQ añade además `correlationId` y cabeceras AMQP nativas;
  Kafka añade `RecordHeaders`. Se conservan los campos previos `payload`,
  `timestamp`/`emitted_at` y `routing_key` para compatibilidad.
- Las respuestas RFC 7807 incluyen `correlation_id` y `timestamp`. Se añadió
  `NODE_ID` a `.env.example` y se alinearon el contrato AsyncAPI, el backlog y
  los hallazgos P00/P11.
- El contrato de vuelos contempla identidad de usuario, pero el código actual
  no contiene un cliente HTTP saliente de vuelos; no se inventó esa integración.

## Pruebas y validación

- Las pruebas nuevas se ejecutaron primero contra el comportamiento anterior y
  fallaron por ausencia de `correlation_id` en RFC 7807 y de atributos CloudEvents
  en los eventos. Pasaron después de la implementación.
- `npm run build`: **correcto**.
- `npm test -- --runInBand`: **20 suites, 771 pruebas aprobadas**.
- El YAML AsyncAPI se parseó correctamente y contiene el esquema común
  `CloudEventAttributes`.
- Validación suplementaria `npm run test:contracts -- --runInBand`: **falló**
  en el test de integración preexistente `circuit-breaker-resilience.spec.ts`
  (10 fallos de configuración y 24 pruebas aprobadas). El fixture no registra
  `AtraccionRepository` para `NodesService`; esa dependencia ya existía en
  `HEAD` antes de I02. No se modificó ese fixture ajeno al alcance.
- `git diff --check`: **correcto**.

## Archivos y commit

Se actualizaron el contexto HTTP, el filtro RFC 7807, los clientes salientes,
los publicadores RabbitMQ/Kafka, el contrato AsyncAPI, `.env.example` y la
documentación de seguimiento. Se añadieron pruebas de middleware, spans,
errores y publicación de eventos.

Commit solicitado: `feat(observability): propaga correlation-id, traceparent y node_id [I02]`
