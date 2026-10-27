# I06 — Pagos: consulta de referencia, idempotencia y simulador

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Independiente (puede ir en paralelo con I05).

## Objetivo
Cerrar lo `planned` de `contracts/pagos-openapi-v2.yaml` y garantizar el modelo: **Booking cobra; la aerolínea/tienda solo valida la `paymentReference`**.

## Lee primero
`contracts/pagos-openapi-v2.yaml`, `docs/RDA2/entregas/P02-reporte.md`, `src/modules/pagos/*` (controlador, servicio, simulador, entidades), `contracts/vuelos-openapi-v2.yaml` (cómo se usa `paymentReference`).

## Alcance
1. **`GET /pagos/{paymentReference}`** (planned): devuelve estado del cobro (`APROBADO`/`RECHAZADO`/`REEMBOLSADO`/…), monto, moneda, fecha y reservas asociadas, **sin datos de tarjeta**. Acceso: rol `ADMIN`/`SERVICE` o `X-Api-Key` de tienda, con límite de lectura solo a referencias de esa tienda.
2. **Idempotencia** de `/pagos/procesar` y `/pagos/reembolsos` con `Idempotency-Key` (repetir no cobra/reembolsa dos veces).
3. **Reembolsos:** no exceder el monto cobrado; reembolso parcial acumulado; estados claros.
4. **Simulador de pasarela:** casos deterministas por configuración (aprobado, rechazado, timeout, fraude) vía `/pagos/simulador/config`; que `NODE_ENV=production` exija flag explícito para activarlo.
5. Evento `payment.completed` / `payment.refunded` por RabbitMQ (ver I04).

## Criterios de aceptación
- [ ] Pruebas: cobro aprobado/rechazado, repetido con misma llave, reembolso parcial y exceso (error), consulta de referencia con y sin permiso.
- [ ] Contrato `x-status` actualizado a `implemented` y lint en verde.
- [ ] Ningún log ni respuesta expone datos de tarjeta.

## Entrega
Commit: `feat(pagos): consulta por paymentReference, idempotencia y reembolsos acotados [I06]`
