import { Column, Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('hosts')
export class Host {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  acerca_de?: string;

  @Column({ name: 'tiempo_respuesta', type: 'varchar', length: 50, default: 'en menos de una hora' })
  tiempoRespuesta: string;

  @Column({ name: 'tasa_respuesta', type: 'int', default: 98 })
  tasaRespuesta: number;

  @Column({ name: 'es_superhost', type: 'boolean', default: true })
  esSuperhost: boolean;

  @Column({ name: 'foto_perfil', type: 'text', nullable: true })
  fotoPerfil?: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
