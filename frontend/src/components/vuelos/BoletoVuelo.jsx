import { useDetalleVuelo } from '../../hooks/useDetalleVuelo';
import { dinero, duracion, ESTADOS_RESERVA, fechaLarga, hora } from './formatoVuelo';

/**
 * Boleto de una reserva de vuelo en Mis Reservas: tramos, pasajeros con su
 * asiento y número de boleto, y el desglose del pago. Los datos vienen del
 * detalle de la aerolínea (GET /vuelos/bookings/{id}); lo que falta se muestra
 * como "por asignar".
 */
export function BoletoVuelo({ reserva }) {
  const { cargando, datos } = useDetalleVuelo(reserva?.id, reserva?.raw);
  const estado = ESTADOS_RESERVA[String(reserva?.status || datos?.estado || '').toUpperCase()] || ESTADOS_RESERVA.CONFIRMED;

  return (
    <div className="bv">
      <style>{CSS}</style>
      <div className="bv-cab">
        <div>
          <div className="bv-etq">Aerolínea</div>
          <div className="bv-aero">✈ {datos?.aerolinea || '…'}</div>
        </div>
        <div className="bv-pnr">
          <div className="bv-etq">Código de reserva (PNR)</div>
          <div className="bv-pnr-cod">{reserva?.pnr || datos?.pnr}</div>
        </div>
        <span className="bv-estado" style={{ color: estado.color, background: estado.fondo }}>{estado.texto}</span>
      </div>

      {cargando ? (
        <div className="bv-cuerpo" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="bv-hueso" style={{ height: i ? 60 : 88 }} />)}
        </div>
      ) : (
        <div className="bv-cuerpo">
          {(datos?.tramos ?? []).map((t) => (
            <div key={t.id} className="bv-tramo">
              <div className="bv-tramo-cab">
                <span className="bv-vuelo">{t.vuelo}</span>
                <span className="bv-fecha">{fechaLarga(t.salida)}</span>
                {t.avion && <span className="bv-avion">{t.avion}</span>}
              </div>
              <div className="bv-ruta">
                <div className="bv-punto">
                  <div className="bv-hora">{hora(t.salida)}</div>
                  <div className="bv-iata">{t.origen}</div>
                  {t.terminal && <div className="bv-term">Terminal {t.terminal}</div>}
                </div>
                <div className="bv-linea">
                  <span>{duracion(t.duracion) || 'Directo'}</span>
                  <div className="bv-raya"><i>✈</i></div>
                  <span>Directo</span>
                </div>
                <div className="bv-punto bv-der">
                  <div className="bv-hora">{hora(t.llegada)}</div>
                  <div className="bv-iata">{t.destino}</div>
                </div>
              </div>
            </div>
          ))}
          {!datos?.tramos?.length && (
            <div className="bv-tramo">
              <div className="bv-ruta">
                <div className="bv-punto"><div className="bv-iata">{reserva?.raw?.origin || '—'}</div></div>
                <div className="bv-linea"><div className="bv-raya"><i>✈</i></div></div>
                <div className="bv-punto bv-der"><div className="bv-iata">{reserva?.raw?.destination || reserva?.destino}</div></div>
              </div>
              <div className="bv-nota">Salida: {reserva?.fechaEntrega || 'por confirmar'}</div>
            </div>
          )}

          <div className="bv-corte" aria-hidden="true" />

          <div className="bv-seccion">Pasajeros</div>
          <div className="bv-pax-lista">
            {(datos?.pasajeros ?? []).map((p) => (
              <div key={p.id} className="bv-pax">
                <div className="bv-pax-nombre">{p.nombre}<span>{p.tipo} · Doc. {p.documento}</span></div>
                <div className="bv-pax-datos">
                  {(datos.tramos.length ? datos.tramos : [{ id: '_', vuelo: '' }]).map((t) => (
                    <div key={t.id} className="bv-asiento">
                      <span className="bv-etq">{datos.tramos.length > 1 ? `Asiento ${t.vuelo}` : 'Asiento'}</span>
                      <strong>{p.asientos[t.id] || 'Por asignar'}</strong>
                    </div>
                  ))}
                  <div className="bv-asiento">
                    <span className="bv-etq">Boleto electrónico</span>
                    <strong className="bv-mono">{p.eTicket || 'En emisión'}</strong>
                  </div>
                </div>
              </div>
            ))}
            {!datos?.pasajeros?.length && <div className="bv-nota">{reserva?.cantidadTexto || '1 pasajero'} · los datos del pasajero los tiene la aerolínea.</div>}
          </div>

          <div className="bv-seccion">Pago</div>
          <dl className="bv-pago">
            {datos?.precio?.aerolinea != null && datos?.precio?.cargo != null && (
              <>
                <dt>Tarifa de la aerolínea</dt><dd>{dinero(datos.precio.aerolinea, datos.precio.moneda)}</dd>
                <dt>Cargo por servicio Booking{datos.precio.pct != null ? ` (${datos.precio.pct}%)` : ''}</dt><dd>{dinero(datos.precio.cargo, datos.precio.moneda)}</dd>
              </>
            )}
            <dt className="bv-total">Total pagado</dt><dd className="bv-total">{dinero(datos?.precio?.total ?? reserva?.totalRaw, datos?.precio?.moneda)}</dd>
          </dl>
          <div className="bv-refs">
            <span>Reservado el {reserva?.fechaReserva || fechaLarga(datos?.creada)}</span>
            {datos?.referenciaPago && <span>Pago <code>{datos.referenciaPago}</code></span>}
            {datos?.factura && <span>Factura <code>{datos.factura}</code></span>}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.bv{border:1px solid #dbe3ee;border-radius:14px;overflow:hidden;background:#fff;color:#0f172a}
.bv-cab{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:linear-gradient(120deg,#003580,#0057b8);color:#fff;padding:16px 18px}
.bv-cab .bv-etq{color:#c7d8f2}
.bv-aero{font-weight:700;font-size:1rem}
.bv-pnr{margin-left:auto;text-align:right}
.bv-pnr-cod{font-family:ui-monospace,Menlo,monospace;font-size:1.35rem;font-weight:800;letter-spacing:2px}
.bv-estado{font-size:.75rem;font-weight:700;padding:4px 10px;border-radius:99px}
.bv-etq{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:600}
.bv-cuerpo{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.bv-tramo{border:1px solid #e6ebf2;border-radius:12px;padding:12px 14px}
.bv-tramo-cab{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.82rem;color:#475569;margin-bottom:8px}
.bv-vuelo{font-weight:800;color:#003580;background:#eef4ff;padding:2px 8px;border-radius:6px}
.bv-avion{margin-left:auto;color:#94a3b8}
.bv-ruta{display:flex;align-items:center;gap:12px}
.bv-punto{min-width:64px}
.bv-der{text-align:right}
.bv-hora{font-size:1.35rem;font-weight:800;font-variant-numeric:tabular-nums}
.bv-iata{font-weight:700;color:#334155;letter-spacing:.05em}
.bv-term{font-size:.72rem;color:#94a3b8}
.bv-linea{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:.72rem;color:#64748b}
.bv-linea span:last-child{display:none}
.bv-raya{position:relative;width:100%;height:2px;background:repeating-linear-gradient(90deg,#94a3b8 0 6px,transparent 6px 10px)}
.bv-raya i{position:absolute;left:50%;top:50%;transform:translate(-50%,-55%);font-style:normal;color:#006ce4;background:#fff;padding:0 4px}
.bv-corte{height:0;border-top:2px dashed #dbe3ee;margin:4px -18px;position:relative}
.bv-seccion{font-size:.8rem;font-weight:800;color:#003580;text-transform:uppercase;letter-spacing:.06em}
.bv-pax-lista{display:flex;flex-direction:column;gap:8px}
.bv-pax{background:#f8fafc;border:1px solid #e6ebf2;border-radius:10px;padding:10px 12px}
.bv-pax-nombre{font-weight:700;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.bv-pax-nombre span{font-weight:500;color:#64748b;font-size:.8rem}
.bv-pax-datos{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:6px}
.bv-asiento strong{font-size:1rem}
.bv-mono{font-family:ui-monospace,Menlo,monospace;font-size:.9rem!important}
.bv-pago{display:grid;grid-template-columns:1fr auto;gap:4px 16px;margin:0;font-size:.9rem}
.bv-pago dt{color:#475569}.bv-pago dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.bv-pago .bv-total{font-weight:800;color:#0f172a;font-size:1.05rem;padding-top:8px;margin-top:4px;border-top:1px solid #e6ebf2}
.bv-pago dt.bv-total{padding-right:16px;margin-right:-16px}
.bv-refs{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.75rem;color:#64748b}
.bv-refs code{font-size:.75rem;color:#334155}
.bv-nota{font-size:.82rem;color:#64748b}
.bv-hueso{border-radius:10px;background:linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%);background-size:200% 100%;animation:bv-b 1.2s infinite}
@keyframes bv-b{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (max-width:520px){.bv-pnr{margin-left:0;text-align:left}.bv-hora{font-size:1.1rem}}
@media (prefers-reduced-motion:reduce){.bv-hueso{animation:none}}
`;
