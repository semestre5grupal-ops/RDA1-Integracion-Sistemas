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

export async function getAlojamiento(id) {
  const { data } = await api.get(`/alojamientos/${id}`);
  return data;
}

export async function getDisponibilidadAlojamiento(id, date) {
  const { data } = await api.get(`/alojamientos/${id}/availability`, {
    params: { date },
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
