# P00 — Componentes comunes de los contratos de Booking

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Esta tarea **no depende de nada** y todas las demás dependen de ella.

## Objetivo
Crear **un solo archivo** con los componentes que comparten todos los contratos internos de Booking, para que ningún contrato redefina errores, encabezados ni seguridad.

## Salida
- `contracts/common/components-v2.yaml`
- `docs/RDA2/entregas/P00-reporte.md`
- Rama `rda2/contratos-booking` creada (`git checkout -b rda2/contratos-booking`).

## Lee primero (solo esto)
- `src/core/errors/codigo-error.ts` (códigos de error reales)
- `src/core/filters/rfc7807-exception.filter.ts` (forma real del error)
- `src/core/interceptors/hateoas.interceptor.ts` (forma real de `_links`)
- `src/core/auth/roles.enum.ts`, `src/core/guards/supabase-auth.guard.ts`, `src/core/guards/roles.guard.ts`, `src/core/guards/admin-role.guard.ts`
- `src/main.ts` líneas 85-125 (middleware de `X-Correlation-Id`)
- `Faltantes RDA2/docs/PROTO_CLOUD_EVENTS.md` (CloudEvents + W3C Trace Context)
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md` (campos mínimos de log y trazabilidad)
- `contracts/vuelos-openapi-v2.yaml`: solo la sección `components` (estilo de referencia; **no la copies sin comprobar** que coincide con el código de Booking)

## Contenido del archivo
Es un OpenAPI 3.0.3 válido con `paths: {}` y solo `components`:

**securitySchemes**
- `SupabaseBearer` (http bearer JWT; roles `CLIENTE`/`ADMIN`/`MANTENIMIENTO`)
- `AdminKey` (apiKey en header `X-Admin-Key`, solo pruebas automáticas)
- `ProviderApiKey` (apiKey en header `X-Api-Key`)

**parameters** (header): `CorrelationId` (`X-Correlation-Id`, opcional), `RequestId` (`X-Request-Id`), `Traceparent` (`traceparent`, patrón W3C `00-<32hex>-<16hex>-<2hex>`), `IdempotencyKey` (obligatorio, UUID v4), `IdempotencyKeyOptional`.
Parámetros de paginación solo si el código ya usa `limit`/`cursor` (verifícalo).

**headers** (de respuesta): `X-Correlation-Id`, `Traceparent`, `Retry-After`, `Idempotent-Replayed`.

**schemas**
- `ProblemDetails` (RFC 7807): `type`, `title`, `status`, `detail`, `instance`, `code`, `correlation_id`, `timestamp`, `invalidParams[]`. El `code` es un `string` con **los códigos reales de `codigo-error.ts`** listados en la descripción (no inventes códigos).
- `Links` / `Link` (HATEOAS), con la forma real que genera el interceptor.
- `CloudEventBase`: `specversion` ("1.0"), `id`, `source`, `type`, `subject`, `time`, `datacontenttype`, `correlationid`, `traceparent`, `tracestate`, `node_id`, `data`.
- `LogEstructurado`: estructura mínima de la cátedra (`timestamp`, `service`, `event_received`, `correlation_id`, `status`, `duration_ms`) más `trace_id`, `span_id`, `node_id`. Es el formato de los logs en archivo JSON Lines (no se guarda en base de datos).
- `Money` (`currency` ISO 4217 + `amount` como string decimal) solo si el código maneja importes así; si no, no lo crees.

**responses**: `Problem400`, `Problem401`, `Problem402`, `Problem403`, `Problem404`, `Problem409`, `Problem422`, `Problem429`, `Problem500`, `Problem502`, `Problem503`, `Problem504`. Todas con `application/problem+json` y un `example`. Incluye `Retry-After` en 429/503.

## Discrepancias a registrar si las encuentras
- Códigos de error que el filtro RFC 7807 devuelve y no están en `codigo-error.ts`.
- Respuestas de error que **no** usan `application/problem+json`.
- Rutas donde el middleware de correlation ID no aplica.

## Criterios de aceptación
- [ ] `npx --yes @redocly/cli@1 lint contracts/common/components-v2.yaml` sin errores.
- [ ] Todos los `code` de `ProblemDetails` salen de `codigo-error.ts` (verificado en el reporte).
- [ ] Ningún secreto ni URL privada.
- [ ] `git status` solo muestra `contracts/common/` y `docs/RDA2/`.

## Entrega
Commit: `docs(contracts): P00 componentes comunes v2`
