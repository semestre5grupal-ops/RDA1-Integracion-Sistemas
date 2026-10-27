# D3 — Plan de pruebas

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta después de D1 y D2.

## Objetivo
Plan de pruebas que cubra los RF y RNF y aproveche lo que ya existe. **No escribas código de pruebas nuevo en `src/` ni `test/`**; solo documenta el plan (los casos pueden incluir pseudocódigo o ejemplos `curl`).

## Salida
- `docs/RDA2/PLAN_DE_PRUEBAS.md`
- `docs/RDA2/entregas/D3-reporte.md`

## Lee primero
- `docs/RDA2/REQUISITOS_FUNCIONALES.md`, `REQUISITOS_NO_FUNCIONALES.md`
- `test/` y `runner-pruebas.js`, `*.spec.ts` (inventario de lo ya cubierto)
- `Pendientes/*.md`, `GUIA_DEFENSA_ORAL_Y_MATRIZ_EVIDENCIAS_RDA2.md`
- Contratos `*-v2.yaml`

## Estructura
1. Estrategia (pirámide: unitarias, contrato, integración, E2E, resiliencia, seguridad, rendimiento) y entornos (local, Render, simulador de pasarela).
2. **Inventario de pruebas existentes** (archivo, qué cubre, cómo ejecutarlo).
3. **Casos de prueba**: ID `CP-NNN`, RF/RNF que verifica, precondiciones, pasos, datos, resultado esperado, tipo, automatizable (sí/no) y estado (existe / por crear).
4. Casos obligatorios: saga feliz; saga con fallo en cada paso y **compensación LIFO**; circuit breaker abierto (timeout 5 s) y mock fallback; kill-switch; idempotencia (misma `Idempotency-Key` dos veces); pagos aprobados/rechazados con el simulador; reembolso; paquete con promoción por encima del tope B2B; webhooks con firma válida/ inválida/ duplicado (planned); autorización por rol (CLIENTE intentando rutas ADMIN); validación de contratos (lint + pruebas de contrato contra las respuestas reales); trazabilidad de `X-Correlation-Id` de extremo a extremo.
5. Pruebas de rendimiento y carga básicas (herramienta sugerida, escenarios, umbrales de D2).
6. Criterios de entrada/salida, métricas de aprobación y gestión de defectos.
7. **Matriz de trazabilidad** RF/RNF → CP (tabla completa) en `docs/RDA2/MATRIZ_TRAZABILIDAD.md` enlazada desde el plan (esto cubre también la tarea D4 si ya la hiciste).

## Criterios de aceptación
- [ ] Todo RF `implementado` tiene ≥ 1 CP.
- [ ] Todos los casos obligatorios presentes.
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D3 plan de pruebas`
