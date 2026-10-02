import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('huespedes')
export class Huesped {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 100 })
  apellido: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono?: string;

  @Column({ name: 'doc_tipo', type: 'varchar', length: 20, default: 'Pasaporte' })
  docTipo: string;

  @Column({ name: 'doc_numero', type: 'varchar', length: 50, nullable: true })
  docNumero?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nacionalidad?: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
