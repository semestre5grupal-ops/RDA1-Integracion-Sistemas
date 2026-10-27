# Reporte D6 — Plan de despliegue y operación

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| [`docs/RDA2/PLAN_DE_DESPLIEGUE.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/PLAN_DE_DESPLIEGUE.md) | Creado | Plan Maestro de Despliegue y Operación de Booking Prototipo (RDA2). Contiene topología cloud desacoplada (Render, Vercel, Supabase, CloudAMQP/Upstash), catálogo de variables de entorno sin secretos, diagnóstico exhaustivo de brokers (RabbitMQ/Kafka) y viabilidad de gRPC en puerto 50051 (con fuentes oficiales citadas al 24/10/2026), estrategia de versionado `/api/v1` y `/api/v2`, plan de rollback instantáneo, observabilidad operativa (Winston JSONL y alimentación de 8 paneles), checklist de puesta en marcha para la demo y matriz de costos/límites de planes gratuitos con citas verificadas. |
| [`docs/RDA2/entregas/D6-reporte.md`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/docs/RDA2/entregas/D6-reporte.md) | Creado | Reporte formal de entrega de la tarea D6 en estricto cumplimiento de la sección 10 de `00-REGLAS-COMUNES.md`. |

---

## Cobertura de rutas (controlador vs contrato)

La siguiente tabla resume las rutas operativas, de salud perimetral, administración y versionado que gobiernan la plataforma desplegada en Render y Vercel:

| Método | Ruta / Interfaz Operativa | Controlador / Handler | En el contrato | x-status |
|:---:|---|---|---|:---:|
| `GET`  | `/api/admin/nodes/health` | `ConnectorHealthService.getHealthSummary` | [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/admin/nodes/:id/toggle` | `AdminController.toggleNode` | [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/admin/audit` | `AdminAuditService.listar` | [`contracts/observabilidad-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/observabilidad-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/admin/stats` | `AdminController.getStats` | [`contracts/admin-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/admin-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/docs` | `SwaggerModule` (OpenAPI UI) | `api/docs-json` | `implemented` |
| `GET`  | `/api/redoc` | `ReDoc standalone HTML` | `api/docs-json` | `implemented` |
| `GET`  | `/graphql` | `GraphqlBffResolver` | [`contracts/graphql/schema.graphql`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/graphql/schema.graphql) | `implemented` |
| `RPC`  | `PushStockUpdate` (:50051) | `InventoryStockService.pushStockUpdate` | [`src/proto/inventory.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/proto/inventory.proto) | `implemented` |
| `POST` | `/api/v2/esb/checkout-saga` | `EsbController.checkoutSaga` | [`contracts/esb-sagas-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/esb-sagas-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v2/pagos/reembolsos` | `PagosController.procesarReembolso` | [`contracts/pagos-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/pagos-openapi-v2.yaml) | `implemented` |
| `POST` | `/api/v1/facturas/enviar` | `FacturasController.enviarFactura` | [`contracts/facturacion-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi-v2.yaml) | `implemented` |
| `GET`  | `/api/v1/chatbot/estado` | `ChatbotController.obtenerEstado` | [`contracts/chatbot-openapi-v2.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/chatbot-openapi-v2.yaml) | `implemented` |

---

## Validación (comando y resultado resumido)

### 1. Validación de Fuentes Oficiales de Hosting (Citas con Fecha de Consulta: 24/10/2026)
* **Render (Puerto Único y Límite de Horas):** Documentación oficial consultada confirma que Render Web Services solo enruta a **un único puerto** por servicio (`PORT`, por defecto `10000`). No permite exponer dos puertos públicos simultáneos (como 3000 para REST y 50051 para gRPC). Dispone de 750 horas gratuitas al mes y apaga el contenedor tras 15 minutos de inactividad con cold start de 30-60s.
* **Supabase (Pausa por Inactividad):** Documentación oficial consultada confirma 500 MB de base de datos PostgreSQL en el Free Plan y **pausa automática a los 7 días** consecutivos sin actividad de consultas SQL.
* **Vercel (Límites Hobby):** Documentación oficial consultada confirma 100 GB de ancho de banda mensual, 1M de invocaciones serverless, 4 CPU-hours y 300s de duración máxima.
* **CloudAMQP (Little Lemur):** Documentación oficial consultada confirma plan gratuito con 1M mensajes/mes, 20 conexiones concurrentes y 100 colas.
* **Upstash Kafka:** Documentación oficial consultada confirma cuota gratuita de 10,000 mensajes diarios con arquitectura scale-to-zero y soporte REST/TLS.

### 2. Validación de Diagramas Mermaid
- **Total de diagramas incluidos en el plan:** 3 diagramas Mermaid (`graph TD` de topología global, `graph LR` de opciones de operación gRPC/Brokers y `sequenceDiagram` de alimentación forense de auditoría).
- **Sintaxis:** Verificada manualmente cumpliendo con estándares GFM sin caracteres ilegales.

### 3. Validación de Contratos OpenAPI v2 y Event Bus
```bash
npx --yes @redocly/cli@1 lint contracts/*-openapi-v2.yaml
npx --yes @asyncapi/cli validate contracts/asyncapi-eventos-v2.yaml
```
- **Resultado:** **0 errores en los 11 contratos OpenAPI v2; 0 errores en AsyncAPI 3.0.**

### 4. Compilación de Protocol Buffers y Esquema GraphQL
```bash
node -e "require('@grpc/proto-loader').loadSync('src/proto/inventory.proto',{keepCase:true});console.log('gRPC OK')"
node -e "require('graphql').buildSchema(require('fs').readFileSync('contracts/graphql/schema.graphql','utf8'));console.log('GraphQL OK')"
```
- **Resultado:** **gRPC OK, GraphQL OK (código de salida 0).**

---

## Supuestos y decisiones tomadas

1. **Viabilidad de gRPC (50051) en Render:**
   - Dado que Render Free Web Service restringe el enrutamiento público a un único puerto (`PORT`), se determinó que la solución óptima para la evaluación académica es la **Opción A (Híbrida / Túnel ngrok TCP 50051)**, o la conmutación al **Modo Fallback In-Memory** que ya está implementado en el backend y permite continuar las operaciones sin caídas ni bloqueos si el socket remoto no se conecta.
2. **Aislamiento Total de Secretos:**
   - En cumplimiento estricto de las reglas comunes, no se incluyó ninguna clave real, contraseña ni cadena de conexión en el documento de despliegue ni en los reportes. Todas las variables se describen por su nombre y propósito funcional.
3. **Persistencia Física de Auditoría (ADR-003):**
   - Se ratificó la política de cero tablas de logs técnicos en PostgreSQL: todos los registros se escriben en disco local en formato JSON Lines (`logs/audit-YYYY-MM-DD.log` y `logs/integration-YYYY-MM-DD.log`) con rotación diaria.
4. **Resiliencia ante Caídas de Brokers:**
   - Tanto `RabbitMqEventBusService` como `KafkaEventBusService` cuentan con un timeout perimetral de 1000 ms; si el broker externo no está encendido o sufre interrupciones, el Gateway registra la traza en disco bajo `RABBITMQ_EVENTO_EMITIDO_IN_MEMORY` y no aborta el flujo transaccional.

---

## Hallazgos registrados (IDs)

El plan de despliegue y operación formaliza soluciones para los siguientes hallazgos de `docs/RDA2/HALLAZGOS_CONTRATOS.md`:
* `H-P01-04`: Falta de conexión con RabbitMQ mitigada con el plan de brokers gestionados CloudAMQP o modo fallback.
* `H-P06-03`: Bypass de rol administrativo en frontend mitigado mediante el checklist de RBAC con Supabase Auth.
* `H-P09-01`: Validación de secretos HMAC en webhooks documentada en el catálogo de variables de entorno de producción.

---

## Dudas para el revisor

1. **Modalidad de Prueba de gRPC para la Evaluación:** ¿El jurado evaluará la conexión gRPC ejecutando un cliente externo desde otra máquina en vivo (para lo cual se habilitará el túnel `ngrok tcp 50051`) o se utilizará la suite de pruebas automatizadas `test-grpc-inventory.js` y el Panel 7 de monitoreo en la consola?
