# Gestión de Contratos y Versionamiento Semántico — Reto 2 (RDA2)

**Asignatura:** Integración de Sistemas  
**Proyecto:** Booking Prototipo (Marketplace Agregador Central)  
**Documento:** `contracts/CAMBIOS_CONTRATOS_RDA2.md`  
**Fecha:** Octubre 2026  
**Estándar de Versionamiento:** Semantic Versioning (SemVer 2.0.0)  

---

## 1. Resumen Ejecutivo del Salto de Versión (v1.2.0 → v2.0.0)

La evolución de la versión 1 a la versión 2 de los contratos OpenAPI responde a la transición formal desde el prototipo monolítico API-First hacia un **ecosistema distribuido basado en microservicios, resiliencia y agregación multimodal**.

Se formalizan dos contratos enriquecidos para ser entregados a los equipos de desarrollo externos:
1. `contracts/atracciones-openapi-v2.yaml` (Vertical de Atracciones Turísticas).
2. `contracts/autos-openapi-v2.yaml` (Vertical de Renta de Autos).

---

## 2. Vertical de Atracciones Turísticas: Matriz Comparativa v1 vs v2

| Característica / Dominio | Contrato v1 (`contracts/atracciones-openapi.yaml`) | Contrato v2 (`contracts/atracciones-openapi-v2.yaml`) | Justificación Técnica & Normativa |
|---|---|---|---|
| **Ruta Base Gateway** | `/api/v1/atracciones` | `/api/v2/atracciones` | Versionamiento por URI para desacoplar evoluciones sin romper clientes legacy. |
| **Taxonomía de Categorías** | Arreglo plano de cadenas (`["food_drinks"]`) | **Árbol Jerárquico Recursivo** (`/categorias/arbol`) con inclusiones booleanas (`incluye_comida`, `incluye_guia`, `incluye_transporte`) | Cumple Consideraciones RDA2 §6. Permite filtros multinivel y badges Booking.com. |
| **Ficha Técnica Detallada** | Datos planos parciales | **Endpoint `GET /atracciones/{id}`** con desglose de opiniones por pilares (Limpieza, Servicio, Calidad-Precio), itinerario y políticas de cancelación | Fidelidad absoluta con el diseño original de Booking.com. |
| **Disponibilidad y Aforo** | Horarios estáticos simulados | **Franjas Horarias Dinámicas (Time Slots)** con aforo remanente y estados (`DISPONIBLE`, `ULTIMOS_CUPOS`, `AGOTADO`) | Evita sobreventa y alimenta el selector horario interactivo con feedback en vivo. |
| **Desglose de Boletos** | Contador único genérico (`ticket_count`) | **Desglose por Grupo de Edad** (`adult_count`, `child_count`, `infant_count`) con tarifas dinámicas | Cumple modelo transaccional y cálculo transparente de subtotales. |
| **Validación Presencial** | No contemplada | **Check-in Presencial Digital** (`POST /reservas/:id/checkin`) | Cumple Consideraciones RDA2 §4. Emite voucher QR con guía asignado y punto de encuentro. |
| **Resiliencia & ACL** | Llamadas directas sin timeout estricto | Timeout de **5000 ms**, Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`), `Idempotency-Key` y `X-Correlation-Id` | Protege el Gateway ante caídas de proveedores (ej. SistemaAtracciones de Dilan). |
| **Sincronización de Stock** | Síncrona únicamente por REST | **Híbrida:** REST Outbound para compras + **gRPC Inbound HTTP/2** (`src/proto/inventory.proto`) para stock | Cumple Consideraciones RDA2 §1 y §3 (multiplexación de streams HTTP/2). |

---

## 3. Vertical de Renta de Autos: Matriz Comparativa v1 vs v2

| Característica / Dominio | Contrato v1 (`contracts/autos-openapi.yaml`) | Contrato v2 (`contracts/autos-openapi-v2.yaml`) | Justificación Técnica & Normativa |
|---|---|---|---|
| **Ruta Base Gateway** | `/api/v1/autos` | `/api/v2/autos` | Aislamiento de versión bajo `/api/v2/autos`. |
| **Búsqueda Avanzada** | Localidad genérica y fechas planas | **Búsqueda con tramos de 30 minutos**, validación de conductor (<25 años), categoría y transmisión | Alineado a la UX y lógica de Booking.com Cars. |
| **Catálogo General y Ficha** | Arreglo mock estático | **`GET /autos`** (catálogo filtrable) y **`GET /autos/{id}`** con especificaciones técnicas, política de combustible ("Lleno a lleno"), kilometraje y fotos | Detalle técnico completo para exploración y pantalla de reserva. |
| **Panel de Flota en Vivo** | Inexistente | **`GET /autos/flota`**: telemetría en tiempo real de vehículos, cronómetro regresivo de cooldown de 2 horas (`segundos_restantes_cooldown`), fin estimado de limpieza y alertas de kilometraje | Alimenta el Panel 2 de Gestión de Flota (Cátedra RDA2 §5). |
| **Coberturas Diferenciadas** | Tarifa plana sin opciones | **`GET /autos/{id}/coberturas`**: Protección Básica (con franquicia) vs Cobertura Total (sin franquicia) | Transparencia financiera de depósitos y franquicias al estilo Booking. |
| **Máquina de Estados de 6 Fases** | Estados no controlados | **Máquina formal**: `DISPONIBLE` ➔ `RESERVADO` ➔ `LISTO_PARA_ENTREGAR` ➔ `ENTREGADO` ➔ `EN_LIMPIEZA` (cooldown obligatorio de 2 horas) ➔ `DISPONIBLE` / `EN_MANTENIMIENTO` | Cumple estrictamente Consideraciones RDA2 §5. Auto devuelto es invisible en búsqueda por 2h. |
| **Doble Check-in Operativo** | No contemplado | **1. Anticipado Digital:** `POST /autos/reservas/:id/checkin` (Voucher QR Fast-Track).<br>**2. Entrega en Mostrador:** `POST /autos/orders/:id/checkin-entrega` (licencia, `km_salida`).<br>**3. Devolución en Patio:** `POST /autos/orders/:id/checkin-devolucion` (`km_retorno`, combustible, inicio de cooldown 2h) | Cumple Consideraciones RDA2 §4 y §5 para operaciones presenciales seguras. |
| **Mantenimiento Preventivo** | Inexistente | **`POST /autos/:id/mantenimiento/registro`** con rol técnico `MANTENIMIENTO` o `ADMIN` | Cumple Consideraciones RDA2 §5. Alerta preventiva cuando `kilometraje_actual >= proximo_mantenimiento_km`. |
| **Ciclo de Ordenes & PNR** | No documentado | **`POST /autos/orders/create`**, **`GET /autos/orders/{orderId}`** y **`POST /autos/orders/{orderId}/cancel`** | Gestión completa del ciclo de vida de la reserva con `Idempotency-Key` y compensación Saga. |
| **Promociones B2B Mandato §9** | Inexistente | **`GET /autos/promociones/contrato`** y **`PUT /autos/promociones/contrato`** | Cumple Cátedra RDA2 §9: define si acepta combos y porcentaje máximo de descuento. |
| **Salud de Nodo (Semáforo 🟢/🔴)** | Inexistente | **`GET /autos/health`**: latencia, uptime y telemetría de cooldown de flota | Cumple Criterio CE01 y Cátedra RDA2 §2 para monitoreo con focos verde/rojo. |
| **Eventos Asíncronos (EDA)** | Inexistente | **CloudEvents v1.0**: `auto.order.confirmed`, `auto.cleaning.cooldown.started`, `auto.mantenimiento.alerta`, `auto.order.cancelled` y Outbox **`GET /autos/eventos`** | Cumple Criterio CE03 y Semana 8 de Consideraciones (Arquitectura Híbrida RabbitMQ + Kafka). |

---

## 4. Política de Compatibilidad hacia Atrás (Backward Compatibility)

Para asegurar que clientes existentes y evaluaciones previas del Reto 1 continúen funcionando sin disrupciones:

1. **Persistencia de Rutas Legacy v1:**
   - Las rutas `/api/v1/atracciones/*` y `/api/v1/autos/*` se mantienen operativas en el backend NestJS.
   - Las respuestas v1 incluyen cabeceras HTTP estándar de deprecación:
     ```http
     HTTP/1.1 200 OK
     X-API-Deprecation-Date: 2027-12-31
     Sunset: Fri, 31 Dec 2027 23:59:59 GMT
     Link: </api/v2/atracciones>; rel="successor-version"
     ```

2. **Tolerancia a Parámetros Opcionales (Non-Breaking Changes):**
   - Todos los nuevos campos de entrada (`adult_count`, `child_count`, `tipo_cobertura`, `special_requirements`) poseen valores por defecto transparentes.
   - Si un cliente v1 envía `ticket_count: 2`, el BFF asume automáticamente `adult_count: 2`.
   - Si un cliente v1 no especifica cobertura en autos, se asigna por defecto `BASICA`.

---

## 5. Protocolo de Errores Estandarizados (RFC 7807 Problem Details)

Todos los microservicios y respuestas del API Gateway en la especificación v2 implementan el estándar RFC 7807 con cabecera `Content-Type: application/problem+json`:

```json
{
  "type": "https://api.booking.local/errors/vehicle-in-cleaning",
  "title": "Vehículo en Cooldown de Limpieza",
  "status": 409,
  "detail": "El vehículo se encuentra en ciclo de limpieza y desinfección obligatoria (2 horas). Estará disponible a las 14:30 UTC.",
  "instance": "/api/v2/autos/auto-spark-01/orders/create",
  "code": "VEHICLE_IN_CLEANING_COOLDOWN",
  "timestamp": "2026-10-15T08:00:00Z"
}
```

---

## 6. Guía de Entrega para Equipos Externos (Atracciones y Autos)

Los archivos de especificación OpenAPI listos para ser consumidos e implementados por los equipos externos son:
- **Atracciones:** `contracts/atracciones-openapi-v2.yaml`
- **Renta de Autos:** `contracts/autos-openapi-v2.yaml`
- **Protocol Buffers para Stock Inbound:** `src/proto/inventory.proto`

**Requisitos no negociables para las tiendas externas:**
1. Respetar los nombres exactos de campos en DTOs JSON.
2. Soportar la cabecera `Idempotency-Key` en operaciones de creación de reservas.
3. Propagar la cabecera `X-Correlation-Id` recibida en cada llamada.
4. Enviar actualizaciones de stock e inventario a través del servidor gRPC de Booking (`inventory.proto`) sobre el puerto `50051`.
5. Retornar códigos de estado HTTP semánticos y esquemas RFC 7807 en casos de error.

---

## 7. Contratos internos de Booking v2

Durante la fase de contratos de RDA2 (P00–P17), se diseñó y formalizó la suite completa de especificaciones distribuidas que gobiernan el núcleo integrador de Booking (Gateway, BFF, ESB y microservicios internos). Todos los contratos implementan OpenAPI 3.0.3, AsyncAPI 3.0.0, Protocol Buffers v3 o GraphQL SDL, respetando estrictamente el principio rector de **documentar lo implementado como `implemented`, lo delegado como `delegated` y las brechas arquitectónicas como `planned`**:

| Tarea | Contrato Creado / Actualizado | Protocolo | Dominio Funcional & Microservicio | Hito Clave de Integración |
|:---:|---|:---:|---|---|
| **P00** | `contracts/common/components-v2.yaml` | OpenAPI 3.0.3 | **Componentes Comunes Reutilizables** | Estandarización de RFC 7807 (`ProblemDetails`), cabeceras W3C (`traceparent`), correlación (`X-Correlation-Id`), idempotencia (`Idempotency-Key`) y respuestas HTTP universales (400, 401, 403, 404, 409, 422, 429, 500, 503, 504). |
| **P01** | `contracts/esb-sagas-openapi-v2.yaml` | OpenAPI 3.0.3 | **ESB & Orquestación Saga LIFO** (`MS_ESB`, `ORQ_FAC`) | Formalización del checkout multivertical distribuido, rollback compensatorio LIFO, orquestador de reservas y agregación de facturas sin cross-schema SQL JOINs (`ORQ_FAC`). |
| **P02** | `contracts/pagos-openapi-v2.yaml` | OpenAPI 3.0.3 | **Simulador de Pagos SOA** (`MS_PAG`) | Procesamiento de cargos, reembolsos transaccionales, inyección en caliente de fallos (`TIMEOUT_RED`, `RECHAZO_FONDOS`) para testing de resiliencia y verificación síncrona planificada por `paymentReference`. |
| **P03** | `contracts/paquetes-openapi-v2.yaml` | OpenAPI 3.0.3 | **Paquetes y Promociones B2B** (`MS_PKG`, `ORQ_PKG`) | Motor de reglas de negocio para combos dinámicos, cálculo del ahorro porcentual respecto a la compra individual, consulta de acuerdos de socios y sincronización B2B planificada. |
| **P04** | `contracts/finanzas-openapi-v2.yaml` | OpenAPI 3.0.3 | **Finanzas & Liquidaciones** (`MS_FIN`) | Cómputo de comisiones de plataforma por vertical, cortes quincenales (`Q1`/`Q2`) sobre `schema_finanzas`, liquidación formal a proveedores y registro de comprobantes bancarios. |
| **P05** | `contracts/facturacion-openapi-v2.yaml` | OpenAPI 3.0.3 | **Facturación Fiscal** (`MS_FAC`, `ORQ_FAC`) | Brecha formal entre v1 (ficticio) y v2: ruta real de relay SMTP (`POST /facturas/enviar`) documentada como `implemented`; emisión fiscal con desglose de IVA y PDF server-side clasificadas como `planned`. |
| **P06** | `contracts/clientes-openapi-v2.yaml` | OpenAPI 3.0.3 | **Clientes, Identidad & Sesión** (`MS_CLI`) | Formalización de la autenticación delegada en Supabase Auth SDK (`delegated`), gestión administrativa de usuarios en `AdminController` (`implemented`) y ficha canónica en `schema_clientes` (`planned`). |
| **P07** | `contracts/admin-openapi-v2.yaml` | OpenAPI 3.0.3 | **Administración Central & Backoffice** (`MS_PROV`, `MS_CLI`, `MS_AUD`) | Panel unificado de control: directorio de usuarios, historial multivertical, log streaming desde disco (`logs/audit-*.log`, ADR-003), kill-switches de nodos y liquidaciones rápidas. |
| **P08** | `contracts/observabilidad-openapi-v2.yaml` | OpenAPI 3.0.3 | **Observabilidad, Nodos & Telemetría** (`MS_PROV`, `MS_STK`, `MS_AUD`) | Monitor de semáforo LED de latencia (Panel 1), telemetría de navegación de frontend, configuración dinámica de conectores y exposición REST del socket de inventario. |
| **P09** | `contracts/webhooks-inbound-openapi-v2.yaml` | OpenAPI 3.0.3 | **Receptor de Webhooks Inbound** (`MS_AUD`) | Especificación del receptor canónico `POST /webhooks/{vertical}` con validación criptográfica obligatoria HMAC-SHA256 (`X-Webhook-Signature`) y retransmisión asíncrona hacia RabbitMQ. |
| **P11** | `contracts/asyncapi-eventos-v2.yaml` | AsyncAPI 3.0.0 | **Event Bus Dual (RabbitMQ + Kafka)** | Definición de los 10 canales transaccionales y de analítica: RabbitMQ para Sagas, compensaciones y órdenes confirmadas; Kafka para réplica duradera, telemetría y auditoría forense (`RabbitKafkaBridgeService`). |
| **P12** | `contracts/grpc/README.md` & `.proto` | gRPC / Proto3 | **Ingesta de Inventario de Alta Frecuencia** (`MS_STK`) | Documentación del servidor activo en puerto 50051 (`src/proto/inventory.proto`) y especificación propuesta v2 (`inventory-v2.proposed.proto`) con autenticación `x-api-key` y sincronización batch. |
| **P13** | `contracts/graphql/schema.graphql` & `README.md` | GraphQL SDL | **API Gateway BFF GraphQL Cliente** | Esquema SDL completo del gateway público (`/graphql`): consultas multivertical unificadas (`catalogoGlobal`), mutaciones transaccionales (`checkoutOrquestado`, `cancelarReservaConSaga`) y check-in digital. |
| **P16** | `contracts/carritos-openapi-v2.yaml` | OpenAPI 3.0.3 | **Carrito de Compras Multivertical** (`MS_CAR`) | Microservicio planificado para sustituir el carrito efímero de React: persistencia en `schema_carritos`, snapshotting autoritativo de precios en backend y detección batch de abandono (>2h). |
| **P17** | `contracts/auditoria-openapi-v2.yaml` | OpenAPI 3.0.3 | **Auditoría Transaccional y Forense** (`MS_AUD`) | Separación estricta entre auditoría de negocio (PostgreSQL `schema_auditoria`) y logs técnicos planos (ADR-003). Trazabilidad de quién compró, snapshots administrativos `antes`/`despues` y expedientes de Sagas. |
