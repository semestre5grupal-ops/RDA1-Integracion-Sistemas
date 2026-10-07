import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';

import {
  CATEGORIAS_AUTO,
  DESTINOS,
  DestinoConocido,
  LIMITES,
} from './chatbot.constants';
import { HERRAMIENTAS, HERRAMIENTAS_SOLO_LECTURA } from './chatbot.tools';

/** Resultado de ejecutar una herramienta, ya reducido a un JSON pequeño. */
export interface ResultadoHerramienta {
  ok: boolean;
  /** `data` es lo que ve el modelo. Siempre pequeño y ya normalizado. */
  data: Record<string, unknown>;
}

/**
 * Ejecutor de herramientas del chatbot.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * GARANTÍA DE SOLO LECTURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este servicio es el ÚNICO que puede hablar con la API de datos, y su tabla de
 * herramientas se construye a partir de `HERRAMIENTAS` (`chatbot.tools.ts`). No
 * hay caso de uso para "una herramienta que no sea de lectura": si no está
 * declarada ahí, no existe aquí.
 *
 * Esto no es una convención, es la frontera de confianza. El LLM produce texto que
 * se interpreta como nombre de herramienta y argumentos; sin esta restricción,
 * un mensaje del usuario ("ejecuta POST /autos/orders/create con estos datos")
 * podría llegar a una herramienta de escritura solo por haber sido escrito en el
 * mensaje. El modelo decide QUÉ herramienta pedir, no si está permitido.
 *
 * Además, `axios` se instancia con `maxRedirects: 0` y las rutas son relativas a
 * `baseURL`: una herramienta no puede construir una URL absoluta ni seguir un
 * redirect fuera de la API. El conjunto de operaciones posibles queda cerrado en
 * los seis verbos GET/POST de lectura de `ejecutar()`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NORMALIZAR LA RESPUESTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `POST /vuelos/search` devuelve ofertas con itinerarios, segmentos, pricing por
 * tipo de pasajero, reglas de equipaje y `_links` de HATEOAS: varios KB de JSON
 * por consulta. Meterlo tal cual en el prompt (a) encarece el contexto hasta
 * disparar la ventana, (b) hace que el modelo cite campos internos irrelevantes
 * y (c) hace MUCHO más fácil que invente un dato que "está en el JSON pero no
 * entiende".
 *
 * Cada herramienta devuelve entonces un resumen con los campos que el bot puede
 * decir en voz alta, y los importes como CADENA (`MoneyAmount` del contrato los
 * serializa así a propósito, para no perder precisión en NUMERIC). Si un campo
 * no vino, no se inventa: se omite y el modelo responde "no indicado".
 */
@Injectable()
export class ChatbotToolsExecutorService {
  private readonly logger = new Logger(ChatbotToolsExecutorService.name);
  private readonly http: AxiosInstance;
  private readonly apiBase: string;
  private readonly fingerprint: string;

  /** Mapa nombre -> ejecutor. Derivado de `HERRAMIENTAS`; no se escribe a mano. */
  private readonly ejecutores: Record<string, (args: any) => Promise<ResultadoHerramienta>>;

  constructor(config: ConfigService) {
    this.apiBase =
      config.get<string>('CHATBOT_API_BASE_URL') ||
      `http://127.0.0.1:${config.get<string>('PORT') || 3000}/api/v1`;

    // La huella se genera ANTES de crear la instancia de axios porque se usa en
    // sus cabeceras por defecto. Es un UUID estable de proceso: identifica al bot
    // como un único cliente anónimo frente al rate limit por dispositivo.
    this.fingerprint = randomUUID();

    this.http = axios.create({
      baseURL: this.apiBase,
      timeout: LIMITES.TIMEOUT_DATOS_MS,
      headers: {
        'Content-Type': 'application/json',
        // `POST /vuelos/search` la exige para el rate limit por dispositivo
        // (`limite_dispositivo`). El bot no tiene usuario, así que se identifica
        // como un cliente de solo lectura con una huella fija del proceso.
        'X-Device-Fingerprint': this.fingerprint,
      },
      // Sin redirects: un 302 a un host externo convertiría este cliente en un
      // proxy abierto. `baseURL` es lo único que puede cambiar de host.
      maxRedirects: 0,
    });

    this.ejecutores = {
      consultar_vuelos: (a) => this.consultarVuelos(a),
      consultar_autos: (a) => this.consultarAutos(a),
      consultar_atracciones: (a) => this.consultarAtracciones(a),
      consultar_alojamientos: (a) => this.consultarAlojamientos(a),
      estado_vuelo: (a) => this.estadoVuelo(a),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Dispatch
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Nombres que este executor acepta.
   *
   * Se compara con `HERRAMIENTAS_SOLO_LECTURA` en el test para detectar
   * desincronización entre lo declarado y lo implementado.
   */
  get herramientas(): string[] {
    return Object.keys(this.ejecutores);
  }

  /**
   * Ejecuta la herramienta pedida por el modelo.
   *
   * NUNCA lanza: cualquier fallo se convierte en `{ ok: false, data: { error } }`
   * para devolvérselo al modelo como resultado de herramienta. El bucle del
   * servicio necesita poder meter ese texto en el historial y volver a preguntar
   * ("no se pudo consultar, dilo así"), y si esta función propagara la excepción
   * el usuario vería un error 500 en vez de una respuesta honesta.
   */
  async ejecutar(nombre: string, argumentos: unknown): Promise<ResultadoHerramienta> {
    const fn = this.ejecutores[nombre];

    if (!fn) {
      // Nombre inventado por el modelo. Se le responde con la lista real para que
      // se corrija en la siguiente iteración en vez de rendirse.
      this.logger.warn(`Herramienta desconocida solicitada: "${nombre}"`);
      return {
        ok: false,
        data: {
          error: `La herramienta "${nombre}" no existe.`,
          herramientas_disponibles: this.herramientas,
        },
      };
    }

    try {
      return await fn(argumentos ?? {});
    } catch (error: any) {
      const status = error?.response?.status;
      const detalle =
        error?.response?.data?.message ??
        error?.response?.data?.error?.message ??
        error?.message ??
        'error desconocido';

      this.logger.warn(`Fallo en "${nombre}" (${status ?? 'sin status'}): ${detalle}`);

      // Se distingue "no hay datos" de "no se pudo consultar": el primero permite
      // una respuesta clara, el segundo obliga a decir que no se pudo verificar.
      const esErrorDeDatos = status === 400 || status === 404 || status === 409;

      return {
        ok: false,
        data: {
          error: `No se pudo consultar "${nombre}".`,
          detalle: String(detalle).slice(0, 300),
          codigo_http: status ?? null,
          interpretacion: esErrorDeDatos
            ? 'La consulta se ejecutó pero no devolvió datos utilizables.'
            : 'Fallo de infraestructura. NO afirmes que no hay disponibilidad: di que no se pudo verificar.',
        },
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Normalización de entradas
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Traduce el nombre de una ciudad a su código IATA.
   *
   * ── Por qué NO se delega en el modelo ─────────────────────────────────────
   * Es tentador dejar que el modelo convierta "Cuenca" → "CUE" y ahorrar este
   * código. Sería un error: `vuelos/search` filtra por igualdad EXACTA sobre
   * `aeropuertoOrigen`. Un código equivocado no da error, da `totalOffers: 0`, y
   * el usuario lee "no hay vuelos a...". Es la alucinación más silenciosa y más
   * dañina posible, porque es indistinguible de la verdad.
   *
   * Acepta tanto `"Quito"` como `"UIO"`. Antes el catálogo de ciudades iba en el
   * system prompt y había además una herramienta `catalogo_destinos` para
   * traducir; los dos se quitaron al optimizar el presupuesto de tokens, porque
   * esta función ya lo hacía mejor y sin gastar una llamada completa.
   */
  private aIata(ciudad: string): { iata: string; destino: DestinoConocido } | null {
    if (!ciudad) return null;

    const limpio = this.normalizarTexto(ciudad);

    // 1. ¿Ya viene un código IATA?
    const comoIata = limpio.toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]{3}$/.test(comoIata)) {
      const porCodigo = DESTINOS.find((d) => d.iata === comoIata);
      if (porCodigo) return { iata: comoIata, destino: porCodigo };
      return null; // IATA de un sitio que no vendemos: mejor rechazar que consultar al vacío
    }

    // 2. Buscar por alias o por nombre canónico.
    const porNombre = DESTINOS.find((d) => this.normalizarTexto(d.nombre) === limpio);
    if (porNombre) return { iata: porNombre.iata, destino: porNombre };

    const porAlias = DESTINOS.find((d) => d.alias.some((a) => this.normalizarTexto(a) === limpio));
    if (porAlias) return { iata: porAlias.iata, destino: porAlias };

    // 3. Coincidencia parcial, solo si es inequívoca (un único destino la contiene).
    //    "quito" ya cayó en el paso 2; esto cubre "ciudad de quito" o "santa cruz".
    const parciales = DESTINOS.filter(
      (d) =>
        this.normalizarTexto(d.nombre).includes(limpio) ||
        d.alias.some((a) => a.length >= 5 && this.normalizarTexto(a).includes(limpio)),
    );
    if (parciales.length === 1 && parciales[0].iata) {
      return { iata: parciales[0].iata, destino: parciales[0] };
    }

    return null;
  }

  /**
   * Minúsculas, sin acentos ni signos: "Bogotá" y "BOGOTA!" comparan igual.
   *
   * `normalize('NFD')` separa la "ó" en "o" + U+0301, y el rango `\u0300-\u036f`
   * elimina los diacríticos que quedaron sueltos. Sin ese paso, "cuenca" y
   * "Cuenca" serían dos entradas distintas del catálogo y la traducción a IATA
   * fallaría justo en los nombres con tilde, que son la mayoría en Ecuador.
   */
  private normalizarTexto(s: string): string {
    return (s ?? '')
      .toString()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Valida y normaliza una fecha a `YYYY-MM-DD`.
   *
   * Reutiliza `Date` solo para comprobar que la fecha EXISTE: `2026-02-31` pasa
   * el patrón `^\d{4}-\d{2}-\d{2}$` pero no existe, y Postgres la rechazaría con
   * un error que el modelo interpretaría como "no hay disponibilidad".
   *
   * No se resuelve "el viernes" aquí: esa interpretación la hace el modelo con las
   * referencias de fecha del prompt, y este es el filtro de seguridad.
   */
  private aFecha(fecha: unknown): string | null {
    if (typeof fecha !== 'string') return null;
    const limpio = fecha.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null;

    const [y, m, d] = limpio.split('-').map(Number);
    const fechaReal = new Date(Date.UTC(y, m - 1, d));
    const esReal =
      fechaReal.getUTCFullYear() === y &&
      fechaReal.getUTCMonth() === m - 1 &&
      fechaReal.getUTCDate() === d;
    return esReal ? limpio : null;
  }

  /** Los tres IATA más comunes del país, para cuando la API pide `cities`/`countries`. */
  private destinoPorDefecto(): DestinoConocido {
    return DESTINOS.find((d) => d.nombre === 'Quito') ?? DESTINOS[0];
  }

  // ══════════════════════════════════════════════════════════════════════
  // Herramientas
  // ══════════════════════════════════════════════════════════════════════

  /**
   * `consultar_vuelos`: `POST /vuelos/search`.
   *
   * ── Sobre "Ida y vuelta" ──────────────────────────────────────────────────
   * El contrato NO tiene campo `tripType`. Una ida y vuelta se representa con DOS
   * itinerarios: la ida y el regreso con la ruta invertida. Es lo que hace
   * `VuelosService.searchFlights` y es la única forma de que el servicio reserve
   * `bloqueo_cupo` para ambos tramos.
   */
  private async consultarVuelos(args: any): Promise<ResultadoHerramienta> {
    const origen = this.aIata(args?.origen);
    const destino = this.aIata(args?.destino);

    if (!origen) {
      return {
        ok: false,
        data: {
          error: `No se reconoce "${args?.origen ?? ''}" como origen válido.`,
          ciudades_validas: DESTINOS.filter((d) => d.iata).map((d) => `${d.nombre} (${d.iata})`),
          instruccion: 'Pide al usuario que aclare el origen o usa catalogo_destinos.',
        },
      };
    }
    if (!destino) {
      return {
        ok: false,
        data: {
          error: `No se reconoce "${args?.destino ?? ''}" como destino válido.`,
          ciudades_validas: DESTINOS.filter((d) => d.iata).map((d) => `${d.nombre} (${d.iata})`),
          instruccion: 'Pide al usuario que aclare el destino o usa catalogo_destinos.',
        },
      };
    }
    if (origen.iata === destino.iata) {
      return {
        ok: false,
        data: { error: 'El origen y el destino son la misma ciudad. Pide una ruta distinta.' },
      };
    }

    const fecha = this.aFecha(args?.fecha);
    if (!fecha) {
      // Fecha ausente o mal formada: NO se busca "la primera disponible".
      return {
        ok: false,
        data: {
          error: 'Falta una fecha válida (YYYY-MM-DD) para buscar vuelos.',
          instruccion:
            'La búsqueda de vuelos es por fecha EXACTA. NO elijas una fecha por tu cuenta. ' +
            'Pregunta al usuario qué día quiere viajar y vuelve a llamar a esta herramienta.',
        },
      };
    }

    const fechaRegreso = args?.fechaRegreso ? this.aFecha(args.fechaRegreso) : null;
    const adultos = Math.min(Math.max(Number(args?.adultos) || 1, 1), 9);
    const clase = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'].includes(args?.clase)
      ? args.clase
      : null;

    const itinerarios: any[] = [
      { origin: origen.iata, destination: destino.iata, departureDate: fecha },
    ];
    if (fechaRegreso && fechaRegreso >= fecha) {
      itinerarios.push({
        origin: destino.iata,
        destination: origen.iata,
        departureDate: fechaRegreso,
      });
    }

    const { data } = await this.http.post('/vuelos/search', {
      itineraries: itinerarios,
      passengers: { adults: adultos, youths: 0, children: 0, infants: 0 },
    });

    const ofertas = Array.isArray(data?.offers) ? data.offers : [];
    const resumen = ofertas.slice(0, LIMITES.MAX_RESULTADOS_VUELOS).map((o: any) => {
      const segmentos = (o?.itineraries ?? []).flatMap((it: any) => it?.segments ?? []);
      const principal = segmentos[0] ?? {};
      const cabinas = (o?.itineraries ?? []).flatMap((it: any) => it?.pricingOptions ?? []);

      // Asientos por cabina. Se toma el mínimo entre-BA itinerarios cuando hay
      // varios tramos: es el dato que decide si la oferta sirve para todos los
      // pasajeros, que es lo que el usuario quiere saber.
      const asientosPorCabina: Record<string, number> = {};
      for (const cabina of cabinas) {
        const clave = cabina?.cabinClass ?? 'OTRA';
        const n = Number(cabina?.availableSeats ?? 0);
        asientosPorCabina[clave] =
          clave in asientosPorCabina ? Math.min(asientosPorCabina[clave], n) : n;
      }

      const adultas = cabinas
        .flatMap((c: any) => c?.pricePerPassengerType ?? [])
        .filter((p: any) => p?.passengerType === 'ADULT');

      return {
        vuelo: principal?.flightNumber ?? null,
        aerolinea: o?.airline?.name || o?.airline?.code || null,
        ruta: `${principal?.departure?.iataCode ?? origen.iata} → ${principal?.arrival?.iataCode ?? destino.iata}`,
        salida: principal?.departure?.at ?? null,
        llegada: principal?.arrival?.at ?? null,
        duracion_min: principal?.durationMinutes ?? o?.itineraries?.[0]?.totalDurationMinutes ?? null,
        escalas: o?.itineraries?.[0]?.stopsCount ?? 0,
        estado: principal?.status ?? null,
        persona_adulto: adultas[0]?.price?.total ?? null,
        moneda: adultas[0]?.price?.currency ?? o?.grandTotal?.currency ?? null,
        total_ida_y_vuelta: o?.grandTotal?.total ?? null,
        asientos_disponibles: asientosPorCabina,
        cabina_con_precio: cabinas[0]?.cabinClass ?? null,
        // `additionalProperties: false` en el esquema de la herramienta impide que
        // el modelo mande una cabina inexistente. Se refleja aquí para que la
        // respuesta indique si lo que se mostró incluye lo que pidió.
        ...(clase ? { cabina_preferida: clase } : {}),
      };
    });

    return {
      ok: true,
      data: {
        consulta: {
          origen: origen.iata,
          destino: destino.iata,
          fecha: fecha,
          fecha_regreso: fechaRegreso ?? null,
          adultos: adultos,
          tipo: fechaRegreso && fechaRegreso >= fecha ? 'ida_y_vuelta' : 'solo_ida',
        },
        encontrados: ofertas.length,
        // Aviso al modelo de que puede haber más de los que se le devuelven, para
        // que no diga "solo hay 5" cuando la API devolvió 12.
        truncado: ofertas.length > resumen.length
          ? `Mostrando ${resumen.length} de ${ofertas.length} ofertas.`
          : null,
        vuelos: resumen,
        ...(ofertas.length === 0
          ? {
              nota:
                'No hay ningún vuelo para esa ruta y esa fecha. ' +
                'Responde que no hay disponibilidad. No sugieras otros horarios o rutas sin consultarlos.',
            }
          : {}),
      },
    };
  }

  /**
   * `consultar_autos`: `POST /autos/search`.
   *
   * El servicio real (`AutosService.search`) fusiona la flota local disponible con
   * un proveedor externo y **ignora los filtros del cuerpo**: devuelve el catálogo
   * completo. Se llama igualmente por HTTP (es la API pública de consulta) y se
   * filtra aquí, en memoria, para que el bot pueda responder a "solo automáticos"
   * o "hasta 60 la diária" sin que el usuario tenga que aceptarlo todo.
   *
   * Que el filtro sea local y no del servidor es una limitación real del endpoint
   * actual, y está anotada a propósito: si algún día `AutosService.search` empieza
   * a filtrar, este código sigue siendo correcto (filtrar dos veces sobre el mismo
   * conjunto es idempotente aquí) y el bot gana la capacidad de mostrar el total
   * antes de truncar.
   */
  private async consultarAutos(args: any): Promise<ResultadoHerramienta> {
    const { data } = await this.http.post('/autos/search', {
      // Se envía lo que el usuario dijo para que el endpoint reciba el contexto,
      // aunque la implementación actual no lo use todavía.
      pickup_city: args?.ciudad ?? null,
      pickup_date: args?.fechaInicio ?? null,
      rental_days: args?.dias ?? null,
      filters: {
        category: args?.categoria ?? null,
        transmission: args?.transmision ?? null,
        price_max: args?.precioMaximoDiario ?? null,
      },
    });

    const crudos = Array.isArray(data?.data) ? data.data : [];
    const dias = Math.min(Math.max(Number(args?.dias) || 1, 1), 90);
    const precioMax = args?.precioMaximoDiario != null ? Number(args.precioMaximoDiario) : null;

    const filtrados = crudos.filter((a: any) => {
      const info = a?.vehicle_info ?? {};
      if (args?.categoria && info.category !== args.categoria) return false;
      if (args?.transmision && info.transmission !== args.transmision) return false;
      if (precioMax != null && Number(a?.price) > precioMax) return false;
      return true;
    });

    const total = filtrados.length;
    const visibles = filtrados.slice(0, LIMITES.MAX_RESULTADOS_AUTOS);

    const autos = visibles.map((a: any) => {
      const info = a?.vehicle_info ?? {};
      const precio = Number(a?.price ?? 0);
      const descripciones: Record<string, string> = {
        ECONOMY: 'Económico',
        COMPACT: 'Compacto',
        MIDSIZE: 'Mediano',
        SUV: 'SUV',
        VAN: 'Van',
        LUXURY: 'Lujo',
      };
      const transmisiones: Record<string, string> = {
        AUTOMATIC: 'automático',
        MANUAL: 'manual',
      };
      const combustibles: Record<string, string> = {
        PETROL: 'gasolina',
        DIESEL: 'diésel',
        HYBRID: 'híbrido',
        ELECTRIC: 'eléctrico',
      };
      const tipos: Record<string, string> = {
        SEDAN: 'sedán',
        SUV: 'SUV',
        VAN: 'van',
        HATCHBACK: 'hatchback',
        COUPE: 'cupé',
      };

      return {
        id: a?.vehicle_id ?? null,
        categoria: info.category ? (descripciones[info.category] ?? info.category) : null,
        tipo_codigo: info.type ?? null,
        tipo: info.type ? (tipos[info.type] ?? info.type) : null,
        transmision: info.transmission
          ? (transmisiones[info.transmission] ?? info.transmission)
          : null,
        combustible: info.fuel ? (combustibles[info.fuel] ?? info.fuel) : null,
        asientos: info.seats ?? null,
        puertas: info.doors ?? null,
        maletas: info.bags ?? null,
        aire_acondicionado: info.air_conditioning ?? null,
        precio_diario: precio.toFixed(2),
        total_estimado: (precio * dias).toFixed(2),
        dias_estimados: dias,
        proveedor: a?.supplier_id === 1 ? 'Local GDS Autos' : `Proveedor ${a?.supplier_id ?? '?'}`,
      };
    });

    return {
      ok: true,
      data: {
        consulta: {
          ciudad: args?.ciudad ?? 'sin especificar',
          fecha_inicio: args?.fechaInicio ?? null,
          dias: dias,
          filtros: {
            categoria: args?.categoria ?? null,
            transmision: args?.transmision ?? null,
            precio_maximo_diario: precioMax,
          },
          categorias_validas: CATEGORIAS_AUTO,
        },
        encontrados: total,
        truncado: total > autos.length ? `Mostrando ${autos.length} de ${total} opciones.` : null,
        autos: autos,
        ...(total === 0
          ? {
              nota:
                crudos.length === 0
                  ? 'No hay ningún vehículo disponible en el catálogo en este momento. Dilo con claridad.'
                  : `El catálogo tiene ${crudos.length} autos pero ninguno cumple esos filtros. ` +
                    'Dilo así y sugiere aflojar algún filtro; NO inventes precios ni modelos.',
            }
          : {}),
        ...(precioMax != null
          ? { nota_precio: `Todos los precios mostrados son ≤ ${precioMax} por día (precio diario, no total).` }
          : {}),
      },
    };
  }

  /**
 * `consultar_atracciones`: `GET /atracciones`.
 *
 * ── Por qué NO se le pasan `cities` ni `dates` ──────────────────────────────
 *
 * `GET /atracciones` valida su query con `PaginationQueryDto`, que solo declara
 * `page` y `limit`. El `ValidationPipe` global corre con
 * `forbidNonWhitelisted: true`, así que mandar `cities[]=-924216` o
 * `start_date=...` produce un 400 — se comprobó en la API en marcha, no es
 * teórico—. Los filtros por `cities`, `countries` y `dates` pertenecen a
 * `POST /atracciones/search`, que es un endpoint distinto y además devuelve datos
 * fijos, no el catálogo real.
 *
 * Por eso el filtro se aplica AQUÍ, sobre el catálogo ya traído: se trae una
 * página amplia y se descarta por el campo `ciudad` de los datos normalizados. Es
 * menos eficiente en ancho de banda y es la única forma correcta con este
 * contrato.
 */
  private async consultarAtracciones(args: any): Promise<ResultadoHerramienta> {
    // Solo `page` y `limit`: son los únicos que acepta `PaginationQueryDto`.
    // Cualquier otro parámetro aquí es un 400 garantizado.
    const params: Record<string, any> = { page: 1, limit: 40 };

    const ciudadTexto = args?.ciudad ? String(args.ciudad) : null;
    const destino = ciudadTexto ? this.aDestinoPorNombre(ciudadTexto) : null;
    const fecha = args?.fecha ? this.aFecha(args.fecha) : null;

    const { data } = await this.http.get('/atracciones', { params });

    const crudos = Array.isArray(data?.data) ? data.data : [];
    const categorias = args?.categorias ? this.normalizarTexto(String(args.categorias)) : null;

    let visibles = crudos.slice(0, 40);

    // Filtro por CIUDAD, en local. Se compara contra el `nombreCiudad()` de cada
    // atracción (que traduce el `city_id` de Booking usando el catálogo), y no
    // contra el campo crudo: las atracciones locales del proyecto traen la
    // dirección en texto ("Centro Histórico, Quito") sin `city_id`.
    if (ciudadTexto && destino) {
      const porCiudad = visibles.filter((a: any) => {
        const ciudad = this.nombreCiudad(a?.locations?.[0]?.city);
        if (ciudad && this.normalizarTexto(ciudad) === this.normalizarTexto(destino.nombre)) {
          return true;
        }
        // Respaldo: el `city_id` puede venir como string.
        if (a?.locations?.[0]?.city != null && destino.cityId != null) {
          return Number(a.locations[0].city) === destino.cityId;
        }
        // Último respaldo: la dirección trae el nombre de la ciudad.
        return this.normalizarTexto(a?.locations?.[0]?.address ?? '').includes(
          this.normalizarTexto(destino.nombre),
        );
      });

      visibles = porCiudad;
    }

    // Filtro por tipo de actividad: el endpoint no lo soporta, y filtrar por
    // `categories`/`long_description` sobre los datos normalizados sí. Se hace
    // DESPUÉS de traerlos porque el subtexto del modelo ("tour", "gastronomía")
    // no es un valor del enum de Booking.
    if (categorias) {
      const filtradas = visibles.filter((a: any) => {
        const texto = this.normalizarTexto(
          [a?.name, a?.long_description, ...(a?.categories ?? [])].join(' '),
        );
        return texto.includes(categorias);
      });
      if (filtradas.length > 0) visibles = filtradas;
      // Si el filtro no deja nada, se devuelven TODAS las del catálogo en vez de
      // un vacío: el modelo dirá "no hay tours de golf en Quito", que es distinto
      // de "no hay atracciones en Quito". El segundo caso se detecta en la nota.
    }

    const total = visibles.length;
    const finales = visibles.slice(0, LIMITES.MAX_RESULTADOS_ATRACCIONES).map((a: any) => ({
      id: a?.id ?? null,
      nombre: a?.name ?? null,
      descripcion: this.truncar(a?.long_description, 220),
      duracion: a?.duration ?? null,
      precio: a?.price?.total != null ? String(a.price.total) : null,
      moneda: a?.price?.currency ?? null,
      operador: a?.operator?.name ?? null,
      ciudad: this.nombreCiudad(a?.locations?.[0]?.city),
      direccion: a?.locations?.[0]?.address ?? null,
      puntuacion: a?.ratings?.score ?? null,
      resenas: a?.ratings?.number_of_reviews ?? null,
      cancelacion_gratuita: a?.free_cancellation ?? null,
      incluye: a?.includes ?? null,
      categorias: a?.categories ?? null,
    }));

    const hayFiltroDeCiudad = Boolean(ciudadTexto && destino);

    return {
      ok: true,
      data: {
        consulta: {
          ciudad: ciudadTexto,
          fecha: fecha,
          tipo_actividad: args?.categorias ?? null,
          ...(destino?.iata ? { iata: destino.iata } : {}),
          ...(ciudadTexto && !destino
            ? { aviso_ciudad: `"${ciudadTexto}" no está en el catálogo de ciudades.` }
            : {}),
        },
        encontrados: total,
        truncado: total > finales.length ? `Mostrando ${finales.length} de ${total}.` : null,
        atracciones: finales,
        ...(hayFiltroDeCiudad
          ? {
              aviso:
                `El filtro por "${destino!.nombre}" se aplicó sobre el campo "ciudad" de cada ` +
                'atracción, porque el endpoint no acepta filtros. Presenta SOLO las de esa ciudad ' +
                'y no menciones las de otras.',
            }
          : {}),
        ...(ciudadTexto && !destino
          ? {
              nota:
                `"${ciudadTexto}" no es una ciudad que opere, así que el catálogo se devolvió SIN ` +
                'filtrar. No presentes estas atracciones como si fueran de esa ciudad.',
            }
          : {}),
        ...(total === 0
          ? {
              nota: ciudadTexto
                ? `No hay atracciones de ${destino?.nombre ?? ciudadTexto} en el catálogo. Dilo con claridad y no inventes ninguna.`
                : 'No hay atracciones en el catálogo. Dilo con claridad y no inventes ninguna.',
            }
          : {}),
      },
    };
  }

  /** Busca un destino por nombre/alias sin exigir IATA (para ciudades sin aeropuerto). */
  private aDestinoPorNombre(ciudad: string): DestinoConocido | null {
    const limpio = this.normalizarTexto(ciudad);
    return (
      DESTINOS.find((d) => this.normalizarTexto(d.nombre) === limpio) ??
      DESTINOS.find((d) => d.alias.some((a) => this.normalizarTexto(a) === limpio)) ??
      null
    );
  }

  /**
 * `city_id` de Booking -> nombre legible. Invierte la tabla del catálogo.
 *
 * Los `city_id` de las atracciones del proyecto pueden venir como número o como
 * texto según la capa que los serializó, así que se comparan ya normalizados con
 * `Number`. Un `cityId` desconocido devuelve `null` en vez del número crudo: el
 * modelo no debe recitar `-2140479` como si fuera el nombre de una ciudad.
 */
  private nombreCiudad(cityId: unknown): string | null {
    if (cityId == null) return null;
    const d = DESTINOS.find((x) => x.cityId === Number(cityId));
    return d ? d.nombre : null;
  }

  /**
   * `estado_vuelo`: `GET /vuelos/flights/:flightNumber/status`.
   *
   * Es el endpoint PÚBLICO del contrato (`security: []`): no pide propietario ni
   * token, que es justo lo que un bot informativo necesita y por eso se eligió
   * para "cómo va mi vuelo".
   *
   * El estado viene como ENUM en inglés del backend (`SCHEDULED`, `DELAYED`...).
   * Se traduce a español porque el bot responde en español y "DELAYED" entre
   * paréntesis queda mejor que una traducción que el modelo tendría que
   * acertar cada vez (y que podría equivocarse).
   */
  private async estadoVuelo(args: any): Promise<ResultadoHerramienta> {
    const numero = String(args?.numeroVuelo ?? '').trim().toUpperCase();
    if (!numero) {
      return {
        ok: false,
        data: { error: 'Falta el número de vuelo.', instruccion: 'Pide al usuario el número de vuelo.' },
      };
    }

    const fecha = this.aFecha(args?.fecha);
    if (!fecha) {
      return {
        ok: false,
        data: {
          error: 'Falta la fecha del vuelo.',
          instruccion:
            'El estado de un vuelo es distinto cada día. Pide al usuario la fecha ' +
            '(día/mes/año) en la que vuela y vuelve a llamar.',
        },
      };
    }

    const { data } = await this.http.get(
      `/vuelos/flights/${encodeURIComponent(numero)}/status`,
      { params: { date: fecha } },
    );

    const estados: Record<string, string> = {
      SCHEDULED: 'programado',
      BOARDING: 'embarcando',
      DEPARTED: 'despegado',
      DELAYED: 'retrasado',
      ARRIVED: 'aterrizado',
      CANCELLED: 'cancelado',
      DIVERTED: 'desviado',
    };

    // `FlightStatusDto` anida la operativa en `departure`/`arrival` con campos
    // `scheduledAt`/`estimatedAt`/`actualAt`. Los tres son nullables: la API los
    // devuelve en null cuando aún no hay hora real, y ese null ES la información
    // ("todavía no ha despegado"), así que se conserva en vez de omitirse.
    const estadoCrudo: string | null = data?.status ?? null;
    const salida = data?.departure ?? {};
    const llegada = data?.arrival ?? {};

    const programada = salida.scheduledAt ?? null;
    const estimada = salida.estimatedAt ?? null;
    const real = salida.actualAt ?? null;

    const hayRetrasoEstimado =
      estimada && programada ? new Date(estimada).getTime() > new Date(programada).getTime() : false;

    return {
      ok: true,
      data: {
        vuelo: data?.flightNumber ?? numero,
        fecha: data?.date ?? fecha,
        estado: estadoCrudo ? (estados[estadoCrudo] ?? estadoCrudo) : null,
        estado_codigo: estadoCrudo,
        ruta:
          salida.iataCode && llegada.iataCode
            ? `${salida.iataCode} → ${llegada.iataCode}`
            : null,
        aerolinea: data?.marketingCarrier ?? null,
        avion: data?.aircraft ?? null,
        salida_programada: programada,
        salida_estimada: estimada,
        salida_real: real,
        llegada_programada: llegada.scheduledAt ?? null,
        llegada_real: llegada.actualAt ?? null,
        tiene_retraso: estadoCrudo === 'DELAYED' || hayRetrasoEstimado,
        ...(real && estimada && new Date(real).getTime() > new Date(estimada).getTime()
          ? { observacion: 'El retraso real es mayor que la hora estimada que se había informado.' }
          : {}),
        ...(estadoCrudo === 'CANCELLED'
          ? {
              nota:
                'El vuelo está CANCELADO. Dilo de forma directa y ofrece buscar una ' +
                'alternativa con consultar_vuelos, sin prometer que exista.',
            }
          : {}),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Utilidades
  // ══════════════════════════════════════════════════════════════════════

  /** Recorta un texto largo sin cortar palabras a la mitad. */
  private truncar(texto: unknown, maximo: number): string | null {
    if (typeof texto !== 'string' || !texto) return null;
    if (texto.length <= maximo) return texto;
    const cortado = texto.slice(0, maximo);
    const ultimoEspacio = cortado.lastIndexOf(' ');
    return `${cortado.slice(0, ultimoEspacio > 0 ? ultimoEspacio : maximo)}…`;
  }

  /**
   * `consultar_alojamientos`: `GET /alojamientos`.
   * Consulta el catálogo de hoteles y hospedajes, filtrando en memoria por destino y comodidades.
   */
  private async consultarAlojamientos(args: any): Promise<ResultadoHerramienta> {
    try {
      const destinoTexto = args?.destino ? String(args.destino) : null;
      const { data } = await this.http.get('/alojamientos', { params: { limit: 25 } });
      const crudos = Array.isArray(data?.data) ? data.data : [];

      let filtrados = crudos;
      if (destinoTexto) {
        const normalizado = this.normalizarTexto(destinoTexto);
        filtrados = filtrados.filter((a: any) =>
          this.normalizarTexto(a?.destino ?? '').includes(normalizado) ||
          this.normalizarTexto(a?.nombre ?? '').includes(normalizado)
        );
      }

      if (args?.tienePiscina) {
        filtrados = filtrados.filter((a: any) => a?.tienePiscina === true);
      }

      if (args?.precioMaximo) {
        filtrados = filtrados.filter((a: any) => Number(a?.precioPorNoche ?? 0) <= Number(args.precioMaximo));
      }

      const finales = filtrados.slice(0, 5).map((a: any) => ({
        id: a?.id,
        nombre: a?.nombre,
        destino: a?.destino,
        tipo_propiedad: a?.tipo_propiedad,
        precio_por_noche: a?.precioPorNoche != null ? `${a.precioPorNoche} ${a.moneda || 'USD'}` : 'Consultar',
        puntuacion: a?.ratings?.score ?? 9.0,
        tiene_piscina: a?.tienePiscina ? 'Sí' : 'No',
        amenidades: Array.isArray(a?.amenidades) ? a.amenidades.slice(0, 4) : [],
      }));

      return {
        ok: true,
        data: {
          destino: destinoTexto,
          total_encontrados: filtrados.length,
          mostrados: finales.length,
          alojamientos: finales,
        },
      };
    } catch (e: any) {
      this.logger.error(`Error al consultar alojamientos: ${e.message}`);
      return { ok: false, data: { error: 'No se pudo consultar el catálogo de alojamientos en este momento.' } };
    }
  }

  /**
   * Comprobación de coherencia entre lo declarado y lo implementado.
   *
   * Se invoca desde `onModuleInit` y lanza si hay discrepancia. Es una defensa
   * contra el fallo más peligroso posible en este módulo: que `HERRAMIENTAS`
   * prometa al modelo una herramienta que el executor no tiene, y este la rechace
   * con un error confuso en producción en vez de fallar en el arranque.
   */
  validarCoherencia(): { declaradas: string[]; implementadas: string[]; readonly: string[] } {
    const declaradas = HERRAMIENTAS.map((t) => t.function.name);
    const implementadas = this.herramientas;

    const faltantes = declaradas.filter((n) => !implementadas.includes(n));
    const sobrantes = implementadas.filter((n) => !declaradas.includes(n));

    if (faltantes.length > 0 || sobrantes.length > 0) {
      throw new Error(
        `Incoherencia en el registro de herramientas del chatbot. ` +
          `Declaradas sin implementar: [${faltantes.join(', ')}]. ` +
          `Implementadas sin declarar: [${sobrantes.join(', ')}].`,
      );
    }

    if (this.herramientas.join(',') !== HERRAMIENTAS_SOLO_LECTURA.join(',')) {
      throw new Error(
        `El executor implementa una herramienta que el filtro de solo lectura considera ` +
          `de escritura: [${this.herramientas.join(', ')}]. Revisa el patrón ` +
          `VERBOS_DE_ESCRITURA en chatbot.tools.ts.`,
      );
    }

    return { declaradas, implementadas, readonly: [...HERRAMIENTAS_SOLO_LECTURA] };
  }

  /** Ciudad por defecto para cuando el usuario no dijo dónde recoges. */
  get ciudadPorDefecto(): string {
    return this.destinoPorDefecto().nombre;
  }
}
