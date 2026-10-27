# P05 — Facturación v2 (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Reescribir el contrato de facturación para que **describa lo que realmente existe** y deje explícito qué del contrato v1 sigue pendiente.

## Salida
- `contracts/facturacion-openapi-v2.yaml` (el v1 `facturacion-openapi.yaml` **no se toca**)
- `docs/RDA2/entregas/P05-reporte.md`
- Sección P05 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/facturas/facturas.controller.ts`, `facturas.service.ts`, `dto/enviar-factura.dto.ts`
- `src/core/entities/factura.entity.ts`, `factura-item.entity.ts`
- `contracts/facturacion-openapi.yaml` (v1) y la sección de facturación de `contracts/CAMBIOS_CONTRATOS.md`
- `src/modules/esb/esb.controller.ts` + `esb-internal-router.service.ts` (solo `aggregate/facturas/{facturaId}`)
- `src/modules/graphql/models/factura.model.ts` y las queries de factura en `graphql-bff.resolver.ts`
- Frontend: busca dónde se genera el PDF (`grep -rn "jspdf\|enviarFactura\|facturas/enviar" frontend/src`)
- `contracts/common/components-v2.yaml`

## Rutas
**Implementada (1):** `POST /facturas/enviar` (`enviar`): recibe el PDF en Base64 y lo envía por SMTP al correo del usuario autenticado (el destinatario sale del token; el cliente no lo elige). Respuestas: 200, 400 (Base64 no es PDF), 401, 502 (SMTP rechazó), 503 (correo no configurado).

**Del contrato v1 (decide con evidencia del código):**
| Ruta v1 | ¿Existe en el código? | Acción |
|---|---|---|
| `POST /facturas` (emitir) | verifica | `planned` si no existe |
| `GET /facturas`, `GET /facturas/{id}` | verifica (hay agregado en ESB) | enlaza con `GET /esb/aggregate/facturas/{facturaId}` |
| `GET /facturas/{id}/pdf` | verifica | `planned` si el PDF se genera en el navegador |
| `PATCH /facturas/{id}/anular` | verifica | `planned` |

Para cada ruta v1 sin implementación: inclúyela como `x-status: planned` **solo si el modelo de datos (`factura.entity.ts`) la soporta**; si no, déjala fuera y regístralo.

## Qué debe documentar
1. Cómo nace una factura hoy: ¿la crea la Saga? ¿el frontend? ¿un evento? Descríbelo con evidencia.
2. Schema `EnviarFacturaDto` con límites reales (tamaño máximo del Base64, nombre de archivo).
3. Esquema `Factura` / `FacturaItem` con los campos de las entidades y el `producto_id_externo` por vertical (vuelos → `bookingId`, alojamientos → `order_id`, atracciones → `reservation_id`; verifica y completa autos).
4. **Evento que debería disparar la factura:** `booking.ticket_issued` de vuelos (y equivalentes), como `planned` (se formaliza en P11).
5. Seguridad: `SupabaseAuthGuard` y 401.

## Discrepancias ya detectadas (verifícalas y regístralas)
- v1 prometía 5 endpoints; el código expone 1.
- El PDF se genera en el navegador y el backend solo lo reenvía: ¿es válido como factura? Documenta el hecho, no opines.
- `CAMBIOS_CONTRATOS.md` dice que facturación v1 estaba completa y no coincide con el código.

## Criterios de aceptación
- [ ] Cada ruta v1 está clasificada (`implemented` / `planned` / descartada con motivo) en el reporte.
- [ ] Redocly lint sin errores.
- [ ] Reporte con cobertura, supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P05 facturacion openapi v2`
