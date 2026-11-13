import { api } from './api';

/**
 * Servicio de Autos (V2 - RDA2).
 * 
 * Conecta con el API Gateway NestJS heredando interceptores de JWT,
 * cabeceras de resiliencia y manejo RFC 7807.
 */

export async function searchAutos(searchParams) {
  const { data } = await api.post('/autos/search', searchParams);
  return data;
}

export async function getCoberturas(autoId) {
  const { data } = await api.get(`/autos/${autoId}/coberturas`);
  return data;
}

export async function getAutoById(autoId) {
  const { data } = await api.get(`/autos/${autoId}`);
  return data;
}

export async function getDepots() {
  const { data } = await api.post('/autos/depots');
  return data;
}

export async function getConstants() {
  const { data } = await api.post('/autos/constants');
  return data;
}

export async function createOrderAuto(reservationData, idempotencyKey) {
  const { data } = await api.post('/autos/orders/create', reservationData, {
    headers: {
      'Idempotency-Key': idempotencyKey,
      'X-Correlation-Id': `corr-order-${Date.now()}`
    }
  });
  return data;
}

export async function checkinAuto(reservaId, checkinData) {
  const { data } = await api.post(`/autos/reservas/${reservaId}/checkin`, checkinData);
  return data;
}

export async function registrarDevolucionAuto(autoId) {
  const { data } = await api.post(`/autos/${autoId}/devolucion`);
  return data;
}

export async function registrarMantenimientoAuto(autoId, mantenimientoData) {
  const { data } = await api.post(`/autos/${autoId}/mantenimiento/registro`, mantenimientoData);
  return data;
}

export async function cancelOrderAuto(orderId, cancelData, idempotencyKey) {
  const { data } = await api.post(`/autos/orders/${orderId}/cancel`, cancelData, {
    headers: {
      'Idempotency-Key': idempotencyKey
    }
  });
  return data;
}

export async function getOrdersAuto(email) {
  const params = email ? { email } : {};
  const { data } = await api.get('/autos/orders', { params });
  return data;
}

export async function createAutoLocal(autoData) {
  const { data } = await api.post('/autos', autoData);
  return data;
}

export async function getFlota() {
  const { data } = await api.get('/autos/flota');
  return data;
}

export async function getPromocionesContratoAutos() {
  const { data } = await api.get('/autos/promociones/contrato');
  return data;
}

export async function updatePromocionesContratoAutos(contratoData) {
  const { data } = await api.put('/autos/promociones/contrato', contratoData);
  return data;
}

