import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const TIPOS_PROVEEDOR = ['vuelos', 'autos', 'atracciones', 'hospedaje'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudProveedorInput {
  empresa: string;
  ruc: string;
  tipo: string;
  contactoNombre: string;
  email: string;
  telefono: string;
  ciudad?: string;
  sitioWeb?: string;
  descripcion?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const limpio = (v: any, max: number) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

/**
 * Solicitudes "Quiero ser proveedor".
 *
 * Flujo: el formulario público guarda la solicitud como PENDIENTE →
 * el administrador la revisa en Soporte (Moderación) → la APRUEBA o RECHAZA.
 * Cada revisión queda en la auditoría (la registra el controlador).
 */
@Injectable()
export class AdminProveedoresService {
  private readonly logger = new Logger(AdminProveedoresService.name);
  private esquema: Promise<void> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  asegurarEsquema() {
    if (!this.esquema) {
      // Supabase (pooler) no acepta varias sentencias en una sola consulta
      const sentencias = [
        `CREATE TABLE IF NOT EXISTS panel_solicitudes_proveedor (
           id BIGSERIAL PRIMARY KEY,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           empresa VARCHAR(150) NOT NULL,
           ruc VARCHAR(20) NOT NULL,
           tipo VARCHAR(20) NOT NULL,
           contacto_nombre VARCHAR(120) NOT NULL,
           email VARCHAR(160) NOT NULL,
           telefono VARCHAR(30) NOT NULL,
           ciudad VARCHAR(80),
           sitio_web VARCHAR(200),
           descripcion TEXT,
           estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
           nota_admin TEXT,
           revisado_por VARCHAR(160),
           revisado_en TIMESTAMPTZ,
           ip VARCHAR(64)
         )`,
        `CREATE INDEX IF NOT EXISTS idx_sol_prov_estado ON panel_solicitudes_proveedor (estado, created_at DESC)`,
      ];
      this.esquema = (async () => {
        for (const sql of sentencias) await this.dataSource.query(sql);
      })().catch((e) => {
        this.esquema = null; // reintentar en la próxima llamada
        throw e;
      });
    }
    return this.esquema;
  }

  private validar(body: SolicitudProveedorInput) {
    const d = {
      empresa: limpio(body?.empresa, 150),
      ruc: limpio(body?.ruc, 20).replace(/\s/g, ''),
      tipo: limpio(body?.tipo, 20).toLowerCase(),
      contactoNombre: limpio(body?.contactoNombre, 120),
      email: limpio(body?.email, 160).toLowerCase(),
      telefono: limpio(body?.telefono, 30),
      ciudad: limpio(body?.ciudad, 80) || null,
      sitioWeb: limpio(body?.sitioWeb, 200) || null,
      descripcion: limpio(body?.descripcion, 2000) || null,
    };
    const errores: string[] = [];
    if (d.empresa.length < 3) errores.push('El nombre de la empresa debe tener al menos 3 caracteres.');
    if (!/^\d{13}$/.test(d.ruc)) errores.push('El RUC debe tener 13 dígitos.');
    if (!TIPOS_PROVEEDOR.includes(d.tipo as TipoProveedor)) errores.push('El tipo de servicio debe ser vuelos, autos, atracciones u hospedaje.');
    if (d.contactoNombre.length < 3) errores.push('Indica el nombre de la persona de contacto.');
    if (!EMAIL.test(d.email)) errores.push('El correo no es válido.');
    if (!/^\+?[\d\s-]{7,20}$/.test(d.telefono)) errores.push('El teléfono no es válido.');
    if (errores.length) throw new BadRequestException(errores);
    return d;
  }

  async crear(body: SolicitudProveedorInput, ip?: string | null) {
    const d = this.validar(body);
    await this.asegurarEsquema();

    const duplicada = await this.dataSource.query(
      `SELECT id FROM panel_solicitudes_proveedor WHERE estado = 'PENDIENTE' AND (ruc = $1 OR email = $2) LIMIT 1`,
      [d.ruc, d.email],
    );
    if (duplicada.length) {
      throw new ConflictException('Ya existe una solicitud pendiente con ese RUC o correo. Te contactaremos pronto.');
    }

    const [fila] = await this.dataSource.query(
      `INSERT INTO panel_solicitudes_proveedor
         (empresa, ruc, tipo, contacto_nombre, email, telefono, ciudad, sitio_web, descripcion, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at, estado`,
      [d.empresa, d.ruc, d.tipo, d.contactoNombre, d.email, d.telefono, d.ciudad, d.sitioWeb, d.descripcion, ip ? String(ip).slice(0, 64) : null],
    );
    this.logger.log(`Nueva solicitud de proveedor #${fila.id} (${d.empresa}, ${d.tipo})`);
    return {
      id: Number(fila.id),
      codigo: `PRV-${String(fila.id).padStart(5, '0')}`,
      estado: fila.estado,
      creadaEn: fila.created_at,
      mensaje: 'Recibimos tu solicitud. El equipo de Booking la revisará y te contactará por correo.',
    };
  }

  async listar(estado?: string) {
    await this.asegurarEsquema();
    const filtro = estado && ['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(estado.toUpperCase()) ? estado.toUpperCase() : null;
    const filas = await this.dataSource.query(
      `SELECT * FROM panel_solicitudes_proveedor
       WHERE ($1::text IS NULL OR estado = $1)
       ORDER BY (estado = 'PENDIENTE') DESC, created_at DESC
       LIMIT 500`,
      [filtro],
    );
    const items = filas.map((f: any) => this.mapear(f));
    const resumen = { total: items.length, pendientes: 0, aprobadas: 0, rechazadas: 0 };
    for (const i of items) {
      if (i.estado === 'PENDIENTE') resumen.pendientes++;
      else if (i.estado === 'APROBADA') resumen.aprobadas++;
      else if (i.estado === 'RECHAZADA') resumen.rechazadas++;
    }
    return { items, resumen };
  }

  async revisar(id: string, accion: string, revisor: string | null, nota?: string) {
    const nuevo: EstadoSolicitud | null = accion === 'aprobar' ? 'APROBADA' : accion === 'rechazar' ? 'RECHAZADA' : null;
    if (!nuevo) throw new BadRequestException('La acción debe ser "aprobar" o "rechazar".');
    if (!/^\d+$/.test(String(id))) throw new BadRequestException('Id de solicitud inválido.');
    const notaLimpia = limpio(nota, 1000) || null;
    if (nuevo === 'RECHAZADA' && !notaLimpia) throw new BadRequestException('Indica el motivo del rechazo.');
    await this.asegurarEsquema();

    const [actual] = await this.dataSource.query(`SELECT * FROM panel_solicitudes_proveedor WHERE id = $1`, [id]);
    if (!actual) throw new NotFoundException('La solicitud no existe.');
    if (actual.estado !== 'PENDIENTE') {
      throw new ConflictException(`La solicitud ya fue ${actual.estado === 'APROBADA' ? 'aprobada' : 'rechazada'}.`);
    }

    // En Postgres, TypeORM devuelve un UPDATE ... RETURNING como [filas, nº afectadas]
    const res = await this.dataSource.query(
      `UPDATE panel_solicitudes_proveedor
         SET estado = $2, nota_admin = $3, revisado_por = $4, revisado_en = now()
       WHERE id = $1 AND estado = 'PENDIENTE'
       RETURNING *`,
      [id, nuevo, notaLimpia, revisor],
    );
    const fila = (Array.isArray(res?.[0]) ? res[0] : res)?.[0];
    if (!fila) throw new ConflictException('La solicitud fue revisada por otra persona hace un momento.');
    return this.mapear(fila);
  }

  private mapear(f: any) {
    return {
      id: Number(f.id),
      codigo: `PRV-${String(f.id).padStart(5, '0')}`,
      creadaEn: f.created_at,
      empresa: f.empresa,
      ruc: f.ruc,
      tipo: f.tipo,
      contactoNombre: f.contacto_nombre,
      email: f.email,
      telefono: f.telefono,
      ciudad: f.ciudad,
      sitioWeb: f.sitio_web,
      descripcion: f.descripcion,
      estado: f.estado,
      notaAdmin: f.nota_admin,
      revisadoPor: f.revisado_por,
      revisadoEn: f.revisado_en,
    };
  }
}
