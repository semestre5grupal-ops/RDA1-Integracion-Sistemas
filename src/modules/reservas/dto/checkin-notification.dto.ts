import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckinNotificationDto {
  @ApiProperty({ description: 'ID de reserva o localizador externo emitido por el socio', example: 'CAR532X9' })
  @IsString()
  @IsNotEmpty()
  external_order_id: string;

  @ApiPropertyOptional({ description: 'Identificador del cliente en el sistema del socio', example: 'CLI-RL-1029' })
  @IsString()
  @IsOptional()
  client_id?: string;

  @ApiProperty({ description: 'Estado resultante tras la validación física en el socio', example: 'CONFIRMADO_ASISTIDO' })
  @IsString()
  @IsNotEmpty()
  estado: string;

  @ApiPropertyOptional({ description: 'Cantidad de personas o pasajeros reales que asistieron', example: 1 })
  @IsNumber()
  @IsOptional()
  asistentes_reales?: number;

  @ApiPropertyOptional({ description: 'Identificador del operador, guía o recepcionista que procesó la llegada', example: 'operador-01' })
  @IsString()
  @IsOptional()
  admin_id?: string;

  @ApiPropertyOptional({ description: 'Fecha y hora UTC en que se confirmó la asistencia', example: '2026-11-04T19:30:00.000Z' })
  @IsString()
  @IsOptional()
  fecha_checkin?: string;

  @ApiPropertyOptional({ description: 'Observaciones operativas tomadas en mostrador o punto de encuentro' })
  @IsString()
  @IsOptional()
  observaciones?: string;

  @ApiPropertyOptional({ description: 'ID del dispositivo móvil o terminal usado para validar' })
  @IsString()
  @IsOptional()
  scanner_device_id?: string;
}

