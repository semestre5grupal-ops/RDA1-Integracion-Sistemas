import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'reservas_pago', schema: 'schema_pagos' })
@Index('uq_reservas_pago_transaccion_reserva', ['transaccionId', 'reservaId'], { unique: true })
@Index('idx_reservas_pago_transaccion_id', ['transaccionId'])
export class ReservaPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaccion_id', type: 'uuid' })
  transaccionId: string;

  @Column({ name: 'reserva_id', type: 'varchar', length: 128 })
  reservaId: string;
}
