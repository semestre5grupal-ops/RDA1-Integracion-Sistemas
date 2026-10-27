# P12 — gRPC de inventario

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar el contrato gRPC que Booking expone (puerto 50051) para que las tiendas le empujen cambios de stock, y proponer la versión objetivo sin tocar el proto real.

## Salida
- `contracts/grpc/README.md`
- `contracts/grpc/inventory-v2.proposed.proto` (solo si hay mejoras que proponer)
- `docs/RDA2/entregas/P12-reporte.md`
- Sección P12 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

> **Prohibido modificar** `src/proto/inventory.proto` y cualquier archivo de `src/`.

## Lee primero (solo esto)
- `src/proto/inventory.proto` (el que carga `main.ts`)
- `Faltantes RDA2/src/proto/v1/common.proto`, `inventory.proto`, `nodehealth.proto` (alternativos)
- `src/main.ts` (microservicio gRPC, puerto, `protoPath`)
- `src/modules/inventory/inventory-grpc.controller.ts`, `inventory.service.ts`
- La sección gRPC de `contracts/vuelos-openapi-v2.yaml` (descripción con el proto de stock)
- `Faltantes RDA2/docs/PROTO_CLOUD_EVENTS.md`

## Qué debe contener el README
1. Servicio, paquete y RPCs reales (`PushStockUpdate`, `StreamInventoryChanges`, …): tipo (unario/streaming), mensajes y campos con su significado.
2. Quién llama a quién (tienda → Booking) y con qué frecuencia esperada.
3. Metadatos gRPC obligatorios propuestos: `x-correlation-id`, `traceparent`, `x-api-key` o token.
4. Códigos de estado gRPC usados (`OK`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `NOT_FOUND`, `UNAVAILABLE`…) y cuándo.
5. Ejemplo de llamada con `grpcurl`.
6. **Comparativa** entre el proto cargado por `main.ts` y los alternos de `Faltantes RDA2`: tabla de diferencias y cuál se recomienda.
7. **Despliegue:** gRPC sobre HTTP/2 y puerto distinto de HTTP: anota que hay que **verificar** el soporte del proveedor de hosting (Render) y propón alternativas (túnel, gRPC-Web, REST equivalente `POST /inventory/stock`) sin afirmar nada que no hayas comprobado.

## Validación
Carga el proto con `@grpc/proto-loader` (`npx` o script temporal fuera del repo) y pega el resultado en el reporte.

## Discrepancias ya detectadas (verifícalas y regístralas)
- Dos o tres versiones del proto en el repositorio.
- gRPC sin autenticación documentada.
- Existencia de la ruta REST `/inventory` que replica parcialmente el servicio.

## Criterios de aceptación
- [ ] README completo; si hay proto propuesto, carga sin errores.
- [ ] `src/` intacto (`git diff --stat` lo demuestra en el reporte).
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P12 grpc inventario`
