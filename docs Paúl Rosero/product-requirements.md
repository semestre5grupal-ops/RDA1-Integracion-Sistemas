# Product Requirements — Booking Prototipo (Integrador)

## What Is This Project?

El **Booking Prototipo** es la plataforma central integradora del ecosistema digital de la asignatura de Integración de Sistemas. Es un marketplace que centraliza, consulta, muestra e integra la información de los sistemas de información individuales (Atracciones, Vuelos, Alojamientos, Autos) desarrollados por los compañeros de clase.

---

## What Does It Do?

### Integración API-first
- Consume información de las APIs REST (Reto 1), microservicios (Reto 2) y subgrafos GraphQL (Reto 3) de los sistemas externos.
- **NO guarda** catálogos de productos; actúa como agregador.

### Gestión de Carritos y Pagos
- Permite a los usuarios armar un carrito de compras multi-dominio.
- Procesa el check-out, registrando facturas y cambiando el estado de los productos en los sistemas de origen.

### Administración y Observabilidad
- Ofrece un panel de administración para ver el estado de salud de todas las APIs conectadas (`estado_servicios`).
- Registra logs de las llamadas HTTP para auditoría técnica (`api_request_logs`).

---

## Who Uses It?

### Cliente Final (Shopper)
- Necesita buscar atracciones, vuelos y hoteles en un solo lugar.
- Necesita pagar todo en una sola transacción y recibir una factura.

### Administrador / Ingeniero (Profesor)
- Necesita auditar que la integración funcione correctamente.
- Necesita ver la trazabilidad de las peticiones entre el Booking y los microservicios.

---

## Core Capabilities

- **API Gateway:** Enrutamiento y consumo de APIs de compañeros.
- **Identidad Centralizada:** Gestión de Usuarios y Roles (JWT).
- **Checkout Unificado:** Emisión de facturas y control de transacciones distribuidas.
- **Observabilidad:** Monitoreo del estado de las APIs externas (Up/Down).

---

## Business Constraints

- **Reto 1 (Semanas 1-6):** Arquitectura Monolítica (Base API-first sin integración total), una sola BD.
- **Reto 2 (Semanas 7-11):** Migración a Microservicios, API Gateway, Integración web real.
- **Reto 3 (Semanas 12-16):** Consolidación multi-dominio, App Móvil (React Native/Flutter), resiliencia y fiabilidad.

---

## Scope Boundaries

### In Scope
- Gestión de usuarios y sesiones.
- Motor de carrito de compras y facturación inmutable.
- Peticiones HTTP a sistemas externos para pintar la UI.
- Interfaz clon de Booking.com.

### Out of Scope
- Gestión de inventarios, creación o actualización de Atracciones, Vuelos o Alojamientos (responsabilidad de sistemas individuales).
- Pasarelas de pago reales (se usará flujo simulado).
