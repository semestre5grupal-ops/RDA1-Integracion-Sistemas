# Reporte I05 — Saga con compensación LIFO, idempotencia y estado persistente

## 1. Resumen

Se robusteció el orquestador Saga del ESB implementando rollback compensatorio en orden estrictamente inverso (LIFO) con reintentos y transición a `COMPENSATION_FAILED`, idempotencia con header `Idempotent-Replayed: true`, y tolerancia a fallos con estado `CONFIRMED_FALLBACK`.
Se habilitó la persistencia dual en memoria y PostgreSQL configurable mediante `SAGA_STORE=memory|db`, junto con la publicación autoritativa de eventos de ciclo de vida (`saga.started`, `saga.step.completed`, `saga.compensating`, `saga.compensated`, `order.confirmed`) hacia RabbitMQ (`booking.events`).
Todos los builds (`nest build`), linting de OpenAPI (`redocly lint`) y suites de pruebas pasaron con 100% de éxito (23 suites, 790 pruebas).

## 2. Archivos cambiados

- `.env.example` — Documenta la variable de entorno `SAGA_STORE=memory|db` para seleccionar el mecanismo de almacenamiento de la Saga.
- `contracts/esb-sagas-openapi-v2.yaml` — Se documenta el encabezado `Idempotent-Replayed` en la respuesta 200 de `POST /esb/checkout-saga`.
- `database/migrations/20261025_saga_store.sql` — Script DDL sin aplicar que define las tablas `schema_auditoria.saga_transacciones` y `schema_auditoria.saga_pasos_journal` con índices de correlación.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md` — Se marca `BL-013` como resuelto.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md` — Se marcan `H-P01-02` (idempotencia) y `H-P01-04` (emisión de eventos de Saga) como resueltos en I05.
- `src/app.module.ts` — Inclusión de importación faltante de `SecurityModule`.
- `src/main.ts` — Inclusión de importaciones de `TraceContextInterceptor` y `TraceContextService`.
- `src/modules/chatbot/chatbot.module.ts` — Inclusión de importación faltante de `ChatbotRateLimitGuard`.
- `src/modules/esb/esb.controller.ts` — Soporte de idempotencia con almacenamiento de respuestas previas y emisión de `Idempotent-Replayed: true`.
- `src/modules/esb/interna/saga-orchestrator.service.ts` — Lógica central de Saga: timeouts (5s), compensaciones LIFO con hasta 2 reintentos, fallback en timeout, dual store (`memory`/`db`), y emisión de eventos CloudEvents a RabbitMQ mediante `KafkaRabbitBridgeService`.
- `src/modules/esb/saga-compensacion.spec.ts` — Suite unitaria que valida los 5 escenarios obligatorios de I05.
- `test/i05-saga-compensacion.spec.ts` — Suite en carpeta `test/` para consistencia del runner.
- `docs/RDA2/entregas/I05-reporte.md` — Este reporte de entrega.

## 3. Pruebas y salidas

Se ejecutaron pruebas unitarias e integración en TDD previo a la consolidación:
- `npx jest src/modules/esb/saga-compensacion.spec.ts`
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 5 passed, 5 total`
  - Escenarios cubiertos:
    1. Camino feliz completo (`COMPLETED`, eventos emitidos a RabbitMQ).
    2. Fallo en el paso de pago -> orden inverso LIFO verificado (`MS_AUT` -> `MS_ATR`).
    3. Falla de compensación -> reintentos (2/2) y estado final `COMPENSATION_FAILED` con alerta crítica.
    4. Idempotencia: misma `Idempotency-Key` -> respuesta idéntica y header `Idempotent-Replayed: true` sin re-cobrar ni re-reservar.
    5. Vertical con timeout / contingencia -> `CONFIRMED_FALLBACK` y `external_sync_pending: true`.

- Suite completa: `npx jest --maxWorkers=2`
  - `Test Suites: 23 passed, 23 total`
  - `Tests: 790 passed, 790 total`
  - `Snapshots: 0 total`
  - `Time: 13.173 s`

- Compilación TypeScript: `npm run build`
  - `> nest build`
  - Código de salida: `0` (exitoso).

- Validación OpenAPI: `npx --yes @redocly/cli@1 lint contracts/esb-sagas-openapi-v2.yaml`
  - `Woohoo! Your API description is valid. 🎉`
  - `0 errors, 1 warning (localhost server url de desarrollo local)`.

## 4. Compatibilidad `/api/v1`

- No se alteró ningún endpoint bajo `/api/v1/*`. Todas las modificaciones del ESB residen bajo el módulo ESB y sus rutas `/esb/*` y contratos v2 (`/api/v2`).
- Las reservas individuales de verticales turísticas (Alojamientos, Autos, Vuelos, Paquetes) y sus endpoints `/api/v1/*` conservan intactas sus firmas, parámetros y respuestas.
- En caso de inyección de contingencias o fallos, el ESB maneja la compensación de forma desacoplada y devuelve respuestas HTTP 200/409 conformes al contrato v2 sin impactar la lógica legacy.

## 5. Contratos/documentos actualizados

- `contracts/esb-sagas-openapi-v2.yaml`:
  - Se agregó el header `Idempotent-Replayed` a la respuesta HTTP 200 de `POST /esb/checkout-saga`.
  - El linter de Redocly valida la especificación sin errores.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`:
  - `BL-013` ("Publicación de eventos de ciclo de vida Saga en RabbitMQ") marcado como completado en I05.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
  - `H-P01-02` (Idempotencia estricta en checkout Saga) marcado como resuelto.
  - `H-P01-04` (Eventos de ciclo de vida Saga emitidos a RabbitMQ) marcado como resuelto.

## 6. Supuestos y decisiones tomadas

- **LIFO Compensatorio:** El orden de pasos ejecutados se almacena en el journal (`pasos_ejecutados`). Al fallar un paso posterior (como el cobro en `MS_PAG`), los pasos previos confirmados se compensan iterando en reversa (`.reverse()`), garantizando el orden inverso exacto (por ejemplo: primero Autos, luego Alojamientos/Atracciones).
- **Reintentos de compensación:** Se configuran hasta 2 reintentos por paso en compensación. Si un servicio externo no responde o falla de forma sostenida tras los reintentos, el estado de la saga transiciona a `COMPENSATION_FAILED` y se emite un log de severidad crítica (`[CRITICAL_ALERT]`).
- **Idempotencia:** Se implementa un almacén de claves en `EsbController`. Cuando se detecta una `Idempotency-Key` ya procesada, se devuelve la respuesta en caché inyectando la cabecera HTTP `Idempotent-Replayed: true`, impidiendo cargos bancarios o reservas duplicadas.
- **Persistencia dual (`SAGA_STORE`):** Si `SAGA_STORE=db`, se persiste en PostgreSQL mediante `SupabaseService` (`schema_auditoria.saga_transacciones` y `schema_auditoria.saga_pasos_journal`). Si `SAGA_STORE=memory` (o la BD no está configurada), se gestiona en memoria sin fallar la aplicación, lo que asegura que las pruebas y entornos sin base de datos activa funcionen sin fricción.
- **Circuit breaker y timeout:** Cada llamada a microservicios dentro de la Saga se ejecuta protegida por una promesa con timeout de 5 segundos (`executeWithTimeout`). Si expira, se maneja el modo de contingencia marcando el paso como `CONFIRMED_FALLBACK` y `external_sync_pending: true`.

## 7. Pendiente / no pude verificar

- No se ejecutó la migración SQL física `database/migrations/20261025_saga_store.sql` contra una instancia de PostgreSQL remota en Render/Supabase, dejándose lista como script DDL versionado para despliegue controlado.
- La verificación de RabbitMQ real utiliza el fallback en memoria / mock de `KafkaRabbitBridgeService` provisto por el entorno de pruebas, ya que no hay un broker RabbitMQ vivo levantado localmente durante la ejecución de los tests.

## 8. Cómo probarlo a mano

1. **Iniciar el backend:**
   ```bash
   npm run start:dev
   ```

2. **Ejecutar Checkout Saga exitoso (Camino feliz):**
   ```bash
   curl -i -X POST http://localhost:3000/esb/checkout-saga \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: saga-test-key-001" \
     -H "X-Correlation-Id: test-corr-001" \
     -d '{
       "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
       "cliente_email": "turista@ejemplo.com",
       "cliente_nombre": "Turista Prueba",
       "metodo_pago": "TARJETA_CREDITO",
       "numero_tarjeta": "4111222233334444",
       "items": [
         {
           "vertical": "ATRACCIONES",
           "item_id": "atr-01",
           "nombre": "Tour Mitad del Mundo",
           "cantidad": 1,
           "precio_unitario": 30.00
         },
         {
           "vertical": "AUTOS",
           "item_id": "aut-02",
           "nombre": "Chevrolet Tracker",
           "cantidad": 2,
           "precio_unitario": 50.00
         }
       ]
     }'
   ```
   *Respuesta esperada:* HTTP 200 con `estado: "COMPLETED"`, `pago.estado: "APROBADO"`.

3. **Verificar Idempotencia (Reintento idéntico):**
   Ejecutar el mismo comando con `Idempotency-Key: saga-test-key-001`.
   *Respuesta esperada:* HTTP 200, respuesta idéntica, y encabezado `Idempotent-Replayed: true`.

4. **Simular Fallo con Compensación LIFO:**
   ```bash
   curl -i -X POST http://localhost:3000/esb/checkout-saga \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: saga-test-fail-002" \
     -d '{
       "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
       "cliente_email": "turista@ejemplo.com",
       "cliente_nombre": "Turista Prueba",
       "metodo_pago": "TARJETA_CREDITO",
       "numero_tarjeta": "4111222233334444",
       "items": [
         {
           "vertical": "ATRACCIONES",
           "item_id": "atr-01",
           "nombre": "Tour Mitad del Mundo",
           "cantidad": 1,
           "precio_unitario": 30.00
         }
       ],
       "simular_fallo_en_paso": "MS_PAG"
     }'
   ```
   *Respuesta esperada:* HTTP 409 Conflict, identificador `REF-SAGA-...`, y logs que evidencian la compensación inversa de atracciones.

5. **Consultar estado y journal de la Saga:**
   ```bash
   curl -X GET http://localhost:3000/esb/sagas
   ```
   *Respuesta esperada:* Lista de transacciones saga registradas con su estado y pasos en bitácora.
