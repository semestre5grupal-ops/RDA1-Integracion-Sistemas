# P04 — Finanzas y Liquidaciones (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar el módulo de finanzas: comisiones de Booking, liquidaciones a proveedores y libro mayor.

## Salida
- `contracts/finanzas-openapi-v2.yaml`
- `docs/RDA2/entregas/P04-reporte.md`
- Sección P04 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/finanzas/finanzas.controller.ts`
- `src/modules/finanzas/finanzas.service.ts`
- `src/modules/finanzas/entities/liquidacion-proveedor.entity.ts`, `libro-mayor-comisiones.entity.ts`
- `src/modules/admin/admin-finanzas.service.ts` y, en `src/modules/admin/admin.controller.ts`, solo las rutas `finanzas`, `payouts`, `payouts/aprobar` (para detectar solapamiento; **esas rutas se documentan en P07, no aquí**)
- `contracts/common/components-v2.yaml`

## Rutas que debe cubrir (4)
| Método | Ruta | Handler |
|---|---|---|
| GET | `/finanzas/resumen` | `getResumen` |
| GET | `/finanzas/liquidaciones` (`periodo`, `estado`) | `getLiquidaciones` |
| POST | `/finanzas/liquidaciones/{id}/pagar` | `marcarPagada` |
| GET | `/finanzas/libro-mayor` (`limit`) | `getLibroMayor` |

## Qué debe documentar
1. **Modelo económico:** comisión de Booking (**10 %**) vs **90 %** para el socio; cuándo se registra el asiento en el libro mayor (por cada orden confirmada); qué pasa con reembolsos y compensaciones.
2. **Seguridad real:** `SupabaseAuthGuard` + `RolesGuard` con rol `ADMIN`, y el header opcional `X-Admin-Key` (solo pruebas). Documenta 401/403.
3. Schemas con los campos reales de `Liquidacion` y asiento del libro mayor (estados, periodo, montos como número o string según el servicio).
4. `POST .../pagar`: cuerpo `{ comprobante_url, notas? }`, respuesta, idempotencia (¿qué pasa si ya está pagada? documenta el código real).
5. Período de liquidación: la descripción de ruta dice "quincenales" y el servicio puede agrupar por mes: documenta lo que hace el código.

## Discrepancias ya detectadas (verifícalas y regístralas)
- **Solapamiento** entre `FinanzasController` y `AdminController` (`/admin/finanzas`, `/admin/payouts`, `/admin/payouts/aprobar`): ¿dos implementaciones del mismo concepto? ¿Cuál usa el frontend (`grep` en `frontend/src`)?
- Periodicidad "quincenal" (texto) vs agrupación mensual (código).
- Si los reembolsos descuentan de la liquidación.

## Criterios de aceptación
- [ ] Las 4 rutas están en el contrato con `x-source` y `x-status`.
- [ ] Redocly lint sin errores.
- [ ] Modelo 10/90 explicado con un ejemplo numérico en la descripción.
- [ ] Reporte con cobertura, supuestos y hallazgos (incluido el solapamiento).

## Entrega
Commit: `docs(contracts): P04 finanzas openapi v2`
