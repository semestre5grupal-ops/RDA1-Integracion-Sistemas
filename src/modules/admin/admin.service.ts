import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createClient } from '@supabase/supabase-js';
import { Reserva } from '../vuelos/entities/reserva.entity';
import { OrderAuto } from '../autos/entities/order-auto.entity';
import { ReservaAtraccion } from '../atracciones/entities/reserva.entity';
import { ReservaAlojamiento } from '../alojamientos/entities/reserva.entity';
import { Alojamiento } from '../alojamientos/entities/alojamiento.entity';
import { PAGADAS as ESTADOS_COBRADOS } from './admin-finanzas.service';
import { AlojamientosService } from '../alojamientos/alojamientos.service';
import { randomUUID } from 'crypto';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import { ADMIN_EMAILS } from '../../core/auth/administradores';
export { ADMIN_EMAILS };

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly supabase;

  constructor(
    @InjectRepository(Reserva)
    private readonly reservaRepo: Repository<Reserva>,
    @InjectRepository(OrderAuto)
    private readonly orderAutoRepo: Repository<OrderAuto>,
    @InjectRepository(ReservaAtraccion)
    private readonly reservaAtraccionRepo: Repository<ReservaAtraccion>,
    @InjectRepository(ReservaAlojamiento)
    private readonly reservaAlojamientoRepo: Repository<ReservaAlojamiento>,
    @InjectRepository(Alojamiento)
    private readonly alojamientoRepo: Repository<Alojamiento>,
    private readonly dataSource: DataSource,
    private readonly alojamientosService: AlojamientosService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
  }

  /** Reservas de hospedaje guardadas en la BD (locales y de socios) con el nombre del alojamiento. */
  private async reservasHospedaje(take?: number) {
    const [reservasLocales, reservasSocios] = await Promise.all([
      this.reservaAlojamientoRepo
        .find({ order: { createdAt: 'DESC' }, ...(take ? { take } : {}) })
        .catch((e) => { this.logger.error(`Error hospedaje local: ${e.message}`); return [] as ReservaAlojamiento[]; }),
      this.dataSource.query(
        `SELECT id, codigo_reserva, codigo_nodo, alojamiento_id_socio, alojamiento_nombre, destino,
                tipo_codigo, tipo_nombre, checkin, checkout, total, moneda, estado, order_id_socio,
                external_order_id, codigo_reserva_socio, usuario_id, cliente_nombre, cliente_email,
                cliente_telefono, creado_en
           FROM schema_alojamientos.alojamientos_reservas_socio
          ORDER BY creado_en DESC ${take ? `LIMIT ${take}` : 'LIMIT 100'}`,
      ).catch((e) => { this.logger.error(`Error hospedaje socios: ${e.message}`); return [] as any[]; }),
    ]);

    const ids = [...new Set(reservasLocales.map((r) => r.alojamientoId).filter(Boolean))];
    const nombres = new Map<string, string>();
    if (ids.length) {
      const alojs = await this.alojamientoRepo.find({ where: ids.map((id) => ({ id })) as any }).catch(() => [] as Alojamiento[]);
      alojs.forEach((a: any) => nombres.set(String(a.id), a.nombre));
    }

    const aFechaIso = (v: any): string | null => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    };

    const listaLocales = reservasLocales.map((r) => ({
      ...r,
      nombreAlojamiento: nombres.get(String(r.alojamientoId)) || null,
      socio: false,
      checkin: aFechaIso(r.checkin),
      checkout: aFechaIso(r.checkout),
    }));

    const listaSocios = (reservasSocios || []).map((s: any) => ({
      id: s.id,
      codigoReserva: s.codigo_reserva,
      status: s.estado,
      total: Number(s.total || 0),
      totalPrice: { total: Number(s.total || 0), currency: s.moneda || 'USD' },
      createdAt: s.creado_en,
      customerName: s.cliente_nombre,
      customerEmail: s.cliente_email,
      nombreAlojamiento: s.alojamiento_nombre,
      alojamientoId: `${s.codigo_nodo}~${s.alojamiento_id_socio}`,
      checkin: aFechaIso(s.checkin),
      checkout: aFechaIso(s.checkout),
      socio: true,
      codigoNodo: s.codigo_nodo,
    }));

    return [...listaSocios, ...listaLocales].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private mapHospedaje(h: any) {
    return {
      id: h.id,
      tipo: 'hospedaje',
      socio: !!h.socio,
      pnr: h.codigoReserva || String(h.id).substring(0, 6).toUpperCase(),
      estado: h.status || h.estado,
      total: Number(h.totalPrice?.total ?? h.total ?? 0),
      moneda: h.totalPrice?.currency || h.moneda || 'USD',
      createdAt: h.createdAt || h.creado_en,
      cliente: h.customerEmail || h.customerName || h.cliente_email || h.cliente_nombre || '—',
      alojamiento: h.nombreAlojamiento || h.alojamiento_nombre || null,
      checkin: h.checkin,
      checkout: h.checkout,
    };
  }

  /**
   * Telemetría real (tabla telemetry_events) leída por Postgres: sesiones únicas
   * por paso del embudo y por vertical. Si la tabla no existe o está vacía
   * se devuelve null (el panel muestra "sin datos", nunca números inventados).
   */
  private async telemetria() {
    try {
      const [porEvento, porVertical, total] = await Promise.all([
        this.dataSource.query(`SELECT event_name, COUNT(DISTINCT session_id)::int AS n FROM telemetry_events GROUP BY event_name`),
        this.dataSource.query(`SELECT LOWER(COALESCE(vertical, 'global')) AS vertical, COUNT(DISTINCT session_id)::int AS n FROM telemetry_events GROUP BY 1`),
        this.dataSource.query(`SELECT COUNT(*)::int AS eventos, COUNT(DISTINCT session_id)::int AS sesiones, MAX(created_at) AS ultimo FROM telemetry_events`)
          .catch(() => this.dataSource.query(`SELECT COUNT(*)::int AS eventos, COUNT(DISTINCT session_id)::int AS sesiones, NULL AS ultimo FROM telemetry_events`)),
      ]);
      const ev = (nombres: string[]) => Math.max(0, ...porEvento.filter((r: any) => nombres.includes(r.event_name)).map((r: any) => Number(r.n)));
      const resumen = total?.[0] || {};
      if (!Number(resumen.eventos)) return { funnel: null, trafico: { vuelos: 0, autos: 0, atracciones: 0, hospedaje: 0 }, eventos: 0, sesiones: 0, ultimoEvento: null };

      const pasos = [
        { label: 'Búsquedas', count: ev(['search_submitted']) },
        { label: 'Inicio de checkout', count: ev(['checkout_started']) },
        { label: 'Ingreso de datos del cliente', count: ev(['form_step_completed']) },
        { label: 'Intento de pago', count: ev(['payment_started']) },
        { label: '✅ Reserva exitosa', count: ev(['payment_succeeded', 'booking_confirmed']) },
      ];
      const base = Math.max(pasos[0].count, 1);
      const vert = (nombres: string[]) => porVertical.filter((r: any) => nombres.includes(r.vertical)).reduce((s: number, r: any) => s + Number(r.n), 0);
      return {
        funnel: pasos.map((p) => ({ ...p, pct: Math.round((p.count / base) * 1000) / 10 })),
        trafico: {
          vuelos: vert(['vuelos', 'vuelo']),
          autos: vert(['autos', 'auto']),
          atracciones: vert(['atracciones', 'atraccion']),
          hospedaje: vert(['hospedaje', 'alojamientos', 'alojamiento']),
        },
        eventos: Number(resumen.eventos) || 0,
        sesiones: Number(resumen.sesiones) || 0,
        ultimoEvento: resumen.ultimo || null,
      };
    } catch (e) {
      this.logger.warn(`Telemetría no disponible: ${e.message}`);
      return { funnel: null, trafico: { vuelos: 0, autos: 0, atracciones: 0, hospedaje: 0 }, eventos: 0, sesiones: 0, ultimoEvento: null, error: e.message };
    }
  }

  async getStats() {
    this.logger.log('Admin: consultando estadísticas globales...');

    const [vuelos, autos, atracciones, hospedaje, tel, vuelosSocios] = await Promise.all([
      this.reservaRepo.find().catch((e) => { this.logger.error('Error vuelos:', e); return [] as Reserva[]; }),
      this.orderAutoRepo.find().catch((e) => { this.logger.error('Error autos:', e); return [] as OrderAuto[]; }),
      this.reservaAtraccionRepo.find().catch((e) => { this.logger.error('Error atracciones:', e); return [] as ReservaAtraccion[]; }),
      this.reservasHospedaje(),
      this.telemetria(),
      // Reservas hechas en aerolíneas socias (RDA2): viven en la aerolínea, Booking guarda la copia.
      this.dataSource
        .query(`SELECT booking_id, pnr, status, grand_total, currency, created_at FROM public.vuelos_reservas_socio`)
        .catch(() => [] as any[]),
    ]);

    // Todas las reservas normalizadas (misma forma para las 4 verticales)
    const todas = [
      ...vuelos.map((r) => ({ tipo: 'vuelo', vertical: 'vuelos', id: r.idReserva, pnr: r.pnr, estado: r.estado, total: Number(r.total || 0), moneda: r.moneda || 'USD', createdAt: r.fechaCreacion })),
      ...vuelosSocios.map((r: any) => ({ tipo: 'vuelo', vertical: 'vuelos', id: r.booking_id, pnr: r.pnr, estado: r.status, total: Number(r.grand_total || 0), moneda: r.currency || 'USD', createdAt: r.created_at })),
      ...autos.map((o) => ({ tipo: 'auto', vertical: 'autos', id: o.id, pnr: o.id.substring(0, 6).toUpperCase(), estado: o.status, total: Number(o.totalPrice?.total || 0), moneda: o.totalPrice?.currency || 'USD', createdAt: o.createdAt })),
      ...atracciones.map((a) => ({ tipo: 'atraccion', vertical: 'atracciones', id: a.id, pnr: a.id.substring(0, 6).toUpperCase(), estado: a.status, total: Number(a.totalPrice?.total || 0), moneda: a.totalPrice?.currency || 'USD', createdAt: a.createdAt })),
      ...hospedaje.map((h) => ({ ...this.mapHospedaje(h), vertical: 'hospedaje' })),
    ];

    // Ingresos = solo reservas cobradas (mismas reglas que Finanzas)
    const cobrada = (e: any) => ESTADOS_COBRADOS.has(String(e || '').toUpperCase());
    const ingresos = (v: string) => Math.round(todas.filter((r) => r.vertical === v && cobrada(r.estado)).reduce((s, r) => s + r.total, 0) * 100) / 100;
    const ingresosVuelos = ingresos('vuelos');
    const ingresosAutos = ingresos('autos');
    const ingresosAtracciones = ingresos('atracciones');
    const ingresosHospedaje = ingresos('hospedaje');

    // Reservas por estado, por vertical
    const estadosPorVertical: Record<string, Record<string, number>> = { vuelos: {}, autos: {}, atracciones: {}, hospedaje: {} };
    for (const r of todas) {
      const e = String(r.estado || 'SIN_ESTADO').toUpperCase();
      estadosPorVertical[r.vertical][e] = (estadosPorVertical[r.vertical][e] || 0) + 1;
    }

    const ultimasReservas = [...todas]
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
      .slice(0, 10)
      .map(({ vertical, ...r }) => r);

    return {
      generadoEn: new Date().toISOString(),
      kpis: {
        totalReservas: todas.length,
        reservasVuelos: vuelos.length + vuelosSocios.length,
        reservasAutos: autos.length,
        reservasAtracciones: atracciones.length,
        reservasHospedaje: hospedaje.length,
        reservasCobradas: todas.filter((r) => cobrada(r.estado)).length,
        ingresosTotal: Math.round((ingresosVuelos + ingresosAutos + ingresosAtracciones + ingresosHospedaje) * 100) / 100,
        ingresosVuelos,
        ingresosAutos,
        ingresosAtracciones,
        ingresosHospedaje,
      },
      estadosVuelos: estadosPorVertical.vuelos,
      estadosPorVertical,
      ultimasReservas,
      realFunnel: tel.funnel,
      trafficByVertical: tel.trafico,
      telemetria: { eventos: tel.eventos, sesiones: tel.sesiones, ultimoEvento: tel.ultimoEvento, error: (tel as any).error || null },
    };
  }

  /**
   * Lista de usuarios.
   *
   * Antes solo se usaba `supabase.auth.admin.listUsers()` y cualquier fallo
   * (clave secreta ausente en el despliegue, clave sin permisos de admin, etc.)
   * se tragaba devolviendo `[]`: el panel mostraba "0 usuarios" sin decir por qué.
   *
   * Ahora:
   *  1. Se lee directamente `auth.users` por la conexión Postgres (DATABASE_URL),
   *     que no depende de la clave de Supabase.
   *  2. Si eso falla, se usa la Admin API de Supabase (paginada a 1000).
   *  3. Si ambas fallan se responde 503 con el motivo real, para verlo en el panel.
   */
  async getUsers() {
    this.logger.log('Admin: consultando usuarios...');
    const errores: string[] = [];

    try {
      const rows = await this.dataSource.query(
        `SELECT id, email, raw_user_meta_data AS meta, raw_app_meta_data AS app_meta,
                created_at, last_sign_in_at, banned_until, email_confirmed_at
         FROM auth.users ORDER BY created_at DESC`,
      );
      return rows.map((u: any) => this.mapUsuario({
        id: u.id, email: u.email, user_metadata: u.meta, app_metadata: u.app_meta,
        created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until, email_confirmed_at: u.email_confirmed_at,
      }));
    } catch (e) {
      errores.push(`auth.users vía Postgres: ${e.message}`);
      this.logger.warn(`No se pudo leer auth.users por SQL (${e.message}); probando Admin API...`);
    }

    try {
      const { data, error } = await this.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(error.message);
      return (data?.users || []).map((u: any) => this.mapUsuario(u));
    } catch (e) {
      errores.push(`Supabase Admin API: ${e.message}`);
    }

    this.logger.error(`No se pudo obtener usuarios: ${errores.join(' | ')}`);
    throw new ServiceUnavailableException(
      `No se pudo obtener la lista de usuarios. Revisa DATABASE_URL y SUPABASE_SECRET_KEY en el backend. Detalle: ${errores.join(' | ')}`,
    );
  }

  private mapUsuario(u: any) {
    const meta = u.user_metadata || {};
    const app = u.app_metadata || {};
    const email = (u.email || '').toLowerCase();
    // El rol se lee SOLO de app_metadata: user_metadata lo puede editar el propio usuario.
    const esAdmin = app.role === 'admin' || ADMIN_EMAILS.includes(email);
    const baneado = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
    return {
      id: u.id,
      email: u.email,
      nombre: [meta.nombre || meta.name || meta.full_name, meta.apellido].filter(Boolean).join(' ') || null,
      rol: esAdmin ? 'admin' : (app.role || 'usuario'),
      // Admin definido por correo en el código: no se le puede quitar el rol desde el panel
      adminFijo: ADMIN_EMAILS.includes(email),
      // El panel usa 'bloquear' para pintar el botón de desbloquear
      status: baneado || meta.status === 'bloquear' ? 'bloquear' : 'activo',
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at || null,
      email_confirmado: Boolean(u.email_confirmed_at),
    };
  }

  async getReservasGlobales() {
    this.logger.log('Admin: consultando reservas globales...');
    const [vuelos, autos, atracciones, vuelosSocios] = await Promise.all([
      this.reservaRepo.find({ order: { fechaCreacion: 'DESC' } as any, take: 50 }).catch(() => [] as Reserva[]),
      this.orderAutoRepo.find({ order: { createdAt: 'DESC' }, take: 50 }).catch(() => [] as OrderAuto[]),
      this.reservaAtraccionRepo.find({ order: { createdAt: 'DESC' }, take: 50 }).catch(() => [] as ReservaAtraccion[]),
      // Reservas hechas en aerolíneas socias: la reserva vive en la aerolínea y Booking guarda la copia.
      this.dataSource.query(
        `SELECT booking_id, codigo_nodo, pnr, status, origin, destination, grand_total, reembolsado, currency, created_at
           FROM public.vuelos_reservas_socio ORDER BY created_at DESC LIMIT 100`,
      ).catch(() => [] as any[]),
    ]);
    const hospedaje = await this.reservasHospedaje(50);

    const listaVuelos = [
      ...vuelosSocios.map((r: any) => ({
        id: r.booking_id,
        tipo: 'vuelo',
        socio: true,
        aerolinea: r.codigo_nodo,
        ruta: r.origin && r.destination ? `${r.origin} → ${r.destination}` : null,
        pnr: r.pnr || '—',
        estado: r.status,
        total: Number(r.grand_total || 0),
        reembolsado: Number(r.reembolsado || 0),
        moneda: r.currency || 'USD',
        createdAt: r.created_at,
      })),
      ...vuelos.map(r => ({
        id: r.idReserva,
        tipo: 'vuelo',
        socio: false,
        pnr: r.pnr || '—',
        estado: r.estado,
        total: Number(r.total || 0),
        moneda: r.moneda || 'USD',
        createdAt: r.fechaCreacion,
      })),
    ].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

    return {
      vuelos: listaVuelos,
      autos: autos.map(o => ({
        id: o.id,
        tipo: 'auto',
        pnr: o.id.substring(0, 6).toUpperCase(),
        estado: o.status,
        total: Number(o.totalPrice?.total || 0),
        moneda: o.totalPrice?.currency || 'USD',
        createdAt: o.createdAt,
      })),
      atracciones: atracciones.map(a => ({
        id: a.id,
        tipo: 'atraccion',
        pnr: a.id.substring(0, 6).toUpperCase(),
        estado: a.status,
        total: Number(a.totalPrice?.total || 0),
        moneda: a.totalPrice?.currency || 'USD',
        createdAt: a.createdAt,
        cliente: a.customerEmail || a.customerName || '—',
      })),
      hospedaje: hospedaje.map((h) => this.mapHospedaje(h)),
    };
  }

  /**
   * Busca un usuario igual que getUsers(): primero directo en auth.users
   * (Postgres) y, si eso falla, con la Admin API de Supabase.
   */
  private async buscarUsuario(id: string): Promise<{ id: string; email: string; user_metadata: any }> {
    const errores: string[] = [];
    try {
      const rows = await this.dataSource.query(
        `SELECT id, email, raw_user_meta_data AS meta FROM auth.users WHERE id = $1`, [id],
      );
      if (rows?.[0]) return { id: rows[0].id, email: rows[0].email, user_metadata: rows[0].meta || {} };
      errores.push('no existe en auth.users');
    } catch (e) {
      errores.push(`auth.users vía Postgres: ${e.message}`);
    }
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(id);
      if (error) throw new Error(error.message);
      if (data?.user) return { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata || {} };
    } catch (e) {
      errores.push(`Supabase Admin API: ${e.message}`);
    }
    throw new NotFoundException(`Usuario no encontrado (${id}). Detalle: ${errores.join(' | ')}`);
  }

  /**
   * Actualiza metadata/baneo del usuario. Va directo a auth.users (misma vía
   * que el listado) y usa la Admin API solo como respaldo.
   */
  private async actualizarUsuario(
    id: string,
    cambios: { meta?: Record<string, any>; appMeta?: Record<string, any>; banear?: boolean },
  ) {
    const errores: string[] = [];
    const meta = cambios.meta ?? {};
    const appMeta = cambios.appMeta ?? {};
    try {
      const sets = [
        `raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $2::jsonb`,
        `raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || $3::jsonb`,
        'updated_at = now()',
      ];
      if (cambios.banear !== undefined) sets.push(cambios.banear ? `banned_until = now() + interval '100 years'` : 'banned_until = NULL');
      const res = await this.dataSource.query(
        `UPDATE auth.users SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, [id, JSON.stringify(meta), JSON.stringify(appMeta)],
      );
      const filas = Array.isArray(res?.[0]) ? res[0] : res;
      if (filas?.length) return;
      errores.push('UPDATE no afectó filas');
    } catch (e) {
      errores.push(`auth.users vía Postgres: ${e.message}`);
      this.logger.warn(`No se pudo actualizar auth.users por SQL (${e.message}); probando Admin API...`);
    }
    try {
      const actual: any = await this.buscarUsuario(id);
      const payload: any = {
        user_metadata: { ...actual.user_metadata, ...meta },
        app_metadata: { ...(actual.app_metadata || {}), ...appMeta },
      };
      if (cambios.banear !== undefined) payload.ban_duration = cambios.banear ? '876000h' : 'none';
      const { error } = await this.supabase.auth.admin.updateUserById(id, payload);
      if (error) throw new Error(error.message);
      return;
    } catch (e) {
      errores.push(`Supabase Admin API: ${e.message}`);
    }
    throw new BadRequestException(`No se pudo actualizar el usuario. Detalle: ${errores.join(' | ')}`);
  }

  /**
   * El administrador fija directamente la nueva contraseña del usuario.
   * Se guarda en auth.users con bcrypt (el mismo formato que usa Supabase Auth);
   * si la BD no lo permite se usa la Admin API como respaldo.
   */
  private async cambiarPassword(id: string, password?: string) {
    const pwd = String(password ?? '');
    if (pwd.length < 8) throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    if (pwd.length > 72) throw new BadRequestException('La contraseña no puede superar los 72 caracteres.');
    const errores: string[] = [];
    // pgcrypto en Supabase vive en el esquema "extensions"; se prueba también sin esquema.
    for (const fn of ['extensions.crypt($2, extensions.gen_salt(\'bf\', 10))', 'crypt($2, gen_salt(\'bf\', 10))']) {
      try {
        const res = await this.dataSource.query(
          `UPDATE auth.users SET encrypted_password = ${fn}, updated_at = now() WHERE id = $1 RETURNING id`, [id, pwd],
        );
        const filas = Array.isArray(res?.[0]) ? res[0] : res;
        if (filas?.length) return;
        errores.push('UPDATE no afectó filas');
        break;
      } catch (e) {
        errores.push(`auth.users vía Postgres: ${e.message}`);
      }
    }
    try {
      const { error } = await this.supabase.auth.admin.updateUserById(id, { password: pwd });
      if (error) throw new Error(error.message);
      return;
    } catch (e) {
      errores.push(`Supabase Admin API: ${e.message}`);
    }
    throw new BadRequestException(`No se pudo cambiar la contraseña. Detalle: ${errores.join(' | ')}`);
  }

  async executeUserAction(id: string, action: string, password?: string) {
    this.logger.log(`Admin: ejecutando accion ${action} sobre usuario ${id}`);
    const user = await this.buscarUsuario(id);

    if (action === 'bloquear' || action === 'desbloquear') {
      // Bloqueo REAL: Supabase Auth rechaza el login si banned_until está en el futuro.
      await this.actualizarUsuario(id, { meta: { status: action }, banear: action === 'bloquear' });
    } else if (action === 'promover_admin' || action === 'quitar_admin') {
      if (action === 'quitar_admin' && ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
        throw new BadRequestException(`${user.email} es administrador principal (definido en el sistema) y no se le puede quitar el rol.`);
      }
      // El rol va en app_metadata (solo el backend puede escribirlo). Se limpia el
      // `role` antiguo de user_metadata, que el propio usuario podía modificar.
      await this.actualizarUsuario(id, {
        appMeta: { role: action === 'promover_admin' ? 'admin' : 'user' },
        meta: { role: null },
      });
    } else if (action === 'cambiar_password') {
      await this.cambiarPassword(id, password);
    } else {
      throw new BadRequestException(`Acción no soportada: ${action}`);
    }
    return { success: true, message: `Acción ${action} ejecutada`, email: user.email };
  }

  /**
   * Alta de un usuario desde el panel (modal "Agregar usuario"). Usa la Admin API
   * de Supabase con la clave de servicio: el correo queda confirmado y el rol se
   * guarda en app_metadata.
   */
  async crearUsuario(body: { email?: string; password?: string; rol?: string }) {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const rol = body?.rol === 'admin' ? 'admin' : 'cliente';
    const errores: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errores.push('El correo no es válido.');
    if (password.length < 6 || password.length > 72) errores.push('La contraseña debe tener entre 6 y 72 caracteres.');
    if (errores.length) throw new BadRequestException(errores);

    const { data, error } = await this.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: rol === 'admin' ? 'admin' : 'user' },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
      throw new ServiceUnavailableException(`No se pudo crear el usuario en Supabase: ${error.message}`);
    }
    return { success: true, id: data.user?.id, email, rol };
  }

  async getUserHistorial(id: string) {
    this.logger.log(`Admin: consultando historial de usuario ${id}`);
    const email = await this.buscarUsuario(id).then((u) => u.email).catch(() => undefined);

    const vuelos = await this.reservaRepo.find({ where: { propietarioId: id } });
    let autos: OrderAuto[] = [];
    let atracciones: ReservaAtraccion[] = [];
    let hospedaje: any[] = [];
    if (email) {
      const mail = email.toLowerCase();
      const [allAutos, allAtr, allHosp, hospSocios] = await Promise.all([
        this.orderAutoRepo.find().catch(() => [] as OrderAuto[]),
        this.reservaAtraccionRepo.find().catch(() => [] as ReservaAtraccion[]),
        this.reservaAlojamientoRepo.find().catch(() => [] as ReservaAlojamiento[]),
        this.dataSource.query(
          `SELECT id, codigo_reserva, estado, total, moneda, alojamiento_nombre, creado_en 
             FROM schema_alojamientos.alojamientos_reservas_socio 
            WHERE usuario_id::text = $1 OR lower(cliente_email) = $2 
            ORDER BY creado_en DESC`,
          [id, mail],
        ).catch(() => [] as any[]),
      ]);
      autos = allAutos.filter((a) => String(a.booker?.email || '').toLowerCase() === mail);
      atracciones = allAtr.filter((a) => String(a.customerEmail || '').toLowerCase() === mail);
      hospedaje = [
        ...allHosp.filter((h) => String(h.customerEmail || '').toLowerCase() === mail).map(h => ({
          pnr: h.codigoReserva,
          estado: h.status,
          total: h.total,
          fecha: h.createdAt,
        })),
        ...(hospSocios || []).map((s: any) => ({
          pnr: s.codigo_reserva,
          estado: s.estado,
          total: s.total,
          fecha: s.creado_en,
        })),
      ];
    }

    return {
      success: true,
      data: {
        vuelos: vuelos.map(v => ({ pnr: v.pnr, estado: v.estado, fecha: v.fechaCreacion })),
        autos: autos.map(a => ({ pnr: a.id.substring(0,6).toUpperCase(), estado: a.status, fecha: a.createdAt })),
        atracciones: atracciones.map(a => ({ pnr: a.id.substring(0,6).toUpperCase(), estado: a.status, fecha: a.createdAt })),
        hospedaje,
      }
    };
  }

  async cancelarReserva(tipo: string, id: string) {
    this.logger.log(`Admin: cancelando reserva ${tipo} ${id}`);

    if (tipo === 'hospedaje') {
      try {
        await this.alojamientosService.cancelarReserva(id, { reason: 'Cancelada por el administrador' }, randomUUID());
        return { success: true, message: 'Reserva hospedaje cancelada exitosamente' };
      } catch (err: any) {
        const rLocal = await this.reservaAlojamientoRepo.findOne({ where: { codigoReserva: id } });
        if (rLocal) {
          await this.alojamientosService.cancelarReserva(rLocal.id, { reason: 'Cancelada por el administrador' }, randomUUID());
          return { success: true, message: 'Reserva hospedaje cancelada exitosamente' };
        }
        const [rSocio] = await this.dataSource.query(
          `SELECT id FROM schema_alojamientos.alojamientos_reservas_socio WHERE codigo_reserva = $1 OR order_id_socio = $1 OR external_order_id = $1 LIMIT 1`,
          [id],
        ).catch(() => []);
        if (rSocio) {
          await this.alojamientosService.cancelarReserva(rSocio.id, { reason: 'Cancelada por el administrador' }, randomUUID());
          return { success: true, message: 'Reserva hospedaje cancelada exitosamente' };
        }
        throw new NotFoundException(`La reserva de hospedaje '${id}' no existe o no se pudo cancelar: ${err.message}`);
      }
    }

    // Una reserva de aerolínea socia se cancela en la aerolínea (con su reembolso
    // y nota de crédito) por POST /vuelos/bookings/{id}/cancel; marcarla aquí solo
    // cambiaría un estado sin devolver el dinero.
    if (tipo === 'vuelos' && id.includes('~')) {
      throw new BadRequestException('Las reservas de aerolíneas socias se cancelan con POST /vuelos/bookings/{id}/cancel.');
    }

    // Vuelos, autos y atracciones: lógica original de sus equipos, sin cambios.
    try {
      if (tipo === 'vuelos') {
        await this.reservaRepo.update({ idReserva: id }, { estado: 'CANCELLED' as any });
      } else if (tipo === 'autos') {
        await this.orderAutoRepo.update({ id }, { status: 'CANCELLED' });
      } else if (tipo === 'atracciones') {
        await this.reservaAtraccionRepo.update({ id }, { status: 'CANCELLED' });
      }
      return { success: true, message: `Reserva ${tipo} cancelada exitosamente` };
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  async getReservaDetalles(tipo: string, id: string) {
    this.logger.log(`Admin: consultando detalles técnicos de ${tipo} ${id}`);
    try {
      let data = null;
      if (tipo === 'vuelos') {
        data = await this.reservaRepo.findOne({
          where: { idReserva: id },
          relations: ['pasajeros', 'itinerarios', 'tarifas', 'boletos', 'checkin']
        });
        if (data) {
          if (data.pasajeros) data.pasajeros.forEach(p => delete p.reserva);
          if (data.itinerarios) data.itinerarios.forEach(i => delete i.reserva);
          if (data.tarifas) data.tarifas.forEach(t => delete t.reserva);
          if (data.boletos) data.boletos.forEach(b => delete b.reserva);
          if (data.checkin) delete data.checkin.reserva;
        }
      } else if (tipo === 'autos') {
        data = await this.orderAutoRepo.findOneBy({ id });
      } else if (tipo === 'atracciones') {
        data = await this.reservaAtraccionRepo.findOneBy({ id });
      } else if (tipo === 'hospedaje') {
        const r = await this.reservaAlojamientoRepo.findOne({ where: ES_UUID.test(id) ? { id } : { codigoReserva: id } });
        if (r) {
          const aloj: any = await this.alojamientoRepo.findOneBy({ id: r.alojamientoId as any }).catch(() => null);
          data = { pnr: r.codigoReserva, ...r, alojamiento: aloj ? { nombre: aloj.nombre, destino: aloj.destino } : r.alojamientoId };
        } else {
          const [s] = await this.dataSource.query(
            `SELECT * FROM schema_alojamientos.alojamientos_reservas_socio 
             WHERE id::text = $1 OR codigo_reserva = $1 OR order_id_socio = $1 OR external_order_id = $1 OR codigo_reserva_socio = $1 
             LIMIT 1`,
            [id],
          ).catch(() => []);
          if (s) {
            data = {
              pnr: s.codigo_reserva,
              id: s.id,
              estado: s.estado,
              total: s.total,
              moneda: s.moneda || 'USD',
              hotel: s.alojamiento_nombre,
              destino: s.destino,
              socio: s.codigo_nodo,
              tipoHabitacion: s.tipo_nombre || s.tipo_codigo,
              checkin: s.checkin,
              checkout: s.checkout,
              noches: s.noches,
              huesped: s.cliente_nombre,
              email: s.cliente_email,
              telefono: s.cliente_telefono,
              documento: `${s.documento_tipo || ''} ${s.documento_numero || ''}`.trim(),
              orderIdSocio: s.order_id_socio,
              externalOrderId: s.external_order_id,
              peticionesEspeciales: s.peticiones_especiales,
              checkinAt: s.checkin_at,
              canceladaEn: s.cancelada_en,
              reembolso: s.monto_reembolsado ? `${s.monto_reembolsado} USD (Ref: ${s.codigo_reembolso})` : null,
              createdAt: s.creado_en,
            };
          }
        }
      }
      return { success: true, data };
    } catch (e) {
      this.logger.error(`Error obteniendo detalles de ${tipo} ${id}:`, e.message);
      throw new Error(`Error obteniendo detalles: ${e.message}`);
    }
  }

  /**
   * No hay un servicio que reenvíe comprobantes desde aquí: se responde 501 en
   * vez de fingir que se envió. El panel ya no muestra este botón.
   */
  async reenviarComprobante(tipo: string, id: string) {
    this.logger.warn(`Admin: reenvío de comprobante solicitado para ${tipo} ${id}, no implementado`);
    throw new HttpException('El reenvío de comprobantes no está implementado.', HttpStatus.NOT_IMPLEMENTED);
  }
}
