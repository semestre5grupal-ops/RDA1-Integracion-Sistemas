import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { ActualizadoHace } from './panelUtils';

export function Panel4_LiquidacionesFinanzas() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [error, setError] = useState(null);

  // Datos reales de schema_finanzas.liquidaciones_proveedores (sin ejemplos inventados).
  const fetchLiquidaciones = async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setLoading(true);
      setError(null);
      const res = await api.get('/finanzas/liquidaciones');
      const filas = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setLiquidaciones(filas.map((l) => ({
        id: l.id,
        codigo_liquidacion: l.numero_liquidacion || l.id?.slice(0, 8),
        proveedor_nombre: `${l.proveedor_codigo} · ${l.vertical} · ${l.periodo}`,
        total_ventas_bruto: Number(l.total_recaudado ?? 0),
        comision_booking_10pct: Number(l.comision_booking_10pct ?? 0),
        monto_neto_proveedor_90pct: Number(l.monto_liquidar_socio_90pct ?? 0),
        estado: l.estado === 'PAGADO' ? 'PAGADO' : 'PENDIENTE_PAGO',
        comprobante_url: l.comprobante_transferencia_url,
        revision: l.revision ?? null,
      })));
    } catch (e) {
      if (silencioso) throw e;
      setLiquidaciones([]);
      setError(e?.response?.data?.detail || e?.message || 'No se pudieron leer las liquidaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiquidaciones();
  }, []);

  // Se actualiza sola cada 30 s (sin botón). No mientras se registra un pago.
  const auto = useAutoRefresh(fetchLiquidaciones, 30000, { pausado: !!selectedId });

  const totalVentas = liquidaciones.reduce((acc, l) => acc + Number(l.total_ventas_bruto || 0), 0);
  const totalComision = liquidaciones.reduce((acc, l) => acc + Number(l.comision_booking_10pct || 0), 0);
  const totalPorPagar = liquidaciones.filter(l => l.estado === 'PENDIENTE_PAGO').reduce((acc, l) => acc + Number(l.monto_neto_proveedor_90pct || 0), 0);

  const handlePagar = async (liqId) => {
    const comprobante = comprobanteUrl.trim();
    if (!comprobante) {
      setError('Escribe el enlace o la referencia de la transferencia antes de marcarla como pagada.');
      return;
    }
    try {
      await api.post(`/finanzas/liquidaciones/${liqId}/pagar`, { comprobante_url: comprobante });
      await fetchLiquidaciones();
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo marcar como pagada.');
    } finally {
      setSelectedId(null);
      setComprobanteUrl('');
    }
  };

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💼</span> Liquidaciones por aerolínea
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Booking compra el boleto a la aerolínea a su precio y se lo vende al cliente con su cargo por servicio. Cada venta suma a la liquidación de la quincena: la comisión es ese cargo y a la aerolínea se le paga su precio (menos lo que ella mandó devolver).
          </p>
        </div>
        <ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={30000} />
      </div>

      {/* TARJETAS RESUMEN DE SALDOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '8px', borderTop: '4px solid #006ce4' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Total Bruto Transaccionado:</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            ${totalVentas.toFixed(2)} USD
          </div>
        </div>

        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px', borderRadius: '8px', borderTop: '4px solid #10b981' }}>
          <span style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: 600 }}>Ganancia de Booking (cargo por servicio):</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
            +${totalComision.toFixed(2)} USD
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '16px', borderRadius: '8px', borderTop: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>Por pagar a las aerolíneas (precio de cada una):</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
            ${totalPorPagar.toFixed(2)} USD
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {!loading && !error && liquidaciones.length === 0 && (
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Todavía no hay ventas de proveedores en ninguna quincena.</p>
      )}

      {/* TABLA DE LIQUIDACIONES */}
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '12px 10px' }}>Código Liquidación</th>
            <th style={{ padding: '12px 10px' }}>Proveedor / Vertical</th>
            <th style={{ padding: '12px 10px' }}>Total cobrado al cliente</th>
            <th style={{ padding: '12px 10px' }}>Cargo de Booking</th>
            <th style={{ padding: '12px 10px' }}>A pagar a la aerolínea</th>
            <th style={{ padding: '12px 10px' }}>Estado</th>
            <th style={{ padding: '12px 10px' }}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {liquidaciones.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px 10px', fontWeight: 600, color: '#003580' }}>{l.codigo_liquidacion}</td>
              <td style={{ padding: '12px 10px' }}>
                {l.proveedor_nombre}
                {l.revision?.revisar && (
                  <div title={l.revision.motivos.join('; ')} style={{ marginTop: 4, display: 'inline-block', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                    ⚠ Revisar antes de pagar
                  </div>
                )}
                {l.revision?.revisar && (
                  <div style={{ marginTop: 3, fontSize: '0.74rem', color: '#7f1d1d' }}>{l.revision.motivos.join(' · ')}</div>
                )}
              </td>
              <td style={{ padding: '12px 10px' }}>${Number(l.total_ventas_bruto).toFixed(2)}</td>
              <td style={{ padding: '12px 10px', color: '#047857', fontWeight: 700 }}>+${Number(l.comision_booking_10pct).toFixed(2)}</td>
              <td style={{ padding: '12px 10px', fontWeight: 700 }}>${Number(l.monto_neto_proveedor_90pct).toFixed(2)}</td>
              <td style={{ padding: '12px 10px' }}>
                <span 
                  style={{ 
                    padding: '3px 8px', 
                    borderRadius: '12px', 
                    fontSize: '0.75rem', 
                    fontWeight: 700,
                    background: l.estado === 'PAGADO' ? '#dcfce7' : '#fef3c7',
                    color: l.estado === 'PAGADO' ? '#166534' : '#92400e',
                  }}
                >
                  {l.estado === 'PAGADO' ? '✓ PAGADO' : '● PENDIENTE'}
                </span>
              </td>
              <td style={{ padding: '12px 10px' }}>
                {l.estado === 'PAGADO' ? (
                  /^https?:\/\//i.test(l.comprobante_url || '') ? (
                    <a href={l.comprobante_url} target="_blank" rel="noreferrer" style={{ color: '#006ce4', textDecoration: 'none', fontWeight: 600 }}>Ver comprobante</a>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}>{l.comprobante_url || 'Sin comprobante'}</span>
                  )
                ) : selectedId === l.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input autoFocus value={comprobanteUrl} onChange={(e) => setComprobanteUrl(e.target.value)} placeholder="Enlace o n.º de transferencia" style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', minWidth: 180 }} />
                    <button type="button" onClick={() => handlePagar(l.id)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>Confirmar</button>
                    <button type="button" onClick={() => { setSelectedId(null); setComprobanteUrl(''); }} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setSelectedId(l.id); setComprobanteUrl(''); setError(null); }} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>
                    Marcar pagada
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConciliacionVuelos />
    </div>
  );
}

/** Inicio de la quincena actual en hora de Ecuador (YYYY-MM-DD). */
function inicioQuincena() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
  return `${hoy.slice(0, 8)}${Number(hoy.slice(8)) <= 15 ? '01' : '16'}`;
}

/**
 * Conciliación con las aerolíneas: lo que Booking vendió de cada una, lo
 * devuelto, su comisión y lo que se le debe. Cada fila lleva la orden de Booking
 * (salesChannel.partnerOrderId) y el id de la reserva en la aerolínea, para que
 * ella la compare con su GET /bookings. Se descarga en CSV para enviársela.
 */
function ConciliacionVuelos() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
  const [desde, setDesde] = useState(inicioQuincena());
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get('/admin/finanzas/vuelos/conciliacion', { params: { desde, hasta } });
      setDatos(res?.data ?? res);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'No se pudo cargar la conciliación.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const descargarCsv = (proveedor) => {
    const filas = (datos?.reservas ?? []).filter((r) => !proveedor || r.proveedor === proveedor);
    const cab = ['proveedor', 'partnerOrderId', 'pnr', 'bookingIdAerolinea', 'factura', 'estado', 'fecha', 'moneda', 'vendido', 'devuelto', 'comisionBooking', 'aPagarAerolinea'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cab.join(','), ...filas.map((r) => cab.map((c) => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `conciliacion_${proveedor || 'aerolineas'}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const celda = { padding: '10px 8px' };
  return (
    <div style={{ marginTop: '32px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>✈️ Conciliación con aerolíneas</h3>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            Cada reserva va con su orden de Booking (la que recibió la aerolínea en <code>salesChannel.partnerOrderId</code>). Envía el CSV a la aerolínea para que lo compare con sus reservas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.75rem', color: '#475569' }}>Desde<br />
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <label style={{ fontSize: '0.75rem', color: '#475569' }}>Hasta<br />
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <button onClick={cargar} disabled={cargando} style={{ background: '#003580', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
            {cargando ? 'Cargando…' : 'Consultar'}
          </button>
        </div>
      </div>
      {error && <p style={{ color: '#991b1b', fontSize: '0.85rem' }}>{error}</p>}
      {datos && (datos.totales ?? []).length === 0 && !error && (
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Sin ventas facturadas de aerolíneas entre {datos.desde} y {datos.hasta}.</p>
      )}
      {datos && (datos.totales ?? []).length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={celda}>Aerolínea</th>
              <th style={celda}>Reservas</th>
              <th style={celda}>Vendido</th>
              <th style={celda}>Devuelto</th>
              <th style={celda}>Comisión Booking (cargo por servicio)</th>
              <th style={celda}>A pagar a la aerolínea</th>
              <th style={celda}></th>
            </tr>
          </thead>
          <tbody>
            {datos.totales.map((t) => (
              <tr key={t.proveedor} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...celda, fontWeight: 600, color: '#003580' }}>{t.proveedor}</td>
                <td style={celda}>{t.reservas}</td>
                <td style={celda}>${Number(t.vendido).toFixed(2)}</td>
                <td style={{ ...celda, color: '#b91c1c' }}>-${Number(t.devuelto).toFixed(2)}</td>
                <td style={{ ...celda, color: '#047857', fontWeight: 700 }}>+${Number(t.comisionBooking).toFixed(2)}</td>
                <td style={{ ...celda, fontWeight: 700 }}>${Number(t.aPagarAerolinea).toFixed(2)}</td>
                <td style={celda}>
                  <button onClick={() => descargarCsv(t.proveedor)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}>
                    ⬇️ CSV
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
