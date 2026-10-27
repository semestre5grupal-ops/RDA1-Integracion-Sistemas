import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity({ name: 'transacciones_pago', schema: 'schema_pagos' })
export class TransaccionPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey: string;

  @Column({ name: 'factura_id', type: 'uuid', nullable: true })
  facturaId: string;

  @Column({ name: 'carrito_id', type: 'uuid', nullable: true })
  carritoId: string;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string;

  @Column('numeric', {
    name: 'monto_total',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  montoTotal: number;

  @Column('numeric', {
    name: 'monto_reembolsado',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  montoReembolsado: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  moneda: string;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 30, default: 'TARJETA_CREDITO' })
  metodoPago: string;

  @Column({ name: 'numero_tarjeta_enmascarado', type: 'varchar', length: 20, default: '•••• •••• •••• 4242' })
  numeroTarjetaEnmascarado: string;

  @Column({ type: 'varchar', length: 30, default: 'INICIADA' })
  estado: string; // 'INICIADA', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO', 'ERROR_TIMEOUT'

  @Column({ name: 'codigo_autorizacion', type: 'varchar', length: 64, nullable: true })
  codigoAutorizacion: string;

  @Column({ name: 'codigo_reembolso', type: 'varchar', length: 64, nullable: true })
  codigoReembolso: string;

  @Column({ name: 'mensaje_pasarela', type: 'text', nullable: true })
  mensajePasarela: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
