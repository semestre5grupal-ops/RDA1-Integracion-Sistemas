/**
 * Agregador de socios de alojamientos: catálogo en vivo, reserva/cancelación
 * reenviadas al socio (Saga), concurrencia, idempotencia y check-in.
 *
 * El socio simulado sigue el contrato `contracts/alojamientos-openapi-v2.yaml`:
 * cupo por tipo, Idempotency-Key (misma clave + mismo cuerpo → misma orden,
 * cuerpo distinto → 422), 409 OUT_OF_STOCK, cancelación idempotente y /clientes.
 */
import { randomUUID } from 'node:crypto';
import { AlojamientosSociosService } from './alojamientos-socios.service';
import { AlojamientosSociosReservasService, ESTADO_ASISTIDO, ESTADO_CANCELADO, ESTADO_RESERVADO } from './alojamientos-socios-reservas.service';

// ─── Socio simulado ────────────────────────────────────────────────────────────
interface Orden { orderId: string; external_order_id: string; codigoReserva: string; estado: string; tipo: string; rooms: number; key: string; huella: string; total: string }

class SocioFalso {
  cupo: Record<string, number> = { HABITACION_ESTANDAR: 2, SUITE_FAMILIAR: 1 };
  ordenes: Orden[] = [];
  porClave = new Map<string, Orden>();
  clientes: { client_id: string; email: string; identificacion: string }[] = [];
  soportaClientes = true;
  /** Simula que el socio guarda la orden pero la respuesta se pierde (timeout). */
  perderRespuestaDeCreate = false;
  llamadasCreate = 0;
  hoteles = [{ id: 'HTL-1', nombre: 'Hotel Uno', destino: 'Quito', precioPorNoche: '65.00', fotos: ['https://x/1.jpg'], estado: 'ACTIVO' }];

  constructor(readonly nombre: string) {}

  libres(tipo: string) {
    const usadas = this.ordenes.filter((o) => o.tipo === tipo && o.estado !== 'CANCELLED').reduce((s, o) => s + o.rooms, 0);
    return this.cupo[tipo] - usadas;
  }

  /** Reserva directa en la web del socio (fuera de Booking). */
  reservarDirecto(tipo: string, rooms = 1) {
    const id = randomUUID();
    this.ordenes.push({ orderId: id, external_order_id: `ORD-HTL-${id.slice(0, 6).toUpperCase()}`, codigoReserva: 'BK-HOTEL-DIRECTO', estado: 'CONFIRMED', tipo, rooms, key: id, huella: '', total: '0' });
  }

  async atender(metodo: string, url: URL, headers: Record<string, string>, body: any): Promise<{ status: number; body: any }> {
    const p = url.pathname.replace(/^\/api\/v2/, '');
    if (metodo === 'GET' && p === '/alojamientos') return { status: 200, body: { metadata: { has_next: false }, data: this.hoteles } };
    if (metodo === 'GET' && p === '/alojamientos/HTL-1') return { status: 200, body: this.hoteles[0] };
    if (metodo === 'GET' && p === '/alojamientos/HTL-1/habitaciones') {
      return {
        status: 200,
        body: {
          habitaciones: [
            { codigo: 'HABITACION_ESTANDAR', nombre: 'Estándar', capacidadAdultos: 2, capacidadNinos: 0, precioBaseNoche: '65.00', habitacionesTotales: this.cupo.HABITACION_ESTANDAR },
            { codigo: 'SUITE_FAMILIAR', nombre: 'Suite', capacidadAdultos: 4, capacidadNinos: 2, precioBaseNoche: '110.00', habitacionesTotales: this.cupo.SUITE_FAMILIAR },
          ],
        },
      };
    }
    if (metodo === 'GET' && p === '/alojamientos/HTL-1/availability') {
      return {
        status: 200,
        body: {
          opciones: Object.keys(this.cupo).map((t) => ({
            tipoHabitacionCodigo: t,
            nombre: t,
            estaDisponible: this.libres(t) > 0,
            habitacionesRemanentes: this.libres(t),
            precioNoche: t === 'SUITE_FAMILIAR' ? '110.00' : '65.00',
            precioTotalEstancia: t === 'SUITE_FAMILIAR' ? '257.00' : '153.50',
          })),
        },
      };
    }
    if (metodo === 'POST' && p === '/alojamientos/availability') {
      if (this.libres(body.tipoHabitacionCodigo) < (body.cantidadHabitaciones || 1)) return { status: 409, body: { code: 'OUT_OF_STOCK' } };
      const total = (body.tipoHabitacionCodigo === 'SUITE_FAMILIAR' ? 257 : 153.5) * (body.cantidadHabitaciones || 1);
      return { status: 200, body: { precioTotalCotizado: total.toFixed(2), cotizacionId: randomUUID() } };
    }
    if (metodo === 'POST' && p === '/alojamientos/orders/create') {
      this.llamadasCreate++;
      const key = headers['Idempotency-Key'];
      if (!key) return { status: 400, body: { code: 'VALIDATION_FAILED' } };
      const huella = JSON.stringify({ ...body, cotizacionId: undefined });
      const previa = this.porClave.get(key);
      if (previa) return previa.huella === huella ? { status: 201, body: previa } : { status: 422, body: { code: 'IDEMPOTENCY_KEY_REUSED' } };
      if (!body.huespedTitular?.identificacion) return { status: 400, body: { code: 'VALIDATION_FAILED' } };
      const rooms = body.cantidadHabitaciones || 1;
      if (this.libres(body.tipoHabitacionCodigo) < rooms) return { status: 409, body: { code: 'OUT_OF_STOCK', detail: 'Sin cupo' } };
      const id = randomUUID();
      const o: Orden = { orderId: id, external_order_id: `ORD-HTL-${id.slice(0, 6).toUpperCase()}`, codigoReserva: `BK-HOTEL-${id.slice(9, 13).toUpperCase()}`, estado: 'CONFIRMED', tipo: body.tipoHabitacionCodigo, rooms, key, huella, total: body.totalPagar };
      this.ordenes.push(o);
      this.porClave.set(key, o);
      if (this.perderRespuestaDeCreate) return { status: 0, body: null };
      return { status: 201, body: o };
    }
    if (metodo === 'GET' && p === '/alojamientos/orders') {
      const k = url.searchParams.get('idempotency_key');
      return { status: 200, body: { data: this.ordenes.filter((o) => o.key === k) } };
    }
    const mc = p.match(/^\/alojamientos\/orders\/([^/]+)\/cancel$/);
    if (metodo === 'POST' && mc) {
      const o = this.ordenes.find((x) => [x.orderId, x.external_order_id, x.codigoReserva].includes(decodeURIComponent(mc[1])));
      if (!o) return { status: 404, body: { code: 'NOT_FOUND' } };
      const ya = o.estado === 'CANCELLED';
      o.estado = 'CANCELLED';
      return { status: 200, body: { orderId: o.orderId, estado: 'CANCELLED', codigoReembolso: 'REF-HTL-00001', montoReembolsado: o.total, yaCancelada: ya } };
    }
    if (p === '/clientes') {
      if (!this.soportaClientes) return { status: 404, body: { code: 'NOT_FOUND' } };
      if (metodo === 'GET') {
        const c = this.clientes.find((x) => x.email === url.searchParams.get('email') || x.identificacion === url.searchParams.get('identificacion'));
        return c ? { status: 200, body: c } : { status: 404, body: { code: 'NOT_FOUND' } };
      }
      const c = { client_id: `CLI-${this.clientes.length + 1}`, email: body.email, identificacion: body.identificacion };
      this.clientes.push(c);
      return { status: 201, body: { client_id: c.client_id } };
    }
    return { status: 404, body: { code: 'NOT_FOUND' } };
  }
}

// ─── Base de datos mínima (solo las consultas del servicio) ──────────────────────
class BaseFalsa {
  filas: any[] = [];
  fallarInsert = false;
  isInitialized = true;
  async query(sql: string, p: any[] = []): Promise<any[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE') || s.includes('clientes_socios_mapeo')) return [];
    if (s.startsWith('SELECT * FROM schema_alojamientos.alojamientos_reservas_socio WHERE idempotency_key')) return this.filas.filter((f) => f.idempotency_key === p[0]);
    if (s.startsWith('SELECT * FROM schema_alojamientos.alojamientos_reservas_socio WHERE id = $1')) return this.filas.filter((f) => f.id === p[0]);
    if (s.includes('WHERE id::text = $1 OR codigo_reserva = $1')) {
      return this.filas.filter((f) => [f.id, f.codigo_reserva, f.order_id_socio, f.external_order_id, f.codigo_reserva_socio].includes(p[0])).slice(0, 1);
    }
    if (s.startsWith('INSERT INTO schema_alojamientos.alojamientos_reservas_socio')) {
      await new Promise((r) => setTimeout(r, 5));
      if (this.fallarInsert) throw new Error('conexión perdida');
      if (this.filas.some((f) => f.idempotency_key === p[21])) throw new Error('duplicate key value violates unique constraint');
      const nombres = ['codigo_reserva', 'codigo_nodo', 'alojamiento_id_socio', 'alojamiento_nombre', 'destino', 'foto_url', 'tipo_codigo', 'tipo_nombre', 'plan_tarifa', 'checkin', 'checkout', 'noches', 'habitaciones', 'adultos', 'ninos', 'total', 'moneda', 'estado', 'order_id_socio', 'external_order_id', 'codigo_reserva_socio', 'idempotency_key', 'usuario_id', 'cliente_nombre', 'cliente_email', 'cliente_telefono', 'documento_tipo', 'documento_numero', 'external_client_id', 'peticiones_especiales', 'correlation_id', 'respuesta_socio'];
      const f: any = { id: randomUUID(), creado_en: new Date() };
      nombres.forEach((n, i) => (f[n] = p[i]));
      this.filas.push(f);
      return [f];
    }
    if (s.startsWith('UPDATE') && s.includes('motivo_cancelacion')) {
      const f = this.filas.find((x) => x.id === p[0]);
      Object.assign(f, { estado: p[1], motivo_cancelacion: p[2], codigo_reembolso: p[3], monto_reembolsado: p[4], cancelada_en: new Date() });
      return [f];
    }
    if (s.startsWith('UPDATE') && s.includes('checkin_at')) {
      const f = this.filas.find((x) => x.id === p[0]);
      Object.assign(f, { estado: p[1], checkin_at: p[2] || new Date(), checkin_admin: p[3] });
      return [f];
    }
    if (s.includes('ORDER BY creado_en DESC')) return [...this.filas].reverse();
    throw new Error(`Consulta no simulada: ${s.slice(0, 80)}`);
  }
}

// ─── Montaje ───────────────────────────────────────────────────────────────────
const nodo = (codigo: string, clave: string, extra: any = {}) => ({
  codigoNodo: codigo,
  nombreProveedor: `Hotel ${codigo}`,
  vertical: 'ALOJAMIENTOS',
  baseUrlRest: `https://${codigo.toLowerCase()}.test/api/v2`,
  apiKey: clave,
  killSwitchActivo: false,
  ...extra,
});

function montar() {
  const posada = new SocioFalso('posada');
  const kawsay = new SocioFalso('kawsay');
  kawsay.hoteles = [{ id: 'KW-1', nombre: 'Kawsay', destino: 'Cuenca', precioPorNoche: '120.00', fotos: [], estado: 'ACTIVO' }];
  const nodos = [nodo('NODE_ALO_PEC', 'clave-pec'), nodo('NODE_ALO_KAWSAY', 'clave-kw'), nodo('NODE_ALO_APAGADO', 'x', { killSwitchActivo: true })];
  const repo: any = {
    find: async () => nodos,
    findOne: async ({ where }: any) => nodos.find((n) => n.apiKey === where.apiKey) ?? null,
  };
  const enviadas: { url: string; headers: Record<string, string>; body: any }[] = [];
  class Servicio extends AlojamientosSociosService {
    protected async fetch(url: string, init: RequestInit): Promise<Response> {
      const u = new URL(url);
      const socio = u.host.startsWith('node_alo_pec') ? posada : u.host.startsWith('node_alo_kawsay') ? kawsay : null;
      const headers = (init.headers || {}) as Record<string, string>;
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      enviadas.push({ url, headers, body });
      if (!socio) throw new Error('host desconocido');
      const r = await socio.atender(String(init.method), u, headers, body);
      if (r.status === 0) {
        const e: any = new Error('timeout');
        e.name = 'TimeoutError';
        throw e;
      }
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }
  }
  process.env.ALOJAMIENTOS_SOCIOS_CACHE_MS = '0';
  const socios = new Servicio(repo);
  const db = new BaseFalsa();
  const reservas = new AlojamientosSociosReservasService(socios, db as any);
  return { posada, kawsay, socios, reservas, db, enviadas };
}

const datos = (extra: any = {}) => ({
  idCompuesto: 'NODE_ALO_PEC~HTL-1',
  checkin: '2027-03-10',
  checkout: '2027-03-12',
  habitaciones: 1,
  adultos: 1,
  ninos: 0,
  productId: 'HABITACION_ESTANDAR',
  nombre: 'Ana Pérez',
  email: 'ana@example.com',
  telefono: '+593 99 123 4567',
  documentoTipo: 'CEDULA',
  documentoNumero: '1710034065',
  idempotencyKey: randomUUID(),
  usuarioId: null,
  ...extra,
});

// ─── Pruebas ───────────────────────────────────────────────────────────────────
describe('AlojamientosSociosService (catálogo y disponibilidad en vivo)', () => {
  it('reúne el catálogo de todos los socios activos con ids NODO~id y omite el nodo apagado', async () => {
    const { socios } = montar();
    const { hoteles, fuentes } = await socios.catalogo();
    expect(hoteles.map((h) => h.id).sort()).toEqual(['NODE_ALO_KAWSAY~KW-1', 'NODE_ALO_PEC~HTL-1']);
    expect(fuentes.map((f) => f.codigoNodo)).not.toContain('NODE_ALO_APAGADO');
    expect(hoteles.find((h) => h.id === 'NODE_ALO_PEC~HTL-1')).toMatchObject({ nombre: 'Hotel Uno', precioPorNoche: 65, proveedor_id: 'NODE_ALO_PEC', id_externo: 'HTL-1' });
  });

  it('un alojamiento nuevo en el socio aparece en la siguiente consulta (Flujo 1, paso 2)', async () => {
    const { socios, posada } = montar();
    expect((await socios.catalogo()).hoteles).toHaveLength(2);
    posada.hoteles.push({ id: 'HTL-NUEVO', nombre: 'Nuevo', destino: 'Baños', precioPorNoche: '40.00', fotos: [], estado: 'ACTIVO' });
    socios.invalidarCatalogo();
    expect((await socios.catalogo()).hoteles.map((h) => h.id)).toContain('NODE_ALO_PEC~HTL-NUEVO');
  });

  it('si un socio cae, los demás siguen apareciendo', async () => {
    const { socios, kawsay } = montar();
    kawsay.atender = async () => ({ status: 503, body: {} });
    const { hoteles, fuentes } = await socios.catalogo();
    expect(hoteles.map((h) => h.id)).toEqual(['NODE_ALO_PEC~HTL-1']);
    expect(fuentes.find((f) => f.codigoNodo === 'NODE_ALO_KAWSAY')?.ok).toBe(false);
  });

  it('la disponibilidad que muestra Booking es la del socio (sin copia local)', async () => {
    const { socios, posada } = montar();
    posada.reservarDirecto('HABITACION_ESTANDAR');
    const d = await socios.opciones('NODE_ALO_PEC~HTL-1', '2027-03-10', '2027-03-12');
    const b = socios.disponibilidadBooking('NODE_ALO_PEC~HTL-1', '2027-03-10', '2027-03-12', d!.opciones);
    expect(b.tipos.find((t) => t.codigo === 'HABITACION_ESTANDAR')).toMatchObject({ total_rooms: 2, available_rooms: 1 });
  });

  it('ids: separa NODO~id y rechaza lo que no es un nodo', () => {
    expect(AlojamientosSociosService.separarId('NODE_ALO_PEC~HTL-1')).toEqual({ nodo: 'NODE_ALO_PEC', id: 'HTL-1' });
    expect(AlojamientosSociosService.separarId('NODE_ALO_PEC%7EHTL-1')).toEqual({ nodo: 'NODE_ALO_PEC', id: 'HTL-1' });
    expect(AlojamientosSociosService.separarId('pec-htl-1001')).toBeNull();
    expect(AlojamientosSociosService.separarId('HACK~x')).toBeNull();
  });
});

describe('AlojamientosSociosReservasService (Saga hacia el socio)', () => {
  it('reserva en el socio con la MISMA Idempotency-Key, guarda la copia RESERVADO y el socio descuenta cupo', async () => {
    const { reservas, posada, enviadas } = montar();
    const d = datos();
    const r = await reservas.reservar(d);
    expect(r.status).toBe(ESTADO_RESERVADO);
    expect(r.alojamiento_id).toBe('NODE_ALO_PEC~HTL-1');
    expect(r.socio.external_order_id).toMatch(/^ORD-HTL-/);
    expect(posada.libres('HABITACION_ESTANDAR')).toBe(1);
    const create = enviadas.find((e) => e.url.endsWith('/orders/create'))!;
    expect(create.headers['Idempotency-Key']).toBe(d.idempotencyKey);
    expect(create.headers['X-API-Key']).toBe('clave-pec');
    expect(create.body.huespedTitular).toMatchObject({ tipoDocumento: 'CEDULA', identificacion: '1710034065', telefono: '+593991234567' });
    expect(create.headers['X-Client-Id']).toBe('CLI-1');
  });

  it('caso del compañero: si el hotel ya vendió la habitación por su web, Booking responde 409 y no guarda nada', async () => {
    const { reservas, posada, db } = montar();
    posada.reservarDirecto('SUITE_FAMILIAR'); // la única suite
    await expect(reservas.reservar(datos({ productId: 'SUITE_FAMILIAR' }))).rejects.toMatchObject({ status: 409 });
    expect(db.filas).toHaveLength(0);
  });

  it('doble clic (misma clave en paralelo): una sola orden en el socio y la misma reserva', async () => {
    const { reservas, posada } = montar();
    const d = datos();
    const [a, b] = await Promise.all([reservas.reservar(d), reservas.reservar({ ...d })]);
    expect(a.reservation_id).toBe(b.reservation_id);
    expect(posada.ordenes).toHaveLength(1);
    expect(posada.libres('HABITACION_ESTANDAR')).toBe(1);
  });

  it('reintento tras corte de red: devuelve la misma reserva sin volver a pedirla al socio', async () => {
    const { reservas, posada } = montar();
    const d = datos();
    const a = await reservas.reservar(d);
    const llamadas = posada.llamadasCreate;
    const b = await reservas.reservar({ ...d });
    expect(b.reservation_id).toBe(a.reservation_id);
    expect(b.idempotent_replayed).toBe(true);
    expect(posada.llamadasCreate).toBe(llamadas);
  });

  it('dos clientes por la última habitación al mismo tiempo: uno confirma, el otro recibe 409', async () => {
    const { reservas, posada } = montar();
    const res = await Promise.allSettled([
      reservas.reservar(datos({ productId: 'SUITE_FAMILIAR', email: 'a@x.ec' })),
      reservas.reservar(datos({ productId: 'SUITE_FAMILIAR', email: 'b@x.ec', documentoNumero: '0102030405' })),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((res.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
    expect(posada.libres('SUITE_FAMILIAR')).toBe(0);
  });

  it('timeout después de que el socio guardó la orden: se recupera por idempotency_key, sin duplicar', async () => {
    const { reservas, posada } = montar();
    posada.perderRespuestaDeCreate = true;
    const r = await reservas.reservar(datos());
    expect(r.status).toBe(ESTADO_RESERVADO);
    expect(posada.ordenes).toHaveLength(1);
  });

  it('sin documento del titular: 400 antes de llamar al socio', async () => {
    const { reservas, posada } = montar();
    await expect(reservas.reservar(datos({ documentoNumero: '' }))).rejects.toMatchObject({ status: 400 });
    expect(posada.llamadasCreate).toBe(0);
  });

  it('si la copia local no se puede guardar, compensa cancelando en el socio (Saga)', async () => {
    const { reservas, posada, db } = montar();
    db.fallarInsert = true;
    await expect(reservas.reservar(datos())).rejects.toMatchObject({ status: 503 });
    expect(posada.ordenes[0].estado).toBe('CANCELLED');
    expect(posada.libres('HABITACION_ESTANDAR')).toBe(2);
  });

  it('cancelar desde Booking cancela en el socio, libera el cupo y es idempotente', async () => {
    const { reservas, posada } = montar();
    const r = await reservas.reservar(datos());
    const c = await reservas.cancelar(r.reservation_id, 'Cambio de planes');
    expect(c.status).toBe(ESTADO_CANCELADO);
    expect(c.reembolso.codigo).toBe('REF-HTL-00001');
    expect(posada.libres('HABITACION_ESTANDAR')).toBe(2);
    const otra = await reservas.cancelar(r.reservation_id);
    expect(otra.ya_cancelada).toBe(true);
  });

  it('un id que no es de socio no se toca (lo atiende el flujo local)', async () => {
    const { reservas } = montar();
    expect(await reservas.cancelar(randomUUID())).toBeNull();
  });
});

describe('Clientes cross-platform y check-in (Flujo 2)', () => {
  it('no duplica al huésped: si ya existe en el socio, reutiliza su client_id', async () => {
    const { reservas, posada } = montar();
    posada.clientes.push({ client_id: 'CLI-EXISTE', email: 'ana@example.com', identificacion: '1710034065' });
    const r = await reservas.reservar(datos());
    expect(r.socio.client_id).toBe('CLI-EXISTE');
    expect(posada.clientes).toHaveLength(1);
  });

  it('si el socio aún no tiene /clientes, reserva igual y no inventa un client_id', async () => {
    const { reservas, posada } = montar();
    posada.soportaClientes = false;
    const r = await reservas.reservar(datos());
    expect(r.status).toBe(ESTADO_RESERVADO);
    expect(r.socio.client_id).toBeNull();
  });

  it('el socio dueño confirma la llegada con su external_order_id → CONFIRMADO_ASISTIDO', async () => {
    const { reservas } = montar();
    const r = await reservas.reservar(datos());
    const f = await reservas.marcarCheckin(r.socio.external_order_id, 'clave-pec', { admin: 'recepcionista-hotel' });
    expect(f.estado).toBe(ESTADO_ASISTIDO);
    expect(f.checkin_admin).toBe('recepcionista-hotel');
    await expect(reservas.cancelar(r.reservation_id)).rejects.toMatchObject({ status: 409 });
  });

  it('otro socio (u otra clave) no puede marcar el check-in: 401', async () => {
    const { reservas } = montar();
    const r = await reservas.reservar(datos());
    await expect(reservas.marcarCheckin(r.socio.external_order_id, 'clave-kw', {})).rejects.toMatchObject({ status: 401 });
    await expect(reservas.marcarCheckin(r.socio.external_order_id, undefined, {})).rejects.toMatchObject({ status: 401 });
  });

  it('una reserva cancelada no admite check-in: 409', async () => {
    const { reservas } = montar();
    const r = await reservas.reservar(datos());
    await reservas.cancelar(r.reservation_id);
    await expect(reservas.marcarCheckin(r.codigo_reserva, 'clave-pec', {})).rejects.toMatchObject({ status: 409 });
  });

  it('una referencia desconocida devuelve null (el receptor sigue con las otras verticales)', async () => {
    const { reservas } = montar();
    expect(await reservas.marcarCheckin('NO-EXISTE', 'clave-pec', {})).toBeNull();
  });
});
