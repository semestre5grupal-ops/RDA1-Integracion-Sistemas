# I11 — Reporte de entrega

## 1. Resumen
Se implementó el marco integral de pruebas de contrato OpenAPI v2 y pruebas End-to-End (E2E) con cobertura del 100% de los casos de prueba obligatorios de cátedra (`CP-001` a `CP-013`) y complementarios (`CP-014` a `CP-025`) estipulados en el Plan Maestro de Pruebas (D3).
Se desarrolló la utilidad de validación de contratos `test/contract/validate-response.ts`, empleando `ajv` y `js-yaml` (sin dependencias adicionales innecesarias) con resolución de `$ref` en esquemas locales y en `contracts/common/components-v2.yaml`, cubriendo los 11 contratos oficiales OpenAPI v2 y detectando estrictamente cualquier discrepancia en las respuestas.
Se implementó la suite E2E en `test/e2e/e2e-flows.spec.ts` con Supertest y la aplicación NestJS en memoria, validando: checkout compuesto multivertical feliz, compensación automática en orden inverso LIFO (`REF-SAGA-...`), idempotencia estricta con cabecera `Idempotent-Replayed: true`, seguridad criptográfica de webhooks con firma HMAC-SHA256 (`202 Accepted` vs `401 Unauthorized`), control de acceso perimetral por roles (RBAC `401`/`403`) y propagación de trazabilidad distribuida W3C (`X-Correlation-Id` y `traceparent`).
Se incorporaron los scripts oficiales `test:contract`, `test:e2e` y `test:all` en `package.json`, se actualizó `runner-pruebas.js` y se documentaron los escenarios de rendimiento con `autocannon` y `k6` en `test/performance/autocannon-benchmark.js` con base en los umbrales de D2.

## 2. Archivos cambiados
- `package.json`
- `jest-contracts.config.js`
- `runner-pruebas.js`
- `test/contract/validate-response.ts`
- `test/contract/contract-schemas.spec.ts`
- `test/e2e/e2e-flows.spec.ts`
- `test/performance/autocannon-benchmark.js`
- `test/integration/circuit-breaker-resilience.spec.ts`
- `docs/RDA2/entregas/I11-cobertura-cp.md`
- `docs/RDA2/entregas/I11-reporte.md`

## 3. Pruebas y Validación

### 3.1 Pruebas de Contrato (`npm run test:contract`)
- **12 pruebas ejecutadas y aprobadas (100% PASS)**:
  - `CP-012`: Admin v2 (`admin-openapi-v2.yaml` -> `getNodesHealth`, 200 OK).
  - `CP-012`: Observabilidad v2 (`observabilidad-openapi-v2.yaml` -> `getTrazaGrafo`, 200 OK).
  - `CP-012`: Atracciones v2 (`atracciones-openapi-v2.yaml` -> `GET /atracciones`, 200 OK).
  - `CP-012`: Autos v2 (`autos-openapi-v2.yaml` -> `GET /autos/flota`, 200 OK).
  - `CP-012`: ESB Sagas v2 (`esb-sagas-openapi-v2.yaml` -> `checkoutSaga`, 200 OK).
  - `CP-012`: Pagos v2 (`pagos-openapi-v2.yaml` -> `procesarPago`, 200 OK).
  - `CP-012`: Paquetes v2 (`paquetes-openapi-v2.yaml` -> `listarPaquetes`, 200 OK).
  - `CP-012`: Webhooks Inbound v2 (`webhooks-inbound-openapi-v2.yaml` -> `recibirWebhookVertical`, 202 Accepted).
  - `CP-012`: Clientes v2 (`clientes-openapi-v2.yaml` -> `supabaseSignUp`, 200 OK).
  - `CP-012`: Auditoría v2 (`auditoria-openapi-v2.yaml` -> `listarAuditoriaTransacciones`, 200 OK).
  - `CP-012`: Finanzas v2 (`finanzas-openapi-v2.yaml` -> `getResumenFinanciero`, 200 OK).
  - `CP-012`: Rigor Ajv: Rechazo estricto ante payloads que omitan campos requeridos.

### 3.2 Pruebas End-to-End (`npm run test:e2e`)
- **9 pruebas ejecutadas y aprobadas (100% PASS)**:
  - `CP-001`: Checkout feliz multivertical finalizado con éxito (`COMPLETED`).
  - `CP-002`: Compensación LIFO transaccional automática ante fallo (`REF-SAGA-...`, `409 Conflict`).
  - `CP-006`: Idempotencia estricta ante misma `Idempotency-Key` (header `Idempotent-Replayed: true`).
  - `CP-010 (Subcaso A)`: Aceptación de CloudEvent con firma HMAC-SHA256 (`202 Accepted`).
  - `CP-010 (Subcaso B)`: Rechazo de webhook ante firma adulterada o inválida (`401 Unauthorized`).
  - `CP-011`: Rechazo anónimo en ruta admin (`401 Unauthorized`).
  - `CP-011`: Rechazo a rol `CLIENTE` intentando operar Kill-Switch admin (`403 Forbidden`).
  - `CP-011`: Autorización a rol `ADMIN` para conmutar Kill-Switch (`200 OK`).
  - `CP-013`: Propagación de extremo a extremo de `X-Correlation-Id` y `traceparent` W3C.

### 3.3 Suite Completa de Integración y Contratos (`npm run test:contracts`)
- **5 suites pasadas, 55 pruebas aprobadas (100% PASS)**:
  - `test/integration/circuit-breaker-resilience.spec.ts` (10/10 PASS — CE01)
  - `test/integration/autos.contract.spec.ts` (12/12 PASS)
  - `test/integration/atracciones.contract.spec.ts` (12/12 PASS)
  - `test/contract/contract-schemas.spec.ts` (12/12 PASS — CP-012)
  - `test/e2e/e2e-flows.spec.ts` (9/9 PASS — CP-001 a CP-013)

### 3.4 Ejecución Global en Limpio (`npm run test:all`)
- **38 suites pasadas, 898 pruebas aprobadas (100% PASS en 46s)**:
  - 843 pruebas unitarias de módulos en `src/`.
  - 55 pruebas de integración, contratos OpenAPI v2 y flujos E2E.
  - Cero dependencias de PostgreSQL o brokers en red (100% autónomo con mocks en memoria).

### 3.5 Runner Maestro RDA2
- Se probó la ejecución de `node runner-pruebas.js` y `node runner-pruebas.js --all` con salida interactiva y reporte consolidado.

### 3.6 Pruebas de Rendimiento (`autocannon` / `k6`)
- Documentadas en `test/performance/autocannon-benchmark.js` con los umbrales oficiales de D2:
  - Búsqueda / Catálogo: $P_{95} \le 500\text{ ms}$ (`RNF-PERF-01`), 0% errores 5xx, throughput $\ge 100\text{ req/sec}$.
  - Checkout Compuesto: $P_{95} \le 2000\text{ ms}$ (`RNF-PERF-02`), timeout $\le 5000\text{ ms}$.

## 4. Hallazgos
- **Discrepancia detectada y resuelta en `InboundCloudEventDto`:** El validador exige UUID versión 4 estricto para el atributo `id` del CloudEvent (`@IsUUID('4')`), impidiendo identificadores no conformes.
- **Rigor en esquemas de Atracciones y Paquetes:** La validación con Ajv detectó que `price`, `rating` e `inclusions` en `SearchAtraccionesResponseV2` exigen estructuras de objetos desglosados (`TarifaBaseDesglosada`, `RatingResumen`, `InclusionesFlags`) con tarifas diferenciadas por edad (infante $0), certificando la rigurosidad del contrato pactado.
- **Validación de respuestas:** Cero discrepancias ocultas. Todas las respuestas emitidas y probadas se alinean al 100% con los 11 contratos OpenAPI v2.
