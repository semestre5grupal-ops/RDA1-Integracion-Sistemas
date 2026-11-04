# I10 — Reporte de entrega

## 1. Resumen
Se consolidaron las tres rutas duplicadas de conmutación de Kill-Switches bajo el endpoint canónico protegido `POST /admin/nodes/{codigoNodo}/toggle-killswitch`, marcando las dos rutas históricas como `deprecated` con encabezados HTTP `Deprecation: true` y `Link` sucesor.
Se unificó el motor financiero y la lógica contable de liquidaciones quincenales y payouts exclusivamente en `FinanzasService` (`MS_FIN`), con validación de idempotencia (BL-053) y soporte dual en `schema_finanzas` y `panel_liquidaciones`.
Se mapearon de forma consistente los identificadores `serviceId` ('atracciones', 'autos', 'alojamientos', 'vuelos', 'grpc_inventory') y `codigoNodo` ('NODE_ATR_DILAN', etc.), migrando todas las llamadas de la consola de administración frontend hacia la ruta canónica y asegurando registro de auditoría en toda mutación.

## 2. Archivos cambiados
- `contracts/admin-openapi-v2.yaml`
- `contracts/observabilidad-openapi-v2.yaml`
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`
- `docs/RDA2/entregas/I10-reporte.md`
- `frontend/src/pages/AdminDashboard.jsx`
- `src/modules/admin/admin-consolidar-nodos.spec.ts`
- `src/modules/admin/admin-finanzas.service.ts`
- `src/modules/admin/admin.controller.ts`
- `src/modules/admin/admin.module.ts`
- `src/modules/finanzas/finanzas.service.ts`
- `src/modules/nodes/nodes.controller.ts`
- `src/modules/nodes/nodes.service.ts`
- `test/i10-consolidar-nodos-admin.spec.ts`

## 3. Pruebas
- Pruebas unitarias automatizadas (`test/i10-consolidar-nodos-admin.spec.ts` / `src/modules/admin/admin-consolidar-nodos.spec.ts`):
  1. `Ruta Canónica: POST /admin/nodes/:codigoNodo/toggle-killswitch` -> Conmuta estado en BD y memoria RAM, registra auditoría física en Winston y no adjunta cabecera de deprecación.
  2. `Ruta Deprecada 1: POST /nodes/:codigoNodo/toggle` -> Conmuta el nodo idénticamente y adjunta encabezados `Deprecation: true` y `Link: </api/v2/admin/nodes/NODE_ATR_DILAN/toggle-killswitch>; rel="successor-version"`.
  3. `Ruta Deprecada 2: POST /admin/nodes/:serviceId/toggle` -> Delega la mutación a `NodesService`, adjunta encabezados `Deprecation` y `Link`, y registra auditoría tanto en `auditService.registrar` como en `winstonLogger.logAudit`.
  4. `Resolución consistente serviceId vs codigoNodo` -> Admite indistintamente `'atracciones'` y `'NODE_ATR_DILAN'`, resolviendo el mismo conector y sincronizando su Circuit Breaker.
  5. `Delegación Payouts en FinanzasService` -> `AdminFinanzasService.aprobarPayout` delega en `FinanzasService`, calculando 10% comisión / 90% socio y emitiendo auditoría `PAYOUT_APROBADO`.
  6. `Idempotencia de Liquidaciones Pagadas (BL-053)` -> Si una liquidación ya tiene estado `PAGADO`, devuelve el comprobante existente sin alterar la marca de tiempo histórica ni disparar escrituras duplicadas.
- Resultado de ejecución de pruebas: **6 pruebas pasaron (100%)**.
  ```text
  PASS src/modules/admin/admin-consolidar-nodos.spec.ts
    I10 — Consolidar rutas duplicadas de nodos, finanzas y versionado
      1. Unificación de Kill-Switches y Rutas de Nodos
        √ Ruta Canónica: POST /admin/nodes/:codigoNodo/toggle-killswitch conmuta estado y audita sin cabecera Deprecation (7 ms)
        √ Ruta Deprecada 1: POST /nodes/:codigoNodo/toggle adjunta encabezados Deprecation y Link a la canónica (1 ms)
        √ Ruta Deprecada 2: POST /admin/nodes/:serviceId/toggle delega en NodesService y adjunta Deprecation y Link (1 ms)
        √ Acepta de forma consistente tanto serviceId ("atracciones") como codigoNodo ("NODE_ATR_DILAN") (1 ms)
      2. Consolidación de Finanzas y Payouts en FinanzasService
        √ AdminFinanzasService delega la aprobación de payout a FinanzasService y audita (1 ms)
        √ FinanzasService.marcarLiquidacionPagada es idempotente ante liquidación ya pagada (1 ms)

  Test Suites: 1 passed, 1 total
  Tests:       6 passed, 6 total
  ```
- Compilación del backend (`npm run build`):
  ```text
  > booking-prototipo-plantilla@1.0.0 build
  > nest build
  ```
- Compilación del frontend (`npm run build` en `frontend/`):
  ```text
  ✓ built in 4.01s
  ```
- Validación de contratos OpenAPI con Redocly:
  ```text
  contracts\admin-openapi-v2.yaml: validated in 86ms. Woohoo! Your API description is valid.
  contracts\observabilidad-openapi-v2.yaml: validated in 124ms. Woohoo! Your API description is valid.
  ```

## 4. Compatibilidad v1
- Se preservaron las dos rutas obsoletas:
  - `POST /nodes/:codigoNodo/toggle` (v1/pública con guard)
  - `POST /admin/nodes/:serviceId/toggle` (v1/admin)
- Ambas rutas continúan respondiendo con éxito (HTTP 200) e implementan el mismo comportamiento que la ruta canónica, añadiendo de forma transparente los encabezados estándar de la IETF:
  - `Deprecation: true`
  - `Link: </api/v2/admin/nodes/{codigoNodo}/toggle-killswitch>; rel="successor-version"`
- Se aceptan indistintamente los parámetros `body.activar` y `body.enabled` para no romper clientes históricos.

## 5. Contratos/documentos actualizados
- `contracts/admin-openapi-v2.yaml`: Marcada la operación `toggleNode` (`POST /admin/nodes/{serviceId}/toggle`) con `deprecated: true` y referenciada la ruta canónica `POST /admin/nodes/{codigoNodo}/toggle-killswitch`.
- `contracts/observabilidad-openapi-v2.yaml`: Marcada la operación `toggleNodePublic` (`POST /nodes/{codigoNodo}/toggle`) con `deprecated: true`.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`: Marcados como resueltos los hallazgos `H-P07-01`, `H-P07-02` y `H-P08-04`.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`: Incorporado bloque de estado de implementación I10 resolviendo `BL-018`, `BL-019` y `BL-053`.

## 6. Supuestos y decisiones
- **Resolución Símétrica de Identificadores:** Se implementó `NodesService.buscarNodo()` con una estrategia de cuatro niveles: 1) coincidencia exacta por `codigoNodo` o UUID `id`, 2) mapeo de alias canónicos de `serviceId` ('atracciones' -> 'ATRACCIONES', etc.), 3) coincidencia parcial por nombre de proveedor, y 4) auto-siembra de nodos estándar si la base de datos de configuración se inicializa vacía.
- **Formato Unificado de Respuesta:** `toggleKillSwitch` retorna tanto las propiedades del formato moderno (`codigo_nodo`, `kill_switch_activo`, `estado`, `mensaje`) como las del monitor de memoria (`node`, `message`, `enabled`), garantizando que cualquier panel o cliente consuma exactamente la estructura que espera.
- **Idempotencia Contable:** Conforme al hallazgo BL-053, invocar `marcarLiquidacionPagada` o `aprobarPayout` sobre un registro que ya se encuentra con estado `PAGADO` devuelve HTTP 200 con acuse `idempotent_replayed: true` sin reescribir la fecha histórica ni registrar débitos duplicados.

## 7. Pendiente / no pude verificar
- La persistencia física en PostgreSQL real (`panel_liquidaciones` y `schema_finanzas.liquidaciones_proveedores`) se verificó con repositorios y transacciones simuladas, ya que no se conecta a bases de datos de producción durante las pruebas unitarias.

## 8. Cómo probarlo a mano
1. Conmutar un kill-switch mediante la **ruta canónica oficial**:
   ```powershell
   curl.exe -X POST http://localhost:3000/api/v2/admin/nodes/NODE_ATR_DILAN/toggle-killswitch `
     -H "Content-Type: application/json" `
     -H "X-Admin-Key: default-insecure-admin-key" `
     -d '{\"activar\": true}'
   ```
   Verificar que responde HTTP 200 con `kill_switch_activo: true` y `estado: "APAGADO"`.

2. Probar la **ruta deprecada 1** y verificar encabezados de deprecación:
   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/v2/nodes/NODE_ATR_DILAN/toggle `
     -H "Content-Type: application/json" `
     -H "X-Admin-Key: default-insecure-admin-key" `
     -d '{\"activar\": false}'
   ```
   Comprobar en la cabecera HTTP la presencia de:
   ```http
   Deprecation: true
   Link: </api/v2/admin/nodes/NODE_ATR_DILAN/toggle-killswitch>; rel="successor-version"
   ```

3. Probar la **ruta deprecada 2** con alias `serviceId`:
   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/v2/admin/nodes/atracciones/toggle `
     -H "Content-Type: application/json" `
     -H "X-Admin-Key: default-insecure-admin-key" `
     -d '{\"enabled\": true}'
   ```
   Comprobar que responde con éxito, enlaza a la ruta sucesora y reactiva el conector en memoria y base de datos.

4. Aprobar un **payout financiero unificado**:
   ```powershell
   curl.exe -X POST http://localhost:3000/api/v2/admin/payouts/aprobar `
     -H "Content-Type: application/json" `
     -H "X-Admin-Key: default-insecure-admin-key" `
     -d '{\"vertical\":\"atracciones\",\"periodo\":\"2026-10-Q1\",\"referencia\":\"TRX-BANCO-001\"}'
   ```
   Comprobar que genera la liquidación y emite auditoría forense en `logs/audit-YYYY-MM-DD.log`.
