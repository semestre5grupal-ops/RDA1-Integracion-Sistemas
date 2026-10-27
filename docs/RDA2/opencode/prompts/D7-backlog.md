# D7 — Backlog priorizado de implementación

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta al final (después de D1–D6).

## Objetivo
Convertir hallazgos, endpoints planificados y brechas en un backlog ejecutable. **No implementes nada.**

## Salida
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`
- `docs/RDA2/entregas/D7-reporte.md`

## Lee primero
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`, `PLANNED_ENDPOINTS.md`, `MATRIZ_TRAZABILIDAD.md` (brechas), `REQUISITOS_NO_FUNCIONALES.md`, `PLAN_DE_DESPLIEGUE.md`
- `docs Paúl Rosero/PLAN_MAESTRO_AUDITORIA_E_IMPLEMENTACION_RDA2.md`

## Formato
Tabla: **ID** `BL-NNN`, título, tipo (seguridad / cumplimiento cátedra / funcionalidad / prueba / documentación / despliegue), origen (hallazgo, endpoint planificado, brecha), RF/RNF/CE afectados, severidad/prioridad, esfuerzo (S/M/L), dependencias, criterio de hecho, archivos probables (`src/...`), y responsable sugerido (Booking / vuelos / otro).

## Orden obligatorio
1. Seguridad Alta (p. ej. toggle público de nodos, endpoints con efectos sin guard).
2. Cumplimiento de cátedra (Kafka vs RabbitMQ, logs en archivos, `traceparent`, dashboard de grafo).
3. Funcionalidades planificadas necesarias para la defensa.
4. Pruebas faltantes.
5. Resto.

Incluye una **propuesta de sprints** (3 sprints) con objetivo y alcance, y una lista de "decisiones pendientes" para el equipo.

## Criterios de aceptación
- [ ] Todo hallazgo Alta/Media y todo `planned` tiene un BL.
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D7 backlog de implementacion`
