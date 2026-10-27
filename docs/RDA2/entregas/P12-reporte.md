# Reporte P12 — gRPC de Inventario y Stock v2

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/grpc/README.md` | Creado | Documentación integral del microservicio gRPC Inbound (`InventoryStockService` en puerto 50051), topología RPC, mensajes, metadata de trazabilidad W3C (`x-correlation-id`, `traceparent`), códigos de error gRPC, ejemplos `grpcurl`, comparativa con archivos alternos de `Faltantes RDA2` y análisis de despliegue sobre HTTP/2 en Render con alternativas. |
| `contracts/grpc/inventory-v2.proposed.proto` | Creado | Especificación Protobuf v2 propuesta que unifica el paquete canónico `booking.inventory.v2`, soporte para actualizaciones individuales y por lotes (`BatchStockUpdate`), streaming client y bidireccional (`BiDirectionalStockStream`), verificación de disponibilidad (`CheckAvailability`), clasificación por `ResourceType` y trazabilidad W3C limpia. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P12-01 a H-P12-04 (coexistencia de versiones divergentes de proto, gRPC sin autenticación/guards en puerto 50051, rutas REST de inventario no estandarizadas y riesgo de red en hosting Render para puerto gRPC 50051 secundario). |
| `docs/RDA2/entregas/P12-reporte.md` | Creado | Reporte formal de entrega de la tarea P12. |

---

## Cobertura de rutas y operaciones (controlador vs contrato)

El controlador `InventoryGrpcController` (`src/modules/inventory/inventory-grpc.controller.ts`) expone tanto métodos gRPC sobre HTTP/2 (puerto 50051) como consultas HTTP/REST de soporte:

| Protocolo / Método | Ruta / RPC | Handler | En el contrato | x-status | Microservicio |
|---|---|---|:---:|:---:|---|
| `gRPC Unario` | `InventoryStockService/PushStockUpdate` | `InventoryGrpcController.pushStockUpdate` | Sí (`README.md` §1.1 + `inventory-v2.proposed.proto`) | `implemented` | `MS_STK` |
| `gRPC Client-Stream` | `InventoryStockService/StreamInventoryChanges` | `InventoryGrpcController.streamInventoryChanges` | Sí (`README.md` §1.2 + `inventory-v2.proposed.proto`) | `implemented` | `MS_STK` |
| `gRPC Batch Unario` | `InventoryStockService/BatchStockUpdate` | Propuesto para v2 | Sí (`inventory-v2.proposed.proto` l. 33) | `planned` | `MS_STK` |
| `gRPC Bi-Stream` | `InventoryStockService/BiDirectionalStockStream` | Propuesto para v2 | Sí (`inventory-v2.proposed.proto` l. 39) | `planned` | `MS_STK` |
| `gRPC Unario` | `InventoryStockService/CheckAvailability` | Propuesto para v2 | Sí (`inventory-v2.proposed.proto` l. 42) | `planned` | `MS_STK` |
| `REST GET` | `/inventory/status` | `InventoryGrpcController.getStatus` | Sí (`observabilidad-openapi-v2.yaml` / `README.md`) | `implemented` | `MS_STK` |
| `REST GET` | `/inventory` | `InventoryGrpcController.getInventory` | Sí (`observabilidad-openapi-v2.yaml` / `README.md`) | `implemented` | `MS_STK` |

---

## Validación

Se ejecutó la carga y parsing sintáctico estricto tanto del proto cargado por `main.ts` (`src/proto/inventory.proto`) como del proto objetivo propuesto (`contracts/grpc/inventory-v2.proposed.proto`) utilizando `@grpc/proto-loader` mediante un script de validación aislado en el entorno de pruebas scratch (`validate-proto.js`), respetando la restricción de no modificar dependencias del proyecto:

```javascript
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
```

### Resultado de la Validación Sintáctica

```text
--- VALIDACIÓN DE PROTOBUFS ---

======================================================
Probando carga de: src/proto/inventory.proto
✅ Carga exitosa.
Entidades cargadas (5):
  - Servicio: inventory.InventoryStockService -> Métodos: [PushStockUpdate, StreamInventoryChanges]
  - Mensaje/Tipo: inventory.StockUpdateMessage
  - Mensaje/Tipo: inventory.StockUpdateAck
  - Mensaje/Tipo: inventory.StockChangeEvent
  - Mensaje/Tipo: inventory.StreamSummary

======================================================
Probando carga de: contracts/grpc/inventory-v2.proposed.proto
✅ Carga exitosa.
Entidades cargadas (14):
  - Servicio: booking.inventory.v2.InventoryStockService -> Métodos: [PushStockUpdate, BatchStockUpdate, StreamInventoryChanges, BiDirectionalStockStream, CheckAvailability]
  - Mensaje/Tipo: booking.inventory.v2.TraceContext
  - Mensaje/Tipo: booking.inventory.v2.ResourceType
  - Mensaje/Tipo: booking.inventory.v2.ErrorDomainCode
  - Mensaje/Tipo: booking.inventory.v2.StockUpdateMessage
  - Mensaje/Tipo: booking.inventory.v2.StockUpdateAck
  - Mensaje/Tipo: booking.inventory.v2.BatchStockUpdateRequest
  - Mensaje/Tipo: booking.inventory.v2.BatchStockUpdateResponse
  - Mensaje/Tipo: booking.inventory.v2.StockItemFailure
  - Mensaje/Tipo: booking.inventory.v2.StockChangeEvent
  - Mensaje/Tipo: booking.inventory.v2.StreamSummary
  - Mensaje/Tipo: booking.inventory.v2.StockChangeAck
  - Mensaje/Tipo: booking.inventory.v2.CheckAvailabilityRequest
  - Mensaje/Tipo: booking.inventory.v2.CheckAvailabilityResponse
```

### Integridad del Código Fuente (`src/` intacto)

Comando ejecutado:
```bash
git diff --stat src/
```
**Resultado:** Sin salida (`0` archivos modificados, `0` líneas alteradas en `src/`).

---

## Supuestos y decisiones tomadas

1. **Preservación del Proto Real en Producción:**
   - De conformidad estricta con la instrucción de la tarea y `00-REGLAS-COMUNES.md`, no se alteró ni una sola línea de `src/proto/inventory.proto` ni de los controladores en `src/modules/inventory/`.
2. **Propuesta de `inventory-v2.proposed.proto`:**
   - Se diseñó un contrato v2 autocontenido dentro de `contracts/grpc/` que resuelve las limitaciones de v1 (añadiendo soporte por lotes, verificación de disponibilidad, streaming bidireccional y metadata W3C) sin heredar los defectos de sintaxis detectados en los archivos de `Faltantes RDA2`.
3. **Manejo de Despliegue en Render (Sin Afirmaciones No Comprobadas):**
   - Se documentó con total transparencia que las plataformas de hosting PaaS tipo Render (plan Web Service) exponen habitualmente un único puerto HTTP público (redireccionado a `PORT=3000`), por lo que el socket secundario gRPC `50051` requiere verificación de red en infraestructura (Private Service o túnel) y se planteó formalmente el fallback por REST `POST /api/v2/inventory/stock`.

---

## Hallazgos registrados (IDs)

* **H-P12-01 (Severidad Media):** Coexistencia de versiones divergentes de Protobuf en el repositorio (`src/proto/inventory.proto` vs `Faltantes RDA2/src/proto/v1/inventory.proto` con artefactos de copiado).
* **H-P12-02 (Severidad Alta):** Microservicio gRPC sin autenticación ni validación de credenciales en `InventoryGrpcController` (puerto 50051 expuesto sin guards ni verificación de API keys).
* **H-P12-03 (Severidad Media):** Endpoints REST de inventario no estandarizados ni unificados con la API v2 (`GET /inventory` y `/inventory/status` duplican rutas sin prefijo homogéneo).
* **H-P12-04 (Severidad Media):** Riesgo de incompatibilidad de puerto secundario gRPC (puerto 50051) en hosting Render Web Services frente a balanceadores HTTP/1.1.

---

## Dudas para el revisor

1. ¿Se prevé para la fase final de despliegue migrar Booking a un contenedor Docker / Private Service en Render para habilitar el socket gRPC 50051 público, o se instruirá a las tiendas de los compañeros a utilizar el fallback REST equivalente `POST /api/v2/inventory/stock`?
2. ¿Debe el interceptor de autenticación de gRPC en la tarea de implementación I04 validar la `x-api-key` contra la tabla `schema_proveedores.config_proveedor` o utilizar tokens de sesión emitidos por Supabase?
