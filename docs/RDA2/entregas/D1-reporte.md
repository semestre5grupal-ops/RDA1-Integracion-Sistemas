# Reporte D1 — Requisitos funcionales

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `docs/RDA2/REQUISITOS_FUNCIONALES.md` | Creado | Documento maestro consolidado de Requisitos Funcionales de Booking Prototipo para RDA2. Incluye definición de alcance y 5 actores (`CLIENTE`, `ADMIN`, `MANTENIMIENTO`, `PROV`, `SYS`), especificación detallada de 66 requisitos agrupados en 12 módulos funcionales con formato Gherkin (Dado/Cuando/Entonces), 10 Historias de Usuario clave (HU-01 a HU-10), fronteras del sistema / fuera de alcance, y matriz de trazabilidad exhaustiva de requisitos frente a contratos formales v2. |
| `docs/RDA2/entregas/D1-reporte.md` | Creado | Reporte formal de entrega de la tarea D1. |

---

## Cobertura de rutas (controlador vs contrato)

A continuación se muestra el mapeo de cobertura entre controladores del Gateway NestJS, los contratos v2 y los Requisitos Funcionales asociados:

| Método | Ruta | Handler | En el contrato | x-status | Requisito Funcional |
|:---:|---|---|---|:---:|:---:|
| `GET` | `/graphql` (`catalogoUnificado`) | `GraphqlBffResolver.catalogoUnificado` | `schema.graphql#Query.catalogoUnificado` | `implemented` | `RF-BUS-01` |
| `GET` | `/atracciones/search` | `AtraccionesController.search` | `atracciones-openapi-v2.yaml#GET /atracciones/search` | `implemented` | `RF-BUS-02` |
| `GET` | `/atracciones/categorias/arbol` | `AtraccionesController.arbolCategorias` | `atracciones-openapi-v2.yaml#GET /atracciones/categorias/arbol` | `implemented` | `RF-BUS-02` |
| `GET` | `/autos/search` | `AutosController.search` | `autos-openapi-v2.yaml#GET /autos/search` | `implemented` | `RF-BUS-03` |
| `GET` | `/autos/flota` | `AutosController.getFlota` | `autos-openapi-v2.yaml#GET /autos/flota` | `implemented` | `RF-BUS-03` |
| `POST`| `/vuelos/v2/flights/search` | `VuelosController.searchFlights` | `vuelos-openapi-v2.yaml#searchFlights` | `implemented` | `RF-BUS-04` |
| `POST`| `/esb/checkout-saga` | `EsbController.checkoutSaga` | `esb-sagas-openapi-v2.yaml#checkoutSaga` | `implemented` | `RF-SAGA-01` |
| `POST`| `/graphql` (`checkoutOrquestado`)| `GraphqlBffResolver.checkoutOrquestado` | `schema.graphql#Mutation.checkoutOrquestado` | `implemented` | `RF-SAGA-01` |
| `POST`| `/graphql` (`cancelarReservaConSaga`)| `GraphqlBffResolver.cancelarReserva` | `schema.graphql#Mutation.cancelarReservaConSaga` | `implemented` | `RF-SAGA-02` |
| `GET` | `/esb/aggregate/mis-reservas/{cli}`| `EsbController.getMisReservas` | `esb-sagas-openapi-v2.yaml#getMisReservasAgregadas` | `implemented` | `RF-SAGA-03` |
| `GET` | `/esb/sagas/{correlationId}/traza`| `EsbController.getSagaTraza` | `esb-sagas-openapi-v2.yaml#obtenerTrazaGrafoSaga` | `planned` | `RF-SAGA-04` |
| `POST`| `/carritos` | `CarritosController.inicializar` | `carritos-openapi-v2.yaml#inicializarCarrito` | `planned` | `RF-SAGA-05` |
| `POST`| `/carritos/{id}/items` | `CarritosController.agregarItem` | `carritos-openapi-v2.yaml#agregarItemCarrito` | `planned` | `RF-SAGA-05` |
| `POST`| `/carritos/{id}/checkout` | `CarritosController.checkout` | `carritos-openapi-v2.yaml#ejecutarCheckoutCarrito` | `planned` | `RF-SAGA-06` |
| `POST`| `/carritos/abandonados/detectar` | `CarritosController.detectar` | `carritos-openapi-v2.yaml#detectarCarritosAbandonados` | `planned` | `RF-SAGA-07` |
| `POST`| `/pagos/procesar` | `PagosController.procesarPago` | `pagos-openapi-v2.yaml#procesarPago` | `implemented` | `RF-PAG-01` |
| `POST`| `/pagos/reembolsos` | `PagosController.procesarReembolso` | `pagos-openapi-v2.yaml#procesarReembolso` | `implemented` | `RF-PAG-02` |
| `POST`| `/pagos/simulador/config` | `PagosController.updateSimulador` | `pagos-openapi-v2.yaml#updateConfigSimulador` | `implemented` | `RF-PAG-03` |
| `GET` | `/pagos/transacciones` | `PagosController.getTransacciones` | `pagos-openapi-v2.yaml#getTransacciones` | `implemented` | `RF-PAG-04` |
| `GET` | `/pagos/{paymentReference}` | `PagosController.validarPago` | `pagos-openapi-v2.yaml#validarPaymentReference` | `planned` | `RF-PAG-05` |
| `POST`| `/paquetes/dinamico` | `PaquetesController.crearDinamico` | `paquetes-openapi-v2.yaml#crearPaqueteDinamico` | `implemented` | `RF-PKG-01` |
| `GET` | `/paquetes` | `PaquetesController.listar` | `paquetes-openapi-v2.yaml#listarPaquetes` | `implemented` | `RF-PKG-02` |
| `GET` | `/paquetes/contratos` | `PaquetesController.getContratos` | `paquetes-openapi-v2.yaml#getContratosPromociones` | `implemented` | `RF-PKG-03` |
| `PUT` | `/paquetes/contratos/{prov}` | `PaquetesController.actualizar` | `paquetes-openapi-v2.yaml#actualizarContratoPromociones` | `planned` | `RF-PKG-04` |
| `GET` | `/atracciones/promociones/contrato`| `AtraccionesController.getContrato` | `atracciones-openapi-v2.yaml#GET /promociones/contrato` | `implemented` | `RF-PKG-05` |
| `POST`| `/facturas` | `FacturasController.emitir` | `facturacion-openapi-v2.yaml#emitirFactura` | `planned` | `RF-FAC-01` |
| `GET` | `/facturas` | `FacturasController.listar` | `facturacion-openapi-v2.yaml#listarFacturas` | `planned` | `RF-FAC-02` |
| `GET` | `/facturas/{id}/pdf` | `FacturasController.descargarPdf` | `facturacion-openapi-v2.yaml#descargarFacturaPdf` | `planned` | `RF-FAC-03` |
| `PATCH`| `/facturas/{id}/anular` | `FacturasController.anular` | `facturacion-openapi-v2.yaml#anularFactura` | `planned` | `RF-FAC-04` |
| `GET` | `/esb/aggregate/facturas/{id}` | `EsbController.getFacturaCompleta` | `esb-sagas-openapi-v2.yaml#getFacturaCompleta` | `implemented` | `RF-FAC-05` |
| `POST`| `/facturas/enviar` | `FacturasController.enviar` | `facturacion-openapi-v2.yaml#enviarFactura` | `implemented` | `RF-FAC-06` |
| `GET` | `/finanzas/resumen` | `FinanzasController.getResumen` | `finanzas-openapi-v2.yaml#getResumenFinanciero` | `implemented` | `RF-FIN-01` |
| `GET` | `/finanzas/liquidaciones` | `FinanzasController.getLiq` | `finanzas-openapi-v2.yaml#getLiquidaciones` | `implemented` | `RF-FIN-02` |
| `POST`| `/finanzas/liquidaciones/{id}/pagar`| `FinanzasController.pagarLiq` | `finanzas-openapi-v2.yaml#marcarLiquidacionPagada` | `implemented` | `RF-FIN-03` |
| `GET` | `/finanzas/libro-mayor` | `FinanzasController.getLibro` | `finanzas-openapi-v2.yaml#getLibroMayor` | `implemented` | `RF-FIN-04` |
| `GET` | `/admin/stats` | `AdminController.getStats` | `admin-openapi-v2.yaml#getAdminStats` | `implemented` | `RF-ADM-01` |
| `GET` | `/admin/users` | `AdminController.getUsers` | `admin-openapi-v2.yaml#adminGetUsers` | `implemented` | `RF-ADM-02` |
| `GET` | `/admin/reservas` | `AdminController.getReservas` | `admin-openapi-v2.yaml#getReservasGlobales` | `implemented` | `RF-ADM-03` |
| `GET` | `/admin/proveedores/solicitudes` | `AdminController.getSolicitudes` | `admin-openapi-v2.yaml#getSolicitudesProveedor` | `implemented` | `RF-ADM-04` |
| `GET` | `/admin/config` | `AdminController.getConfig` | `admin-openapi-v2.yaml#getAdminConfig` | `implemented` | `RF-ADM-05` |
| `GET` | `/nodes` | `NodesController.listar` | `observabilidad-openapi-v2.yaml#listarNodosPublic` | `implemented` | `RF-OBS-01` |
| `POST`| `/admin/nodes/{id}/toggle-killswitch`| `AdminController.toggleKillSwitch` | `admin-openapi-v2.yaml#toggleNode` | `implemented` | `RF-OBS-02` |
| `GET` | `/observabilidad/trazas/{corrId}`| `ObservabilidadController.traza` | `observabilidad-openapi-v2.yaml#getTrazaGrafo` | `planned` | `RF-OBS-04` |
| `POST`| `/telemetry/events` | `TelemetryController.track` | `observabilidad-openapi-v2.yaml#trackEvent` | `implemented` | `RF-OBS-05` |
| `GET` | `/auditoria/transacciones` | `AuditoriaController.listarTx` | `auditoria-openapi-v2.yaml#listarAuditoriaTransacciones` | `planned` | `RF-OBS-06` |
| `GET` | `/admin/auditoria` | `AdminController.getAuditoria` | `admin-openapi-v2.yaml#getAdminAuditoria` | `implemented` | `RF-OBS-07` |
| `POST`| `/webhooks/{vertical}` | `WebhooksController.recibir` | `webhooks-inbound-openapi-v2.yaml#recibirWebhookVertical` | `planned` | `RF-WH-01` |
| `RPC` | `PushStockUpdate` (:50051) | `InventoryStockService` | `inventory.proto#PushStockUpdate` | `implemented` | `RF-STK-01` |
| `RPC` | `StreamInventoryChanges` (:50051) | `InventoryStockService` | `inventory.proto#StreamInventoryChanges` | `implemented` | `RF-STK-02` |
| `GET` | `/inventory/status` | `InventoryGrpcController.status` | `observabilidad-openapi-v2.yaml#getInventoryStatus` | `implemented` | `RF-STK-04` |
| `GET` | `/clientes/{id}` | `ClientesController.getCanonico` | `clientes-openapi-v2.yaml#getClienteCanonico` | `planned` | `RF-CLI-02` |
| `PATCH`| `/clientes/{id}/rol` | `ClientesController.updateRol` | `clientes-openapi-v2.yaml#updateClienteRol` | `planned` | `RF-CLI-04` |
| `POST`| `q.sagas.compensacion` (AMQP) | `DualEventBusService.publish` | `asyncapi-eventos-v2.yaml#publishSagaCompensate` | `implemented` | `RF-EVT-01` |
| `POST`| `POST /atracciones/reservas/{id}/checkin`| `AtraccionesController.checkin`| `atracciones-openapi-v2.yaml#POST /atracciones/reservas/{id}/checkin`| `implemented` | `RF-ATR-02` |
| `POST`| `POST /autos/orders/{id}/checkin-devolucion`| `AutosController.checkinDev`| `autos-openapi-v2.yaml#POST /autos/orders/{id}/checkin-devolucion`| `implemented` | `RF-AUT-01` |
| `POST`| `POST /vuelos/v2/holds` | `VuelosController.createHold` | `vuelos-openapi-v2.yaml#createHold` | `implemented` | `RF-VUE-01` |

---

## Validación (comando y resultado resumido)

### 1. Validación de Sintaxis Markdown y Estructura
- El documento `docs/RDA2/REQUISITOS_FUNCIONALES.md` fue verificado con formato GitHub Flavored Markdown (GFM), tablas normalizadas, bloques Mermaid, identificadores unívocos `RF-<MÓD>-NN` y criterios Given/When/Then en formato Gherkin.

### 2. Validación de Contratos OpenAPI v2 (Redocly CLI)
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
```
- **Resultado:** **0 errores sintácticos en la totalidad de contratos OpenAPI v2.**

### 3. Validación de Eventos Asíncronos AsyncAPI 3.0
```bash
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores, 0 advertencias.**

### 4. Carga de Protocol Buffers (gRPC) y Schema GraphQL SDL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **Tanto el servicio gRPC (`inventory.proto`) como el esquema GraphQL (`schema.graphql`) compilan exitosamente con código de salida 0.**

---

## Supuestos y decisiones tomadas

1. **Cobertura Total de Contratos v2 (Regla >= 1 RF por contrato):**
   - Se garantizó que cada uno de los 18 contratos v2 (incluyendo `components-v2.yaml`, contratos OpenAPI de módulos internos, tiendas satélites, AsyncAPI, gRPC proto y GraphQL) cuente con al menos un requisito funcional formalmente vinculado en la matriz de trazabilidad.
2. **Tratamiento del Módulo `Chatbot`:**
   - De acuerdo a la directriz del equipo de desarrollo (tarea P10 omitida), el chatbot conversacional con IA no forma parte del alcance evaluativo de RDA2. Sin embargo, para evitar dejar código huérfano en `src/modules/chatbot/`, se documentaron los requisitos `RF-BOT-01` a `RF-BOT-04` con estado `implementado en código / omitido de formalización v2 en RDA2`, sirviendo como especificación técnica para RDA3.
3. **Tratamiento de la Tienda `Alojamientos`:**
   - La vertical de alojamientos cuenta con contrato propio (`alojamientos-openapi.yaml` v1.0.0) y base de datos autónoma administrada por otro equipo de compañeros. Se documentó formalmente en la Sección 4 ("Fronteras del Sistema y Fuera de Alcance"), estableciendo que Booking Prototipo opera como consumidor perimetral sin alterar su especificación original.
4. **Cero Requisitos Huérfanos:**
   - Todos los requisitos funcionales especificados cuentan con su respectivo archivo de procedencia en el repositorio (`src/**`, `Pendientes/**`, `docs Paúl Rosero/**`, `contracts/**`). No se inventaron requisitos especulativos sin respaldo en el código o en la documentación de arquitectura.
5. **Alineación con Endpoints Planificados:**
   - Los requisitos categorizados como `planificado` coinciden exactamente con los 28 endpoints inventariados en `docs/RDA2/PLANNED_ENDPOINTS.md` para la fase de implementación (I01–I12).

---

## Hallazgos registrados (IDs)

No se identificaron nuevos hallazgos bloqueantes durante la redacción de este documento. La especificación consolida y formaliza las observaciones y recomendaciones previamente asentadas en `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
- `H-P01-01` a `H-P01-05`: Seguridad en ESB, idempotencia en Sagas y trazas distribuidas.
- `H-P02-01` a `H-P02-05`: Protección de pasarela de pagos y validación B2B de `paymentReference`.
- `H-P05-01` a `H-P05-04`: Persistencia y descarga fiscal server-side en `MS_FAC`.
- `H-P06-01` a `H-P06-03`: Ficha canónica de cliente y asignación RBAC en base de datos relacional.
- `H-P09-01` y `H-P09-02`: Verificación criptográfica HMAC-SHA256 en webhooks entrantes.
- `H-P16-01` a `H-P16-04`: Dominio y persistencia de carritos en `schema_carritos`.
- `H-P17-01` a `H-P17-04`: Auditoría transaccional de negocio en `schema_auditoria`.

---

## Dudas para el revisor

1. **Transición a Fase de Implementación:** El documento `docs/RDA2/REQUISITOS_FUNCIONALES.md` y `docs/RDA2/PLANNED_ENDPOINTS.md` quedan listos para actuar como la especificación de referencia para las tareas de desarrollo de código (prompts I01 a I12).
