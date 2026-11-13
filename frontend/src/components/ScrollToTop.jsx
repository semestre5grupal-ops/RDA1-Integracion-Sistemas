import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resetea automáticamente el scroll a la parte superior (top: 0) cada vez
 * que el usuario cambia de página o ruta. Evita que al hacer clic en un hotel
 * desde la lista de búsqueda se abra la ficha en la parte inferior.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

