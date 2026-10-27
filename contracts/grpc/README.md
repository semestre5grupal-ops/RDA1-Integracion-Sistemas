# Contrato gRPC Inbound de Inventario y Stock — Booking Prototipo (RDA2)

Este documento describe la especificación formal del canal gRPC expuesto por el Gateway Central de Booking Prototipo (`MS_STK` / `InventoryStockService`), diseñado para que los sistemas de las tiendas satélites (Vuelos, Autos, Atracciones, Alojamientos) sincronicen en tiempo real sus variaciones de inventario y disponibilidad sobre HTTP/2.

---

## 1. Topología del Servicio y RPCs en Producción (v1)

El backend de Booking (`src/main.ts`) inicializa un microservicio gRPC con la siguiente configuración:
* **Protocolo de Transporte:** gRPC sobre HTTP/2 multiplexado.
* **Socket de Escucha:** `0.0.0.0:50051` (Local: `localhost:50051`; Remoto objetivo: `grpc://booking.epn.edu.ec:50051`).
* **Paquete Protobuf:** `inventory`
* **Definición de Archivo:** `src/proto/inventory.proto` (cargado en arranque mediante `@grpc/proto-loader` con `keepCase: true`).
* **Servicio:** `InventoryStockService`

### RPCs Reales Implementadas en `src/modules/inventory/inventory-grpc.controller.ts`

```protobuf
service InventoryStockService {
  rpc PushStockUpdate (StockUpdateMessage) returns (StockUpdateAck);
  rpc StreamInventoryChanges (stream StockChangeEvent) returns (StreamSummary);
}
```

#### 1.1. RPC Unaria: `PushStockUpdate`
* **Tipo:** Unario (petición única y respuesta inmediata).
* **Propósito:** Notificación puntual de stock remanente para un recurso específico en una fecha/franja horaria.
* **Mensaje de Petición (`StockUpdateMessage`):**
  * `service_id` (string, tag 1): Código identificador de la tienda o proveedor emisor (ej. `"atracciones-dilan"`, `"vuelos-aerogal"`, `"NODE_AUT_LOCAL"`).
  * `item_id` (string, tag 2): Identificador de negocio del recurso en su vertical (ej. `"auto-suv-4x4-01"`, `"AV1632-ECONOMY"`, `"PRhu4UBTWPBC"`).
  * `date` (string, tag 3): Fecha de vigencia o turno en formato ISO `YYYY-MM-DD`.
  * `time_slot` (string, tag 4): Franja horaria o turno específico (ej. `"10:30"`, `"DEFAULT"`).
  * `available_units` (int32, tag 5): Cantidad absoluta de cupos o asientos disponibles.
  * `timestamp` (int64, tag 6): Epoch Unix en milisegundos de la emisión.
* **Mensaje de Respuesta (`StockUpdateAck`):**
  * `success` (bool, tag 1): Indicador booleano de éxito de ingesta.
  * `message` (string, tag 2): Mensaje explicativo del procesamiento (`"Stock sincronizado exitosamente en Booking Prototipo para..."`).
  * `processed_at` (int64, tag 3): Timestamp Epoch Unix del servidor al completar el registro.

#### 1.2. RPC Client-Streaming: `StreamInventoryChanges`
* **Tipo:** Client Streaming (el cliente emite un flujo continuo de deltas a través del socket HTTP/2 y recibe un único acuse consolidado al cerrar el stream).
* **Propósito:** Sincronización masiva o en ráfaga de variaciones de cupos (+N liberaciones, -N reservas).
* **Mensaje de Flujo (`StockChangeEvent`):**
  * `event_id` (string, tag 1): Identificador único e idempotente del evento (UUID v4).
  * `service_id` (string, tag 2): Identificador del socio / nodo.
  * `item_id` (string, tag 3): Identificador del ítem.
  * `date` (string, tag 4): Fecha de aplicación `YYYY-MM-DD`.
  * `time_slot` (string, tag 5): Franja horaria.
  * `delta` (int32, tag 6): Variación neta sobre el inventario (+1 al cancelar o liberar un hold, -1 al confirmar o retener).
  * `timestamp` (int64, tag 7): Epoch Unix milisegundos.
* **Mensaje de Resumen (`StreamSummary`):**
  * `total_events_processed` (int32, tag 1): Conteo total de eventos procesados durante la sesión de stream.
  * `is_synchronized` (bool, tag 2): Estado de coherencia del registro tras la ráfaga.
  * `last_sync_hash` (string, tag 3): Hash criptográfico generado de la transacción (ej. `"hash-sync-M4Z3A9"`).

---

## 2. Flujo de Comunicación y Frecuencia

```
┌──────────────────────────────────────────────────┐
│  Tiendas Satélites (Compañeros RDA2)             │
│  - MS Vuelos (asientos libres / cabinas)         │
│  - MS Autos (flota disponible por modelo)        │
│  - MS Atracciones (turnos y aforo)               │
│  - MS Alojamientos (habitaciones remanentes)     │
└─────────────────────────┬────────────────────────┘
                          │ 
                          │ gRPC sobre HTTP/2 (Puerto 50051)
                          │ [PushStockUpdate / StreamInventoryChanges]
                          ▼
┌──────────────────────────────────────────────────┐
│  Booking Prototipo (MS_STK / InventoryService)   │
│  1. Ingesta ultrarrápida en memoria RAM          │
│  2. Sincronización en BD (turnos_aforo / catalogo)│
│  3. Auditoría en log físico rotativo             │
│  4. Bifurcación a Bus Dual (RabbitMQ + Kafka)    │
└──────────────────────────────────────────────────┘
```

* **Sentido:** **Tienda Socia → Booking Prototipo** (Inbound hacia Booking).
* **Frecuencia Esperada:**
  * **Event-driven inmediata:** Ante cada bloqueo (`hold`), liberación de cupo por expiración de TTL, confirmación de compra o cancelación en las tiendas individuales.
  * **En ráfagas (Batch/Stream):** Al inicio de jornada o reapertura de inventarios mediante `StreamInventoryChanges` con tasas estimadas de 10 a 100 eventos/segundo por vertical.
  * **Eventual / Polling reactivo:** Cada 5 a 15 minutos en sincronizaciones periódicas de consistencia.

---

## 3. Metadatos gRPC Obligatorios Propuestos (Cabeceras HTTP/2)

Para cumplir con la gobernanza de trazabilidad distribuida y seguridad (Consideraciones RDA2 §1 y §2), toda llamada gRPC enviada por los clientes debe incluir las siguientes cabeceras en los metadatos gRPC (`metadata`):

| Cabecera Metadata | Obligatoria | Formato / Tipo | Descripción |
|---|:---:|---|---|
| `x-correlation-id` | **Sí** | UUID v4 (ej. `a9f3b8e7-6d2c-4c81-9a42-2e7f61a08d53`) | Identificador de correlación que enlaza el flujo de la tienda con la auditoría en Booking. |
| `traceparent` | **Sí** | W3C Trace Context (`00-<trace_id>-<span_id>-<trace_flags>`) | Permite reconstruir el grafo distribuido en OpenTelemetry / APM. |
| `tracestate` | No | Clave-valor W3C opcional | Información adicional del proveedor de telemetría. |
| `x-api-key` | **Sí** (en v2) | String alfanumérico seguro | Clave de API registrada para el socio en `schema_proveedores.config_proveedor`. |
| `x-node-id` | Recomendada | String (ej. `NODE_AUT_LOCAL`, `NODE_VUE_ECOAIRLINES`) | Identificador unívoco del nodo según el registro de topología. |

---

## 4. Códigos de Estado gRPC Utilizados

El servicio gRPC mapea sus respuestas a los códigos de error canónicos de gRPC:

| Código gRPC | Valor | Condición de Disparo |
|---|:---:|---|
| `OK` | 0 | Actualización de stock o ráfaga de stream procesada y consolidada con éxito. |
| `INVALID_ARGUMENT` | 3 | Fecha no cumple con el formato `YYYY-MM-DD`, delta inconsistente, o `available_units` negativo no permitido. |
| `UNAUTHENTICATED` | 16 | Falta la cabecera `x-api-key` en la metadata o el token proporcionado no es válido. |
| `PERMISSION_DENIED` | 7 | El `service_id` indicado no coincide con las credenciales del nodo autenticado. |
| `NOT_FOUND` | 5 | El ítem indicado no existe en el catálogo homologado de Booking. |
| `ALREADY_EXISTS` | 6 | Detección de duplicado exacto en un `event_id` dentro de la ventana de idempotencia. |
| `UNAVAILABLE` | 14 | El servidor gRPC se encuentra temporalmente en drenado, reinicio o su base de datos no responde. |

---

## 5. Ejemplos de Invocación con `grpcurl`

### 5.1. Llamada Unaria: `PushStockUpdate`
```bash
grpcurl -plaintext \
  -H "x-correlation-id: 7f3b8e7a-9a42-4c81-6d2c-2e7f61a08d53" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  -H "x-api-key: bk_live_prov_983742918374" \
  -d '{
    "service_id": "atracciones-dilan",
    "item_id": "PRhu4UBTWPBC",
    "date": "2026-10-25",
    "time_slot": "10:30",
    "available_units": 15,
    "timestamp": 1792972800000
  }' \
  localhost:50051 inventory.InventoryStockService/PushStockUpdate
```

**Respuesta JSON esperada:**
```json
{
  "success": true,
  "message": "Stock sincronizado exitosamente en Booking Prototipo para PRhu4UBTWPBC: 15 unidades disponibles.",
  "processed_at": "1792972801452"
}
```

### 5.2. Llamada Streaming: `StreamInventoryChanges`
```bash
cat << 'EOF' | grpcurl -plaintext \
  -H "x-correlation-id: 11223344-5566-7788-9900-aabbccddeeff" \
  -H "traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" \
  -H "x-api-key: bk_live_prov_983742918374" \
  -d @ localhost:50051 inventory.InventoryStockService/StreamInventoryChanges
{
  "event_id": "e001-f47a-4372",
  "service_id": "atracciones-dilan",
  "item_id": "PRhu4UBTWPBC",
  "date": "2026-10-25",
  "time_slot": "10:30",
  "delta": -2,
  "timestamp": 1792972810000
}
{
  "event_id": "e002-f47a-4372",
  "service_id": "atracciones-dilan",
  "item_id": "PRhu4UBTWPBC",
  "date": "2026-10-25",
  "time_slot": "10:30",
  "delta": 1,
  "timestamp": 1792972815000
}
EOF
```

**Respuesta consolidada:**
```json
{
  "total_events_processed": 2,
  "is_synchronized": true,
  "last_sync_hash": "hash-sync-M4Z3A9"
}
```

---

## 6. Comparativa de Especificaciones Protobuf en el Repositorio

| Característica / Criterio | Implementación Actual (`src/proto/inventory.proto`) | Alternativo (`Faltantes RDA2/src/proto/v1/inventory.proto`) | Versión Objetivo Propuesta (`contracts/grpc/inventory-v2.proposed.proto`) |
|---|---|---|---|
| **Paquete** | `inventory` | `booking.inventory.v1` | `booking.inventory.v2` |
| **Servicio** | `InventoryStockService` | `InventoryService` | `InventoryStockService` |
| **RPCs Unarias** | `PushStockUpdate` | `SyncStock` (por lote de ítems), `Heartbeat`, `ValidateAvailability` | `PushStockUpdate`, `BatchStockUpdate`, `CheckAvailability` |
| **Streaming** | Client-streaming (`StreamInventoryChanges`) | Bidireccional (`SyncStockStream`) | Dual: Client-streaming (`StreamInventoryChanges`) + Bidireccional (`BiDirectionalStockStream`) |
| **Trazabilidad** | Solo en cabeceras gRPC metadata externas | Mensajes anidados (`CorrelationContext`, `NodeRef`) vía `v1/common.proto` | Contexto híbrido: soporte nativo en metadata HTTP/2 y campo `TraceContext` opcional en mensajes |
| **Clasificación de Recursos** | Implícita (prefijo de texto en `service_id` o `item_id`) | Enum / string `tipo_recurso` | Enum fuertemente tipado `ResourceType` (`VUELO`, `AUTO`, `ATRACCION`, `ALOJAMIENTO`) |
| **Manejo de Errores** | Booleano `success` + string `message` | `ErrorDetail` importado de `common.proto` | Enum estructurado `ErrorDomainCode` + `error_detail` sin dependencias externas rotas |
| **Estado Sintáctico** | Carga limpia y sin advertencias | Roto sintácticamente (artefacto de copiado `EOF\necho "ok"` en l. 112-113) | Carga limpia verificada al 100% con `@grpc/proto-loader` |

**Recomendación Arquitectónica:**  
Adoptar para la evolución de la plataforma el archivo `contracts/grpc/inventory-v2.proposed.proto`. Este diseño mantiene compatibilidad semántica con los controladores existentes de NestJS, elimina la dependencia de archivos externos no resueltos (`v1/common.proto`), incorpora trazabilidad W3C y permite tanto el client-streaming histórico como el streaming bidireccional moderno.

---

## 7. Despliegue en Producción: gRPC sobre HTTP/2 y Consideraciones de Hosting

### 7.1. Reto Técnico en Plataformas de Hosting (Render / Cloud PaaS)
* **Multiplexación de Puertos:** En servicios web gestionados estándar de Render (plan Free/Starter), la plataforma expone al exterior un único puerto público (443 HTTPS / 80 HTTP) que redirige el tráfico hacia el puerto asignado dinámicamente en `process.env.PORT` (3000). El puerto secundario `50051` abierto por NestJS para gRPC **no queda automáticamente expuesto al tráfico público de Internet** a través del dominio `*.onrender.com`.
* **Terminación TLS y HTTP/2:** Los balanceadores de carga de nivel de entrada pueden terminar la conexión TLS y degradar la petición hacia el backend a HTTP/1.1 (o no habilitar el soporte para trailers gRPC / multiplexación de streams HTTP/2 pura).
* **Premisa fundamental:** **Se debe verificar empíricamente en el entorno de despliegue de Render** si las reglas de red permiten exponer el socket TCP 50051 como *Private Service* o mediante mapeo de puertos antes de exigir gRPC a los socios remotos.

### 7.2. Alternativas de Integración Propuestas

Si el entorno de producción en Render presenta limitaciones para exponer gRPC directamente en el puerto 50051:

1. **Endpoint REST Equivalente (Solución Inmediata de Alta Compatibilidad):**
   * Exponer la ruta REST `POST /api/v2/inventory/stock` (y `POST /api/v2/inventory/stream`) a través del servidor HTTP principal (puerto 3000 / 443 HTTPS).
   * Mantiene idénticos esquemas DTO y lógica de negocio en `InventoryService` sin fricción de infraestructura.
2. **gRPC-Web con Proxy Reverso:**
   * Utilizar un contenedor Envoy o middleware de gRPC-Web en NestJS para canalizar llamadas gRPC codificadas sobre peticiones HTTP/1.1 y HTTP/2 estándar en el puerto principal.
3. **Red Privada / Túnel Seguro (Tailscale / Cloudflare Tunnel / Private Networking):**
   * Interconectar los microservicios de las tiendas y el Gateway a través de un túnel seguro punto a punto, permitiendo acceso directo al socket `50051` sin depender del balanceador público de Render.
