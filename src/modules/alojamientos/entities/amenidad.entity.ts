import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('amenidades')
export class Amenidad {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'varchar', length: 50 })
  categoria: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icono?: string;
}
