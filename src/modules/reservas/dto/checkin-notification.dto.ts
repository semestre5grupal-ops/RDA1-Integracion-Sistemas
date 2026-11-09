import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CheckinNotificationDto {
  @ApiPropertyOptional({ description: 'ID de reserva o localizador externo emitido por el socio', example: 'CAR532X9' })
  @IsString()
  @IsOptional()
  external_order_id?: string;

  @ApiPropertyOptional({ description: 'Alias para external_order_id', example: 'CAR532X9' })
  @IsString()
  @IsOptional()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Identificador del cliente en el sistema del socio', example: 'CLI-RL-1029' })
  @IsString()
  @IsOptional()
  client_id?: string;

  @ApiPropertyOptional({ description: 'Documento de identidad o cédula del cliente', example: '1720000000' })
  @IsString()
  @IsOptional()
  document_id?: string;

  @ApiPropertyOptional({ description: 'Alias para documento de identidad en español', example: '1720000000' })
  @IsString()
  @IsOptional()
  documento_identidad?: string;

  @ApiPropertyOptional({ description: 'Alias para cédula', example: '1720000000' })
  @IsString()
  @IsOptional()
  cedula?: string;

  @ApiPropertyOptional({ description: 'Alias para identificación', example: '1720000000' })
  @IsString()
  @IsOptional()
  identificacion?: string;

  @ApiPropertyOptional({ description: 'Código o nombre del guía asignado', example: 'Carlos Villacís' })
  @IsString()
  @IsOptional()
  guia_codigo?: string;

  @ApiPropertyOptional({ description: 'Guía asignado', example: 'Carlos Villacís' })
  @IsString()
  @IsOptional()
  guia_asignado?: string;

  @ApiPropertyOptional({ description: 'Código de reserva canónico', example: 'GLO-1234' })
  @IsString()
  @IsOptional()
  reservation_code?: string;

  @ApiPropertyOptional({ description: 'Estado resultante tras la validación física en el socio', example: 'CONFIRMADO_ASISTIDO' })
  @IsString()
  @IsOptional()
  estado?: string;

  @ApiPropertyOptional({ description: 'Alias en inglés para estado', example: 'CONFIRMED' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Cantidad de personas o pasajeros reales que asistieron', example: 1 })
  @IsNumber()
  @IsOptional()
  asistentes_reales?: number;

  @ApiPropertyOptional({
    description: 'Alias de asistentes_reales con el nombre que la cátedra indicó a los socios de alojamientos',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  huespedes_reales?: number;

  @ApiPropertyOptional({ description: 'Identificador del operador, guía o recepcionista que procesó la llegada', example: 'operador-01' })
  @IsString()
  @IsOptional()
  admin_id?: string;

  @ApiPropertyOptional({ description: 'Alias para admin_id', example: 'operador-01' })
  @IsString()
  @IsOptional()
  staff_user?: string;

  @ApiPropertyOptional({ description: 'Fecha y hora UTC en que se confirmó la asistencia', example: '2026-11-04T19:30:00.000Z' })
  @IsString()
  @IsOptional()
  fecha_checkin?: string;

  @ApiPropertyOptional({ description: 'Alias para fecha_checkin', example: '2026-11-04T19:30:00.000Z' })
  @IsString()
  @IsOptional()
  checked_in_at?: string;

  @ApiPropertyOptional({ description: 'Observaciones operativas tomadas en mostrador o punto de encuentro' })
  @IsString()
  @IsOptional()
  observaciones?: string;

  @ApiPropertyOptional({ description: 'Alias para observaciones' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'ID del dispositivo móvil o terminal usado para validar' })
  @IsString()
  @IsOptional()
  scanner_device_id?: string;

  @ApiPropertyOptional({ description: 'Placa del vehículo en checkin' })
  @IsString()
  @IsOptional()
  placa?: string;

  @ApiPropertyOptional({ description: 'Plate del vehículo en checkin' })
  @IsString()
  @IsOptional()
  plate?: string;

  @ApiPropertyOptional({ description: 'Código de reserva alternativo' })
  @IsString()
  @IsOptional()
  codigo_reserva?: string;

  @ApiPropertyOptional({ description: 'Localizador' })
  @IsString()
  @IsOptional()
  localizador?: string;

  @ApiPropertyOptional({ description: 'Código PNR de la reserva' })
  @IsString()
  @IsOptional()
  pnr?: string;

  @ApiPropertyOptional({ description: 'ID o código de reserva alternativo' })
  @IsString()
  @IsOptional()
  reserva_id?: string;

  @ApiPropertyOptional({ description: 'ID de reserva interna del socio' })
  @IsString()
  @IsOptional()
  reservation_id?: string;

  @ApiPropertyOptional({ description: 'Kilometraje registrado en salida' })
  @IsNumber()
  @IsOptional()
  km_salida?: number;

  @ApiPropertyOptional({ description: 'Nivel de combustible' })
  @IsNumber()
  @IsOptional()
  fuel_level?: number;

  @ApiPropertyOptional({ description: 'Proveedor o socio' })
  @IsString()
  @IsOptional()
  proveedor?: string;

  @ApiPropertyOptional({ description: 'Modulo del sistema' })
  @IsString()
  @IsOptional()
  modulo?: string;

  @ApiPropertyOptional({ description: 'Tipo' })
  @IsString()
  @IsOptional()
  tipo?: string;

  @ApiPropertyOptional({ description: 'ID' })
  @IsString()
  @IsOptional()
  id?: string;
}
