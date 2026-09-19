import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Factura } from './factura.entity';

@Entity('factura_items')
export class FacturaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Factura, (factura) => factura.items)
  @JoinColumn({ name: 'factura_id' })
  factura: Factura;

  @Column('text')
  tipo_producto: string;

  @Column('uuid')
  producto_id_externo: string;

  @Column({ length: 250 })
  nombre_producto: string;

  @Column('text', { nullable: true })
  descripcion_producto: string;

  @Column('int', { default: 1 })
  cantidad: number;

  @Column('numeric', { precision: 10, scale: 2 })
  precio_unitario: number;

  @Column('numeric', { precision: 10, scale: 2 })
  subtotal: number;

  @Column('date', { nullable: true })
  fecha_inicio: Date;

  @Column('date', { nullable: true })
  fecha_fin: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
