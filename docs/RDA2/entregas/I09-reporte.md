# I09 — Reporte de entrega

## 1. Resumen
Se unificó el archivo Protobuf `src/proto/inventory.proto` preservando compatibilidad binaria estricta con las versiones de producción y clientes.
Se implementó la autenticación gRPC por metadata (`x-api-key`) con comparación criptográfica en tiempo constante (`timingSafeEqual`), propagación de `x-correlation-id` y `traceparent`, y validación exhaustiva de mensajes.
Se habilitó la ruta alterna REST `POST /api/v2/inventory/stock` para tiendas sin soporte gRPC y se condicionó el socket en el puerto 50051 a la variable `GRPC_ENABLED`.

## 2. Archivos cambiados
- `contracts/grpc/README.md`
- `contracts/observabilidad-openapi-v2.yaml`
- `docs/RDA2/entregas/I09-reporte.md`
- `src/main.ts`
- `src/modules/inventory/inventory-grpc.controller.ts`
- `src/modules/inventory/inventory-grpc.spec.ts`
- `src/modules/inventory/inventory.service.ts`
- `src/proto/inventory.proto`
- `test/i09-grpc-inventario.spec.ts`

## 3. Pruebas
- Pruebas unitarias de gRPC e inventario (`test/i09-grpc-inventario.spec.ts`):
  1. `pushStockUpdate` sin metadata o sin `x-api-key` -> rechaza con `UNAUTHENTICATED` (código gRPC 16).
  2. `pushStockUpdate` con clave inválida -> rechaza con `UNAUTHENTICATED`.
  3. `pushStockUpdate` con payload inválido (unidades negativas) -> rechaza con `INVALID_ARGUMENT` (código gRPC 3).
  4. `pushStockUpdate` con credencial y datos válidos -> actualiza stock en memoria RAM y extrae contexto de correlación W3C.
  5. `POST /inventory/stock` REST sin cabecera `X-Api-Key` -> responde HTTP 401 Unauthorized.
  6. `POST /inventory/stock` REST con clave incorrecta -> responde HTTP 401 Unauthorized.
  7. `POST /inventory/stock` REST con cuerpo incompleto -> responde HTTP 400 Bad Request.
  8. `POST /inventory/stock` REST con datos válidos -> actualiza el inventario en el mismo servicio con `source: REST_FALLBACK` y retorna HTTP 200 con acuse (`StockUpdateAck`).
- Resultado de ejecución de pruebas: **1 suite, 8 pruebas pasaron (100%)**.
  ```text
  PASS src/modules/inventory/inventory-grpc.spec.ts
    I09 — gRPC de inventario: unificación, autenticación y alterno REST
      1. Inbound gRPC: pushStockUpdate
        √ Sin metadata o sin x-api-key -> rechaza con UNAUTHENTICATED (16) (48 ms)
        √ Con x-api-key incorrecta -> rechaza con UNAUTHENTICATED (16) (9 ms)
        √ Con payload inválido (unidades negativas) -> rechaza con INVALID_ARGUMENT (3) (7 ms)
        √ Con credencial válida en metadata -> stock actualizado con éxito (6 ms)
      2. Alterno REST Inbound: POST /inventory/stock
        √ Sin cabecera X-Api-Key -> HTTP 401 Unauthorized (6 ms)
        √ Con X-Api-Key incorrecta -> HTTP 401 Unauthorized (7 ms)
        √ Con cuerpo incompleto -> HTTP 400 Bad Request (5 ms)
        √ Con X-Api-Key válida y datos correctos -> actualiza stock y responde 200 con ack (5 ms)

  Test Suites: 1 passed, 1 total
  Tests:       8 passed, 8 total
  ```
- `npm run build` en backend: compilación limpia exitosa.
  ```text
  > booking-prototipo-plantilla@1.0.0 build
  > nest build
  ```
- `npx --yes @redocly/cli@1 lint contracts/observabilidad-openapi-v2.yaml`: validación de OpenAPI exitosa con cero errores.

## 4. Compatibilidad v1
- Se preservaron los números de campo tags 1 a 6 de `StockUpdateMessage` en `src/proto/inventory.proto`, por lo que cualquier cliente compilado con la versión previa de protobuf continúa operando sin alteración binaria.
- La ruta alterna REST responde bajo `/api/v2/inventory/stock` y `/inventory/stock`.
- Los endpoints existentes de consulta `GET /inventory` y `GET /inventory/status` se mantienen plenamente operativos.

## 5. Contratos/documentos actualizados
- `contracts/grpc/README.md`: Se añadió la Sección 8 formalizando el principio de asimetría de comunicación (Inbound gRPC/REST alterno desde las tiendas vs. Outbound REST hacia las tiendas), la autenticación por metadata y la variable `GRPC_ENABLED`.
- `contracts/observabilidad-openapi-v2.yaml`: Se documentó formalmente el endpoint `POST /inventory/stock` bajo el tag `Inventario Sincronizado gRPC Inbound`, protegido mediante el esquema de seguridad `ApiKeyAuth` (`X-Api-Key`).

## 6. Supuestos y decisiones
- **Asimetría Arquitectónica:** En estricto cumplimiento del diseño de integración, las tiendas satélites envían su disponibilidad hacia Booking Prototipo por gRPC (inbound), mientras que el Gateway central se comunica hacia las tiendas satélites utilizando sus APIs REST oficiales (outbound).
- **Mapeo de Claves de Proveedores:** Las llaves autorizadas se configuran en `INVENTORY_API_KEYS` o `ALOJAMIENTOS_API_KEYS` (formato `proveedor:clave,proveedor2:clave2` o lista separada por comas). En entornos no productivos se admiten llaves de prueba por defecto para facilitar tests automatizados locales.
- **Arranque en Plataformas de Hosting:** Para evitar fallos de arranque en Render (donde solo se enruta un puerto HTTP público), la inicialización del microservicio gRPC en el puerto 50051 respeta `GRPC_ENABLED !== 'false'`. Si Render no permite sockets TCP secundarios, se utiliza `GRPC_ENABLED=false` y las tiendas recurren a `POST /api/v2/inventory/stock`.

## 7. Pendiente / no pude verificar
- No se levantó un cliente `grpcurl` contra un socket remoto desplegado en la nube de Render debido a que el servicio actual se ejecuta en entorno local de pruebas.
- No se probó con streams de duración superior a 1 hora.

## 8. Cómo probarlo a mano
1. Para probar la autenticación y actualización vía **gRPC** en local:
   ```bash
   # Utilizando grpcurl con metadata x-api-key:
   grpcurl -plaintext \
     -H "x-api-key: test-inventory-secret-key-12345" \
     -H "x-correlation-id: corr-demo-01" \
     -d '{"service_id":"atracciones-dilan","item_id":"PRhu4UBTWPBC","date":"2026-10-26","time_slot":"10:00","available_units":20}' \
     localhost:50051 \
     inventory.InventoryStockService/PushStockUpdate
   ```
   Verificar que sin `-H "x-api-key: ..."` responde `Code: Unauthenticated`.

2. Para probar la **ruta alterna REST** (si la tienda no dispone de gRPC):
   ```powershell
   curl.exe -X POST http://localhost:3000/api/v2/inventory/stock `
     -H "Content-Type: application/json" `
     -H "X-Api-Key: test-inventory-secret-key-12345" `
     -H "X-Correlation-Id: corr-rest-test-01" `
     -d '{\"service_id\":\"atracciones-dilan\",\"item_id\":\"PRhu4UBTWPBC\",\"date\":\"2026-10-26\",\"time_slot\":\"10:00\",\"available_units\":18}'
   ```
   Debe responder HTTP 200 con `{"success": true, "message": "Stock sincronizado...", "processed_at": ...}`.

3. Consultar el stock actualizado mediante el endpoint de observabilidad:
   ```powershell
   curl.exe "http://localhost:3000/api/v2/inventory?item_id=PRhu4UBTWPBC" `
     -H "X-Admin-Key: default-insecure-admin-key"
   ```
