import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Carrito } from './carrito.entity';

@Entity('carrito_items')
export class CarritoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Carrito, (carrito) => carrito.items)
  @JoinColumn({ name: 'carrito_id' })
  carrito: Carrito;

  @Column('text')
  tipo_producto: string; // 'atraccion', 'vuelo', 'alojamiento', 'auto'

  @Column('uuid')
  producto_id_externo: string;

  @Column({ length: 250 })
  nombre_producto: string;

  @Column('numeric', { precision: 10, scale: 2 })
  precio_unitario: number;

  @Column('int', { default: 1 })
  cantidad: number;

  @Column('date', { nullable: true })
  fecha_inicio: Date;

  @Column('date', { nullable: true })
  fecha_fin: Date;

  @Column('text', { nullable: true })
  notas: string;

  @Column('text', { nullable: true })
  api_origen_url: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
