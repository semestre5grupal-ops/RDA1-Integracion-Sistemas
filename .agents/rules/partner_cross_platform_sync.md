# Directiva de Integración Cross-Platform B2B y Despliegue Azure (Booking Central)

## 1. Protocolo Obligatorio de Despliegue en Azure
- **Despliegue Manual con OneDeploy**: El repositorio no cuenta con despliegue automático por GitHub Actions hacia Azure (`isGitHubAction: false`). Los commits o pushes a `main` NO actualizan automáticamente la API de Azure en producción.
- **Flujo de Publicación Obligatorio**: Todo cambio de backend destinado a producción (`booking-core-api.azurewebsites.net`) debe ejecutarse en el siguiente orden:
  1. `npm run build`
  2. `powershell -ExecutionPolicy Bypass -File scripts\create_azure_zip.ps1`
  3. `az webapp deploy --resource-group rg-booking-puce --name booking-core-api --src-path deploy_booking.zip --type zip --async false`
  4. Verificar disponibilidad y respuesta con `Invoke-RestMethod`.

## 2. Agregador ESB Multivertical (`/aggregate/mis-reservas/:cliente`)
- **Búsqueda por Cédula / Licencia**: La resolución de reservas en `schema_autos.autos_reservas` dentro del agregador ESB debe filtrar por `licencia_conducir` (cédula del conductor), `cliente_id`, `id`, `pnr` y `external_order_id`. Esto garantiza que consultas por número de cédula (ej. `1720375003`) o por código retornen el historial completo de autos del cliente.

## 3. Gestión de Stock y Disponibilidad de Flota (Autos)
- **Normalización de Estados**: Todo estado proveniente de socios externos debe normalizarse en los adaptadores. `AVAILABLE`, `DISPONIBLE`, `ACTIVE` y `ACTIVO` representan unidades operativas y disponibles.
- **Flotas con Inventario Multi-Unidad**: En vehículos donde el socio reporta `stock > 1` o `stock_disponible > 1` (ej. Mateo - Maneja de Una), nunca marcar el vehículo como `RESERVADO` en el catálogo a menos que el conteo de reservas concurrentes activas sea igual o superior a la capacidad total de unidades (`overlappingCount >= totalUnits`).
- **Validaciones en Frontend**: En la interfaz de detalle del auto (`AutoDetail.jsx`), el botón de reserva y la alerta de "Todas las unidades reservadas" deben condicionarse estrictamente a `auto.unidades_disponibles === 0` y no a un estado genérico `RESERVADO` si aún restan unidades libres.

## 4. Cancelaciones B2B de Atracciones (TourGirls - Michael - NODE_ATR_MOLINA)
- **Contrato v3 de TourGirls**: Toda cancelación enviada a TourGirls debe cumplir con los siguientes requisitos:
  - Cabeceras: `'X-API-Key'`, `'Idempotency-Key'` (UUID obligatorio generado con `crypto.randomUUID()`), `'X-Correlation-Id'` y `'Content-Type': 'application/json'`.
  - Body: `{ "reason": "...", "solicitante": "SAGA_ORCHESTRATOR" }`.
  - Endpoints: Intentar `/api/v3/atracciones/reservas/:id/cancel` con fallback a `/api/v3/reservas/:id/cancel`.
- **Manejo de Prefijos Compartidos**: Para códigos con prefijo `DEC-`, si la pasarela de Descubre EC (Dilan) responde 404 o no localiza la orden, se debe realizar fallback automático a TourGirls (Michael) garantizando la entrega del reverso.

## 5. Check-in Inbound y Aislamiento de Verticales
- **Aislamiento de Solicitudes de Autos**: Si una solicitud a `POST /api/v3/reservas/:id/checkin` proviene de un socio de autos (API Key de Daniel, Mateo, Esteban) o el identificador inicia con `CAR` o `MDU`, la resolución pertenece exclusivamente a la vertical `AUTOS`.
- **Eliminación de Consultas en Cascada**: Queda prohibido consultar en cascada las bases de datos de Vuelos o Alojamientos cuando la orden ya está tipificada como auto, previniendo latencias de red (hasta 30s) y errores 404 falsos.
- **Inserción de Rescate Completa**: Si una orden de auto validada no existe aún en `schema_autos.autos_reservas`, la inserción de rescate debe proveer valores por defecto válidos para todas las columnas `NOT NULL` (`auto_id`, `fecha_recogida`, `fecha_devolucion`, `dias_renta`, `total`, `idempotency_key`, `nombre_conductor`, `licencia_conducir`).
- **Persistencia Monotónica**: El estado `CONFIRMADO_ASISTIDO` es irreversible una vez registrado y debe reflejarse tanto en el endpoint de consulta `/api/v3/reservas/:id/estado` como en la interfaz de "Mis Reservas".

## 6. Manejo Dinámico de Boletos y Políticas de Edad en Atracciones
- **Atracciones de Tarifa Única General**: Si el socio o la atracción no diferencian tarifas por edades (ej. Ariel / Ecuatravel y Gloria / Vívelo Ecuador que operan con tarifa única o sobre total `personas`), la interfaz de usuario en `AtraccionDetail.jsx` debe mostrar exclusivamente el selector unificado `Personas (Entrada General)` y ocultar los bloques de niños, seniors e infantes.
- **Normalización de Payload**: En atracciones de tarifa general, el formulario despacha `adult_count: totalTickets, ticket_count: totalTickets` con `child_count = 0, senior_count = 0, infant_count = 0`, evitando rechazos por discordancia en los esquemas de validación de los socios.
- **Salvaguarda de Resiliencia en Backend**: Si un socio externo rechaza una reserva con desglose etario, el backend reintenta automáticamente unificando el total de boletos como entradas generales de adulto, garantizando que ninguna compra legítima falle.
