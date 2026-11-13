# Directiva de Integración Cross-Platform B2B (Booking Central)

## 1. Gestión de Stock y Disponibilidad de Flota (Autos)
- **Normalización de Estados**: Todo estado proveniente de socios externos debe normalizarse en los adaptadores. `AVAILABLE`, `DISPONIBLE`, `ACTIVE` y `ACTIVO` representan unidades operativas y disponibles.
- **Flotas con Inventario Multi-Unidad**: En vehículos donde el socio reporta `stock > 1` o `stock_disponible > 1` (ej. Mateo - Maneja de Una), nunca marcar el vehículo como `RESERVADO` en el catálogo a menos que el conteo de reservas concurrentes activas sea igual o superior a la capacidad total de unidades (`overlappingCount >= totalUnits`).
- **Validaciones en Frontend**: En la interfaz de detalle del auto (`AutoDetail.jsx`), el botón de reserva y la alerta de "Todas las unidades reservadas" deben condicionarse estrictamente a `auto.unidades_disponibles === 0` y no a un estado genérico `RESERVADO` si aún restan unidades libres.

## 2. Cancelaciones B2B de Atracciones
- **Contrato v3 de TourGirls (Michael - NODE_ATR_MOLINA)**: Toda cancelación enviada a TourGirls debe cumplir con los siguientes requisitos:
  - Cabeceras: `'X-API-Key'`, `'Idempotency-Key'` (UUID obligatorio generado con `crypto.randomUUID()`), `'X-Correlation-Id'` y `'Content-Type': 'application/json'`.
  - Body: `{ "reason": "...", "solicitante": "SAGA_ORCHESTRATOR" }`.
  - Endpoints: Intentar `/api/v3/atracciones/reservas/:id/cancel` con fallback a `/api/v3/reservas/:id/cancel`.
- **Manejo de Prefijos Compartidos**: Para códigos con prefijo `DEC-`, si la pasarela de Descubre EC (Dilan) responde 404 o no localiza la orden, se debe realizar fallback automático a TourGirls (Michael) garantizando la entrega del reverso.

## 3. Check-in Inbound y Aislamiento de Verticales
- **Aislamiento de Solicitudes de Autos**: Si una solicitud a `POST /api/v3/reservas/:id/checkin` proviene de un socio de autos (API Key de Daniel, Mateo, Esteban) o el identificador inicia con `CAR` o `MDU`, la resolución pertenece exclusivamente a la vertical `AUTOS`.
- **Eliminación de Consultas en Cascada**: Queda prohibido consultar en cascada las bases de datos de Vuelos o Alojamientos cuando la orden ya está tipificada como auto, previniendo latencias de red (hasta 30s) y errores 404 falsos.
- **Inserción de Rescate Completa**: Si una orden de auto validada no existe aún en `schema_autos.autos_reservas`, la inserción de rescate debe proveer valores por defecto válidos para todas las columnas `NOT NULL` (`auto_id`, `fecha_recogida`, `fecha_devolucion`, `dias_renta`, `total`, `idempotency_key`, `nombre_conductor`, `licencia_conducir`).
- **Persistencia Monotónica**: El estado `CONFIRMADO_ASISTIDO` es irreversible una vez registrado y debe reflejarse tanto en el endpoint de consulta `/api/v3/reservas/:id/estado` como en la interfaz de "Mis Reservas".

