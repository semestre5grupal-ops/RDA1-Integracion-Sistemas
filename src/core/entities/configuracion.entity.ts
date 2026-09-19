import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity('configuraciones')
export class Configuracion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  clave: string;

  @Column('text')
  valor: string;

  @Column('text', { nullable: true })
  descripcion: string;

  @Column('text', { default: 'string' })
  tipo_dato: string; // 'string', 'number', 'boolean', 'json'

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updated_by: Usuario;
}
