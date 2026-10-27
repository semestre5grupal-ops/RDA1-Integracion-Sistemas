# D1 — Requisitos funcionales

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md` (las reglas de git, reporte y hallazgos aplican igual; aquí el entregable es documentación). Ejecuta **después de P14**.

## Objetivo
Un documento único de requisitos funcionales de Booking para RDA2, consolidando lo que ya existe y **trazado a los contratos**.

## Salida
- `docs/RDA2/REQUISITOS_FUNCIONALES.md`
- `docs/RDA2/entregas/D1-reporte.md`

## Lee primero
- `Pendientes/*.md` (consolida; no reescribas desde cero)
- `docs Paúl Rosero/product-requirements.md`
- `docs Paúl Rosero/GUIA_DEFENSA_ORAL_Y_MATRIZ_EVIDENCIAS_RDA2.md` (CE01–CE11)
- `contracts/README.md` y los contratos `*-v2.yaml`, `docs/RDA2/PLANNED_ENDPOINTS.md`

## Estructura obligatoria
1. Alcance y actores (CLIENTE, ADMIN, MANTENIMIENTO, tienda/proveedor, sistema).
2. Requisitos agrupados por módulo: búsqueda unificada, checkout/saga, pagos, paquetes y promociones, facturación, finanzas, administración, nodos/observabilidad, chatbot, webhooks, inventario gRPC, identidad.
3. Cada requisito: **ID** `RF-<MÓD>-NN`, enunciado ("El sistema debe…"), prioridad (MoSCoW), **estado** (implementado / parcial / planificado, según `x-status`), **contrato y operación** (`contrato#operationId`), criterio de aceptación verificable (Dado/Cuando/Entonces) y fuente (archivo del repo o documento).
4. Historias de usuario clave (mínimo 8) con enlace a los RF.
5. Fuera de alcance (alojamientos como contrato propio de otro equipo).

## Reglas
- No inventes requisitos que no tengan fuente; si propones uno nuevo, márcalo `Propuesto` y regístralo en el reporte.
- Todo RF `implementado` debe corresponder a una operación del contrato con `x-status: implemented`.

## Criterios de aceptación
- [ ] ≥ 1 RF por cada contrato `*-v2`.
- [ ] Tabla resumen RF → contrato/operación al final.
- [ ] Sin RF huérfanos (sin fuente) ni operaciones del contrato sin RF (lista de excepciones en el reporte).

## Entrega
Commit: `docs(rda2): D1 requisitos funcionales`
