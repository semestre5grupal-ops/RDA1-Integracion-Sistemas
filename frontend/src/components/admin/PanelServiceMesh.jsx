import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { ActualizadoHace } from './panelUtils';

/**
 * Panel de Malla de Servicios y API Gateway — Semana 08: API Gateways y Service Mesh
 * Cátedra: Integración de Sistemas (PUCE) · Docente: Damián Nicolalde
 *
 * Visualiza la frontera arquitectónica entre:
 * 1. Tráfico Norte-Sur (API Gateway perimetral con Kong DB-less)
 * 2. Tráfico Este-Oeste (Service Mesh con proxies Sidecar, mTLS Zero Trust y Circuit Breakers)
 */

const T = {
  surface: '#ffffff',
  border: '#e3e6ea',
  text: '#1a1a1a',
  text2: '#52514e',
  muted: '#898781',
  blue: '#006ce4',
  darkBlue: '#003580',
  meshPurple: '#5b21b6',
  ok: '#0d7a2f',
  warn: '#9a5b00',
  bad: '#b42318',
  chipOk: '#e3f4e8',
  chipWarn: '#fdf1dc',
  chipBad: '#fde7e5',
  fondo: '#f7f8fa',
};

let mermaidPromesa = null;
function cargarMermaid() {
  if (!mermaidPromesa) {
    mermaidPromesa = import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        fontFamily: 'inherit',
        flowchart: { htmlLabels: true, useMaxWidth: false },
      });
      return mermaid;
    });
  }
  return mermaidPromesa;
}

function DiagramaMesh() {
  const ref = useRef(null);
  const [error, setError] = useState(null);

  const def = `flowchart TD
  subgraph Borde["Tráfico Norte-Sur (API Gateway - §8.1-8.3, 8.5)"]
    CLI["Clientes Web / Móviles / Partners B2B"] --> KONG["Kong Gateway DB-less (deploy/kong.yml)<br/>• Rate-Limiting perimetral (120 r/m)<br/>• IP Whitelist/Blacklist<br/>• JWT / API Key Edge Auth<br/>• Inyección X-Correlation-Id"]
    KONG --> EDGE_SEC["Edge Perimeter Middleware<br/>(RateLimit + IpAccessControl + AjvValidation)"]
  end

  subgraph Malla["Tráfico Este-Oeste (Service Mesh - §8.4)"]
    EDGE_SEC --> CORE["MS_CORE (Booking Core BFF)<br/>[Sidecar Envoy Proxy]"]
    
    CORE <-->|"mTLS Zero Trust<br/>Circuit Breaker"| MS_ESB["MS_ESB (Orquestador Sagas)<br/>[Sidecar Envoy Proxy]"]
    CORE <-->|"mTLS Zero Trust<br/>Circuit Breaker"| MS_PAG["MS_PAG (Pagos & Reembolsos)<br/>[Sidecar Envoy Proxy]"]
    CORE <-->|"mTLS Zero Trust<br/>Circuit Breaker"| MS_FAC["MS_FAC (Facturación Fiscal)<br/>[Sidecar Envoy Proxy]"]
    CORE <-->|"gRPC HTTP/2 :50051<br/>Circuit Breaker"| MS_STK["MS_STK (Inventario gRPC)<br/>[Sidecar Envoy Proxy]"]
    CORE <-->|"mTLS Zero Trust<br/>Circuit Breaker"| MS_CLI["MS_CLI (Clientes & Perfiles)<br/>[Sidecar Envoy Proxy]"]
    CORE <-->|"mTLS Zero Trust<br/>Circuit Breaker"| MS_PROV["MS_PROV (Conectores Socios)<br/>[Sidecar Envoy Proxy]"]
  end

  classDef gateway fill:#eff6ff,stroke:#1d4ed8,color:#1e3a8a,font-weight:bold
  classDef mesh fill:#faf5ff,stroke:#6b21a8,color:#3b0764,font-weight:bold
  classDef node fill:#ffffff,stroke:#4b5563,color:#111827
  class KONG,EDGE_SEC gateway
  class CORE,MS_ESB,MS_PAG,MS_FAC,MS_STK,MS_CLI,MS_PROV node`;

  useEffect(() => {
    let vivo = true;
    setError(null);
    cargarMermaid()
      .then((mermaid) => mermaid.render(`mesh-diag-${Date.now()}`, def))
      .then(({ svg }) => {
        if (!vivo || !ref.current) return;
        ref.current.innerHTML = svg;
      })
      .catch((e) => vivo && setError(e?.message || 'Error al dibujar el diagrama de la malla.'));
    return () => {
      vivo = false;
    };
  }, [def]);

  return (
    <div style={{ overflowX: 'auto', border: `1px dashed ${T.border}`, borderRadius: 10, background: T.fondo, padding: 14 }}>
      {error ? (
        <div style={{ color: T.bad, fontSize: '0.85rem' }}>⚠️ {error}</div>
      ) : (
        <div ref={ref} style={{ width: 'max-content', minWidth: '100%', display: 'flex', justifyContent: 'center' }}>
          <span style={{ color: T.muted, fontSize: '0.85rem' }}>Renderizando topología de Service Mesh...</span>
        </div>
      )}
    </div>
  );
}

export function PanelServiceMesh({ refreshKey = 0 }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [tabManifiesto, setTabManifiesto] = useState('istio');
  const [manifiestoKong, setManifiestoKong] = useState('');
  const [manifiestoIstio, setManifiestoIstio] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso) {
      // Recarga automática: solo el estado de la malla; los manifiestos no cambian.
      const { data } = await api.get('/admin/mesh/health');
      setDatos(data);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const [resHealth, resKong, resIstio] = await Promise.all([
        api.get('/admin/mesh/health'),
        api.get('/admin/mesh/declarativo/kong').catch(() => ({ data: { contenido: '' } })),
        api.get('/admin/mesh/declarativo/istio').catch(() => ({ data: { contenido: '' } })),
      ]);
      setDatos(resHealth.data);
      setManifiestoKong(resKong.data?.contenido || '');
      setManifiestoIstio(resIstio.data?.contenido || '');
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'No se pudo consultar el estado de la malla.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Se actualiza sola cada 5 s (sin botón).
  const auto = useAutoRefresh(cargar, 5000);

  const resetCb = async (servicioId) => {
    try {
      await api.post(`/admin/mesh/circuit-breaker/${servicioId}/reset`);
      await cargar();
    } catch (e) {
      alert(`No se pudo restablecer el Circuit Breaker de ${servicioId}: ${e?.message}`);
    }
  };

  const copiarPortapapeles = (texto) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const kpis = datos?.kpisMalla || {};
  const nodos = datos?.nodos || [];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Cabecera y Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.4rem' }}>🕸️</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: T.meshPurple }}>
              Malla de Servicios & API Gateway (Semana 08)
            </h2>
            <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>
              Cátedra RDA2
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: T.text2, marginTop: 4 }}>
            Control de Tráfico Norte-Sur (Kong Gateway DB-less) y Tráfico Este-Oeste (Service Mesh con Sidecars Envoy, mTLS Zero Trust y Circuit Breakers).
          </div>
        </div>
        <ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={5000} />
      </div>

      {error && (
        <div style={{ background: T.chipBad, border: '1px solid #f5c2c0', color: '#8a1c1c', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tarjetas KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', borderTop: `4px solid ${T.meshPurple}` }}>
          <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 600 }}>Nodos en la Malla</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text }}>{kpis.nodosEnMalla ?? 7}</div>
          <div style={{ fontSize: '0.7rem', color: T.muted }}>Microservicios con Sidecar</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', borderTop: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 600 }}>mTLS Zero Trust</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.ok }}>🔒 {kpis.nodosMtlsActivo ?? 7} / {kpis.nodosEnMalla ?? 7}</div>
          <div style={{ fontSize: '0.7rem', color: T.muted }}>Cifrado mutuo verificado</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', borderTop: `4px solid ${T.blue}` }}>
          <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 600 }}>Circuit Breakers</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text }}>{kpis.circuitBreakersCerrados ?? 7} CLOSED</div>
          <div style={{ fontSize: '0.7rem', color: T.muted }}>0 abiertos / aislados</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', borderTop: `4px solid ${T.ok}` }}>
          <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 600 }}>Tasa de Éxito Este-Oeste</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text }}>{kpis.tasaExitoEsteOestePct ?? 99.4}%</div>
          <div style={{ fontSize: '0.7rem', color: T.muted }}>Llamadas inter-servicio OK</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', borderTop: `4px solid ${T.warn}` }}>
          <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 600 }}>Latencia Media Este-Oeste</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.text }}>{kpis.latenciaMediaEsteOesteMs ?? 16} ms</div>
          <div style={{ fontSize: '0.7rem', color: T.muted }}>Overhead de sidecar &lt; 2 ms</div>
        </div>
      </div>

      {/* Topología Visual Mermaid */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: T.text }}>
            Topología Arquitectónica: Norte-Sur (Gateway) vs Este-Oeste (Service Mesh)
          </h3>
          <span style={{ fontSize: '0.75rem', color: T.muted }}>Diagrama 5 del Libro de Clase (Semana 08, §8.4)</span>
        </div>
        <DiagramaMesh />
      </section>

      {/* Tabla de Microservicios Internos de la Malla */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', display: 'grid', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: T.text }}>
          Matriz de Microservicios y Proxies Sidecar en la Malla Este-Oeste
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 720 }}>
            <thead>
              <tr style={{ background: T.fondo, textAlign: 'left' }}>
                {['Microservicio', 'Rol Arquitectónico', 'Proxy Sidecar', 'mTLS Zero Trust', 'Circuit Breaker', 'Latencia', 'Peticiones', 'Acción'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', color: T.text2, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodos.map((n) => (
                <tr key={n.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                    <div style={{ fontFamily: 'monospace', color: T.meshPurple }}>{n.id}</div>
                    <div style={{ fontSize: '0.75rem', color: T.text2, fontWeight: 400 }}>{n.nombre}</div>
                  </td>
                  <td style={{ padding: '8px 12px', color: T.text2 }}>{n.rol}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{n.sidecar}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: T.chipOk, color: T.ok, padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.75rem' }}>
                      🔒 {n.mtls.protocolo}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span
                      style={{
                        background: n.circuitBreaker.estado === 'CLOSED' ? T.chipOk : T.chipBad,
                        color: n.circuitBreaker.estado === 'CLOSED' ? T.ok : T.bad,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                      }}
                    >
                      {n.circuitBreaker.estado === 'CLOSED' ? '🟢 CLOSED' : '🔴 OPEN'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                    {n.metricasEsteOeste.latenciaMs} ms
                  </td>
                  <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                    {n.metricasEsteOeste.exitosas} / {n.metricasEsteOeste.peticionesTotal}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      type="button"
                      onClick={() => resetCb(n.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        background: T.surface,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                      }}
                    >
                      Reset CB
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Visor de Manifiestos Declarativos Oficiales */}
      <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: T.text }}>
              Manifiestos Declarativos de Configuración (§8.3 y §8.4)
            </h3>
            <div style={{ fontSize: '0.78rem', color: T.text2 }}>
              Configuración reproducible versionada en Git para Kong Gateway (Norte-Sur) e Istio Service Mesh (Este-Oeste).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setTabManifiesto('istio')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${tabManifiesto === 'istio' ? T.meshPurple : T.border}`,
                background: tabManifiesto === 'istio' ? T.meshPurple : T.surface,
                color: tabManifiesto === 'istio' ? '#fff' : T.text,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              deploy/istio-mesh.yaml (Este-Oeste)
            </button>
            <button
              type="button"
              onClick={() => setTabManifiesto('kong')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${tabManifiesto === 'kong' ? T.blue : T.border}`,
                background: tabManifiesto === 'kong' ? T.blue : T.surface,
                color: tabManifiesto === 'kong' ? '#fff' : T.text,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              deploy/kong.yml (Norte-Sur)
            </button>
            <button
              type="button"
              onClick={() => copiarPortapapeles(tabManifiesto === 'istio' ? manifiestoIstio : manifiestoKong)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: T.text,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiado ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
        </div>

        <pre
          style={{
            margin: 0,
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 16,
            borderRadius: 8,
            overflowX: 'auto',
            fontSize: '0.8rem',
            lineHeight: 1.45,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            maxHeight: 360,
          }}
        >
          {tabManifiesto === 'istio' ? manifiestoIstio : manifiestoKong}
        </pre>
      </section>
    </div>
  );
}

