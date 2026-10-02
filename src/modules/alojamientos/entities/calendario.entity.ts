import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Alojamiento } from './alojamiento.entity';

@Entity('disponibilidad_calendario')
export class DisponibilidadCalendario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alojamiento_id', type: 'varchar', length: 50 })
  alojamientoId: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'boolean', default: true })
  disponible: boolean;

  @Column('numeric', {
    name: 'precio_noche',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  precioNoche: number;

  @ManyToOne(() => Alojamiento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alojamiento_id' })
  alojamiento?: Alojamiento;
}
