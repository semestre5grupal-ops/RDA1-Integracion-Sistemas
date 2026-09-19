import axios from 'axios';

// URL de tu backend NestJS
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
});

/**
 * Obtiene el listado paginado de atracciones desde nuestro NestJS (BFF)
 * que a su vez consulta la API externa del compañero.
 */
export async function getAtracciones({ page = 1, limit = 10 } = {}) {
  const { data } = await api.get('/atracciones', { params: { page, limit } });
  return data;
}

/**
 * Obtiene el detalle de una atracción por su ID
 */
export async function getAtraccion(id) {
  const { data } = await api.get(`/atracciones/${id}`);
  return data;
}
