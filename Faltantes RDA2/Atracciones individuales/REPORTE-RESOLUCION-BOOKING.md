# 📋 REPORTE DE RESOLUCIÓN - VÍVELO ECUADOR (NODE_ATR_GLORIA)

Fecha: 4 de noviembre de 2026, America/Guayaquil.

Se redesplegaron Inventory y Catalog en Azure Container Apps con la etiqueta `cert-20261104`. Revisiones: `ms-inventory--0000004` y `ms-catalog--0000012`. Catalog sirve el 100 % del tráfico desde la nueva revisión.

## 1. Validación de aforo implementada

Booking confirma la reserva únicamente después de que Inventory haya asignado los cupos. Inventory consulta el turno dentro de una transacción con `FOR UPDATE OF s,d`; el bloqueo se mantiene durante la validación, el incremento del aforo reservado y el registro de la asignación. Esto evita que solicitudes concurrentes consuman los mismos cupos. Las solicitudes idempotentes recuperan su asignación previa sin consumir nuevamente.

Código del control en `booking-backend/microservices/ms_inventory/src/inventory.service.ts`:

```typescript
const row = await this.find(manager, key, true);
if (
  !row ||
  row.dis_cerrada ||
  !row.hor_activo ||
  row.dis_cupo_total - row.dis_cupo_reservado < input.quantity
)
  throw new RpcException({
    code: status.RESOURCE_EXHAUSTED,
    message: `Cupos agotados para este horario. Disponibles: ${!row || row.dis_cerrada || !row.hor_activo ? 0 : Math.max(0, row.dis_cupo_total - row.dis_cupo_reservado)}.`,
  });
await manager.query(
  'UPDATE disponibilidad SET dis_cupo_reservado=dis_cupo_reservado+$2 WHERE dis_id=$1',
  [row.dis_id, input.quantity],
);
```

Catalog transforma `RESOURCE_EXHAUSTED` en HTTP 409, con `code: "OUT_OF_STOCK"`, y conserva el tipo y detalle en su filtro Problem Details. Los conflictos de idempotencia mantienen su tratamiento independiente.

**Validación real en Azure:** turno de prueba del 4 de noviembre de 2099 a las 23:47, atracción «Tour Prueba Flujo».

| Operación | Resultado |
| --- | --- |
| Reservar 20 de 20 cupos | HTTP 201, reserva `a1c6b370-24e6-4e73-81a6-7114daf663a0` |
| Repetir la misma clave de idempotencia | HTTP 201, mismo identificador de reserva |
| Solicitar 2 cupos adicionales | HTTP 409, `OUT_OF_STOCK` |
| Consultar Inventory tras el rechazo | Total 20, reservados 20, disponibles 0 |

Respuesta obtenida al intentar la sobreventa (se omiten únicamente los campos de trazabilidad):

```json
{
  "type": "https://booking.epn.edu.ec/errors/sin-cupos",
  "title": "Cupos Agotados para el Turno Horario",
  "status": 409,
  "detail": "Cupos agotados para este horario. Disponibles: 0.",
  "instance": "/api/v3/atracciones/reservas",
  "code": "OUT_OF_STOCK"
}
```

Al finalizar se canceló la reserva de prueba, se verificó que los cupos reservados volvieran a cero y se cerró el turno de certificación.

## 2. Endpoint de promociones publicado

**GET:** https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v3/atracciones/promociones/contrato

**Status observado en Azure: HTTP 200 OK.** Respuesta:

```json
{
  "proveedor_codigo": "NODE_ATR_GLORIA",
  "nombre_socio": "Vívelo Ecuador",
  "vertical": "ATRACCIONES",
  "permite_promociones": true,
  "porcentaje_descuento": 15,
  "condiciones_combo": "Aplica para reservas combinadas auto + atracción con Booking Central"
}
```

## Verificación técnica

- Catalog: compilación correcta y 91 pruebas unitarias aprobadas.
- Inventory: compilación correcta y 2 pruebas aprobadas.
- Integración con PostgreSQL aislado, HTTP y gRPC reales: 16 pruebas aprobadas, incluido el escenario exacto 20 + 2, concurrencia, idempotencia y compensaciones.
- Validación remota reproducible: `booking-backend/microservices/ms-catalog/scripts/verify-booking-certification.mjs`. Requiere las variables `BOOKING_CERT_BASE_URL`, `BOOKING_CERT_INVENTORY_URL` e `INVENTORY_SYNC_API_KEY`; para repetir, elegir una fecha/hora de prueba sin registro previo mediante `BOOKING_CERT_DATE` y `BOOKING_CERT_TIME`.
- El lint global de Catalog sigue señalando seis problemas previos en el parser del controlador Booking (una importación sin uso y cinco conversiones de valores desconocidos a texto). No impiden la compilación ni las verificaciones anteriores.

Este reporte registra pruebas directas contra el nodo Azure; Booking Central debe repetir su batería cruzada para emitir la certificación final.
