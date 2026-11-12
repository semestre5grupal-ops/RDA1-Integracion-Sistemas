import React from 'react';

/**
 * Convierte un error de axios en un mensaje legible. Entiende RFC 7807
 * (`detail`/`title`), errores de Nest (`message`, a veces un arreglo) y
 * timeouts o caídas de red (backend dormido en Render).
 */
export function mensajeError(err, porDefecto = 'Ocurrió un error.') {
  const status = err?.response?.status;
  const body = err?.response?.data;
  if (!err?.response) {
    if (err?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder. Si estaba dormido, reintenta en unos segundos.';
    return 'No hay conexión con el backend.';
  }
  const msg = Array.isArray(body?.message) ? body.message.join(' · ') : (body?.detail || body?.message || body?.title);
  if (status === 401) return 'Sesión no válida o vencida. Vuelve a iniciar sesión.';
  if (status === 403) return msg || 'Tu usuario no tiene permiso para esta acción.';
  if (status === 404) return msg || 'El endpoint no existe en el backend desplegado.';
  return `${msg || porDefecto}${status ? ` (HTTP ${status})` : ''}`;
}

/** Aviso de error con botón de reintento. No muestra datos inventados. */
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span>✗ {error}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ background: '#fff', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Extrae una lista de una respuesta que puede venir como arreglo, {data}, {items} o {data:{items}}. */
export function aLista(res, ...claves) {
  const body = res?.data !== undefined ? res.data : res;
  if (Array.isArray(body)) return body;
  for (const k of ['data', 'items', ...claves]) {
    const v = body?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      for (const k2 of ['items', ...claves]) if (Array.isArray(v[k2])) return v[k2];
    }
  }
  return [];
}

/**
 * Indicador de recarga automática (reemplaza a los botones "Actualizar").
 * `ultima`: hora de la última recarga correcta; `fallos`: fallos seguidos.
 */
export function ActualizadoHace({ ultima, fallos = 0, cada }) {
  const [ahora, setAhora] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((ahora - ultima) / 1000));
  const texto = s < 2 ? 'Actualizado ahora' : s < 60 ? `Actualizado hace ${s} s` : `Actualizado hace ${Math.floor(s / 60)} min`;
  const color = fallos ? '#b45309' : '#16a34a';
  return (
    <span
      role="status"
      title={cada ? `Se actualiza solo cada ${Math.round(cada / 1000)} s` : 'Se actualiza solo'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {fallos ? `Sin conexión · reintentando (${texto.toLowerCase()})` : texto}
    </span>
  );
}
