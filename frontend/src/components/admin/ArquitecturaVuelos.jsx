import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Arquitectura real del proceso de vuelos, con cada paso de la traza viajando
 * como un punto entre los componentes que de verdad toca:
 *
 *   Cliente (React) → API Booking /api/v1 (NestJS en Azure) → módulo Vuelos
 *   (agregador) → aerolíneas socias (REST + OAuth2) · módulo Pagos (MS_PAG) →
 *   PostgreSQL + bus de eventos (RabbitMQ) · módulo Facturación → PostgreSQL.
 *
 * Las rutas salen del código (vuelos-socios.middleware.ts, vuelos-eventos.ts,
 * vuelos-socios-reservas.service.ts, vuelos-facturacion.ts, pagos.service.ts):
 * un punto solo se mueve cuando llega un evento real de la traza.
 */

const T = {
  surface: '#ffffff', border: '#d9dde3', text: '#1a1a1a', text2: '#52514e', muted: '#898781',
  azul: '#003580', azulBg: '#eef3fb', ok: '#0d7a2f', warn: '#b26a00', bad: '#b42318', gris: '#c3c2b7',
};
const COLOR_PUNTO = { ok: '#006ce4', aviso: '#e8a400', error: '#d32f2f' };

const W = 1000;
const H = 470;
const SEG_MS = 520; // lo que tarda un punto entre dos componentes

// Componentes fijos (centro x, y). Las aerolíneas se ubican a la derecha.
const BASE = {
  cliente: { x: 85, y: 235, w: 130, h: 64, titulo: 'Cliente', sub: 'Navegador · React (Render)', icono: '🧑‍💻' },
  gateway: { x: 255, y: 235, w: 150, h: 72, titulo: 'API Booking', sub: '/api/v1 · NestJS (Azure)', icono: '🚪' },
  vuelos: { x: 470, y: 110, w: 170, h: 66, titulo: 'Módulo Vuelos', sub: 'agregador de aerolíneas', icono: '✈️' },
  pagos: { x: 470, y: 250, w: 170, h: 66, titulo: 'Módulo Pagos', sub: 'MS_PAG · cobros y reembolsos', icono: '💳' },
  facturas: { x: 690, y: 255, w: 150, h: 66, titulo: 'Facturación', sub: 'factura · NC · comisión', icono: '🧾' },
  bd: { x: 690, y: 395, w: 150, h: 70, titulo: 'PostgreSQL', sub: 'Supabase · copias, pagos, facturas', icono: '🗄️' },
  bus: { x: 470, y: 395, w: 170, h: 62, titulo: 'Bus de eventos', sub: 'RabbitMQ', icono: '📨' },
};

/** Ruta (lista de componentes) que recorre cada paso de la traza. */
function rutaDe(e, aerolineas) {
  const nodo = e.nodo && aerolineas.some((a) => a.codigo === e.nodo) ? `aero:${e.nodo}` : null;
  const aero = nodo || (aerolineas[0] ? `aero:${aerolineas[0].codigo}` : 'vuelos');
  const desdeAerolinea = /^(Cancelada en|Check-in confirmado por)/.test(e.detalle || '');
  switch (e.paso) {
    case 'busqueda':
      return null; // se reparte a todas las aerolíneas (ver rutasDe)
    case 'hold':
    case 'consulta':
      return ['cliente', 'gateway', 'vuelos', aero, 'vuelos', 'gateway', 'cliente'];
    case 'cobro':
    case 'reembolso':
      return ['vuelos', 'pagos', 'bd', 'pagos', 'bus'];
    case 'reserva_aerolinea':
      return ['vuelos', aero, 'vuelos'];
    case 'copia':
      return ['vuelos', 'bd'];
    case 'factura':
      return ['vuelos', 'facturas', 'bd'];
    case 'confirmada':
      return ['vuelos', 'gateway', 'cliente'];
    case 'cancelacion':
      return desdeAerolinea
        ? [aero, 'vuelos', 'pagos', 'bd']
        : ['cliente', 'gateway', 'vuelos', aero, 'vuelos', 'pagos', 'bd'];
    case 'checkin':
      return desdeAerolinea ? [aero, 'vuelos', 'bd'] : ['cliente', 'gateway', 'vuelos', aero, 'vuelos', 'bd'];
    case 'estado_vuelo':
      return ['cliente', 'gateway', 'vuelos', aero, 'vuelos', 'gateway', 'cliente'];
    default:
      return ['cliente', 'gateway', 'vuelos'];
  }
}

/** Uno o varios recorridos por evento (la búsqueda va a todas las aerolíneas a la vez). */
function rutasDe(e, aerolineas) {
  if (e.paso !== 'busqueda') return [{ ruta: rutaDe(e, aerolineas), resultado: e.resultado }];
  const caidas = String(e.detalle || '').split('sin respuesta:')[1] || '';
  if (!aerolineas.length) return [{ ruta: ['cliente', 'gateway', 'vuelos'], resultado: e.resultado }];
  return aerolineas.map((a) => ({
    ruta: ['cliente', 'gateway', 'vuelos', `aero:${a.codigo}`, 'vuelos', 'gateway', 'cliente'],
    resultado: caidas.includes(a.nombre) ? 'error' : 'ok',
    // una aerolínea que no respondió: el punto se queda en ella
    cortarEn: caidas.includes(a.nombre) ? 4 : null,
  }));
}

const ETIQUETA_PASO = {
  busqueda: 'Búsqueda', hold: 'Hold', cobro: 'Cobro', reserva_aerolinea: 'Reserva en aerolínea', copia: 'Copia',
  factura: 'Factura', confirmada: 'Confirmada', reembolso: 'Reembolso', cancelacion: 'Cancelación',
  checkin: 'Check-in', estado_vuelo: 'Estado de vuelo', consulta: 'Consulta',
};

const ARISTAS = [
  ['cliente', 'gateway', 'HTTPS'],
  ['gateway', 'vuelos', ''],
  ['vuelos', 'pagos', 'llamada interna'],
  ['vuelos', 'facturas', ''],
  ['pagos', 'bd', 'SQL'],
  ['facturas', 'bd', 'SQL'],
  ['vuelos', 'bd', 'SQL'],
  ['pagos', 'bus', 'AMQP'],
];

export function ArquitecturaVuelos({ eventos, aerolineas = [], busActivo, reproducir }) {
  const [puntos, setPuntos] = useState([]);
  const [ahora, setAhora] = useState(() => performance.now());
  const vistos = useRef(new Set());
  const proximoInicio = useRef(0);
  const primeraCarga = useRef(true);

  // Posición de cada componente, con las aerolíneas reales en columna a la derecha.
  const comps = useMemo(() => {
    const c = { ...BASE };
    const n = Math.max(aerolineas.length, 1);
    const alto = Math.min(78, 300 / n);
    aerolineas.forEach((a, i) => {
      c[`aero:${a.codigo}`] = {
        x: 905, y: 80 + i * alto, w: 165, h: Math.min(58, alto - 8),
        titulo: a.nombre || a.codigo, sub: a.estado === 'EN_LINEA' ? 'REST + OAuth2 · en línea' : `REST + OAuth2 · ${String(a.estado || '').toLowerCase().replace(/_/g, ' ')}`,
        icono: '🛫', caida: a.estado !== 'EN_LINEA',
      };
    });
    return c;
  }, [aerolineas]);

  const lanzar = (lista) => {
    const t = performance.now();
    let inicio = Math.max(t, proximoInicio.current);
    const nuevos = [];
    lista.forEach((e) => {
      rutasDe(e, aerolineas).forEach((r, k) => {
        const ruta = (r.ruta || []).filter((id) => comps[id]);
        if (ruta.length < 2) return;
        const hasta = r.cortarEn ? ruta.slice(0, r.cortarEn) : ruta;
        nuevos.push({ id: `${e.seq}-${k}-${t}`, ruta: hasta, inicio, resultado: r.resultado, paso: e.paso, detalle: e.detalle, nodo: e.nodo });
      });
      // Los pasos de una misma compra se ven en orden, uno detrás de otro.
      inicio += Math.min(1400, SEG_MS * 1.6);
    });
    proximoInicio.current = inicio;
    if (nuevos.length) setPuntos((p) => [...p.filter((x) => t < x.inicio + (x.ruta.length - 1) * SEG_MS + 900), ...nuevos].slice(-120));
  };

  // Eventos nuevos de la traza → puntos. Al abrir la vista no se reproduce el historial.
  useEffect(() => {
    const nuevos = eventos.filter((e) => !vistos.current.has(e.seq));
    nuevos.forEach((e) => vistos.current.add(e.seq));
    if (primeraCarga.current) {
      primeraCarga.current = false;
      if (eventos.length) return;
    }
    if (nuevos.length) lanzar(nuevos.slice(-25));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos]);

  // "Reproducir" el recorrido de una compra elegida.
  useEffect(() => {
    if (reproducir?.eventos?.length) {
      proximoInicio.current = 0;
      lanzar(reproducir.eventos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproducir]);

  // Bucle de animación solo mientras haya puntos en movimiento.
  const hayMovimiento = puntos.some((p) => ahora < p.inicio + (p.ruta.length - 1) * SEG_MS + 900);
  useEffect(() => {
    if (!hayMovimiento && puntos.length === 0) return undefined;
    let id;
    const tick = () => {
      setAhora(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    const limpiar = setTimeout(() => setPuntos((p) => p.filter((x) => performance.now() < x.inicio + (x.ruta.length - 1) * SEG_MS + 900)), 1500);
    return () => { cancelAnimationFrame(id); clearTimeout(limpiar); };
  }, [hayMovimiento, puntos.length]);

  // Posición actual de cada punto y componentes "encendidos" (un punto acaba de llegar).
  const encendidos = {};
  const dibujados = [];
  for (const p of puntos) {
    const t = ahora - p.inicio;
    if (t < 0) continue;
    const tramos = p.ruta.length - 1;
    const total = tramos * SEG_MS;
    if (t > total + 900) continue;
    const k = Math.min(tramos - 1, Math.floor(t / SEG_MS));
    const f = t >= total ? 1 : (t - k * SEG_MS) / SEG_MS;
    const a = comps[p.ruta[k]];
    const b = comps[p.ruta[k + 1]];
    if (!a || !b) continue;
    const suave = f < 0.5 ? 2 * f * f : 1 - ((-2 * f + 2) ** 2) / 2;
    const x = a.x + (b.x - a.x) * suave;
    const y = a.y + (b.y - a.y) * suave;
    const llegando = t >= total ? p.ruta[tramos] : f > 0.85 ? p.ruta[k + 1] : p.ruta[k];
    const final = t >= total;
    const color = final && p.resultado !== 'ok' ? COLOR_PUNTO[p.resultado] : p.resultado === 'error' && k === tramos - 1 ? COLOR_PUNTO.error : COLOR_PUNTO.ok;
    encendidos[llegando] = final ? (p.resultado === 'ok' ? 'ok' : p.resultado) : encendidos[llegando] || 'ok';
    dibujados.push({ id: p.id, x, y, color, final, opacidad: final ? Math.max(0, 1 - (t - total) / 900) : 1, a: p.ruta[k], b: p.ruta[k + 1] });
  }
  const tramosActivos = new Set(dibujados.filter((d) => !d.final).map((d) => [d.a, d.b].sort().join('|')));

  const aristas = [
    ...ARISTAS,
    ...aerolineas.map((a) => ['vuelos', `aero:${a.codigo}`, 'REST']),
  ].filter(([a, b]) => comps[a] && comps[b]);

  const ultimo = dibujados.length ? puntos[puntos.length - 1] : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Arquitectura del proceso de vuelos con el tráfico en vivo" style={{ width: '100%', minWidth: 780, height: 'auto', display: 'block', background: '#fafbfc', borderRadius: 10 }}>
          <defs>
            <filter id="av-brillo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Contenedor del backend en Azure */}
          <rect x={170} y={40} width={620} height={410} rx={14} fill="none" stroke="#b9c7dd" strokeDasharray="6 5" />
          <text x={180} y={58} fontSize="11" fill={T.muted}>Booking Core API · un solo despliegue en Azure App Service (módulos NestJS)</text>
          <text x={835} y={30} fontSize="11" fill={T.muted}>Aerolíneas socias (contrato v2)</text>

          {aristas.map(([a, b, etiqueta]) => {
            const A = comps[a];
            const B = comps[b];
            const activa = tramosActivos.has([a, b].sort().join('|'));
            return (
              <g key={`${a}-${b}`}>
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={activa ? T.azul : T.border} strokeWidth={activa ? 2.5 : 1.5} />
                {etiqueta && (
                  <text x={(A.x + B.x) / 2 + (A.x === B.x ? 6 : 0)} y={(A.y + B.y) / 2 - 5} fontSize="9.5" fill={T.muted} textAnchor={A.x === B.x ? 'start' : 'middle'} paintOrder="stroke" stroke="#fafbfc" strokeWidth="3">{etiqueta}</text>
                )}
              </g>
            );
          })}

          {Object.entries(comps).map(([id, c]) => {
            const luz = encendidos[id];
            const apagado = id === 'bus' && !busActivo;
            const borde = luz === 'error' ? COLOR_PUNTO.error : luz === 'aviso' ? COLOR_PUNTO.aviso : luz ? T.azul : c.caida ? T.gris : T.border;
            return (
              <g key={id} opacity={apagado || c.caida ? 0.6 : 1}>
                <rect x={c.x - c.w / 2} y={c.y - c.h / 2} width={c.w} height={c.h} rx={10}
                  fill={luz ? T.azulBg : T.surface} stroke={borde} strokeWidth={luz ? 2.5 : 1.3}
                  strokeDasharray={apagado ? '4 3' : undefined} filter={luz ? 'url(#av-brillo)' : undefined} />
                <text x={c.x - c.w / 2 + 10} y={c.y - 4} fontSize="12.5" fontWeight="700" fill={T.text}>
                  {c.icono} {String(c.titulo).length > 20 ? `${String(c.titulo).slice(0, 19)}…` : c.titulo}
                </text>
                <text x={c.x - c.w / 2 + 10} y={c.y + 13} fontSize="9.5" fill={T.text2}>
                  {id === 'bus' ? (busActivo ? 'RabbitMQ · conectado' : 'RabbitMQ no conectado · queda en log') : c.sub}
                </text>
              </g>
            );
          })}

          {dibujados.map((d) => (
            <circle key={d.id} cx={d.x} cy={d.y} r={d.final ? 7 : 6} fill={d.color} opacity={d.opacidad} filter="url(#av-brillo)" />
          ))}

          {aerolineas.length === 0 && (
            <text x={905} y={110} fontSize="11" fill={T.muted} textAnchor="middle">Sin aerolíneas registradas</text>
          )}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.75rem', color: T.text2, alignItems: 'center' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.ok, marginRight: 4 }} />paso correcto</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.aviso, marginRight: 4 }} />con aviso</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLOR_PUNTO.error, marginRight: 4 }} />falló (se queda donde falló)</span>
        {ultimo && <span style={{ marginLeft: 'auto', color: T.text }}>Ahora: <strong>{ETIQUETA_PASO[ultimo.paso] || ultimo.paso}</strong>{ultimo.nodo ? ` · ${ultimo.nodo}` : ''} — {String(ultimo.detalle || '').slice(0, 90)}</span>}
      </div>
    </div>
  );
}
