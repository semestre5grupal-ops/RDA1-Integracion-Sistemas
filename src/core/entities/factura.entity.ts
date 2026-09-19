import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { Usuario } from './usuario.entity';
import { Carrito } from './carrito.entity';
import { FacturaItem } from './factura-item.entity';

@Entity('facturas')
export class Factura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  numero_factura: string;

  @OneToOne(() => Carrito)
  @JoinColumn({ name: 'carrito_id' })
  carrito: Carrito;

  @ManyToOne(() => Usuario, (usuario) => usuario.facturas)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ length: 150 })
  nombre_cliente: string;

  @Column({ length: 20 })
  cedula_ruc_cliente: string;

  @Column({ length: 255 })
  email_cliente: string;

  @Column('text', { nullable: true })
  direccion_cliente: string;

  @Column('numeric', { precision: 10, scale: 2 })
  subtotal: number;

  @Column('numeric', { precision: 5, scale: 2, default: 15.00 })
  iva_porcentaje: number;

  @Column('numeric', { precision: 10, scale: 2 })
  iva_valor: number;

  @Column('numeric', { precision: 10, scale: 2 })
  total: number;

  @Column('text')
  metodo_pago: string; // 'tarjeta', 'transferencia', 'paypal', 'efectivo'

  @Column({ length: 255, nullable: true })
  referencia_pago: string;

  @Column('text', { default: 'emitida' })
  estado: string; // 'emitida', 'anulada'

  @Column('text', { nullable: true })
  notas: string;

  @Column('timestamptz', { default: () => 'CURRENT_TIMESTAMP' })
  emitida_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => FacturaItem, (item) => item.factura)
  items: FacturaItem[];
}
