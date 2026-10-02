import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CATEGORIAS_COOKIES,
  guardarConsentimiento,
  leerConsentimiento,
} from '../services/userPreferences';

/**
 * Banner de Consentimiento de Cookies.
 *
 * Cumple la seccion 5 del FRONTEND_IMPLEMENTATION_PLAN.md ("Banner de Cookies:
 * solicite el consentimiento explicito, bloqueando rastreadores hasta ser
 * aceptado") y la regla 4 del OPENCLOUD_FRONTEND_CONTEXT.md.
 *
 * ── Accesibilidad ───────────────────────────────────────────────────────────
 * · `role="dialog"` + `aria-modal="true"` + `aria-labelledby` / `aria-describedby`.
 * · Foco atrapado dentro del dialogo (hook `useFocusTrap`).
 * · `Escape` cierra el panel. IMPORTANTE: cerrar con Escape NO equivale a
 *   aceptar. Se registra como decision 'essential', que es el default
 *   conservador. Aceptar por descuido seria un vicio de consentimiento, y
 *   aceptarlo por inaccion tambien lo seria; se elige siempre la opcion que
 *   protege al usuario.
 * · El contenido no se inserta como HTML: todo es texto de React, sin
 *   `dangerouslySetInnerHTML`.
 *
 * ── Bloqueo de rastreadores ─────────────────────────────────────────────────
 * El bloqueo real no esta en este componente, sino en `cargarScriptOpcional`
 * (ver `services/cookieConsent.js`): ningun script de terceros puede inyectarse
 * mientras no exista consentimiento. Este componente solo informa y decide.
 */
export function BannerCookies({ abiertoExternamente = false, onCerrarExterno }) {
  const [decision, setDecision] = useState(() => leerConsentimiento());
  const [preferencias, setPreferencias] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogoRef = useRef(null);

  // Al cargar, el banner aparece si no hay decision registrada. Se retrasa un
  // instante para no competir con el render inicial ni desplazar el layout de
  // forma brusca.
  useEffect(() => {
    if (leerConsentimiento() === null) {
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  // El Footer puede pedir abrir las preferencias en cualquier momento.
  useEffect(() => {
    if (abiertoExternamente) {
      setPreferencias(true);
      setVisible(true);
    }
  }, [abiertoExternamente]);

  const cerrar = useCallback(() => {
    setVisible(false);
    setPreferencias(false);
    onCerrarExterno?.();
  }, [onCerrarExterno]);

  const decidir = useCallback(
    (nuevaDecision) => {
      guardarConsentimiento(nuevaDecision);
      setDecision(nuevaDecision);
      cerrar();
    },
    [cerrar],
  );

  // Escape: cerrar sin aceptar equivale a rechazar las no esenciales.
  const alCerrarPorEscape = useCallback(() => {
    if (decision === null) {
      decidir('essential');
    } else {
      cerrar();
    }
  }, [decision, decidir, cerrar]);

  useFocusTrap(visible, alCerrarPorEscape, dialogoRef);

  // `visible` ya resume todos los caminos posibles: mostrar al cargar si no hay
  // decision, ocultar al decidir, y reabrir desde el Footer.
  if (!visible) return null;

  return (
    <div className="cookie-overlay">
      <div
        className="cookie-banner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-banner-title"
        aria-describedby="cookie-banner-desc"
        ref={dialogoRef}
        tabIndex={-1}
      >
        <div className="cookie-banner-head">
          <span className="cookie-icon" aria-hidden="true">
            🍪
          </span>
          <h2 className="cookie-banner-title" id="cookie-banner-title">
            {preferencias ? 'Preferencias de cookies' : 'Usamos cookies'}
          </h2>
        </div>

        {preferencias ? (
          <>
            <p className="cookie-banner-text" id="cookie-banner-desc">
              Elige que categorias quieres permitir. Las cookies esenciales
              estan siempre activas porque sin ellas la sesion no funciona.
            </p>

            <ul className="cookie-categorias">
              {CATEGORIAS_COOKIES.map((cat) => (
                <li key={cat.id} className="cookie-categoria">
                  <label className="cookie-categoria-head">
                    <input
                      type="checkbox"
                      checked={cat.obligatoria || decision === 'all'}
                      disabled={cat.obligatoria}
                      onChange={() => decidir(cat.obligatoria ? 'essential' : 'all')}
                      aria-describedby={`cookie-cat-${cat.id}`}
                    />
                    <strong>{cat.nombre}</strong>
                    {cat.obligatoria && (
                      <span className="cookie-tag">Siempre activa</span>
                    )}
                  </label>
                  <p className="cookie-categoria-desc" id={`cookie-cat-${cat.id}`}>
                    {cat.descripcion}
                  </p>
                </li>
              ))}
            </ul>

            <div className="cookie-actions">
              <button
                type="button"
                className="cookie-btn cookie-btn-ghost"
                onClick={() => decidir('essential')}
              >
                Solo esenciales
              </button>
              <button
                type="button"
                className="cookie-btn cookie-btn-primary"
                onClick={() => decidir('all')}
              >
                Guardar preferencias
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cookie-banner-text" id="cookie-banner-desc">
              Actualmente usamos cookies para mantener tu sesion y tu seguridad.
              Con tu permiso Tambien queremos usar cookies de medicion para
              mejorar el servicio. Puedes decidir en cualquier momento desde
              el enlace <strong>Preferencias de cookies</strong> del pie de
              pagina.
            </p>

            <p className="cookie-banner-links">
              Lee nuestra{' '}
              <Link to="/privacidad" onClick={cerrar}>
                Politica de Privacidad
              </Link>{' '}
              y nuestros{' '}
              <Link to="/terminos" onClick={cerrar}>
                Terminos de Uso
              </Link>
              .
            </p>

            <div className="cookie-actions">
              <button
                type="button"
                className="cookie-btn cookie-btn-ghost"
                onClick={() => decidir('essential')}
              >
                Solo esenciales
              </button>
              <button
                type="button"
                className="cookie-btn cookie-btn-ghost"
                onClick={() => setPreferencias(true)}
              >
                Preferencias
              </button>
              <button
                type="button"
                className="cookie-btn cookie-btn-primary"
                onClick={() => decidir('all')}
              >
                Aceptar todas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
