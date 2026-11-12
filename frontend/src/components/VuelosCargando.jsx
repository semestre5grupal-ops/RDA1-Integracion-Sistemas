import { useEffect, useState } from 'react';
import { useEtapasCarga } from '../hooks/useEtapasCarga';

const AEROLINEAS = ['EcoAirlines', 'Vuelos EQ10', 'GabatAIR', 'Quinde Vuelos', 'RAM Alliance'];
const ETAPAS = [
  'Consultando a las aerolíneas socias…',
  'Revisando disponibilidad de asientos…',
  'Comparando precios y tarifas…',
  'Ordenando las mejores opciones para ti…',
];

/**
 * Pantalla de carga de la búsqueda de vuelos: barra de progreso, mensajes por
 * etapas, aerolíneas que se van marcando y tarjetas esqueleto con la forma de
 * los resultados. Es solo visual: no espera a ninguna aerolínea en particular.
 */
export function VuelosCargando() {
  const etapa = useEtapasCarga(true, ETAPAS, 900);
  const [listas, setListas] = useState(0);
  const [progreso, setProgreso] = useState(8);

  useEffect(() => {
    const a = setInterval(() => setListas((n) => Math.min(n + 1, AEROLINEAS.length - 1)), 450);
    // Avanza rápido al principio y cada vez más lento, sin llegar nunca al 100 %.
    const p = setInterval(() => setProgreso((x) => Math.min(92, x + (92 - x) * 0.12)), 200);
    return () => { clearInterval(a); clearInterval(p); };
  }, []);

  return (
    <div className="vc" role="status" aria-live="polite">
      <style>{CSS}</style>
      <div className="vc-cabecera">
        <div className="vc-titulo">{etapa}</div>
        <div className="vc-barra"><div className="vc-barra-relleno" style={{ width: `${progreso}%` }} /></div>
        <ul className="vc-aerolineas" aria-label="Aerolíneas consultadas">
          {AEROLINEAS.map((a, i) => (
            <li key={a} className={i < listas ? 'vc-ok' : 'vc-esperando'}>
              <span aria-hidden="true">{i < listas ? '✓' : '•'}</span> {a}
            </li>
          ))}
        </ul>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="vc-tarjeta" aria-hidden="true" style={{ animationDelay: `${i * 120}ms` }}>
          <div className="vc-col">
            <div className="vc-hueso vc-logo" />
            <div className="vc-hueso" style={{ width: 90 }} />
          </div>
          <div className="vc-col vc-ruta">
            <div className="vc-hueso vc-hora" />
            <div className="vc-linea" />
            <div className="vc-hueso vc-hora" />
          </div>
          <div className="vc-col vc-precio">
            <div className="vc-hueso" style={{ width: 70, height: 22 }} />
            <div className="vc-hueso" style={{ width: 110, height: 34, borderRadius: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const CSS = `
.vc{display:flex;flex-direction:column;gap:14px;max-width:100%}
.vc-cabecera{background:#fff;border:1px solid #e6eaf0;border-radius:12px;padding:16px 18px}
.vc-titulo{font-weight:700;color:#1a1a2e;font-size:1rem;margin-bottom:10px;min-height:1.3em}
.vc-barra{height:6px;background:#eef2f7;border-radius:99px;overflow:hidden}
.vc-barra-relleno{height:100%;background:linear-gradient(90deg,#006ce4,#3b8cff);border-radius:99px;transition:width .2s linear}
.vc-aerolineas{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0}
.vc-aerolineas li{font-size:.8rem;padding:4px 10px;border-radius:99px;border:1px solid #e6eaf0;color:#6b7280;transition:all .25s}
.vc-aerolineas li.vc-ok{background:#e8f5ee;border-color:#b7e1c7;color:#0d7a2f;font-weight:600}
.vc-tarjeta{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff;border:1px solid #e6eaf0;border-radius:12px;padding:18px;animation:vc-entrar .35s ease both}
.vc-col{display:flex;flex-direction:column;gap:8px}
.vc-ruta{flex:1;flex-direction:row;align-items:center;gap:12px}
.vc-precio{align-items:flex-end}
.vc-hueso{height:14px;border-radius:6px;background:linear-gradient(90deg,#eef2f7 25%,#f8fafc 50%,#eef2f7 75%);background-size:200% 100%;animation:vc-brillo 1.2s ease-in-out infinite}
.vc-logo{width:44px;height:44px;border-radius:10px}
.vc-hora{width:56px;height:24px}
.vc-linea{flex:1;height:2px;background:#e6eaf0;border-radius:2px}
@keyframes vc-brillo{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes vc-entrar{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:640px){.vc-tarjeta{flex-wrap:wrap}.vc-ruta{order:3;flex-basis:100%}}
@media (prefers-reduced-motion: reduce){.vc-hueso,.vc-tarjeta{animation:none}.vc-barra-relleno{transition:none}}
`;
