import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('reservas_alojamiento')
export class ReservaAlojamiento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_reserva', type: 'varchar', length: 50, unique: true })
  codigoReserva: string;

  @Column({ name: 'alojamiento_id', type: 'varchar', length: 50 })
  alojamientoId: string;

  @Column({ name: 'huesped_id', type: 'uuid', nullable: true })
  huespedId?: string;

  @Column({ name: 'cliente_nombre', type: 'varchar', length: 150 })
  customerName: string;

  @Column({ name: 'cliente_email', type: 'varchar', length: 150 })
  customerEmail: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  checkin: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  checkout: string;

  @Column({ name: 'huespedes', type: 'int', default: 1 })
  huespedes: number;

  @Column('numeric', {
    name: 'total',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  total: number;

  @Column({ name: 'estado', type: 'varchar', length: 50, default: 'CONFIRMADA' })
  status: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255, unique: true, nullable: true })
  idempotencyKey?: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  createdAt: Date;
}
