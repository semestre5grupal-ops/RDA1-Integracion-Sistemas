import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TraceContextService } from '../../core/tracing/trace-context.service';

import { MODELO_POR_DEFECTO, LIMITES } from './chatbot.constants';
import { DefinicionHerramienta } from './chatbot.tools';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de la API de Groq (compatible con OpenAI / chat/completions)
// ─────────────────────────────────────────────────────────────────────────────

/** Un mensaje del historial o del turno actual. */
export interface MensajeGroq {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Presente solo en `role: 'tool'`. */
  tool_call_id?: string;
  /** Presente solo en `role: 'assistant'`, cuando el modelo pide herramientas. */
  tool_calls?: LlamadaHerramienta[];
}

export interface LlamadaHerramienta {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface RespuestaGroq {
  /** Texto de la respuesta, o `null` si el modelo solo pidió herramientas. */
  texto: string | null;
  /** Herramientas que el modelo pidió ejecutar en esta iteración. */
  llamadas: LlamadaHerramienta[];
  /** Uso de tokens, solo para el log. */
  uso?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  /** `finish_reason` crudo: `tool_calls`, `stop`, `length`... */
  finishReason?: string;
}

const BASE_URL_GROQ = 'https://api.groq.com/openai/v1';

/**
 * Cliente HTTP de Groq.
 *
 * ── Por que `axios` directo y no el SDK `groq-sdk` ───────────────────────────
 * El SDK oficial es un wrapper de exactamente esta API y no añade capacidades que
 * necesitemos. Axios ya es dependencia del proyecto (la usa `AutosService` y
 * `AtraccionesService` contra las APIs externas), así que esto no suma una
 * dependencia al `package.json` ni un `node_modules` que mantener. Si algún día se
 * quiere el SDK, este archivo es el único punto a cambiar: el resto del módulo
 * habla con `completar()` y no con el transporte.
 *
 * ── El LLM nunca ve la clave ────────────────────────────────────────────────
 * La clave se lee del `ConfigService` una vez en el constructor y no se propaga
 * a ninguna otra capa. Los headers se construyen aquí, en local. Ningún DTO,
 * prompt ni respuesta la incluye, así que no puede filtrarse por un log accidental.
 */
@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly apiKey: string;
  private readonly modelo: string;
  private readonly razonamiento: string;
  private readonly http = axios.create({ baseURL: BASE_URL_GROQ });

  constructor(
    private readonly config: ConfigService,
    @Optional() traceContext?: TraceContextService,
  ) {
    traceContext?.instrumentAxios(this.http);
    this.apiKey = this.config.get<string>('GROQ_API_KEY') ?? '';
    this.modelo = this.config.get<string>('GROQ_MODEL') || MODELO_POR_DEFECTO;

    // `openai/gpt-oss-*` es un modelo de RAZONAMIENTO: antes de responder, genera
    // un borrador interno en `message.reasoning`. Con `medium` (su valor por
    // defecto) eso puede añadir varios segundos a cada turno, y aquí cada turno
    // son dos llamadas. `low` mantiene la calidad de tool-calling —que es lo que
    // importa— y recorta la latencia de forma notable.
    //
    // Un bot de consulta se juega en la rapidez de la respuesta: una disponibilidad
    // que tarda 8 segundos hace que el usuario repita la pregunta. Si en algún
    // momento hiciera falta más profundidad, se sube por `GROQ_REASONING`.
    this.razonamiento = this.config.get<string>('GROQ_REASONING') || 'low';

    if (!this.apiKey) {
      // No se lanza: el bot debe seguir levantando el servidor y el endpoint
      // responde 503 con un mensaje claro (ver `ChatbotService.disponible()`).
      // Lanzar aquí tumbaría toda la API por una variable de entorno ausente.
      this.logger.warn(
        'GROQ_API_KEY no está definida. El chatbot quedará deshabilitado ' +
          '(POST /api/v1/chatbot/mensaje responderá 503). El resto de la API no se afecta.',
      );
    }
  }

  /** ¿Hay credencial para hablar con el LLM? */
  get habilitado(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Ejecuta UNA llamada a `chat/completions` con tool-calling habilitado.
   *
   * Devuelve el texto y las llamadas a herramientas por separado porque el bucle
   * del servicio necesita distinguirlas: si hay llamadas, hay que ejecutarlas y
   * volver a preguntar; si no, se terminó la conversación.
   *
   * Los errores de Groq se traducen a `ServiceUnavailableException` con el mensaje
   * real de la API en el `cause`, pero sin la clave ni los headers: un 401 de
   * Groq significa "la variable de entorno está mal", y decirlo es más útil que
   * un 500 genérico.
   */
  async completar(
    mensajes: MensajeGroq[],
    herramientas?: readonly DefinicionHerramienta[],
  ): Promise<RespuestaGroq> {
    if (!this.habilitado) {
      throw new ServiceUnavailableException(
        'El chatbot no está habilitado: falta GROQ_API_KEY en el entorno del servidor.',
      );
    }

    return this.llamarConReintento(mensajes, herramientas);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Reintento ante límite de tokens por minuto (429)
  // ══════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════
  // Reintento ante límite de tokens por minuto (429)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Extrae los segundos de espera que indica el mensaje de Groq.
   *
   * El error real es, literalmente:
   *   "Rate limit reached for model `openai/gpt-oss-120b` ... on tokens per
   *    minute (TPM): Limit 8000, Used 5863, Requested 2582.
   *    Please try again in 3.3375s."
   *
   * Respetar ese número es mejor que un backoff arbitrario: es la única vez que
   * la API dice exactamente cuánto falta para que la ventana se libere, y el
   * mínimo se pone en 1 s porque un valor más bajo casi seguro vuelve a fallar.
   */
  private segundosSugeridos(mensaje: string): number {
    const coincidencia = /try again in ([\d.]+)\s*s/i.exec(mensaje ?? '');
    if (!coincidencia) return 0;
    const valor = Number.parseFloat(coincidencia[1]);
    return Number.isFinite(valor) ? Math.max(valor, 1) : 0;
  }

  /**
   * Ejecuta una llamada reintentando ante 429.
   *
   * Solo se reintenta el 429, y solo un número acotado de veces. No se reintenta
   * un 401 (la clave está mal y esperar no lo arregla), ni un 400 (la petición
   * está mal y reenviarla idéntica vuelve a fallar igual), ni un 500 repetido
   * (groq no lo documenta como transitorio y reintentar a ciegas amplifica una
   * caída). Reintentar solo lo que el propio proveedor dice que es reintentable es
   * lo que distingue esto de un bucle que agota los recursos.
   */
  private async llamarConReintento(
    mensajes: MensajeGroq[],
    herramientas?: readonly DefinicionHerramienta[],
  ): Promise<RespuestaGroq> {
    let intento = 0;

    for (;;) {
      try {
        return await this.unaVez(mensajes, herramientas);
      } catch (error: any) {
        const status = error?.response?.status;
        const mensaje = error?.response?.data?.error?.message ?? error?.message ?? '';

        // Solo el 429 es reintentable, y solo un número acotado de veces. No se
        // reintenta un 401 (la clave está mal y esperar no lo arregla), ni un 400
        // (la petición está mal y reenviarla idéntica vuelve a fallar igual), ni
        // un 500 repetido (Groq no lo documenta como transitorio). Reintentar solo
        // lo que el propio proveedor declara reintentable es lo que distingue esto
        // de un bucle que agota los recursos.
        if (status !== 429 || intento >= LIMITES.REINTENTOS_429) {
          throw this.traducirError(error);
        }

        const sugerido = this.segundosSugeridos(mensaje);
        // Si Groq no dice cuánto esperar, backoff exponencial: 1 s, 2 s.
        const espera = Math.min(
          sugerido > 0 ? sugerido * 1000 : 1000 * 2 ** intento,
          LIMITES.ESPERA_MAX_REINTENTO_MS,
        );

        intento += 1;
        this.logger.warn(
          `429 de Groq (tasa de tokens). Reintento ${intento}/${LIMITES.REINTENTOS_429} en ${Math.round(espera)} ms.`,
        );

        await new Promise((resolve) => setTimeout(resolve, espera));
      }
    }
  }

  /** Una sola llamada, sin reintentos. Separada para que `llamarConReintento` sea legible. */
  private async unaVez(
    mensajes: MensajeGroq[],
    herramientas?: readonly DefinicionHerramienta[],
  ): Promise<RespuestaGroq> {
    const cuerpo: Record<string, unknown> = {
      model: this.modelo,
      messages: mensajes,
      temperature: LIMITES.TEMPERATURA,
      // `auto` deja que el modelo decida si necesita datos. Forzar `required`
      // haría que conteste "no hay vuelos" sin mirar nada en la primera pregunta
      // ambigua; forzar `none` lo dejaría sin datos siempre. `auto` es lo único
      // que combina "responde lo que sabes" con "busca cuando hace falta".
      tool_choice: herramientas?.length ? 'auto' : undefined,
      tools: herramientas?.length ? herramientas : undefined,
      // Los modelos `gpt-oss` aceptan este parámetro; los que no lo soportan lo
      // ignoran en lugar de rechazarlo, así que es seguro mandarlo siempre.
      reasoning_effort: this.razonamiento,
      // 900 tokens es de sobra para una respuesta de 5 opciones y evita que el
      // modelo se desvíe a un párrafo largo. En `gpt-oss` el mismo cupo comparte
      // el texto con el razonamiento interno, así que se sube desde 700 para que
      // la parte visible no se quede sin sitio con `reasoning_effort` activo.
      max_tokens: 900,
    };

    try {
      // `axios` directo y no `HttpService` de `@nestjs/axios` a propósito: este
      // cliente es el ÚNICO que sale a internet (los demás usan `HttpService`), y
      // una instancia propia deja el timeout, el `baseURL` y los headers de
      // autorización en un solo sitio que se puede auditar.
      const { data } = await this.http.post('/chat/completions', cuerpo, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: LIMITES.TIMEOUT_GROQ_MS,
      });

      const mensaje = data?.choices?.[0]?.message ?? {};
      const llamadas: LlamadaHerramienta[] = Array.isArray(mensaje.tool_calls)
        ? mensaje.tool_calls
        : [];

      let texto = typeof mensaje.content === 'string' ? mensaje.content.trim() : '';

      // ── El razonamiento interno NUNCA llega al usuario ────────────────────
      //
      // Los modelos `gpt-oss` devuelven su borrador en `message.reasoning`, en un
      // campo aparte, y la respuesta final en `message.content`. Aquí solo se lee
      // `content`, y por eso `reasoning` no se propaga a ninguna parte.
      //
      // No es solo una cuestión de limpieza: el borrador contiene referencias al
      // system prompt y razonamiento sobre los datos del usuario. Mandarlo a la
      // interfaz lo expondría en pantalla y lo guardaría en el historial del
      // navegador. Se lee y se descarta de forma explícita para que quede claro
      // que es una decisión y no un olvido.
      const gastadoEnRazonamiento = typeof mensaje.reasoning === 'string' && mensaje.reasoning.length > 0;

      // `finish_reason: 'length'` significa que se agotó `max_tokens`. Con
      // razonamiento activo, el texto visible puede quedarse en blanco mientras
      // el modelo gastaba el cupo pensando. Sin este aviso, el bucle vería un
      // `texto: null` sin tool-calls y el usuario recibiría el mensaje genérico de
      // "no pude preparar una respuesta" en lugar de algo que dice la verdad: se
      // cortó a media frase.
      const finishReason = data?.choices?.[0]?.finish_reason;

      this.logger.debug(
        `Groq respondió: ${llamadas.length} llamada(s) de herramienta, ` +
          `${texto.length} caracteres visibles, ` +
          `${data?.usage?.completion_tokens ?? 0} tokens de salida` +
          `${gastadoEnRazonamiento ? ' (incluye razonamiento)' : ''}, ` +
          `finish_reason=${finishReason}.`,
      );

      if (!texto && finishReason === 'length' && gastadoEnRazonamiento) {
        // No se relanza: se deja que `ChatbotService` lo trate como respuesta
        // vacía y lo explique. Un error 500 por una respuesta truncada sería
        // desproporcionado.
        this.logger.warn(
          'El modelo consumió todo el cupo en razonamiento y no dejó texto visible. ' +
            'Considera subir GROQ_REASONING o max_tokens.',
        );
      }

      return {
        // Si hay tool-calls, `content` viene vacío o `null` y el texto NO es una
        // respuesta para el usuario: es un turno de trabajo. Se fuerza a `null`
        // para que el bucle no lo tome como respuesta final por accidente.
        texto: llamadas.length > 0 ? null : texto || null,
        llamadas,
        uso: data?.usage,
        finishReason,
      };
    } catch (error) {
      // ═════════════════════════════════════════════════════════════════════
      // AQUÍ NO SE TRADUCE EL ERROR. Se relanza TAL CUAL.
      // ═════════════════════════════════════════════════════════════════════
      //
      // Este es un punto que parece obvio pero importa: si se convirtiese aquí a
      // `ServiceUnavailableException`, la excepción se iría sin `response.status`,
      // y `llamarConReintento` — que decide reintentando con esa información—
      // vería `status === undefined`, concluiría que no es un 429 y no reintentaría
      // NADA. El reintento se volvería código muerto sin que nada fallara en las
      // pruebas de integración (la petición sí sale, solo que sin reintento).
      //
      // La traducción a un error de dominio ocurre UNA vez, arriba del todo, en
      // `traducirError`, después de que se haya descartado la posibilidad de
      // reintentar.
      this.logger.error(
        `Groq respondió con error: ${error?.response?.status ?? 'sin status'} — ` +
          `${error?.response?.data?.error?.message ?? error?.message ?? 'desconocido'}`,
      );
      throw error;
    }
  }

  /**
   * Traduce un error de la API de Groq a un error de dominio de NestJS.
   *
   * Se llama UNA vez, desde `llamarConReintento`, ya descartado el reintento. El
   * mensaje importa más que el código: "falta GROQ_API_KEY" y "espera unos
   * segundos" son dos acciones distintas para quien lee el log, y un 500 genérico
   * no distingue ninguna de las dos.
   */
  private traducirError(error: any): ServiceUnavailableException {
    const status = error?.response?.status;
    const detalle =
      error?.response?.data?.error?.message ?? error?.message ?? 'error desconocido';

    if (status === 401 || status === 403) {
      return new ServiceUnavailableException(
        'Groq rechazó la credencial. Revisa GROQ_API_KEY en el entorno del servidor.',
      );
    }

    if (status === 429) {
      return new ServiceUnavailableException(
        'Se alcanzó el límite de peticiones de Groq (tasa). Inténtalo en unos segundos.',
      );
    }

    // Un timeout de axios no trae `response`; distinguirlo evita un mensaje que
    // dice "Groq undefined" cuando en realidad la llamada se quedó esperando.
    if (error?.code === 'ECONNABORTED') {
      return new ServiceUnavailableException(
        'Groq no respondió a tiempo. Vuelve a intentarlo en unos segundos.',
      );
    }

    return new ServiceUnavailableException(
      `No se pudo completar la consulta al modelo (Groq ${status ?? 'sin respuesta'}): ` +
        GroqService.sanitizar(detalle),
    );
  }

  /**
   * Elimina de un texto lo que parezca una credencial.
   *
   * ── Por qué hace falta ────────────────────────────────────────────────────
   *
   * El mensaje de error crudo se mete en el mensaje que ve el usuario. Ese texto
   * viene de axios, que lo compone a partir de la URL, de los headers y del
   * cuerpo de la respuesta, y un error de red o de un proxy intermedio puede
   * acabar delatando el `Authorization: Bearer ...` o la propia clave dentro
   * del mensaje.
   *
   * No es teórico: los mensajes de error de axios incluyen la configuración de la
   * petición cuando el fallo es de conexión, y ese objeto contiene los headers.
   * Un error de ese tipo que se muestre en la interfaz —o en un ticket compartido
   * durante la demostración— filtraría la clave de Groq.
   *
   * Se sustituye por `[redactado]` en lugar de recortar el texto: un mensaje de
   * error recortado es más difícil de diagnosticar que uno con una marca
   * explícita de que había algo ahí.
   */
  private static sanitizar(texto: string): string {
    return String(texto ?? '')
      // Claves de Groq (`gsk_...`) y de OpenAI (`sk-...`).
      .replace(/\b(?:gsk|sk)-[A-Za-z0-9_-]{8,}/g, '[redactado]')
      // Cualquier encabezado `Authorization: Bearer <algo>`.
      .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redactado]')
      .slice(0, 300);
  }
}
