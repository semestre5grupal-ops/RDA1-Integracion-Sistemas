import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('estado_servicios')
export class EstadoServicio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  nombre_servicio: string;

  @Column('text')
  url_healthcheck: string;

  @Column('text')
  estado: string; // 'UP', 'DOWN', 'DEGRADED'

  @Column('int', { nullable: true })
  tiempo_respuesta_ms: number;

  @Column('text', { nullable: true })
  ultimo_error: string;

  @CreateDateColumn({ type: 'timestamptz' })
  verificado_at: Date;
}
