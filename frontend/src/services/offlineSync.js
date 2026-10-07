import { get, set, update } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { createOrderAuto } from './autosApi';
import { reservarAtraccion } from './atraccionesApi';
import { reservarAlojamiento } from './alojamientosApi';
import { crearReserva as crearReservaVuelo } from './vuelosApi';
import { enviarFacturaTrasCompra } from './envioFactura';

const PENDING_RESERVATIONS_KEY = 'pending_reservations';

/**
 * Guarda una reserva en IndexedDB para procesarla cuando vuelva la conexión.
 *
 * @param {string} tipo 'auto' | 'atraccion' | 'vuelo' | 'alojamiento'
 * @param {object} payload Datos necesarios para la API
 * @param {string} idempotencyKey Clave de idempotencia
 * @param {object} datosFactura Opcional: datos de la factura que se enviará por
 *   correo cuando la reserva se sincronice (ver `enviarFacturaTrasCompra`).
 */
export async function savePendingReservation(tipo, payload, idempotencyKey = uuidv4(), datosFactura = null) {
  const newTask = {
    id: uuidv4(),
    tipo,
    payload,
    idempotencyKey,
    datosFactura,
    timestamp: Date.now(),
  };

  await update(PENDING_RESERVATIONS_KEY, (val) => {
    const queue = val || [];
    queue.push(newTask);
    return queue;
  });

  console.log(`[Offline Sync] Reserva de ${tipo} guardada localmente. Se enviará al reconectar.`);
}

/**
 * Intenta procesar todas las reservas pendientes guardadas en IndexedDB.
 */
export async function syncPendingReservations() {
  const queue = await get(PENDING_RESERVATIONS_KEY);
  if (!queue || queue.length === 0) return;

  console.log(`[Offline Sync] Hay ${queue.length} reservas pendientes. Intentando sincronizar...`);

  const pending = [];

  for (const task of queue) {
    try {
      if (task.tipo === 'auto') {
        await createOrderAuto(task.payload, task.idempotencyKey);
      } else if (task.tipo === 'atraccion') {
        // En atracciones el payload suele ser { atraccionId, form } 
        // Adapta esto según cómo recibe reservarAtraccion en tu API
        await reservarAtraccion(task.payload.atraccionId, task.payload.data, task.idempotencyKey);
      } else if (task.tipo === 'vuelo') {
        await crearReservaVuelo(task.payload, task.idempotencyKey, task.fingerprint);
      } else if (task.tipo === 'alojamiento') {
        await reservarAlojamiento(task.payload.alojamientoId, task.payload.data, task.idempotencyKey);
      }
      
      console.log(`[Offline Sync] ✅ Sincronización exitosa para reserva de ${task.tipo} (${task.id})`);

      // La factura se envía ahora que hay conexión y la reserva existe en el
      // servidor. `enviarFacturaTrasCompra` no lanza, así que un fallo de SMTP no
      // mete esta tarea de vuelta en la cola (que reintentaría la RESERVA, no el
      // correo, y la reserva ya está confirmada: solo generaría duplicados).
      if (task.datosFactura) {
        await enviarFacturaTrasCompra(task.datosFactura);
      }

    } catch (error) {
      console.error(`[Offline Sync] ❌ Error sincronizando reserva de ${task.tipo} (${task.id}):`, error);
      // Si el error es de red (no hay conexión aún), lo devolvemos a la cola.
      // Si es un error 400 o 500 del backend, quizás deberíamos descartarlo o alertar.
      // Por simplicidad, si falla por cualquier razón, lo mantenemos para intentar de nuevo.
      pending.push(task);
    }
  }

  // Guardar en IDB solo las que fallaron (para reintentar después)
  await set(PENDING_RESERVATIONS_KEY, pending);
  
  if (pending.length === 0) {
    console.log('[Offline Sync] Todas las reservas pendientes fueron sincronizadas exitosamente.');
  }
}
