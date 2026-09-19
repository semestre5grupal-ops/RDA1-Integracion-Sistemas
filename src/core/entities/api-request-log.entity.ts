import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity('api_request_logs')
export class ApiRequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ length: 10 })
  metodo: string;

  @Column('text')
  ruta: string;

  @Column('int')
  status_code: number;

  @Column('int')
  duracion_ms: number;

  @Column({ length: 45, nullable: true })
  ip_cliente: string;

  @Column('text', { nullable: true })
  user_agent: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
