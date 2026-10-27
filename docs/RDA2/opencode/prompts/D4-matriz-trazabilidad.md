# D4 — Matriz de trazabilidad y evidencias

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta después de D3.

## Objetivo
Una matriz única que una: **criterio de evaluación (CE01–CE11) → requisito → contrato/operación → código (`x-source`) → caso de prueba → evidencia**.

## Salida
- `docs/RDA2/MATRIZ_TRAZABILIDAD.md` (si D3 ya la creó, **amplíala**, no la reemplaces)
- `docs/RDA2/entregas/D4-reporte.md`

## Lee primero
- `docs/RDA2/REQUISITOS_FUNCIONALES.md`, `REQUISITOS_NO_FUNCIONALES.md`, `PLAN_DE_PRUEBAS.md`
- `docs Paúl Rosero/GUIA_DEFENSA_ORAL_Y_MATRIZ_EVIDENCIAS_RDA2.md`
- `contracts/README.md`, `docs/RDA2/PLANNED_ENDPOINTS.md`

## Estructura
1. Tabla CE → RF/RNF → contrato#operación → archivo fuente → CP → evidencia esperada (captura, log, reporte de prueba) → estado (cubierto / parcial / brecha).
2. **Brechas:** lista priorizada de CE con estado parcial o brecha, con la acción para cerrarlas y el estimado (S/M/L).
3. Cobertura global (porcentaje de CE cubiertos, RF implementados con prueba, endpoints planificados).

## Criterios de aceptación
- [ ] Los 11 CE aparecen.
- [ ] Ninguna celda de "evidencia" vacía: o hay evidencia o dice "por generar" con responsable sugerido.
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D4 matriz de trazabilidad`
