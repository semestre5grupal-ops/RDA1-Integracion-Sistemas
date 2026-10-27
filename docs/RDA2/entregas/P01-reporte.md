# Reporte P01 — ESB y Sagas (contrato OpenAPI v2)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/esb-sagas-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del ESB y Orquestador Saga LIFO v2 con 5 rutas implementadas y 1 planificada. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P01-01 a H-P01-05 (seguridad, idempotencia, grafos y eventos). |
| `docs/RDA2/entregas/P01-reporte.md` | Creado | Reporte formal de entrega de la tarea P01. |

---

## Cobertura de rutas (controlador vs contrato)

Todas las rutas declaradas en `src/modules/esb/esb.controller.ts` fueron analizadas y documentadas exhaustivamente, complementadas con el endpoint planificado de observabilidad tipo grafo requerido por la cátedra:

| Método | Ruta | Handler | En el contrato | x-status | x-microservice |
|---|---|---|:---:|---|---|
| `POST` | `/esb/checkout-saga` | `checkoutSaga` | Sí | `implemented` | `ORQ_RES` |
| `GET` | `/esb/sagas/:correlationId` | `getSaga` | Sí | `implemented` | `MS_AUD` |
| `GET` | `/esb/sagas` | `listarSagas` | Sí | `implemented` | `MS_AUD` |
| `GET` | `/esb/aggregate/mis-reservas/:cliente` | `getMisReservasAgregadas` | Sí | `implemented` | `ORQ_RES` |
| `GET` | `/esb/aggregate/facturas/:facturaId` | `getFacturaCompleta` | Sí | `implemented` | `ORQ_FAC` |
| `GET` | `/esb/sagas/:correlationId/traza` | N/A (planificado) | Sí | `planned` | `MS_AUD` |

**Cobertura:** 5/5 rutas del controlador cubiertas (100%) + 1 ruta de extensión planificada para soporte de observabilidad.

---

## Validación (comando y resultado resumido)

```bash
npx --yes @redocly/cli@1 lint contracts/esb-sagas-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[1].url` (`http://localhost:3000/api/v2`), requerido por convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Reutilización de componentes comunes (`contracts/common/components-v2.yaml`):**
   - Se importaron mediante `$ref` los esquemas `ProblemDetails`, los parámetros `CorrelationId` e `IdempotencyKeyOptional`, los encabezados de respuesta `X-Correlation-Id` y las respuestas estándar `Problem400`, `Problem404` y `Problem500`.
2. **Respuesta 409 Conflict enriquecida para compensación Saga:**
   - Se diseñó el esquema `SagaRollbackProblemDetails` que hereda la estructura de RFC 7807 e incorpora los campos reales devueltos por el código: `codigo_compensacion` (formato `REF-SAGA-XXXXXX`), `compensaciones_ejecutadas` y `timestamp`.
3. **Valores permitidos en `simular_fallo_en_paso`:**
   - Del análisis directo de `saga-orchestrator.service.ts` se dedujeron los 3 valores reales aceptados: `'PAGO_RECHAZADO'`, `'PAGO_TIMEOUT'` e `'INVENTARIO_AGOTADO'`.
4. **Asignación de microservicios (`x-microservice`):**
   - De acuerdo a la arquitectura oficial de Paúl Rosero (§5.2 y Capa 5):
     - Checkout y Mis Reservas corresponden a `ORQ_RES` (Orquestador de Reservas y Sagas).
     - Ensamblaje de facturas completas corresponde a `ORQ_FAC` (Orquestador Fiscal).
     - Bitácora y trazas de sagas corresponden a `MS_AUD` (Microservicio de Auditoría).
5. **Ruta planificada de observabilidad tipo grafo:**
   - La cátedra (§6.5 y Semana 8) exige que el panel de observabilidad visualice la Saga como un grafo con nodos en verde/rojo y árbol de spans W3C Trace Context. Dado que `GET /esb/sagas/{correlationId}` solo entrega registros planos de BD, se propuso y documentó `GET /esb/sagas/{correlationId}/traza` con `x-status: planned`.

---

## Hallazgos registrados (IDs)

Los siguientes hallazgos fueron documentados en `docs/RDA2/HALLAZGOS_CONTRATOS.md`:

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P01-01** | Alta | `EsbController` no declara Guards de autenticación; todos los endpoints son públicos (`security: []`). |
| **H-P01-02** | Media | `Idempotency-Key` es opcional en `POST /esb/checkout-saga` y autogenera claves si falta, vulnerando la regla de idempotencia estricta. |
| **H-P01-03** | Media | `GET /esb/sagas/{correlationId}` retorna pasos planos en vez del grafo interactivo (nodos verde/rojo y spans) exigido por la cátedra. |
| **H-P01-04** | Media | Los eventos de ciclo de vida de la Saga solo se guardan en base de datos y Winston; no se emiten a RabbitMQ ni Kafka. |
| **H-P01-05** | Baja | `GET /esb/sagas` carece de paginación formal por cursor/offset y límites máximos configurables. |

---

## Dudas para el revisor

1. ¿Se prevé migrar en una fase posterior el orquestador de checkout de llamadas síncronas en memoria a coreografía asíncrona pura sobre colas `q.sagas.compensacion` de RabbitMQ, o se mantendrá el modelo orquestador actual con publicación de eventos de auditoría vía Outbox?
2. Para el endpoint `GET /esb/aggregate/mis-reservas/{cliente}`, ¿debería restringirse a que un usuario solo pueda consultar sus propias reservas mediante el token JWT de Supabase, permitiendo únicamente al rol `ADMIN` consultar clientes arbitrarios?
