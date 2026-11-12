import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { mensajeError, ErrorBox, ActualizadoHace } from './panelUtils';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

/**
 * Categorías de atracciones (árbol de la base: GET /atracciones/categorias/arbol)
 * y alta de categorías o subcategorías (POST /atracciones/categorias, rol ADMIN).
 */
const hijosDe = (n) => n.subcategorias || n.hijos || [];

function aplanar(nodos, nivel = 0, out = []) {
  nodos.forEach((n) => {
    out.push({ id: n.id, nombre: n.nombre, nivel });
    aplanar(hijosDe(n), nivel + 1, out);
  });
  return out;
}

const VACIA = { nombre: '', parentId: '', incluye_comida: false, incluye_transporte: false, incluye_guia: false };

const chip = (bg, fg) => ({ background: bg, color: fg, padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' });

export function Panel3_ArbolCategoriasAtracciones({ refreshKey = 0 }) {
  const [arbol, setArbol] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nueva, setNueva] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/atracciones/categorias/arbol');
      setArbol(Array.isArray(data) ? data : []);
    } catch (e) {
      if (silencioso) throw e;
      setArbol([]);
      setError(mensajeError(e, 'No se pudo leer el árbol de categorías.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshKey]);

  // Se actualiza solo cada 30 s (sin botón).
  const auto = useAutoRefresh(cargar, 30000);

  const crear = async (e) => {
    e.preventDefault();
    if (!nueva.nombre.trim()) return;
    setGuardando(true);
    setAviso(null);
    try {
      await api.post('/atracciones/categorias', {
        nombre: nueva.nombre.trim(),
        parent_id: nueva.parentId || null,
        incluye_comida: nueva.incluye_comida,
        incluye_transporte: nueva.incluye_transporte,
        incluye_guia: nueva.incluye_guia,
      });
      setAviso({ ok: true, texto: `Categoría "${nueva.nombre.trim()}" creada.` });
      setNueva(VACIA);
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: mensajeError(err, 'No se pudo crear la categoría.') });
    } finally {
      setGuardando(false);
    }
  };

  const total = aplanar(arbol).length;

  const nodo = (n, nivel = 0) => (
    <div key={n.id} style={{ marginLeft: nivel ? 16 : 0, marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid #e2e8f0', borderLeft: `4px solid ${nivel ? '#94a3b8' : '#006ce4'}`, borderRadius: 6, padding: '8px 12px', background: nivel ? '#fff' : '#f8fafc' }}>
        <div>
          <strong style={{ fontSize: '0.88rem' }}>{n.nombre}</strong>
          {n.descripcion && n.descripcion !== n.nombre && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{n.descripcion}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {n.incluye_comida && <span style={chip('#dcfce7', '#166534')}>Comida</span>}
          {n.incluye_transporte && <span style={chip('#e0f2fe', '#0369a1')}>Transporte</span>}
          {n.incluye_guia && <span style={chip('#ede9fe', '#6d28d9')}>Guía</span>}
        </div>
      </div>
      {hijosDe(n).length > 0 && <div style={{ borderLeft: '1px dashed #cbd5e1', marginLeft: 10 }}>{hijosDe(n).map((h) => nodo(h, nivel + 1))}</div>}
    </div>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7e7', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '0.82rem', color: '#52514e' }}><strong>{total}</strong> categorías en la base</span>
        <ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={30000} />
      </div>
      <ErrorBox error={error} onRetry={cargar} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
        <div>
          {arbol.map((n) => nodo(n))}
          {!loading && !error && arbol.length === 0 && <div style={{ color: '#64748b', padding: 12 }}>No hay categorías registradas.</div>}
        </div>

        <form onSubmit={crear} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Nueva categoría</div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }} htmlFor="cat-nombre">Nombre</label>
          <input id="cat-nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} required style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', marginBottom: 10 }} />
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }} htmlFor="cat-padre">Dentro de</label>
          <select id="cat-padre" value={nueva.parentId} onChange={(e) => setNueva({ ...nueva, parentId: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', marginBottom: 10, background: '#fff' }}>
            <option value="">(categoría principal)</option>
            {aplanar(arbol).map((c) => <option key={c.id} value={c.id}>{`${'— '.repeat(c.nivel)}${c.nombre}`}</option>)}
          </select>
          {[['incluye_comida', 'Incluye comida'], ['incluye_transporte', 'Incluye transporte'], ['incluye_guia', 'Incluye guía']].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={nueva[k]} onChange={(e) => setNueva({ ...nueva, [k]: e.target.checked })} /> {label}
            </label>
          ))}
          {aviso && <div role="status" style={{ fontSize: '0.8rem', color: aviso.ok ? '#166534' : '#991b1b', margin: '8px 0' }}>{aviso.texto}</div>}
          <button type="submit" disabled={guardando} style={{ width: '100%', marginTop: 6, background: '#006ce4', color: '#fff', border: 'none', padding: 9, borderRadius: 6, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Guardando…' : 'Crear categoría'}
          </button>
        </form>
      </div>
    </div>
  );
}
