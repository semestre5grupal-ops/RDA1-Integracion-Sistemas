import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('reservas_atraccion')
export class ReservaAtraccion {
  @PrimaryGeneratedColumn('uuid')
  id: string; // The reservation_id (e.g. uuid)

  @Column({ type: 'uuid' })
  atraccionId: string;

  @Column({ type: 'uuid', unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 50 })
  status: string; // CONFIRMED, PENDING, CANCELLED

  @Column({ type: 'int' })
  ticketCount: number;

  @Column('jsonb')
  totalPrice: { currency: string; total: number };

  @Column({ type: 'varchar', length: 255 })
  customerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  time: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
