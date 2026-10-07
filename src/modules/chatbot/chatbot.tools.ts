/**
 * Definiciones de las herramientas (Function Calling) que se exponen a Groq.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL REQUISITO DE "SOLO LECTURA" VIVE AQUÍ, NO EN EL PROMPT
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Las herramientas se declaran en un único array (`HERRAMIENTAS`) y el executor
 * construye su mapa de ejecución a partir de ESE MISMO array. No existe una
 * segunda lista de "herramientas permitidas" que pueda desincronizarse de la
 * primera: si una herramienta no está en `HERRAMIENTAS`, el executor no la conoce
 * y la rechaza. Añadir una herramienta de escritura obliga a tocar este archivo, y
 * ese toque es visible en el diff y en la revisión de código.
 *
 * El prompt refuerza la regla en lenguaje natural (el modelo la obedece mejor),
 * pero la garantía real es de CONTROL DE ACCESO: si el modelo inventara
 * `crear_reserva`, no habría ninguna función a la que llamar.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ LOS ESQUEMAS SON TAN BREVES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO contra la API: este `tools` se reenvía en CADA llamada, y un turno de
 * chat hace DOS llamadas (el bucle de tool-calling). Con esquemasuinsCoincidentes
 * ocupaba ~1 460 tokens, más del doble que todo el system prompt.
 *
 * La versión anterior documentaba cada parámetro con una frase larga y declaraba
 * `enum`s completos.EsoMultiplicaba el coste en el punto más caro de la petición
 * y, además, era REDUNDANTE: el executor ya valida y ya sabe corregir.
 *
 * · Los `enum` de `clase`, `categoria` y `transmision` los replicaba el executor,
 *   que además traduce los términos en español del usuario.
 * · El `pattern` de la fecha y del IATA lo comprueba `aFecha()` y `aIata()` en el
 *   servidor, que además rechazan la entrada con un mensaje que el modelo puede
 *   corregir en la siguiente iteración.
 * · Las City's catálogo de IATA no hace falta aquí: el modelo puede pasar
 *   "Quito" tal cual y `aIata()` lo traduce.
 *
 * Se conserva UNA frase por herramienta, porque sin ella el modelo no sabe CUÁNDO
 * llamar a cada una, y esa es la causa más común de tool-calling erróneo.
 * Ese es el punto donde el presupuesto de tokens se deja gastar.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL RESULTADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * De ~1 460 a ~300 tokens. Con el system prompt reducido y el historial acotado,
 * un turno completo pasa de ~5 000 tokens a ~800, que cabe unas 10 veces en el
 * límite de 8 000 tokens/minuto del plan gratuito.
 */

export interface DefinicionHerramienta {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties: false;
    };
  };
}

/**
 * Herramientas de SOLO LECTURA.
 *
 * Cuatro, no seis. Se fusionaron o eliminaron dos:
 *
 * · `catalogo_destinos` desapareció: el executor traducía el nombre de la ciudad a
 *   IATA por su cuenta, así que el modelo nunca necesitaba el catálogo. Pedírselo
 *   añadía una llamada completa (el doble de tokens de un turno) para después
 *   usar la misma información que ya traía el prompt.
 *
 * · `consultar_atracciones` y `consultar_disponibilidad_atraccion` siguen
 *   separadas porque la segunda necesita el `id` REAL que devuelve la primera, y
 *   encadenarlas en una sola herramienta obligaría a devolver catálogo y cupos de
 *   una vez, que es lo que hace el token count subir sin aportar información.
 */
export const HERRAMIENTAS: readonly DefinicionHerramienta[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_vuelos',
      description:
        'Vuelos disponibles por ruta y fecha EXACTA (YYYY-MM-DD). Acepta nombres de ciudad ' +
        '(Quito) o códigos IATA (UIO). La fecha es obligatoria: si el usuario no la dio, ' +
        'NO llames a esta herramienta, pregúntale.',
      parameters: {
        type: 'object',
        properties: {
          origen: { type: 'string' },
          destino: { type: 'string' },
          fecha: { type: 'string' },
          adultos: { type: 'integer' },
          fechaRegreso: { type: 'string' },
        },
        required: ['origen', 'destino', 'fecha'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_autos',
      description:
        'Autos de alquiler disponibles: categoría, transmisión, asientos, maletas y precio ' +
        'diario. El catálogo es por DÍAS: la fecha solo estima el total. Si el usuario no ' +
        'dijo desde cuándo ni cuántos días, pregúntale.',
      parameters: {
        type: 'object',
        properties: {
          ciudad: { type: 'string' },
          fechaInicio: { type: 'string' },
          dias: { type: 'integer' },
          categoria: { type: 'string' },
          transmision: { type: 'string' },
          precioMaximoDiario: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_atracciones',
      description:
        'Atracciones y tours del catálogo con precio, duración, ubicación y puntuación. ' +
        'Úsala si el usuario pregunta qué hacer en una ciudad. Filtra por ciudad y tipo de ' +
        'actividad solo si los dio.',
      parameters: {
        type: 'object',
        properties: {
          ciudad: { type: 'string' },
          fecha: { type: 'string' },
          categorias: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_alojamientos',
      description:
        'Hoteles, resorts y alojamientos disponibles por destino (Quito, Cancún, Cartagena, Medellín, etc.). ' +
        'Devuelve opciones con precio por noche, puntuación, amenidades y si tiene piscina. ' +
        'Úsala si el usuario busca dónde hospedarse o quedarse.',
      parameters: {
        type: 'object',
        properties: {
          destino: { type: 'string' },
          checkin: { type: 'string' },
          checkout: { type: 'string' },
          adultos: { type: 'integer' },
          tienePiscina: { type: 'boolean' },
          precioMaximo: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_vuelo',
      description:
        'Estado operativo de un vuelo (programado, retrasado, cancelado, aterrizado) por su ' +
        'número y su fecha. NO busca rutas, para eso está consultar_vuelos. La fecha es ' +
        'obligatoria: un vuelo cambia de estado cada día.',
      parameters: {
        type: 'object',
        properties: {
          numeroVuelo: { type: 'string' },
          fecha: { type: 'string' },
        },
        required: ['numeroVuelo', 'fecha'],
        additionalProperties: false,
      },
    },
  },
] as const;

/**
 * Allow-list de herramientas de solo lectura.
 *
 * Se deriva de `HERRAMIENTAS` con un filtro por patrón de nombre, no por una lista
 * escrita a mano: el filtro cubre los verbos de escritura (`crear`, `reservar`,
 * `cancelar`, `actualizar`, `eliminar`, `pagar`, `emitir`, `hold`, `checkin`) y así
 * no depende de que alguien recuerde actualizar una lista.
 *
 * El executor NO usa este allow-list para decidir (usa el mapa de `HERRAMIENTAS`),
 * lo usa como ASERCION: si el filtro y el mapa se desincronizan, el test falla.
 */
const VERBOS_DE_ESCRITURA =
  /(crear|reservar|reserva|cancelar|actualizar|modificar|eliminar|borrar|pagar|cobrar|emitir|hold|checkin|check_in|postventa)/i;

/** Nombres de las herramientas declaradas arriba que son de solo lectura. */
export const HERRAMIENTAS_SOLO_LECTURA: readonly string[] = HERRAMIENTAS.filter(
  (t) => !VERBOS_DE_ESCRITURA.test(t.function.name),
).map((t) => t.function.name);

/**
 * Nombres que el modelo NO debe inventar, y que se rechazan de forma explícita.
 *
 * Cuando el usuario pide algo fuera del alcance (reservar, pagar, cancelar), el
 * bot tiene que decirlo con claridad. Darle un error genérico por un nombre de
 * herramienta inexistente produce un "no puedo hacer eso" correcto; darle la
 * respuesta fija del módulo produce el mismo resultado y es determinista.
 */
export const HERRAMIENTAS_PROHIBIDAS: readonly string[] = [
  'crear_reserva',
  'crear_orden',
  'reservar',
  'realizar_reserva',
  'realizar_pago',
  'pagar',
  'cancelar_reserva',
  'cancelar_orden',
  'actualizar_reserva',
  'eliminar_reserva',
  'crear_hold',
  'emitir_tickets',
  'hacer_checkin',
  'consultar_reservas_de_usuario',
];