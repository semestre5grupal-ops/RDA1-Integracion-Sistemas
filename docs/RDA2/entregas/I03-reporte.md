# Reporte I03 — Logs estructurados JSON Lines

## 1. Resumen

Se agregó logging de cada petición HTTP en archivos diarios `logs/<servicio>/YYYY-MM-DD.jsonl`, con duración, estado, correlación y `traceparent` W3C.
Los registros omiten headers y cuerpos, redactan credenciales y números de tarjeta en mensajes/payloads de auditoría, y permiten espejo a stdout y retención configurable.
`npm run build`, `npm test` y la validación del contrato pasaron; el lint no pudo ejecutarse porque ESLint no está instalado.

## 2. Archivos cambiados

- `.env.example` — `LOG_SERVICE_NAME`, `LOG_TO_STDOUT` y `LOG_RETENTION_DAYS`.
- `contracts/common/components-v2.yaml` — campos del esquema `LogEstructurado`.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md` — BL-056 marcado resuelto.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md` — seguimiento de I03 y delimitación respecto de H-P17.
- `src/core/logger/winston-logger.service.ts` — archivos JSONL, limpieza por retención, stdout opcional y compatibilidad del lector de auditoría.
- `src/core/logger/structured-http-request.middleware.ts` — registro estructurado al finalizar cada respuesta.
- `src/core/logger/jsonl-request-logging.spec.ts` — pruebas de formato, redacción, stdout, retención, lector de auditoría y trazado.
- `src/main.ts` — registra el middleware antes del parser para capturar también respuestas de errores de parsing.
- `scripts/logs/trace.js` — consulta y ordena la traza por `correlation_id`.

`logs/` ya estaba ignorado en `.gitignore`; el script `scripts/logs/trace.js`, ubicado bajo un directorio con ese nombre, se incluirá explícitamente en el commit.

## 3. Pruebas

Primero se añadió la suite y se ejecutó antes de implementar: falló por la ausencia de `StructuredHttpRequestMiddleware` y `logRequest`. El primer intento no pudo arrancar porque el worktree aislado carecía de dependencias; se restauraron con `npm ci --ignore-scripts`, sin modificar manifiestos ni instalar dependencias nuevas.

- `npm test -- --runInBand core/logger/jsonl-request-logging.spec.ts`
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 6 passed, 6 total`
- Suite completa `npm test -- --runInBand`
  - `Test Suites: 18 passed, 18 total`
  - `Tests: 771 passed, 771 total`
- `npm run build`
  - `> nest build` — salida exitosa.
- `npx --yes @redocly/cli@1 lint contracts/common/components-v2.yaml`
  - `validated in 61ms`
  - `Woohoo! Your API description is valid.`
  - Redocly advierte por `localhost` y componentes no usados que ya existen en el contrato.
- `npm run lint -- --no-fix`
  - No ejecutable: `/usr/bin/bash: line 1: eslint: command not found`. Se evitó instalar herramientas y se añadió `--no-fix` para no aplicar el auto-fix global declarado por el script.
- Búsqueda de `api_request_logs|request_log|RequestLog` en `src` y `database`
  - Sin escrituras de logs de petición; los dos resultados son sentencias históricas `DROP TABLE IF EXISTS public.api_request_logs`.

Las pruebas de trazado crean dos registros de servicios distintos para la misma correlación y comprueban que `scripts/logs/trace.js` los imprime ordenados.

## 4. Compatibilidad v1

- No se cambió ninguna ruta ni formato de respuesta de `/api/v1`; se mantiene la cabecera `X-Correlation-Id`.
- El middleware se ejecuta antes del parser y solo observa método, ruta sin query string, estado y metadatos de trazabilidad; no altera el cuerpo ni el estado HTTP.
- Los registros de petición HTTP 4xx y 5xx se clasifican como fallidos, sin cambiar cómo se genera la respuesta.
- Se mantiene `getRecentAuditLogs()` sobre los nuevos archivos JSONL para conservar el lector de auditoría existente; la suite contiene una prueba específica de compatibilidad.

## 5. Contratos/documentos actualizados

- `contracts/common/components-v2.yaml`: `LogEstructurado` incluye nivel, evento, mensaje, `http` y error opcional además de timestamp, service, correlation, trace, span, node, estado y duración.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`: BL-056 se registra como resuelto.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`: se documenta la inexistencia previa de escrituras de logs HTTP a BD y se aclara que H-P17-01..04 describen auditoría transaccional distinta, no resuelta por I03.
- No hubo migración de datos ni cambios de esquema de base de datos.

## 6. Supuestos y decisiones

- El servicio por defecto es `booking-gateway`; `LOG_SERVICE_NAME` permite especificar el nombre del subdirectorio y se normaliza para evitar separadores de ruta.
- `LOG_TO_STDOUT` vale `false` por defecto; cuando vale `true`, el mismo JSONL se añade al archivo y se emite a stdout.
- `LOG_RETENTION_DAYS` usa 14 días por defecto; solo se purgan archivos diarios JSONL vencidos del subdirectorio del servicio.
- `trace_id` y `span_id` se extraen de un `traceparent` W3C válido. `node_id` proviene de `X-Node-Id` si existe; si no, usa el hostname de la instancia.
- No se almacenan headers, query string ni cuerpos de petición. Se redactan claves sensibles conocidas y números que parezcan PAN de tarjeta en otros campos serializados.
- La tabla histórica `api_request_logs` no se modifica ni se migra: la búsqueda en código confirmó que no hay escrituras actuales.

## 7. Pendiente / no pude verificar

- ESLint queda sin verificar por ausencia del ejecutable `eslint`; el script de lint incorpora `--fix` para todo el proyecto, así que no se ejecutó de forma que pudiera modificar código ajeno.
- Render usa disco efímero: los archivos JSONL locales pueden perderse al reiniciar o reemplazar la instancia. `LOG_TO_STDOUT=true` permite que el runtime de hosting capture los registros; no se configuró almacenamiento externo.
- No se probó el acceso real a stdout de Render ni se hicieron llamadas a servicios desplegados.

## 8. Cómo probarlo a mano

1. Inicia el backend localmente. Para espejo al stdout configura `LOG_TO_STDOUT=true`; el servicio por defecto escribe en `logs/booking-gateway/`.
2. Haz una petición y luego inspecciona el archivo JSONL del día:

```powershell
curl.exe -i "http://localhost:3000/api/v1/health" `
  -H "X-Correlation-Id: corr-demo-001" `
  -H "traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" `
  -H "X-Node-Id: booking-node-demo"
Get-Content "logs/booking-gateway/$((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')).jsonl" -Tail 1
```

3. La línea debe ser JSON válido e incluir `level`, `service`, `correlation_id`, `trace_id`, `span_id`, `node_id`, `event`, `message`, `duration_ms` y `http.method/path/status`.
4. Prueba una ruta autenticada sin credenciales y confirma que se registra el estado 401, sin que aparezcan `Authorization`, tokens o el cuerpo.
5. Para imprimir todas las líneas de una petición ordenadas:

```powershell
node scripts/logs/trace.js corr-demo-001
```
