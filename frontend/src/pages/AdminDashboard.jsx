import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';

const C = {
  blue: '#006ce4', darkBlue: '#003b95', lightBlue: '#ebf3ff',
  yellow: '#febb02', green: '#008009', red: '#d32f2f',
  orange: '#e8650a', gray: '#6b6b6b', border: '#e7e7e7',
  bg: '#f5f5f5', white: '#ffffff', text: '#1a1a1a', cyan: '#00bcd4',
};

const TABS = [
  { id: 'observabilidad', label: '📊 Observabilidad & Finanzas', sub: 'Estado en vivo y dinero' },
  { id: 'microservicios', label: '🔬 Servicios & Prov.', sub: 'RDA2 Simulado' },
  { id: 'gestion', label: '🗂️ Gestión', sub: 'Usuarios & Reservas' },
  { id: 'soporte', label: '🎧 Soporte', sub: 'Ticketing & QC' },
  { id: 'auditoria', label: '🛡️ Auditoría', sub: 'Logs de Seguridad' },
  { id: 'configuracion', label: '⚙️ Ajustes', sub: 'Global' },
];

function fmt(n) { return typeof n === 'number' ? n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}) : '0.00'; }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleString('es-EC',{dateStyle:'short',timeStyle:'short'}); }
function estadoColor(s) {
  if (!s) return C.gray;
  const u = s.toUpperCase();
  if (u==='CONFIRMED'||u==='PAID'||u==='CONFIRMADA'||u==='PAGADA'||u==='COMPLETED') return C.green;
  if (u==='CANCELLED'||u==='REJECTED'||u==='CANCELADA') return C.red;
  if (u==='PENDING'||u==='RESERVED'||u==='PENDIENTE'||u==='PENDING_OFFLINE') return C.orange;
  return C.gray;
}

function KpiCard({label,value,sub,color,icon}) {
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'20px 24px',display:'flex',flexDirection:'column',gap:4,borderTop:`4px solid ${color||C.blue}`}}>
      <div style={{fontSize:'1.6rem'}}>{icon}</div>
      <div style={{fontSize:'1.8rem',fontWeight:700,color:color||C.text,lineHeight:1}}>{value}</div>
      <div style={{fontSize:'0.85rem',fontWeight:600,color:C.text}}>{label}</div>
      {sub && <div style={{fontSize:'0.75rem',color:C.gray}}>{sub}</div>}
    </div>
  );
}

const ESTADOS_ES = { CONFIRMED:'Confirmada', PAID:'Pagada', CANCELLED:'Cancelada', REJECTED:'Rechazada', PENDING:'Pendiente', RESERVED:'Reservada', COMPLETED:'Completada', REFUNDED:'Reembolsada', EXPIRED:'Expirada', CONFIRMADA:'Confirmada', CANCELADA:'Cancelada', PENDIENTE:'Pendiente', PENDING_OFFLINE:'Pendiente (sin conexión)' };

function Badge({status}) {
  return (
    <span style={{background:estadoColor(status)+'22',color:estadoColor(status),padding:'2px 8px',borderRadius:20,fontSize:'0.75rem',fontWeight:600}}>
      {ESTADOS_ES[String(status||'').toUpperCase()]||status||'—'}
    </span>
  );
}

function SectionTitle({children,badge}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,margin:'28px 0 12px'}}>
      <h3 style={{margin:0,fontSize:'1rem',fontWeight:700,color:C.text}}>{children}</h3>
      {badge && <span style={{background:C.orange,color:'white',fontSize:'0.65rem',fontWeight:700,padding:'2px 8px',borderRadius:20}}>{badge}</span>}
    </div>
  );
}

function ServiceDot({ok,label,latency}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
      <div style={{width:10,height:10,borderRadius:'50%',background:ok?C.green:C.red,flexShrink:0}}/>
      <span style={{flex:1,fontSize:'0.85rem',color:C.text}}>{label}</span>
      {latency!==undefined && <span style={{fontSize:'0.8rem',color:ok?C.green:C.red,fontWeight:600}}>{latency}ms</span>}
    </div>
  );
}

function ObservabilidadTab({stats,loadingStats,serviceHealth,refreshKey}) {
  if (loadingStats) return (
    <div style={{textAlign:'center',padding:60,color:C.gray}}>
      <div style={{fontSize:'2rem',marginBottom:12}}>⏳</div>
      Consultando datos en tiempo real...
    </div>
  );
  const k = stats?.kpis||{};

  // Embudo real (telemetría guardada en la BD). Si no hay eventos, se muestra vacío: nunca se inventan cifras.
  const funnel = Array.isArray(stats?.realFunnel) ? stats.realFunnel : null;
  const tel = stats?.telemetria || {};
  const trafico = stats?.trafficByVertical || {};
  const estadosPorVertical = stats?.estadosPorVertical || (stats?.estadosVuelos ? { vuelos: stats.estadosVuelos } : {});

  return (
    <div>
      {stats?.error && <Alerta tipo="error">{stats.error}</Alerta>}
      <SectionTitle>📈 KPIs de Negocio (Tiempo Real)</SectionTitle>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12}}>
        <KpiCard icon="🎫" label="Total Reservas" value={k.totalReservas??0} color={C.blue}/>
        <KpiCard icon="✈️" label="Vuelos" value={k.reservasVuelos??0} sub="reservas" color={C.darkBlue}/>
        <KpiCard icon="🚗" label="Autos" value={k.reservasAutos??0} sub="reservas" color={C.cyan}/>
        <KpiCard icon="🎡" label="Atracciones" value={k.reservasAtracciones??0} sub="reservas" color={C.green}/>
        <KpiCard icon="🏨" label="Hospedajes" value={k.reservasHospedaje??0} sub="reservas" color={'#8e44ad'}/>
        <KpiCard icon="💵" label="Ingresos cobrados" value={`$${fmt(k.ingresosTotal)}`} sub={`USD · ${k.reservasCobradas??0} reservas pagadas`} color={C.green}/>
      </div>
      <SectionTitle badge="Real">💰 Finanzas del Booking</SectionTitle>
      <FinanzasPanel refreshKey={refreshKey}/>

      <SectionTitle>🔌 Estado de Servicios</SectionTitle>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 20px'}}>
        {serviceHealth.map((s)=>(<ServiceDot key={s.label} ok={s.ok} label={s.label} latency={s.latency}/>))}
        {serviceHealth.length===0 && <div style={{color:C.gray,fontSize:'0.85rem',padding:'10px 0'}}>Comprobando servicios...</div>}
      </div>

      <SectionTitle>📊 Tráfico por Vertical (sesiones únicas)</SectionTitle>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:12,marginBottom:8}}>
        {[['✈️ Vuelos','vuelos',C.darkBlue],['🚗 Autos','autos',C.orange],['🎡 Atracciones','atracciones',C.green],['🏨 Hospedaje','hospedaje','#8e44ad']].map(([label,key,color])=>(
          <div key={key} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 20px'}}>
            <div style={{fontSize:'0.85rem',color:C.text}}>{label}</div>
            <div style={{fontSize:'1.6rem',fontWeight:700,color}}>{toNum(trafico[key])}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:'0.75rem',color:C.gray,marginBottom:20}}>
        {tel.eventos
          ? `${toNum(tel.eventos).toLocaleString('es-EC')} eventos de ${toNum(tel.sesiones).toLocaleString('es-EC')} sesiones registrados${tel.ultimoEvento ? ` · último: ${fmtDate(tel.ultimoEvento)}` : ''}.`
          : 'Aún no hay eventos de telemetría guardados en la base de datos.'}
      </div>

      {Object.values(estadosPorVertical).some(e => Object.keys(e||{}).length>0) && (
        <>
          <SectionTitle>📋 Reservas por estado</SectionTitle>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
            {[['vuelos','✈️ Vuelos'],['autos','🚗 Autos'],['atracciones','🎡 Atracciones'],['hospedaje','🏨 Hospedaje']].filter(([v])=>estadosPorVertical[v]).map(([v,label])=>{
              const entradas=Object.entries(estadosPorVertical[v]||{}).sort((a,b)=>b[1]-a[1]);
              return (
                <div key={v} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 16px'}}>
                  <div style={{fontWeight:700,fontSize:'0.85rem',marginBottom:8,color:C.text}}>{label}</div>
                  {entradas.length===0 && <div style={{fontSize:'0.8rem',color:C.gray}}>Sin reservas</div>}
                  {entradas.map(([estado,count])=>(
                    <div key={estado} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0'}}>
                      <Badge status={estado}/>
                      <span style={{fontWeight:700,color:estadoColor(estado)}}>{count}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle>🎯 Embudo de Conversión (telemetría real)</SectionTitle>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
        {!funnel && (
          <div style={{textAlign:'center',color:C.gray,fontSize:'0.88rem',padding:'12px 0'}}>
            Sin datos de telemetría todavía. El embudo se llenará cuando los usuarios busquen y reserven en el sitio.
            {tel.error && <div style={{fontSize:'0.75rem',marginTop:6,color:C.orange}}>Detalle: {tel.error}</div>}
          </div>
        )}
        {funnel && funnel.map((f,i)=>(
          <div key={f.label} style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem',marginBottom:4}}>
              <span style={{color:C.text}}>{f.label}</span>
              <span style={{fontWeight:700,color:f.pct<20 && f.count > 0 ? C.orange : C.text}}>{toNum(f.count).toLocaleString('es-EC')} sesiones ({f.pct}%)</span>
            </div>
            <div style={{background:C.border,borderRadius:4,height:12,overflow:'hidden'}}>
              <div style={{width:`${Math.min(100, toNum(f.pct))}%`,height:'100%',borderRadius:4,background:`linear-gradient(90deg, ${C.blue}, ${C.darkBlue})`,opacity:0.5+(i*0.08)}}/>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>🕒 Últimas Reservas (Global)</SectionTitle>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
          <thead>
            <tr style={{background:C.lightBlue}}>
              {['Tipo','PNR','Estado','Total (USD)','Fecha'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:C.darkBlue}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(stats?.ultimasReservas||[]).map((r,i)=>(
              <tr key={r.id||i} style={{borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:'9px 14px'}}>
                  <span>{r.tipo==='vuelo'?'✈️':r.tipo==='auto'?'🚗':r.tipo==='hospedaje'?'🏨':'🎡'}</span>
                  <span style={{marginLeft:6,textTransform:'capitalize'}}>{r.tipo}</span>
                </td>
                <td style={{padding:'9px 14px',fontFamily:'monospace',fontWeight:600}}>{r.pnr||'—'}</td>
                <td style={{padding:'9px 14px'}}><Badge status={r.estado}/></td>
                <td style={{padding:'9px 14px',fontWeight:600}}>${fmt(r.total)}</td>
                <td style={{padding:'9px 14px',color:C.gray}}>{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
            {(!stats?.ultimasReservas||stats.ultimasReservas.length===0)&&(
              <tr><td colSpan={5} style={{padding:24,textAlign:'center',color:C.gray}}>Sin reservas aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MicroserviciosTab() {
  const [tick,setTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(n=>n+1),3000);return()=>clearInterval(t);},[]);
  const rand=(base,spread)=>parseFloat((base+(Math.random()-0.5)*spread).toFixed(1));
  const randInt=(base,spread)=>Math.round(base+(Math.random()-0.5)*spread);
  const services=[
    {name:'API Gateway',p50:rand(12,4),p95:rand(45,10),p99:rand(120,30),rps:randInt(420,60),errors:rand(0.2,0.1),cpu:rand(28,8),mem:rand(42,6)},
    {name:'Svc Vuelos',p50:rand(95,20),p95:rand(380,60),p99:rand(820,100),rps:randInt(85,20),errors:rand(0.8,0.3),cpu:rand(55,12),mem:rand(68,8)},
    {name:'Svc Autos',p50:rand(45,12),p95:rand(180,40),p99:rand(420,80),rps:randInt(32,10),errors:rand(0.4,0.2),cpu:rand(35,10),mem:rand(50,8)},
    {name:'Svc Atracciones',p50:rand(38,10),p95:rand(140,30),p99:rand(310,60),rps:randInt(18,8),errors:rand(0.3,0.15),cpu:rand(22,6),mem:rand(38,5)},
    {name:'Svc Pagos',p50:rand(320,40),p95:rand(920,100),p99:rand(1800,200),rps:randInt(12,5),errors:rand(1.2,0.4),cpu:rand(45,12),mem:rand(55,8)},
  ];
  const topology=[
    {from:'Browser',to:'API Gateway',ms:rand(18,5)},
    {from:'API Gateway',to:'Svc Vuelos',ms:rand(8,3)},
    {from:'API Gateway',to:'Svc Autos',ms:rand(6,2)},
    {from:'API Gateway',to:'Svc Atracciones',ms:rand(5,2)},
    {from:'Svc Vuelos',to:'Amadeus API',ms:rand(210,30)},
    {from:'Svc Pagos',to:'Stripe',ms:rand(310,40)},
  ];
  return (
    <div>
      <div style={{background:'#fff3cd',border:'1px solid #ffc107',borderRadius:8,padding:'10px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:'1.2rem'}}>⚠️</span>
        <span style={{fontSize:'0.85rem',color:'#664d03'}}><strong>Datos Simulados — RDA2.</strong> Esta pestaña muestra cómo se verá el monitoreo cuando el sistema migre a microservicios con Kubernetes, Prometheus y Grafana. Las métricas fluctúan cada 3 segundos para fines demostrativos.</span>
      </div>
      <SectionTitle>🔗 Topología de Red y Latencias</SectionTitle>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'16px 20px'}}>
        {topology.map(t=>(
          <div key={`${t.from}-${t.to}`} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:`1px solid ${C.border}`,fontSize:'0.85rem'}}>
            <span style={{background:C.lightBlue,padding:'2px 10px',borderRadius:4,fontWeight:600,color:C.darkBlue}}>{t.from}</span>
            <div style={{flex:1,borderBottom:'1px dashed #ccc',margin:'0 4px'}}/>
            <span style={{background:'#e8f5e9',padding:'2px 8px',borderRadius:4,fontWeight:700,color:C.green,fontSize:'0.8rem'}}>{t.ms}ms</span>
            <span style={{color:C.gray}}>→</span>
            <span style={{background:C.lightBlue,padding:'2px 10px',borderRadius:4,fontWeight:600,color:C.darkBlue}}>{t.to}</span>
          </div>
        ))}
      </div>
      <SectionTitle>📡 Los 4 Golden Signals por Servicio</SectionTitle>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem',background:C.white,border:`1px solid ${C.border}`,borderRadius:8}}>
          <thead>
            <tr style={{background:C.darkBlue,color:'white'}}>
              {['Servicio','p50','p95','p99','req/s','Error %','CPU %','RAM %'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'center',fontWeight:600}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((s,i)=>(
              <tr key={s.name} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?C.white:C.bg}}>
                <td style={{padding:'10px 12px',fontWeight:600}}>{s.name}</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:C.green}}>{s.p50}ms</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:s.p95>300?C.orange:C.text}}>{s.p95}ms</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:s.p99>800?C.red:C.text,fontWeight:s.p99>800?700:400}}>{s.p99}ms</td>
                <td style={{padding:'10px 12px',textAlign:'center'}}>{s.rps}</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:s.errors>1?C.red:C.green,fontWeight:700}}>{s.errors}%</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:s.cpu>70?C.red:C.text}}>{s.cpu}%</td>
                <td style={{padding:'10px 12px',textAlign:'center',color:s.mem>80?C.red:C.text}}>{s.mem}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionTitle>🎖️ SLOs y Error Budget</SectionTitle>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:12}}>
        {[
          {name:'Búsqueda < 800ms',target:99.9,current:99.7,budget:29},
          {name:'Reserva exitosa',target:99.5,current:98.8,budget:68},
          {name:'Pago confirmado',target:99.9,current:99.6,budget:45},
          {name:'Disponibilidad API',target:99.9,current:99.95,budget:100},
        ].map(s=>{
          const ok=s.current>=s.target;
          return (
            <div key={s.name} style={{background:C.white,border:`1px solid ${ok?C.green:C.red}`,borderRadius:8,padding:'14px 16px'}}>
              <div style={{fontSize:'0.8rem',fontWeight:600,marginBottom:6}}>{s.name}</div>
              <div style={{fontSize:'1.3rem',fontWeight:700,color:ok?C.green:C.red}}>{s.current}%</div>
              <div style={{fontSize:'0.75rem',color:C.gray,marginBottom:8}}>Meta: {s.target}%</div>
              <div style={{fontSize:'0.75rem',marginBottom:4,display:'flex',justifyContent:'space-between'}}>
                <span>Error Budget</span><span style={{fontWeight:700,color:s.budget>50?C.green:C.orange}}>{s.budget}%</span>
              </div>
              <div style={{background:C.border,borderRadius:4,height:6}}>
                <div style={{width:`${s.budget}%`,height:'100%',borderRadius:4,background:s.budget>50?C.green:C.orange}}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL DE PROVEEDORES — simula la red de sitios integrados para RDA2
// ─────────────────────────────────────────────────────────────────────────────
const PROVEEDORES_INICIALES = [
  {
    id: 'prov-1',
    nombre: 'TravelEcuador Pro',
    equipo: 'Grupo 1 – Atracciones',
    url: 'https://travel-ecuador-pro.vercel.app',
    apiBase: 'https://travel-ecuador-pro.vercel.app/api/v1',
    tipo: 'Atracciones',
    emoji: '🎡',
    activo: true,
    fechaRegistro: '2026-09-15',
    descripcion: 'Catálogo de atracciones turísticas del Ecuador, con reservas en tiempo real.',
    contacto: 'grupo1@universidad.edu.ec',
  },
  {
    id: 'prov-2',
    nombre: 'AeroLink Ecuador',
    equipo: 'Grupo 2 – Vuelos',
    url: 'https://aerolink-ec.netlify.app',
    apiBase: 'https://aerolink-ec.netlify.app/api/v1',
    tipo: 'Vuelos',
    emoji: '✈️',
    activo: true,
    fechaRegistro: '2026-09-18',
    descripcion: 'Motor de búsqueda y reserva de vuelos domésticos e internacionales.',
    contacto: 'grupo2@universidad.edu.ec',
  },
  {
    id: 'prov-3',
    nombre: 'HotelHub EC',
    equipo: 'Grupo 3 – Alojamientos',
    url: 'https://hotelhub-ec.vercel.app',
    apiBase: 'https://hotelhub-ec.vercel.app/api/v1',
    tipo: 'Alojamientos',
    emoji: '🏨',
    activo: true,
    fechaRegistro: '2026-09-20',
    descripcion: 'Plataforma de hospedaje con hoteles, hostales y cabañas.',
    contacto: 'grupo3@universidad.edu.ec',
  },
  {
    id: 'prov-4',
    nombre: 'RentAuto Ecuador',
    equipo: 'Grupo 4 – Autos',
    url: 'https://rentauto-ec.netlify.app',
    apiBase: 'https://rentauto-ec.netlify.app/api/v1',
    tipo: 'Autos',
    emoji: '🚗',
    activo: false,
    fechaRegistro: '2026-09-22',
    descripcion: 'Renta de vehículos con cobertura nacional. Mantenimiento programado.',
    contacto: 'grupo4@universidad.edu.ec',
  },
  {
    id: 'prov-5',
    nombre: 'GalapagosXplorer',
    equipo: 'Grupo 5 – Tours',
    url: 'https://galapagos-xplorer.vercel.app',
    apiBase: 'https://galapagos-xplorer.vercel.app/api/v1',
    tipo: 'Tours',
    emoji: '🐢',
    activo: true,
    fechaRegistro: '2026-09-25',
    descripcion: 'Tours especializados a Galápagos con guías certificados.',
    contacto: 'grupo5@universidad.edu.ec',
  },
];

const TIPO_COLORES = {
  Atracciones: { bg: '#e8f5e9', color: '#2e7d32' },
  Vuelos:      { bg: '#e3f2fd', color: '#1565c0' },
  Alojamientos:{ bg: '#f3e5f5', color: '#6a1b9a' },
  Autos:       { bg: '#fff3e0', color: '#e65100' },
  Tours:       { bg: '#e0f7fa', color: '#00695c' },
  Otro:        { bg: '#f5f5f5', color: '#333'    },
};

function TipoBadge({ tipo }) {
  const col = TIPO_COLORES[tipo] || TIPO_COLORES.Otro;
  return (
    <span style={{ background: col.bg, color: col.color, padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
      {tipo}
    </span>
  );
}

function EstadoBadge({ online, checking }) {
  if (checking) return <span style={{ color: C.gray, fontSize: '0.8rem' }}>⏳ Comprobando...</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: online ? C.green : C.red }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? C.green : C.red, display: 'inline-block', boxShadow: online ? `0 0 6px ${C.green}` : 'none' }} />
      {online ? 'En línea' : 'Sin conexión'}
    </span>
  );
}

function ProveedoresTab() {
  const STORAGE_KEY = 'booking_proveedores';

  const [proveedores, setProveedores] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && saved.length > 0 ? saved : PROVEEDORES_INICIALES;
    } catch { return PROVEEDORES_INICIALES; }
  });

  // Estado de salud: { [id]: { online, latency, checking } }
  const [health, setHealth] = useState({});
  const [modal, setModal] = useState(null); // null | 'nuevo' | { ...proveedor }
  const [detalle, setDetalle] = useState(null);
  const [form, setForm] = useState({ nombre:'', equipo:'', url:'', apiBase:'', tipo:'Otro', descripcion:'', contacto:'', tokenAuth:'', webhookUrl:'', healthcheckUrl:'', rateLimit:'', entorno:'Producción' });
  const [formErr, setFormErr] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  const persistir = (lista) => {
    setProveedores(lista);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  };

  // Simula un health-check contra la URL del proveedor
  const checkHealth = (prov) => {
    setHealth(h => ({ ...h, [prov.id]: { ...h[prov.id], checking: true } }));
    // Simulación: proveedores con activo=true tienen 85% de probabilidad de estar online
    const delay = 600 + Math.random() * 1200;
    setTimeout(() => {
      const baseOnline = prov.activo;
      const online = baseOnline ? Math.random() > 0.12 : Math.random() > 0.85;
      const latency = online ? Math.round(80 + Math.random() * 420) : null;
      setHealth(h => ({ ...h, [prov.id]: { online, latency, checking: false, lastCheck: new Date() } }));
    }, delay);
  };

  // Revisar todos al montar y cada 8 segundos
  useEffect(() => {
    proveedores.forEach(p => checkHealth(p));
    const interval = setInterval(() => {
      proveedores.forEach(p => checkHealth(p));
    }, 8000);
    return () => clearInterval(interval);
  }, [proveedores.length]); // solo re-ejecutar si cambia cantidad

  const onlineCount = Object.values(health).filter(h => h.online && !h.checking).length;
  const offlineCount = Object.values(health).filter(h => !h.online && !h.checking).length;

  const tiposFiltro = ['Todos', ...Array.from(new Set(proveedores.map(p => p.tipo)))];

  const proveedoresFiltrados = proveedores.filter(p => {
    const okTipo = filtroTipo === 'Todos' || p.tipo === filtroTipo;
    const h = health[p.id];
    const okEstado = filtroEstado === 'Todos'
      || (filtroEstado === 'Online' && h?.online)
      || (filtroEstado === 'Offline' && h && !h.online && !h.checking);
    return okTipo && okEstado;
  });

  const abrirNuevo = () => {
    setForm({ nombre:'', equipo:'', url:'', apiBase:'', tipo:'Otro', descripcion:'', contacto:'', emoji:'🔗', tokenAuth:'', webhookUrl:'', healthcheckUrl:'', rateLimit:'', entorno:'Producción' });
    setFormErr({});
    setModal('nuevo');
  };

  const abrirEditar = (prov) => {
    setForm({ ...prov });
    setFormErr({});
    setModal('editar');
  };

  const validar = () => {
    const err = {};
    if (!form.nombre.trim()) err.nombre = 'Requerido';
    if (!form.url.trim()) err.url = 'Requerido';
    if (!form.apiBase.trim()) err.apiBase = 'Requerido';
    return err;
  };

  const guardar = async () => {
    const err = validar();
    if (Object.keys(err).length > 0) { setFormErr(err); return; }
    setGuardando(true);
    await new Promise(r => setTimeout(r, 600));
    if (modal === 'nuevo') {
      const nuevo = { ...form, id: `prov-${Date.now()}`, activo: true, fechaRegistro: new Date().toISOString().split('T')[0] };
      const lista = [...proveedores, nuevo];
      persistir(lista);
      // Iniciar health check del nuevo proveedor
      setTimeout(() => checkHealth(nuevo), 300);
    } else {
      const lista = proveedores.map(p => p.id === form.id ? { ...form } : p);
      persistir(lista);
    }
    setGuardando(false);
    setModal(null);
  };

  const eliminar = (id) => {
    const lista = proveedores.filter(p => p.id !== id);
    persistir(lista);
    setHealth(h => { const n = { ...h }; delete n[id]; return n; });
    setConfirmDel(null);
    if (detalle?.id === id) setDetalle(null);
  };

  const toggleActivo = (prov) => {
    const lista = proveedores.map(p => p.id === prov.id ? { ...p, activo: !p.activo } : p);
    persistir(lista);
  };

  const inputStyle = (field) => ({
    width: '100%', padding: '9px 12px', border: `1px solid ${formErr[field] ? C.red : C.border}`,
    borderRadius: 6, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
  });

  const TIPOS_SELECT = ['Atracciones', 'Vuelos', 'Alojamientos', 'Autos', 'Tours', 'Otro'];

  return (
    <div>
      {/* Banner informativo */}
      <div style={{ background: '#e3f2fd', border: '1px solid #1565c0', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>🔗</span>
        <span style={{ fontSize: '0.85rem', color: '#1565c0' }}>
          <strong>Panel de Proveedores — Preparación RDA2.</strong> Aquí se gestionan los sistemas externos de otros grupos que se integrarán al Booking Ecuador en el Reto 2. Los estados se simulan ya que la integración real aún no está desplegada.
        </span>
      </div>

      {/* KPIs de red */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon="🌐" label="Total Proveedores" value={proveedores.length} color={C.blue} />
        <KpiCard icon="✅" label="En Línea" value={onlineCount} color={C.green} />
        <KpiCard icon="❌" label="Sin Conexión" value={offlineCount} color={C.red} />
        <KpiCard icon="📦" label="Tipos de Servicio" value={tiposFiltro.length - 1} color={C.cyan} />
      </div>

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tiposFiltro.map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filtroTipo === t ? C.blue : C.border}`, background: filtroTipo === t ? C.blue : 'white', color: filtroTipo === t ? 'white' : C.text, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s' }}>
              {t}
            </button>
          ))}
          <button onClick={() => setFiltroEstado(filtroEstado === 'Online' ? 'Todos' : 'Online')} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filtroEstado === 'Online' ? C.green : C.border}`, background: filtroEstado === 'Online' ? '#e8f5e9' : 'white', color: filtroEstado === 'Online' ? C.green : C.text, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            ✅ Solo Online
          </button>
          <button onClick={() => setFiltroEstado(filtroEstado === 'Offline' ? 'Todos' : 'Offline')} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${filtroEstado === 'Offline' ? C.red : C.border}`, background: filtroEstado === 'Offline' ? '#ffebee' : 'white', color: filtroEstado === 'Offline' ? C.red : C.text, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            ❌ Solo Offline
          </button>
        </div>
        <button onClick={abrirNuevo} style={{ background: C.blue, color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          + Registrar Proveedor
        </button>
      </div>

      {/* Tabla de proveedores */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: C.darkBlue, color: 'white' }}>
              {['Sistema / Equipo', 'Tipo', 'Estado', 'Latencia', 'Última revisión', 'Activo', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proveedoresFiltrados.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: C.gray }}>No hay proveedores que coincidan con el filtro</td></tr>
            )}
            {proveedoresFiltrados.map((prov, i) => {
              const h = health[prov.id] || {};
              return (
                <tr key={prov.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.bg, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.lightBlue}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : C.bg}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.5rem' }}>{prov.emoji || '🔗'}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: C.text }}>{prov.nombre}</div>
                        <div style={{ fontSize: '0.78rem', color: C.gray }}>{prov.equipo}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}><TipoBadge tipo={prov.tipo} /></td>
                  <td style={{ padding: '12px 14px' }}><EstadoBadge online={h.online} checking={h.checking} /></td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: h.online ? (h.latency > 300 ? C.orange : C.green) : C.gray }}>
                    {h.checking ? '...' : h.latency ? `${h.latency} ms` : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: C.gray, fontSize: '0.78rem' }}>
                    {h.lastCheck ? h.lastCheck.toLocaleTimeString('es-EC') : 'Pendiente'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={() => toggleActivo(prov)} style={{ background: prov.activo ? '#e8f5e9' : '#ffebee', color: prov.activo ? C.green : C.red, border: 'none', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                      {prov.activo ? 'Activo' : 'Pausado'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDetalle(prov)} title="Ver detalle" style={{ background: C.lightBlue, border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem' }}>👁️</button>
                      <button onClick={() => checkHealth(prov)} title="Recheck" style={{ background: '#fff3e0', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem' }}>🔄</button>
                      <button onClick={() => abrirEditar(prov)} title="Editar" style={{ background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem' }}>✏️</button>
                      <button onClick={() => setConfirmDel(prov)} title="Eliminar" style={{ background: '#ffebee', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Panel de detalle lateral */}
      {detalle && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: 380, height: '100vh', background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ background: C.darkBlue, color: 'white', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Detalle del Proveedor</div>
            <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>{detalle.emoji || '🔗'}</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: C.text }}>{detalle.nombre}</div>
              <div style={{ fontSize: '0.85rem', color: C.gray, marginBottom: 8 }}>{detalle.equipo}</div>
              <TipoBadge tipo={detalle.tipo} />
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              {[['🌐 URL del Sistema', detalle.url], ['🔌 API Base', detalle.apiBase], ['🔑 Token (Auth)', detalle.tokenAuth ? '••••••••' : 'No definido'], ['🪝 Webhook', detalle.webhookUrl], ['🩺 Healthcheck', detalle.healthcheckUrl], ['⚡ Rate Limit', detalle.rateLimit ? detalle.rateLimit + ' req/s' : '—'], ['🌍 Entorno', detalle.entorno || 'Producción'], ['📧 Contacto', detalle.contacto], ['📅 Registro', detalle.fechaRegistro]].map(([label, val]) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: C.gray, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: '0.88rem', color: C.text, wordBreak: 'break-all' }}>{val || '—'}</div>
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', color: C.gray, fontWeight: 600, marginBottom: 3 }}>📝 Descripción</div>
                <div style={{ fontSize: '0.88rem', color: C.text }}>{detalle.descripcion || '—'}</div>
              </div>
              {/* Estado en tiempo real en el detalle */}
              <div style={{ background: C.bg, borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>Estado en tiempo real</div>
                {(() => {
                  const h = health[detalle.id] || {};
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <EstadoBadge online={h.online} checking={h.checking} />
                      <span style={{ color: h.online ? (h.latency > 300 ? C.orange : C.green) : C.gray, fontWeight: 700, fontSize: '0.85rem' }}>
                        {h.checking ? '...' : h.latency ? `${h.latency} ms` : '—'}
                      </span>
                    </div>
                  );
                })()}
              </div>
              {/* Endpoints simulados */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>🔗 Endpoints de Integración (RDA2)</div>
                {['GET /api/v1/catalogo/exportar', `GET /api/v1/${detalle.tipo.toLowerCase()}/disponibilidad`, 'POST /api/v1/webhooks/reserva-creada', 'GET /health'].map(ep => (
                  <div key={ep} style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: C.blue, background: C.lightBlue, padding: '4px 10px', borderRadius: 4, marginBottom: 4 }}>{ep}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo / Editar */}
      {(modal === 'nuevo' || modal === 'editar') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: C.darkBlue, color: 'white', padding: '16px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{modal === 'nuevo' ? '➕ Registrar Nuevo Proveedor' : '✏️ Editar Proveedor'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ background: '#fff8e1', border: '1px solid #ffc107', borderRadius: 6, padding: '8px 14px', marginBottom: 20, fontSize: '0.8rem', color: '#664d03' }}>
                ⚠️ La información ingresada se guardará localmente y simulará la integración real del RDA2. En producción, este formulario enviará los datos al API Gateway central.
              </div>
              {[['nombre', 'Nombre del sistema *', 'Ej: TravelEcuador Pro'], ['equipo', 'Nombre del equipo', 'Ej: Grupo 6 – Cruceros'], ['url', 'URL del sitio web *', 'https://mi-sistema.vercel.app'], ['apiBase', 'URL base de la API *', 'https://mi-sistema.vercel.app/api/v1'], ['contacto', 'Email de contacto', 'grupo@universidad.edu.ec']].map(([field, label, placeholder]) => (
                <div key={field} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>{label}</label>
                  <input value={form[field] || ''} onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); setFormErr(er => { const n = { ...er }; delete n[field]; return n; }); }} placeholder={placeholder} style={inputStyle(field)} />
                  {formErr[field] && <div style={{ color: C.red, fontSize: '0.75rem', marginTop: 2 }}>{formErr[field]}</div>}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ background: C.bg, padding: '12px 16px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10, color: C.darkBlue }}>Datos Técnicos de Integración (API)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {[['tokenAuth', 'API Key / Token', 'Ej: sk_live_...'], ['webhookUrl', 'Webhook URL', 'https://.../webhook'], ['healthcheckUrl', 'Healthcheck URL', 'https://.../health'], ['rateLimit', 'Rate Limit (req/s)', 'Ej: 50']].map(([field, label, placeholder]) => (
                        <div key={field}>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>{label}</label>
                          <input value={form[field] || ''} onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); }} placeholder={placeholder} style={inputStyle(field)} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>Entorno</label>
                        <select value={form.entorno || 'Producción'} onChange={e => setForm(f => ({ ...f, entorno: e.target.value }))} style={{ ...inputStyle('entorno'), background: 'white' }}>
                          <option value="Producción">Producción</option>
                          <option value="Staging">Staging / Pruebas</option>
                          <option value="Desarrollo">Desarrollo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>Tipo de servicio</label>
                <select value={form.tipo || 'Otro'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...inputStyle('tipo'), background: 'white' }}>
                  {TIPOS_SELECT.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>Emoji / Ícono</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['🔗', '🌐', '✈️', '🏨', '🚗', '🎡', '🐢', '⛵', '🎭', '🏔️', '🌴'].map(em => (
                    <button key={em} onClick={() => setForm(f => ({ ...f, emoji: em }))} style={{ fontSize: '1.4rem', background: form.emoji === em ? C.lightBlue : 'transparent', border: `2px solid ${form.emoji === em ? C.blue : C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>{em}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: C.text }}>Descripción</label>
                <textarea value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Breve descripción del sistema y los servicios que provee..." rows={3} style={{ ...inputStyle('descripcion'), resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setModal(null)} style={{ padding: '9px 20px', border: `1px solid ${C.border}`, borderRadius: 6, background: 'white', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={guardar} disabled={guardando} style={{ padding: '9px 20px', background: guardando ? C.gray : C.blue, color: 'white', border: 'none', borderRadius: 6, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {guardando ? '⏳ Guardando...' : modal === 'nuevo' ? '✅ Registrar Proveedor' : '✅ Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center', marginBottom: 8 }}>¿Eliminar proveedor?</div>
            <div style={{ color: C.gray, fontSize: '0.85rem', textAlign: 'center', marginBottom: 24 }}>Se eliminará <strong>{confirmDel.nombre}</strong> de la lista de proveedores. Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '9px 24px', border: `1px solid ${C.border}`, borderRadius: 6, background: 'white', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel.id)} style={{ padding: '9px 24px', background: C.red, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vistas legibles para los modales de Gestión (historial y detalle de reserva) ──
const VERTICAL_INFO = {
  vuelos: { icon: '✈️', label: 'Vuelos' }, vuelo: { icon: '✈️', label: 'Vuelo' },
  autos: { icon: '🚗', label: 'Autos' }, auto: { icon: '🚗', label: 'Auto' },
  atracciones: { icon: '🎡', label: 'Atracciones' }, atraccion: { icon: '🎡', label: 'Atracción' },
  hospedaje: { icon: '🏨', label: 'Hospedaje' },
};

const ETIQUETAS = {
  idReserva: 'ID de reserva', pnr: 'Código (PNR)', propietarioId: 'ID del usuario', estado: 'Estado', status: 'Estado',
  moneda: 'Moneda', currency: 'Moneda', tarifaBase: 'Tarifa base', impuestos: 'Impuestos', total: 'Total',
  referenciaPago: 'Referencia de pago', fechaCreacion: 'Creada', fechaActualizacion: 'Actualizada',
  createdAt: 'Creada', updatedAt: 'Actualizada', created_at: 'Creada', updated_at: 'Actualizada',
  corteCheckIn: 'Cierre de check-in', version: 'Versión', pasajeros: 'Pasajeros', itinerarios: 'Itinerario',
  tarifas: 'Tarifas', boletos: 'Boletos', checkin: 'Check-in', idPasajero: 'ID pasajero', passengerId: 'Ref. pasajero',
  tipo: 'Tipo', adultoAsociadoId: 'Adulto asociado', nombre: 'Nombre', apellido: 'Apellido',
  tipoDocumento: 'Tipo de documento', numeroDocumento: 'N.º de documento', fechaNacimiento: 'Fecha de nacimiento',
  email: 'Correo', telefono: 'Teléfono', phone: 'Teléfono', booker: 'Titular de la reserva', vehicle: 'Vehículo',
  totalPrice: 'Precio', customerEmail: 'Correo del cliente', customerName: 'Cliente', firstName: 'Nombre',
  lastName: 'Apellido', name: 'Nombre', origen: 'Origen', destino: 'Destino', fechaSalida: 'Salida',
  fechaLlegada: 'Llegada', numeroVuelo: 'N.º de vuelo', aerolinea: 'Aerolínea', clase: 'Clase', asiento: 'Asiento',
  numeroBoleto: 'N.º de boleto', pickUp: 'Retiro', dropOff: 'Devolución', pickupDate: 'Retiro', dropoffDate: 'Devolución',
  quantity: 'Cantidad', date: 'Fecha', checkIn: 'Entrada', checkOut: 'Salida', huespedes: 'Huéspedes',
};
const ENUMS_ES = { ADULT: 'Adulto', CHILD: 'Niño', INFANT: 'Infante', NATIONAL_ID: 'Cédula', PASSPORT: 'Pasaporte', ID_CARD: 'Cédula', DRIVER_LICENSE: 'Licencia', MALE: 'Masculino', FEMALE: 'Femenino', ECONOMY: 'Económica', BUSINESS: 'Ejecutiva', FIRST: 'Primera' };
const CLAVES_ESTADO = new Set(['estado', 'status']);
const CLAVES_DINERO = /^(total|tarifaBase|impuestos|precio|price|amount|monto|subtotal|base|taxes|tax)$/i;
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function etiqueta(k) {
  if (ETIQUETAS[k]) return ETIQUETAS[k];
  const t = String(k).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function fmtDinero(v, moneda = 'USD') {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}
function esPrimitivo(v) { return v === null || v === undefined || typeof v !== 'object'; }

function Valor({ k, v, moneda }) {
  if (v === null || v === undefined || v === '') return <span style={{ color: '#9a9a9a' }}>—</span>;
  if (typeof v === 'boolean') return <span>{v ? 'Sí' : 'No'}</span>;
  if (CLAVES_ESTADO.has(k)) return <Badge status={String(v)} />;
  if (CLAVES_DINERO.test(k) && Number.isFinite(Number(v))) return <span style={{ fontWeight: 600 }}>{fmtDinero(v, moneda)}</span>;
  if (typeof v === 'string' && ENUMS_ES[v]) return <span>{ENUMS_ES[v]}</span>;
  if (typeof v === 'string' && ISO_FECHA.test(v)) return <span>{fmtDate(v)}</span>;
  if (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', wordBreak: 'break-all' }}>{v}</span>;
  return <span style={{ wordBreak: 'break-word' }}>{String(v)}</span>;
}

/** Aplana objetos anidados de un nivel: { documento: { tipo } } → "Documento · tipo" */
function camposPlanos(obj, prefijo = '') {
  const out = [];
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (esPrimitivo(v)) out.push([k, prefijo ? `${prefijo} · ${etiqueta(k).toLowerCase()}` : etiqueta(k), v]);
    else if (!Array.isArray(v) && !prefijo) out.push(...camposPlanos(v, etiqueta(k)));
    else if (Array.isArray(v) && v.every(esPrimitivo)) out.push([k, prefijo ? `${prefijo} · ${etiqueta(k).toLowerCase()}` : etiqueta(k), v.join(', ')]);
  });
  return out;
}

function GridCampos({ obj, moneda, omitir = [] }) {
  const campos = camposPlanos(obj).filter(([k]) => !omitir.includes(k));
  if (!campos.length) return <div style={{ color: C.gray, fontSize: '0.85rem' }}>Sin datos.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 18px' }}>
      {campos.map(([k, label, v], i) => (
        <div key={`${label}-${i}`} style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: '0.88rem', color: C.text }}><Valor k={k} v={v} moneda={moneda} /></div>
        </div>
      ))}
    </div>
  );
}

function Seccion({ titulo, contador, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: C.darkBlue, display: 'flex', alignItems: 'center', gap: 8 }}>
        {titulo}
        {contador !== undefined && <span style={{ background: C.lightBlue, color: C.darkBlue, borderRadius: 20, padding: '1px 8px', fontSize: '0.72rem' }}>{contador}</span>}
      </h4>
      {children}
    </section>
  );
}

const tarjeta = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' };

function JsonTecnico({ data }) {
  return (
    <details style={{ marginTop: 20 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: C.gray, fontWeight: 600 }}>Ver datos técnicos (JSON)</summary>
      <pre style={{ background: C.bg, padding: 12, borderRadius: 6, fontSize: '0.75rem', marginTop: 8, overflowX: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function DetalleReservaVista({ data, tipo }) {
  if (!data || typeof data !== 'object' || (Object.keys(data).length === 1 && data.mensaje)) {
    return <div style={{ textAlign: 'center', padding: '32px 0', color: C.gray }}>{data?.mensaje || 'No hay detalles para esta reserva.'}</div>;
  }
  const moneda = data.moneda || data.currency || data.totalPrice?.currency || data.precio?.currency || 'USD';
  const codigo = data.pnr || data.bookingReference || data.reservation_id || data.orderId || String(data.idReserva || data.id || '').slice(0, 8).toUpperCase();
  const estado = data.estado || data.status;
  const total = data.total ?? data.totalPrice?.total ?? data.precio?.total ?? data.total_price;
  const creada = data.fechaCreacion || data.createdAt || data.created_at;
  const info = VERTICAL_INFO[tipo] || { icon: '📄', label: tipo };

  const resumenKeys = ['pnr', 'estado', 'status', 'total', 'moneda', 'currency', 'fechaCreacion', 'createdAt', 'created_at'];
  const escalares = {};
  const objetos = [];
  const listas = [];
  Object.entries(data).forEach(([k, v]) => {
    if (resumenKeys.includes(k)) return;
    if (esPrimitivo(v)) escalares[k] = v;
    else if (Array.isArray(v)) { if (v.length) listas.push([k, v]); }
    else if (k === 'totalPrice' || k === 'precio') objetos.push([k, v]);
    else objetos.push([k, v]);
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, background: C.lightBlue, borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: '2rem' }}>{info.icon}</div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', color: C.gray, fontWeight: 600, textTransform: 'uppercase' }}>{info.label} · Código</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: C.darkBlue, letterSpacing: '0.04em' }}>{codigo || '—'}</div>
          {creada && <div style={{ fontSize: '0.78rem', color: C.gray }}>Creada {fmtDate(creada)}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {estado && <div style={{ marginBottom: 6 }}><Badge status={estado} /></div>}
          {total !== undefined && total !== null && <div style={{ fontSize: '1.2rem', fontWeight: 700, color: C.text }}>{fmtDinero(total, moneda)}</div>}
        </div>
      </div>

      {Object.keys(escalares).length > 0 && (
        <Seccion titulo="Información general">
          <div style={tarjeta}><GridCampos obj={escalares} moneda={moneda} /></div>
        </Seccion>
      )}

      {objetos.map(([k, v]) => (
        <Seccion key={k} titulo={etiqueta(k)}>
          <div style={tarjeta}><GridCampos obj={v} moneda={moneda} /></div>
        </Seccion>
      ))}

      {listas.map(([k, arr]) => (
        <Seccion key={k} titulo={etiqueta(k)} contador={arr.length}>
          {arr.every(esPrimitivo) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{arr.map((x, i) => <span key={i} style={{ background: C.bg, borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem' }}>{String(x)}</span>)}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {arr.map((item, i) => {
                const nombre = [item.nombre || item.firstName || item.name, item.apellido || item.lastName].filter(Boolean).join(' ');
                return (
                  <div key={i} style={tarjeta}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: C.text, marginBottom: 8 }}>
                      {nombre || `${etiqueta(k).replace(/s$/, '')} ${i + 1}`}
                      {item.tipo && <span style={{ marginLeft: 8, background: C.bg, borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600, color: C.gray }}>{ENUMS_ES[item.tipo] || item.tipo}</span>}
                    </div>
                    <GridCampos obj={item} moneda={moneda} omitir={nombre ? ['nombre', 'apellido', 'firstName', 'lastName', 'name', 'tipo'] : ['tipo']} />
                  </div>
                );
              })}
            </div>
          )}
        </Seccion>
      ))}

      <JsonTecnico data={data} />
    </div>
  );
}

function HistorialUsuarioVista({ data }) {
  const grupos = Object.entries(data || {}).filter(([, v]) => Array.isArray(v));
  const total = grupos.reduce((s, [, v]) => s + v.length, 0);
  if (!total) return <div style={{ textAlign: 'center', padding: '32px 0', color: C.gray }}>🗂️ Este usuario aún no tiene reservas.</div>;
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <div style={{ ...tarjeta, flex: '1 1 120px', background: C.lightBlue, borderColor: C.lightBlue }}>
          <div style={{ fontSize: '0.72rem', color: C.gray, fontWeight: 600, textTransform: 'uppercase' }}>Total reservas</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.darkBlue }}>{total}</div>
        </div>
        {grupos.map(([k, v]) => (
          <div key={k} style={{ ...tarjeta, flex: '1 1 120px' }}>
            <div style={{ fontSize: '0.72rem', color: C.gray, fontWeight: 600, textTransform: 'uppercase' }}>{VERTICAL_INFO[k]?.icon} {VERTICAL_INFO[k]?.label || etiqueta(k)}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>{v.length}</div>
          </div>
        ))}
      </div>
      {grupos.filter(([, v]) => v.length).map(([k, v]) => (
        <Seccion key={k} titulo={`${VERTICAL_INFO[k]?.icon || ''} ${VERTICAL_INFO[k]?.label || etiqueta(k)}`} contador={v.length}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Código', 'Estado', 'Fecha'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.72rem', color: C.gray, textTransform: 'uppercase' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...v].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map((r, i) => (
                  <tr key={`${r.pnr}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: C.darkBlue, letterSpacing: '0.04em' }}>{r.pnr || '—'}</td>
                    <td style={{ padding: '9px 12px' }}><Badge status={r.estado} /></td>
                    <td style={{ padding: '9px 12px', color: C.gray }}>{fmtDate(r.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      ))}
    </div>
  );
}

function GestionTab({users,usersError,onRetryUsers,reservas,loadingUsers,loadingReservas,onRefresh}) {
  const [vista,setVista]=useState('usuarios');
  const [modal,setModal]=useState(null);
  const [confirmModal,setConfirmModal]=useState(null);

  const btnStyle = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:'1.1rem', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' };

  const requestConfirm = (title, text, color, actionFn) => {
    setConfirmModal({ title, text, color, actionFn });
  };

  const executeConfirm = async () => {
    if (confirmModal && confirmModal.actionFn) {
      await confirmModal.actionFn();
    }
    setConfirmModal(null);
  };

  const execUserAction = async (id, action) => {
    try { 
      await api.put(`/admin/users/${id}/action`, { action });
      alert('Acción ejecutada correctamente.');
      onRefresh(); 
    }
    catch(e) { alert(`Error al ejecutar la acción: ${apiErrorMsg(e)}`); }
  };

  // Modal para que el admin escriba directamente la nueva contraseña del usuario
  const [pwdModal, setPwdModal] = useState(null); // { id, email }
  const [pwdNueva, setPwdNueva] = useState('');
  const [pwdConfirma, setPwdConfirma] = useState('');
  const [pwdVer, setPwdVer] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdGuardando, setPwdGuardando] = useState(false);

  const abrirPwdModal = (u) => { setPwdModal({ id: u.id, email: u.email }); setPwdNueva(''); setPwdConfirma(''); setPwdVer(false); setPwdError(''); };

  const guardarPassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    if (pwdNueva.length < 8) return setPwdError('La contraseña debe tener al menos 8 caracteres.');
    if (pwdNueva !== pwdConfirma) return setPwdError('Las contraseñas no coinciden.');
    setPwdGuardando(true);
    try {
      await api.put(`/admin/users/${pwdModal.id}/action`, { action: 'cambiar_password', password: pwdNueva });
      setPwdModal(null);
      alert(`Contraseña de ${pwdModal.email} actualizada.`);
    } catch (err) {
      setPwdError(apiErrorMsg(err, 'No se pudo cambiar la contraseña'));
    } finally {
      setPwdGuardando(false);
    }
  };

  const handleReservaAction = async (tipo, id, action) => {
    // Hospedaje guardado solo en este navegador (no está en la BD)
    if (tipo === 'hospedaje' && (reservas.hospedaje || []).find(r => r.id === id)?.local) {
      if (action === 'cancelar') {
        let locales = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
        locales = locales.map(r => (r.id === id || r.codigoReserva === id) ? { ...r, status: 'CANCELLED' } : r);
        localStorage.setItem('reservas_alojamientos', JSON.stringify(locales));
      }
      alert(`Acción de ${action} ejecutada exitosamente.`);
      onRefresh();
      return;
    }
    
    // Check if it's a local auto or atraccion
    if (tipo === 'auto' || tipo === 'autos') {
      let locales = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      let index = locales.findIndex(r => (r.id === id || r.orderId === id));
      if (index !== -1) {
        if (action === 'cancelar') {
          locales[index].status = 'CANCELLED';
          localStorage.setItem('reservas_autos', JSON.stringify(locales));
        }
        if (action === 'reenviar') alert(`Comprobante de auto ${id} reenviado virtualmente`);
        alert(`Acción de ${action} ejecutada exitosamente.`);
        onRefresh();
        return;
      }
    }

    if (tipo === 'atraccion' || tipo === 'atracciones') {
      let locales = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      let index = locales.findIndex(r => (r.id === id || r.reservation_id === id));
      if (index !== -1) {
        if (action === 'cancelar') {
          locales[index].status = 'CANCELLED';
          localStorage.setItem('reservas_atracciones', JSON.stringify(locales));
        }
        if (action === 'reenviar') alert(`Comprobante de atracción ${id} reenviado virtualmente`);
        alert(`Acción de ${action} ejecutada exitosamente.`);
        onRefresh();
        return;
      }
    }

    try {
      if (action === 'cancelar') await api.put(`/admin/reservas/${tipo}/${id}/cancelar`);
      if (action === 'reenviar') await api.put(`/admin/reservas/${tipo}/${id}/reenviar`); // Revertido a PUT
      alert(`Acción de ${action} ejecutada exitosamente.`);
      onRefresh();
    } catch(e) { alert('Error al ejecutar la acción en el backend'); }
  };

  const viewHistorial = async (id, email) => {
    try {
      const { data } = await api.get(`/admin/users/${id}/historial`);
      setModal({ type: 'detalles', vista: 'historial', data: data.data, title: 'Historial de reservas', subtitulo: email });
    } catch (e) { alert('Error al obtener historial'); }
  };

  const viewDetalles = async (tipo, id) => {
    if (tipo === 'hospedaje' && (reservas.hospedaje || []).find(r => r.id === id)?.local) {
      const localesAloj = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
      const reservaLocal = localesAloj.find(r => r.id === id || r.codigoReserva === id);
      setModal({ type: 'detalles', vista: 'reserva', tipo, data: reservaLocal || { mensaje: 'No se encontró esta reserva en este navegador.' }, title: 'Detalle de la reserva', subtitulo: `${id} · guardada en este navegador` });
      return;
    }
    
    // Check if it's a local auto or atraccion
    if (tipo === 'auto' || tipo === 'autos') {
      const localesAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      const reservaLocal = localesAutos.find(r => (r.id === id || r.orderId === id));
      if (reservaLocal) {
        setModal({ type: 'detalles', vista: 'reserva', tipo, data: reservaLocal, title: 'Detalle de la reserva', subtitulo: `${id} · guardada en este navegador` });
        return;
      }
    }

    if (tipo === 'atraccion' || tipo === 'atracciones') {
      const localesAtracciones = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      const reservaLocal = localesAtracciones.find(r => (r.id === id || r.reservation_id === id));
      if (reservaLocal) {
        setModal({ type: 'detalles', vista: 'reserva', tipo, data: reservaLocal, title: 'Detalle de la reserva', subtitulo: `${id} · guardada en este navegador` });
        return;
      }
    }

    try {
      const { data } = await api.get(`/admin/reservas/${tipo}/${id}/detalles`);
      setModal({ type: 'detalles', vista: 'reserva', tipo, data: data.data || { mensaje: 'No hay detalles guardados para esta reserva.' }, title: 'Detalle de la reserva', subtitulo: id });
    } catch (e) {
      alert('Error al obtener detalles del backend');
    }
  };
  const VISTAS=[
    {id:'usuarios',label:'👤 Usuarios',count:users.length},
    {id:'vuelos',label:'✈️ Vuelos',count:reservas.vuelos?.length||0},
    {id:'hospedaje',label:'🏨 Hospedaje',count:reservas.hospedaje?.length||0},
    {id:'autos',label:'🚗 Autos',count:reservas.autos?.length||0},
    {id:'atracciones',label:'🎡 Atracciones',count:reservas.atracciones?.length||0},
  ];
  const isLoading=vista==='usuarios'?loadingUsers:loadingReservas;
  const renderTable=()=>{
    if(isLoading) return <div style={{padding:40,textAlign:'center',color:C.gray}}>Cargando...</div>;
    if(vista==='usuarios') {
      const admins = users.filter(u => u.rol === 'admin').length;
      return (
        <div>
          {usersError && (
            <div style={{padding:'16px 16px 0'}}>
              <Alerta tipo="error">
                <strong>Error al cargar usuarios:</strong> {usersError}
                <button type="button" onClick={onRetryUsers} style={{marginLeft:8,background:'transparent',border:`1px solid ${C.red}`,color:C.red,borderRadius:4,padding:'2px 8px',cursor:'pointer'}}>Reintentar</button>
              </Alerta>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,padding:16,background:C.bg,borderBottom:`1px solid ${C.border}`}}>
            <div style={{background:C.white,padding:12,borderRadius:8,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:'0.8rem',color:C.gray}}>Total Usuarios Registrados</div>
              <div style={{fontSize:'1.4rem',fontWeight:700,color:C.darkBlue}}>{users.length}</div>
            </div>
            <div style={{background:C.white,padding:12,borderRadius:8,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:'0.8rem',color:C.gray}}>Administradores</div>
              <div style={{fontSize:'1.4rem',fontWeight:700,color:C.orange}}>{admins}</div>
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
            <thead><tr style={{background:C.lightBlue}}>
              {['Usuario','Rol','Registrado','Último acceso','Acciones'].map(h=>(<th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:C.darkBlue}}>{h}</th>))}
            </tr></thead>
            <tbody>
              {users.map((u,i)=>(
                <tr key={u.id||i} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{fontWeight:600}}>{u.email}</div>
                    {u.nombre&&<div style={{fontSize:'0.75rem',color:C.gray}}>{u.nombre}</div>}
                    {u.status==='bloquear'&&<span style={{fontSize:'0.68rem',color:C.red,fontWeight:700}}>🚫 Bloqueado</span>}
                  </td>
                  <td style={{padding:'9px 14px'}}>
                    <span style={{background:u.rol==='admin'?C.blue:C.border,color:u.rol==='admin'?'white':C.text,padding:'2px 8px',borderRadius:20,fontSize:'0.75rem',fontWeight:600}}>{u.rol||'usuario'}</span>
                  </td>
                  <td style={{padding:'9px 14px',color:C.gray}}>{fmtDate(u.created_at)}</td>
                  <td style={{padding:'9px 14px',color:C.gray}}>{u.last_sign_in?fmtDate(u.last_sign_in):'Nunca'}</td>
                  <td style={{padding:'9px 14px',display:'flex',gap:8}}>
                    {u.rol !== 'admin' && (
                      <>
                        <button onClick={()=>requestConfirm(u.status === 'bloquear' ? "Desbloquear Usuario" : "Bloquear Usuario", `¿Seguro que quieres ${u.status === 'bloquear' ? "desbloquear" : "bloquear"} a ${u.email}?`, u.status === 'bloquear' ? C.green : C.red, ()=>execUserAction(u.id, u.status === 'bloquear' ? 'desbloquear' : 'bloquear'))} title={u.status === 'bloquear' ? "Desbloquear Usuario" : "Bloquear Usuario"} style={btnStyle}>
                          {u.status === 'bloquear' ? '✅' : '🚫'}
                        </button>
                        <button onClick={()=>requestConfirm("Promover a Administrador", `¿Seguro que quieres hacer administrador a ${u.email}?`, C.blue, ()=>execUserAction(u.id, 'promover_admin'))} title="Hacer Administrador" style={btnStyle}>👑</button>
                        <button onClick={()=>viewHistorial(u.id, u.email)} title="Ver Historial" style={btnStyle}>📋</button>
                      </>
                    )}
                    {u.rol === 'admin' && !u.adminFijo && (
                      <button onClick={()=>requestConfirm("Quitar rol de Administrador", `¿Seguro que quieres quitarle el rol de administrador a ${u.email}? Pasará a ser un usuario normal y perderá acceso al panel.`, C.red, ()=>execUserAction(u.id, 'quitar_admin'))} title="Quitar Administrador (volver a usuario)" style={btnStyle}>⬇️</button>
                    )}
                    {u.rol === 'admin' && u.adminFijo && (
                      <span title="Administrador principal definido en el sistema: no se le puede quitar el rol" style={{alignSelf:'center',fontSize:'0.7rem',color:C.gray,fontWeight:600}}>🔒 Principal</span>
                    )}
                    <button onClick={()=>abrirPwdModal(u)} title="Cambiar contraseña" style={btnStyle}>🔑</button>
                  </td>
                </tr>
              ))}
              {users.length===0&&(<tr><td colSpan={5} style={{padding:24,textAlign:'center',color:C.gray}}>{usersError?'No se pudieron cargar los usuarios (ver el error arriba).':'No hay usuarios registrados todavía.'}</td></tr>)}
            </tbody>
          </table>
        </div>
      );
    }
    const rows=reservas[vista]||[];
    const isVuelos = vista === 'vuelos';
    const totalIngresos = rows.reduce((s, r) => s + Number(r.total), 0);

    return (
      <div>
        {isVuelos && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,padding:16,background:C.bg,borderBottom:`1px solid ${C.border}`}}>
            <div style={{background:C.white,padding:12,borderRadius:8,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:'0.8rem',color:C.gray}}>Reservas de Vuelos</div>
              <div style={{fontSize:'1.4rem',fontWeight:700,color:C.darkBlue}}>{rows.length}</div>
            </div>
            <div style={{background:C.white,padding:12,borderRadius:8,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:'0.8rem',color:C.gray}}>Ingresos Totales (Vuelos)</div>
              <div style={{fontSize:'1.4rem',fontWeight:700,color:C.green}}>${fmt(totalIngresos)}</div>
            </div>
          </div>
        )}
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
          <thead><tr style={{background:C.lightBlue}}>
            {['PNR / ID','Estado','Total (USD)',(vista==='atracciones'||vista==='hospedaje')?'Cliente':'Moneda','Fecha','Acciones'].map(h=>(<th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:600,color:C.darkBlue}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.id||i} style={{borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:'9px 14px',fontFamily:'monospace',fontWeight:600}}>
                  {r.pnr}
                  {r.alojamiento && <div style={{fontFamily:'inherit',fontWeight:400,fontSize:'0.75rem',color:C.gray}}>🏨 {r.alojamiento}</div>}
                  {r.local && <div title="Guardada solo en este navegador" style={{fontWeight:400,fontSize:'0.7rem',color:C.orange}}>solo en este navegador</div>}
                </td>
                <td style={{padding:'9px 14px'}}><Badge status={r.estado}/></td>
                <td style={{padding:'9px 14px',fontWeight:600}}>${fmt(r.total)}</td>
                <td style={{padding:'9px 14px',color:C.gray}}>{(vista==='atracciones'||vista==='hospedaje')?(r.cliente||'—'):(r.moneda||'USD')}</td>
                <td style={{padding:'9px 14px',color:C.gray}}>{fmtDate(r.createdAt)}</td>
                <td style={{padding:'9px 14px',display:'flex',gap:8}}>
                  {!['CANCELLED','CANCELADA'].includes(String(r.estado||'').toUpperCase()) && (
                    <button onClick={()=>requestConfirm("Cancelar Reserva", `¿Seguro que deseas cancelar la reserva ${r.pnr}? Esta acción no se puede deshacer.`, C.red, ()=>handleReservaAction(vista, r.id, 'cancelar'))} title="Cancelar Reserva" style={btnStyle}>❌</button>
                  )}
                  <button onClick={()=>requestConfirm("Reenviar Confirmación", `¿Deseas enviar el comprobante de reserva nuevamente al cliente?`, C.blue, ()=>handleReservaAction(vista, r.id, 'reenviar'))} title="Reenviar Confirmación" style={btnStyle}>📧</button>
                  <button onClick={()=>viewDetalles(vista, r.id)} title="Ver Detalles Técnicos" style={btnStyle}>👁️</button>
                </td>
              </tr>
            ))}
            {rows.length===0&&(<tr><td colSpan={6} style={{padding:24,textAlign:'center',color:C.gray}}>Sin registros</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {VISTAS.map(v=>(
          <button key={v.id} onClick={()=>setVista(v.id)} style={{padding:'8px 16px',borderRadius:20,border:`1px solid ${vista===v.id?C.blue:C.border}`,background:vista===v.id?C.blue:C.white,color:vista===v.id?'white':C.text,fontWeight:600,cursor:'pointer',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:6}}>
            {v.label}
            <span style={{background:vista===v.id?'rgba(255,255,255,0.3)':C.border,borderRadius:20,padding:'0 6px',fontSize:'0.75rem'}}>{v.count}</span>
          </button>
        ))}
      </div>
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>{renderTable()}</div>

      {/* Modal de detalles */}
      {modal && modal.type === 'detalles' && (
        <div onClick={()=>setModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:16}}>
          <div role="dialog" aria-modal="true" aria-labelledby="detalle-titulo" onClick={(e)=>e.stopPropagation()} style={{background:C.bg,borderRadius:12,width:'100%',maxWidth:720,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 15px 40px rgba(0,0,0,0.25)',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'16px 20px',background:C.white,borderBottom:`1px solid ${C.border}`}}>
              <div style={{flex:1,minWidth:0}}>
                <h3 id="detalle-titulo" style={{margin:0,fontSize:'1.1rem',color:C.text}}>{modal.title}</h3>
                {modal.subtitulo && <div style={{fontSize:'0.8rem',color:C.gray,marginTop:2,wordBreak:'break-all'}}>{modal.subtitulo}</div>}
              </div>
              <button type="button" onClick={()=>setModal(null)} aria-label="Cerrar" style={{background:'none',border:'none',fontSize:'1.3rem',cursor:'pointer',color:C.gray,lineHeight:1}}>✕</button>
            </div>
            <div style={{overflowY:'auto',flex:1,padding:'16px 20px'}}>
              {modal.vista === 'historial'
                ? <HistorialUsuarioVista data={modal.data} />
                : modal.vista === 'reserva'
                  ? <DetalleReservaVista data={modal.data} tipo={modal.tipo} />
                  : <pre style={{background:C.white,padding:16,borderRadius:6,fontSize:'0.8rem',margin:0}}>{JSON.stringify(modal.data, null, 2)}</pre>}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',padding:'12px 20px',background:C.white,borderTop:`1px solid ${C.border}`}}>
              <button type="button" onClick={()=>setModal(null)} style={{padding:'8px 24px',border:'none',background:C.blue,color:'white',borderRadius:6,cursor:'pointer',fontWeight:600}}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cambiar contraseña */}
      {pwdModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}} onClick={()=>!pwdGuardando && setPwdModal(null)}>
          <form onSubmit={guardarPassword} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pwd-titulo" style={{background:'white',padding:24,borderRadius:12,width:'100%',maxWidth:400,boxShadow:'0 15px 35px rgba(0,0,0,0.2)'}}>
            <h3 id="pwd-titulo" style={{marginTop:0,marginBottom:4,color:C.text}}>🔑 Cambiar contraseña</h3>
            <p style={{fontSize:'0.85rem',color:C.gray,marginTop:0,marginBottom:18,wordBreak:'break-all'}}>{pwdModal.email}</p>
            <label htmlFor="pwd-nueva" style={{display:'block',fontWeight:600,fontSize:'0.85rem',marginBottom:6}}>Nueva contraseña</label>
            <input id="pwd-nueva" type={pwdVer?'text':'password'} autoComplete="new-password" autoFocus value={pwdNueva} onChange={(e)=>setPwdNueva(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',border:`1px solid ${C.border}`,borderRadius:6,marginBottom:12,fontSize:'0.95rem'}} />
            <label htmlFor="pwd-confirma" style={{display:'block',fontWeight:600,fontSize:'0.85rem',marginBottom:6}}>Confirmar contraseña</label>
            <input id="pwd-confirma" type={pwdVer?'text':'password'} autoComplete="new-password" value={pwdConfirma} onChange={(e)=>setPwdConfirma(e.target.value)} style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',border:`1px solid ${C.border}`,borderRadius:6,marginBottom:10,fontSize:'0.95rem'}} />
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.82rem',color:C.gray,marginBottom:14,cursor:'pointer'}}>
              <input type="checkbox" checked={pwdVer} onChange={(e)=>setPwdVer(e.target.checked)} /> Mostrar contraseña
            </label>
            {pwdError && <p role="alert" style={{color:C.red,fontSize:'0.85rem',margin:'0 0 12px'}}>{pwdError}</p>}
            <div style={{display:'flex',gap:12}}>
              <button type="button" disabled={pwdGuardando} onClick={()=>setPwdModal(null)} style={{padding:'10px 20px',border:`1px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,cursor:'pointer',fontWeight:600,flex:1}}>Cancelar</button>
              <button type="submit" disabled={pwdGuardando} style={{padding:'10px 20px',border:'none',background:C.blue,color:'white',borderRadius:8,cursor:pwdGuardando?'wait':'pointer',fontWeight:600,flex:1}}>{pwdGuardando?'Guardando…':'Guardar'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Confirmación Global */}
      {confirmModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:'white',padding:24,borderRadius:12,width:400,boxShadow:'0 15px 35px rgba(0,0,0,0.2)',textAlign:'center'}}>
            <div style={{fontSize:'3rem',marginBottom:10}}>{confirmModal.color === C.red ? '⚠️' : confirmModal.color === C.green ? '✅' : 'ℹ️'}</div>
            <h3 style={{marginTop:0,marginBottom:12,color:C.text}}>{confirmModal.title}</h3>
            <p style={{fontSize:'0.95rem',color:C.gray,marginBottom:24,lineHeight:1.5}}>{confirmModal.text}</p>
            
            <div style={{display:'flex',justifyContent:'center',gap:12}}>
              <button type="button" onClick={()=>setConfirmModal(null)} style={{padding:'10px 20px',border:`1px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,cursor:'pointer',fontWeight:600,flex:1}}>Cancelar</button>
              <button type="button" onClick={executeConfirm} style={{padding:'10px 20px',border:'none',background:confirmModal.color,color:'white',borderRadius:8,cursor:'pointer',fontWeight:600,flex:1}}>Sí, Proceder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// NUEVAS PESTAÑAS (BOOKING.COM CLONE)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS COMPARTIDOS (Finanzas / Ajustes)
// ─────────────────────────────────────────────────────────────────────────────

/** Traduce un error de axios (incluido el formato RFC 7807 del backend) a texto legible. */
function apiErrorMsg(err, fallback = 'Error inesperado') {
  if (!err) return fallback;
  if (!err.response) {
    return err.code === 'ECONNABORTED'
      ? 'El servidor tardó demasiado en responder (timeout). Si el backend en Render estaba dormido, reintenta en unos segundos.'
      : 'No se pudo contactar con el servidor. Verifica tu conexión o el estado del backend.';
  }
  const { status, data } = err.response;
  const detail = data?.detail || data?.message || data?.title;
  // 404 de ruta inexistente (Nest: "Cannot PUT /...") vs 404 lanzado por la lógica (p. ej. usuario no encontrado)
  if (status === 404 && (!detail || /^Cannot (GET|POST|PUT|PATCH|DELETE)/i.test(String(detail)) || detail === 'Not Found')) {
    return `El endpoint no existe en el backend (404 ${err.config?.url || ''}). ¿Está desplegada la última versión?`;
  }
  if ((status === 401 || status === 403) && !detail) return 'No autorizado. Inicia sesión con una cuenta de administrador.';
  return `${Array.isArray(detail) ? detail.join(', ') : (detail || fallback)} (HTTP ${status})`;
}
const isNotFound = (err) => err?.response?.status === 404;

function toNum(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

const SPIN_CSS = '@keyframes adm-spin { to { transform: rotate(360deg); } }';
function Spinner({ size = 14, color = C.white }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${color}55`, borderTopColor: color, borderRadius: '50%', animation: 'adm-spin 0.8s linear infinite', verticalAlign: 'middle', flexShrink: 0 }} />
  );
}

function Alerta({ tipo = 'error', children, onClose }) {
  const pal = {
    success: { bg: '#e8f5e9', fg: C.green, icon: '✅' },
    error: { bg: '#ffebee', fg: C.red, icon: '⚠️' },
    warning: { bg: '#fff3e0', fg: C.orange, icon: 'ℹ️' },
  }[tipo] || { bg: C.lightBlue, fg: C.darkBlue, icon: 'ℹ️' };
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} style={{ background: pal.bg, border: `1px solid ${pal.fg}`, color: pal.fg, borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.85rem' }}>
      <span>{pal.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.45 }}>{children}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: pal.fg, cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  );
}

// ── Configuración global: valores por defecto y normalización ────────────────
const CONFIG_DEFAULTS = { comisionBase: 15, tasaImpuestos: 15, stripeEnabled: true, emailsEnabled: true, maintenanceMode: false };
/** Claves snake_case de la tabla `configuraciones` (clave/valor) -> campos del formulario. */
const CONFIG_CLAVES = { comision_base: 'comisionBase', tasa_impuestos: 'tasaImpuestos', stripe_enabled: 'stripeEnabled', emails_enabled: 'emailsEnabled', maintenance_mode: 'maintenanceMode' };

function toBool(v, def) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return def;
}

/** Acepta `{comisionBase,...}`, `{data:{...}}` o filas `[{clave, valor}]` de la tabla configuraciones. */
function normalizarConfig(raw) {
  let src = raw?.data ?? raw ?? {};
  if (Array.isArray(src)) {
    src = src.reduce((acc, row) => {
      const k = CONFIG_CLAVES[row?.clave] || row?.clave;
      if (k) acc[k] = row.valor;
      return acc;
    }, {});
  }
  return {
    comisionBase: toNum(src.comisionBase, CONFIG_DEFAULTS.comisionBase),
    tasaImpuestos: toNum(src.tasaImpuestos, CONFIG_DEFAULTS.tasaImpuestos),
    stripeEnabled: toBool(src.stripeEnabled, CONFIG_DEFAULTS.stripeEnabled),
    emailsEnabled: toBool(src.emailsEnabled, CONFIG_DEFAULTS.emailsEnabled),
    maintenanceMode: toBool(src.maintenanceMode, CONFIG_DEFAULTS.maintenanceMode),
  };
}

function validarPorcentaje(valor, nombre) {
  if (valor === '' || valor === null || valor === undefined) return `${nombre} es obligatoria.`;
  const n = Number(valor);
  if (!Number.isFinite(n)) return `${nombre} debe ser un número.`;
  if (n < 0 || n > 100) return `${nombre} debe estar entre 0 y 100.`;
  return null;
}

// ── Finanzas (fusionado en Observabilidad) ───────────────────────────────────
const thFin = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: C.darkBlue, whiteSpace: 'nowrap' };
const tdFin = { padding: '9px 14px' };
/**
 * Reservas de hospedaje que solo existen en el localStorage de este navegador
 * (p. ej. hechas sin conexión) y que no están ya en la BD.
 */
function hospedajeSoloLocal(enBd = []) {
  let locales = [];
  try { locales = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]'); } catch { locales = []; }
  const conocidos = new Set(enBd.flatMap(r => [r.id, r.pnr].filter(Boolean).map(String)));
  return locales
    .filter(al => ![al.id, al.codigoReserva, al.reservationId].filter(Boolean).some(x => conocidos.has(String(x))))
    .map(al => ({
      id: al.id || al.codigoReserva,
      tipo: 'hospedaje',
      pnr: al.codigoReserva || String(al.id || 'HOTEL').substring(0, 8).toUpperCase(),
      estado: al.status || 'CONFIRMED',
      total: Number(al.totalPrice?.total ?? al.total ?? 0),
      moneda: al.totalPrice?.currency || 'USD',
      createdAt: al.createdAt || al.fecha || new Date().toISOString().split('T')[0],
      cliente: al.email || al.huesped || '—',
      alojamiento: al.nombreAlojamiento || null,
      local: true,
    }));
}

const VERTICAL_ICON = { vuelos: '✈️', autos: '🚗', atracciones: '🎡', hospedaje: '🏨' };
const VERTICAL_NOMBRE = { vuelos: 'Aerolíneas (Vuelos)', autos: 'Rentadoras (Autos)', atracciones: 'Operadores (Atracciones)', hospedaje: 'Hoteles (Hospedaje)' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtMes(periodo) {
  const [y, m] = String(periodo || '').split('-');
  return m ? `${MESES[Number(m) - 1] || m} ${y}` : periodo || '—';
}

function EstadoLiq({ estado }) {
  const pal = { PAGADO: [C.green, '✅ Pagado'], PARCIAL: [C.blue, '◐ Parcial'], PENDIENTE: [C.orange, '🕐 Pendiente'] }[estado] || [C.gray, estado];
  return <span style={{ background: pal[0] + '1f', color: pal[0], padding: '2px 8px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{pal[1]}</span>;
}

function FinanzasPanel({ refreshKey }) {
  const [fin, setFin] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [aprobando, setAprobando] = useState(null);
  const [filtroLiq, setFiltroLiq] = useState('pendientes');

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const [{ data }, hist] = await Promise.all([
        api.get('/admin/finanzas'),
        api.get('/admin/payouts').catch(() => ({ data: [] })),
      ]);
      setFin(data);
      setHistorial(Array.isArray(hist.data) ? hist.data : []);
    } catch (err) {
      setError(apiErrorMsg(err, 'No se pudieron cargar las finanzas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  const aprobar = async (l) => {
    if (!window.confirm(`¿Aprobar el payout de $${fmt(l.pendiente)} para ${l.proveedor} (${fmtMes(l.periodo)})?\n\nSe registrará como pagado y quedará en auditoría.`)) return;
    setAprobando(l.id);
    setAviso(null);
    try {
      const body = { vertical: l.vertical, periodo: l.periodo };
      const { data } = await api.post('/admin/payouts/aprobar', body);
      setAviso({ tipo: 'success', texto: `${data?.message || 'Payout aprobado.'} Referencia: ${data?.referencia || '—'}` });
      await cargar(true);
    } catch (err) {
      setAviso({ tipo: 'error', texto: `No se pudo aprobar el payout: ${apiErrorMsg(err)}` });
    } finally {
      setAprobando(null);
    }
  };

  if (loading && !fin) {
    return <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 30, textAlign: 'center', color: C.gray }}><style>{SPIN_CSS}</style><Spinner color={C.blue} /> Calculando finanzas reales…</div>;
  }
  if (error && !fin) {
    return <Alerta tipo="error">{error} <button type="button" onClick={() => cargar()} style={{ marginLeft: 8, background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Reintentar</button></Alerta>;
  }

  const r = fin?.resumen || {};
  const liqs = (fin?.liquidaciones || []).filter((l) => (filtroLiq === 'pendientes' ? l.pendiente > 0.009 : true));
  const maxMes = Math.max(1, ...(fin?.porMes || []).map((m) => toNum(m.cobrado)));
  const nPend = (fin?.liquidaciones || []).filter((l) => l.pendiente > 0.009).length;

  return (
    <div>
      <style>{SPIN_CSS}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: '0.8rem', color: C.gray }}>
        <span style={{ background: C.lightBlue, color: C.darkBlue, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>Comisión plataforma: {fin?.config?.comisionBase}%</span>
        <span style={{ background: C.lightBlue, color: C.darkBlue, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>IVA: {fin?.config?.tasaImpuestos}%</span>
        <span>Se cambian en ⚙️ Ajustes · Calculado: {fmtDate(fin?.generadoEn)}</span>
        {loading && <Spinner color={C.blue} size={12} />}
      </div>
      {error && <Alerta tipo="error" onClose={() => setError(null)}>{error}</Alerta>}
      {aviso && <Alerta tipo={aviso.tipo} onClose={() => setAviso(null)}>{aviso.texto}</Alerta>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard icon="💳" label="Cobrado a clientes" value={`$${fmt(r.cobrado)}`} sub={`${r.reservasPagadas || 0} reservas pagadas`} color={C.blue} />
        <KpiCard icon="📈" label="Comisiones (ingreso)" value={`$${fmt(r.comisiones)}`} sub={`${fin?.config?.comisionBase}% del cobrado`} color={C.green} />
        <KpiCard icon="🤝" label="Neto a proveedores" value={`$${fmt(r.netoProveedores)}`} sub="cobrado − comisión" color={C.darkBlue} />
        <KpiCard icon="🏦" label="Pagado a proveedores" value={`$${fmt(r.pagadoProveedores)}`} sub="payouts aprobados" color={C.cyan} />
        <KpiCard icon="⏳" label="Pendiente de pago" value={`$${fmt(r.pendientePago)}`} sub={`${nPend} liquidaciones`} color={C.orange} />
        <KpiCard icon="🧾" label="Por cobrar" value={`$${fmt(r.porCobrar)}`} sub="reservas sin pagar" color={C.yellow} />
        <KpiCard icon="↩️" label="Anulado / reembolsos" value={`$${fmt(r.anulado)}`} sub="canceladas o fallidas" color={C.red} />
        <KpiCard icon="🏛️" label="IVA incluido" value={`$${fmt(r.ivaIncluido)}`} sub={`al ${fin?.config?.tasaImpuestos}%`} color={C.gray} />
        <KpiCard icon="🎟️" label="Ticket promedio" value={`$${fmt(r.ticketPromedio)}`} sub="por reserva pagada" color={'#8e44ad'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>📅 Cobrado por mes (últimos 6)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
            {(fin?.porMes || []).map((m) => (
              <div key={m.periodo} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`Cobrado $${fmt(m.cobrado)} · Comisión $${fmt(m.comision)}`}>
                <span style={{ fontSize: '0.68rem', color: C.gray, whiteSpace: 'nowrap' }}>${Math.round(toNum(m.cobrado)).toLocaleString('es-EC')}</span>
                <div style={{ width: '100%', maxWidth: 42, height: `${Math.max(2, (toNum(m.cobrado) / maxMes) * 110)}px`, background: `linear-gradient(180deg, ${C.blue}, ${C.darkBlue})`, borderRadius: '4px 4px 0 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${toNum(m.cobrado) ? (toNum(m.comision) / toNum(m.cobrado)) * 100 : 0}%`, background: C.green, borderRadius: 0 }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: C.text }}>{fmtMes(m.periodo)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: C.gray, marginTop: 8 }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.blue, borderRadius: 2, marginRight: 4 }} />Cobrado</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: C.green, borderRadius: 2, marginRight: 4 }} />Comisión</span>
          </div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', padding: '16px 20px 8px' }}>🧩 Dinero por vertical</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: C.lightBlue }}>{['Vertical', 'Pagadas', 'Cobrado', 'Comisión', 'Neto prov.', 'Por cobrar'].map((h) => <th key={h} style={thFin}>{h}</th>)}</tr></thead>
              <tbody>
                {(fin?.porVertical || []).map((v) => (
                  <tr key={v.vertical} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdFin}>{VERTICAL_ICON[v.vertical]} <span style={{ textTransform: 'capitalize' }}>{v.vertical}</span>{v.local && <span title="Reservas guardadas en este navegador" style={{ marginLeft: 4, fontSize: '0.65rem', color: C.gray }}>(local)</span>}</td>
                    <td style={tdFin}>{v.pagadas}/{v.reservas}</td>
                    <td style={{ ...tdFin, fontWeight: 600 }}>${fmt(v.cobrado)}</td>
                    <td style={{ ...tdFin, color: C.green }}>${fmt(v.comision)}</td>
                    <td style={tdFin}>${fmt(v.neto)}</td>
                    <td style={{ ...tdFin, color: C.orange }}>${fmt(v.porCobrar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle badge={nPend ? `${nPend} pendientes` : null}>🏦 Liquidaciones a proveedores (Payouts)</SectionTitle>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['pendientes', 'Pendientes'], ['todas', 'Todas']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFiltroLiq(id)} style={{ background: filtroLiq === id ? C.blue : C.white, color: filtroLiq === id ? 'white' : C.text, border: `1px solid ${filtroLiq === id ? C.blue : C.border}`, borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead><tr style={{ background: C.lightBlue }}>{['Proveedor', 'Periodo', 'Reservas', 'Bruto', 'Comisión', 'Neto', 'Pagado', 'Pendiente', 'Estado', 'Acción'].map((h) => <th key={h} style={thFin}>{h}</th>)}</tr></thead>
          <tbody>
            {liqs.map((l) => (
              <tr key={l.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...tdFin, fontWeight: 600 }}>{VERTICAL_ICON[l.vertical]} {l.proveedor}</td>
                <td style={tdFin}>{fmtMes(l.periodo)}</td>
                <td style={tdFin}>{l.reservas}</td>
                <td style={tdFin}>${fmt(l.bruto)}</td>
                <td style={{ ...tdFin, color: C.red }}>−${fmt(l.comision)} <span style={{ color: C.gray, fontSize: '0.72rem' }}>({l.comisionPct}%)</span></td>
                <td style={{ ...tdFin, fontWeight: 600 }}>${fmt(l.neto)}</td>
                <td style={{ ...tdFin, color: C.green }}>${fmt(l.pagado)}</td>
                <td style={{ ...tdFin, fontWeight: 700, color: l.pendiente > 0.009 ? C.orange : C.gray }}>${fmt(l.pendiente)}</td>
                <td style={tdFin}><EstadoLiq estado={l.estado} />{l.aprobadoPor && <div style={{ fontSize: '0.68rem', color: C.gray, marginTop: 2 }}>por {l.aprobadoPor}</div>}</td>
                <td style={tdFin}>
                  {l.pendiente > 0.009 ? (
                    <button type="button" onClick={() => aprobar(l)} disabled={!!aprobando} style={{ background: C.green, color: 'white', border: 'none', borderRadius: 4, padding: '5px 10px', cursor: aprobando ? 'wait' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: aprobando && aprobando !== l.id ? 0.5 : 1 }}>
                      {aprobando === l.id && <Spinner size={12} />} Aprobar Payout
                    </button>
                  ) : <span style={{ color: C.gray, fontSize: '0.8rem' }}>—</span>}
                </td>
              </tr>
            ))}
            {liqs.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: C.gray }}>
                {filtroLiq === 'pendientes' ? 'No hay payouts pendientes. Todo está liquidado. ✅' : 'Aún no hay reservas pagadas para liquidar.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <div>
          <SectionTitle>💸 Últimos movimientos</SectionTitle>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: C.lightBlue, position: 'sticky', top: 0 }}>{['Fecha', 'Tipo', 'Ref', 'Estado', 'Monto', 'Comisión'].map((h) => <th key={h} style={thFin}>{h}</th>)}</tr></thead>
              <tbody>
                {(fin?.ultimosMovimientos || []).map((m, i) => (
                  <tr key={`${m.vertical}-${m.id}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...tdFin, color: C.gray, whiteSpace: 'nowrap' }}>{fmtDate(m.fecha)}</td>
                    <td style={tdFin}>{VERTICAL_ICON[m.vertical]}</td>
                    <td style={{ ...tdFin, fontFamily: 'monospace', fontWeight: 600 }}>{m.ref}</td>
                    <td style={tdFin}><Badge status={m.estado} /></td>
                    <td style={{ ...tdFin, fontWeight: 600, color: m.clase === 'anulado' ? C.gray : C.text, textDecoration: m.clase === 'anulado' ? 'line-through' : 'none' }}>${fmt(m.monto)}</td>
                    <td style={{ ...tdFin, color: C.green }}>{m.comision ? `$${fmt(m.comision)}` : '—'}</td>
                  </tr>
                ))}
                {(fin?.ultimosMovimientos || []).length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: C.gray }}>Sin movimientos aún</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <SectionTitle>📜 Historial de payouts aprobados</SectionTitle>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: C.lightBlue, position: 'sticky', top: 0 }}>{['Fecha', 'Proveedor', 'Periodo', 'Pagado', 'Referencia', 'Aprobó'].map((h) => <th key={h} style={thFin}>{h}</th>)}</tr></thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...tdFin, color: C.gray, whiteSpace: 'nowrap' }}>{fmtDate(h.aprobadoEn)}</td>
                    <td style={tdFin}>{VERTICAL_ICON[h.vertical]} {h.proveedor}</td>
                    <td style={tdFin}>{fmtMes(h.periodo)}</td>
                    <td style={{ ...tdFin, fontWeight: 700, color: C.green }}>${fmt(toNum(h.pagado))}</td>
                    <td style={{ ...tdFin, fontFamily: 'monospace', fontSize: '0.72rem' }}>{h.referencia}</td>
                    <td style={{ ...tdFin, fontSize: '0.75rem' }}>{h.aprobadoPor || '—'}</td>
                  </tr>
                ))}
                {historial.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: C.gray }}>Todavía no se ha aprobado ningún payout</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Moderación: solicitudes "Quiero ser proveedor" (datos reales de la BD) ──
const TIPO_PROV = { hospedaje: '🏨 Hospedaje', vuelos: '✈️ Vuelos', autos: '🚗 Autos', atracciones: '🎡 Atracciones' };
const ESTADO_SOL = {
  PENDIENTE: { label: 'Pendiente', color: C.orange },
  APROBADA: { label: 'Aprobada', color: C.green },
  RECHAZADA: { label: 'Rechazada', color: C.red },
};

function SolicitudesProveedorPanel() {
  const [data, setData] = useState({ items: [], resumen: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('PENDIENTE');
  const [abierta, setAbierta] = useState(null);
  const [notas, setNotas] = useState({});
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/proveedores/solicitudes');
      setData({ items: Array.isArray(data?.items) ? data.items : [], resumen: data?.resumen || {} });
    } catch (err) {
      setError(apiErrorMsg(err, 'No se pudieron cargar las solicitudes de proveedores'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const revisar = async (sol, accion) => {
    const nota = (notas[sol.id] || '').trim();
    if (accion === 'rechazar' && !nota) {
      setAviso({ tipo: 'error', texto: `Escribe el motivo del rechazo de ${sol.empresa}.` });
      setAbierta(sol.id);
      return;
    }
    setGuardando(sol.id);
    setAviso(null);
    try {
      const { data: act } = await api.put(`/admin/proveedores/solicitudes/${sol.id}`, { accion, nota: nota || undefined });
      setData((d) => {
        const items = d.items.map((i) => (i.id === sol.id ? act : i));
        const r = { total: items.length, pendientes: 0, aprobadas: 0, rechazadas: 0 };
        items.forEach((i) => { if (i.estado === 'PENDIENTE') r.pendientes++; else if (i.estado === 'APROBADA') r.aprobadas++; else r.rechazadas++; });
        return { items, resumen: r };
      });
      setAviso({ tipo: 'success', texto: `${act.empresa} fue ${act.estado === 'APROBADA' ? 'aprobado como proveedor' : 'rechazado'}. Quedó registrado en Auditoría.` });
      setAbierta(null);
    } catch (err) {
      setAviso({ tipo: 'error', texto: `No se pudo ${accion} la solicitud: ${apiErrorMsg(err)}` });
    } finally {
      setGuardando(null);
    }
  };

  const r = data.resumen || {};
  const visibles = data.items.filter((i) => filtro === 'TODAS' || i.estado === filtro);
  const filtros = [['PENDIENTE', 'Pendientes', r.pendientes], ['APROBADA', 'Aprobadas', r.aprobadas], ['RECHAZADA', 'Rechazadas', r.rechazadas], ['TODAS', 'Todas', r.total]];

  return (
    <div style={{ marginBottom: 24 }}>
      <style>{SPIN_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <SectionTitle badge={r.pendientes ? `${r.pendientes} pendiente${r.pendientes === 1 ? '' : 's'}` : null}>🛂 Moderación — Solicitudes de nuevos proveedores</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filtros.map(([id, label, n]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)} style={{ background: filtro === id ? C.blue : C.white, color: filtro === id ? 'white' : C.text, border: `1px solid ${filtro === id ? C.blue : C.border}`, borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              {label} {n ? `(${n})` : ''}
            </button>
          ))}
          <button type="button" onClick={cargar} title="Recargar" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>↻</button>
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: C.gray, marginBottom: 12 }}>
        Llegan desde el formulario público <a href="/proveedores/registro" target="_blank" rel="noreferrer" style={{ color: C.blue }}>/proveedores/registro</a> (botón “Quiero ser proveedor”).
      </div>

      {error && <Alerta tipo="error" onClose={() => setError(null)}>{error} <button type="button" onClick={cargar} style={{ marginLeft: 8, background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Reintentar</button></Alerta>}
      {aviso && <Alerta tipo={aviso.tipo} onClose={() => setAviso(null)}>{aviso.texto}</Alerta>}

      {loading ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, textAlign: 'center', color: C.gray }}><Spinner color={C.blue} /> Cargando solicitudes…</div>
      ) : visibles.length === 0 ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, textAlign: 'center', color: C.gray }}>
          {filtro === 'PENDIENTE' ? 'No hay solicitudes pendientes. ✅' : 'No hay solicitudes en este estado.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {visibles.map((s) => {
            const est = ESTADO_SOL[s.estado] || { label: s.estado, color: C.gray };
            const abierto = abierta === s.id;
            return (
              <div key={s.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: `4px solid ${est.color}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text, wordBreak: 'break-word' }}>{s.empresa}</div>
                    <div style={{ fontSize: '0.75rem', color: C.gray }}>{s.codigo} · {fmtDate(s.creadaEn)}</div>
                  </div>
                  <span style={{ background: est.color + '22', color: est.color, padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{est.label}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: C.text, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
                  <span style={{ color: C.gray }}>Servicio</span><span>{TIPO_PROV[s.tipo] || s.tipo}</span>
                  <span style={{ color: C.gray }}>RUC</span><span style={{ fontFamily: 'monospace' }}>{s.ruc}</span>
                  <span style={{ color: C.gray }}>Contacto</span><span>{s.contactoNombre}</span>
                  <span style={{ color: C.gray }}>Correo</span><a href={`mailto:${s.email}`} style={{ color: C.blue, wordBreak: 'break-all' }}>{s.email}</a>
                  <span style={{ color: C.gray }}>Teléfono</span><span>{s.telefono}</span>
                  {s.ciudad && <><span style={{ color: C.gray }}>Ciudad</span><span>{s.ciudad}</span></>}
                  {s.sitioWeb && <><span style={{ color: C.gray }}>Web</span><a href={s.sitioWeb} target="_blank" rel="noreferrer" style={{ color: C.blue, wordBreak: 'break-all' }}>{s.sitioWeb}</a></>}
                </div>
                {s.descripcion && <div style={{ fontSize: '0.82rem', color: C.gray, background: C.bg, borderRadius: 6, padding: '8px 10px', lineHeight: 1.4 }}>{s.descripcion}</div>}

                {s.estado === 'PENDIENTE' ? (
                  <>
                    {abierto && (
                      <textarea aria-label={`Nota para ${s.empresa}`} rows={2} placeholder="Nota o motivo (obligatorio para rechazar)" value={notas[s.id] || ''} onChange={(e) => setNotas((n) => ({ ...n, [s.id]: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button type="button" disabled={!!guardando} onClick={() => revisar(s, 'aprobar')} style={{ flex: 1, background: C.green, color: 'white', border: 'none', borderRadius: 4, padding: '7px', cursor: guardando ? 'wait' : 'pointer', fontWeight: 600, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                        {guardando === s.id && <Spinner size={12} />} Aprobar
                      </button>
                      <button type="button" disabled={!!guardando} onClick={() => (abierto ? revisar(s, 'rechazar') : setAbierta(s.id))} style={{ flex: 1, background: C.red, color: 'white', border: 'none', borderRadius: 4, padding: '7px', cursor: guardando ? 'wait' : 'pointer', fontWeight: 600 }}>
                        {abierto ? 'Confirmar rechazo' : 'Rechazar'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: C.gray, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                    {s.estado === 'APROBADA' ? 'Aprobada' : 'Rechazada'} por {s.revisadoPor || 'admin'} · {fmtDate(s.revisadoEn)}
                    {s.notaAdmin && <div style={{ marginTop: 4, color: C.text }}>“{s.notaAdmin}”</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SoporteTab() {
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [resolutionText, setResolutionText] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    async function fetchTickets() {
      try {
        const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setTickets(data || []);
      } catch (err) {
        console.error('Error fetching tickets:', err);
      } finally {
        setLoadingTickets(false);
      }
    }
    fetchTickets();
  }, []);

  const updateTicket = async (ticketId, status, resolution) => {
    setSavingId(ticketId);
    try {
      const updates = { status };
      if (resolution !== undefined) {
        updates.resolution = resolution;
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = 'admin@booking.ec';
      }
      const { error } = await supabase.from('support_tickets').update(updates).eq('id', ticketId);
      if (error) throw error;
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updates } : t));
      if (status === 'RESOLVED' || status === 'REJECTED') setExpandedId(null);
    } catch (err) {
      console.error('Error updating ticket:', err);
    } finally {
      setSavingId(null);
    }
  };

  const ST_LABEL = { PENDING: '🕐 Pendiente', IN_REVIEW: '🔍 En revisión', RESOLVED: '✅ Resuelto', REJECTED: '❌ Rechazado' };

  return (
    <div>
      <div style={{ background: '#fff3e0', border: '1px solid #e65100', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>🎧</span>
        <span style={{ fontSize: '0.85rem', color: '#e65100' }}>
          <strong>Soporte y Moderación (QC).</strong> Gestión de tickets de clientes y aprobación de nuevos listados.
        </span>
      </div>

      <SolicitudesProveedorPanel />

      <SectionTitle>🎫 Tickets de Soporte (Helpdesk)</SectionTitle>

      {loadingTickets && (
        <div style={{ textAlign: 'center', padding: '30px', color: C.gray }}>Cargando tickets...</div>
      )}
      {!loadingTickets && tickets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px', color: C.gray, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          No hay tickets de soporte reportados aún.
        </div>
      )}

      {!loadingTickets && tickets.map(t => {
        const isExpanded = expandedId === t.id;
        const priColor = t.priority === 'Alta' ? C.red : t.priority === 'Media' ? C.orange : C.text;
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

        return (
          <div key={t.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            {/* Row header */}
            <div
              style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 80px 140px 36px', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: '8px' }}
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
            >
              <div style={{ fontWeight: 700, color: C.blue, fontSize: '0.82rem' }}>#{t.id}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.client_name}</div>
                <div style={{ fontSize: '0.78rem', color: C.gray }}>{t.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.88rem' }}>{t.subject}</div>
                <div style={{ fontSize: '0.78rem', color: C.gray }}>{t.entity_name} · {t.pnr_or_id}</div>
              </div>
              <div style={{ fontWeight: 700, color: priColor, fontSize: '0.85rem' }}>{t.priority}</div>
              <div>
                <Badge status={t.status} />
                <div style={{ fontSize: '0.72rem', color: C.gray, marginTop: 2 }}>{dateStr}</div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: C.gray }}>{isExpanded ? '▲' : '▼'}</div>
            </div>

            {/* Expanded panel */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px', background: '#fafafa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: C.gray, marginBottom: 4 }}>DESCRIPCIÓN DEL USUARIO</div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: C.text, lineHeight: 1.5, background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>{t.description}</p>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: C.gray, marginBottom: 4 }}>CAMBIAR ESTADO</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'].map(s => (
                        <button
                          key={s}
                          disabled={t.status === s || savingId === t.id}
                          onClick={() => updateTicket(t.id, s, s === 'RESOLVED' ? (resolutionText[t.id] || t.resolution) : undefined)}
                          style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${t.status === s ? C.blue : C.border}`, background: t.status === s ? C.lightBlue : 'white', color: t.status === s ? C.darkBlue : C.text, fontWeight: t.status === s ? 700 : 400, cursor: t.status === s ? 'default' : 'pointer', fontSize: '0.78rem', opacity: savingId === t.id ? 0.6 : 1 }}
                        >
                          {ST_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: C.gray, marginBottom: 4 }}>
                    RESOLUCIÓN / RESPUESTA AL USUARIO {t.resolution && <span style={{ color: C.green }}>(ya tiene resolución)</span>}
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Escribe la resolución o respuesta que verá el usuario..."
                    value={resolutionText[t.id] ?? (t.resolution || '')}
                    onChange={e => setResolutionText(prev => ({ ...prev, [t.id]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: '0.88rem', boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => updateTicket(t.id, 'IN_REVIEW', undefined)}
                    disabled={t.status === 'IN_REVIEW' || savingId === t.id}
                    style={{ padding: '7px 14px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                  >
                    🔍 Marcar En Revisión
                  </button>
                  <button
                    onClick={() => updateTicket(t.id, 'RESOLVED', resolutionText[t.id] || t.resolution || '')}
                    disabled={savingId === t.id}
                    style={{ padding: '7px 14px', background: C.green, color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', opacity: savingId === t.id ? 0.6 : 1 }}
                  >
                    {savingId === t.id ? 'Guardando...' : '✅ Resolver y Notificar'}
                  </button>
                  <button
                    onClick={() => updateTicket(t.id, 'REJECTED', resolutionText[t.id] || '')}
                    disabled={savingId === t.id}
                    style={{ padding: '7px 14px', background: C.red, color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}
                  >
                    ❌ Rechazar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Auditoría (datos reales: admin_audit_logs + eventos del sistema) ─────────
const AUD_CATEGORIAS = { usuario: '👤 Usuarios', sesion: '🔐 Sesiones', reserva: '🎫 Reservas', soporte: '🎧 Soporte', liquidacion: '🏦 Payouts', config: '⚙️ Ajustes', proveedor: '🤝 Proveedores' };
const AUD_POR_PAGINA = 25;

function catLabel(c) {
  if (AUD_CATEGORIAS[c]) return AUD_CATEGORIAS[c];
  if (String(c).startsWith('reserva')) return AUD_CATEGORIAS.reserva;
  return c;
}
function catGrupo(c) { return String(c).startsWith('reserva') ? 'reserva' : c; }

function tiempoRelativo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60) return 'hace segundos';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / 86400)} d`;
  return '';
}

function exportarCsv(filas) {
  const cols = ['fecha', 'origen', 'categoria', 'actor', 'accion', 'entidad', 'detalle', 'ip'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AuditoriaTab({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [origen, setOrigen] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/auditoria', { params: { limit: 500 } });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(apiErrorMsg(err, 'No se pudo cargar la auditoría'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);
  useEffect(() => { setPagina(1); }, [origen, categoria, busqueda]);

  const q = busqueda.trim().toLowerCase();
  const filtrados = items.filter((i) =>
    (origen === 'todos' || i.origen === origen)
    && (categoria === 'todas' || catGrupo(i.categoria) === categoria)
    && (!q || [i.actor, i.accion, i.entidad, i.detalle, i.ip].some((v) => String(v || '').toLowerCase().includes(q))));
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / AUD_POR_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * AUD_POR_PAGINA, pagina * AUD_POR_PAGINA);
  const categorias = [...new Set(items.map((i) => catGrupo(i.categoria)))];
  const hoy = new Date().toDateString();
  const nHoy = items.filter((i) => new Date(i.fecha).toDateString() === hoy).length;

  const selStyle = { padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: '0.85rem' };

  return (
    <div>
      <style>{SPIN_CSS}</style>
      <div style={{ background: C.lightBlue, border: `1px solid ${C.blue}`, borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>🛡️</span>
        <span style={{ fontSize: '0.85rem', color: C.darkBlue, flex: 1 }}>
          <strong>Registro de Auditoría.</strong> Acciones del equipo de administración (usuarios, reservas, payouts, ajustes, tickets) y eventos del sistema (registros, inicios de sesión y reservas) leídos de la base de datos.
        </span>
        {loading && <Spinner color={C.blue} size={14} />}
      </div>

      {error && <Alerta tipo="error" onClose={() => setError(null)}>{error} <button type="button" onClick={cargar} style={{ marginLeft: 8, background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Reintentar</button></Alerta>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard icon="📚" label="Eventos registrados" value={items.length} color={C.blue} />
        <KpiCard icon="🧑‍💼" label="Acciones de admin" value={items.filter((i) => i.origen === 'ADMIN').length} color={C.darkBlue} />
        <KpiCard icon="🖥️" label="Eventos del sistema" value={items.filter((i) => i.origen === 'SISTEMA').length} color={C.cyan} />
        <KpiCard icon="📅" label="Hoy" value={nHoy} color={C.green} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input type="search" placeholder="Buscar por usuario, acción, entidad, IP…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...selStyle, flex: '1 1 240px' }} aria-label="Buscar en auditoría" />
        <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={selStyle} aria-label="Origen">
          <option value="todos">Todos los orígenes</option>
          <option value="ADMIN">Solo administración</option>
          <option value="SISTEMA">Solo sistema</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selStyle} aria-label="Categoría">
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
        <button type="button" onClick={() => exportarCsv(filtrados)} disabled={!filtrados.length} style={{ ...selStyle, cursor: filtrados.length ? 'pointer' : 'not-allowed', fontWeight: 600 }}>⬇️ Exportar CSV</button>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: C.lightBlue }}>
              {['Fecha y hora', 'Origen', 'Usuario / Actor', 'Acción', 'Entidad afectada', 'Detalle', 'IP'].map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: C.darkBlue, whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((log) => (
              <tr key={log.id} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: 'top' }}>
                <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                  <div>{fmtDate(log.fecha)}</div>
                  <div style={{ fontSize: '0.7rem', color: C.gray }}>{tiempoRelativo(log.fecha)}</div>
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ background: log.origen === 'ADMIN' ? C.darkBlue : C.border, color: log.origen === 'ADMIN' ? 'white' : C.text, padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700 }}>{log.origen === 'ADMIN' ? 'Admin' : 'Sistema'}</span>
                </td>
                <td style={{ padding: '9px 14px', fontWeight: 600, color: C.darkBlue, wordBreak: 'break-all' }}>{log.actor}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ background: C.lightBlue, padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{log.accion}</span>
                  <div style={{ fontSize: '0.68rem', color: C.gray, marginTop: 3 }}>{catLabel(log.categoria)}</div>
                </td>
                <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{log.entidad}</td>
                <td style={{ padding: '9px 14px', color: C.gray, fontSize: '0.78rem', maxWidth: 280 }}>{log.detalle || '—'}</td>
                <td style={{ padding: '9px 14px', color: C.gray, fontSize: '0.78rem', fontFamily: 'monospace' }}>{log.ip || '—'}</td>
              </tr>
            ))}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: C.gray }}>
                {items.length ? 'Ningún evento coincide con los filtros.' : 'Aún no hay eventos registrados.'}
              </td></tr>
            )}
            {loading && items.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: C.gray }}>Cargando registros…</td></tr>}
          </tbody>
        </table>
      </div>

      {filtrados.length > AUD_POR_PAGINA && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: '0.82rem', color: C.gray }}>
          <span>{filtrados.length} eventos · página {pagina} de {totalPaginas}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1} style={{ ...selStyle, cursor: pagina === 1 ? 'not-allowed' : 'pointer' }}>‹ Anterior</button>
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} style={{ ...selStyle, cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer' }}>Siguiente ›</button>
          </div>
        </div>
      )}
    </div>
  );
}

const aFormularioConfig = (cfg) => ({ ...cfg, comisionBase: String(cfg.comisionBase), tasaImpuestos: String(cfg.tasaImpuestos) });
const configIgual = (a, b) => !!a && !!b && Object.keys(CONFIG_DEFAULTS).every((k) => a[k] === b[k]);

function ToggleAjuste({ titulo, descripcion, checked, onChange, disabled, color = C.green, tituloColor, ultimo }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: ultimo ? 0 : 16, paddingBottom: ultimo ? 0 : 16, borderBottom: ultimo ? 'none' : `1px solid ${C.border}`, cursor: disabled ? 'default' : 'pointer' }}>
      <div>
        <div style={{ fontWeight: 700, color: tituloColor || C.text }}>{titulo}</div>
        <div style={{ fontSize: '0.8rem', color: C.gray }}>{descripcion}</div>
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ transform: 'scale(1.5)', accentColor: color, cursor: disabled ? 'default' : 'pointer' }} />
    </label>
  );
}

function ConfiguracionTab() {
  const [form, setForm] = useState(() => aFormularioConfig(CONFIG_DEFAULTS));
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null); // { tipo, texto }

  const cargar = useCallback(async () => {
    setLoading(true);
    setMensaje(null);
    setErrores({});
    try {
      const { data } = await api.get('/admin/config');
      const cfg = normalizarConfig(data);
      setOriginal(cfg);
      setForm(aFormularioConfig(cfg));
    } catch (err) {
      const cfg = { ...CONFIG_DEFAULTS };
      setOriginal(cfg);
      setForm(aFormularioConfig(cfg));
      setMensaje(isNotFound(err)
        ? { tipo: 'warning', texto: 'GET /admin/config aún no existe en el backend. Se muestran los valores por defecto; guardar fallará hasta que se cree PUT /admin/config.' }
        : { tipo: 'error', texto: `No se pudo cargar la configuración actual: ${apiErrorMsg(err)} Se muestran los valores por defecto.` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (mensaje?.tipo !== 'success') return undefined;
    const t = setTimeout(() => setMensaje(null), 4000);
    return () => clearTimeout(t);
  }, [mensaje]);

  // ── Handlers ──
  const onPorcentaje = (campo, etiqueta) => (e) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((er) => ({ ...er, [campo]: validarPorcentaje(valor, etiqueta) }));
  };
  const onComisionChange = onPorcentaje('comisionBase', 'La comisión');
  const onImpuestosChange = onPorcentaje('tasaImpuestos', 'La tasa de impuestos');
  const onToggle = (campo) => (e) => {
    const checked = e.target.checked;
    setForm((f) => ({ ...f, [campo]: checked }));
  };

  const payload = {
    comisionBase: Number(form.comisionBase),
    tasaImpuestos: Number(form.tasaImpuestos),
    stripeEnabled: form.stripeEnabled,
    emailsEnabled: form.emailsEnabled,
    maintenanceMode: form.maintenanceMode,
  };
  const hayErrores = Boolean(errores.comisionBase || errores.tasaImpuestos);
  const hayCambios = !!original && !configIgual(payload, original);
  const bloqueado = loading || saving;

  const descartar = () => {
    if (!original) return;
    setForm(aFormularioConfig(original));
    setErrores({});
    setMensaje(null);
  };

  const guardar = async () => {
    const nuevos = {
      comisionBase: validarPorcentaje(form.comisionBase, 'La comisión'),
      tasaImpuestos: validarPorcentaje(form.tasaImpuestos, 'La tasa de impuestos'),
    };
    setErrores(nuevos);
    if (nuevos.comisionBase || nuevos.tasaImpuestos) {
      setMensaje({ tipo: 'error', texto: 'Corrige los campos marcados antes de guardar.' });
      return;
    }
    if (payload.maintenanceMode && !original?.maintenanceMode
      && !window.confirm('Activar el Modo Mantenimiento bloqueará el acceso público a toda la plataforma. ¿Deseas continuar?')) {
      return;
    }
    setSaving(true);
    setMensaje(null);
    try {
      const body = { ...payload };
      const { data } = await api.put('/admin/config', body);
      // Si el backend devuelve la configuración persistida, se usa como fuente de verdad.
      const src = data?.data ?? data;
      const devuelveConfig = Array.isArray(src) || (src && typeof src === 'object' && Object.keys(CONFIG_DEFAULTS).some((k) => k in src));
      const cfg = devuelveConfig ? normalizarConfig(Array.isArray(src) ? src : { ...body, ...src }) : body;
      setOriginal(cfg);
      setForm(aFormularioConfig(cfg));
      setMensaje({ tipo: 'success', texto: 'Configuración guardada correctamente.' });
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: isNotFound(err)
          ? 'PUT /admin/config todavía no existe en el backend. Los cambios NO se guardaron.'
          : `No se pudieron guardar los cambios: ${apiErrorMsg(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (err) => ({ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 6, border: `1px solid ${err ? C.red : C.border}`, background: bloqueado ? C.bg : C.white, outline: 'none' });
  const errStyle = { fontSize: '0.75rem', color: C.red, marginTop: 4 };

  return (
    <div>
      <style>{SPIN_CSS}</style>
      <div style={{ background: '#f5f5f5', border: `1px solid ${C.gray}`, borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>⚙️</span>
        <span style={{ fontSize: '0.85rem', color: C.text, flex: 1 }}>
          <strong>Ajustes Globales del Sistema.</strong> Configuración central del comportamiento de la plataforma Booking Ecuador.
        </span>
        {loading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: C.gray }}><Spinner color={C.blue} size={12} /> Cargando…</span>}
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} onClose={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Panel Finanzas Globales */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px' }}>
          <SectionTitle badge="Global">Finanzas y Comisiones</SectionTitle>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cfg-comision" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>Comisión Base de la Plataforma (%)</label>
            <input id="cfg-comision" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={form.comisionBase} onChange={onComisionChange} disabled={bloqueado} aria-invalid={!!errores.comisionBase} style={inputStyle(errores.comisionBase)} />
            {errores.comisionBase
              ? <div style={errStyle}>{errores.comisionBase}</div>
              : <div style={{ fontSize: '0.75rem', color: C.gray, marginTop: 4 }}>Se descuenta del total de cada reserva al liquidar al proveedor.</div>}
          </div>
          <div>
            <label htmlFor="cfg-iva" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>Tasa de Impuestos (IVA %)</label>
            <input id="cfg-iva" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={form.tasaImpuestos} onChange={onImpuestosChange} disabled={bloqueado} aria-invalid={!!errores.tasaImpuestos} style={inputStyle(errores.tasaImpuestos)} />
            {errores.tasaImpuestos && <div style={errStyle}>{errores.tasaImpuestos}</div>}
          </div>
        </div>

        {/* Panel Integraciones */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px' }}>
          <SectionTitle badge="APIs">Pasarelas y Servicios</SectionTitle>
          <ToggleAjuste titulo="Pasarela de Pagos (Stripe – Test Mode)" descripcion="Si se apaga, se avisa en toda la web que los pagos en línea están suspendidos" checked={form.stripeEnabled} onChange={onToggle('stripeEnabled')} disabled={bloqueado} />
          <ToggleAjuste titulo="Envío de Emails (SMTP)" descripcion="Si se apaga, el backend deja de enviar facturas/comprobantes por correo" checked={form.emailsEnabled} onChange={onToggle('emailsEnabled')} disabled={bloqueado} />
          <ToggleAjuste titulo="Modo Mantenimiento" tituloColor={C.red} color={C.red} descripcion="Muestra una pantalla de mantenimiento a todos los visitantes (los administradores siguen entrando)" checked={form.maintenanceMode} onChange={onToggle('maintenanceMode')} disabled={bloqueado} ultimo />
        </div>
      </div>

      {/* Barra de acciones (un único PUT guarda todos los ajustes) */}
      <div style={{ marginTop: 20, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: hayCambios ? C.orange : C.gray, fontWeight: hayCambios ? 600 : 400 }}>
          {loading ? 'Obteniendo configuración actual…' : hayCambios ? '● Tienes cambios sin guardar' : 'Sin cambios pendientes'}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={descartar} disabled={!hayCambios || saving} style={{ background: C.white, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 16px', cursor: !hayCambios || saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: !hayCambios || saving ? 0.55 : 1 }}>
            Descartar
          </button>
          <button type="button" onClick={guardar} disabled={bloqueado || hayErrores || !hayCambios} style={{ background: C.blue, color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: bloqueado || hayErrores || !hayCambios ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: bloqueado || hayErrores || !hayCambios ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {saving && <Spinner size={13} />}
            {saving ? 'Guardando…' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [activeTab,setActiveTab]=useState('observabilidad');
  const [stats,setStats]=useState(null);
  const [users,setUsers]=useState([]);
  const [usersError,setUsersError]=useState(null);
  const [refreshKey,setRefreshKey]=useState(0);
  const [reservas,setReservas]=useState({vuelos:[],autos:[],atracciones:[],hospedaje:[]});
  const [serviceHealth,setServiceHealth]=useState([]);
  const [loadingStats,setLoadingStats]=useState(true);
  const [loadingUsers,setLoadingUsers]=useState(false);
  const [loadingReservas,setLoadingReservas]=useState(false);
  const [lastRefresh,setLastRefresh]=useState(null);

  const checkServices=useCallback(async()=>{
    const endpoints=[
      {label:'Módulo Vuelos',url:'/vuelos/bookings?limit=1'},
      {label:'Módulo Autos',url:'/autos/orders'},
      {label:'Módulo Atracciones',url:'/atracciones?page=1&limit=1'},
      {label:'Módulo Hospedaje',url:'/alojamientos?page=1&limit=1'},
      {label:'Módulo Chatbot',url:'/chatbot/estado'},
      {label:'Módulo Admin (Stats)',url:'/admin/stats'},
    ];
    const results=await Promise.all(endpoints.map(async(e)=>{
      const t0=Date.now();
      try{await api.get(e.url);return{label:e.label,ok:true,latency:Date.now()-t0};}
      catch{return{label:e.label,ok:false,latency:Date.now()-t0};}
    }));
    setServiceHealth(results);
  },[]);

  const fetchStats=useCallback(async(silent=false)=>{
    if(!silent) setLoadingStats(true);
    try{
      const{data}=await api.get('/admin/stats');
      // Todo sale de la base de datos (el backend ya incluye las 4 verticales).
      setStats(data);
    }
    catch(err){setStats({kpis:{},ultimasReservas:[],estadosPorVertical:{},error:apiErrorMsg(err,'No se pudieron cargar las estadísticas')});}
    finally{if(!silent) setLoadingStats(false);setLastRefresh(new Date());}
  },[]);

  const fetchUsers=useCallback(async(silent=false)=>{
    if(!silent) setLoadingUsers(true);
    setUsersError(null);
    try{
      const{data}=await api.get('/admin/users');
      const lista=Array.isArray(data)?data:(Array.isArray(data?.data)?data.data:(Array.isArray(data?.users)?data.users:null));
      if(!lista) throw new Error('Respuesta inesperada del backend en /admin/users');
      setUsers(lista);
    }
    catch(err){setUsers([]);setUsersError(err?.response?apiErrorMsg(err,'No se pudieron cargar los usuarios'):(err?.message||apiErrorMsg(err)));}
    finally{if(!silent) setLoadingUsers(false);}
  },[]);

  const fetchReservas=useCallback(async(silent=false)=>{
    if(!silent) setLoadingReservas(true);
    try{
      const{data}=await api.get('/admin/reservas');

      // Hospedaje viene de la BD; se agregan solo las reservas guardadas únicamente en este navegador
      const hospedajeList = [...(data.hospedaje || []), ...hospedajeSoloLocal(data.hospedaje || [])];

      const localesAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
      const autosList = localesAutos.map(au => ({
        id: au.id || au.orderId,
        tipo: 'auto',
        pnr: (au.id || au.orderId || 'AUTO').substring(0, 6).toUpperCase(),
        estado: au.status || 'CONFIRMED',
        total: au.totalPrice?.total || au.total || 0,
        moneda: 'USD',
        createdAt: au.createdAt || au.date || new Date().toISOString().split('T')[0],
      }));

      const localesAtracciones = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
      const atraccionesList = localesAtracciones.map(at => ({
        id: at.id || at.reservation_id,
        tipo: 'atraccion',
        pnr: (at.id || at.reservation_id || 'ATRAC').substring(0, 6).toUpperCase(),
        estado: at.status || 'CONFIRMED',
        total: at.totalPrice?.total || at.total || 0,
        moneda: 'USD',
        createdAt: at.createdAt || at.date || new Date().toISOString().split('T')[0],
      }));

      setReservas({
        ...data, 
        hospedaje: hospedajeList,
        autos: [...(data.autos || []), ...autosList],
        atracciones: [...(data.atracciones || []), ...atraccionesList]
      });
    }
    catch{setReservas({vuelos:[],autos:[],atracciones:[],hospedaje:[]});}
    finally{if(!silent) setLoadingReservas(false);}
  },[]);

  useEffect(()=>{fetchStats();checkServices();},[]);

  useEffect(()=>{
    if(activeTab==='gestion'){fetchUsers();fetchReservas();}
  },[activeTab]);

  const handleRefresh=()=>{
    fetchStats(true);checkServices();setRefreshKey(k=>k+1);
    if(activeTab==='gestion'){fetchUsers(true);fetchReservas(true);}
  };

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Segoe UI', system-ui, sans-serif"}}>
      <div style={{background:C.darkBlue,color:'white',padding:'0 24px'}}>
        <div style={{maxWidth:1280,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',height:56}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:'1.3rem'}}>🛡️</span>
            <div>
              <div style={{fontWeight:700,fontSize:'1rem'}}>Panel de Administración</div>
              <div style={{fontSize:'0.7rem',opacity:0.7}}>Booking Ecuador — RDA1 · Integración de Sistemas</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {lastRefresh&&<span style={{fontSize:'0.75rem',opacity:0.7}}>Actualizado: {lastRefresh.toLocaleTimeString('es-EC')}</span>}
            <button onClick={handleRefresh} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'white',padding:'6px 14px',borderRadius:6,cursor:'pointer',fontSize:'0.8rem',fontWeight:600}}>↻ Refrescar</button>
          </div>
        </div>
      </div>
      <div style={{background:C.blue,padding:'0 24px'}}>
        <div style={{maxWidth:1280,margin:'0 auto',display:'flex'}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{background:'transparent',border:'none',color:activeTab===t.id?'white':'rgba(255,255,255,0.65)',padding:'14px 20px',cursor:'pointer',fontSize:'0.9rem',fontWeight:activeTab===t.id?700:400,borderBottom:activeTab===t.id?'3px solid white':'3px solid transparent',transition:'all 0.2s'}}>
              {t.label}
              <div style={{fontSize:'0.65rem',marginTop:1,fontWeight:400}}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{maxWidth:1280,margin:'0 auto',padding:'24px'}}>
        {activeTab==='observabilidad'&&<ObservabilidadTab stats={stats} loadingStats={loadingStats} serviceHealth={serviceHealth} refreshKey={refreshKey}/>}
        {activeTab==='microservicios'&&(
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <MicroserviciosTab/>
            <div style={{ borderTop: `2px dashed ${C.border}`, paddingTop: '40px' }}>
              <SectionTitle>🔗 Gestión de Proveedores Integrados (RDA2)</SectionTitle>
              <ProveedoresTab/>
            </div>
          </div>
        )}
        {activeTab==='gestion'&&<GestionTab users={users} usersError={usersError} onRetryUsers={()=>fetchUsers()} reservas={reservas} loadingUsers={loadingUsers} loadingReservas={loadingReservas} onRefresh={handleRefresh}/>}
        {activeTab==='soporte'&&<SoporteTab/>}
        {activeTab==='auditoria'&&<AuditoriaTab refreshKey={refreshKey}/>}
        {activeTab==='configuracion'&&<ConfiguracionTab/>}
      </div>
    </div>
  );
}
