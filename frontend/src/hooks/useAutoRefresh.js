import { useEffect, useRef, useState } from 'react';

/**
 * Recarga automática y silenciosa de un panel del admin.
 *
 * - Llama a `cargar({ silencioso: true })` cada `ms` milisegundos (la primera
 *   carga la sigue haciendo el propio panel, con su "Cargando…").
 * - Se pausa mientras la pestaña del navegador no está visible y recarga apenas
 *   vuelve.
 * - No se encima: si la recarga anterior no terminó, se salta esa vuelta.
 * - Si falla, reintenta esperando cada vez más (5, 10, 20, 30 s) sin borrar lo
 *   que ya está en pantalla.
 * - `pausado: true` la detiene (por ejemplo, mientras se edita un formulario).
 *
 * Devuelve { ultima, fallos }: hora de la última recarga correcta y fallos seguidos.
 */
export function useAutoRefresh(cargar, ms = 5000, { pausado = false } = {}) {
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  const [ultima, setUltima] = useState(() => Date.now());
  const [fallos, setFallos] = useState(0);
  const enCurso = useRef(false);
  const fallosRef = useRef(0);

  useEffect(() => {
    if (pausado) return undefined;
    let vivo = true;
    let timer = null;

    const programar = (espera) => {
      clearTimeout(timer);
      timer = setTimeout(vuelta, espera);
    };

    async function vuelta() {
      if (!vivo) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // se reanuda al volver
      if (enCurso.current) { programar(ms); return; }
      enCurso.current = true;
      try {
        await cargarRef.current?.({ silencioso: true });
        fallosRef.current = 0;
        if (vivo) { setFallos(0); setUltima(Date.now()); }
      } catch {
        fallosRef.current += 1;
        if (vivo) setFallos(fallosRef.current);
      } finally {
        enCurso.current = false;
      }
      if (!vivo) return;
      const espera = fallosRef.current ? Math.min(30_000, 5000 * 2 ** (fallosRef.current - 1)) : ms;
      programar(espera);
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') programar(0);
    };
    document.addEventListener('visibilitychange', alVolver);
    programar(ms);
    return () => {
      vivo = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [ms, pausado]);

  /** Para que el panel marque "actualizado" también en su carga inicial. */
  const marcar = () => { fallosRef.current = 0; setFallos(0); setUltima(Date.now()); };
  return { ultima, fallos, marcar };
}

/** Segundos transcurridos desde `desde`, actualizados cada segundo. */
export function useSegundosDesde(desde) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.round((ahora - desde) / 1000));
}
