# I03 — Logs estructurados en archivos JSON Lines

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Depende de I02.

## Objetivo
Cumplir la regla de la cátedra: logs **en archivos** JSON Lines (no en tablas de la base de datos), con correlación.

## Lee primero
El logger actual (Winston o el que haya), `src/core/**` (interceptores de logging), `grep -rn "api_request_logs\|request_log\|RequestLog" src database`, `contracts/common/components-v2.yaml` (`LogEstructurado`), ADR-003, `Semana 8 Consideraciones.md`.

## Alcance
1. Formato por línea: `timestamp` (ISO 8601 UTC), `level`, `service`, `correlation_id`, `trace_id`, `span_id`, `node_id`, `event`, `message`, `duration_ms`, `http.method`, `http.path`, `http.status` y `error` cuando aplique.
2. Archivos: `logs/<servicio>/YYYY-MM-DD.jsonl` con rotación diaria y retención configurable (`LOG_RETENTION_DAYS`, por defecto 14). `logs/` en `.gitignore`.
3. **Redacción de datos sensibles:** nunca registrar tokens, `Authorization`, claves, números de tarjeta ni cuerpos completos de pago.
4. Interceptor/middleware que registra cada petición con duración y estado. Si hoy se guarda en BD, **dejar de escribir en BD** (deja la tabla sin tocar; migración de retiro opcional en `database/migrations/` sin aplicar).
5. En Render el disco es efímero: variable `LOG_TO_STDOUT=true` que además emite el mismo JSON por stdout. Documenta la limitación en el reporte.
6. Utilidad `scripts/logs/trace.js <correlationId>` que lee los archivos y muestra las líneas de ese proceso ordenadas (base para I08).

## Criterios de aceptación
- [ ] Prueba: una petición genera una línea JSON válida con todos los campos.
- [ ] Prueba: un token en la cabecera no aparece en el log.
- [ ] Ya no hay escrituras de logs de petición a la BD (prueba o grep documentado).
- [ ] `trace.js` imprime la traza de una petición de ejemplo.

## Entrega
Commit: `feat(logging): logs JSON Lines en archivos con redaccion y rotacion [I03]`
