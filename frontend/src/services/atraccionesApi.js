import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
});

export async function getAtracciones({ page = 1, limit = 10 } = {}) {
  const { data } = await api.get('/atracciones', { params: { page, limit } });
  return data;
}

export async function getAtraccion(id) {
  const { data } = await api.get(`/atracciones/${id}`);
  return data;
}

export async function reservarAtraccion(id, reservationData, idempotencyKey) {
  const { data } = await api.post(`/atracciones/${id}/reservations`, reservationData, {
    headers: {
      'idempotency-key': idempotencyKey
    }
  });
  return data;
}

export async function crearAtraccion(atraccionData) {
  const { data } = await api.post('/atracciones', atraccionData);
  return data;
}

export async function eliminarAtraccion(id) {
  await api.delete(`/atracciones/${id}`);
}

export async function getReservas() {
  const { data } = await api.get('/atracciones/reservations');
  return data;
}
