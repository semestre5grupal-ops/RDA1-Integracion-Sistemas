import { useState } from 'react';
import {
  extraerFecha,
  extraerHora,
  formatearFecha,
  formatearMoneda,
} from '../services/formato';
import { FareFamilies } from './FareFamilies';
import { useAuth } from '../hooks/useAuth';
import { ReportModal } from './ReportModal';

const ESTADOS_ES = {
  SCHEDULED: { texto: 'Programado', icono: '🗓️' },
  BOARDING: { texto: 'Embarcando', icono: '🛫' },
  DEPARTED: { texto: 'En vuelo', icono: '✈️' },
  DELAYED: { texto: 'Retrasado', icono: '⏰' },
  ARRIVED: { texto: 'Aterrizado', icono: '🛬' },
  CANCELLED: { texto: 'Cancelado', icono: '❌' },
  DIVERTED: { texto: 'Desviado', icono: '↪️' },
};

function formatearDuracion(minutos) {
  if (typeof minutos !== 'number' || Number.isNaN(minutos)) return '--';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

export function VueloGroupCard({ ofertasGrupo, onSeleccionarTarifa }) {
  const [expandido, setExpandido] = useState(false);
  const { user } = useAuth();
  const [showReportModal, setShowReportModal] = useState(false);

  if (!ofertasGrupo || ofertasGrupo.length === 0) return null;

  // Tomamos la primera oferta para extraer los datos del itinerario,
  // ya que todos en este grupo comparten el mismo vuelo.
  const ofertaBase = ofertasGrupo[0];
  const primerItinerario = ofertaBase.itineraries?.[0];
  const segmentos = primerItinerario?.segments ?? [];
  const primerSegmento = segmentos[0];
  const ultimoSegmento = segmentos[segmentos.length - 1];
  
  // Buscar el precio mas barato del grupo para mostrar en la tarjeta colapsada
  const precioMinimo = Math.min(
    ...ofertasGrupo.map(o => Number(o.grandTotal?.total) || 0)
  );

  const estado = primerSegmento ? ESTADOS_ES[primerSegmento.status] : null;

  return (
    <>
    <article 
      className={`vuelo-card-modern ${expandido ? 'vuelo-card-expanded' : ''}`}
      onClick={() => setExpandido(!expandido)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      <div className="vuelo-card-body" style={{ paddingBottom: expandido ? '10px' : '24px' }}>
        <div className="vuelo-route-row" style={{ marginBottom: 0, alignItems: 'center' }}>
          
          <div style={{ flex: 1, position: 'relative' }}>
            <h3 className="vuelo-route-title" style={{ marginTop: user ? '20px' : '0' }}>
              {extraerHora(primerSegmento?.departure.at)} {primerSegmento?.departure.iataCode} 
            </h3>
            <p className="vuelo-route-desc" style={{fontWeight:"bold", marginTop:"2px", color:"#003087"}}>{formatearFecha(extraerFecha(primerSegmento?.departure.at))}</p>
            <p className="vuelo-route-desc">
              Operado por {ofertaBase.airline?.name ?? 'Aerolínea'}
            </p>
          </div>

          <div className="vuelo-timeline" style={{ flex: 2 }}>
            <div className="vuelo-line-container" style={{ flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, marginBottom: '4px' }}>
                {primerItinerario?.stopsCount === 0 ? 'Directo' : `${primerItinerario?.stopsCount} escala(s)`} | {formatearDuracion(primerItinerario?.totalDurationMinutes)}
              </span>
              <div className="vuelo-line-dashed">
                <span className="vuelo-plane-icon">✈️</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, textAlign: 'right' }}>
            <h3 className="vuelo-route-title">
               {extraerHora(ultimoSegmento?.arrival.at)} {ultimoSegmento?.arrival.iataCode}
            </h3>
            <p className="vuelo-route-desc" style={{fontWeight:"bold", marginTop:"2px", color:"#003087"}}>{formatearFecha(extraerFecha(ultimoSegmento?.arrival.at))}</p>
          </div>

          <div className="vuelo-price-minimo">
            <span className="vuelo-price-label">Desde</span>
            <span className="vuelo-price-amount">
              {formatearMoneda(precioMinimo.toString(), ofertaBase.grandTotal?.currency)}
            </span>
          </div>

        </div>
      </div>

      {expandido && (
        <div className="vuelo-card-fares-wrapper">
          <FareFamilies 
            ofertas={ofertasGrupo} 
            onSeleccionarTarifa={onSeleccionarTarifa} 
          />
        </div>
      )}
    </article>

    <ReportModal 
      isOpen={showReportModal} 
      onClose={() => setShowReportModal(false)} 
      entityName={`Vuelo operado por ${ofertaBase.airline?.name ?? 'Aerolínea'}`} 
      pnrOrId={ofertaBase?.id || 'VUELO'} 
      type="Vuelo" 
    />
    </>
  );
}
