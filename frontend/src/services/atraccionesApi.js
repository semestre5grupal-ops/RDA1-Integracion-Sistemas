import { api } from './api';

/**
 * Servicio de Atracciones.
 *
 * Usa la instancia global de `services/api.ts` en lugar de crear una propia.
 * Asi todas las peticiones heredan el interceptor de JWT y la politica de
 * refresco ante 401, en lugar de quedar aisladas del esquema de autenticacion.
 */
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
    },
    timeout: 45000
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

export async function getReservas(email) {
  const url = email ? `/atracciones/reservations?email=${encodeURIComponent(email)}` : '/atracciones/reservations';
  const { data } = await api.get(url);
  return data;
}

export async function getCategoriasArbol() {
  try {
    const { data } = await api.get('/atracciones/categorias/arbol');
    return data;
  } catch (err) {
    return [
      { id: 'cat-1', nombre: 'Tours y Experiencias', incluye_guia: true, subcategorias: [{ id: 'sub-1', nombre: 'Tours a pie' }, { id: 'sub-2', nombre: 'Tours gastronómicos' }] },
      { id: 'cat-2', nombre: 'Museos y Cultura', incluye_guia: false, subcategorias: [{ id: 'sub-3', nombre: 'Galerías' }, { id: 'sub-4', nombre: 'Monumentos históricos' }] },
      { id: 'cat-3', nombre: 'Naturaleza y Aventura', incluye_transporte: true, subcategorias: [{ id: 'sub-5', nombre: 'Volcanes' }, { id: 'sub-6', nombre: 'Senderismo' }] }
    ];
  }
}

export async function getCategoriasPlanas(padreId) {
  try {
    const { data } = await api.get('/atracciones/categorias', { params: { padre_id: padreId } });
    return data;
  } catch (err) {
    return [];
  }
}

export async function getDisponibilidadAtraccion(id, date) {
  try {
    const { data } = await api.get(`/atracciones/${id}/disponibilidad`, { params: { date } });
    return data;
  } catch (err) {
    return [
      { time: '09:00 a.m.', cupos: 6, estado: 'DISPONIBLE' },
      { time: '11:00 a.m.', cupos: 0, estado: 'AGOTADO' },
      { time: '01:00 p.m.', cupos: 12, estado: 'DISPONIBLE' },
      { time: '03:30 p.m.', cupos: 2, estado: 'ULTIMOS_CUPOS' }
    ];
  }
}

export async function checkinReservaAtraccion(reservaId, { documento, nombreGuia } = {}) {
  const { data } = await api.post(`/atracciones/reservas/${reservaId}/checkin`, {
    documento_identidad: documento,
    guia_asignado: nombreGuia || 'Guía Oficial Certificado',
    hora_checkin: new Date().toISOString()
  });
  return data;
}

export async function cancelarReservaAtraccion(reservaId, reason = 'Cancelación voluntaria por el usuario', idempotencyKey) {
  const key = idempotencyKey || `idem-cancel-${Date.now()}`;
  const { data } = await api.post(`/atracciones/reservations/${reservaId}/cancel`, {
    reason
  }, {
    headers: {
      'idempotency-key': key
    }
  });
  return data;
}
