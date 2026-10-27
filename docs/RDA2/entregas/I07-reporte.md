# I07 — Reporte de entrega

## 1. Resumen
Se implementó el receptor público v2 de CloudEvents con HMAC-SHA256 sobre el cuerpo crudo y deduplicación persistente por `event_id`.
Las nuevas entregas se guardan y publican asíncronamente en RabbitMQ; los reintentos reciben HTTP 200 con `Idempotent-Replayed: true`.
Se añadió la consulta ADMIN de entregas, límites de cuerpo y solicitudes, la utilidad de firma y la migración SQL sin aplicar.

## 2. Archivos cambiados
- `.env.example`
- `contracts/webhooks-inbound-openapi-v2.yaml`
- `database/migrations/20261025_webhooks_entregas.sql`
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`
- `docs/RDA2/PLANNED_ENDPOINTS.md`
- `docs/RDA2/entregas/I07-reporte.md`
- `scripts/webhooks/sign.js`
- `src/app.module.ts`
- `src/main.ts`
- `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts`
- `src/modules/event-bus/tracing-event-publish.spec.ts`
- `src/modules/webhooks/dto/inbound-cloud-event.dto.ts`
- `src/modules/webhooks/dto/list-webhook-deliveries.dto.ts`
- `src/modules/webhooks/entities/index.ts`
- `src/modules/webhooks/entities/webhook-entrega.entity.ts`
- `src/modules/webhooks/webhooks-rate-limit.guard.ts`
- `src/modules/webhooks/webhooks-rate-limit.guard.spec.ts`
- `src/modules/webhooks/webhooks.controller.ts`
- `src/modules/webhooks/webhooks.controller.spec.ts`
- `src/modules/webhooks/webhooks.module.ts`
- `src/modules/webhooks/webhooks.service.ts`
- `src/modules/webhooks/webhooks.service.spec.ts`

## 3. Pruebas
- Las pruebas HTTP cubren HMAC/raw body válido (202), firma inválida (401), replay (200 y cabecera), vertical desconocida (404), CloudEvent inválido (400), cuerpo mayor de 1 MB (413) y autorización ADMIN del historial.
- Las pruebas de servicio cubren publicación asíncrona, persistencia/deduplicación, paginación y cursor inválido. La guarda tiene prueba del límite y `Retry-After`; el event bus verifica que el fallback de auditoría no registre el payload del evento.
- Pruebas enfocadas I07 y event bus: **4 suites, 15 pruebas pasaron**.
- `npm run build`: pasó.
  ```text
  > booking-prototipo-plantilla@1.0.0 build
  > nest build
  ```
- `npm test` (ejecución paralela predeterminada): dos ejecuciones encontraron una prueba de timing ajena a I07 en `src/modules/alojamientos/pruebas-http/07-ordenes.http.spec.ts`; el límite superior era 1.801.000 ms y midió 1.801.868 ms y 1.801.724 ms. Esa prueba pasó aislada (**76/76**).
- `npm test -- --runInBand`: **29 suites y 819 pruebas pasaron**.
- `npm run lint -- --no-fix`: no se pudo ejecutar porque el entorno no tiene `eslint` (`eslint: command not found`); no se instaló ninguna dependencia.
- `npx --yes @redocly/cli@1 lint contracts/webhooks-inbound-openapi-v2.yaml`: contrato válido, sin errores; una advertencia esperada por el servidor local `http://localhost:3000/api/v2`.
- `node scripts/webhooks/sign.js vuelos` se verificó con un secreto temporal de prueba, sin leer `.env`.

## 4. Compatibilidad v1
- Ambas rutas tienen `@Version('2')`; el receptor y el historial se exponen bajo `/api/v2`, sin rutas nuevas en `/api/v1`.
- Los parsers existentes conservan el límite global configurado de 5 MB; se captura raw body solo para `/api/v2/webhooks/...` y se acepta el media type estructurado de CloudEvents.
- Los cambios CORS son aditivos: se permite `X-Webhook-Signature` y se expone `Idempotent-Replayed`.
- El endpoint POST es público por diseño, autenticado mediante HMAC. El historial exige JWT Supabase y rol `ADMIN`.

## 5. Contratos/documentos actualizados
- OpenAPI de webhooks: operaciones POST/GET marcadas `implemented`; documenta las variables de secreto, la bitácora, la respuesta de replay, el límite de 1 MB, el rate limit y los estados persistidos.
- Hallazgos/backlog actualizados: H-P09-01, H-P09-02 y H-P09-04 resueltos; H-P09-03 queda pendiente de normalización entre socios.
- `.env.example`: variables vacías `WEBHOOK_SECRET_VUELOS`, `WEBHOOK_SECRET_AUTOS`, `WEBHOOK_SECRET_ATRACCIONES`, `WEBHOOK_SECRET_ALOJAMIENTOS` y valor local predeterminado de `WEBHOOK_RATE_LIMIT_MAX=60`.
- Migración nueva `20261025_webhooks_entregas.sql` para la bitácora durable en `schema_auditoria`. **No aplicada**.

## 6. Supuestos y decisiones
- Se referencia un secreto de entorno por vertical (`WEBHOOK_SECRET_{VERTICAL}`), con mínimo 16 caracteres, en vez de persistir secretos cifrados en `ConfigProveedor`. El contrato actual modela una ruta de recepción por vertical y los datos de nodos incluyen un socio sembrado por vertical; si se habilitan varios proveedores independientes por vertical habrá que resolver un identificador de proveedor inequívoco.
- La deduplicación usa una restricción única global sobre `event_id`. El duplicado devuelve la fecha de recepción original; no crea otra fila. Los intentos con firma inválida se auditan sin persistir el ID no autenticado para evitar que una petición falsificada reserve un identificador.
- El rate limit predeterminado es 60 solicitudes/minuto por IP y proceso, configurable con `WEBHOOK_RATE_LIMIT_MAX`; el servicio en memoria no coordina límites entre réplicas.
- RabbitMQ recibe el CloudEvent íntegro por `booking.webhooks.inbound.{vertical}`. No se añadieron reacciones de negocio por tipo: la matriz del contrato no define aún contratos de consumidor para vincular facturas ni una correlación inequívoca para disparar compensaciones. Esas reacciones permanecen como trabajo pendiente; el receptor solo ingresa y publica los eventos.
- No se leyó ningún `.env*`, no se conectó a servicios externos y no se aplicó la migración.

## 7. Pendiente / no pude verificar
- Las reacciones de dominio de la matriz P09 (emisión de factura, notificaciones/cancelaciones, ajustes de inventario, etc.) requieren definición de consumidores, correlación y datos contractuales; en I07 se publican los eventos, sin ejecutar esas reacciones.
- No se verificó la persistencia contra una base PostgreSQL ni la publicación/consumo con un broker RabbitMQ real.
- La prueba de órdenes que mide duración de preview puede exceder su estrecho margen durante la ejecución paralela; pasó aislada y en la suite serial completa.
- El lint TypeScript no está disponible porque falta `eslint`; validar con `npm run lint` cuando se instale/restaure esa dependencia en el entorno de desarrollo.

## 8. Cómo probarlo a mano
1. En un entorno local, configura `WEBHOOK_SECRET_VUELOS` con una clave de prueba de al menos 16 caracteres. La utilidad no carga archivos `.env`:

   ```powershell
   $env:WEBHOOK_SECRET_VUELOS = 'secreto-local-de-prueba-con-entropia'
   node scripts/webhooks/sign.js vuelos
   ```

   Copia el JSON de la línea `Body:` y el valor `X-Webhook-Signature:` que imprime el script. Envíalos sin reformatear el cuerpo:

   ```powershell
   $body = '<JSON copiado de Body:>'
   $signature = 'sha256=<firma copiada>'
   curl.exe -X POST http://localhost:3000/api/v2/webhooks/vuelos `
     -H "Content-Type: application/cloudevents+json" `
     -H "X-Webhook-Signature: $signature" `
     --data-binary $body
   ```

2. Repite la petición con el mismo cuerpo y firma; debe responder 200 y `Idempotent-Replayed: true`. Una firma modificada debe responder 401.
3. Consulta el historial con un token ADMIN válido:

   ```powershell
   curl.exe "http://localhost:3000/api/v2/webhooks/vuelos/entregas?limit=20" `
     -H "Authorization: Bearer <token-admin>"
   ```

4. Para revisar el rechazo de tamaño, envía un CloudEvent firmado cuyo cuerpo crudo exceda 1 MB; debe responder 413. Para probar el rate limit, realiza más solicitudes desde la misma IP que el máximo configurado y verifica el 429/`Retry-After`.
