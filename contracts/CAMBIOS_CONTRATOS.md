# Walkthrough de Cambios — Contratos OpenAPI

> Fecha: 2026-09-21  
> Tarea: Revisión de contratos existentes + implementación del contrato de facturación

---

## Resumen Ejecutivo

Se realizaron cambios en **2 archivos** del directorio [`contracts/`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts):

| Archivo | Tipo de cambio | Estado antes | Estado ahora |
|---------|---------------|--------------|--------------|
| [`facturacion-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/facturacion-openapi.yaml) | ✅ Creado completo | `paths: {}` (vacío) | 5 endpoints + 9 schemas |
| [`atracciones-openapi.yaml`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/contracts/atracciones-openapi.yaml) | 🔧 Corregido | 2 errores de contrato | Errores corregidos |

Los contratos de `clientes`, `vuelos` y `alojamientos` **no tienen errores críticos** y no requirieron cambios.

---

## Cambio 1: `facturacion-openapi.yaml` — Contrato Completo

### Problema
El archivo solo contenía:
```yaml
openapi: 3.0.3
info:
  title: Facturación API
  version: 1.0.0
paths: {}
```

### Solución
Se implementó el contrato completo basado en las entidades [`Factura`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/core/entities/factura.entity.ts) y [`FacturaItem`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/core/entities/factura-item.entity.ts) que **ya existían** en el core.

### Endpoints Definidos

| Método | Ruta | Operación | Scope |
|--------|------|-----------|-------|
| `POST` | `/facturas` | Emitir nueva factura | `billing:write` |
| `GET` | `/facturas` | Listar facturas del usuario (paginado) | `billing:read` |
| `GET` | `/facturas/{facturaId}` | Detalle completo de una factura | `billing:read` |
| `GET` | `/facturas/{facturaId}/pdf` | Descargar PDF de la factura | `billing:read` |
| `PATCH` | `/facturas/{facturaId}/anular` | Anular factura emitida | `billing:admin` |

### Schemas Definidos

| Schema | Descripción |
|--------|-------------|
| `EmitirFacturaRequest` | Input para crear factura (carrito_id, billing_info, metodo_pago, referencia_pago) |
| `AnularFacturaRequest` | Motivo de anulación |
| `FacturaResponse` | Detalle completo de factura (mapea `Factura` entity) |
| `FacturaItemResponse` | Línea de detalle (mapea `FacturaItem` entity) |
| `FacturaListResponse` | Respuesta paginada con cursor |
| `FacturaResumen` | Vista resumida para listado |
| `BillingInfo` | Datos fiscales del cliente (idéntico a `clientes-openapi`) |
| `ProblemDetails` | Errores RFC 7807 (idéntico al resto de contratos) |

### Decisiones de Diseño

- **Base URL:** `https://api.booking-hub.com/billing/v1` — sigue el patrón de `vuelos` y `clientes`
- **`referencia_pago`:** Campo requerido en `EmitirFacturaRequest` — conecta con el `paymentReference` de vuelos, alojamientos y atracciones
- **`producto_id_externo`:** En `FacturaItemResponse` se documenta qué ID envía cada microservicio:
  - Vuelos → `bookingId`
  - Alojamientos → `order_id`
  - Atracciones → `reservation_id`
- **Idempotencia:** `POST /facturas` acepta `Idempotency-Key` (igual que vuelos) y retorna `200` si ya existe una factura para el mismo `carrito_id`
- **OAuth2:** Delega autenticación a `https://api.booking-hub.com/customers/v1/auth/token` — mismo IdP que el resto
- **`BillingInfo`:** Schema copiado fielmente de `clientes-openapi.yaml` para no romper el contrato entre microservicios

---

## Cambio 2: `atracciones-openapi.yaml` — Correcciones

### Error 1: Campo `summary` duplicado

**Antes** (YAML inválido):
```yaml
/atracciones/{id}:
  get:
    summary: Obtener el detalle de una atracción   # ← primera declaración
    security:
      - OAuth2Security:
        - attractions:read
    summary: Obtener el detalle de una atracción   # ← DUPLICADO → error
```

**Después:**
```yaml
/atracciones/{id}:
  get:
    summary: Obtener el detalle de una atracción   # ← solo una declaración
    security:
      - OAuth2Security:
        - attractions:read
```

> **Impacto:** El YAML con claves duplicadas en el mismo nivel es técnicamente inválido según la especificación YAML 1.2. Parsers estrictos (como los de Swagger Editor y muchos validators) lo rechazan.

---

### Error 2: `ReservationRequest` sin `payment_reference`

**Antes:**
```yaml
ReservationRequest:
  required:
    - date
    - ticket_count
    - customer_name      # ← customer_name requerido, sin payment_reference
  properties:
    ...
    customer_name:
      type: string
    customer_email:
      type: string
```

**Después:**
```yaml
ReservationRequest:
  required:
    - date
    - ticket_count
    - payment_reference   # ← payment_reference ahora requerido
  properties:
    ...
    payment_reference:
      type: string
      description: Identificador del pago emitido por la Payment API.
      example: 'pay_3NxQ1mJZqEvB'
    customer_name:
      type: string
      description: Nombre del cliente. Si se omite se extrae del JWT (fullName).
    customer_email:
      type: string
      description: Email del cliente. Si se omite se extrae del JWT (email).
```

> **Impacto:** Sin `payment_reference`, la API de Facturación no puede generar la factura cuando el item proviene de una atracción. Además, `customer_name` ya no es obligatorio — el principio de todos los contratos es extraer la identidad del JWT.

---

## Revisión de Contratos Sin Cambios

### ✅ `clientes-openapi.yaml` — OK
- `BillingInfo` bien definido con `taxIdType`, `taxId`, `legalName`, `address`
- OAuth2 Password Flow correcto
- Sin inconsistencias

### ✅ `vuelos-openapi.yaml` — OK
- `PaymentReference.paymentReference` conecta con facturación correctamente
- La descripción documenta explícitamente que facturación es responsabilidad de otro dominio
- Sin problemas

### ✅ `alojamientos-openapi.yaml` — OK
- `OrderCreateRequest.payment_reference` presente
- `OrderDetail.order_id` (UUID) sirve como `producto_id_externo` en facturación
- Sin problemas críticos

---

## Criterios de Evaluación Cubiertos

| Criterio | Descripción | Estado |
|----------|-------------|--------|
| **C04** | APIs implementadas y documentadas con OpenAPI | ✅ Facturación ahora tiene contrato completo |
| **C06** | Diseño API-First y preparación para futura integración | ✅ Contrato define la interfaz antes de la implementación |
| **C07** | Contratos para interoperabilidad futura | ✅ Facturación enlaza explícitamente con los 4 microservicios |
