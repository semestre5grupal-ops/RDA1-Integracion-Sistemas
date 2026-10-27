import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WebhookDeliveryStatus =
  | 'EN_COLA'
  | 'PROCESADO'
  | 'ERROR';

@Entity({ name: 'webhook_entregas', schema: 'schema_auditoria' })
@Index('uq_webhook_entregas_evento_id', ['eventId'], { unique: true })
@Index('idx_webhook_entregas_vertical_recibido', ['vertical', 'receivedAt'])
export class WebhookEntrega {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ type: 'varchar', length: 20 })
  vertical: string;

  @Column({ name: 'event_type', type: 'varchar', length: 200 })
  eventType: string;

  @Column({ type: 'text' })
  source: string;

  @Column({ type: 'varchar', length: 20 })
  status: WebhookDeliveryStatus;

  @Column({ name: 'signature_valid', type: 'boolean', default: true })
  signatureValid: boolean;

  @Column({ name: 'correlation_id', type: 'varchar', length: 200, nullable: true })
  correlationId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  traceparent: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'payload_summary', type: 'jsonb', nullable: true })
  payloadSummary: { subject?: string; bytes_size: number } | null;
}
