# Contratos de Integración - API v1 (Atracciones)

Este documento describe formalmente los contratos expuestos por el módulo de **Atracciones (Booking Prototipo - BFF)**. Estos contratos aplican el **Nivel 3 de Richardson (HATEOAS)** y manejan excepciones mediante **RFC 7807 (Problem Details)**, garantizando una interoperabilidad robusta con los demás sistemas del ecosistema.

## Especificaciones Generales
- **Base URL**: `/api/v1/atracciones`
- **Deprecación**: Todas las peticiones devuelven la cabecera `X-API-Deprecation-Date: 2027-12-31`.

---

## 1. Obtener Catálogo (Listado de Atracciones)

**Endpoint:** `GET /`
**Descripción:** Retorna el catálogo paginado. Los datos son cacheados para reducir latencia.

### Response (200 OK)
```json
{
  "data": [
    {
      "id": "1",
      "nombre": "Atracción Mock",
      "descripcion": "Descripción detallada",
      "ciudad": "Quito",
      "latitud": -0.22985,
      "longitud": -78.52495,
      "precioTicket": 45,
      "duracionHoras": 4,
      "estaActivo": true
    }
  ],
  "meta": {
    "total": 100,
    "limit": 10,
    "page": 1
  },
  "_links": {
    "self": { "href": "/api/v1/atracciones?page=1&limit=10", "type": "GET" },
    "next": { "href": "/api/v1/atracciones?page=2&limit=10", "type": "GET" }
  }
}
```

---

## 2. Detalle de Atracción

**Endpoint:** `GET /:id`
**Descripción:** Obtiene los detalles de una atracción usando el Patrón Wrapper.

### Response (200 OK)
```json
{
  "id": "1",
  "nombre": "Atracción Mock",
  "descripcion": "Descripción detallada",
  "ciudad": "Quito",
  "latitud": -0.22985,
  "longitud": -78.52495,
  "precioTicket": 45,
  "duracionHoras": 4,
  "estaActivo": true,
  "_links": {
    "self": { "href": "/api/v1/atracciones/1", "type": "GET" },
    "reservar": { "href": "/api/v1/atracciones/1/reservar", "type": "POST" },
    "catalogo": { "href": "/api/v1/atracciones", "type": "GET" }
  }
}
```

---

## 3. Reservar Atracción (Pago Síncrono)

**Endpoint:** `POST /:id/reservar`
**Descripción:** Efectúa una reserva transaccional bloqueante validando primero el pago (Pasarela simulada).

### Request Payload (Body)
```json
{
  "cantidadTickets": 2,
  "metodoPago": "TARJETA"
}
```

### Response (201 Created) - Éxito
```json
{
  "mensaje": "Reserva confirmada exitosamente",
  "atraccion": "Atracción Mock",
  "tickets": 2,
  "metodoPago": "TARJETA",
  "transaccionId": "TXN-123456",
  "estado": "CONFIRMADO",
  "_links": {
    "self": { "href": "/api/v1/atracciones/1/reservar", "type": "POST" },
    "atraccion": { "href": "/api/v1/atracciones/1", "type": "GET" }
  }
}
```

### Response (402 Payment Required) - Error de Pago (RFC 7807)
```json
{
  "type": "https://httpstatuses.com/402",
  "title": "HttpException",
  "status": 402,
  "detail": "Fondos insuficientes o límite de tickets excedido en la pasarela de pagos",
  "instance": "/api/v1/atracciones/1/reservar"
}
```
