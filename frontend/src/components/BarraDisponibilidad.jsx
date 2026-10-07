import { useEffect, useId, useRef, useState } from 'react';
import { CalendarIcon, UserIcon, ChevronDownIcon } from './BookingIcons';
import { fechaLocal } from '../utils/fechas';
import './BarraDisponibilidad.css';

const MAX_ADULTOS = 30;
const MAX_NINOS = 10;
const MAX_HABITACIONES = 30;

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${DIAS[f.getDay()]} ${d} ${MESES[f.getMonth()]}`;
}

export function resumenOcupacion({ adultos, edadesNinos, habitaciones }) {
  const n = edadesNinos.length;
  return `${adultos} ${adultos === 1 ? 'adulto' : 'adultos'} · ${n} ${n === 1 ? 'niño' : 'niños'} · ${habitaciones} ${habitaciones === 1 ? 'habitación' : 'habitaciones'}`;
}

function Contador({ etiqueta, descripcion, valor, min, max, onCambiar }) {
  const id = useId();
  return (
    <div className="bd-fila">
      <div>
        <div id={id} className="bd-fila-titulo">{etiqueta}</div>
        {descripcion && <div className="bd-fila-desc">{descripcion}</div>}
      </div>
      <div className="bd-stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label={`Quitar ${etiqueta.toLowerCase()}`} disabled={valor <= min} onClick={() => onCambiar(valor - 1)}>−</button>
        <span aria-live="polite">{valor}</span>
        <button type="button" aria-label={`Añadir ${etiqueta.toLowerCase()}`} disabled={valor >= max} onClick={() => onCambiar(valor + 1)}>+</button>
      </div>
    </div>
  );
}

/**
 * Barra "Disponibilidad" de la página del alojamiento, como en Booking.com:
 * fechas + ocupación (adultos, niños con su edad, habitaciones) + "Cambiar búsqueda".
 *
 * Trabaja sobre un BORRADOR: los cambios no se aplican hasta pulsar "Cambiar
 * búsqueda", que llama a `onAplicar(borrador)`. La página consulta al backend y
 * devuelve `{ ok }` o `{ ok: false, errores: [{ campo, mensaje }], mensaje }`;
 * los errores del backend (fechas, capacidad…) se muestran aquí mismo.
 */
export function BarraDisponibilidad({ valores, onAplicar, consultando = false, errorExterno = '' }) {
  const [borrador, setBorrador] = useState(valores);
  const [abierto, setAbierto] = useState(null); // 'fechas' | 'ocupacion' | null
  const [errores, setErrores] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const ref = useRef(null);

  // Si la página aplica valores nuevos (p. ej. desde la URL), el borrador se sincroniza.
  useEffect(() => {
    setBorrador(valores);
  }, [valores.checkin, valores.checkout, valores.adultos, valores.habitaciones, valores.edadesNinos.join(',')]);

  // Cerrar popovers con clic fuera o Escape.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(null); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(null); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const cambiar = (parcial) => {
    setBorrador((b) => ({ ...b, ...parcial }));
    setErrores([]);
    setMensaje('');
  };

  const cambiarNinos = (n) => {
    const edades = [...borrador.edadesNinos];
    while (edades.length < n) edades.push(null);
    edades.length = n;
    cambiar({ edadesNinos: edades });
  };

  const errorDe = (campo) => errores.find((e) => e.campo === campo)?.mensaje;

  const aplicar = async () => {
    // Validaciones inmediatas (el backend vuelve a validarlo todo).
    const locales = [];
    if (!borrador.checkin || !borrador.checkout) locales.push({ campo: 'fechas', mensaje: 'Selecciona las fechas de entrada y salida.' });
    else if (borrador.checkout <= borrador.checkin) locales.push({ campo: 'fechas', mensaje: 'La fecha de salida debe ser posterior a la de entrada.' });
    if (borrador.edadesNinos.some((e) => e === null || e === '' || e === undefined)) {
      locales.push({ campo: 'ocupacion', mensaje: 'Indica la edad de cada niño (es necesaria para darte el precio correcto).' });
    }
    if (locales.length > 0) {
      setErrores(locales);
      setAbierto(locales[0].campo);
      return;
    }

    setAbierto(null);
    const resultado = await onAplicar(borrador);
    if (resultado && !resultado.ok) {
      setErrores(resultado.errores || []);
      setMensaje(resultado.mensaje || '');
    } else {
      setErrores([]);
      setMensaje('');
    }
  };

  const errFechas = errorDe('fechas');
  const errOcupacion = errorDe('ocupacion');
  const mensajeGeneral = mensaje || errorExterno;

  return (
    <div className="bd-contenedor" ref={ref}>
      <div className="bd-barra" role="group" aria-label="Cambiar fechas y ocupación">
        {/* Fechas */}
        <div className="bd-campo-wrap">
          <button
            type="button"
            className={`bd-campo${errFechas ? ' bd-campo-error' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={abierto === 'fechas'}
            onClick={() => setAbierto(abierto === 'fechas' ? null : 'fechas')}
          >
            <CalendarIcon size={22} color="#474747" />
            <span className="bd-campo-texto">
              <span className="bd-campo-label">Fechas</span>
              <span className="bd-campo-valor">
                {fechaCorta(borrador.checkin)} — {fechaCorta(borrador.checkout)}
              </span>
            </span>
          </button>
          {abierto === 'fechas' && (
            <div className="bd-popover" role="dialog" aria-label="Elegir fechas">
              <div className="bd-fechas">
                <label>
                  <span>Entrada</span>
                  <input
                    type="date"
                    value={borrador.checkin}
                    min={fechaLocal(0)}
                    onChange={(e) => {
                      const checkin = e.target.value;
                      // Como en Booking: si la salida queda antes, se mueve al día siguiente.
                      const checkout = borrador.checkout && borrador.checkout > checkin
                        ? borrador.checkout
                        : (() => { const [y, m, d] = checkin.split('-').map(Number); const f = new Date(y, m - 1, d + 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; })();
                      cambiar({ checkin, checkout });
                    }}
                  />
                </label>
                <label>
                  <span>Salida</span>
                  <input
                    type="date"
                    value={borrador.checkout}
                    min={borrador.checkin || fechaLocal(1)}
                    onChange={(e) => cambiar({ checkout: e.target.value })}
                  />
                </label>
              </div>
              {errFechas && <p className="bd-error" role="alert">{errFechas}</p>}
              <button type="button" className="bd-listo" onClick={() => setAbierto(null)}>Listo</button>
            </div>
          )}
        </div>

        {/* Ocupación */}
        <div className="bd-campo-wrap">
          <button
            type="button"
            className={`bd-campo${errOcupacion ? ' bd-campo-error' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={abierto === 'ocupacion'}
            onClick={() => setAbierto(abierto === 'ocupacion' ? null : 'ocupacion')}
          >
            <UserIcon size={22} color="#474747" />
            <span className="bd-campo-texto">
              <span className="bd-campo-label">Ocupación</span>
              <span className="bd-campo-valor">{resumenOcupacion(borrador)}</span>
            </span>
            <ChevronDownIcon size={14} color="#1a1a1a" />
          </button>
          {abierto === 'ocupacion' && (
            <div className="bd-popover" role="dialog" aria-label="Elegir ocupación">
              <Contador etiqueta="Adultos" valor={borrador.adultos} min={1} max={MAX_ADULTOS} onCambiar={(adultos) => cambiar({ adultos })} />
              <Contador etiqueta="Niños" descripcion="De 0 a 17 años" valor={borrador.edadesNinos.length} min={0} max={MAX_NINOS} onCambiar={cambiarNinos} />
              {borrador.edadesNinos.length > 0 && (
                <div className="bd-edades">
                  {borrador.edadesNinos.map((edad, i) => (
                    <label key={i}>
                      <span>Edad del niño {i + 1}</span>
                      <select
                        value={edad ?? ''}
                        onChange={(e) => {
                          const edades = [...borrador.edadesNinos];
                          edades[i] = e.target.value === '' ? null : Number(e.target.value);
                          cambiar({ edadesNinos: edades });
                        }}
                        aria-invalid={edad === null || edad === undefined}
                      >
                        <option value="">Edad necesaria</option>
                        {Array.from({ length: 18 }, (_, a) => (
                          <option key={a} value={a}>{a} {a === 1 ? 'año' : 'años'}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <Contador etiqueta="Habitaciones" valor={borrador.habitaciones} min={1} max={MAX_HABITACIONES} onCambiar={(habitaciones) => cambiar({ habitaciones })} />
              {errOcupacion && <p className="bd-error" role="alert">{errOcupacion}</p>}
              <button type="button" className="bd-listo" onClick={() => setAbierto(null)}>Listo</button>
            </div>
          )}
        </div>

        <button type="button" className="bd-aplicar" onClick={aplicar} disabled={consultando}>
          {consultando ? 'Consultando…' : 'Cambiar búsqueda'}
        </button>
      </div>

      {(errFechas || errOcupacion || mensajeGeneral) && !abierto && (
        <div className="bd-aviso" role="alert">
          {[errFechas, errOcupacion].filter(Boolean).map((m) => <div key={m}>{m}</div>)}
          {mensajeGeneral && !errFechas && !errOcupacion && <div>{mensajeGeneral}</div>}
        </div>
      )}
    </div>
  );
}
