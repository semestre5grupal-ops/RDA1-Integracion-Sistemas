/**
 * Precios de vuelos que ve el cliente en Booking.
 *
 * Las ofertas traen el precio de la aerolínea. Booking cobra ese precio más su
 * cargo por servicio (el backend lo informa en `bookingFee.percentage` de la
 * búsqueda y lo calcula exacto en el hold como `bookingPrice`). Aquí solo se
 * ajusta lo que se MUESTRA: los ids y selecciones que se envían no cambian, y
 * el monto que se cobra siempre sale del hold.
 */
const r2 = (n) => Math.round(n * 100) / 100;

/** Precio de la aerolínea + cargo por servicio (mismo redondeo que el backend). */
export function conRecargo(valor, pct) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  const p = Number(pct) || 0;
  return r2(r2(n) + r2(n * p / 100));
}

/** Copia de la respuesta de búsqueda con los precios finales de Booking. */
export function aplicarRecargoBusqueda(respuesta) {
  const pct = Number(respuesta?.bookingFee?.percentage) || 0;
  if (!respuesta || !Array.isArray(respuesta.offers) || pct <= 0) return respuesta;
  const precio = (p) => (p && p.total != null
    ? { ...p, airlineTotal: p.total, total: conRecargo(p.total, pct).toFixed(2) }
    : p);
  return {
    ...respuesta,
    offers: respuesta.offers.map((o) => ({
      ...o,
      _recargoPct: pct,
      grandTotal: precio(o.grandTotal),
      itineraries: (o.itineraries ?? []).map((it) => ({
        ...it,
        pricingOptions: (it.pricingOptions ?? []).map((po) => ({
          ...po,
          pricePerPassengerType: (po.pricePerPassengerType ?? []).map((pt) => ({ ...pt, price: precio(pt.price) })),
        })),
      })),
    })),
  };
}

/** Lo que paga el cliente por una reserva/hold: `bookingPrice` si existe. */
export function totalBooking(obj) {
  return obj?.bookingPrice?.total ?? obj?.lockedPrice?.total ?? obj?.grandTotal?.total;
}
