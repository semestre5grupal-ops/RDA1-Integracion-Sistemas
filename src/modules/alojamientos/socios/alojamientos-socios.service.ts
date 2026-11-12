import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ConfigProveedor } from '../../nodes/entities/config-proveedor.entity';
import { InventoryService } from '../../inventory/inventory.service';

/**
 * Agregador de socios de ALOJAMIENTOS (RDA2) — mismo modelo que vuelos
 * (`src/modules/vuelos/socios/vuelos-socios.service.ts`).
 *
 * El API Gateway deja de vender a partir de su copia local del catálogo: cada
 * consulta se reparte entre los socios registrados en «Servicios & Prov.»
 * (`schema_proveedores.config_proveedor`, vertical ALOJAMIENTOS) y cada
 * operación (disponibilidad, reserva, cancelación) se reenvía al socio dueño.
 * El socio es la fuente de verdad del inventario: Booking nunca confirma una
 * habitación que el socio no confirmó.
 *
 * ── Ids ─────────────────────────────────────────────────────────────────────
 * Los alojamientos de un socio se exponen como `<codigoNodo>~<idDelSocio>`, por
 * ejemplo `NODE_ALO_PEC~HTL-1001`. Al recibir ese id, el gateway sabe a qué nodo
 * reenviar. Es stateless: sobrevive a reinicios sin guardar nada.
 *
 * ── Autenticación hacia el socio (campo «API Key» del nodo) ─────────────────
 *  - `clave`                               → `X-API-Key: clave`
 *  - `oauth2:<client_id>:<client_secret>`  → client_credentials contra
 *    `<origen>/api/v2/oauth2/token` y `Authorization: Bearer <token>`
 *  - `oauth2:<client_id>:<client_secret>:<url_token>` → igual, con URL propia
 *
 * ── Variables de entorno ────────────────────────────────────────────────────
 *  - ALOJAMIENTOS_FUENTE = socios (defecto) | mixto | local
 *      socios: solo socios (la copia local de un socio queda oculta: venderla
 *              es lo que causaba la sobreventa).
 *      mixto:  socios + alojamientos locales dados de alta a mano (sin proveedor).
 *      local:  comportamiento anterior (solo la base local).
 *  - ALOJAMIENTOS_SOCIOS_TIMEOUT_MS (defecto 8000) por socio y petición.
 *  - ALOJAMIENTOS_SOCIOS_CACHE_MS (defecto 10000) caché del catálogo agregado.
 *    Corta a propósito: un alojamiento nuevo del socio aparece al refrescar.
 */

export const SEPARADOR_ID = '~';
export type FuenteAlojamientos = 'socios' | 'mixto' | 'local';

export interface RespuestaSocio {
  status: number; // 0 = sin respuesta (timeout, DNS, conexión)
  body: any;
  headers: Record<string, string>;
  ms: number;
  error?: string;
}

export interface ResumenSocio {
  codigoNodo: string;
  nombre: string;
  ok: boolean;
  status: number;
  ms: number;
  alojamientos: number;
  error?: string;
}

/** Opción de disponibilidad normalizada (una por tipo de habitación y plan). */
export interface OpcionSocio {
  productId: string; // `<codigo>` o `<codigo>@<plan>`
  codigo: string;
  plan: string | null;
  nombre: string;
  remanentes: number;
  disponible: boolean;
  precioNoche: number | null;
  precioTotal: number | null;
  regimen: string | null;
  capacidadAdultos: number | null;
  capacidadNinos: number | null;
  totalHabitaciones: number | null;
  cancelacionHoras: number | null;
  cancelacionTexto?: string | null;
  reembolsable: boolean | null;
  camas?: number | null;
  descripcionCamas?: string | null;
  tamanoM2?: number | null;
  amenidades?: string[];
  descripcion?: string | null;
}

const RE_NODO = /^NODE_[A-Z0-9_]+$/i;
const PAIS_POR_DEFECTO = 'EC';

const money = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(typeof v === 'object' ? (v as any).total ?? (v as any).amount ?? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n;
};
/** Extrae un número entero de un valor numérico, texto o array (ej. "3 camas", 2, [{cantidad: 2}] → 3 ó 2). */
export const extraerCamasNum = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? v : null;
  if (Array.isArray(v)) {
    let suma = 0;
    for (const item of v) {
      if (typeof item === 'number') suma += item;
      else if (typeof item === 'object' && item !== null) {
        const c = Number((item as any).cantidad ?? (item as any).count ?? (item as any).numero ?? (item as any).camas ?? 1);
        suma += Number.isFinite(c) && c > 0 ? c : 1;
      } else if (typeof item === 'string') {
        const m = item.match(/\d+/);
        suma += m ? parseInt(m[0], 10) : 1;
      }
    }
    return suma > 0 ? suma : v.length;
  }
  if (typeof v === 'string') {
    const nums = v.match(/\d+/g);
    if (nums && nums.length > 1 && /(?:y|\+|,)/.test(v)) {
      const suma = nums.reduce((acc, curr) => acc + parseInt(curr, 10), 0);
      if (suma > 0) return suma;
    } else if (nums && nums.length > 0) {
      return parseInt(nums[0], 10);
    }
  }
  const match = String(v).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
};

/** Deduce una descripción de camas legible y precisa para hospitalidad (Booking.com style) */
export function inferirDescripcionCamas(camasRaw: unknown, nombreTipo = '', capacidadAdultos: number | null = 2): string {
  // 1. Si ya viene una descripción textual detallada (ej. "2 camas individuales", "1 cama matrimonial y 2 camas individuales")
  if (typeof camasRaw === 'string' && camasRaw.trim().length > 0 && !/^\d+$/.test(camasRaw.trim())) {
    return camasRaw.trim();
  }

  // 2. Si viene un array estructurado de camas
  if (Array.isArray(camasRaw) && camasRaw.length > 0) {
    const descripciones = camasRaw.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'object' && item !== null) {
        const cant = Number((item as any).cantidad ?? (item as any).count ?? (item as any).numero ?? 1);
        const tipo = String((item as any).tipo ?? (item as any).nombre ?? (item as any).type ?? 'individual').toLowerCase();
        return `${cant} ${cant === 1 ? 'cama' : 'camas'} ${tipo}`;
      }
      return '1 cama individual';
    });
    return descripciones.join(' y ');
  }

  const num = extraerCamasNum(camasRaw);
  const n = (nombreTipo || '').toLowerCase();

  // 3. PRIORIDAD: Si hay varias camas (num > 1), NUNCA forzar "1 cama doble grande"
  if (num && num > 1) {
    if (n.includes('twin') || n.includes('dos camas') || n.includes('doble individual')) return `${num} camas individuales`;
    if (n.includes('triple')) return `${num} camas individuales`;
    if (n.includes('cuadruple') || n.includes('familiar')) {
      return num === 2 ? '2 camas dobles' : (num === 3 ? '1 cama matrimonial y 2 camas individuales' : `${num} camas`);
    }
    return `${num} camas individuales`;
  }

  // 4. Si es 1 cama (o num == 1 o no especificado), deducir por el nombre y capacidad
  if (n.includes('king') || n.includes('presidencial')) return '1 cama doble extragrande (King)';
  if (n.includes('queen')) return '1 cama doble grande (Queen)';
  if (n.includes('twin') || n.includes('dos camas') || n.includes('doble individual')) return '2 camas individuales';
  if (n.includes('triple')) return '3 camas individuales';
  if (n.includes('cuadruple') || n.includes('familiar')) return '2 camas dobles';
  if (n.includes('individual') || n.includes('single') || capacidadAdultos === 1) return '1 cama individual';
  if (n.includes('suite')) return '1 cama doble extragrande';
  if (n.includes('doble') || n.includes('matrimonial') || capacidadAdultos === 2) return '1 cama doble grande';

  return '1 cama doble grande';
}

export function normalizarRegimen(reg?: string | null): string {
  if (!reg) return 'Solo habitación';
  const r = String(reg).trim().toUpperCase();
  const map: Record<string, string> = {
    SOLO_HABITACION: 'Solo habitación',
    SOLO_ALOJAMIENTO: 'Solo alojamiento',
    ROOM_ONLY: 'Solo habitación',
    DESAYUNO: 'Desayuno incluido',
    DESAYUNO_INCLUIDO: 'Desayuno incluido',
    BED_AND_BREAKFAST: 'Desayuno incluido',
    MEDIA_PENSION: 'Media pensión',
    HALF_BOARD: 'Media pensión',
    PENSION_COMPLETA: 'Pensión completa',
    FULL_BOARD: 'Pensión completa',
    TODO_INCLUIDO: 'Todo incluido',
    ALL_INCLUSIVE: 'Todo incluido',
  };
  return map[r] || reg;
}

const desempacar = (b: any) => (b && typeof b === 'object' && b.data && !Array.isArray(b.data) ? b.data : b);

@Injectable()
export class AlojamientosSociosService {
  private readonly logger = new Logger(AlojamientosSociosService.name);
  private readonly tokens = new Map<string, { token: string; expira: number }>();
  private cacheCatalogo: { expira: number; hoteles: any[]; fuentes: ResumenSocio[] } | null = null;
  private catalogoEnCurso: Promise<{ hoteles: any[]; fuentes: ResumenSocio[] }> | null = null;

  constructor(
    @Optional() @InjectRepository(ConfigProveedor) private readonly nodos?: Repository<ConfigProveedor>,
    @Optional() private readonly inventory?: InventoryService,
  ) {}

  // ───────────────────────────── Configuración ─────────────────────────────

  fuente(): FuenteAlojamientos {
    const f = String(process.env.ALOJAMIENTOS_FUENTE || 'socios').toLowerCase();
    return f === 'local' || f === 'mixto' ? f : 'socios';
  }

  private timeoutMs(): number {
    return Math.max(1000, Number(process.env.ALOJAMIENTOS_SOCIOS_TIMEOUT_MS) || 5000);
  }

  private cacheMs(): number {
    const v = Number(process.env.ALOJAMIENTOS_SOCIOS_CACHE_MS);
    return Number.isFinite(v) && v >= 0 ? v : 10_000;
  }

  /** Base del socio sin barra final. Acepta `.../api/v2` o `.../api/v2/alojamientos`. */
  static base(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const limpio = url.trim().replace(/\/+$/, '').replace(/\/alojamientos$/i, '');
      new URL(limpio);
      return limpio;
    } catch {
      return null;
    }
  }

  async nodosActivos(): Promise<ConfigProveedor[]> {
    if (!this.nodos) return [];
    try {
      const todos = await this.nodos.find({ where: { vertical: 'ALOJAMIENTOS' } as any });
      return todos.filter((n) => !n.killSwitchActivo && !!AlojamientosSociosService.base(n.baseUrlRest));
    } catch (e: any) {
      this.logger.warn(`[alojamientos-socios] No se pudo leer config_proveedor: ${e?.message}`);
      return [];
    }
  }

  async nodoPorCodigo(codigo: string): Promise<ConfigProveedor | null> {
    const nodos = await this.nodosActivos();
    const c = (codigo || '').trim().toUpperCase();
    if (!c) return null;
    const exacto = nodos.find((n) => n.codigoNodo.toUpperCase() === c);
    if (exacto) return exacto;

    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cNorm = norm(c);

    const difuso = nodos.find((n) => {
      const nNorm = norm(n.codigoNodo);
      const provNorm = norm(n.nombreProveedor || '');
      if (nNorm === cNorm) return true;
      if (cNorm.includes('HABITAT') || cNorm === 'NODEALOHAB' || cNorm === 'HABITAT') {
        return nNorm.includes('HABITAT') || provNorm.includes('HABITAT') || nNorm.includes('NODEALOH');
      }
      if (cNorm.includes('KRL') || cNorm.includes('KAROL') || cNorm.includes('ESTADIA') || cNorm === 'NODEALOKRL') {
        return nNorm.includes('KRL') || nNorm.includes('KAROL') || provNorm.includes('ESTADIA');
      }
      return nNorm.includes(cNorm) || cNorm.includes(nNorm);
    });

    return difuso ?? null;
  }

  /** Para el check-in entrante: el nodo dueño de esta API key (o null). */
  async nodoPorClave(clave: string | undefined): Promise<ConfigProveedor | null> {
    if (!clave || !this.nodos) return null;
    try {
      return (await this.nodos.findOne({ where: { apiKey: clave.trim(), vertical: 'ALOJAMIENTOS' } as any })) ?? null;
    } catch {
      return null;
    }
  }

  // ───────────────────────────── Ids ─────────────────────────────

  static separarId(valor: unknown): { nodo: string; id: string } | null {
    if (typeof valor !== 'string') return null;
    const v = decodeURIComponent(valor);
    const i = v.indexOf(SEPARADOR_ID);
    if (i <= 0 || i === v.length - 1) return null;
    const nodo = v.slice(0, i);
    if (!RE_NODO.test(nodo)) return null;
    return { nodo: nodo.toUpperCase(), id: v.slice(i + 1) };
  }

  static esIdSocio(valor: unknown): boolean {
    return AlojamientosSociosService.separarId(valor) !== null;
  }

  static idCompuesto(nodo: string, id: string): string {
    return `${nodo}${SEPARADOR_ID}${id}`;
  }

  /** `SUITE_DELUXE@FLEX_BB` → { codigo, plan }. */
  static separarProducto(productId: string | null | undefined): { codigo: string; plan: string | null } | null {
    if (!productId) return null;
    const [codigo, plan] = String(productId).split('@');
    return codigo ? { codigo, plan: plan || null } : null;
  }

  // ───────────────────────────── HTTP ─────────────────────────────

  private async cabecerasAuth(nodo: ConfigProveedor): Promise<Record<string, string>> {
    const clave = (nodo.apiKey || '').trim();
    if (!clave) return {};
    if (!/^oauth2:/i.test(clave)) return { 'X-API-Key': clave };

    const partes = clave.split(':');
    const [, clientId, clientSecret] = partes;
    const urlToken = partes.length > 3
      ? partes.slice(3).join(':')
      : `${new URL(AlojamientosSociosService.base(nodo.baseUrlRest)!).origin}/api/v2/oauth2/token`;
    const cache = this.tokens.get(nodo.codigoNodo);
    if (cache && cache.expira > Date.now() + 15_000) return { Authorization: `Bearer ${cache.token}` };

    // RFC 6749 §2.3: una sola forma de autenticar al cliente (Basic y, si no, cuerpo).
    const pedir = (modo: 'basic' | 'cuerpo') =>
      this.fetch(urlToken, {
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
        ).toString(),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    let res = await pedir('basic');
    let datos: any = await res.json().catch(() => ({}));
    if (!res.ok || !datos.access_token) {
      res = await pedir('cuerpo');
      datos = await res.json().catch(() => ({}));
    }
    if (!res.ok || !datos.access_token) throw new Error(`OAuth2 rechazado por ${nodo.codigoNodo} (HTTP ${res.status})`);
    this.tokens.set(nodo.codigoNodo, { token: datos.access_token, expira: Date.now() + (Number(datos.expires_in) || 300) * 1000 });
    return { Authorization: `Bearer ${datos.access_token}` };
  }

  /** Punto único de salida HTTP (sustituible en las pruebas). */
  protected fetch(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  async llamar(
    nodo: ConfigProveedor,
    metodo: 'GET' | 'POST',
    ruta: string,
    opciones: { body?: any; idempotencyKey?: string; correlationId?: string; extra?: Record<string, string> } = {},
  ): Promise<RespuestaSocio> {
    const base = AlojamientosSociosService.base(nodo.baseUrlRest);
    const t0 = Date.now();
    if (!base) return { status: 0, body: null, headers: {}, ms: 0, error: 'URL del socio inválida' };
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Correlation-ID': opciones.correlationId || `corr-alo-${randomUUID()}`,
        'X-Booking-Node': nodo.codigoNodo,
        ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opciones.idempotencyKey ? { 'Idempotency-Key': opciones.idempotencyKey } : {}),
        ...(opciones.extra || {}),
        ...(await this.cabecerasAuth(nodo)),
      };
      const res = await this.fetch(`${base}${ruta}`, {
        method: metodo,
        headers,
        body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      const texto = await res.text();
      let body: any = texto;
      try {
        body = texto ? JSON.parse(texto) : null;
      } catch {
        /* no es JSON */
      }
      const cab: Record<string, string> = {};
      res.headers.forEach((v, k) => (cab[k] = v));
      return { status: res.status, body, headers: cab, ms: Date.now() - t0 };
    } catch (e: any) {
      return { status: 0, body: null, headers: {}, ms: Date.now() - t0, error: e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'error de red' };
    }
  }

  // ───────────────────────────── Catálogo ─────────────────────────────

  /** Catálogo agregado de todos los socios (caché corta, y una sola carga a la vez). */
  async catalogo(): Promise<{ hoteles: any[]; fuentes: ResumenSocio[] }> {
    if (this.cacheCatalogo && this.cacheCatalogo.expira > Date.now()) return this.cacheCatalogo;
    if (this.catalogoEnCurso) return this.catalogoEnCurso;
    this.catalogoEnCurso = (async () => {
      const nodos = await this.nodosActivos();
      const resultados = await Promise.all(nodos.map((n) => this.catalogoDeNodo(n)));
      const hoteles = resultados.flatMap((r) => r.hoteles);
      const fuentes = resultados.map((r) => r.resumen);
      this.cacheCatalogo = { expira: Date.now() + this.cacheMs(), hoteles, fuentes };
      return { hoteles, fuentes };
    })().finally(() => (this.catalogoEnCurso = null));
    return this.catalogoEnCurso;
  }

  /** Olvida la caché (tras reservar o cancelar, para que el cupo se vea al instante). */
  invalidarCatalogo(): void {
    this.cacheCatalogo = null;
  }

  private async catalogoDeNodo(nodo: ConfigProveedor): Promise<{ hoteles: any[]; resumen: ResumenSocio }> {
    const t0 = Date.now();
    const crudos: any[] = [];
    let ultimo: RespuestaSocio | null = null;
    for (let page = 1; page <= 10; page++) {
      ultimo = await this.llamar(nodo, 'GET', `/alojamientos?page=${page}&limit=50`);
      if (ultimo.status !== 200) break;
      const b = ultimo.body;
      const items: any[] = Array.isArray(b) ? b : b?.data || b?.items || b?.alojamientos || [];
      crudos.push(...items);
      const meta = b?.metadata || b?.meta;
      if (!items.length || Array.isArray(b) || meta?.has_next === false || items.length < 50) break;
    }
    const ok = crudos.length > 0 || ultimo?.status === 200;
    const hoteles = crudos
      .filter((h) => h && h.id && !/inact|retir|baja|elimin/i.test(String(h.estado ?? '')))
      .map((h) => this.aHotelBooking(nodo, h));
    if (!ok) this.logger.warn(`[alojamientos-socios] ${nodo.codigoNodo} no devolvió catálogo: ${ultimo?.status} ${ultimo?.error ?? ''}`);
    return {
      hoteles,
      resumen: {
        codigoNodo: nodo.codigoNodo,
        nombre: nodo.nombreProveedor,
        ok,
        status: ultimo?.status ?? 0,
        ms: Date.now() - t0,
        alojamientos: hoteles.length,
        ...(ok ? {} : { error: ultimo?.error || `HTTP ${ultimo?.status}` }),
      },
    };
  }

  /** Alojamiento del socio → mismo formato que `transformAlojamiento` de Booking. */
  aHotelBooking(nodo: ConfigProveedor, h: any, tiposHabitacion?: any[]): any {
    const id = AlojamientosSociosService.idCompuesto(nodo.codigoNodo, String(h.id));
    const fotos: any[] = h.photos || h.fotos || h.galeriaFotos || (h.imagenUrl ? [h.imagenUrl] : []);
    const photos = fotos
      .map((f: any) => (typeof f === 'string' ? { url: f, caption: h.nombre } : f?.url ? { url: f.url, caption: f.caption || h.nombre } : null))
      .filter(Boolean);
    const amenidades: string[] = Array.isArray(h.amenidades) ? h.amenidades : [];
    const gps = h.coordenadasGps || h.coordenadas || {};
    const score = num(h.scoreCalificacion ?? h.calificacion ?? h.ratings?.score);
    const politica = h.politicaCancelacion || h.politicas?.cancelacion;
    const polDesc = typeof politica === 'string' ? politica : (politica?.descripcion || h.politicas?.cancelacion || 'Cancelación gratuita hasta 48 horas antes del check-in');
    const esReem = politica?.esReembolsable !== undefined ? Boolean(politica.esReembolsable) : true;
    const horasCancel = num(politica?.horasLimiteCancelacion ?? h.politicas?.cancelacion_horas) ?? 48;
    return {
      id,
      nombre: h.nombre || h.name || 'Alojamiento',
      descripcion: h.descripcion ?? null,
      tipo_propiedad: h.tipoPropiedad || 'HOTEL',
      tipo_alojamiento: h.tipoPropiedad || null,
      destino: h.destino || h.ciudad || h.ubicacion?.ciudad || '',
      precioPorNoche: money(h.precioPorNoche ?? h.precioDesde ?? h.precio) ?? 0,
      moneda: h.moneda || h.currency || 'USD',
      capacidadAdultos: num(h.capacidadAdultos) ?? 2,
      capacidadNinos: num(h.capacidadNinos) ?? 0,
      habitaciones: num(h.habitaciones) ?? (tiposHabitacion?.length ? tiposHabitacion.reduce((acc: number, t: any) => acc + (t.cantidad || 1), 0) : 1),
      camas: extraerCamasNum(h.camas ?? h.numero_camas ?? h.numeroCamas ?? h.cantidad_camas) ?? (tiposHabitacion?.[0]?.camas ?? 1),
      descripcion_camas: inferirDescripcionCamas(h.camas ?? h.numero_camas ?? h.numeroCamas ?? h.cantidad_camas ?? tiposHabitacion?.[0]?.descripcion_camas, h.nombre, num(h.capacidadAdultos) ?? 2),
      banos: num(h.banos) ?? 1,
      tienePiscina: Boolean(h.tienePiscina) || amenidades.some((a) => /piscina|pool/i.test(a)),
      estrellas: num(h.estrellas),
      host: { id: nodo.codigoNodo, nombre: nodo.nombreProveedor },
      photos: photos.length ? photos : [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', caption: 'Vista Principal' }],
      ratings: {
        score: score ?? 0,
        limpieza: score ?? 0,
        ubicacion: score ?? 0,
        servicio: score ?? 0,
        number_of_reviews: num(h.totalResenas) ?? 0,
      },
      amenidades,
      ubicacion: {
        address: h.direccion || h.destino || '',
        city: h.destino || h.ciudad || '',
        country: h.pais || PAIS_POR_DEFECTO,
        coordinates: { latitude: num(gps.latitud ?? gps.latitude) ?? 0, longitude: num(gps.longitud ?? gps.longitude) ?? 0 },
      },
      politicas: {
        checkin_desde:
          h.politicas?.checkin_desde ||
          h.politicas?.check_in ||
          h.politicas?.checkin ||
          h.politicas?.hora_checkin ||
          h.politicas?.hora_entrada ||
          h.politicas?.entrada ||
          h.checkInPermitidoDesde ||
          h.checkin_desde ||
          h.check_in_desde ||
          h.horaCheckin ||
          h.hora_checkin ||
          h.horarioCheckIn ||
          h.horario_checkin ||
          h.checkIn ||
          h.check_in ||
          h.checkin ||
          '14:00',
        checkin_hasta:
          h.politicas?.checkin_hasta ||
          h.politicas?.check_in_hasta ||
          h.politicas?.hora_limite_checkin ||
          h.checkInPermitidoHasta ||
          h.checkin_hasta ||
          h.check_in_hasta ||
          null,
        checkout_hasta:
          h.politicas?.checkout_hasta ||
          h.politicas?.check_out ||
          h.politicas?.checkout ||
          h.politicas?.hora_checkout ||
          h.politicas?.hora_salida ||
          h.politicas?.salida ||
          h.checkOutHoraMaxima ||
          h.checkout_hasta ||
          h.check_out_hasta ||
          h.horaCheckout ||
          h.hora_checkout ||
          h.horarioCheckOut ||
          h.horario_checkout ||
          h.checkOut ||
          h.check_out ||
          h.checkout ||
          '11:00',
        cancelacion: polDesc,
        es_reembolsable: esReem,
        cancelacion_horas: horasCancel,
      },
      checkin_desde:
        h.politicas?.checkin_desde ||
        h.politicas?.check_in ||
        h.politicas?.checkin ||
        h.politicas?.hora_checkin ||
        h.politicas?.hora_entrada ||
        h.politicas?.entrada ||
        h.checkInPermitidoDesde ||
        h.checkin_desde ||
        h.check_in_desde ||
        h.horaCheckin ||
        h.hora_checkin ||
        h.horarioCheckIn ||
        h.horario_checkin ||
        h.checkIn ||
        h.check_in ||
        h.checkin ||
        '14:00',
      checkin_hasta:
        h.politicas?.checkin_hasta ||
        h.politicas?.check_in_hasta ||
        h.politicas?.hora_limite_checkin ||
        h.checkInPermitidoHasta ||
        h.checkin_hasta ||
        h.check_in_hasta ||
        null,
      checkout_hasta:
        h.politicas?.checkout_hasta ||
        h.politicas?.check_out ||
        h.politicas?.checkout ||
        h.politicas?.hora_checkout ||
        h.politicas?.hora_salida ||
        h.politicas?.salida ||
        h.checkOutHoraMaxima ||
        h.checkout_hasta ||
        h.check_out_hasta ||
        h.horaCheckout ||
        h.hora_checkout ||
        h.horarioCheckOut ||
        h.horario_checkout ||
        h.checkOut ||
        h.check_out ||
        h.checkout ||
        '11:00',
      politica_cancelacion: polDesc,
      es_reembolsable: esReem,
      estado: 'ACTIVO',
      proveedor_id: nodo.codigoNodo,
      id_externo: String(h.id),
      socio: { codigo_nodo: nodo.codigoNodo, nombre: nodo.nombreProveedor },
      ultima_sincronizacion: new Date().toISOString(),
      ...(tiposHabitacion ? { tipos_habitacion: tiposHabitacion } : {}),
      url: { web: `/alojamientos/${encodeURIComponent(id)}` },
      _links: {
        self: { href: `/api/v1/alojamientos/${encodeURIComponent(id)}`, type: 'GET' },
        reservations: { href: `/api/v1/alojamientos/${encodeURIComponent(id)}/reservations`, type: 'POST' },
      },
    };
  }

  /** Ficha del alojamiento con sus tipos de habitación, en formato Booking. */
  async detalle(idCompuesto: string): Promise<any | null> {
    const sep = AlojamientosSociosService.separarId(idCompuesto);
    if (!sep) return null;
    const nodo = await this.nodoPorCodigo(sep.nodo);
    if (!nodo) return null;
    const [r, rh] = await Promise.all([
      this.llamar(nodo, 'GET', `/alojamientos/${encodeURIComponent(sep.id)}`),
      this.llamar(nodo, 'GET', `/alojamientos/${encodeURIComponent(sep.id)}/habitaciones`),
    ]);
    if (r.status !== 200) return null;
    const h = desempacar(r.body);
    return this.aHotelBooking(nodo, { ...h, id: h?.id || sep.id }, this.tiposDesdeHabitaciones(rh, h));
  }

  /** `GET /{id}/habitaciones` (o las habitaciones de la ficha) → tipos en formato Booking. */
  private tiposDesdeHabitaciones(rh: RespuestaSocio, ficha?: any): any[] {
    const b = rh.status === 200 ? desempacar(rh.body) : null;
    const lista: any[] = Array.isArray(b) ? b : b?.habitaciones || ficha?.habitaciones || [];
    const polFicha = ficha?.politicaCancelacion;
    return lista
      .filter((t) => t && (t.codigo || t.id))
      .map((t, i) => {
        const plan = Array.isArray(t.planesTarifa) ? t.planesTarifa.find((p: any) => p.esPlanPorDefecto) || t.planesTarifa[0] : null;
        const pol = plan?.politicaCancelacion || t?.politicaCancelacion || polFicha;
        const esReembolsable = pol?.esReembolsable !== undefined
          ? Boolean(pol.esReembolsable)
          : (pol?.horasLimiteCancelacion !== undefined && pol?.horasLimiteCancelacion !== null
              ? Number(pol.horasLimiteCancelacion) > 0
              : (typeof pol?.descripcion === 'string' ? !/no reembolsable|100%/i.test(pol.descripcion) : null));
        const horas = num(pol?.horasLimiteCancelacion);
        const descPol = pol?.descripcion || (esReembolsable === false ? 'No reembolsable' : (horas !== null ? `Cancelación gratuita hasta ${horas} horas antes` : null));
        const codigo = String(t.codigo || t.id);
        const rawCamas = t.camas ?? t.numero_camas ?? t.numeroCamas ?? t.cantidad_camas;
        const numCamas = extraerCamasNum(rawCamas) ?? 1;
        const descCamas = inferirDescripcionCamas(rawCamas ?? t.descripcionCamas ?? t.descripcion_camas, t.nombre, num(t.capacidadAdultos) ?? 2);
        return {
          id: codigo,
          codigo,
          nombre: t.nombre || codigo,
          descripcion: t.descripcion ?? null,
          capacidad_adultos: num(t.capacidadAdultos) ?? 2,
          capacidad_ninos: num(t.capacidadNinos) ?? 0,
          camas: numCamas,
          descripcion_camas: descCamas,
          tamano_m2: num(t.tamanoM2 ?? t.metrosCuadrados),
          precio_noche: money(t.precioBaseNoche ?? t.precioPorNoche ?? plan?.precioBaseNoche) ?? 0,
          cantidad: num(t.habitacionesTotales ?? t.cantidad ?? t.cantidadDisponible) ?? 0,
          regimen: normalizarRegimen(plan?.regimen || t.regimen),
          regimen_texto: normalizarRegimen(plan?.regimen || t.regimen),
          cancelacion_gratuita_horas: horas,
          cancelacion_texto: descPol,
          reembolsable: esReembolsable,
          amenidades: Array.isArray(t.amenidades) ? t.amenidades : [],
          photos: [],
          activo: true,
          orden: i + 1,
        };
      });
  }

  // ───────────────────────────── Disponibilidad ─────────────────────────────

  /** Opciones (tipo × plan) del socio para unas fechas, con capacidades de /habitaciones. */
  async opciones(idCompuesto: string, checkin: string, checkout: string, adultos = 1, habitaciones = 1): Promise<{ nodo: ConfigProveedor; idSocio: string; opciones: OpcionSocio[]; respuesta: RespuestaSocio } | null> {
    const sep = AlojamientosSociosService.separarId(idCompuesto);
    if (!sep) return null;
    const nodo = await this.nodoPorCodigo(sep.nodo);
    if (!nodo) return null;
    const id = encodeURIComponent(sep.id);
    // La ocupación se pregunta con el número real de habitaciones: un socio que filtra por
    // capacidad no ofrece «4 adultos en 1 habitación» aunque sí «4 adultos en 4».
    const rooms = Math.max(1, habitaciones);
    const q = `checkin=${checkin}&checkout=${checkout}&adults=${adultos}&rooms=${rooms}`;
    const [disp, hab, fichaResp] = await Promise.all([
      this.llamar(nodo, 'GET', `/alojamientos/${id}/availability?${q}`),
      this.llamar(nodo, 'GET', `/alojamientos/${id}/habitaciones`),
      this.llamar(nodo, 'GET', `/alojamientos/${id}`),
    ]);
    let r = disp;
    if (r.status === 404 || r.status === 405) {
      const alias = await this.llamar(nodo, 'GET', `/alojamientos/${id}/disponibilidad?${q}&adultos=${adultos}`);
      if (alias.status === 200) r = alias;
    }
    const ficha = fichaResp?.status === 200 ? desempacar(fichaResp.body) : null;
    const tipos = this.tiposDesdeHabitaciones(hab, ficha);
    const porCodigo = new Map(tipos.map((t) => [t.codigo, t]));
    const b = r.status === 200 ? desempacar(r.body) : null;
    // El contrato v2.2.0 (Posada) devuelve `opciones`. Otros socios exponen la
    // disponibilidad como `tipos`/`habitaciones` (p. ej. Hábitat): se aceptan ambos.
    const lista: any[] = b?.opciones || b?.options || b?.tipos || b?.habitaciones || [];
    const opciones: OpcionSocio[] = lista
      .filter((o) => o && (o.tipoHabitacionCodigo || o.codigo))
      .map((o) => {
        const codigo = String(o.tipoHabitacionCodigo || o.codigo);
        const plan = o.planTarifaCodigo ? String(o.planTarifaCodigo) : null;
        const t = porCodigo.get(codigo);
        const remanentes = num(o.habitacionesRemanentes ?? o.available_rooms ?? o.stockDisponible) ?? 0;
        const rawCamas = o.camas ?? o.numero_camas ?? o.numeroCamas ?? o.cantidad_camas;
        const numCamas = t?.camas ?? extraerCamasNum(rawCamas) ?? 1;
        const descCamas = t?.descripcion_camas ?? inferirDescripcionCamas(rawCamas, o.nombre ?? t?.nombre, o.capacidadAdultos ?? t?.capacidad_adultos);
        return {
          productId: plan ? `${codigo}@${plan}` : codigo,
          codigo,
          plan,
          nombre: o.nombre || t?.nombre || codigo,
          remanentes,
          disponible: o.estaDisponible ?? o.disponible ?? remanentes > 0,
          precioNoche: money(o.precioNoche ?? o.precio_noche ?? o.precioBaseNoche) ?? t?.precio_noche ?? null,
          precioTotal: money(o.precioTotalEstancia ?? o.precioTotal),
          regimen: normalizarRegimen(o.regimen || t?.regimen),
          capacidadAdultos: t?.capacidad_adultos ?? num(o.capacidadAdultos) ?? null,
          capacidadNinos: t?.capacidad_ninos ?? num(o.capacidadNinos) ?? null,
          totalHabitaciones: t?.cantidad ?? num(o.total_rooms ?? o.totalHabitaciones) ?? null,
          cancelacionHoras: t?.cancelacion_gratuita_horas ?? null,
          cancelacionTexto: t?.cancelacion_texto ?? null,
          reembolsable: t?.reembolsable !== undefined && t?.reembolsable !== null
            ? t.reembolsable
            : (t?.cancelacion_gratuita_horas !== null && t?.cancelacion_gratuita_horas !== undefined ? true : null),
          camas: numCamas,
          descripcionCamas: descCamas,
          tamanoM2: t?.tamano_m2 ?? num(o.tamanoM2 ?? o.metrosCuadrados),
          amenidades: t?.amenidades ?? [],
          descripcion: t?.descripcion ?? null,
        };
      });
    this.aplicarStockGrpc(sep.nodo, sep.id, checkin, opciones);
    return { nodo, idSocio: sep.id, opciones, respuesta: r };
  }

  /**
   * Overlay opt-in de inventario en tiempo real recibido por gRPC
   * (`InventoryStockService`, puerto 50051). Un socio de alojamientos puede empujar su
   * stock con `PushStockUpdate`/`StreamInventoryChanges` usando
   * `service_id = <código de nodo>`, `item_id = <id del hotel del socio>`,
   * `date = <checkin YYYY-MM-DD>` y `time_slot = <código del tipo de habitación>`.
   *
   * Solo pisa el cupo que vino en vivo por REST cuando existe un push para esa tupla
   * exacta; si el socio no empuja nada, el REST en vivo (fuente de verdad) queda intacto.
   * Esto deja evidencia de la vertical en el canal de eventos gRPC sin arriesgar sobreventa.
   */
  private aplicarStockGrpc(nodoCodigo: string, idSocio: string, fecha: string, opciones: OpcionSocio[]): void {
    if (!this.inventory || opciones.length === 0) return;
    let registros;
    try {
      registros = this.inventory.getInventory(idSocio, fecha, nodoCodigo);
    } catch (e: any) {
      this.logger.debug?.(`Overlay gRPC omitido (${nodoCodigo}~${idSocio}): ${e?.message}`);
      return;
    }
    if (!registros || registros.length === 0) return;
    const porTipo = new Map<string, number>(registros.map((s: any) => [String(s.time_slot), Number(s.available_units)]));
    for (const o of opciones) {
      const push = porTipo.get(o.codigo);
      if (push === undefined || Number.isNaN(push)) continue;
      const tope = o.totalHabitaciones ?? push;
      o.remanentes = Math.max(0, Math.min(tope, push));
      o.disponible = o.remanentes > 0;
    }
    this.logger.log(`Overlay gRPC aplicado a ${nodoCodigo}~${idSocio} (${porTipo.size} tipo(s), fecha ${fecha}).`);
  }

  /** Mismo formato que `AlojamientosService.getAvailability` (GET /{id}/availability). */
  disponibilidadBooking(idCompuesto: string, checkin: string, checkout: string, opciones: OpcionSocio[]) {
    // Un tipo con varios planes comparte el cupo: se cuenta una vez por tipo físico de habitación.
    // Si el socio devuelve varios planes tarifarios de la misma habitación (p. ej. solo alojamiento
    // vs con desayuno), ambos reflejan el MISMO inventario disponible y no deben sumarse.
    const porTipo = new Map<string, OpcionSocio>();
    for (const o of opciones) {
      const codBase = (o.codigo ? o.codigo.split('@')[0].trim().toLowerCase() : '');
      const nombreNorm = (o.nombre || '').trim().toLowerCase();
      const existente = [...porTipo.entries()].find(([k, v]) =>
        (codBase && k === codBase) || (nombreNorm && (v.nombre || '').trim().toLowerCase() === nombreNorm)
      );
      if (!existente) {
        porTipo.set(codBase || nombreNorm || o.codigo, { ...o });
      }
    }
    const tipos = [...porTipo.values()].map((o) => {
      const total = Math.max(o.totalHabitaciones ?? o.remanentes, o.remanentes);
      return {
        id: o.codigo,
        codigo: o.codigo,
        nombre: o.nombre,
        precio_noche: o.precioNoche ?? 0,
        total_rooms: total,
        reserved_rooms: Math.max(0, total - o.remanentes),
        available_rooms: o.remanentes,
      };
    });
    const libres = tipos.reduce((s, t) => s + t.available_rooms, 0);
    const total = tipos.reduce((s, t) => s + t.total_rooms, 0);
    const conCupo = tipos.filter((t) => t.available_rooms > 0);
    const precios = (conCupo.length ? conCupo : tipos).map((t) => t.precio_noche).filter((p) => p > 0);
    return {
      alojamiento_id: idCompuesto,
      date: checkin,
      checkin,
      checkout,
      total_rooms: total,
      reserved_rooms: Math.max(0, total - libres),
      available_rooms: libres,
      price_per_night: precios.length ? Math.min(...precios) : 0,
      checkin_times: ['14:00', '15:00', '16:00'],
      is_available: libres > 0,
      tipos,
      fuente: 'SOCIO',
    };
  }

  /** Productos con el formato de `POST /alojamientos/availability` de Booking. */
  productosBooking(opciones: OpcionSocio[], noches: number, moneda: string, adultos: number, ninos: number, habitaciones: number) {
    return opciones
      .filter((o) => o.disponible && o.remanentes >= habitaciones)
      .filter((o) => o.capacidadAdultos === null || adultos <= o.capacidadAdultos * habitaciones)
      .filter((o) => o.capacidadNinos === null || ninos <= Math.max(o.capacidadNinos, 0) * habitaciones || ninos === 0)
      .sort((a, b) => (a.precioTotal ?? Infinity) - (b.precioTotal ?? Infinity))
      .map((o) => {
        const porNoche = o.precioNoche ?? (o.precioTotal !== null ? o.precioTotal / Math.max(noches, 1) : 0);
        const total = o.precioTotal !== null ? o.precioTotal * habitaciones : porNoche * noches * habitaciones;
        return {
          product_id: o.productId,
          tipo_habitacion_id: o.productId,
          codigo: o.codigo,
          plan_tarifa: o.plan,
          room_name: o.nombre,
          descripcion: null,
          meal_plan: normalizarRegimen(o.regimen),
          regimen: normalizarRegimen(o.regimen),
          cancellation_type: o.cancelacionHoras !== null
            ? `Cancelación gratuita hasta ${o.cancelacionHoras} horas antes`
            : 'Cancelación gratuita hasta 48 horas antes',
          reembolsable: true,
          cancelacion_gratuita_horas: o.cancelacionHoras ?? 48,
          cancelacion_texto: o.cancelacionHoras !== null
            ? `Cancelación gratuita hasta ${o.cancelacionHoras} horas antes`
            : 'Cancelación gratuita hasta 48 horas antes',
          price: Number(total.toFixed(2)),
          price_per_night: Number(porNoche.toFixed(2)),
          // El socio cotiza con impuestos (IVA + tasa municipal): el total es el que se cobra.
          impuestos_incluidos: o.precioTotal !== null,
          currency: moneda,
          available_rooms: o.remanentes,
          capacidad: { adultos: o.capacidadAdultos ?? 2, ninos: o.capacidadNinos ?? 0 },
          camas: o.camas ?? 1,
          descripcion_camas: o.descripcionCamas ?? (o.camas === 1 ? '1 cama' : `${o.camas ?? 1} camas`),
          tamano_m2: o.tamanoM2 ?? null,
          amenidades: o.amenidades ?? [],
          photos: [],
        };
      });
  }

  // ───────────────────────────── Clientes (Flujo 2) ─────────────────────────────

  /**
   * Busca al huésped en el socio (`GET /clientes?email&identificacion`) y, si no
   * existe, lo crea (`POST /clientes`). Devuelve su `client_id` en el socio, o
   * null si el socio aún no implementa `/clientes` (no se inventa uno).
   */
  async sincronizarCliente(
    nodo: ConfigProveedor,
    c: { nombre: string; email: string; identificacion: string; telefono?: string | null },
    correlationId?: string,
  ): Promise<{ clientId: string | null; origen: 'EXISTENTE' | 'CREADO' | 'NO_SOPORTADO' | 'ERROR' }> {
    const q = `email=${encodeURIComponent(c.email)}&identificacion=${encodeURIComponent(c.identificacion)}`;
    const g = await this.llamar(nodo, 'GET', `/clientes?${q}`, { correlationId });
    const extraer = (b: any): string | null => {
      const v = Array.isArray(b) ? b[0] : Array.isArray(b?.data) ? b.data[0] : desempacar(b);
      const id = v?.client_id ?? v?.clientId ?? v?.id;
      return id ? String(id) : null;
    };
    if (g.status === 200) {
      const id = extraer(g.body);
      if (id) return { clientId: id, origen: 'EXISTENTE' };
    }
    const p = await this.llamar(nodo, 'POST', '/clientes', {
      correlationId,
      body: { nombre: c.nombre, email: c.email, identificacion: c.identificacion, telefono: c.telefono || undefined },
    });
    if (p.status === 200 || p.status === 201) {
      const id = extraer(p.body);
      if (id) return { clientId: id, origen: 'CREADO' };
    }
    if ([404, 405, 501].includes(g.status) && [404, 405, 501].includes(p.status)) return { clientId: null, origen: 'NO_SOPORTADO' };
    return { clientId: null, origen: 'ERROR' };
  }

  // ───────────────────────────── Reseñas ─────────────────────────────

  /**
   * Reseñas reales del socio (`GET /alojamientos/{id}/resenas`), mapeadas al formato que
   * usa el frontend. No se inventan: si el socio no las expone, devuelve vacío.
   */
  async resenas(idCompuesto: string): Promise<{ resenas: any[]; scores: any; total: number }> {
    const vacio = { resenas: [], scores: { limpieza: 0, servicio: 0, calidad: 0, general: 0 }, total: 0 };
    const sep = AlojamientosSociosService.separarId(idCompuesto);
    if (!sep) return vacio;
    const nodo = await this.nodoPorCodigo(sep.nodo);
    if (!nodo) return vacio;
    const r = await this.llamar(nodo, 'GET', `/alojamientos/${encodeURIComponent(sep.id)}/resenas`);
    if (r.status !== 200) return vacio;
    const b: any = desempacar(r.body) || {};
    const lista: any[] = b.resenas || b.reviews || b.data || [];
    const resenas = lista.map((x: any) => ({
      usuarioNombre: x.autorNombre || x.usuarioNombre || x.autor || x.author || 'Huésped',
      usuarioPais: x.pais || x.usuarioPais || x.country || null,
      comentario: x.comentario || x.comment || x.texto || '',
      puntuacion: num(x.calificacionGlobal ?? x.puntuacion ?? x.calificacion ?? x.score ?? x.rating) ?? 0,
      fecha: x.fecha || x.date || x.createdAt || null,
      tipoHabitacion: x.tipoHabitacionAlojado || x.tipoHabitacion || null,
      verificada: x.estadiaVerificada ?? x.verificada ?? null,
    }));
    const prom = num(b.scorePromedio ?? b.score ?? b.scoreCalificacion ?? b.promedio);
    const general = prom ?? (resenas.length ? Number((resenas.reduce((a, c) => a + c.puntuacion, 0) / resenas.length).toFixed(1)) : 0);
    return {
      resenas,
      scores: { limpieza: general, servicio: general, calidad: general, general },
      total: num(b.totalResenas ?? b.total) ?? resenas.length,
    };
  }
}
