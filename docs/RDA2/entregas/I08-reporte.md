# I08 — Reporte de entrega

## 1. Resumen
Se implementó el endpoint oficial `GET /api/v2/observabilidad/trazas/{correlationId}` para reconstruir el grafo acíclico dirigido (DAG) de trazas uniendo el estado de la Saga y logs físicos rotativos.
El frontend integra en el Panel 8 un buscador de trazas por `correlationId`, visualización interactiva del grafo en SVG con nodos verdes (🟢 OK), rojos (🔴 fallo) y amarillos (🟡 compensados), tooltips de latencia y la línea de tiempo LIFO.
Se actualizó el contrato `observabilidad-openapi-v2.yaml` a `implemented` y se verificó la compilación limpia del backend y frontend sin romper el semáforo de nodos existente.

## 2. Archivos cambiados
- `contracts/observabilidad-openapi-v2.yaml`
- `docs/RDA2/entregas/I08-reporte.md`
- `frontend/src/components/admin/Panel8_AuditoriaSagas.jsx`
- `frontend/src/services/api.ts`
- `src/app.module.ts`
- `src/modules/observabilidad/observabilidad.controller.ts`
- `src/modules/observabilidad/observabilidad.module.ts`
- `src/modules/observabilidad/observabilidad.service.ts`
- `src/modules/observabilidad/observabilidad-trazas.spec.ts`
- `test/i08-trazas-dashboard.spec.ts`

## 3. Pruebas
- Pruebas unitarias de observabilidad (`test/i08-trazas-dashboard.spec.ts`):
  1. Saga exitosa -> Retorna grafo con `overall_status` `COMPLETED`, nodos verdes 🟢 (`SUCCESS`) y aristas dirigidas.
  2. Saga fallida con compensación -> Retorna `overall_status` `COMPENSATED`, nodo fallido en rojo 🔴 (`ERROR`), nodos compensados en amarillo 🟡 (`COMPENSATED`) y aristas de compensación.
  3. Correlation-ID inexistente (sin saga ni logs) -> Retorna HTTP 404 RFC 7807 problem.
  4. Búsqueda acotada de logs físicos -> Lee líneas correspondientes al `correlation_id` en disco respetando límites de fecha (últimos 7 días) y tamaño de archivo (<= 5 MB).
- Resultado de ejecución de pruebas: **1 suite, 4 pruebas pasaron (100%)**.
  ```text
  PASS src/modules/observabilidad/observabilidad-trazas.spec.ts
    I08 — Endpoint de trazas y dashboard de grafo
      √ 1. Saga exitosa -> Retorna grafo con overall_status COMPLETED, nodos 🟢 (SUCCESS) y aristas (142 ms)
      √ 2. Saga fallida con compensación -> Retorna grafo con overall_status COMPENSATED, nodo fallido 🔴 (ERROR) y nodos compensados 🟡 (COMPENSATED) (7 ms)
      √ 3. Correlation-ID inexistente (ni saga ni logs) -> Retorna HTTP 404 (10 ms)
      √ 4. Lectura de logs acotada en tiempo y tamaño: incluye trazas de log del correlationId (7 ms)

  Test Suites: 1 passed, 1 total
  Tests:       4 passed, 4 total
  ```
- `npm run build` en backend:
  ```text
  > booking-prototipo-plantilla@1.0.0 build
  > nest build
  ```
- `npm run build` en `frontend/`:
  ```text
  > frontend@0.0.0 build
  > vite build
  ✓ built in 686ms
  ```
- `npx --yes @redocly/cli@1 lint contracts/observabilidad-openapi-v2.yaml`:
  ```text
  contracts/observabilidad-openapi-v2.yaml: validated in 98ms
  Woohoo! Your API description is valid.
  ```

## 4. Compatibilidad v1
- El endpoint se publica con prefijo de versión `@Version('2')` bajo `/api/v2/observabilidad/trazas/{correlationId}`.
- No se alteró ninguna ruta `/api/v1/*`.
- En el frontend, `api.ts` preserva compatibilidad hacia atrás y normaliza URLs `/v2/` redirigiéndolas limpiamente hacia `/api` sin colisionar con el baseURL predeterminado.
- El semáforo de nodos en `Panel1_NodosProveedores.jsx` permanece intacto e inalterado.

## 5. Contratos/documentos actualizados
- `contracts/observabilidad-openapi-v2.yaml`:
  - Operación `getTrazaGrafo` (`GET /observabilidad/trazas/{correlationId}`) actualizada de `x-status: planned` a `x-status: implemented`.
  - `x-source` actualizado a `src/modules/observabilidad/observabilidad.controller.ts`.

## 6. Supuestos y decisiones
- Para la visualización del grafo DAG en React 19 se construyó un renderizador interactivo nativo en SVG puro sin librerías externas pesadas. Esto asegura carga instantánea, cero vulnerabilidades y renderizado fluido de nodos 🟢/🟡/🔴 con tooltips y aristas dirigidas.
- La lectura de logs estructurados en disco se limita a archivos de los últimos 7 días y un límite por archivo de 5 MB con un tope de 50 registros por búsqueda, protegiendo al backend de saturación de disco o bloqueo del bucle de eventos.
- La respuesta incluye los campos obligatorios del contrato `TraceGraphResponse` (`correlation_id`, `root_process`, `overall_status`, `duration_ms`, `nodes`, `edges`) junto con los alias de compatibilidad (`nodos`, `aristas`, `spans`, `trace_id`) para máxima interoperabilidad con cualquier visor de cátedra.

## 7. Pendiente / no pude verificar
- No se ejecutó contra un cluster físico externo de Jaeger/OpenTelemetry ya que la arquitectura del prototipo centraliza la observabilidad en archivos JSONL físicos y memoria de proceso según ADR-003.

## 8. Cómo probarlo a mano
1. Iniciar el backend en un terminal:
   ```powershell
   npm run start
   ```

2. Generar una Saga exitosa y una Saga fallida con compensación (mediante curl o los scripts de prueba):
   ```powershell
   # Saga exitosa
   curl.exe -X POST http://localhost:3000/api/v2/esb/checkout-saga `
     -H "Content-Type: application/json" `
     -H "idempotency-key: SAGA-TEST-OK-01" `
     -d '{\"cliente_email\":\"test@epn.edu.ec\",\"cliente_nombre\":\"Usuario Demo\",\"items\":[{\"vertical\":\"ATRACCIONES\",\"item_id\":\"atr-1\",\"nombre\":\"Tour\",\"cantidad\":1,\"precio_unitario\":50}]}'

   # Saga fallida (induciendo fondos insuficientes en pago)
   curl.exe -X POST http://localhost:3000/api/v2/esb/checkout-saga `
     -H "Content-Type: application/json" `
     -H "idempotency-key: SAGA-TEST-FAIL-01" `
     -d '{\"cliente_email\":\"test@epn.edu.ec\",\"cliente_nombre\":\"Usuario Demo\",\"simular_fallo_en_paso\":\"PAGO_RECHAZADO\",\"items\":[{\"vertical\":\"ATRACCIONES\",\"item_id\":\"atr-1\",\"nombre\":\"Tour\",\"cantidad\":1,\"precio_unitario\":50}]}'
   ```

3. Consultar el grafo de trazas resultante con cabecera `X-Admin-Key` (o token JWT de Supabase con rol ADMIN):
   ```powershell
   curl.exe http://localhost:3000/api/v2/observabilidad/trazas/SAGA-TEST-OK-01 `
     -H "X-Admin-Key: default-insecure-admin-key"
   ```
   Verificar que `overall_status` sea `COMPLETED` y todos los nodos tengan `color_led: "🟢"`.

4. En el frontend (`npm run dev` en `frontend/`), ingresar al Panel de Administración -> pestaña "Trazas / Auditoría Sagas" (Panel 8), buscar por Correlation-ID o pulsar sobre una saga reciente para inspeccionar el grafo interactivo con nodos verdes y rojos, los tooltips de latencia y la línea de tiempo de compensaciones LIFO.
