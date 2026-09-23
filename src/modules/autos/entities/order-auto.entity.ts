import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('orders_autos')
export class OrderAuto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  autoId: string;

  @Column({ type: 'uuid', unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 50 })
  status: string; // CONFIRMED, PENDING, CANCELLED

  @Column({ type: 'int' })
  diasRenta: number;

  @Column('jsonb')
  totalPrice: { currency: string; total: number };

  @Column('jsonb')
  booker: { country: string; name?: string; email?: string };

  @Column('jsonb')
  driver: { age: number };

  @Column('jsonb', { nullable: true })
  route: any; // pickup and dropoff details

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
