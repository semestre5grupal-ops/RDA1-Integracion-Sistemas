import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ModoSimuladorPago } from '../pagos.service';

export class ProcesarPagoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  metodo_pago?: string;

  @IsOptional()
  @IsString()
  numero_tarjeta?: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsUUID()
  factura_id?: string;

  @IsOptional()
  @IsUUID()
  carrito_id?: string;

  @IsOptional()
  @IsEnum(['NORMAL', 'RECHAZO_FONDOS', 'TIMEOUT_RED', 'ERROR_INTERNO', 'FRAUDE'])
  simular_escenario?: ModoSimuladorPago;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class ProcesarReembolsoDto {
  @IsOptional()
  @IsUUID()
  transaccion_id?: string;

  @IsOptional()
  @IsString()
  codigo_autorizacion?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto?: number;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class UpdateConfigSimuladorDto {
  @IsEnum(['NORMAL', 'RECHAZO_FONDOS', 'TIMEOUT_RED', 'ERROR_INTERNO', 'FRAUDE'])
  modo: ModoSimuladorPago;

  @IsOptional()
  @IsNumber()
  @Min(0)
  latencia_ms?: number;
}

export class AsociarReservaPagoDto {
  @IsString()
  reserva_id: string;
}
