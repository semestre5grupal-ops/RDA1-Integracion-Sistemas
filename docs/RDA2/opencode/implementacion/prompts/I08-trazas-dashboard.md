# I08 — Endpoint de trazas y dashboard de grafo

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Depende de I02, I03 e I05.

## Objetivo
El monitoreo tipo grafo que pide la cátedra (Semana 8): nodos verdes/rojos y traza de una saga.

## Lee primero
`contracts/observabilidad-openapi-v2.yaml` (ruta planned `GET /observabilidad/trazas/{correlationId}`), `contracts/esb-sagas-openapi-v2.yaml`, `scripts/logs/trace.js` (I03), `src/modules/esb/*`, `docs Paúl Rosero/architecture/ADR-006-panel-monitoreo-nodos-semaforo.md`, `frontend/src/components/admin/` (panel de nodos existente), `Semana 8 Consideraciones.md`.

## Alcance
1. **Backend:** `GET /observabilidad/trazas/{correlationId}` (rol `ADMIN`/`MANTENIMIENTO`). Une estado de saga + líneas de log del `correlation_id` y devuelve `nodes[]` (`id`, `label`, `type`, `status`, `duration_ms`, `error`) y `edges[]` (`from`, `to`, `kind`: llamada | evento | compensación) tal como define el contrato. 404 si no existe.
2. **Límites:** la lectura de logs debe ser acotada (por fecha y tamaño) para no bloquear el servidor.
3. **Frontend:** vista "Trazas" en el panel de admin: buscador por `correlationId`, lista de sagas recientes (`GET /esb/sagas`), grafo (usa la librería de grafos que ya tenga el frontend; si no hay, SVG simple propio o `reactflow` como única dependencia nueva justificada), nodos **verdes** (OK) y **rojos** (falló o compensó), tooltip con duración y error, y la línea de tiempo de compensaciones.
4. Mantener el semáforo de nodos existente; no romperlo.

## Criterios de aceptación
- [ ] Prueba backend con una saga exitosa y una fallida (nodos en el estado esperado).
- [ ] El frontend compila (`npm run build` en `frontend/`).
- [ ] Capturas descritas o guía manual en el reporte (cómo generar una saga fallida con el simulador/kill-switch).
- [ ] Contrato: ruta `implemented` y lint en verde.

## Entrega
Commit: `feat(observability): endpoint de trazas y dashboard de grafo [I08]`
