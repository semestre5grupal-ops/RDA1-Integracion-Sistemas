import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'alojamientos_eventos_outbox', schema: 'schema_alojamientos' })
export class EventoOutboxAlojamiento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId: string;

  @Column('jsonb')
  payload: any;

  @Column({ name: 'published_rabbit', type: 'boolean', default: false })
  publishedRabbit: boolean;

  @Column({ name: 'published_kafka', type: 'boolean', default: false })
  publishedKafka: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

