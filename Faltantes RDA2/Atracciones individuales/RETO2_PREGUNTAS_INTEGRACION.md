# Preguntas para el equipo de integración (Booking) — vertical de Autos

Basadas en `GUIA_INTEGRACION_AUTOS.md`, `autos-openapi-v3.yaml` (v3.0.0) e `inventory.proto` (SHA-256 `e5a3661bd8897ab13a6368ac962b3ed8f253049951993d4d857ca95210434f31`). Fecha: 2026-10-27.

Las marcadas con ⛔ bloquean la implementación.

## A. gRPC (`inventory.proto`)

1. ⛔ **¿A qué dirección enviamos `PushStockUpdate` en producción?** El `.proto` indica `booking.epn.edu.ec:50051`, pero ese dominio no existe (no resuelve en DNS). La guía indica `rda1-backend-integracion-sistemas.onrender.com:50051`, pero probamos y el puerto 50051 no acepta conexiones desde Internet (el 443 sí); Render solo publica HTTPS. ¿Hay otro host o puerto, se usa gRPC sobre 443 con TLS, o el gRPC solo funcionará en la prueba local por Tailscale?
2. ⛔ **Formato de `time_slot`:** el `.proto` dice `"10:30 a.m."` o `"10:30:00"`; el contrato v3 y la guía usan `"10:00"`. ¿Cuál debemos enviar?
3. ⛔ **Formato de `slot_id`:** el `.proto` dice `"slot-YYYYMMDD-HHMM"`; la guía usa `"slot-auto-spark-01-20261115-1000"` (con el `vehicle_id`). ¿Cuál es el correcto para autos?
4. ⛔ **Alquileres de varios días:** si un auto se reserva del 15 al 18 de noviembre, ¿qué `date` y `time_slot` enviamos? ¿Solo la fecha y hora de retiro, uno por cada día, o uno por cada franja?
5. **`ITEM_NOT_FOUND`:** para no recibir este error, ¿Booking ya debe conocer nuestros `item_id` antes del primer envío? ¿Los aprende al pulsar "Sincronizar" en el panel de nodos? ¿Qué endpoint nuestro llama ese botón?
6. **`service_id`:** ¿es el "ID del Nodo" que escribimos en el formulario de registro? ¿Hay un formato obligatorio (`NODE_AUT_…`)?
7. **Métodos obligatorios:** ¿basta con `PushStockUpdate`, o también debemos usar `StreamInventoryChanges` y `GetSlotAvailability`?
8. **Regla monotónica (`STALE_TIMESTAMP_IGNORED`):** ¿Booking compara el `timestamp` por `item_id` + `slot_id`? Lo necesitamos saber para los reintentos.

## B. REST (contrato v3)

9. ⛔ **URL exacta:** ¿qué ponemos como "Base URL REST" en el formulario, con o sin `/api/v3`? ¿A qué ruta completa llega la reserva (`<base>/api/v3/autos/reservas` o `<base>/reservas`) y a cuál el semáforo (`<base>/api/v3/autos/health` o `<base>/autos/health`)?
10. ⛔ **Respuesta `201` de la reserva:** el esquema del contrato usa `status: "CONFIRMED"`, `auto_id` y `voucher_qr_data`; el ejemplo de la guía usa `status: "RESERVADO"`, `vehicle_id` y `voucher_qr_payload`. ¿Cuál valida Booking?
11. ⛔ **Autenticación:** ¿Booking enviará `X-API-Key` o un token `Bearer` en la reserva? Si es una clave, ¿cómo la intercambiamos? ¿O esos endpoints quedan sin autenticación?
12. **¿Qué endpoints llama Booking realmente?** Además de la reserva y el semáforo, ¿llama a `GET /autos`, `POST /autos/search`, `POST /autos/orders/{id}/cancel` (compensación de la Saga), los check-ins o `GET /autos/eventos`? Así priorizamos.
13. **Cancelación:** ¿el reembolso del 100 % aplica a toda cancelación o solo a las compensaciones de la Saga (`solicitante: SAGA_ORCHESTRATOR`)?
14. **Semáforo de 4 s:** en Render gratuito la API se duerme tras 15 min sin uso y tarda unos 50 s en despertar, así que el nodo aparecería en rojo. ¿Es aceptable mantenerla despierta con un ping periódico?
15. **Eventos:** ¿Booking consume nuestros eventos por RabbitMQ o Kafka (¿cuál es la URL del broker?) o leyendo `GET /autos/eventos`?

## C. Organización

16. **¿Quiénes son los compañeros de la vertical de Autos** y cuándo es la reunión para acordar el modelo de datos común?
17. **Prueba por Tailscale:** ¿qué fecha y qué puertos se usarán?
