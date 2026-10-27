# I11 — Pruebas de contrato y E2E

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Ejecutar **al final** (después de I01–I10), basándote en `docs/RDA2/PLAN_DE_PRUEBAS.md`.

## Objetivo
Convertir el plan de pruebas (D3) en pruebas ejecutables y comprobar que las respuestas reales cumplen los contratos.

## Lee primero
`docs/RDA2/PLAN_DE_PRUEBAS.md`, `MATRIZ_TRAZABILIDAD.md`, `test/`, `runner-pruebas.js`, `package.json` (scripts), contratos `*-v2.yaml`.

## Alcance
1. **Pruebas de contrato:** utilidad `test/contract/validate-response.ts` que, dado un `operationId`, valida la respuesta real contra el schema del OpenAPI (usa `ajv`/`openapi-response-validator` solo si ya está; si no, una sola dependencia de desarrollo justificada). Cubre al menos 1 operación `implemented` por contrato.
2. **E2E** (supertest sobre la app Nest con bus en memoria y simulador de pagos): checkout feliz, saga con fallo + compensación, idempotencia, webhook firmado, 401/403 por rol, correlación de extremo a extremo.
3. **Casos CP-NNN** del plan: añade al nombre de cada `it(...)` su ID (`CP-012`) para trazabilidad y genera `docs/RDA2/entregas/I11-cobertura-cp.md` con tabla CP → archivo de prueba → estado (pasa / falla / no automatizable).
4. **Scripts npm:** `test:contract`, `test:e2e` y `test:all`. Actualiza `runner-pruebas.js` para ejecutarlos si corresponde.
5. **Rendimiento básico:** un escenario `autocannon`/`k6` documentado (no obligatorio ejecutarlo en CI) para búsqueda y checkout, con los umbrales de D2.

## Criterios de aceptación
- [ ] `npm run test:all` pasa en limpio (sin brokers ni BD real).
- [ ] La tabla CP muestra el % de casos automatizados y los que quedan.
- [ ] Cualquier discrepancia contrato ↔ respuesta real se anota como hallazgo (no se oculta).

## Entrega
Commit: `test(contract): pruebas de contrato y e2e trazadas a CP [I11]`
