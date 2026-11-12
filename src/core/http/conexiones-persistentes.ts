import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Reutiliza las conexiones HTTPS hacia aerolíneas y socios.
 *
 * El `fetch` de Node cierra una conexión inactiva a los ~4 s, así que casi cada
 * llamada a un socio (búsqueda, hold, pago, ping) volvía a pagar DNS + TCP + TLS,
 * que entre regiones cuesta 300–600 ms. Con este agente la conexión queda abierta
 * hasta 60 s sin uso y las siguientes llamadas la reutilizan.
 *
 * No cambia qué se llama ni cómo: solo cuánto dura abierta la conexión. Los
 * timeouts de cada llamada (AbortSignal) siguen igual.
 */
export function activarConexionesPersistentes(): void {
  try {
    setGlobalDispatcher(
      new Agent({
        keepAliveTimeout: 60_000,
        keepAliveMaxTimeout: 300_000,
        connections: 64,
        connect: { timeout: 10_000 },
      }),
    );
  } catch {
    /* si falla, se queda el agente por defecto de Node */
  }
}
