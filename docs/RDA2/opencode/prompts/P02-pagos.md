# P02 — Pagos (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar el servicio de pagos de Booking y **diseñar la ruta que falta** para que las aerolíneas puedan validar un `paymentReference`.

## Salida
- `contracts/pagos-openapi-v2.yaml`
- `docs/RDA2/entregas/P02-reporte.md`
- Sección P02 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Contexto (importante)
En las ventas hechas por Booking, **Booking cobra** y las tiendas (vuelos, etc.) **solo reciben un `paymentReference`**; no vuelven a cobrar. En el contrato de vuelos (`contracts/vuelos-openapi-v2.yaml`, sección 4 "Pagos" y schema `PaymentReference`) está descrita la regla. Esta tarea formaliza el lado de Booking.

## Lee primero (solo esto)
- `src/modules/pagos/pagos.controller.ts`
- `src/modules/pagos/pagos.service.ts` (campos reales de entrada y salida, modos del simulador, códigos `REF-PAG-...`)
- `src/modules/pagos/entities/transaccion-pago.entity.ts`
- `src/modules/esb/interna/saga-orchestrator.service.ts` (solo las llamadas a `pagosService`)
- `contracts/vuelos-openapi-v2.yaml` (sección 4 de la descripción y schema `PaymentReference`)
- `frontend/src/components/FormularioReserva.jsx` (cómo se genera hoy la referencia)
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md`
- `contracts/common/components-v2.yaml`

## Rutas implementadas (5)
| Método | Ruta | Handler |
|---|---|---|
| POST | `/pagos/procesar` | `procesarPago` |
| POST | `/pagos/reembolsos` | `procesarReembolso` |
| GET | `/pagos/simulador/config` | `getConfigSimulador` |
| POST | `/pagos/simulador/config` | `updateConfigSimulador` |
| GET | `/pagos/transacciones` | `getTransacciones` |

## Rutas planificadas (`x-status: planned`, `x-source: n/a`)
| Método | Ruta | Para qué |
|---|---|---|
| GET | `/pagos/{paymentReference}` | Que una aerolínea valide el pago: `status` (`CAPTURED`, `REFUNDED`, `FAILED`), `amount`, `currency`, `captured_at`, `correlation_id`. 404 si no existe. Debe poder llamarse con token de servicio. |

Define en la descripción **qué campo actual del servicio es el `paymentReference`** (por ejemplo `transaccion_id`). Si el servicio no devuelve un identificador público estable, dilo y registra el hallazgo.

## Qué debe documentar
1. Flujo de cobro con `Idempotency-Key` (en el código es opcional: documenta lo real y registra hallazgo). Reintento con la misma clave → misma respuesta.
2. Respuestas: 200 aprobado (con código de autorización), **402** fondos insuficientes, **504** timeout (simulados), 400/409/422 si el código los devuelve.
3. **Simulador de fallos** (`NORMAL`, `RECHAZO_FONDOS`, `TIMEOUT_RED`, latencia): marca estas dos rutas como de uso interno de pruebas/Panel de administración.
4. Reembolsos: entrada, salida y código `REF-PAG-...`; relación con la compensación de la Saga.
5. Eventos que el servicio **debería** emitir (`payment.confirmed`, `payment.failed`, `payment.refunded`): descríbelos en una tabla indicando si hoy se emiten o no (se formalizan en P11).
6. Quién ejecuta el reembolso cuando una tienda calcula el monto (Booking) y cómo se descuenta en la liquidación (referencia a P04).

## Discrepancias ya detectadas (verifícalas y regístralas)
- `@Body() dto: any`: el cuerpo no está tipado ni validado.
- El controlador no declara guards: cualquiera podría llamar `POST /pagos/procesar` y **cambiar el modo del simulador**. (Alta si se confirma.)
- El frontend genera la referencia **en el navegador** (`pay_${uuid}`) en vez de llamar a `/pagos/procesar`: una tienda no podría validarla.
- No existe una ruta para consultar un pago por referencia.

## Criterios de aceptación
- [ ] Las 5 rutas implementadas y la 1 planificada están en el contrato.
- [ ] Schemas con campos deducidos del servicio y ejemplos.
- [ ] Redocly lint sin errores.
- [ ] Reporte con cobertura, supuestos (incluida la decisión sobre `paymentReference`) y hallazgos.

## Entrega
Commit: `docs(contracts): P02 pagos openapi v2`
