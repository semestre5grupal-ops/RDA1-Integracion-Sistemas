import { formatearMoneda, formatearFecha, extraerHora, extraerFecha } from '../services/formato';
import { conRecargo } from '../utils/precioBooking';
import { useCurrency } from '../hooks/CurrencyContext';

const NOMBRES_CABINA = {
  ECONOMY: 'Económica',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Ejecutiva',
  FIRST: 'Primera Clase',
};

export function ResumenViaje({ oferta, tarifaSeleccionada, pasajeros, onContinuar, onModificar }) {
  const { currency } = useCurrency();
  if (!oferta) return null;

  const ida = oferta.itineraries?.[0];
  const vuelta = oferta.itineraries?.[1];

  const renderItinerario = (itinerario, tipoLabel) => {
    if (!itinerario) return null;
    const primerSegmento = itinerario.segments?.[0];
    const ultimoSegmento = itinerario.segments?.[itinerario.segments.length - 1];
    const tarifa = tarifaSeleccionada || itinerario.pricingOptions?.[0];

    const fechaIso = extraerFecha(primerSegmento?.departure?.at);
    const fechaTexto = formatearFecha(fechaIso);
    const horaSalida = extraerHora(primerSegmento?.departure?.at);
    const horaLlegada = extraerHora(ultimoSegmento?.arrival?.at);
    const origen = primerSegmento?.departure?.iataCode || '---';
    const destino = ultimoSegmento?.arrival?.iataCode || '---';
    const cabinaRaw = tarifa?.cabinClass || 'ECONOMY';
    const cabinaLabel = NOMBRES_CABINA[cabinaRaw] || cabinaRaw;
    const carrier = primerSegmento?.carrierCode || oferta.airline?.code || '';
    const flightNum = primerSegmento?.flightNumber || '';
    const vueloInfo = carrier && flightNum ? `${carrier} ${flightNum}` : (oferta.airline?.name || null);

    return (
      <div className="resumen-flight-block" key={tipoLabel}>
        <div className="resumen-flight-badge-row">
          <span className="resumen-type-pill">{tipoLabel}</span>
          <span className="resumen-flight-date">{fechaTexto}</span>
          {vueloInfo && <span className="resumen-flight-number">Vuelo {vueloInfo}</span>}
        </div>

        <div className="resumen-flight-route-row">
          <div className="resumen-route-times">
            <span className="resumen-time">{horaSalida}</span>
            <span className="resumen-iata">{origen}</span>
            <span className="resumen-arrow">→</span>
            <span className="resumen-time">{horaLlegada}</span>
            <span className="resumen-iata">{destino}</span>
          </div>

          <span className={`resumen-fare-pill fare-${cabinaRaw.toLowerCase()}`}>
            {cabinaLabel}
          </span>
        </div>
      </div>
    );
  };

  let totalCalculado = oferta.grandTotal?.total;

  if (tarifaSeleccionada && tarifaSeleccionada.pricePerPassengerType) {
    let sum = 0;
    const pCounts = pasajeros || { adults: 1 };
    
    tarifaSeleccionada.pricePerPassengerType.forEach(pt => {
       const tipo = pt.passengerType;
       const count = (tipo === 'ADULT' ? pCounts.adults :
                      tipo === 'YOUTH' ? pCounts.youths :
                      tipo === 'CHILD' ? pCounts.children :
                      tipo === 'INFANT' ? pCounts.infants : 0) || 0;
       
       // Se suma el precio de la aerolínea y el cargo de Booking se aplica una vez
       // al total, como lo calcula el backend en el hold.
       sum += (parseFloat(pt.price.airlineTotal ?? pt.price.total) * count);
    });
    totalCalculado = (oferta._recargoPct ? conRecargo(sum, oferta._recargoPct) : sum).toFixed(2);
  }

  return (
    <div className="resumen-viaje-container">
      <div className="resumen-viaje-card">
        <div className="resumen-viaje-content">
          {/* Informacion relevante del itinerario (compacta y directa) */}
          <div className="resumen-viaje-flights">
            {renderItinerario(ida, 'Vuelo de Ida')}
            {renderItinerario(vuelta, 'Vuelo de Vuelta')}
          </div>

          {/* Precio y botones de accion alineados */}
          <div className="resumen-viaje-total">
            <div className="resumen-price-breakdown">
              <span className="resumen-total-label">Total de tu reserva:</span>
              <div className="resumen-price-wrapper">
                <span className="resumen-total-amount">
                  {formatearMoneda(totalCalculado, oferta.grandTotal?.currency)}
                </span>
                <span className="resumen-currency">{currency}</span>
              </div>
              <span className="resumen-taxes-note">Impuestos y cargos incluidos</span>
            </div>

            <div className="resumen-actions">
              <button 
                type="button" 
                className="resumen-btn-outline" 
                onClick={onModificar}
                title="Regresar para elegir otro vuelo o tarifa"
              >
                ← Regresar
              </button>
              <button 
                type="button" 
                className="resumen-btn-primary" 
                onClick={() => onContinuar(oferta)}
              >
                Continuar →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
