import { useId, useMemo, useState } from 'react';
import { PinIcon } from './BookingIcons';
import { buscarDestinos, normalizarTexto, sanitizarDestino } from '../utils/destinos';
import './DestinoAutocomplete.css';

// Resalta en negrita la parte del nombre que coincide con lo escrito (como en Booking).
function NombreResaltado({ nombre, consulta }) {
  const q = normalizarTexto(consulta);
  if (!q) return nombre;
  // normalizarTexto conserva la longitud por carácter en nombres sin espacios dobles,
  // así que los índices sirven para cortar el texto original con tildes.
  const idx = normalizarTexto(nombre).indexOf(q);
  if (idx < 0) return nombre;
  return (
    <>
      {nombre.slice(0, idx)}
      <strong>{nombre.slice(idx, idx + q.length)}</strong>
      {nombre.slice(idx + q.length)}
    </>
  );
}

/**
 * Input de destino con lista desplegable de sugerencias (patrón ARIA combobox).
 * - Flechas arriba/abajo para moverse, Enter para elegir, Escape para cerrar.
 * - Limpia caracteres no válidos y avisa con `onInvalidChars`.
 */
export function DestinoAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  onInvalidChars,
  className = '',
  placeholder = '¿A dónde vas?',
  ariaLabel = 'Introduce un destino o nombre de alojamiento',
  invalid = false,
  errorId,
}) {
  const generatedId = useId();
  const inputId = id || `destino-${generatedId}`;
  const listId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const sugerencias = useMemo(() => buscarDestinos(value), [value]);
  const mostrarLista = open;
  const titulo = value.trim() ? null : 'Destinos populares';

  const seleccionar = (destino) => {
    onChange(destino.nombre);
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(destino);
  };

  const handleChange = (e) => {
    const { valor, huboCambios } = sanitizarDestino(e.target.value);
    onChange(valor);
    if (huboCambios) onInvalidChars?.();
    setOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (sugerencias.length) setActiveIndex((i) => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (sugerencias.length) setActiveIndex((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && sugerencias[activeIndex]) {
        e.preventDefault();
        seleccionar(sugerencias[activeIndex]);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="dest-ac">
      <input
        id={inputId}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={mostrarLista}
        aria-controls={listId}
        aria-activedescendant={mostrarLista && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && errorId ? errorId : undefined}
      />

      {mostrarLista && (
        <div className="dest-ac-panel">
          {titulo && sugerencias.length > 0 && <div className="dest-ac-title">{titulo}</div>}
          <ul id={listId} role="listbox" className="dest-ac-list" aria-label="Sugerencias de destino">
            {sugerencias.length > 0 ? (
              sugerencias.map((destino, idx) => (
                <li
                  key={destino.nombre}
                  id={`${listId}-opt-${idx}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`dest-ac-option${idx === activeIndex ? ' is-active' : ''}`}
                  // preventDefault en mousedown evita que el blur del input cierre la lista antes del click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    seleccionar(destino);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <span className="dest-ac-icon" aria-hidden="true">
                    <PinIcon size={18} color="#1a1a1a" />
                  </span>
                  <span className="dest-ac-text">
                    <span className="dest-ac-name">
                      <NombreResaltado nombre={destino.nombre} consulta={value} />
                    </span>
                    <span className="dest-ac-sub">
                      {destino.region !== destino.nombre ? `${destino.region}, ` : ''}
                      {destino.pais}
                    </span>
                  </span>
                </li>
              ))
            ) : (
              <li className="dest-ac-empty" role="option" aria-selected="false" aria-disabled="true">
                No encontramos destinos que coincidan con “{value.trim()}”. Puedes buscarlo igual por nombre de alojamiento.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
