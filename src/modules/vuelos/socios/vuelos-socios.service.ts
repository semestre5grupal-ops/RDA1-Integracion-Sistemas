import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ConfigProveedor } from '../../nodes/entities/config-proveedor.entity';
import { propietarioDesde } from '../vuelos.controller';

/**
 * Agregador de aerolíneas socias (RDA2).
 *
 * Booking deja de leer los vuelos de su propia base (seed) y actúa como
 * AGREGADOR: cada búsqueda se reparte en paralelo entre las aerolíneas
 * registradas en "Servicios & Prov." (vertical VUELOS), y las operaciones
 * posteriores (seatmap, hold, reserva, boletos, cancelación...) se reenvían a
 * la aerolínea dueña de la oferta.
 *
 * ── Cómo sabe Booking a qué aerolínea pertenece un id ───────────────────────
 * Los ids que devuelve un socio (offerId, holdId, bookingId) se devuelven al
 * frontend con el prefijo `<codigoNodo>~`, por ejemplo
 * `NODE_VUE_RAM~OF-123`. Al recibir ese id en una ruta o en el cuerpo, Booking
 * quita el prefijo y reenvía la petición a ese nodo. Es stateless: sobrevive a
 * reinicios de Azure sin guardar nada.
 *
 * ── Autenticación hacia el socio (campo "X-API-Key" del nodo) ──────────────
 *  - `clave`                               → cabecera `X-API-Key: clave`
 *  - `oauth2:<client_id>:<client_secret>`  → OAuth2 client_credentials contra
 *    `<origen>/api/v2/oauth2/token`, y `Authorization: Bearer <token>`
 *  - `oauth2:<client_id>:<client_secret>:<url_token>` → igual, con URL propia
 *
 * ── Variables de entorno ────────────────────────────────────────────────────
 *  - VUELOS_FUENTE = socios (defecto) | mixto | local
 *      socios: solo aerolíneas socias (sin datos de prueba).
 *      mixto:  socios + base local.
 *      local:  comportamiento anterior (solo base local).
 *  - VUELOS_SOCIOS_TIMEOUT_MS (defecto 8000) por aerolínea.
 */

export const SEPARADOR_ID = '~';
const CAMPOS_ID = ['offerId', 'holdId', 'bookingId'];

type Fuente = 'socios' | 'mixto' | 'local';

export interface ResultadoSocio {
  codigoNodo: string;
  nombre: string;
  ok: boolean;
  status?: number;
  ms: number;
  ofertas: number;
  error?: string;
  /** Ofertas que la aerolínea devolvió con otra fecha o ya salidas. */
  descartadas?: number;
}

export interface RespuestaProxy {
  status: number;
  body: any;
  headers: Record<string, string>;
}

@Injectable()
export class VuelosSociosService {
  private readonly logger = new Logger(VuelosSociosService.name);
  private readonly tokens = new Map<string, { token: string; expira: number }>();

  constructor(
    @InjectRepository(ConfigProveedor)
    private readonly nodos: Repository<ConfigProveedor>,
  ) {}

  fuente(): Fuente {
    const v = (process.env.VUELOS_FUENTE || 'socios').trim().toLowerCase();
    return v === 'local' || v === 'mixto' ? v : 'socios';
  }

  private timeoutMs(): number {
    const n = Number(process.env.VUELOS_SOCIOS_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 8000;
  }

  // ───────────────────────────── Nodos ─────────────────────────────

  /** URL base `.../vuelos` del nodo, o null si no es una URL usable. */
  static baseVuelos(baseUrlRest?: string | null): string | null {
    if (!baseUrlRest) return null;
    const limpia = baseUrlRest.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(limpia)) return null;
    return /\/vuelos$/i.test(limpia) ? limpia : `${limpia}/vuelos`;
  }

  /** Un nodo que apunta a Booking mismo (seeds `localhost:3000`) causaría un bucle. */
  static esAutoReferencia(url: string, hostPropio?: string): boolean {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return true;
      if (hostPropio && u.host.toLowerCase() === hostPropio.toLowerCase()) return true;
      const publico = (process.env.WEBSITE_HOSTNAME || process.env.PUBLIC_HOSTNAME || '').toLowerCase();
      return !!publico && host === publico;
    } catch {
      return true;
    }
  }

  /** Lista de aerolíneas en memoria unos segundos: cada búsqueda ya no consulta la base. */
  private nodosCache: { lista: ConfigProveedor[]; hasta: number } | null = null;

  async nodosActivos(hostPropio?: string): Promise<ConfigProveedor[]> {
    if (!this.nodosCache || this.nodosCache.hasta < Date.now()) {
      this.nodosCache = { lista: await this.nodos.find({ where: { vertical: 'VUELOS' } }), hasta: Date.now() + 15_000 };
    }
    const todos = this.nodosCache.lista;
    return todos.filter((n) => {
      if (n.killSwitchActivo) return false;
      const base = VuelosSociosService.baseVuelos(n.baseUrlRest);
      return !!base && !VuelosSociosService.esAutoReferencia(base, hostPropio);
    });
  }

  async nodoPorCodigo(codigo: string): Promise<ConfigProveedor | null> {
    return this.nodos.findOne({ where: { codigoNodo: codigo } });
  }

  // ───────────────────────────── Ids ─────────────────────────────

  static separarId(valor: unknown): { nodo: string; id: string } | null {
    if (typeof valor !== 'string') return null;
    const i = valor.indexOf(SEPARADOR_ID);
    if (i <= 0) return null;
    const nodo = valor.slice(0, i);
    if (!/^NODE_[A-Z0-9_]+$/i.test(nodo)) return null;
    return { nodo, id: valor.slice(i + 1) };
  }

  /** Añade `<nodo>~` a offerId/holdId/bookingId en toda la respuesta del socio. */
  static prefijarIds(valor: any, nodo: string): any {
    if (Array.isArray(valor)) return valor.map((v) => VuelosSociosService.prefijarIds(v, nodo));
    if (!valor || typeof valor !== 'object') return valor;
    const out: any = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CAMPOS_ID.includes(k) && typeof v === 'string' && v && !VuelosSociosService.separarId(v)) {
        out[k] = `${nodo}${SEPARADOR_ID}${v}`;
      } else {
        out[k] = VuelosSociosService.prefijarIds(v, nodo);
      }
    }
    return out;
  }

  /**
   * El contrato usa dos formas de segmento: en búsqueda `departure: {iataCode, at}`
   * y en reservas `departureIataCode` / `departureAt`. Algunas aerolíneas mandan
   * la de búsqueda también en la reserva; se completan ambas formas para que el
   * frontend (y Mis Reservas) funcionen con cualquiera.
   */
  static normalizarSegmentos(valor: any): any {
    if (Array.isArray(valor)) return valor.map((v) => VuelosSociosService.normalizarSegmentos(v));
    if (!valor || typeof valor !== 'object') return valor;
    const out: any = {};
    for (const [k, v] of Object.entries(valor)) out[k] = VuelosSociosService.normalizarSegmentos(v);
    if (Array.isArray(out.segments)) {
      out.segments = out.segments.map((seg: any) => {
        if (!seg || typeof seg !== 'object') return seg;
        const n = { ...seg };
        n.departureIataCode ??= seg.departure?.iataCode;
        n.departureAt ??= seg.departure?.at;
        n.arrivalIataCode ??= seg.arrival?.iataCode;
        n.arrivalAt ??= seg.arrival?.at;
        if (!n.departure && (seg.departureIataCode || seg.departureAt)) {
          n.departure = { iataCode: seg.departureIataCode, at: seg.departureAt, terminal: seg.departureTerminal ?? null };
        }
        if (!n.arrival && (seg.arrivalIataCode || seg.arrivalAt)) {
          n.arrival = { iataCode: seg.arrivalIataCode, at: seg.arrivalAt, terminal: seg.arrivalTerminal ?? null };
        }
        return n;
      });
    }
    return out;
  }

  /** Quita `<nodo>~` antes de enviar el cuerpo al socio. */
  static quitarPrefijos(valor: any): any {
    if (Array.isArray(valor)) return valor.map((v) => VuelosSociosService.quitarPrefijos(v));
    if (!valor || typeof valor !== 'object') return valor;
    const out: any = {};
    for (const [k, v] of Object.entries(valor)) {
      const sep = CAMPOS_ID.includes(k) ? VuelosSociosService.separarId(v) : null;
      out[k] = sep ? sep.id : VuelosSociosService.quitarPrefijos(v);
    }
    return out;
  }

  /** Busca el nodo dueño en la ruta (segmentos) o en el cuerpo (offerId/holdId/bookingId). */
  static detectarNodo(segmentos: string[], body: any): string | null {
    for (const s of segmentos) {
      const sep = VuelosSociosService.separarId(decodeURIComponent(s));
      if (sep) return sep.nodo;
    }
    const buscar = (v: any): string | null => {
      if (Array.isArray(v)) {
        for (const x of v) {
          const r = buscar(x);
          if (r) return r;
        }
        return null;
      }
      if (!v || typeof v !== 'object') return null;
      for (const [k, x] of Object.entries(v)) {
        if (CAMPOS_ID.includes(k)) {
          const sep = VuelosSociosService.separarId(x);
          if (sep) return sep.nodo;
        }
        const r = buscar(x);
        if (r) return r;
      }
      return null;
    };
    return buscar(body);
  }

  // ───────────────────────────── Auth ─────────────────────────────

  private async cabecerasAuth(nodo: ConfigProveedor): Promise<Record<string, string>> {
    const clave = (nodo.apiKey || '').trim();
    if (!clave) return {};
    if (!/^oauth2:/i.test(clave)) return { 'X-API-Key': clave };

    const partes = clave.split(':');
    const clientId = partes[1];
    const clientSecret = partes[2];
    const urlToken =
      partes.length > 3
        ? partes.slice(3).join(':')
        : `${new URL(VuelosSociosService.baseVuelos(nodo.baseUrlRest)!).origin}/api/v2/oauth2/token`;

    const cache = this.tokens.get(nodo.codigoNodo);
    if (cache && cache.expira > Date.now() + 15_000) return { Authorization: `Bearer ${cache.token}` };

    // RFC 6749 §2.3: el cliente se autentica de UNA sola forma. Mandar Basic y
    // además client_id/client_secret en el cuerpo hace que servidores estrictos
    // respondan 400 invalid_request. Se intenta Basic y, si no, el cuerpo.
    const pedir = (modo: 'basic' | 'cuerpo') =>
      fetch(urlToken, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(modo === 'basic' ? { Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64') } : {}),
        },
        body: new URLSearchParams(
          modo === 'basic'
            ? { grant_type: 'client_credentials' }
            : { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret },
        ),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    let res = await pedir('basic');
    let datos: any = await res.json().catch(() => ({}));
    if (!res.ok || !datos.access_token) {
      res = await pedir('cuerpo');
      datos = await res.json().catch(() => ({}));
    }
    if (!res.ok || !datos.access_token) {
      throw new Error(`OAuth2 rechazado por ${nodo.codigoNodo} (HTTP ${res.status}${datos?.error ? `: ${datos.error}` : ''})`);
    }
    const segundos = Number(datos.expires_in) || 300;
    this.tokens.set(nodo.codigoNodo, { token: datos.access_token, expira: Date.now() + segundos * 1000 });
    return { Authorization: `Bearer ${datos.access_token}` };
  }

  private async cabecerasSocio(nodo: ConfigProveedor, entrantes: Record<string, any>): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Device-Fingerprint': String(entrantes['x-device-fingerprint'] || 'booking-gateway'),
      'X-Correlation-Id': String(entrantes['x-correlation-id'] || `corr-${randomUUID()}`),
      'X-Booking-Node': nodo.codigoNodo,
      // Dueño de la reserva para la aerolínea (contrato v2): el mismo usuario que
      // Booking usa para Mis Reservas. Sin él, la aerolínea rechaza cancelar o
      // consultar la reserva (400) o no la encuentra (404).
      'X-User-Id': propietarioDesde(entrantes['x-device-fingerprint'], entrantes['authorization']),
    };
    for (const nombre of ['idempotency-key', 'accept-language', 'if-match']) {
      if (entrantes[nombre]) h[nombre.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase())] = String(entrantes[nombre]);
    }
    return { ...h, ...(await this.cabecerasAuth(nodo)) };
  }

  // ───────────────────────────── Búsqueda ─────────────────────────────

  /** Aerolíneas que interpretan `departureDate` en UTC (detectado en sus respuestas). */
  private readonly fechasEnUtc = new Set<string>();

  async buscar(
    body: any,
    entrantes: Record<string, any>,
    hostPropio?: string,
  ): Promise<{ offers: any[]; sources: ResultadoSocio[] }> {
    const nodos = await this.nodosActivos(hostPropio);
    const resultados = await this.esperarBusquedas(nodos, body, entrantes);
    const offers = resultados.flatMap((r) => r.ofertas);
    offers.sort((a, b) => precioTotal(a) - precioTotal(b));
    return { offers, sources: resultados.map((r) => r.resumen) };
  }

  /**
   * Espera a todas las aerolíneas, pero sin quedarse colgado por una sola: pasado
   * el tope (VUELOS_BUSQUEDA_TOPE_MS, 6 s por defecto) se responde con las que ya
   * contestaron, siempre que al menos una lo haya hecho. Las que no llegaron salen
   * en `sources` como "sin respuesta" en esta búsqueda (igual que un timeout).
   */
  private async esperarBusquedas(nodos: ConfigProveedor[], body: any, entrantes: Record<string, any>) {
    const n = Number(process.env.VUELOS_BUSQUEDA_TOPE_MS);
    const tope = Number.isFinite(n) && n > 0 ? n : 6000;
    const listos: Array<{ ofertas: any[]; resumen: ResultadoSocio } | undefined> = new Array(nodos.length);
    const promesas = nodos.map((nodo, i) => this.buscarEnNodo(nodo, body, entrantes).then((r) => (listos[i] = r)));
    const todas = Promise.all(promesas);
    let reloj: NodeJS.Timeout | undefined;
    const alTope = new Promise<'tope'>((ok) => (reloj = setTimeout(() => ok('tope'), tope)));
    let r = await Promise.race([todas, alTope]);
    // Si al tope nadie respondió todavía, se espera como antes (al timeout de cada una).
    if (r === 'tope' && !listos.some(Boolean)) r = await todas;
    clearTimeout(reloj);
    return nodos.map(
      (nodo, i) =>
        listos[i] ?? {
          ofertas: [],
          resumen: {
            codigoNodo: nodo.codigoNodo,
            nombre: nodo.nombreProveedor,
            ok: false,
            ms: tope,
            ofertas: 0,
            error: `Sin respuesta en ${tope} ms`,
          } as ResultadoSocio,
        },
    );
  }

  private async buscarEnNodo(
    nodo: ConfigProveedor,
    body: any,
    entrantes: Record<string, any>,
  ): Promise<{ ofertas: any[]; resumen: ResultadoSocio }> {
    const t0 = Date.now();
    const base = VuelosSociosService.baseVuelos(nodo.baseUrlRest)!;
    const resumen: ResultadoSocio = { codigoNodo: nodo.codigoNodo, nombre: nodo.nombreProveedor, ok: false, ms: 0, ofertas: 0 };
    try {
      const consultar = async (cuerpo: any) => {
        const res = await fetch(`${base}/search`, {
          method: 'POST',
          headers: await this.cabecerasSocio(nodo, entrantes),
          body: JSON.stringify(cuerpo ?? {}),
          signal: AbortSignal.timeout(this.timeoutMs()),
        });
        const datos: any = await res.json().catch(() => null);
        const offers: any[] = Array.isArray(datos?.offers) ? datos.offers : Array.isArray(datos) ? datos : [];
        return { status: res.status, ok: res.ok, offers, error: res.ok ? undefined : datos?.detail || datos?.title || `HTTP ${res.status}` };
      };

      // Algunas aerolíneas leen `departureDate` en UTC (en Ecuador, desde las 19:00
      // ya es el día siguiente): rechazan "hoy" por pasado y un vuelo de las 23:00
      // sale con la fecha de mañana. A esas se les pide también el día siguiente y
      // se deja solo lo que sale en la fecha pedida en hora de Ecuador.
      // Si ya se sabe que esta aerolínea usa UTC, las dos consultas van en paralelo.
      const conocidaUtc = this.fechasEnUtc.has(nodo.codigoNodo) && Array.isArray(body?.itineraries) && body.itineraries.length > 0;
      const segundaAdelantada = conocidaUtc ? consultar(conFechasMasUnDia(body)).catch(() => null) : null;
      const primera = await consultar(body);
      const fechaUtc = this.fechasEnUtc.has(nodo.codigoNodo)
        || (!primera.ok && /before the current date|fecha.*(pasad|anterior)|past date/i.test(String(primera.error ?? '')))
        || (primera.ok && primera.offers.some((o) => saleElDiaAnterior(o, body)));
      let segunda: Awaited<ReturnType<typeof consultar>> | null = null;
      if (fechaUtc && Array.isArray(body?.itineraries) && body.itineraries.length) {
        this.fechasEnUtc.add(nodo.codigoNodo);
        segunda = await (segundaAdelantada ?? consultar(conFechasMasUnDia(body)).catch(() => null));
      }
      resumen.status = primera.ok || !segunda?.ok ? primera.status : segunda.status;
      if (!primera.ok && !segunda?.ok) {
        resumen.error = primera.error;
        return { ofertas: [], resumen };
      }
      const vistas = new Set<string>();
      const recibidas: any[] = [...(primera.ok ? primera.offers : []), ...(segunda?.ok ? segunda.offers : [])]
        .filter((o) => {
          const id = String(o?.offerId ?? '');
          if (!id) return true;
          if (vistas.has(id)) return false;
          vistas.add(id);
          return true;
        });
      // Solo vuelos de la fecha pedida y que no hayan salido: una aerolínea que
      // ignore la fecha no debe vender un vuelo pasado desde Booking.
      const lista = recibidas.filter((o) => ofertaCoincideConFechas(o, body));
      if (lista.length < recibidas.length) {
        resumen.descartadas = recibidas.length - lista.length;
      }
      const ofertas = lista.map((o) => ({
        ...VuelosSociosService.normalizarSegmentos(VuelosSociosService.prefijarIds(o, nodo.codigoNodo)),
        provider: { nodeCode: nodo.codigoNodo, name: nodo.nombreProveedor, emoji: nodo.emoji || '✈️' },
      }));
      resumen.ok = true;
      resumen.ofertas = ofertas.length;
      return { ofertas, resumen };
    } catch (e: any) {
      resumen.error =
        e?.name === 'TimeoutError'
          ? `Sin respuesta en ${this.timeoutMs()} ms`
          : e?.message === 'fetch failed'
            ? `No se pudo conectar (${e?.cause?.code || 'red'})`
            : e?.message || String(e);
      return { ofertas: [], resumen };
    } finally {
      resumen.ms = Date.now() - t0;
      this.logger.log(
        `[vuelos-socios] search ${nodo.codigoNodo} -> ${resumen.ok ? 'OK' : 'FALLO'} ` +
          `(${resumen.status ?? '-'}, ${resumen.ms} ms, ${resumen.ofertas} ofertas` +
          `${resumen.descartadas ? `, ${resumen.descartadas} descartadas por fecha` : ''})${resumen.error ? ' ' + resumen.error : ''}`,
      );
    }
  }

  // ───────────────────────────── Reenvío ─────────────────────────────

  /** Reenvía `<método> /vuelos/<resto>` al nodo dueño, con ids sin prefijo. */
  async reenviar(
    codigoNodo: string,
    metodo: string,
    segmentos: string[],
    query: string,
    body: any,
    entrantes: Record<string, any>,
  ): Promise<RespuestaProxy> {
    const nodo = await this.nodoPorCodigo(codigoNodo);
    const base = nodo ? VuelosSociosService.baseVuelos(nodo.baseUrlRest) : null;
    if (!nodo || !base || nodo.vertical !== 'VUELOS') {
      return problema(404, 'Aerolínea no registrada', `El nodo ${codigoNodo} no está registrado como socio de Vuelos en Booking.`);
    }
    if (nodo.killSwitchActivo) {
      return problema(503, 'Aerolínea desactivada', `El nodo ${codigoNodo} tiene el Kill-Switch activo.`);
    }

    const ruta = segmentos
      .map((s) => {
        const sep = VuelosSociosService.separarId(decodeURIComponent(s));
        return encodeURIComponent(sep ? sep.id : decodeURIComponent(s));
      })
      .join('/');
    const url = `${base}/${ruta}${query ? `?${query}` : ''}`;
    const conCuerpo = !['GET', 'HEAD', 'DELETE'].includes(metodo.toUpperCase());

    try {
      const res = await fetch(url, {
        method: metodo,
        headers: await this.cabecerasSocio(nodo, entrantes),
        body: conCuerpo ? JSON.stringify(VuelosSociosService.quitarPrefijos(body ?? {})) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs() * 2),
      });
      const texto = await res.text();
      let datos: any = texto;
      try {
        datos = texto ? JSON.parse(texto) : null;
      } catch {
        /* respuesta no JSON: se devuelve tal cual */
      }
      const headers: Record<string, string> = {};
      const tipo = res.headers.get('content-type');
      if (tipo) headers['Content-Type'] = tipo;
      for (const h of ['etag', 'retry-after']) {
        const v = res.headers.get(h);
        if (v) headers[h] = v;
      }
      headers['X-Booking-Node'] = nodo.codigoNodo;
      this.logger.log(`[vuelos-socios] ${metodo} ${url} -> ${res.status}`);
      return {
        status: res.status,
        body:
          datos && typeof datos === 'object'
            ? VuelosSociosService.normalizarSegmentos(VuelosSociosService.prefijarIds(datos, nodo.codigoNodo))
            : datos,
        headers,
      };
    } catch (e: any) {
      this.logger.warn(`[vuelos-socios] ${metodo} ${url} -> ERROR ${e?.message}`);
      return problema(
        e?.name === 'TimeoutError' ? 504 : 502,
        'La aerolínea no respondió',
        `${nodo.nombreProveedor} (${nodo.codigoNodo}) no respondió: ${e?.message || e}`,
      );
    }
  }

  /**
   * Para rutas sin id de socio (p. ej. `GET /flights/{n}/status`): pregunta a
   * todas las aerolíneas activas y devuelve la primera respuesta 2xx.
   */
  async primeraRespuesta(
    metodo: string,
    segmentos: string[],
    query: string,
    entrantes: Record<string, any>,
    hostPropio?: string,
  ): Promise<RespuestaProxy> {
    const nodos = await this.nodosActivos(hostPropio);
    if (nodos.length === 0) {
      return problema(404, 'Sin aerolíneas', 'No hay aerolíneas socias registradas en Booking.');
    }
    const respuestas = await Promise.all(
      nodos.map((n) => this.reenviar(n.codigoNodo, metodo, segmentos, query, null, entrantes)),
    );
    return (
      respuestas.find((r) => r.status >= 200 && r.status < 300) ??
      respuestas.find((r) => r.status === 404) ??
      respuestas[0]
    );
  }
}

export function precioTotal(oferta: any): number {
  const candidatos = [
    oferta?.grandTotal?.total,
    oferta?.price?.total,
    oferta?.totalPrice?.total,
    oferta?.itineraries?.[0]?.pricingOptions?.[0]?.price?.total,
    oferta?.itineraries?.[0]?.pricingOptions?.[0]?.totalPrice?.total,
  ];
  for (const c of candidatos) {
    const n = parseFloat(String(c ?? ''));
    if (Number.isFinite(n)) return n;
  }
  return Number.MAX_SAFE_INTEGER;
}

function problema(status: number, title: string, detail: string): RespuestaProxy {
  return {
    status,
    body: { type: `https://httpstatuses.com/${status}`, title, status, detail },
    headers: { 'Content-Type': 'application/problem+json' },
  };
}

/** Fecha (AAAA-MM-DD) de un instante en hora de Ecuador; si no se puede leer, la del texto. */
function fechaEnEcuador(iso: unknown): string | null {
  const t = String(iso ?? '');
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(d);
}

/** El texto trae zona horaria (`Z` o `±hh:mm`): el instante es inequívoco. */
function tieneZona(iso: unknown): boolean {
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(String(iso ?? '').trim());
}

/**
 * Fecha de salida tal como la vive el pasajero: con zona horaria, la de Ecuador;
 * sin zona (hora local de la aerolínea), la del texto.
 */
function fechaDeSalida(iso: unknown): string | null {
  return tieneZona(iso) ? fechaEnEcuador(iso) : (/^\d{4}-\d{2}-\d{2}/.test(String(iso ?? '')) ? String(iso).slice(0, 10) : fechaEnEcuador(iso));
}

/**
 * true si cada itinerario de la oferta sale en la fecha pedida (en hora de
 * Ecuador) y el primer vuelo no ha salido aún.
 */
export function ofertaCoincideConFechas(oferta: any, body: any, ahora = new Date()): boolean {
  const pedidos: any[] = Array.isArray(body?.itineraries) ? body.itineraries : [];
  const its: any[] = Array.isArray(oferta?.itineraries) ? oferta.itineraries : [];
  for (let i = 0; i < its.length; i++) {
    const seg = its[i]?.segments?.[0];
    const salida = seg?.departureAt ?? seg?.departure?.at;
    if (!salida) continue;
    if (i === 0 && new Date(salida).getTime() < ahora.getTime()) return false;
    const pedida = pedidos[i]?.departureDate;
    if (pedida && fechaDeSalida(salida) !== pedida) return false;
  }
  return true;
}

/**
 * La aerolínea devolvió, para la fecha pedida, un vuelo que en Ecuador sale el
 * día anterior (por ejemplo 04:00 UTC = 23:00 del día antes): agrupa por fecha UTC.
 */
export function saleElDiaAnterior(oferta: any, body: any): boolean {
  const pedida = body?.itineraries?.[0]?.departureDate;
  const seg = oferta?.itineraries?.[0]?.segments?.[0];
  const salida = seg?.departureAt ?? seg?.departure?.at;
  if (!pedida || !salida || !tieneZona(salida)) return false;
  return String(new Date(salida).toISOString()).slice(0, 10) === pedida && (fechaEnEcuador(salida) ?? '') < pedida;
}

/** El mismo pedido con cada fecha un día después (para aerolíneas que usan UTC). */
export function conFechasMasUnDia(body: any): any {
  const mas1 = (f: string) => {
    const d = new Date(`${f}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return f;
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return {
    ...body,
    itineraries: (body?.itineraries ?? []).map((it: any) => ({ ...it, departureDate: mas1(String(it?.departureDate ?? '')) })),
  };
}
