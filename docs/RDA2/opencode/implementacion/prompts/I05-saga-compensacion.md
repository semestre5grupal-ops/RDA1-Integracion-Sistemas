# I05 — Saga de checkout: robustez y pruebas de compensación

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Depende de I02 e I04.

## Objetivo
Asegurar que la saga cumple lo descrito en `contracts/esb-sagas-openapi-v2.yaml`: pasos ordenados, **compensación LIFO**, referencia `REF-SAGA-XXXXXX`, trazabilidad y consulta de estado.

## Lee primero
`src/modules/esb/*` (orquestador, estado de sagas, compensaciones), `contracts/esb-sagas-openapi-v2.yaml`, `docs/RDA2/entregas/P01-reporte.md`, hallazgos de P01, `test/` y `runner-pruebas.js` (pruebas existentes de saga).

## Alcance
1. **Pasos y compensaciones:** cada paso tiene su compensación; ante fallo en el paso N se compensan N-1…1 en orden inverso. Una compensación que falla se reintenta y, si agota, queda `COMPENSATION_FAILED` visible y con alerta en el log.
2. **Persistencia de estado de la saga** (en BD o la estructura existente) con: `correlationId`, `referencia`, `estado`, pasos con `status`, `started_at`, `ended_at`, `error`, compensaciones. Si el estado vive solo en memoria, persistirlo (SQL sin aplicar en `database/migrations/`) detrás de `SAGA_STORE=memory|db`.
3. **Idempotencia:** misma `Idempotency-Key` en `POST /esb/checkout-saga` → misma respuesta, sin repetir cargos ni reservas (`Idempotent-Replayed: true`).
4. **Circuit breaker y fallback:** timeout 5 s por paso; vertical caída → comportamiento descrito en el contrato (`CONFIRMED_FALLBACK`/`external_sync_pending`).
5. **Eventos de saga** publicados por RabbitMQ con los nombres del AsyncAPI.
6. `GET /esb/sagas` y `GET /esb/sagas/{correlationId}` devuelven el estado real con los pasos.

## Pruebas obligatorias (en `test/`)
- Camino feliz completo.
- Fallo en cada uno de los pasos → verifica el **orden inverso** de las compensaciones.
- Falla una compensación → estado `COMPENSATION_FAILED`.
- Misma `Idempotency-Key` dos veces.
- Vertical con timeout → fallback.

## Criterios de aceptación
- [ ] Todas las pruebas anteriores pasan y se pueden correr con `npm test`.
- [ ] Respuestas coinciden con el contrato (valida con la utilidad de I11 si ya existe; si no, a mano).

## Entrega
Commit: `feat(esb): saga con compensacion LIFO, idempotencia y estado persistente [I05]`
