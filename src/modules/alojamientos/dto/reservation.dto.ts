import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, IsEmail, IsOptional } from 'class-validator';
import { PriceDto } from './nested-types.dto';

export class ReservationRequestDto {
  @ApiProperty({ description: 'Fecha de check-in', example: '2026-10-10', format: 'date' })
  @IsString()
  checkin: string;

  @ApiProperty({ description: 'Fecha de check-out', example: '2026-10-15', format: 'date' })
  @IsString()
  checkout: string;

  @ApiProperty({ description: 'Cantidad de habitaciones', example: 1 })
  @IsInt()
  @Min(1)
  habitaciones_count: number;

  @ApiProperty({ description: 'Cantidad de noches', example: 5, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  nights?: number;

  @ApiProperty({ description: 'Nombre completo del cliente', example: 'Juan Perez' })
  @IsString()
  customer_name: string;

  @ApiProperty({ description: 'Cantidad de adultos', example: 2, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  adultos?: number;

  @ApiProperty({ description: 'Cantidad de niños', example: 0, required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  ninos?: number;

  @ApiProperty({ description: 'Email del cliente', example: 'juan@example.com', required: false })
  @IsEmail()
  @IsOptional()
  customer_email?: string;
}

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

export class ReservationResponseDto {
  @ApiProperty({ description: 'ID único de reserva', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  reservation_id: string;

  @ApiProperty({ description: 'Estado de la reserva', enum: ReservationStatus, example: ReservationStatus.CONFIRMED })
  status: ReservationStatus;

  @ApiProperty({ description: 'Cantidad de habitaciones reservadas', example: 1 })
  habitaciones_count: number;

  @ApiProperty({ description: 'Noches reservadas', example: 5 })
  nights: number;

  @ApiProperty({ description: 'Precio total de la reserva', type: PriceDto })
  total_price: PriceDto;

  @ApiProperty({ description: 'HATEOAS links para navegación', required: false })
  _links?: any;
}

export class CancelReservationRequestDto {
  @ApiProperty({ description: 'Razón de la cancelación', example: 'Cambio de planes de viaje' })
  @IsString()
  reason: string;
}
