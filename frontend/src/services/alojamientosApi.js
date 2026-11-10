import axios from 'axios';
import { obtenerAccessToken, api as apiAuth } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
});

export async function getAlojamientos({ page = 1, limit = 10, destino, tienePiscina } = {}) {
  const { data } = await api.get('/alojamientos', {
    params: {
      page,
      limit,
      destino,
      tienePiscina,
    },
  });
  return data;
}

export async function searchAlojamientos(searchPayload) {
  const { data } = await api.post('/alojamientos/search', searchPayload);
  return data;
}

/**
 * Disponibilidad y precio REAL de un alojamiento para unas fechas y ocupación
 * (POST /alojamientos/availability). El backend valida fechas y capacidad:
 * responde 400 con `invalidParams` si algo no cuadra.
 */
export async function consultarDisponibilidad({ id, checkin, checkout, adultos, edadesNinos = [], habitaciones }) {
  const { data } = await api.post('/alojamientos/availability', {
    accommodation: id,
    checkin,
    checkout,
    guests: {
      number_of_adults: adultos,
      number_of_rooms: habitaciones,
      ...(edadesNinos.length > 0 ? { children: edadesNinos } : {}),
    },
  });
  return data.data;
}

export async function getAlojamiento(id) {
  const { data } = await api.get(`/alojamientos/${id}`);
  return data;
}

export async function getDisponibilidadAlojamiento(id, params = {}) {
  const checkinVal = typeof params === 'string' ? params : (params?.checkin || params?.date);
  const checkoutVal = typeof params === 'object' ? params?.checkout : undefined;
  const { data } = await api.get(`/alojamientos/${id}/availability`, {
    params: {
      checkin: checkinVal,
      checkout: checkoutVal,
      date: checkinVal,
    },
  });
  return data;
}

/**
 * Reserva directa. Con sesión iniciada se envía el token: la reserva queda
 * vinculada a la cuenta (aparece en "Mis reservas" aunque se use otro correo).
 * Sin sesión se reserva como invitado, como en Booking.
 */
export async function reservarAlojamiento(id, reservationData, idempotencyKey) {
  const token = await obtenerAccessToken().catch(() => null);
  // El Saga hacia el socio (sincronizar cliente + cotizar + crear la orden + guardar la
  // copia) tarda más que una lectura: con 8 s se cortaba por timeout aunque el hotel SÍ
  // reservaba, y el reintento con otra clave agotaba el cupo. Se da margen holgado.
  const { data } = await api.post(`/alojamientos/${id}/reservations`, reservationData, {
    timeout: 45000,
    headers: {
      'idempotency-key': idempotencyKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return data;
}

/**
 * "Mis reservas": requiere sesión. El backend devuelve solo las reservas del
 * cliente de la sesión (un administrador ve todas).
 */
export async function getReservasAlojamientos() {
  const token = await obtenerAccessToken();
  if (!token) return [];
  const { data } = await api.get('/alojamientos/reservations', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// ── Gestión del catálogo (panel de administración) ───────────────────────────
// Van por el cliente AUTENTICADO (`apiAuth`), que añade el token del admin:
// el backend rechaza estas operaciones sin sesión de administrador.

/** Catálogo completo para el panel: incluye inactivos, origen y reservas pendientes. */
export async function getCatalogoGestion(filtros = {}) {
  const { data } = await apiAuth.get('/alojamientos/gestion/catalogo', { params: filtros });
  return data;
}

export async function crearAlojamiento(alojamientoData) {
  const { data } = await apiAuth.post('/alojamientos', alojamientoData);
  return data;
}

export async function actualizarAlojamiento(id, partialData) {
  const { data } = await apiAuth.patch(`/alojamientos/${encodeURIComponent(id)}`, partialData);
  return data;
}

export async function eliminarAlojamiento(id) {
  const { data } = await apiAuth.delete(`/alojamientos/${encodeURIComponent(id)}`);
  return data;
}

/** Sincroniza un lote de alojamientos de un proveedor (el admin indica el proveedor). */
export async function sincronizarAlojamientos(proveedorId, alojamientos) {
  const { data } = await apiAuth.post('/alojamientos/sincronizar', { proveedorId, alojamientos });
  return data;
}

// ── Tipos de habitación (panel) ──────────────────────────────────────────────

export async function crearTipoHabitacion(alojamientoId, tipo) {
  const { data } = await apiAuth.post(`/alojamientos/${encodeURIComponent(alojamientoId)}/tipos-habitacion`, tipo);
  return data;
}

export async function actualizarTipoHabitacion(alojamientoId, tipoId, cambios) {
  const { data } = await apiAuth.patch(
    `/alojamientos/${encodeURIComponent(alojamientoId)}/tipos-habitacion/${encodeURIComponent(tipoId)}`,
    cambios,
  );
  return data;
}

/** Con reservas el backend lo desactiva (conserva el historial): responde { desactivado }. */
export async function eliminarTipoHabitacion(alojamientoId, tipoId) {
  const { data } = await apiAuth.delete(
    `/alojamientos/${encodeURIComponent(alojamientoId)}/tipos-habitacion/${encodeURIComponent(tipoId)}`,
  );
  return data;
}

// ── Proveedores (panel, solo administradores) ───────────────────────────────

export async function getProveedores() {
  const { data } = await apiAuth.get('/alojamientos/gestion/proveedores');
  return data;
}

/** Devuelve `api_key` UNA sola vez: hay que mostrársela al admin para que la copie. */
export async function crearProveedor(proveedor) {
  const { data } = await apiAuth.post('/alojamientos/gestion/proveedores', proveedor);
  return data;
}

export async function actualizarProveedor(id, cambios) {
  const { data } = await apiAuth.patch(`/alojamientos/gestion/proveedores/${encodeURIComponent(id)}`, cambios);
  return data;
}

export async function rotarClaveProveedor(id) {
  const { data } = await apiAuth.post(`/alojamientos/gestion/proveedores/${encodeURIComponent(id)}/rotar-clave`);
  return data;
}

export async function eliminarProveedor(id) {
  await apiAuth.delete(`/alojamientos/gestion/proveedores/${encodeURIComponent(id)}`);
}
