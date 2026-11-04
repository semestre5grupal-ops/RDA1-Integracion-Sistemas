import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { randomBytes } from 'crypto';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

/**
 * Columnas = las de la tabla real (01_master_migration_12_schemas.sql). Antes la
 * entidad usaba total_recaudado / monto_liquidar_socio_90pct / fecha_pago, que no
 * existen en la base, y el Panel 4 fallaba. Los nombres de las propiedades se
 * mantienen para no cambiar el resto del código.
 */
@Entity({ name: 'liquidaciones_proveedores', schema: 'schema_finanzas' })
export class LiquidacionProveedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'numero_liquidacion', type: 'varchar', length: 50, unique: true })
  numeroLiquidacion: string; // LIQ-YYYYMM-XXXX

  @BeforeInsert()
  asignarNumero() {
    if (!this.numeroLiquidacion) {
      const d = new Date();
      this.numeroLiquidacion = `LIQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
    }
  }

  @Column({ name: 'proveedor_codigo', type: 'varchar', length: 50 })
  proveedorCodigo: string; // ej. 'NODE_ATR_DILAN', 'NODE_AUT_LOCAL', etc.

  @Column({ type: 'varchar', length: 30 })
  vertical: string;

  @Column({ type: 'varchar', length: 20 })
  periodo: string; // ej. '2026-10-Q1'

  @Column('numeric', {
    name: 'monto_bruto_ventas',
    precision: 10,
    scale: 2,
    default: 0.00,
    transformer: new ColumnNumericTransformer(),
  })
  totalRecaudado: number;

  @Column('numeric', {
    name: 'comision_retenida_booking',
    precision: 10,
    scale: 2,
    default: 0.00,
    transformer: new ColumnNumericTransformer(),
  })
  comisionBooking10pct: number;

  @Column('numeric', {
    name: 'monto_neto_a_pagar',
    precision: 10,
    scale: 2,
    default: 0.00,
    transformer: new ColumnNumericTransformer(),
  })
  montoLiquidarSocio90pct: number;

  @Column('numeric', {
    name: 'porcentaje_comision_booking',
    precision: 5,
    scale: 2,
    default: 10.0,
    transformer: new ColumnNumericTransformer(),
  })
  porcentajeComision: number;

  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' })
  estado: string; // 'PENDIENTE', 'PAGADO', 'CONCILIADO'

  @Column({ name: 'comprobante_pago_url', type: 'text', nullable: true })
  comprobanteTransferenciaUrl: string;

  @Column({ name: 'pagado_at', type: 'timestamptz', nullable: true })
  fechaPago: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
