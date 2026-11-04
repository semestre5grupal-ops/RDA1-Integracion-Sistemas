import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity({ name: 'clientes_socios_mapeo', schema: 'schema_clientes' })
@Unique(['cliente_id', 'codigo_nodo'])
export class ClienteSocioMapeo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  cliente_id: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Usuario;

  @Column({ length: 60 })
  codigo_nodo: string;

  @Column({ length: 120 })
  external_client_id: string;

  @Column('jsonb', { default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

