/**
 * System prompt del bot.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SE CONSTRUYE EN VEZ DE SER UNA CONSTANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tres cosas cambian por petición y de las que el modelo no puede saber nada solo:
 *
 *  1. **La fecha de hoy.** `gpt-oss` no tiene reloj. Si el usuario dice "el
 *     viernes" o "mañana", sin saber hoy lo resuelve contra una fecha inventada y
 *     toda la búsqueda apunta al día equivocado. Se le inyectan las referencias.
 *  2. **El idioma.** El frontend lo pasa desde `LanguageContext`.
 *  3. **Nada más.** Antes este prompt llevaba el catálogo completo de ciudades con
 *     su IATA (~250 tokens en cada una de las dos llamadas del turno). Se quitó
 *     porque es redundante: el modelo puede pasar `"Quito"` y el ejecutor lo
 *     traduce a `UIO` con su propia tabla (`aIata()` en el executor), que además
 *     rechaza lo que no reconoce. Pedirle al modelo que tradujera era preguntarle
 *     algo que ya se resolvía mejor en el servidor, y paying por ello dos veces.
 */

import { DESTINOS } from './chatbot.constants';

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Fecha de hoy en el huso de Ecuador (America/Guayaquil, UTC-5).
 *
 * Se usa el huso local del servidor y no `toISOString()` a propósito: el proyecto
 * opera en Ecuador y `toISOString()` devuelve UTC, que a las 20:00 de Quito ya es
 * el día siguiente. Un "hoy" corrido un día desplaza todas las fechas relativas.
 */
function hoyEnEcuador(): Date {
  const ahora = new Date();
  // Ecuador no aplica horario de verano (UTC-5 fijo desde 1993).
  return new Date(ahora.getTime() - (5 * 60 + ahora.getTimezoneOffset()) * 60_000);
}

/** `2026-12-12 (sábado)` en ISO + día de la semana, para que el modelo razone. */
function formatearFecha(d: Date): string {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  return `${iso} (${DIAS_ES[d.getDay()]})`;
}

export interface OpcionesPrompt {
  idioma: 'es' | 'en';
}

/**
 * Construye el system prompt.
 *
 * @param idioma `es` (por defecto) o `en`. El frontend lo saca de `LanguageContext`.
 */
export function construirSystemPrompt(opciones: OpcionesPrompt): string {
  const { idioma } = opciones;
  const hoy = hoyEnEcuador();

  return idioma === 'en' ? promptEn(hoy) : promptEs(hoy);
}

function proximoViernes(hoy: Date): Date {
  const d = new Date(hoy.getTime());
  const delta = (5 - d.getDay() + 7) % 7 || 7; // 5 = viernes
  return new Date(d.getTime() + delta * 86_400_000);
}

/**
 * Prompt en español.
 *
 * ── Sobre la brevedad de este texto ─────────────────────────────────────────
 *
 * Este prompt se envía en CADA llamada, y un turno hace dos. Es la parte del
 * presupuesto de tokens que se paga dos veces, así que cada línea tiene que
 * ganarse su sitio.
 *
 * Se conserva lo que el modelo no puede deducir solo y lo que cambia el
 * comportamiento de forma medible:
 *
 * · las referencias de fecha (no tiene reloj);
 * · la prohibición de reservar (sin ella pide herramientas de escritura que no
 *   existen y se atasca);
 * · "no hay datos, no hay resultados" (sin ella un error de red se le presenta
 *   como "no hay disponibilidad", que es la afirmación más dañina posible);
 * · "no inventes" (la regla general).
 *
 * Se quitó: el catálogo de ciudades (lo traduce el ejecutor) y las explicaciones
 * de "cómo trabajar" que repetían lo que ya dicen las descripciones de las
 * herramientas.
 */
function promptEs(hoy: Date): string {
  return `Eres el asistente informativo de Booking Ecuador. Solo consultas disponibilidad de vuelos, alojamientos, autos y atracciones; la reserva se completa en la web.

Hoy es ${formatearFecha(hoy)}. Calcula las fechas relativas (mañana, el viernes, la próxima semana) a partir de ese día y en formato YYYY-MM-DD. Si falta una fecha obligatoria, pregunta: nunca la elijas tú.

No puedes reservar, crear órdenes, cobrar, emitir boletos ni cancelar. Si te lo piden, explica amablemente que solo consultas información.

Puedes pasar el nombre de la ciudad ("Quito") o su código ("UIO"); el sistema lo traduce. Si pides una ciudad que no conoces, dilo en vez de inventar un código.

Reglas:
- Solo afirma datos que aparezcan en los resultados de las herramientas.
- Si una herramienta devuelve 0 resultados, di "no hay disponibilidad" sin rodeos.
- Si una herramienta falla, di que NO se pudo verificar. Nunca digas "no hay" si la consulta solo falló.
- No inventes precios, horarios ni disponibilidad.
- No pidas datos personales.
- Breve: un párrafo o 5 opciones como máximo.`;
}

/** Equivalente en inglés, con las mismas reglas de brevedad. */
function promptEn(hoy: Date): string {
  return `You are the Booking Ecuador assistant. You only look up availability for flights, accommodations, rental cars and attractions; bookings are completed on the website.

Today is ${formatearFecha(hoy)}. Turn "tomorrow", "this Friday" or "next week" into YYYY-MM-DD using that day as the reference. If a required date is missing, ask: never pick one yourself.

You CANNOT book, place orders, take payments, issue tickets or cancel. If asked, politely explain you only provide information.

You may pass a city name ("Quito") or its code ("UIO"); the system translates. If asked about a city you do not serve, say so instead of inventing a code.

Rules:
- Only state data that appears in the tool results.
- If a tool returns 0 results, say plainly "no availability".
- If a tool fails, say availability could NOT be verified. Never say "none" when the query merely failed.
- Never invent prices, times or availability.
- Never ask for personal data.
- Be brief: one paragraph or at most 5 options.`;
}

/**
 * Mensaje fijo para cuando el usuario pide una acción de escritura.
 *
 * No pasa por Groq a propósito: la respuesta es determinista y mandarla al modelo
 * solo introduce el riesgo de que se la reformule. Es también la respuesta
 * que `GET /chatbot/alcance` expone como `mensaje_limite`.
 */
export const RESPUESTA_SOLO_LECTURA =
  'Puedo ayudarte a consultar disponibilidad e información de vuelos, alojamientos, autos y atracciones, ' +
  'pero no puedo crear reservas ni procesar pagos. La reserva se completa desde la web: ' +
  'busca tu opción en el buscador, selecciona la que prefieras y confirma el pago ahí.';

// Se reexporta para que quien use el prompt no tenga que importar dos archivos.
export { DESTINOS };