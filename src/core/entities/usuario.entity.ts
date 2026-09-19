import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToMany } from 'typeorm';
import { Carrito } from './carrito.entity';
import { Factura } from './factura.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column('text')
  password_hash: string;

  @Column({ length: 20, nullable: true })
  cedula_ruc: string;

  @Column({ length: 20, nullable: true })
  telefono: string;

  @Column('text', { nullable: true })
  direccion: string;

  @Column('text', { default: 'cliente' })
  rol: string;

  @Column('text', { default: 'activo' })
  estado: string;

  @Column('text', { nullable: true })
  refresh_token_hash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at: Date;

  @OneToMany(() => Carrito, (carrito) => carrito.usuario)
  carritos: Carrito[];

  @OneToMany(() => Factura, (factura) => factura.usuario)
  facturas: Factura[];
}
