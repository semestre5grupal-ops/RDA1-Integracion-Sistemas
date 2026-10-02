import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Alojamiento } from './alojamiento.entity';

@Entity('fotos_alojamiento')
export class FotoAlojamiento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alojamiento_id', type: 'varchar', length: 50 })
  alojamientoId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  titulo?: string;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  esPrincipal: boolean;

  @Column({ type: 'int', default: 0 })
  orden: number;

  @ManyToOne(() => Alojamiento, (a) => a.fotos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alojamiento_id' })
  alojamiento?: Alojamiento;
}
