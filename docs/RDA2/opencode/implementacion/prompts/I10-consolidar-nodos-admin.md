# I10 — Consolidar rutas duplicadas (nodos, finanzas) y versionado

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Debe ir después de I01.

## Objetivo
Resolver los solapamientos que P07/P08/P04 documentaron, sin romper clientes.

## Lee primero
`docs/RDA2/HALLAZGOS_CONTRATOS.md` (duplicados), `contracts/admin-openapi-v2.yaml`, `observabilidad-openapi-v2.yaml`, `finanzas-openapi-v2.yaml`, `src/modules/admin/*`, `src/modules/nodes/*`, `frontend/src` (qué ruta usa cada pantalla).

## Alcance
1. **Nodos:** elige la ruta canónica (la que indique P14/`CAMBIOS`; por defecto `POST /admin/nodes/{codigoNodo}/toggle-killswitch`) y deja las otras dos como `deprecated`: misma respuesta, encabezados `Deprecation: true` y `Link: <canónica>; rel="successor-version"`. Una sola implementación de servicio detrás de las tres.
2. **Frontend:** migra las llamadas a la ruta canónica.
3. **Finanzas/payouts:** unifica la lógica duplicada entre `FinanzasController` y los `payouts` de admin en un único servicio (las rutas se conservan).
4. **Parámetro `serviceId` vs `codigoNodo`:** acepta ambos nombres de forma consistente y documenta el mapeo.
5. Auditoría: toda acción de escritura de admin (toggle, aprobar payout, cambiar config) deja registro de auditoría.

## Criterios de aceptación
- [ ] Pruebas: las tres rutas de nodos producen el mismo efecto; las deprecated incluyen `Deprecation`.
- [ ] Pruebas de auditoría para toggle y payout.
- [ ] Frontend compila y usa la ruta canónica.
- [ ] Contratos actualizados (`deprecated: true`) y lint en verde.

## Entrega
Commit: `refactor(admin): ruta canonica de nodos, deprecaciones y auditoria [I10]`
