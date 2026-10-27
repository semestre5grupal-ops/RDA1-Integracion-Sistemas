# P01 — ESB y Sagas (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar el orquestador de compras compuestas (Saga con compensación LIFO) y las vistas agregadas del ESB.

## Salida
- `contracts/esb-sagas-openapi-v2.yaml`
- `docs/RDA2/entregas/P01-reporte.md`
- Sección P01 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/esb/esb.controller.ts`
- `src/modules/esb/interna/saga-orchestrator.service.ts` (interfaz `CheckoutSagaInput`, pasos, respuestas, compensación, `simular_fallo_en_paso`)
- `src/modules/esb/interna/esb-internal-router.service.ts` (agregados)
- `src/modules/esb/entities/saga-transaccion.entity.ts`, `saga-paso-journal.entity.ts`
- `docs Paúl Rosero/architecture/ADR-007-patron-saga-cancelacion-compensatoria.md`
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md` (componentes de la Saga)
- `contracts/common/components-v2.yaml`

## Rutas que debe cubrir (5)
| Método | Ruta | Handler |
|---|---|---|
| POST | `/esb/checkout-saga` | `checkoutSaga` |
| GET | `/esb/sagas/{correlationId}` | `getSaga` |
| GET | `/esb/sagas` | `listarSagas` |
| GET | `/esb/aggregate/mis-reservas/{cliente}` | `getMisReservasAgregadas` |
| GET | `/esb/aggregate/facturas/{facturaId}` | `getFacturaCompleta` |

## Qué debe documentar
1. **`info.description`** con: qué es una Saga aquí; secuencia feliz (reservas por vertical → pago → facturación); compensación **LIFO** (código `REF-SAGA-XXXXXX`); estados de la saga; tabla de pasos.
2. **Schema de entrada** (`CheckoutSagaInput`) con todos los campos reales, incluido el significado de `simular_fallo_en_paso` y sus valores permitidos (léelos del servicio).
3. **Respuestas**: 200 (saga completa) y 409 (fallo + compensación, con `codigo_compensacion`, `pasos_compensados`, lista de compensaciones).
4. **Journal de pasos**: schema de `saga_paso_journal` (orden, vertical, estado, acción compensatoria).
5. `Idempotency-Key` **opcional** en el código (se autogenera si falta): documéntalo así y registra el hallazgo.
6. Mapa **evento ↔ paso** (PedidoCreado, InventarioReservado, PagoProcesado y compensaciones RestaurarInventario / CancelarPedido / ReembolsarPago) como tabla en la descripción, indicando cuáles el código **emite hoy** y cuáles son solo conceptuales.
7. Aclarar que los agregados son el **sustituto oficial de los JOIN entre esquemas** (cátedra CE02).

## Discrepancias ya detectadas (verifícalas y regístralas)
- El controlador no declara guards: ¿cualquiera puede lanzar una compra por `POST /esb/checkout-saga`? (Alta si se confirma.)
- `Idempotency-Key` opcional vs regla de cátedra de idempotencia obligatoria en mutaciones críticas.
- `GET /esb/sagas/{correlationId}` devuelve pasos, pero el dashboard de la cátedra pide un **grafo** (nodos verde/rojo y árbol de spans). Indica si los datos actuales alcanzan; si no, propón `x-status: planned` para `GET /esb/sagas/{correlationId}/traza` y anótalo.
- Eventos de saga: ¿se publican realmente al bus o solo se loguean?

## Criterios de aceptación
- [ ] Las 5 rutas están en el contrato con `x-source` y `x-status`.
- [ ] Redocly lint sin errores.
- [ ] Reutiliza `ProblemDetails` y encabezados de `common/components-v2.yaml`.
- [ ] Reporte con cobertura de rutas, supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P01 esb-sagas openapi v2`
