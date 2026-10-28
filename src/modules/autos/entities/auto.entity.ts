import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

export enum EstadoVehiculo {
  DISPONIBLE = 'DISPONIBLE',
  RESERVADO = 'RESERVADO',
  LISTO_PARA_ENTREGAR = 'LISTO_PARA_ENTREGAR',
  ENTREGADO = 'ENTREGADO',
  EN_LIMPIEZA = 'EN_LIMPIEZA',
  EN_MANTENIMIENTO = 'EN_MANTENIMIENTO'
}

@Entity({ name: 'autos_catalogo', schema: 'schema_autos' })
export class Auto {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ type: 'varchar', length: 60, default: 'Chevrolet' })
  marca: string;

  @Column({ type: 'varchar', length: 60, default: 'Sail' })
  modelo: string;

  @Column({ type: 'int', default: 2024 })
  anio: number;

  @Column({ type: 'varchar', length: 30, default: 'ECONOMICO' })
  categoria: string;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  transmision: string;

  @Column({ name: 'capacidad_pasajeros', type: 'int', default: 5 })
  capacidadPasajeros: number;

  @Column('numeric', {
    name: 'precio_diario',
    precision: 10,
    scale: 2,
    default: 40.00,
    transformer: new ColumnNumericTransformer(),
  })
  precioDiario: number;

  @Column({ name: 'kilometraje_actual', type: 'int', default: 12000 })
  kilometrajeActual: number;

  @Column({ name: 'umbral_mantenimiento_km', type: 'int', default: 15000 })
  umbralMantenimientoKm: number;

  @Column({ name: 'alerta_mantenimiento_activa', type: 'boolean', default: false })
  alertaMantenimientoActiva: boolean;

  // Máquina de estados obligatoria de 6 fases (§5 Consideraciones)
  @Column({
    name: 'estado_operativo',
    type: 'varchar',
    length: 30,
    default: 'DISPONIBLE',
  })
  estadoOperativo: string;

  @Column({ name: 'limpieza_inicio_at', type: 'timestamptz', nullable: true })
  limpiezaInicioAt: Date;

  @Column({ name: 'disponible_estimado_at', type: 'timestamptz', nullable: true })
  disponibleEstimadoAt: Date;

  @Column({ name: 'foto_url', type: 'text', default: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800' })
  fotoUrl: string;

  @Column({ type: 'varchar', length: 100, default: 'Quito' })
  ciudad: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'proveedor_codigo', type: 'varchar', length: 100, nullable: true })
  proveedorCodigo?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // --- Getters y Setters de compatibilidad con código existente ---
  get supplier_name(): string {
    return 'Europcar / Avis Ecuador';
  }

  get price(): number {
    return Number(this.precioDiario || 40.00);
  }
  set price(val: number) {
    this.precioDiario = val;
  }

  get estado(): string {
    return this.estadoOperativo;
  }
  set estado(val: string) {
    this.estadoOperativo = val;
  }

  get disponible_desde(): Date {
    return this.disponibleEstimadoAt;
  }
  set disponible_desde(val: Date) {
    this.disponibleEstimadoAt = val;
  }

  get kilometraje_actual(): number {
    return this.kilometrajeActual;
  }
  set kilometraje_actual(val: number) {
    this.kilometrajeActual = val;
  }

  get proximo_mantenimiento_km(): number {
    return this.umbralMantenimientoKm;
  }
  set proximo_mantenimiento_km(val: number) {
    this.umbralMantenimientoKm = val;
  }

  get mantenimiento_requerido(): boolean {
    return this.alertaMantenimientoActiva || this.kilometrajeActual >= this.umbralMantenimientoKm;
  }
  set mantenimiento_requerido(val: boolean) {
    this.alertaMantenimientoActiva = val;
  }

  get images(): string[] {
    return [this.fotoUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'];
  }

  get vehicle_info(): any {
    return {
      category: this.categoria,
      type: 'Sedan',
      transmission: this.transmision,
      fuel: 'Gasolina',
      air_conditioning: true,
      doors: 4,
      seats: this.capacidadPasajeros,
      bags: 2,
      marca: this.marca,
      modelo: this.modelo,
    };
  }

  get available(): boolean {
    if (this.estadoOperativo === EstadoVehiculo.EN_LIMPIEZA) {
      if (this.disponibleEstimadoAt && new Date() >= new Date(this.disponibleEstimadoAt)) {
        return true;
      }
      return false;
    }
    return this.estadoOperativo === EstadoVehiculo.DISPONIBLE && !this.alertaMantenimientoActiva;
  }
}
