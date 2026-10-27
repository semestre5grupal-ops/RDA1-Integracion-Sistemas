import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity({ name: 'reembolsos_pago', schema: 'schema_pagos' })
@Index('uq_reembolsos_pago_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('idx_reembolsos_pago_transaccion_id', ['transaccionId'])
export class ReembolsoPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaccion_id', type: 'uuid' })
  transaccionId: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column('numeric', {
    name: 'monto_reembolsado',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  montoReembolsado: number;

  @Column({ name: 'codigo_reembolso', type: 'varchar', length: 64, unique: true })
  codigoReembolso: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
