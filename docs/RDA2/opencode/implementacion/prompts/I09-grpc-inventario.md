# I09 — gRPC de inventario: unificación y autenticación

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Independiente.

## Objetivo
Un solo proto vigente, con autenticación y un camino alterno si el hosting no soporta gRPC.

## Lee primero
`contracts/grpc/README.md` y `inventory-v2.proposed.proto`, `docs/RDA2/entregas/P12-reporte.md`, `src/proto/inventory.proto`, `Faltantes RDA2/src/proto/v1/*`, `src/main.ts`, `src/modules/inventory/*`, `docs/RDA2/PLAN_DE_DESPLIEGUE.md` (si existe).

## Alcance
1. **Unificar el proto:** adopta la versión recomendada en el README de P12; si cambia `src/proto/inventory.proto`, mantén compatibilidad (campos nuevos solo con números nuevos).
2. **Autenticación por metadata** (`x-api-key` por proveedor, comparación en tiempo constante) y lectura de `x-correlation-id` / `traceparent`; `UNAUTHENTICATED` sin credencial.
3. **Validación** de mensajes (`INVALID_ARGUMENT`) y códigos gRPC del README.
4. **Alterno REST:** `POST /inventory/stock` (mismo modelo que `PushStockUpdate`, autenticado con `X-Api-Key`) para tiendas que no puedan usar gRPC. Ambos caminos llaman al mismo servicio.
5. Habilitar gRPC solo si `GRPC_ENABLED=true` (defecto `true` en local) para no romper el arranque en hosting sin soporte.

## Criterios de aceptación
- [ ] Pruebas del servicio de inventario (REST y, si el entorno lo permite, gRPC con cliente de prueba).
- [ ] Sin credencial → rechazo; con credencial → stock actualizado.
- [ ] README de gRPC y contrato OpenAPI de observabilidad actualizados.

## Entrega
Commit: `feat(inventory): proto unificado, auth por metadata y alterno REST [I09]`
