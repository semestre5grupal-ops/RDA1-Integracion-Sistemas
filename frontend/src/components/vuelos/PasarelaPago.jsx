import { useState } from 'react';
import { formatearMoneda } from '../../services/formato';
import { totalBooking } from '../../utils/precioBooking';

const marcaDe = (n) => (/^4/.test(n) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(n) ? 'MASTERCARD' : /^3[47]/.test(n) ? 'AMEX' : '');

/**
 * Paso de pago con aspecto de pasarela: resumen de la compra + tarjeta.
 * Es solo la vista: los datos de la tarjeta no se envían a ningún lado
 * (la demo referencia el pago, no lo procesa); el botón "Pagar" sigue siendo
 * el del formulario, con la misma lógica.
 */
export function PasarelaPago({ hold, lista }) {
  const [numero, setNumero] = useState('4111111111111111');
  const [nombre, setNombre] = useState(() => {
    const p = (lista ?? []).find((x) => x.passengerType !== 'INFANT') ?? lista?.[0];
    return `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim().toUpperCase() || 'NOMBRE APELLIDO';
  });
  const [venc, setVenc] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [girada, setGirada] = useState(false);

  const moneda = hold?.bookingPrice?.currency ?? hold?.lockedPrice?.currency;
  const grupos = numero.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const marca = marcaDe(numero.replace(/\D/g, ''));
  const tramos = hold?.tramos ?? [];

  // Enter en un campo de la tarjeta no debe enviar el formulario (pagar).
  const sinEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

  return (
    <div className="pp" onKeyDown={sinEnter}>
      <style>{CSS}</style>
      <section className="pp-resumen" aria-label="Resumen de tu compra">
        <div className="pp-titulo">Resumen de tu compra</div>
        {tramos.map((t) => (
          <div key={t.segmentId} className="pp-vuelo">
            <span className="pp-badge">{t.flightNumber}</span>
            <b>{t.origen} → {t.destino}</b>
            <small>{String(t.cabina || 'ECONOMY').toLowerCase()}</small>
          </div>
        ))}
        <ul className="pp-pax">
          {(lista ?? []).map((p, i) => (
            <li key={p.passengerId ?? i}>
              <span>{`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || `Pasajero ${i + 1}`}</span>
              <small>{Object.values(p.asientos ?? {}).filter(Boolean).join(', ') || (p.passengerType === 'INFANT' ? 'En brazos' : 'Asiento al check-in')}</small>
            </li>
          ))}
        </ul>
        {hold?.bookingPrice && (
          <dl className="pp-desglose">
            <dt>Tarifa aerolínea (impuestos incl.)</dt>
            <dd>{formatearMoneda(hold.bookingPrice.airlineTotal, moneda)}</dd>
            <dt>Cargo por servicio ({hold.bookingPrice.serviceFeePercentage}%)</dt>
            <dd>{formatearMoneda(hold.bookingPrice.serviceFee, moneda)}</dd>
          </dl>
        )}
        <div className="pp-total"><span>Total</span><b>{formatearMoneda(totalBooking(hold), moneda)}</b></div>
      </section>

      <section className="pp-metodo" aria-label="Método de pago">
        <div className="pp-titulo">Método de pago</div>
        <div className="pp-metodos" role="tablist">
          <span className="pp-tab pp-activo" role="tab" aria-selected="true">💳 Tarjeta</span>
          <span className="pp-tab" role="tab" aria-selected="false" aria-disabled="true" title="No disponible en la demo">Transferencia</span>
        </div>

        <div className={`pp-tarjeta ${girada ? 'pp-girada' : ''}`} aria-hidden="true">
          <div className="pp-cara pp-frente">
            <div className="pp-chip" />
            <div className="pp-marca">{marca || 'TARJETA'}</div>
            <div className="pp-num">{grupos || '•••• •••• •••• ••••'}</div>
            <div className="pp-pie"><span>{nombre || 'NOMBRE APELLIDO'}</span><span>{venc || 'MM/AA'}</span></div>
          </div>
          <div className="pp-cara pp-reverso">
            <div className="pp-banda" />
            <div className="pp-cvc"><span>CVC</span><b>{cvc || '•••'}</b></div>
          </div>
        </div>

        <div className="pp-campos">
          <label className="pp-campo pp-ancho">
            <span>Número de tarjeta</span>
            <input inputMode="numeric" autoComplete="off" value={grupos} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 16))} />
          </label>
          <label className="pp-campo pp-ancho">
            <span>Nombre en la tarjeta</span>
            <input autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase().slice(0, 26))} />
          </label>
          <label className="pp-campo">
            <span>Vencimiento</span>
            <input inputMode="numeric" autoComplete="off" placeholder="MM/AA" value={venc}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); setVenc(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }} />
          </label>
          <label className="pp-campo">
            <span>CVC</span>
            <input inputMode="numeric" autoComplete="off" value={cvc} onFocus={() => setGirada(true)} onBlur={() => setGirada(false)}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
        </div>
        <div className="pp-seguro">🔒 Pago seguro · cifrado SSL · <span>Demo: el pago se referencia, no se cobra a la tarjeta</span></div>
      </section>
    </div>
  );
}

const CSS = `
.pp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:16px;margin-top:16px}
.pp section{border:1px solid #e1e6ee;border-radius:14px;padding:16px;background:#fff}
.pp-resumen{background:#f8fafc!important}
.pp-titulo{font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#003580;margin-bottom:10px}
.pp-vuelo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:.92rem}
.pp-vuelo small{color:#64748b;text-transform:capitalize}
.pp-badge{background:#e3edff;color:#003580;font-weight:800;font-size:.75rem;padding:2px 7px;border-radius:6px}
.pp-pax{list-style:none;margin:10px 0;padding:10px 0;border-top:1px solid #e6ebf2;border-bottom:1px solid #e6ebf2;display:flex;flex-direction:column;gap:4px}
.pp-pax li{display:flex;justify-content:space-between;gap:8px;font-size:.86rem}
.pp-pax small{color:#475569;font-weight:700}
.pp-desglose{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:0;font-size:.82rem;color:#475569}
.pp-desglose dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.pp-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:10px;border-top:1px solid #e6ebf2}
.pp-total b{font-size:1.5rem;color:#0f172a;font-variant-numeric:tabular-nums}
.pp-metodos{display:flex;gap:6px;margin-bottom:14px}
.pp-tab{font-size:.82rem;padding:6px 12px;border-radius:99px;border:1px solid #e1e6ee;color:#94a3b8}
.pp-activo{border-color:#006ce4;color:#006ce4;background:#eef5ff;font-weight:700}
.pp-tarjeta{position:relative;width:100%;max-width:320px;aspect-ratio:1.586;margin:0 auto 14px;perspective:900px}
.pp-cara{position:absolute;inset:0;border-radius:14px;padding:16px 18px;color:#fff;backface-visibility:hidden;transition:transform .5s ease;background:linear-gradient(135deg,#003580 0%,#0057b8 55%,#2f8cff 100%);box-shadow:0 10px 24px rgba(0,53,128,.28)}
.pp-reverso{transform:rotateY(180deg);padding:0}
.pp-girada .pp-frente{transform:rotateY(180deg)}
.pp-girada .pp-reverso{transform:rotateY(360deg)}
.pp-chip{width:38px;height:28px;border-radius:6px;background:linear-gradient(135deg,#f6d36b,#c9a227)}
.pp-marca{position:absolute;top:16px;right:18px;font-weight:900;font-style:italic;letter-spacing:.05em;font-size:.9rem}
.pp-num{font-family:ui-monospace,Menlo,monospace;font-size:clamp(.95rem,4.2vw,1.25rem);letter-spacing:.12em;margin-top:22px}
.pp-pie{position:absolute;left:18px;right:18px;bottom:14px;display:flex;justify-content:space-between;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;gap:8px}
.pp-pie span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-banda{height:40px;background:#0b1b33;margin-top:22px}
.pp-cvc{margin:16px 18px 0 auto;width:60%;background:#fff;color:#0f172a;border-radius:4px;padding:6px 10px;display:flex;justify-content:space-between;font-size:.8rem}
.pp-campos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pp-campo{display:flex;flex-direction:column;gap:4px;font-size:.75rem;font-weight:600;color:#475569}
.pp-ancho{grid-column:1/-1}
.pp *{box-sizing:border-box}
.pp section{min-width:0}
.pp-campo{min-width:0}
.pp-campo input{width:100%;min-width:0;border:1px solid #cfd8e3;border-radius:8px;padding:10px 12px;font-size:.95rem;font-family:inherit;color:#0f172a;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}
.pp-campo input:focus{border-color:#006ce4;box-shadow:0 0 0 3px rgba(0,108,228,.15)}
.pp-seguro{margin-top:12px;font-size:.76rem;color:#0d7a2f;font-weight:600}
.pp-seguro span{color:#64748b;font-weight:500}
@media (max-width:720px){.pp{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.pp-cara{transition:none}}
`;
