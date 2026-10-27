import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity({ name: 'config_proveedor', schema: 'schema_proveedores' })
export class ConfigProveedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_nodo', type: 'varchar', length: 50, unique: true })
  codigoNodo: string; // ej. 'NODE_ATR_DILAN', 'NODE_AUT_LOCAL', etc.

  @Column({ name: 'nombre_proveedor', type: 'varchar', length: 150 })
  nombreProveedor: string;

  @Column({ type: 'varchar', length: 30 })
  vertical: string;

  @Column({ name: 'base_url_rest', type: 'text' })
  baseUrlRest: string;

  @Column({ name: 'endpoint_grpc', type: 'varchar', length: 100, nullable: true })
  endpointGrpc: string;

  @Column({ name: 'api_key', type: 'varchar', length: 255, nullable: true })
  apiKey?: string;

  @Column({ name: 'health_status', type: 'varchar', length: 20, default: 'HEALTHY' })
  healthStatus: string; // 'HEALTHY', 'DEGRADED', 'DOWN'

  @Column({ name: 'latencia_ms', type: 'int', default: 0 })
  latenciaMs: number;

  @Column({ name: 'ultimo_ping_at', type: 'timestamptz', default: () => 'NOW()' })
  ultimoPingAt: Date;

  @Column({ name: 'kill_switch_activo', type: 'boolean', default: false })
  killSwitchActivo: boolean;

  @Column({ name: 'circuit_breaker_estado', type: 'varchar', length: 20, default: 'CLOSED' })
  circuitBreakerEstado: string; // 'CLOSED', 'OPEN', 'HALF_OPEN'

  @Column('numeric', {
    name: 'tasa_fallos_pct',
    precision: 5,
    scale: 2,
    default: 0.00,
    transformer: new ColumnNumericTransformer(),
  })
  tasaFallosPct: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  equipo?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contacto?: string;

  @Column({ type: 'varchar', length: 20, default: '🔗' })
  emoji?: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
