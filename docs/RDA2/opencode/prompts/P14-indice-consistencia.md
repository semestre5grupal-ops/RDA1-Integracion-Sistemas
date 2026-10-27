# P14 — Índice, consistencia global y endpoints planificados

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta **solo cuando P00–P13 estén hechos**.

## Objetivo
Cerrar la fase de contratos: un índice, validación global y la lista de lo pendiente.

## Salida
- `contracts/README.md` (índice)
- `contracts/CAMBIOS_CONTRATOS_RDA2.md` (actualizado, no reescrito)
- `docs/RDA2/PLANNED_ENDPOINTS.md`
- `docs/RDA2/entregas/P14-reporte.md`
- Consolidación de `docs/RDA2/HALLAZGOS_CONTRATOS.md` (resumen por severidad al inicio)

## Tareas
1. **Índice** `contracts/README.md`: tabla con archivo, tecnología (OpenAPI/AsyncAPI/gRPC/GraphQL), versión, dominio, nº de operaciones, estado (implementado / parcial / planificado) y quién lo consume (frontend, tiendas, admin). Incluye los contratos de vuelos, autos, atracciones y alojamientos ya existentes como "contratos de tienda" (no editarlos).
2. **Validación global:** Redocly lint a **todos** los `*-v2.yaml`, validate de AsyncAPI, carga del proto, parseo de GraphQL. Pega la salida resumida en el reporte.
3. **Duplicados:** script (fuera del repo o en `scripts/` solo si ya existe esa carpeta) que liste rutas repetidas entre contratos de Booking. Esperadas: toggles de nodos y finanzas; resuélvelas apuntando cuál es la canónica.
4. **Cobertura:** compara las rutas de todos los `@Controller` de `src/` con los contratos y lista las que **no** están en ninguno (debe ser vacío o justificado).
5. **PLANNED_ENDPOINTS.md:** tabla de todo lo `x-status: planned` (ruta, contrato, por qué, prioridad Alta/Media/Baja, esfuerzo S/M/L, requisito funcional relacionado si ya existe).
6. **Actualiza `CAMBIOS_CONTRATOS_RDA2.md`:** añade una sección "Contratos internos de Booking v2" con lo creado.
7. Verifica que todo `$ref` a `./common/components-v2.yaml` resuelve y que no hay `servers` con `example.com`.

## Criterios de aceptación
- [ ] Lint global en verde (o errores justificados en el reporte).
- [ ] Cobertura de controladores = 100 % o excepciones explicadas.
- [ ] `git diff --stat main...HEAD` solo muestra `contracts/**` y `docs/RDA2/**`.

## Entrega
Commit: `docs(contracts): P14 indice, consistencia y endpoints planificados`
