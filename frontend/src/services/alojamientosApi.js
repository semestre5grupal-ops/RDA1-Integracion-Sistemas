import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
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

export async function reservarAlojamiento(id, reservationData, idempotencyKey) {
  const { data } = await api.post(`/alojamientos/${id}/reservations`, reservationData, {
    headers: {
      'idempotency-key': idempotencyKey,
    },
  });
  return data;
}

export async function getReservasAlojamientos() {
  const { data } = await api.get('/alojamientos/reservations');
  return data;
}

export async function crearAlojamiento(alojamientoData) {
  const { data } = await api.post('/alojamientos', alojamientoData);
  return data;
}

export async function actualizarAlojamiento(id, partialData) {
  const { data } = await api.patch(`/alojamientos/${id}`, partialData);
  return data;
}

export async function eliminarAlojamiento(id) {
  const { data } = await api.delete(`/alojamientos/${id}`);
  return data;
}

