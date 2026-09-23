import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('autos')
export class Auto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  supplier_name: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 50.00 })
  price: number;

  @Column('jsonb', { nullable: true })
  vehicle_info: {
    category: string;
    type: string;
    transmission: string;
    fuel: string;
    air_conditioning: boolean;
    doors: number;
    seats: number;
    bags: number;
  };

  @Column('jsonb', { nullable: true })
  images: string[];

  @Column({ type: 'boolean', default: true })
  available: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;
}
