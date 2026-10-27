# P15 (OPCIONAL) — Parche vuelos v2.0.1

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. **No ejecutar sin que Alejandro lo apruebe**: el contrato de vuelos v2.0.0 ya fue enviado a los equipos de vuelos.

## Objetivo
Alinear `contracts/vuelos-openapi-v2.yaml` con la cátedra (Semana 8) sin romper a quienes ya lo leyeron.

## Salida
- `contracts/vuelos-openapi-v2.yaml` → versión **2.0.1** (solo cambios compatibles)
- `contracts/README-vuelos-v2.md` actualizado
- `docs/RDA2/entregas/P15-reporte.md` con el changelog

## Cambios permitidos (todos aditivos o de redacción)
1. **Logs:** donde diga que los logs se guardan en la tabla `api_request_logs` (base de datos), cambiar a: logs en archivos **JSON Lines** (`logs/<servicio>/YYYY-MM-DD.jsonl`) con campos `timestamp`, `level`, `service`, `correlation_id`, `trace_id`, `span_id`, `node_id`, `event`, `message`, `duration_ms`; referencia a `LogEstructurado` de P00. No se almacenan logs de petición en base de datos.
2. **Mensajería:** transacciones, sagas y compensaciones por **RabbitMQ**; Kafka solo para telemetría/analítica. Corrige cualquier evento transaccional que figure en Kafka.
3. **Cabeceras y CloudEvents:** añadir `traceparent` (W3C Trace Context) y `node_id` como encabezado/atributo **opcional** y ampliar `CloudEventBase` con `traceparent` y `node_id`.
4. Sube `info.version` a `2.0.1` y añade una nota de cambios al final de `info.description`.

## Prohibido
- Eliminar o renombrar rutas, parámetros o campos; cambiar tipos; volver obligatorio algo opcional.
- Cambiar el modelo de pagos, check-in (48 h) o la seguridad de dos capas.

## Criterios de aceptación
- [ ] Redocly lint sin errores.
- [ ] `diff` entre 2.0.0 y 2.0.1 pegado en el reporte, mostrando solo cambios compatibles.
- [ ] README de vuelos coherente con el nuevo texto.

## Entrega
Commit: `docs(contracts): P15 vuelos v2.0.1 (alineacion cátedra)`
