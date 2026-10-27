# Contrato y Guía GraphQL BFF (Gateway Cliente) — Booking Prototipo (RDA2)

Este documento describe la especificación operativa y contractual del API Gateway GraphQL de Booking Prototipo (`Capa 6: Gateway Aggregator / Backend-for-Frontend`). El contrato formal tipado se encuentra en [`schema.graphql`](./schema.graphql).

---

## 1. Punto de Entrada y Configuración del Servidor

* **Endpoint Canónico:** `POST /graphql` (puerto HTTP estándar `3000`, ej. `http://localhost:3000/graphql` o `https://rda1-backend-integracion-sistemas.onrender.com/graphql`).
* **Playground / SandBox:** Disponible en `/graphql` vía navegador web (Apollo Server Sandbox habilitado mediante `playground: true` en `src/modules/graphql/graphql-bff.module.ts`).
* **Transporte:** HTTP/1.1 y HTTP/2 sobre HTTPS, transportando payloads JSON (`application/json`).
* **Resolución Anti-N+1:** El módulo incorpora `ReservasDataLoader` para agrupar en lote las consultas de reservas cruzadas sin saturar los esquemas de PostgreSQL.

---

## 2. Autenticación y Contexto de Seguridad

### 2.1. Estado Real en Código
El módulo inicializa el contexto GraphQL pasando las cabeceras HTTP entrantes:
```typescript
context: ({ req, res }) => ({ req, res })
```
Sin embargo, **ninguna operación (Query ni Mutation) implementa un guard de autenticación (`SupabaseAuthGuard` o `GqlAuthGuard`)**:
* Las mutaciones (`checkoutOrquestado`, `cancelarReservaConSaga`, `realizarCheckInDigital`) están anotadas únicamente con `@UseGuards(GqlThrottlerGuard)`.
* `GqlThrottlerGuard` aplica limitación de tasa (30 peticiones/minuto por IP), pero **no verifica firmas JWT, identidad de usuario ni roles**.
* Esto constituye una discrepancia crítica de seguridad documentada en el hallazgo `H-P13-01`.

### 2.2. Estado Objetivo (Gobernanza RDA2)
Para producción, toda llamada que involucre datos privados (`misReservas`, `checkoutOrquestado`, `cancelarReservaConSaga`) debe requerir:
* Cabecera `Authorization: Bearer <supabase_jwt>`.
* Inyección de `req.user` (`cliente_id`, `email`, `rol: CLIENTE | ADMIN`) al contexto de ejecución.

---

## 3. Trazabilidad Distribuida: Propagación de `X-Correlation-Id`

1. **Recepción:** El middleware perimetral de NestJS (`src/main.ts`) inspecciona la cabecera `X-Correlation-Id` o `x-correlation-id`. Si no se provee, genera automáticamente un identificador canónico:
   ```typescript
   const correlationId = req.headers['x-correlation-id'] || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
   ```
2. **Propagación hacia el ESB:** Cuando se ejecuta la mutación `checkoutOrquestado`, el servicio genera una clave de idempotencia `GQL-SAGA-${Date.now()}` y la transfiere a `SagaOrchestratorService.ejecutarCheckoutCompuesto`.
3. **Persistencia e Historial:** El orquestador registra cada paso en `schema_auditoria.saga_transacciones` bajo dicho `correlation_id` y lo bifurca hacia RabbitMQ y Kafka para trazabilidad forense.

---

## 4. Ejemplos de Invocación (Las 7 Operaciones Canónicas)

### 4.1. Query 1: `catalogoUnificado`
Consulta agregada multivertical (Atracciones, Autos, Alojamientos, Vuelos) sin joins cross-schema.

```graphql
query ObtenerCatalogo($destino: String, $vertical: String) {
  catalogoUnificado(destino: $destino, vertical: $vertical) {
    id
    vertical
    nombre
    descripcion
    destino
    precio
    disponible
    imagen_url
    rating
  }
}
```
**Variables JSON:**
```json
{
  "destino": "Galapagos",
  "vertical": "ATRACCIONES"
}
```

---

### 4.2. Query 2: `misReservas`
Consulta batch de reservas con protección anti-N+1 vía `DataLoader`.

```graphql
query MisReservas($clienteId: String!) {
  misReservas(clienteId: $clienteId) {
    cliente_id
    total_reservas_activas
    reservas {
      id
      vertical
      estado
      total
      fecha
      hora
      codigo_checkin
      voucher_qr_payload
      habitacion_asignada
      asiento_asignado
    }
  }
}
```
**Variables JSON:**
```json
{
  "clienteId": "cli-b8e7-4c81"
}
```

---

### 4.3. Query 3: `obtenerFacturaCompleta`
Consulta de comprobante fiscal consolidado con encabezado, cliente y desglose de ítems.

```graphql
query FacturaDetallada($numeroFactura: String!) {
  obtenerFacturaCompleta(numeroFactura: $numeroFactura) {
    id
    numero_factura
    fecha_emision
    subtotal
    iva_15pct
    total
    estado
    cliente {
      nombre
      email
      cedula_ruc
    }
    items {
      id
      vertical
      descripcion
      cantidad
      precio_unitario
      subtotal
    }
  }
}
```
**Variables JSON:**
```json
{
  "numeroFactura": "001-002-000000045"
}
```

---

### 4.4. Query 4: `obtenerPaquetesDisponibles`
Consulta de combos y promociones multivertical.

```graphql
query ListarPaquetes {
  obtenerPaquetesDisponibles {
    id
    nombre
    descripcion
    destino
    precio_total_original
    descuento_porcentaje
    precio_final_paquete
    estado
    items {
      id
      vertical
      external_service_id
      nombre_servicio
      precio_unitario
    }
  }
}
```
**Variables JSON:** `{}`

---

### 4.5. Mutation 1: `checkoutOrquestado`
Ejecución del checkout compuesto orquestado por Patrón Saga LIFO.

```graphql
mutation EjecutarCheckout($input: CheckoutSagaInputGql!) {
  checkoutOrquestado(input: $input) {
    success
    correlationId
    codigoCompensacion
    estado
    facturaId
    total
    mensaje
  }
}
```
**Variables JSON:**
```json
{
  "input": {
    "clienteEmail": "usuario.turista@epn.edu.ec",
    "clienteNombre": "Carlos Villacís",
    "metodoPago": "TARJETA_CREDITO",
    "numeroTarjeta": "4500123456789012",
    "items": [
      {
        "vertical": "ATRACCIONES",
        "itemId": "PRhu4UBTWPBC",
        "nombre": "Tour Snorkel Isla Lobos",
        "cantidad": 2,
        "precioUnitario": 55.0,
        "detallesReservaJson": "{\"fecha\": \"2026-10-28\", \"hora\": \"10:00\"}"
      },
      {
        "vertical": "AUTOS",
        "itemId": "auto-suv-galapagos",
        "nombre": "Alquiler SUV 4x4",
        "cantidad": 1,
        "precioUnitario": 45.0,
        "detallesReservaJson": "{\"dias\": 3}"
      }
    ]
  }
}
```

#### Respuesta Exitosas y de Compensación:
* **Éxito:** Devuelve `success: true`, `estado: "COMPLETED"`, `correlationId: "corr-179297..."`, `facturaId: "fac-..."`.
* **Fallo y Compensación:** Si un paso intermedio falla (o si se fuerza `simularFalloEnPaso: "AUTOS"`), el orquestador revierte las reservas previas en orden LIFO y devuelve:
  ```json
  {
    "data": {
      "checkoutOrquestado": {
        "success": false,
        "correlationId": "corr-1792972800-abc1234",
        "codigoCompensacion": "REF-SAGA-8F92A1",
        "estado": "FAILED_COMPENSATED",
        "total": 0,
        "mensaje": "Error en reserva de autos: Cupos agotados. Se ejecutó compensación LIFO exitosa."
      }
    }
  }
  ```
* **Consulta del Estado de la Saga:** El cliente o worker puede consultar el journal en tiempo real invocando el endpoint REST:
  ```bash
  GET /api/v2/esb/sagas/corr-1792972800-abc1234
  ```

---

### 4.6. Mutation 2: `cancelarReservaConSaga`
Cancelación de una reserva individual y restitución automática de aforo.

```graphql
mutation CancelarReserva($reservaId: String!, $vertical: String!, $motivo: String) {
  cancelarReservaConSaga(reservaId: $reservaId, vertical: $vertical, motivo: $motivo)
}
```
**Variables JSON:**
```json
{
  "reservaId": "res-atr-889922",
  "vertical": "ATRACCIONES",
  "motivo": "Cancelación por cambio de itinerario de vuelo"
}
```

---

### 4.7. Mutation 3: `realizarCheckInDigital`
Trámite unificado de check-in digital adaptado según la vertical.

```graphql
mutation CheckInDigital($input: CheckInInputGql!) {
  realizarCheckInDigital(input: $input) {
    success
    vertical
    reservaId
    mensaje
    voucherQrBase64
    habitacionAsignada
    claveAccesoDigital
    asientoAsignado
    codigoAcceso
  }
}
```
**Variables JSON (Ejemplo Vuelos):**
```json
{
  "input": {
    "vertical": "VUELOS",
    "reservaId": "res-vue-554433"
  }
}
```

---

## 5. Tabla de Equivalencias: GraphQL ↔ Rutas REST ↔ Servicios Internos

| Operación GraphQL | Tipo | Ruta REST Equivalente | Controlador / Servicio Interno | Microservicio Blueprint |
|---|:---:|---|---|---|
| `catalogoUnificado` | Query | `GET /vuelos/search`, `GET /autos/catalogo`, `GET /atracciones/catalogo` | `GraphqlBffService.getCatalogoUnificado` (SQL multiesquema paralelo) | `ORQ_PKG` / Gateway |
| `misReservas` | Query | `GET /api/v2/clientes/{id}/reservas` (Blueprint §5.2) | `ReservasDataLoader.clienteReservasLoader` | `MS_CLI` / `ORQ_RES` |
| `obtenerFacturaCompleta` | Query | `GET /api/v2/facturas/{numeroFactura}` | `EsbInternalRouterService.ensamblarFacturaCompleta` | `ORQ_FAC` / `MS_FAC` |
| `obtenerPaquetesDisponibles`| Query | `GET /api/v2/paquetes` | `PaquetesService.findAll` | `MS_PKG` / `ORQ_PKG` |
| `checkoutOrquestado` | Mutation | `POST /api/v2/esb/checkout` | `SagaOrchestratorService.ejecutarCheckoutCompuesto` | `MS_ESB` / Saga Engine |
| `cancelarReservaConSaga` | Mutation | `POST /api/v2/esb/sagas/compensar` | `AtraccionesService.cancelarReserva` / TypeORM update | `MS_ESB` / `MS_ATR` |
| `realizarCheckInDigital` | Mutation | `POST /api/v2/{vertical}/reservas/{id}/checkin` | `AtraccionesService.checkin`, `AutosService.checkin*` | `MS_ATR`, `MS_AUT`, `MS_VUE` |

---

## 6. Formato y Manejo de Errores

Las respuestas con fallos en GraphQL respetan la especificación estándar de GraphQL incorporando extensiones tipadas (`extensions.code`):

```json
{
  "errors": [
    {
      "message": "Límite de tasa excedido en mutaciones GraphQL BFF. Por favor espere 14 segundos.",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["checkoutOrquestado"],
      "extensions": {
        "code": "TOO_MANY_REQUESTS",
        "statusCode": 429,
        "retry_after_seconds": 14,
        "timestamp": "2026-10-24T21:40:00.000Z"
      }
    }
  ],
  "data": null
}
```

### Códigos de Error Estandarizados:
* `BAD_USER_INPUT` (400): Argumentos inválidos o campos sanitizados con longitudes excedidas.
* `UNAUTHENTICATED` (401): Falta de token JWT en cabecera `Authorization` (Estado Objetivo).
* `FORBIDDEN` (403): El usuario no tiene permisos sobre la reserva o recurso consultado.
* `TOO_MANY_REQUESTS` (429): Disparado por `GqlThrottlerGuard` al superar 30 peticiones/minuto.
* `INTERNAL_SERVER_ERROR` (500): Falla no controlada en la base de datos o en servicios downstream.

---

## 7. Nota de Arquitectura: Federación de Grafos (Apollo Federation v2 — Reto 3)

### 7.1. Situación Actual (`implemented`)
Booking opera actualmente como un **Gateway Monolítico BFF**: un único proceso NestJS hospeda el resolver central y realiza consultas directas a los repositorios o servicios locales de cada módulo.

### 7.2. Hoja de Ruta para Federación (Reto 3 — `planned`)
Para desacoplar el Gateway y permitir que cada tienda externa (equipo de Vuelos, Autos, Atracciones, Alojamientos) gobierne su propio esquema de forma independiente:

1. **Subgrafos por Vertical:**
   * Cada microservicio expondrá su propio endpoint GraphQL compatible con Federation v2 (`@key(fields: "id")`).
   * Ejemplo de entidad extendida en Subgrafo de Facturación:
     ```graphql
     type Reserva @key(fields: "id") {
       id: ID!
       facturaAsociada: FacturaCompleta
     }
     ```
2. **Gateway / Apollo Router Federado:**
   * Sustituir el servidor monolítico por **Apollo Router** (escrito en Rust) o supergrafo compilado mediante Rover CLI (`rover supergraph compose`).
3. **Contratos de Subgrafo Requeridos:**
   * Subgrafo 1: `subgraph-atracciones` (Catálogo, Turnos, Aforo, Check-in QR).
   * Subgrafo 2: `subgraph-autos` (Flota, Categorías, Odómetro, Cooldown).
   * Subgrafo 3: `subgraph-alojamientos` (Habitaciones, Check-in 14:00, PIN).
   * Subgrafo 4: `subgraph-vuelos` (Rutas, Asientos, PNR, Pases de Abordar).
   * Subgrafo 5: `subgraph-esb-sagas` (Orquestación transaccional, Pagos y Facturación).
