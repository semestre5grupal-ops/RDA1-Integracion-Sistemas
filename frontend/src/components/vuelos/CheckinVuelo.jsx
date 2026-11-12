import { useEffect, useMemo, useState } from 'react';
import { useDetalleVuelo } from '../../hooks/useDetalleVuelo';
import { listarPases } from '../../services/vuelosApi';
import { SpinnerVuelos } from '../SpinnerVuelos';
import { CSS_PASE, descargarPasesPdf, PaseAbordar } from './PaseAbordar';
import { fechaLarga, hora } from './formatoVuelo';

/** "faltan 3 h 12 min" hasta `fecha`, actualizado cada 30 s. */
function useFaltan(fecha) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!fecha) return undefined;
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [fecha]);
  if (!fecha) return null;
  const min = Math.max(0, Math.round((fecha.getTime() - ahora) / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Check-in de vuelos en tres pasos: revisar datos → confirmar → pase de abordar.
 * Solo es la pantalla: el check-in lo hace `onCheckin` (el mismo de siempre).
 */
export function CheckinVuelo({ reserva, ventana, procesando, etapa, resultado, onCheckin }) {
  const { cargando, datos } = useDetalleVuelo(reserva?.id, reserva?.raw);
  const [acepto, setAcepto] = useState(false);
  const [pasesAerolinea, setPasesAerolinea] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const hecho = resultado?.success || ['CHECKED_IN', 'CONFIRMADO_ASISTIDO'].includes(String(reserva?.status).toUpperCase());
  const paso = hecho ? 3 : acepto ? 2 : 1;
  const faltan = useFaltan(ventana?.estado === 'antes' ? ventana.abre : null);

  // Tras el check-in: pases de la aerolínea, si los entrega.
  useEffect(() => {
    if (!hecho || !reserva?.id) return;
    listarPases(reserva.id)
      .then((r) => setPasesAerolinea(Array.isArray(r?.boardingPasses) ? r.boardingPasses : []))
      .catch(() => setPasesAerolinea([]));
  }, [hecho, reserva?.id]);

  const pases = useMemo(() => {
    if (!hecho || !datos) return [];
    const asientosResultado = String(resultado?.asiento || '').split(',').map((s) => s.trim()).filter((s) => /^[0-9]{1,2}[A-Z]$/.test(s));
    const out = [];
    datos.pasajeros.forEach((p, i) => {
      (datos.tramos.length ? datos.tramos : [{ id: '_', vuelo: '—', origen: reserva?.raw?.origin, destino: reserva?.raw?.destination }]).forEach((t) => {
        const deAerolinea = (pasesAerolinea ?? []).find((b) => b.segmentId === t.id && (!b.passengerId || b.passengerId === p.id))
          || (datos.pasajeros.length === 1 ? (pasesAerolinea ?? []).find((b) => b.segmentId === t.id) : null);
        out.push({
          aerolinea: datos.aerolinea,
          pasajero: p.nombre,
          vuelo: deAerolinea?.flightNumber || t.vuelo,
          origen: deAerolinea?.departureIataCode || t.origen,
          destino: deAerolinea?.arrivalIataCode || t.destino,
          salida: deAerolinea?.departureAt || t.salida,
          llegada: deAerolinea?.arrivalAt || t.llegada,
          asiento: deAerolinea?.seat || p.asientos[t.id] || asientosResultado[i] || 'Asignado en puerta',
          grupo: deAerolinea?.boardingGroup || null,
          pnr: datos.pnr,
          codigo: deAerolinea?.barcode || `${datos.pnr}|${p.nombre}|${t.vuelo}|${p.asientos[t.id] || ''}`,
          desdeAerolinea: !!deAerolinea?.barcode,
        });
      });
    });
    return out;
  }, [hecho, datos, pasesAerolinea, resultado, reserva]);

  const antes = ventana?.estado === 'antes';
  const cerrado = ventana?.estado === 'cerrado';

  return (
    <div className="cv">
      <style>{CSS}{CSS_PASE}</style>
      <ol className="cv-pasos" aria-label="Pasos del check-in">
        {['Revisa tus datos', 'Confirma', 'Pase de abordar'].map((t, i) => (
          <li key={t} className={paso > i + 1 ? 'cv-ok' : paso === i + 1 ? 'cv-actual' : ''}>
            <span>{paso > i + 1 ? '✓' : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {!hecho && (
        <>
          <div className="cv-caja">
            <div className="cv-titulo">Tu vuelo</div>
            {cargando ? <div className="cv-hueso" /> : (datos?.tramos ?? []).map((t) => (
              <div key={t.id} className="cv-vuelo">
                <b>{t.vuelo}</b>
                <span>{t.origen} {hora(t.salida)} → {t.destino} {hora(t.llegada)}</span>
                <small>{fechaLarga(t.salida)}</small>
              </div>
            ))}
            <div className="cv-titulo" style={{ marginTop: 10 }}>Pasajeros</div>
            {cargando ? <div className="cv-hueso" /> : (datos?.pasajeros ?? []).map((p) => (
              <div key={p.id} className="cv-pax">
                <span>{p.nombre} <small>· {p.tipo} · Doc. {p.documento}</small></span>
                <b>{Object.values(p.asientos).join(', ') || 'Asiento por asignar'}</b>
              </div>
            ))}
          </div>

          {antes && (
            <div className="cv-aviso" role="note">
              🕑 El check-in abre el <strong>{ventana.texto}</strong> (48 h antes de la salida){faltan ? <> · faltan <strong>{faltan}</strong></> : null}.
            </div>
          )}
          {cerrado && <div className="cv-aviso cv-mal" role="note">El check-in en línea de este vuelo ya cerró. Acércate al counter de la aerolínea.</div>}
          {resultado?.success === false && <div className="cv-aviso cv-mal" role="alert">{resultado.mensaje}</div>}

          <label className={`cv-acepto ${antes || cerrado ? 'cv-off' : ''}`}>
            <input type="checkbox" checked={acepto} disabled={antes || cerrado || procesando} onChange={(e) => setAcepto(e.target.checked)} />
            <span>Confirmo que los datos coinciden con mi documento de viaje y que no llevo artículos prohibidos en mi equipaje.</span>
          </label>

          <button type="button" className="cv-boton" onClick={onCheckin} disabled={!acepto || procesando || antes || cerrado}>
            {procesando ? <><SpinnerVuelos />{etapa || 'Haciendo check-in…'}</> : antes ? 'Check-in aún no disponible' : '🎫 Hacer check-in'}
          </button>
        </>
      )}

      {hecho && (
        <>
          <div className="cv-exito">
            <span aria-hidden="true">✓</span>
            <div><b>¡Check-in listo!</b><small>Presenta tu pase y tu documento en la puerta de embarque. El embarque cierra 20 min antes de la salida.</small></div>
          </div>
          <div className="cv-pases">
            {pases.length ? pases.map((p, i) => <PaseAbordar key={i} pase={p} />) : <div className="cv-hueso" style={{ height: 160 }} />}
          </div>
          {pases.length > 0 && (
            <button
              type="button"
              className="cv-boton"
              disabled={descargando}
              onClick={async () => { setDescargando(true); try { await descargarPasesPdf(pases, datos?.pnr); } finally { setDescargando(false); } }}
            >
              {descargando ? <><SpinnerVuelos />Generando PDF…</> : `⬇ Descargar ${pases.length > 1 ? 'pases' : 'pase'} (PDF)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.cv{flex-shrink:0;display:flex;flex-direction:column;gap:12px}
.cv-pasos{list-style:none;display:flex;gap:6px;margin:0 0 4px;padding:0}
.cv-pasos li{flex:1;display:flex;align-items:center;gap:6px;font-size:.78rem;color:#94a3b8;font-weight:600;padding-bottom:8px;border-bottom:3px solid #e6ebf2}
.cv-pasos li span{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e6ebf2;color:#64748b;font-size:.75rem;flex-shrink:0}
.cv-pasos li.cv-actual{color:#003580;border-color:#006ce4}
.cv-pasos li.cv-actual span{background:#006ce4;color:#fff}
.cv-pasos li.cv-ok{color:#0d7a2f;border-color:#0d7a2f}
.cv-pasos li.cv-ok span{background:#0d7a2f;color:#fff}
.cv-caja{border:1px solid #e6ebf2;border-radius:12px;padding:12px 14px;background:#f8fafc}
.cv-titulo{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#003580;margin-bottom:6px}
.cv-vuelo{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;font-size:.9rem}
.cv-vuelo b{color:#003580}.cv-vuelo small{color:#64748b}
.cv-pax{display:flex;justify-content:space-between;gap:10px;font-size:.88rem;padding:4px 0;border-top:1px solid #eef2f7}
.cv-pax:first-of-type{border-top:0}
.cv-pax small{color:#64748b}
.cv-aviso{background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;padding:10px 12px;border-radius:8px;font-size:.86rem}
.cv-mal{background:#fef2f2;border-color:#fca5a5;color:#b91c1c}
.cv-acepto{display:flex;gap:10px;align-items:flex-start;font-size:.85rem;color:#334155;cursor:pointer;line-height:1.35}
.cv-acepto input{width:18px;height:18px;margin-top:1px;accent-color:#006ce4;flex-shrink:0}
.cv-off{opacity:.55;cursor:not-allowed}
.cv-boton{width:100%;background:#006ce4;color:#fff;border:0;padding:12px;border-radius:8px;font-weight:700;font-size:.95rem;cursor:pointer}
.cv-boton:disabled{background:#94a3b8;cursor:not-allowed}
.cv-exito{display:flex;gap:12px;align-items:center;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:12px 14px}
.cv-exito>span{width:34px;height:34px;border-radius:50%;background:#0d7a2f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0}
.cv-exito b{display:block;color:#065f46}.cv-exito small{color:#047857;font-size:.8rem}
.cv-pases{display:flex;flex-direction:column;gap:10px}
.cv-hueso{height:44px;border-radius:8px;background:linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%);background-size:200% 100%;animation:cv-b 1.2s infinite}
@keyframes cv-b{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (max-width:480px){.cv-pasos li{font-size:.7rem}}
`;
