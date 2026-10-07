import { randomUUID } from 'crypto';
import { FindOperator } from 'typeorm';

/**
 * Repositorio en memoria con el subconjunto de la API de TypeORM que usa
 * `AlojamientosService` (find, findOne, findOneBy, findAndCount, count, create,
 * save, remove).
 *
 * Permite probar la API HTTP completa sin Postgres y con datos controlados.
 * Igual que TypeORM, devuelve COPIAS: modificar una entidad leída no cambia lo
 * guardado hasta que se llama a `save`.
 */
type Where<T> = Partial<Record<keyof T, unknown>>;

interface OpcionesFind<T> {
  where?: Where<T> | Where<T>[];
  order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
  take?: number;
  skip?: number;
}

function coincideValor(valor: unknown, criterio: unknown): boolean {
  if (criterio instanceof FindOperator) {
    const tipo = (criterio as any).type ?? (criterio as any)._type;
    const patron = String((criterio as any).value ?? (criterio as any)._value);
    if (tipo === 'ilike' || tipo === 'like') {
      const regex = new RegExp(
        '^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$',
        tipo === 'ilike' ? 'is' : 's',
      );
      return typeof valor === 'string' && regex.test(valor);
    }
    throw new Error(`Operador no soportado en el repositorio de prueba: ${tipo}`);
  }
  return valor === criterio;
}

function coincide<T>(fila: T, where?: Where<T> | Where<T>[]): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => coincide(fila, w));
  return Object.entries(where).every(([campo, criterio]) => coincideValor((fila as any)[campo], criterio));
}

const clonar = <T>(v: T): T => structuredClone(v);

export class RepositorioMemoria<T extends { id?: string; createdAt?: Date; updatedAt?: Date }> {
  private filas: T[] = [];
  private secuencia = 0;

  constructor(private readonly opciones: { generarId?: boolean; unicos?: (keyof T)[] } = {}) {}

  /** Inserta filas directamente (fixtures), sin pasar por la lógica del servicio. */
  sembrar(...filas: Partial<T>[]): void {
    for (const f of filas) this.guardarUno(f as T);
  }

  /** Lectura directa del almacenamiento para aserciones. */
  todas(): T[] {
    return this.filas.map(clonar);
  }

  limpiar(): void {
    this.filas = [];
  }

  create(datos: Partial<T>): T {
    return clonar(datos) as T;
  }

  async save(entidad: T | T[]): Promise<any> {
    if (Array.isArray(entidad)) return entidad.map((e) => this.guardarUno(e));
    return this.guardarUno(entidad);
  }

  async remove(entidad: T): Promise<T> {
    this.filas = this.filas.filter((f) => f.id !== entidad.id);
    return entidad;
  }

  async find(opciones: OpcionesFind<T> = {}): Promise<T[]> {
    let resultado = this.filas.filter((f) => coincide(f, opciones.where));
    if (opciones.order) {
      const [campo, dir] = Object.entries(opciones.order)[0] as [keyof T, 'ASC' | 'DESC'];
      resultado = [...resultado].sort((a, b) => {
        const va = a[campo] as any;
        const vb = b[campo] as any;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return dir === 'DESC' ? -cmp : cmp;
      });
    }
    const desde = opciones.skip ?? 0;
    const hasta = opciones.take !== undefined ? desde + opciones.take : undefined;
    return resultado.slice(desde, hasta).map(clonar);
  }

  async findAndCount(opciones: OpcionesFind<T> = {}): Promise<[T[], number]> {
    const total = this.filas.filter((f) => coincide(f, opciones.where)).length;
    return [await this.find(opciones), total];
  }

  async findOne(opciones: OpcionesFind<T> = {}): Promise<T | null> {
    const [primera] = await this.find({ ...opciones, take: 1 });
    return primera ?? null;
  }

  async findOneBy(where: Where<T>): Promise<T | null> {
    return this.findOne({ where });
  }

  async count(opciones: OpcionesFind<T> = {}): Promise<number> {
    return this.filas.filter((f) => coincide(f, opciones.where)).length;
  }

  private guardarUno(entidad: T): T {
    const copia = clonar(entidad);
    if (!copia.id && this.opciones.generarId) copia.id = randomUUID();
    const ahora = new Date(Date.now() + this.secuencia++); // orden estable por creación
    const existente = this.filas.findIndex((f) => f.id === copia.id);

    // Restricciones UNIQUE como las de Postgres (idempotency_key, codigo_reserva).
    for (const campo of this.opciones.unicos ?? []) {
      const valor = copia[campo];
      if (valor === undefined || valor === null) continue;
      const choque = this.filas.find((f, i) => i !== existente && f[campo] === valor);
      if (choque) {
        throw new Error(`duplicate key value violates unique constraint "${String(campo)}"`);
      }
    }

    if (existente >= 0) {
      copia.createdAt = this.filas[existente].createdAt;
      copia.updatedAt = ahora;
      this.filas[existente] = copia;
    } else {
      copia.createdAt = copia.createdAt ?? ahora;
      copia.updatedAt = ahora;
      this.filas.push(copia);
    }
    return clonar(copia);
  }
}
