import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Alojamiento } from './alojamiento.entity';

@Entity('resenas_alojamiento')
export class ResenaAlojamiento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alojamiento_id', type: 'varchar', length: 50 })
  alojamientoId: string;

  @Column({ name: 'reviewer_name', type: 'varchar', length: 100 })
  reviewerName: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  fecha: string;

  @Column('numeric', { precision: 3, scale: 1, transformer: new ColumnNumericTransformer() })
  puntuacion: number;

  @Column({ type: 'text' })
  comentario: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @ManyToOne(() => Alojamiento, (a) => a.resenas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alojamiento_id' })
  alojamiento?: Alojamiento;
}
