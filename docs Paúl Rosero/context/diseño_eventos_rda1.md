# Diseño Preliminar de Eventos (SOA / EDA) - RDA1

Este documento establece la base arquitectónica orientada a eventos (EDA - Event-Driven Architecture) para el **Booking Prototipo**, cumpliendo con los requisitos del **Reto 1 (Semanas 5 y 6 del sílabo)**.

Aunque en esta primera fase la comunicación es principalmente síncrona (REST API-first), este diseño conceptual prepara el sistema para el futuro desacoplamiento asíncrono utilizando un Event Bus (Mensajería Empresarial como RabbitMQ, Kafka o AWS EventBridge) en los próximos RDA.

## 1. Identificación de Operaciones Desacoplables

Actualmente, las siguientes operaciones ocurren de forma síncrona, pero son candidatas ideales para migrar a un esquema SOA/EDA asíncrono:

- **Notificación de Reserva Exitosa:** Actualmente el cliente debe esperar la respuesta. En el futuro, el servicio de pagos emitirá un evento y un worker procesará el envío del correo de confirmación.
- **Actualización de Inventario:** Cuando se reserva una atracción, en lugar de bloquear la base de datos principal, se emitirá un evento de reserva que el microservicio de inventario escuchará para descontar los tickets en *background*.
- **Trazabilidad y Auditoría:** Guardar los logs transaccionales de pago no debe bloquear la respuesta al usuario.

## 2. Definición de Eventos de Negocio Relevantes (Domain Events)

Los eventos se nombrarán utilizando el tiempo verbal pasado, indicando que el hecho ya ocurrió.

### Tópico: `booking.atracciones.events`

#### Evento: `AtraccionReservada`
- **Gatillador:** El cliente completa exitosamente el endpoint `POST /api/v1/atracciones/:id/reservar`.
- **Payload (JSON):**
  ```json
  {
    "evento_id": "evt_987654321",
    "tipo": "AtraccionReservada",
    "fecha_emision": "2026-09-21T13:00:00Z",
    "datos": {
      "atraccion_id": "1",
      "cantidad_tickets": 2,
      "metodo_pago": "TARJETA",
      "transaccion_id": "TXN-123456"
    }
  }
  ```
- **Consumidores Futuros:** Servicio de Notificaciones (para enviar email) y Servicio de Inventario (para restar disponibilidad).

#### Evento: `PagoRechazado`
- **Gatillador:** La pasarela de pagos rechaza la transacción (fondos insuficientes o timeout).
- **Payload (JSON):**
  ```json
  {
    "evento_id": "evt_123456789",
    "tipo": "PagoRechazado",
    "fecha_emision": "2026-09-21T13:01:00Z",
    "datos": {
      "intento_reserva_id": "req_888",
      "motivo": "Fondos insuficientes",
      "codigo_error": 402
    }
  }
  ```
- **Consumidores Futuros:** Servicio de Auditoría y Prevención de Fraude.

## 3. Primera Aproximación a Colas y Tópicos

Para el RDA2/RDA3, se propone la siguiente topología de mensajería (Patrón Publisher/Subscriber):

- **Exchange (Intercambiador):** `booking.direct.exchange`
- **Colas (Queues):**
  - `q.notificaciones.atracciones`: Cola dedicada al envío de comprobantes de pago.
  - `q.inventario.atracciones`: Cola dedicada a la consistencia eventual del stock.
  - `q.auditoria.deadletter`: (DLQ - Dead Letter Queue) Para capturar eventos de transacciones fallidas o mensajes no procesables.

## 4. Trazabilidad de Eventos
Se incorporará un campo `correlation_id` (Id de Correlación) en las cabeceras de todos los eventos enviados al Event Bus. Esto permitirá rastrear toda la vida de una solicitud (desde que el usuario hace click en "Reservar" en el frontend web/móvil, hasta que el worker de notificaciones finaliza su tarea), garantizando la observabilidad distribuida.
