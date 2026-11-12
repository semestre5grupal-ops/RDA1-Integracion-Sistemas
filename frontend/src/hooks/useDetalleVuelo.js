import { useEffect, useState } from 'react';
import { obtenerReserva, listarTickets } from '../services/vuelosApi';

/** Nombre comercial de cada aerolínea socia a partir del prefijo del id. */
const AEROLINEAS = {
  NODE_VUE_EQ10: 'Vuelos EQ10',
  NODE_VUE_GABATAIR: 'GabatAIR',
  NODE_VUE_QUINDE: 'Quinde Vuelos',
  NODE_VUE_RAM_ALLI_VHVF: 'RAM Alliance',
  NODE_VUE_ECOAIRLI_K718: 'EcoAirlines',
};

export function nombreAerolinea(bookingId) {
  const nodo = String(bookingId || '').split('~')[0];
  return AEROLINEAS[nodo] || nodo.replace(/^NODE_VUE_/, '').replace(/_/g, ' ') || 'Aerolínea';
}

const TIPOS = { ADULT: 'Adulto', CHILD: 'Niño', YOUTH: 'Joven', INFANT: 'Infante' };

/** Documento enmascarado: solo los últimos 4 caracteres. */
export function enmascarar(doc) {
  const s = String(doc || '').trim();
  if (!s) return '—';
  return s.length <= 4 ? s : `••••${s.slice(-4)}`;
}

const num = (v) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Lleva el detalle de la aerolínea (cada una lo arma un poco distinto) a una
 * forma única para el boleto y el check-in. Todo es opcional: lo que falta se
 * muestra como "por asignar".
 */
export function normalizarDetalleVuelo(detalle, ticketsExtra = [], resumen = {}) {
  const d = detalle || {};
  const tickets = Array.isArray(d.tickets) && d.tickets.length ? d.tickets : ticketsExtra || [];

  const segmentos = (d.itineraries ?? []).flatMap((it) => it?.segments ?? []);
  const segsBase = segmentos.length ? segmentos : tickets.flatMap((t) => t?.segments ?? []).filter((s, i, a) => a.findIndex((x) => x.segmentId === s.segmentId) === i);
  const tramos = segsBase.map((s) => {
    const salida = s.departureAt ?? s.departure?.at ?? null;
    const llegada = s.arrivalAt ?? s.arrival?.at ?? null;
    const dur = num(s.durationMinutes) ?? (salida && llegada ? Math.round((Date.parse(llegada) - Date.parse(salida)) / 60000) : null);
    return {
      id: s.segmentId,
      vuelo: s.flightNumber || '—',
      origen: s.departureIataCode ?? s.departure?.iataCode ?? resumen.origin ?? '—',
      destino: s.arrivalIataCode ?? s.arrival?.iataCode ?? resumen.destination ?? '—',
      salida,
      llegada,
      duracion: dur && dur > 0 ? dur : null,
      avion: s.aircraft || null,
      terminal: s.departure?.terminal || null,
      estado: s.status || null,
    };
  });

  const asientoDeTicket = (paxId, segId) => {
    for (const t of tickets) {
      if (paxId && t.passengerId && t.passengerId !== paxId) continue;
      const seg = (t.segments ?? []).find((x) => x.segmentId === segId);
      if (seg?.seatNumber) return seg.seatNumber;
    }
    return null;
  };

  let pasajeros = (d.passengers ?? []).map((p) => {
    const asientos = {};
    for (const a of p.assignedSeats ?? p.seats ?? []) if (a?.segmentId && a?.seatNumber) asientos[a.segmentId] = a.seatNumber;
    for (const t of tramos) if (!asientos[t.id]) { const s = asientoDeTicket(p.passengerId, t.id); if (s) asientos[t.id] = s; }
    const ticket = tickets.find((t) => t.passengerId === p.passengerId) || (d.passengers.length === 1 ? tickets[0] : null);
    return {
      id: p.passengerId,
      nombre: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Pasajero',
      tipo: TIPOS[String(p.passengerType || '').toUpperCase()] || 'Adulto',
      documento: enmascarar(p.documentNumber),
      asientos,
      eTicket: ticket?.eTicketNumber || null,
    };
  });
  if (!pasajeros.length && tickets.length) {
    pasajeros = tickets.map((t, i) => {
      const asientos = {};
      for (const s of t.segments ?? []) if (s.seatNumber) asientos[s.segmentId] = s.seatNumber;
      return { id: t.passengerId || `pax-${i + 1}`, nombre: t.passengerName || `Pasajero ${i + 1}`, tipo: 'Adulto', documento: '—', asientos, eTicket: t.eTicketNumber || null };
    });
  }

  const bp = d.bookingPrice || resumen.bookingPrice || null;
  const moneda = bp?.currency || d.grandTotal?.currency || resumen.grandTotal?.currency || 'USD';
  const precio = {
    aerolinea: num(bp?.airlineTotal) ?? num(d.grandTotal?.total),
    cargo: num(bp?.serviceFee),
    pct: num(bp?.serviceFeePercentage),
    total: num(bp?.total) ?? num(resumen.grandTotal?.total) ?? num(d.grandTotal?.total),
    moneda,
  };

  return {
    bookingId: d.bookingId || resumen.bookingId,
    pnr: d.pnr || resumen.pnr || '—',
    estado: String(d.status || resumen.status || 'CONFIRMED').toUpperCase(),
    aerolinea: nombreAerolinea(d.bookingId || resumen.bookingId),
    tramos,
    pasajeros,
    precio,
    referenciaPago: d.payment?.paymentReference || d.paymentReference || null,
    factura: d.factura?.numero || resumen.factura?.numero || null,
    creada: d.createdAt || resumen.createdAt || null,
  };
}

/** Detalle de una reserva de vuelo (aerolínea + boletos), normalizado. */
export function useDetalleVuelo(bookingId, resumen) {
  const [estado, setEstado] = useState({ cargando: !!bookingId, error: null, datos: null });
  useEffect(() => {
    if (!bookingId) return undefined;
    let vivo = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    (async () => {
      try {
        const detalle = await obtenerReserva(bookingId);
        let extra = [];
        if (!Array.isArray(detalle?.tickets) || !detalle.tickets.length) {
          extra = (await listarTickets(bookingId).catch(() => null))?.tickets ?? [];
        }
        if (vivo) setEstado({ cargando: false, error: null, datos: normalizarDetalleVuelo(detalle, extra, resumen) });
      } catch (e) {
        // Sin detalle de la aerolínea se muestra lo que Booking ya sabe.
        if (vivo) setEstado({ cargando: false, error: e, datos: normalizarDetalleVuelo(null, [], resumen) });
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  return estado;
}
