import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Usuario } from './usuario.entity';
import { CarritoItem } from './carrito-item.entity';

@Entity('carritos')
export class Carrito {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Usuario, (usuario) => usuario.carritos)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column('text', { default: 'activo' })
  estado: string; // 'activo', 'convertido', 'abandonado'

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => CarritoItem, (item) => item.carrito)
  items: CarritoItem[];
}
