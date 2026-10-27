# I06 — Reporte de entrega

## 1. Resumen
Se implementó la consulta v2 de pagos por `paymentReference`, con acceso por ADMIN/SERVICE o API key de la tienda propietaria.
Se incorporaron idempotencia de cobros y reembolsos, reembolsos parciales acumulados y la asociación explícita de reservas.
Se añadieron escenarios deterministas del simulador y eventos RabbitMQ; la migración SQL se entrega sin aplicar.

## 2. Archivos cambiados
- `.env.example`
- `contracts/pagos-openapi-v2.yaml`
- `database/migrations/20261025_pagos_idempotencia_reembolsos.sql`
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`
- `docs/RDA2/PLANNED_ENDPOINTS.md`
- `src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts`
- `src/modules/pagos/dto/pago.dto.ts`
- `src/modules/pagos/entities/index.ts`
- `src/modules/pagos/entities/transaccion-pago.entity.ts`
- `src/modules/pagos/entities/reembolso-pago.entity.ts`
- `src/modules/pagos/entities/reserva-pago.entity.ts`
- `src/modules/pagos/guards/payment-reference-access.guard.ts`
- `src/modules/pagos/guards/payment-reference-access.guard.spec.ts`
- `src/modules/pagos/guards/simulator-configuration.guard.ts`
- `src/modules/pagos/guards/simulator-configuration.guard.spec.ts`
- `src/modules/pagos/pagos.controller.ts`
- `src/modules/pagos/pagos.module.ts`
- `src/modules/pagos/pagos.service.ts`
- `src/modules/pagos/pagos.service.spec.ts`

## 3. Pruebas
- Nuevas pruebas de servicio: idempotencia de cobros/reembolsos, conflicto por reutilización de clave, reembolso parcial y exceso, consulta y asociación de referencias, y protección del simulador en producción.
- Nuevas pruebas de guardas: acceso ADMIN/SERVICE/tienda, denegación de tienda ajena o clave inválida, y autorización de configuración del simulador.
- Pruebas enfocadas de pagos: **3 suites y 15 pruebas pasaron**.
- `npm run build`: **pasó** (código de salida 0).
  ```text
  > booking-prototipo-plantilla@1.0.0 build
  > nest build
  ```
- `npm test`: **26 suites y 805 pruebas pasaron** en la ejecución final.
- En la primera ejecución completa falló una prueba ajena a pagos (`src/modules/alojamientos/pruebas-http/07-ordenes.http.spec.ts`) por exceder en 3.224 ms su tolerancia para la expiración de preview; la repetición completa pasó.
- Lint: `npm run lint -- --no-fix` no pudo ejecutarse porque `eslint` no está instalado (`eslint: command not found`). No se instaló ninguna dependencia. `npx --yes @redocly/cli@1 lint contracts/pagos-openapi-v2.yaml` validó el contrato sin errores; reportó una advertencia por la URL de desarrollo `http://localhost:3000/api/v2`.

## 4. Compatibilidad v1
- Las rutas nuevas `GET /pagos/{paymentReference}` y `POST /pagos/{paymentReference}/reservas` tienen versión explícita 2; no se incorporan a `/api/v1`.
- Se conservaron las rutas existentes de cobro y reembolso. Los nuevos campos de idempotencia y reembolso acumulado se agregan a sus respuestas, y los estados existentes se mantienen.
- Las rutas legacy no recibieron una guarda nueva, evitando exigir credenciales distintas a clientes v1. La consulta de referencia y la asociación quedan protegidas por su guard específico.
- El historial conserva la propiedad de tarjeta enmascarada para mantener la forma de respuesta existente, pero su valor se sustituye por una máscara genérica sin dígitos. La consulta de referencia no incluye esa propiedad.

## 5. Contratos/documentos actualizados
- OpenAPI de pagos: `GET /pagos/{paymentReference}` y asociación de reservas marcados `implemented`; seguridad, campos de reembolso parcial y simulación actualizados.
- Hallazgos, backlog y endpoints planeados actualizados con el alcance I06. El hallazgo P02 sobre protección general de cobros/reembolsos/historial queda parcial; el acceso de las rutas nuevas sí está limitado.
- `.env.example`: añadidas `PAGOS_STORE_API_KEYS=` y `PAGOS_SIMULADOR_HABILITADO=false`, sin valores reales.
- Migración nueva para ledger de reembolsos, asociaciones de reservas y monto acumulado. **No aplicada** a ninguna base de datos.

## 6. Supuestos y decisiones
- Por decisión acordada, se usa `carrito_id` como identificador de tienda. `PAGOS_STORE_API_KEYS` acepta entradas separadas por coma con formato `carrito_id=api_key`; la comparación se hace mediante hashes de longitud fija y comparación de tiempo constante.
- La reserva se vincula después del cobro mediante `POST /api/v2/pagos/{paymentReference}/reservas`, porque el flujo crea la reserva después del pago.
- Los importes se acumulan en centavos dentro de una transacción con bloqueo de la fila de pago; cada reembolso conserva su clave idempotente en el ledger.
- En producción el simulador requiere `PAGOS_SIMULADOR_HABILITADO=true`, y la configuración requiere rol ADMIN. El flag está desactivado por defecto.
- No se leyó ningún archivo `.env*`, no se conectó a servicios externos ni se aplicó la migración.

## 7. Pendiente / no pude verificar
- La primera ejecución del suite completo tuvo una falla transitoria de timing en la prueba HTTP de órdenes descrita arriba; la repetición completa pasó.
- No se ejecutó lint de TypeScript porque la dependencia `eslint` no está presente en el proyecto instalado.
- No se verificó la migración contra una base de datos y no se probó la entrega de eventos contra un broker; ambos quedan para el entorno de integración autorizado.

## 8. Cómo probarlo a mano
Configura en el entorno local `PAGOS_STORE_API_KEYS=00000000-0000-4000-8000-000000000001=clave-local-larga-de-prueba` y arranca el servicio. Usa una API key de prueba, nunca una clave real:

```powershell
curl.exe -X POST http://localhost:3000/api/v2/pagos/procesar `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: cobro-demo-1" `
  -d "{\"monto\":125.50,\"carrito_id\":\"00000000-0000-4000-8000-000000000001\"}"
```

Repite el mismo comando con la misma clave y cuerpo para comprobar que no se registra otro cobro. Usa el `transaccion_id` devuelto para asociar una reserva y consultar el pago:

```powershell
curl.exe -X POST http://localhost:3000/api/v2/pagos/<paymentReference>/reservas `
  -H "Content-Type: application/json" `
  -H "X-Api-Key: clave-local-larga-de-prueba" `
  -d "{\"reserva_id\":\"reserva-demo-1\"}"

curl.exe http://localhost:3000/api/v2/pagos/<paymentReference> `
  -H "X-Api-Key: clave-local-larga-de-prueba"
```

Para verificar un reembolso idempotente, envía `POST /api/v1/pagos/reembolsos` con `transaccion_id` y `monto` parcial, junto con un `Idempotency-Key`; repite la solicitud con la misma clave y comprueba que se devuelve el mismo código de reembolso. Un importe que exceda el saldo reembolsable debe responder con error. No envíes datos reales de tarjeta.
