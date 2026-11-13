import { Column, Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity({ name: 'autos_reservas', schema: 'schema_autos' })
export class OrderAuto {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string; // e.g. RES-AUT-XXXXXX o UUID

  @Column({ name: 'auto_id', type: 'varchar', length: 100 })
  autoId: string;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string;

  @Column({ name: 'nombre_conductor', type: 'varchar', length: 150, default: 'Conductor Principal' })
  nombreConductor: string;

  @Column({ name: 'licencia_conducir', type: 'varchar', length: 50, default: 'LIC-EC-1700000000' })
  licenciaConducir: string;

  @Column({ name: 'fecha_recogida', type: 'timestamptz' })
  fechaRecogida: Date;

  @Column({ name: 'fecha_devolucion', type: 'timestamptz' })
  fechaDevolucion: Date;

  @Column({ name: 'dias_renta', type: 'int', default: 1 })
  diasRenta: number;

  @Column({ name: 'km_salida', type: 'int', nullable: true })
  kmSalida: number;

  @Column({ name: 'km_retorno', type: 'int', nullable: true })
  kmRetorno: number;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    default: 40.00,
    transformer: new ColumnNumericTransformer(),
  })
  total: number;

  @Column({ type: 'varchar', length: 30, default: 'CONFIRMADA' })
  estado: string; // 'CONFIRMADA', 'ACTIVA', 'COMPLETADA', 'CANCELADA'

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true })
  idempotencyKey: string;

  @Column({ name: 'external_order_id', type: 'varchar', length: 100, nullable: true })
  externalOrderId: string;

  @Column({ name: 'pnr', type: 'varchar', length: 50, nullable: true })
  pnrColumn: string;

  @Column({ name: 'checkin_at', type: 'timestamptz', nullable: true })
  checkinAt: Date;

  @Column({ name: 'checkin_admin', type: 'varchar', length: 100, nullable: true })
  checkinAdmin: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  tipoCobertura?: string;
  depositoGarantia?: number;
  route?: any;
  voucherQrData?: string;

  // --- Propiedades de compatibilidad con código existente ---
  get status(): string {
    return this.estado;
  }
  set status(val: string) {
    this.estado = val;
  }

  get pnr(): string {
    return this.id;
  }
  set pnr(val: string) {
    this.id = val;
  }

  get totalPrice(): { currency: string; total: number } {
    return { currency: 'USD', total: Number(this.total || 40.00) };
  }
  set totalPrice(val: { currency: string; total: number } | number) {
    if (typeof val === 'number') {
      this.total = val;
    } else if (val && typeof val === 'object') {
      this.total = val.total;
    }
  }

  private _booker?: any;
  get booker(): { country: string; name?: string; email?: string } {
    return this._booker || {
      country: 'Ecuador',
      name: this.nombreConductor,
      email: 'conductor@booking.local',
    };
  }
  set booker(val: any) {
    this._booker = val;
  }

  private _driver?: any;
  get driver(): any {
    return this._driver || {
      nombre: this.nombreConductor,
      licencia: this.licenciaConducir,
      age: 30,
    };
  }
  set driver(val: any) {
    this._driver = val;
  }

  private _checkinStatus?: string;
  get checkinStatus(): string {
    return this._checkinStatus || (this.kmSalida ? 'ENTREGADO' : 'PENDING_CHECKIN');
  }
  set checkinStatus(val: string) {
    this._checkinStatus = val;
  }
}
