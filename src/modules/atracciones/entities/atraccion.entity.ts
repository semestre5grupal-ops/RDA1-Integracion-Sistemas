import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('atracciones')
export class Atraccion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text' })
  long_description: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  duration: string;

  @Column('jsonb', { nullable: true })
  price: { currency: string; total: number };

  @Column('jsonb', { nullable: true })
  categories: string[];

  @Column('jsonb', { nullable: true })
  badges: string[];

  @Column('jsonb', { nullable: true })
  locations: any[];

  @Column('jsonb', { nullable: true })
  photos: any[];

  @Column('jsonb', { nullable: true })
  operator: { id: number; name: string };

  @Column({ type: 'varchar', length: 50, default: 'SINGLE_TICKET' })
  product_type: string;

  @Column('jsonb', { nullable: true })
  includes: string[];

  @Column('jsonb', { nullable: true })
  supported_languages: string[];

  @Column({ type: 'boolean', default: false })
  free_cancellation: boolean;

  @Column('jsonb', { nullable: true })
  ratings: { number_of_reviews: number; score: number };

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;
}
