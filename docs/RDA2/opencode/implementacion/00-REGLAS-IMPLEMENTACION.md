# Reglas comunes de IMPLEMENTACIÓN (RDA2)

Aplican a todas las tareas `I01…I12`. Si un prompt contradice estas reglas, gana el prompt solo en lo que dice explícitamente.

## 1. Contexto
- Booking Prototipo: backend NestJS (`src/`), frontend React (`frontend/`), Supabase, Render/Vercel.
- La **fuente de verdad** son los contratos de `contracts/` (OpenAPI, AsyncAPI, gRPC, GraphQL), `docs/RDA2/HALLAZGOS_CONTRATOS.md`, `docs/RDA2/PLANNED_ENDPOINTS.md` y `docs/RDA2/BACKLOG_IMPLEMENTACION.md`. Si el contrato dice `planned`, se implementa **tal cual está en el contrato**. Si el contrato es incorrecto, no lo cambies en silencio: anota el cambio en el reporte y actualiza el contrato en el mismo commit.
- Esta fase **sí puede modificar** `src/`, `frontend/src/`, `test/`, `database/` (solo scripts SQL nuevos, **nunca aplicados**) y `contracts/` (solo para sincronizar). Todo lo demás, no.

## 2. Prohibiciones
1. No leer ni imprimir `.env*`. Variables nuevas → solo en `.env.example`, sin valores reales.
2. No romper `/api/v1`: todo cambio debe ser **compatible hacia atrás**. Una ruta que se reemplaza se mantiene como `deprecated` (responde igual y añade encabezado `Deprecation: true`).
3. No ejecutar migraciones en bases reales ni conectarse a Supabase/Render/brokers de producción. Los cambios de BD se entregan como archivo `database/migrations/<fecha>_<nombre>.sql` y se documentan en el reporte.
4. No instalar dependencias sin necesidad. Si es imprescindible, una sola, con justificación en el reporte.
5. No `git push`, no `git reset --hard`, no `git rebase`, no tocar `main`. `git add` con rutas exactas, nunca `git add .`.
6. No inventar comportamiento: si algo no está claro, elige la opción más conservadora y anótala como supuesto.

## 3. Método (obligatorio en cada tarea)
1. Lee el prompt completo, los hallazgos y la sección del contrato que implementas.
2. **Escribe primero la prueba** que demuestra el problema (o el comportamiento nuevo) y confirma que falla.
3. Implementa el cambio mínimo. Sin refactors fuera del alcance.
4. Haz que la prueba pase y que **no se rompa ninguna otra**.
5. Verifica con: `npm run build`, `npm test` (y `npm run lint` si existe). Pega las últimas líneas de salida en el reporte. Si un comando no puede ejecutarse (falta entorno), dilo y explica cómo verificarlo.
6. Si el cambio altera un contrato, actualízalo y valídalo (`npx --yes @redocly/cli@1 lint <archivo>`).
7. Marca el hallazgo/BL como resuelto en `docs/RDA2/HALLAZGOS_CONTRATOS.md` y `BACKLOG_IMPLEMENTACION.md` (columna `Estado`).

## 4. Calidad
- TypeScript estricto, sin `any` nuevo sin justificación. DTOs con `class-validator`. Errores con RFC 7807 (el filtro/ayudas ya existentes).
- Toda ruta nueva: guard explícito (`SupabaseAuthGuard` + `RolesGuard`/`@Roles`) o justificación por escrito si es pública.
- Nada de `console.log`: usa el logger existente (JSON Lines).
- Cambios con riesgo → detrás de una variable de entorno (feature flag) con valor por defecto seguro.

## 5. Git
- Rama: `rda2/impl-<tu-nombre>` (créala desde `rda2/contratos-booking` o `main` según indique el equipo).
- Un commit por tarea: `feat(<módulo>): <qué> [I<NN>]` o `fix(...)`, `test(...)`, `chore(...)`.
- No mezcles tareas en un commit.

## 6. Reporte (obligatorio): `docs/RDA2/entregas/I<NN>-reporte.md`
Secciones fijas:
1. **Resumen** (3 líneas).
2. **Archivos cambiados** (lista).
3. **Pruebas:** nuevas/modificadas y resultado de `build` y `test` (pegar salida).
4. **Compatibilidad v1:** qué se verificó.
5. **Contratos/documentos actualizados.**
6. **Supuestos y decisiones.**
7. **Pendiente / no pude verificar.**
8. **Cómo probarlo a mano** (comandos `curl` o pasos).

## 7. Si algo falla
Si `build` o `test` ya fallaban antes de tu cambio, anótalo con evidencia (salida) y no lo atribuyas a tu tarea. Si no puedes cumplir un criterio de aceptación, deja el trabajo hecho hasta donde llegó, no marques el criterio y explica por qué.
