import { useEffect, useState } from 'react';

/**
 * Mensajes de carga por etapas: mientras `activo` es true avanza de un mensaje al
 * siguiente cada `cadaMs` y se queda en el último hasta que termine la operación.
 * Devuelve el mensaje actual (o null si no está activo).
 */
export function useEtapasCarga(activo, etapas, cadaMs = 1200) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (!activo) return undefined;
    const id = setInterval(() => setI((x) => Math.min(x + 1, etapas.length - 1)), cadaMs);
    return () => clearInterval(id);
  }, [activo, cadaMs, etapas.length]);
  return activo ? etapas[Math.min(i, etapas.length - 1)] : null;
}
