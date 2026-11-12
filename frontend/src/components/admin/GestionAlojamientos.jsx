import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { ActualizadoHace } from './panelUtils';
import {
  getCatalogoGestion,
  crearAlojamiento,
  actualizarAlojamiento,
  eliminarAlojamiento,
} from '../../services/alojamientosApi';
import { API_BASE } from '../../services/api';
import { C, Campo, estiloInput, erroresPorCampo, mensajeDe, fmtFecha, Aviso } from './alojamientosUi';
import { GestorTiposHabitacion } from './GestorTiposHabitacion';
import { ProveedoresAlojamiento } from './ProveedoresAlojamiento';

/**
 * Gestión del catálogo de alojamientos (panel de administración → Gestión).
 *
 * - Lista TODO el catálogo (también los inactivos) con su origen: alta manual
 *   o proveedor que lo sincroniza, y sus reservas pendientes.
 * - Alta / edición con el mismo contrato que usan los proveedores (fotos,
 *   amenidades, ubicación, políticas…). Los errores del backend se muestran en
 *   el campo exacto (invalidParams).
 * - Activar / desactivar (oculta el alojamiento sin perder reservas) y borrar
 *   (el backend lo impide si hay reservas pendientes; con historial, baja lógica).
 * - Tipos de habitación de cada alojamiento y registro de proveedores con su API key.
 */
const VACIO = {
  nombre: '', destino: '', descripcion: '', tipoPropiedad: 'Hoteles', tipoAlojamiento: '',
  precioPorNoche: '', moneda: 'USD', capacidadAdultos: 2, capacidadNinos: 0, habitaciones: 1,
  camas: 1, banos: 1, tienePiscina: false, amenidades: '', fotos: '',
  direccion: '', ciudad: '', pais: 'EC', checkinDesde: '14:00', checkoutHasta: '11:00',
  cancelacion: '', mascotas: false, estado: 'ACTIVO',
};

/** Ficha del backend → valores del formulario. */
function aFormulario(a) {
  return {
    nombre: a.nombre || '', destino: a.destino || '', descripcion: a.descripcion || '',
    tipoPropiedad: a.tipo_propiedad || '', tipoAlojamiento: a.tipo_alojamiento || '',
    precioPorNoche: a.precioPorNoche ?? '', moneda: a.moneda || 'USD',
    capacidadAdultos: a.capacidadAdultos ?? 2, capacidadNinos: a.capacidadNinos ?? 0,
    habitaciones: a.habitaciones ?? 1, camas: a.camas ?? 1, banos: a.banos ?? 1,
    tienePiscina: Boolean(a.tienePiscina),
    amenidades: (a.amenidades || []).join(', '),
    fotos: (a.photos || []).map((p) => p.url).join('\n'),
    direccion: a.ubicacion?.address || '', ciudad: a.ubicacion?.city || '', pais: a.ubicacion?.country || '',
    checkinDesde: a.politicas?.checkin_desde || '', checkoutHasta: a.politicas?.checkout_hasta || '',
    cancelacion: a.politicas?.cancelacion || '', mascotas: Boolean(a.politicas?.mascotas),
    estado: a.estado || 'ACTIVO',
  };
}

/** Alojamientos con varios tipos: precio, habitaciones y capacidad salen de los tipos. */
const tiposALaVenta = (a) => (a?.tipos_habitacion || []).filter((t) => t.activo && t.cantidad > 0);
const CAMPOS_RESUMEN = ['precioPorNoche', 'habitaciones', 'capacidadAdultos', 'capacidadNinos'];

/** Valores del formulario → cuerpo del contrato (CreateAlojamientoDto). */
function aContrato(f, { sinResumen = false } = {}) {
  const opcional = (v) => (String(v ?? '').trim() === '' ? undefined : String(v).trim());
  const politicas = {
    checkin_desde: opcional(f.checkinDesde), checkout_hasta: opcional(f.checkoutHasta),
    cancelacion: opcional(f.cancelacion), mascotas: Boolean(f.mascotas),
  };
  const ubicacion = { address: opcional(f.direccion), city: opcional(f.ciudad) || opcional(f.destino), country: opcional(f.pais)?.toUpperCase() };
  return {
    nombre: f.nombre.trim(),
    destino: f.destino.trim(),
    descripcion: opcional(f.descripcion),
    tipoPropiedad: opcional(f.tipoPropiedad),
    tipoAlojamiento: opcional(f.tipoAlojamiento),
    precioPorNoche: Number(f.precioPorNoche),
    moneda: opcional(f.moneda)?.toUpperCase(),
    capacidadAdultos: Number(f.capacidadAdultos),
    capacidadNinos: Number(f.capacidadNinos),
    habitaciones: Number(f.habitaciones),
    camas: Number(f.camas) || undefined,
    banos: f.banos === '' ? undefined : Number(f.banos),
    tienePiscina: Boolean(f.tienePiscina),
    amenidades: f.amenidades.split(',').map((x) => x.trim()).filter(Boolean),
    photos: f.fotos.split('\n').map((x) => x.trim()).filter(Boolean).map((url) => ({ url })),
    ubicacion: Object.fromEntries(Object.entries(ubicacion).filter(([, v]) => v !== undefined)),
    politicas: Object.fromEntries(Object.entries(politicas).filter(([, v]) => v !== undefined)),
    estado: f.estado,
    // Con varios tipos de habitación estos valores los calcula el backend.
    ...(sinResumen ? Object.fromEntries(CAMPOS_RESUMEN.map((c) => [c, undefined])) : {}),
  };
}

function FormularioAlojamiento({ inicial, editando, onCerrar, onGuardado }) {
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ref = useRef(null);
  useFocusTrap(true, onCerrar, ref);
  const variosTipos = tiposALaVenta(editando).length > 1;

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((x) => ({ ...x, [campo]: valor }));
    setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  const validarLocal = () => {
    const e = {};
    if (f.nombre.trim().length < 3) e.nombre = 'Mínimo 3 caracteres.';
    if (f.destino.trim().length < 3) e.destino = 'Mínimo 3 caracteres.';
    if (!(Number(f.precioPorNoche) > 0)) e.precioPorNoche = 'Debe ser mayor que 0.';
    if (!(Number(f.habitaciones) >= 1)) e.habitaciones = 'Al menos 1.';
    if (!(Number(f.capacidadAdultos) >= 1)) e.capacidadAdultos = 'Al menos 1.';
    if (f.moneda && !/^[A-Za-z]{3}$/.test(f.moneda)) e.moneda = 'Código de 3 letras (USD).';
    const malas = f.fotos.split('\n').map((x) => x.trim()).filter(Boolean).filter((u) => !/^https:\/\//i.test(u));
    if (malas.length) e.fotos = 'Cada foto debe ser una URL https:// (una por línea).';
    return e;
  };

  const guardar = async (ev) => {
    ev.preventDefault();
    setMensaje('');
    const e = validarLocal();
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      const cuerpo = aContrato(f, { sinResumen: variosTipos });
      const res = editando ? await actualizarAlojamiento(editando.id, cuerpo) : await crearAlojamiento(cuerpo);
      onGuardado(res, editando ? 'actualizado' : 'creado');
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      // Si el backend señaló campos concretos, el mensaje general solo orienta;
      // el motivo exacto ya aparece debajo de cada campo.
      setMensaje(Object.keys(porCampo).length ? 'Revisa los campos marcados en rojo.' : mensajeDe(err, 'No se pudo guardar el alojamiento.'));
    } finally {
      setGuardando(false);
    }
  };

  const input = (campo, props = {}) => {
    const calculado = variosTipos && CAMPOS_RESUMEN.includes(campo);
    return (
      <input id={`ga-${campo}`} value={f[campo]} onChange={cambiar(campo)} aria-invalid={Boolean(errores[campo])}
        aria-describedby={errores[campo] ? `ga-${campo}-error` : undefined} readOnly={calculado}
        title={calculado ? 'Se calcula a partir de los tipos de habitación' : undefined}
        style={{ ...estiloInput(errores[campo]), ...(calculado ? { background: '#f3f4f6', color: C.gray } : {}) }} {...props} />
    );
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
      <form ref={ref} role="dialog" aria-modal="true" aria-labelledby="ga-titulo" onSubmit={guardar} onClick={(e) => e.stopPropagation()} noValidate
        style={{ background: C.white, borderRadius: 10, width: '100%', maxWidth: 760, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="ga-titulo" style={{ margin: 0, fontSize: '1.1rem', color: C.darkBlue }}>{editando ? `Editar: ${editando.nombre}` : 'Nuevo alojamiento'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {editando?.proveedor_id && (
            <div role="note" style={{ background: '#fff7e6', border: '1px solid #f5c26b', color: C.orange, borderRadius: 6, padding: '10px 12px', fontSize: '0.85rem' }}>
              Este alojamiento lo sincroniza el proveedor <strong>{editando.proveedor_id}</strong> (id externo {editando.id_externo}).
              Los cambios que hagas aquí se sobrescribirán en su próxima sincronización.
            </div>
          )}
          {mensaje && <div role="alert" style={{ background: '#ffebee', color: C.red, borderRadius: 6, padding: '10px 12px', fontSize: '0.85rem', fontWeight: 600 }}>{mensaje}</div>}

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <legend style={{ fontWeight: 700, color: C.darkBlue, marginBottom: 8 }}>Datos básicos</legend>
            <Campo id="ga-nombre" label="Nombre *" error={errores.nombre}>{input('nombre', { maxLength: 255 })}</Campo>
            <Campo id="ga-destino" label="Destino / ciudad *" error={errores.destino}>{input('destino', { maxLength: 100 })}</Campo>
            <Campo id="ga-tipoPropiedad" label="Tipo de propiedad" error={errores.tipoPropiedad}>{input('tipoPropiedad', { maxLength: 100, placeholder: 'Hoteles, Hostales…' })}</Campo>
            <Campo id="ga-tipoAlojamiento" label="Tipo de habitación" error={errores.tipoAlojamiento}>{input('tipoAlojamiento', { maxLength: 100 })}</Campo>
            <Campo id="ga-descripcion" label="Descripción" error={errores.descripcion} ancho>
              <textarea id="ga-descripcion" value={f.descripcion} onChange={cambiar('descripcion')} rows={3} maxLength={5000} style={estiloInput(errores.descripcion)} />
            </Campo>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <legend style={{ fontWeight: 700, color: C.darkBlue, marginBottom: 8 }}>Precio e inventario</legend>
            {variosTipos && (
              <p role="note" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.8rem', color: C.gray }}>
                Este alojamiento tiene {tiposALaVenta(editando).length} tipos de habitación: el precio «desde», las habitaciones y la
                capacidad se calculan a partir de ellos. Cámbialos en «Tipos de habitación».
              </p>
            )}
            <Campo id="ga-precioPorNoche" label="Precio por noche *" error={errores.precioPorNoche}>{input('precioPorNoche', { type: 'number', min: 0.01, step: 0.01, inputMode: 'decimal' })}</Campo>
            <Campo id="ga-moneda" label="Moneda (ISO)" error={errores.moneda}>{input('moneda', { maxLength: 3 })}</Campo>
            <Campo id="ga-habitaciones" label="Habitaciones *" error={errores.habitaciones}>{input('habitaciones', { type: 'number', min: 1 })}</Campo>
            <Campo id="ga-capacidadAdultos" label="Adultos por hab. *" error={errores.capacidadAdultos}>{input('capacidadAdultos', { type: 'number', min: 1 })}</Campo>
            <Campo id="ga-capacidadNinos" label="Niños por hab." error={errores.capacidadNinos}>{input('capacidadNinos', { type: 'number', min: 0 })}</Campo>
            <Campo id="ga-camas" label="Camas" error={errores.camas}>{input('camas', { type: 'number', min: 1 })}</Campo>
            <Campo id="ga-banos" label="Baños" error={errores.banos}>{input('banos', { type: 'number', min: 0, step: 0.5 })}</Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={f.tienePiscina} onChange={cambiar('tienePiscina')} /> Tiene piscina
            </label>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <legend style={{ fontWeight: 700, color: C.darkBlue, marginBottom: 8 }}>Contenido de la ficha</legend>
            <Campo id="ga-fotos" label="Fotos (una URL https por línea)" error={errores.fotos} ancho>
              <textarea id="ga-fotos" value={f.fotos} onChange={cambiar('fotos')} rows={3} style={estiloInput(errores.fotos)} placeholder="https://…/foto1.jpg" />
            </Campo>
            <Campo id="ga-amenidades" label="Servicios (separados por comas)" error={errores.amenidades} ancho>{input('amenidades', { placeholder: 'WiFi gratis, Piscina, Pet friendly' })}</Campo>
            <Campo id="ga-direccion" label="Dirección" error={errores.direccion}>{input('direccion', { maxLength: 250 })}</Campo>
            <Campo id="ga-ciudad" label="Ciudad" error={errores.ciudad}>{input('ciudad', { maxLength: 100 })}</Campo>
            <Campo id="ga-pais" label="País (ISO, 2 letras)" error={errores.pais}>{input('pais', { maxLength: 2 })}</Campo>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <legend style={{ fontWeight: 700, color: C.darkBlue, marginBottom: 8 }}>Políticas y estado</legend>
            <Campo id="ga-checkinDesde" label="Check-in desde" error={errores.checkinDesde}>{input('checkinDesde', { type: 'time' })}</Campo>
            <Campo id="ga-checkoutHasta" label="Check-out hasta" error={errores.checkoutHasta}>{input('checkoutHasta', { type: 'time' })}</Campo>
            <Campo id="ga-estado" label="Estado" error={errores.estado}>
              <select id="ga-estado" value={f.estado} onChange={cambiar('estado')} style={estiloInput(errores.estado)}>
                <option value="ACTIVO">Activo (visible y reservable)</option>
                <option value="INACTIVO">Inactivo (oculto)</option>
              </select>
            </Campo>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={f.mascotas} onChange={cambiar('mascotas')} /> Admite mascotas
            </label>
            <Campo id="ga-cancelacion" label="Política de cancelación" error={errores.cancelacion} ancho>{input('cancelacion', { maxLength: 500, placeholder: 'Cancelación gratuita hasta 48 h antes de la llegada' })}</Campo>
          </fieldset>
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onCerrar} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 6, padding: '9px 16px', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button type="submit" disabled={guardando} style={{ background: C.blue, color: C.white, border: 'none', borderRadius: 6, padding: '9px 18px', cursor: 'pointer', fontWeight: 700 }}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear alojamiento'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GestionAlojamientos() {
  const [datos, setDatos] = useState({ data: [], resumen: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [filtros, setFiltros] = useState({ estado: '', proveedor: '', q: '' });
  const [formulario, setFormulario] = useState(null); // { inicial, editando }
  const [ocupado, setOcupado] = useState(null);
  const [verIntegracion, setVerIntegracion] = useState(false);
  const [gestorTipos, setGestorTipos] = useState(null); // alojamiento
  const [verProveedores, setVerProveedores] = useState(false);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
      setDatos(await getCatalogoGestion(params));
    } catch (err) {
      if (silencioso) throw err;
      setError(mensajeDe(err, 'No se pudo cargar el catálogo de alojamientos.'));
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(cargar, filtros.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, filtros.q]);

  // Se actualiza solo cada 15 s; se detiene mientras hay un formulario o una ventana abierta.
  const auto = useAutoRefresh(cargar, 15000, { pausado: !!(formulario || ocupado || verIntegracion || gestorTipos || verProveedores) });

  const cambiarEstado = async (a) => {
    const nuevo = a.estado === 'INACTIVO' ? 'ACTIVO' : 'INACTIVO';
    if (nuevo === 'INACTIVO' && !window.confirm(`¿Desactivar "${a.nombre}"? Dejará de mostrarse y no se podrá reservar. Sus reservas existentes se mantienen.`)) return;
    setOcupado(a.id);
    try {
      await actualizarAlojamiento(a.id, { estado: nuevo });
      setAviso({ tipo: 'ok', texto: `"${a.nombre}" ahora está ${nuevo === 'ACTIVO' ? 'activo' : 'inactivo'}.` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDe(err, 'No se pudo cambiar el estado.') });
    } finally {
      setOcupado(null);
    }
  };

  const borrar = async (a) => {
    if (!window.confirm(`¿Eliminar "${a.nombre}"? Si tiene reservas pasadas se dará de baja conservando su historial; si no, se borrará definitivamente.`)) return;
    setOcupado(a.id);
    try {
      await eliminarAlojamiento(a.id);
      setAviso({ tipo: 'ok', texto: `"${a.nombre}" fue dado de baja.` });
      await cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDe(err, 'No se pudo eliminar el alojamiento.') });
    } finally {
      setOcupado(null);
    }
  };

  const r = datos.resumen;
  const proveedores = useMemo(() => r?.proveedores || [], [r]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: C.darkBlue }}>Catálogo de alojamientos</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: C.gray }}>Altas manuales y alojamientos sincronizados por proveedores.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setVerProveedores(true)}
            style={{ background: C.white, border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer' }}>
            🔑 Proveedores
          </button>
          <button type="button" onClick={() => setVerIntegracion((v) => !v)} aria-expanded={verIntegracion}
            style={{ background: C.white, border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer' }}>
            🔗 Integración de proveedores
          </button>
          <button type="button" onClick={() => setFormulario({ inicial: VACIO, editando: null })}
            style={{ background: C.blue, color: C.white, border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>
            ➕ Nuevo alojamiento
          </button>
        </div>
      </div>

      {verIntegracion && (
        <div style={{ background: C.lightBlue, border: `1px solid #c4d9f5`, borderRadius: 8, padding: '14px 16px', fontSize: '0.85rem', color: C.text, lineHeight: 1.5 }}>
          <strong>Cómo se integra el sistema de un proveedor</strong>
          <ol style={{ margin: '6px 0 8px', paddingLeft: 20 }}>
            <li>Se registra en <strong>🔑 Proveedores</strong>: se le asigna un id y se genera su API key (se muestra una sola vez; se puede rotar o desactivar).</li>
            <li>Envía su inventario a <code>POST {API_BASE}/alojamientos/sincronizar</code> con la cabecera <code>X-Api-Key</code> (hasta 100 por lote).</li>
            <li>Cada alojamiento lleva su <code>idExterno</code>: reenviarlo actualiza en vez de duplicar. Para retirarlo se envía con <code>estado: &quot;INACTIVO&quot;</code>.</li>
            <li>Opcional: <code>tiposHabitacion</code> con cada tipo (código, precio, cupo, capacidad, régimen, cancelación). Se emparejan por <code>codigo</code>.</li>
            <li>La respuesta indica, por cada uno, CREADO, ACTUALIZADO o ERROR con el campo exacto. El contrato completo está en <code>/api/docs</code>.</li>
          </ol>
          <pre style={{ margin: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, overflowX: 'auto', fontSize: '0.75rem' }}>{`curl -X POST ${API_BASE}/alojamientos/sincronizar \\
  -H "X-Api-Key: <clave del proveedor>" -H "Content-Type: application/json" \\
  -d '{"alojamientos":[{"idExterno":"HTL-42","nombre":"Hostal Andino","destino":"Otavalo",
       "precioPorNoche":38.9,"moneda":"USD","capacidadAdultos":3,"capacidadNinos":1,
       "habitaciones":4,"tienePiscina":false,
       "photos":[{"url":"https://…/1.jpg"}],
       "politicas":{"checkin_desde":"14:00","checkout_hasta":"11:00"},
       "tiposHabitacion":[
         {"codigo":"doble","nombre":"Doble","capacidadAdultos":2,"precioPorNoche":38.9,"cantidad":3,"regimen":"DESAYUNO"},
         {"codigo":"familiar","nombre":"Familiar","capacidadAdultos":4,"capacidadNinos":2,"precioPorNoche":62,"cantidad":1,"cancelacionGratuitaHoras":null}]}]}'`}</pre>
        </div>
      )}

      {r && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[['Total', r.total, C.darkBlue], ['Activos', r.activos, C.green], ['Inactivos', r.inactivos, C.orange], ['Altas manuales', r.manuales, C.gray], ['De proveedores', r.de_proveedores, C.blue]].map(([l, v, col]) => (
            <div key={l} style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: `3px solid ${col}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.75rem', color: C.gray }}>{l}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: col }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div role="search" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 220px' }}>
          <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Buscar alojamiento</span>
          <input type="search" placeholder="Buscar por nombre, destino o id…" value={filtros.q} onChange={(e) => setFiltros((x) => ({ ...x, q: e.target.value }))}
            aria-label="Buscar alojamiento" style={{ ...estiloInput(), width: '100%' }} />
        </label>
        <select aria-label="Filtrar por estado" value={filtros.estado} onChange={(e) => setFiltros((x) => ({ ...x, estado: e.target.value }))} style={estiloInput()}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Inactivos</option>
        </select>
        <select aria-label="Filtrar por origen" value={filtros.proveedor} onChange={(e) => setFiltros((x) => ({ ...x, proveedor: e.target.value }))} style={estiloInput()}>
          <option value="">Todos los orígenes</option>
          <option value="manual">Alta manual</option>
          {proveedores.map((p) => <option key={p} value={p}>Proveedor: {p}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><ActualizadoHace ultima={auto.ultima} fallos={auto.fallos} cada={15000} /></div>
      <Aviso aviso={aviso} onCerrar={() => setAviso(null)} />
      {error && <div role="alert" style={{ background: '#ffebee', color: C.red, borderRadius: 6, padding: '10px 12px', fontSize: '0.85rem', fontWeight: 600 }}>{error} <button type="button" onClick={cargar} style={{ marginLeft: 8 }}>Reintentar</button></div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Catálogo de alojamientos</caption>
          <thead>
            <tr style={{ background: C.lightBlue }}>
              {['Alojamiento', 'Destino', 'Precio desde', 'Tipos / hab.', 'Origen', 'Estado', 'Reservas pendientes', 'Acciones'].map((h) => (
                <th key={h} scope="col" style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: C.darkBlue, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.gray }}>Cargando catálogo…</td></tr>}
            {!cargando && datos.data.length === 0 && !error && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.gray }}>No hay alojamientos con esos filtros.</td></tr>}
            {!cargando && datos.data.map((a) => (
              <tr key={a.id} style={{ borderTop: `1px solid ${C.border}`, opacity: a.estado === 'INACTIVO' ? 0.75 : 1 }}>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ fontWeight: 700 }}>{a.nombre}</div>
                  <div style={{ fontSize: '0.75rem', color: C.gray, fontFamily: 'monospace' }}>{a.id}</div>
                </td>
                <td style={{ padding: '9px 12px' }}>{a.destino}</td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{Number(a.precioPorNoche).toFixed(2)} {a.moneda}</td>
                <td style={{ padding: '9px 12px' }}>
                  <button type="button" onClick={() => setGestorTipos(a)} aria-label={`Tipos de habitación de ${a.nombre}`}
                    style={{ background: C.lightBlue, border: `1px solid #c4d9f5`, color: C.darkBlue, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    🛏️ {tiposALaVenta(a).length} · {a.habitaciones} hab.
                  </button>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  {a.proveedor_id ? (
                    <>
                      <div style={{ fontWeight: 600, color: C.blue }}>{a.proveedor_id}</div>
                      <div style={{ fontSize: '0.72rem', color: C.gray }}>ext. {a.id_externo || '—'} · sinc. {fmtFecha(a.ultima_sincronizacion)}</div>
                    </>
                  ) : <span style={{ color: C.gray }}>Alta manual</span>}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700, background: a.estado === 'INACTIVO' ? '#fff3e0' : '#e8f5e9', color: a.estado === 'INACTIVO' ? C.orange : C.green }}>
                    {a.estado === 'INACTIVO' ? 'Inactivo' : 'Activo'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }}>{a.reservas_pendientes}</td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                  <button type="button" disabled={ocupado === a.id} onClick={() => setFormulario({ inicial: aFormulario(a), editando: a })} aria-label={`Editar ${a.nombre}`} title="Editar"
                    style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', marginRight: 4 }}>✏️</button>
                  <button type="button" disabled={ocupado === a.id} onClick={() => cambiarEstado(a)} aria-label={`${a.estado === 'INACTIVO' ? 'Activar' : 'Desactivar'} ${a.nombre}`} title={a.estado === 'INACTIVO' ? 'Activar' : 'Desactivar'}
                    style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', marginRight: 4 }}>{a.estado === 'INACTIVO' ? '▶️' : '⏸️'}</button>
                  <button type="button" disabled={ocupado === a.id} onClick={() => borrar(a)} aria-label={`Eliminar ${a.nombre}`} title="Eliminar"
                    style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gestorTipos && (
        <GestorTiposHabitacion alojamiento={gestorTipos} onCerrar={() => setGestorTipos(null)} onCambio={cargar} />
      )}
      {verProveedores && <ProveedoresAlojamiento onCerrar={() => setVerProveedores(false)} onCambio={cargar} />}

      {formulario && (
        <FormularioAlojamiento
          inicial={formulario.inicial}
          editando={formulario.editando}
          onCerrar={() => setFormulario(null)}
          onGuardado={(res, accion) => {
            setFormulario(null);
            setAviso({ tipo: 'ok', texto: `Alojamiento "${res.nombre || formulario.editando?.nombre}" ${accion}.` });
            cargar();
          }}
        />
      )}
    </div>
  );
}
