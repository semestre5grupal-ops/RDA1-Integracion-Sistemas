import {
  Column,
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Host } from './host.entity';
import { Amenidad } from './amenidad.entity';
import { FotoAlojamiento } from './foto.entity';
import { ResenaAlojamiento } from './resena.entity';

@Entity('alojamientos')
export class Alojamiento {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  @Column({ name: 'host_id', type: 'varchar', length: 50, nullable: true })
  hostId?: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ name: 'tipo_propiedad', type: 'varchar', length: 100, default: 'Hotel / Resort' })
  tipoPropiedad: string;

  @Column({ name: 'tipo_alojamiento', type: 'varchar', length: 100, default: 'Habitación privada' })
  tipoAlojamiento: string;

  @Column({ type: 'varchar', length: 100 })
  destino: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  barrio?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion?: string;

  @Column('numeric', {
    name: 'latitud',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  latitud?: number;

  @Column('numeric', {
    name: 'longitud',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  longitud?: number;

  @Column({ name: 'capacidad_maxima', type: 'int', default: 2 })
  capacidadAdultos: number;

  @Column({ type: 'int', default: 0 })
  capacidadNinos: number;

  @Column({ type: 'int', default: 1 })
  habitaciones: number;

  @Column({ type: 'int', default: 1 })
  camas: number;

  @Column('numeric', {
    name: 'banos',
    precision: 3,
    scale: 1,
    default: 1.0,
    transformer: new ColumnNumericTransformer(),
  })
  banos: number;

  @Column('numeric', {
    name: 'precio_noche',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  precioPorNoche: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  moneda: string;

  @Column('numeric', {
    name: 'rating',
    precision: 3,
    scale: 2,
    default: 9.0,
    transformer: new ColumnNumericTransformer(),
  })
  rating: number;

  @Column('numeric', {
    name: 'rating_limpieza',
    precision: 3,
    scale: 2,
    default: 9.0,
    transformer: new ColumnNumericTransformer(),
  })
  ratingLimpieza: number;

  @Column('numeric', {
    name: 'rating_ubicacion',
    precision: 3,
    scale: 2,
    default: 9.0,
    transformer: new ColumnNumericTransformer(),
  })
  ratingUbicacion: number;

  @Column('numeric', {
    name: 'rating_servicio',
    precision: 3,
    scale: 2,
    default: 9.0,
    transformer: new ColumnNumericTransformer(),
  })
  ratingServicio: number;

  @Column({ name: 'total_reviews', type: 'int', default: 0 })
  totalReviews: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz', nullable: true })
  createdAt?: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz', nullable: true })
  updatedAt?: Date;

  // Relaciones
  @ManyToOne(() => Host, { nullable: true })
  @JoinColumn({ name: 'host_id' })
  host?: Host;

  @OneToMany(() => FotoAlojamiento, (f) => f.alojamiento)
  fotos?: FotoAlojamiento[];

  @ManyToMany(() => Amenidad)
  @JoinTable({
    name: 'alojamiento_amenidades',
    joinColumn: { name: 'alojamiento_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'amenidad_id', referencedColumnName: 'id' },
  })
  amenidades?: Amenidad[];

  @OneToMany(() => ResenaAlojamiento, (r) => r.alojamiento)
  resenas?: ResenaAlojamiento[];

  // Helpers computados para retrocompatibilidad con la API
  get tienePiscina(): boolean {
    return this.amenidades?.some((a) => a.nombre.toLowerCase().includes('piscina')) ?? true;
  }
}
