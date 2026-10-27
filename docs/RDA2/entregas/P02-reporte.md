# Reporte P02 — Pagos SOA y Simulación (contrato OpenAPI v2)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/pagos-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 de Pagos SOA v2 con 5 rutas implementadas y 1 planificada para validación de `paymentReference`. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P02-01 a H-P02-05 (seguridad en simulador, DTOs sin tipar, discrepancia frontend y eventos). |
| `docs/RDA2/entregas/P02-reporte.md` | Creado | Reporte formal de entrega de la tarea P02. |

---

## Cobertura de rutas (controlador vs contrato)

Se documentaron el 100% de las rutas implementadas en `src/modules/pagos/pagos.controller.ts`, agregando la ruta planificada de validación externa requerida para la integración con aerolíneas y socios turísticos:

| Método | Ruta | Handler | En el contrato | x-status | x-microservice |
|---|---|---|:---:|---|---|
| `POST` | `/pagos/procesar` | `procesarPago` | Sí | `implemented` | `MS_PAG` |
| `POST` | `/pagos/reembolsos` | `procesarReembolso` | Sí | `implemented` | `MS_PAG` |
| `GET` | `/pagos/simulador/config` | `getConfigSimulador` | Sí | `implemented` | `MS_PAG` |
| `POST` | `/pagos/simulador/config` | `updateConfigSimulador` | Sí | `implemented` | `MS_PAG` |
| `GET` | `/pagos/transacciones` | `getTransacciones` | Sí | `implemented` | `MS_PAG` |
| `GET` | `/pagos/{paymentReference}` | N/A (planificado B2B) | Sí | `planned` | `MS_PAG` |

**Cobertura:** 5/5 rutas del controlador cubiertas (100%) + 1 ruta de extensión planificada para validación de referencias de pago por socios externos.

---

## Validación (comando y resultado resumido)

```bash
npx --yes @redocly/cli@1 lint contracts/pagos-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[1].url` (`http://localhost:3000/api/v2`), requerido por la convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Definición de `paymentReference`:**
   - En el código del servicio `PagosService.procesarPago`, los identificadores estables devueltos son `transaccion_id` (UUID en `schema_pagos.transacciones_pago`) y `codigo_autorizacion` (`AUTH-PAG-XXXXXXXX`). Se decidió formalizar que `paymentReference` equivale a `transaccion_id` (o alternativamente `codigo_autorizacion`). La ruta planificada `GET /pagos/{paymentReference}` acepta cualquiera de los dos.
2. **Reutilización de componentes comunes (`contracts/common/components-v2.yaml`):**
   - Se importaron mediante `$ref` los esquemas `ProblemDetails`, los parámetros `CorrelationId` e `IdempotencyKeyOptional`, los encabezados de respuesta `X-Correlation-Id` y las respuestas estándar `Problem400`, `Problem404` y `Problem500`.
3. **Mapeo de respuestas de error simuladas:**
   - La inyección `RECHAZO_FONDOS` arroja HTTP `402 Payment Required` con código semántico `INSUFFICIENT_FUNDS`.
   - La inyección `TIMEOUT_RED` arroja HTTP `504 Gateway Timeout` con código semántico `PAYMENT_GATEWAY_TIMEOUT`.
4. **Relación con compensación Saga LIFO y Finanzas:**
   - En cancelaciones de servicios donde el socio satélite calcula la penalidad o monto reembolsable (`refund.amount`), Booking ejecuta el reembolso mediante `POST /pagos/reembolsos` emitiendo el comprobante `REF-PAG-XXXXXXXX`. Dicho monto se descuenta posteriormente de las liquidaciones comerciales a proveedores en `MS_FIN` (Cálculo del 10% de comisión del Booking).
5. **Tipado deducido del servicio:**
   - Dado que el controlador recibe `@Body() dto: any`, los campos de `ProcesarPagoInput` y `ProcesarReembolsoInput` fueron deducidos íntegramente de la lectura del método en `PagosService`.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P02-01** | Alta | `PagosController` no declara Guards de autenticación (`security: []`). El endpoint crítico `POST /pagos/simulador/config` está expuesto públicamente sin autorización de administrador. |
| **H-P02-02** | Media | DTOs de entrada sin tipar (`@Body() dto: any`), sin validaciones de `class-validator` para montos, tarjetas ni IDs. |
| **H-P02-03** | Media | El frontend (`FormularioReserva.jsx`, `ModalPostventa.jsx`) genera cadenas aleatorias en el navegador (`pay_${uuid}`) en lugar de invocar a `POST /pagos/procesar`, rompiendo la trazabilidad del `paymentReference`. |
| **H-P02-04** | Media | Los eventos de pago (`payment.confirmed`, `payment.failed`, `payment.refunded`) solo se registran en logs Winston y BD; no se publican a RabbitMQ ni Kafka. |
| **H-P02-05** | Media | Inexistencia en el código actual de un endpoint para consultar/validar un pago por su referencia (`paymentReference`). Resuelto como `planned` en el contrato. |

---

## Dudas para el revisor

1. Para la ruta planificada `GET /pagos/{paymentReference}`, ¿se requerirá autenticación mediante token OAuth2 de partner (`PartnerOAuth2` con scope `payments:read`) o bastará con una API Key de proveedor en cabecera `X-Api-Key`?
2. ¿Debería el frontend refactorizarse de inmediato en la fase de implementación para llamar a `POST /pagos/procesar` antes de mandar a crear la reserva a la API de vuelos, o se mantendrá temporalmente el mock del cliente hasta consolidar el carrito multivertical?
