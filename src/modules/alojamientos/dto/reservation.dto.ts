import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsInt, Min, Max, IsEmail, IsOptional, IsNotEmpty, MaxLength, IsBoolean, IsIn, IsArray,
  ArrayMaxSize, ValidateNested, Matches, MinLength,
} from 'class-validator';
import { PriceDto } from './nested-types.dto';

/** Acompañante del huésped titular (Booking pide el nombre de cada huésped). */
export class AcompananteDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;

  @ApiProperty({ required: false, example: 'Pérez' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  apellido?: string;

  @ApiProperty({ required: false, enum: ['ADULTO', 'NINO'], default: 'ADULTO' })
  @IsIn(['ADULTO', 'NINO'])
  @IsOptional()
  tipo?: 'ADULTO' | 'NINO';

  @ApiProperty({ required: false, example: 8, description: 'Obligatoria para niños (0–17).' })
  @IsInt()
  @Min(0)
  @Max(120)
  @IsOptional()
  edad?: number;

  @ApiProperty({ required: false, enum: ['CEDULA', 'PASAPORTE', 'DNI', 'OTRO'] })
  @IsIn(['CEDULA', 'PASAPORTE', 'DNI', 'OTRO'])
  @IsOptional()
  documento_tipo?: string;

  @ApiProperty({ required: false, example: '1712345678' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  documento_numero?: string;

  @ApiProperty({ required: false, example: 'EC', description: 'ISO 3166-1 alfa-2' })
  @Matches(/^[A-Z]{2}$/, { message: 'nacionalidad debe ser un código ISO de 2 letras mayúsculas (ej. EC).' })
  @IsOptional()
  nacionalidad?: string;
}

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
  @Max(30)
  habitaciones_count: number;

  @ApiProperty({ description: 'Cantidad de noches', example: 5, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  nights?: number;

  @ApiProperty({ description: 'Nombre completo del cliente', example: 'Juan Perez' })
  @IsString()
  @IsNotEmpty({ message: 'customer_name es obligatorio' })
  @MaxLength(150)
  customer_name: string;

  @ApiProperty({ description: 'Cantidad de adultos', example: 2, required: false })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  adultos?: number;

  @ApiProperty({ description: 'Cantidad de adultos (alias de adultos)', example: 2, required: false })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  number_of_adults?: number;

  @ApiProperty({ description: 'Cantidad de niños', example: 0, required: false })
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  ninos?: number;

  @ApiProperty({ description: 'Cantidad de niños (alias de ninos)', example: 0, required: false })
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  number_of_children?: number;

  @ApiProperty({ description: 'Cantidad de habitaciones (alias de habitaciones_count)', example: 1, required: false })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  number_of_rooms?: number;

  @ApiProperty({ description: 'Cantidad total de huéspedes', example: 2, required: false })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  huespedes?: number;

  @ApiProperty({ description: 'Email del cliente', example: 'juan@example.com', required: false })
  @IsEmail()
  @IsOptional()
  customer_email?: string;

  @ApiProperty({ description: 'Teléfono de contacto', example: '+593 0991234567', required: false })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Nombre del huésped principal (si no es quien reserva)', example: 'Juan Perez', required: false })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  guest_name?: string;

  @ApiProperty({ description: 'Peticiones especiales', example: 'Cama extra si es posible', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  special_requests?: string;

  @ApiProperty({ description: 'Hora estimada de llegada', example: '15:00 - 16:00', required: false })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  arrival_time?: string;

  @ApiProperty({ description: 'Propósito del viaje', example: 'leisure', required: false })
  @IsString()
  @IsOptional()
  travel_purpose?: string;

  @ApiProperty({ description: 'Titular de la tarjeta', example: 'Juan Perez', required: false })
  @IsString()
  @IsOptional()
  card_holder?: string;

  @ApiProperty({ description: 'Método de pago', example: 'pay_at_property', required: false })
  @IsString()
  @IsOptional()
  payment_method?: string;

  @ApiProperty({
    required: false,
    example: '3f1c2a9e-7b6d-4e8f-9a0b-1c2d3e4f5a6b',
    description:
      'Tipo de habitación (id o código, de GET /alojamientos/{id} → tipos_habitacion). Si no se indica, se asigna el más barato que tenga cupo y capacidad.',
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  tipo_habitacion_id?: string;

  @ApiProperty({
    required: false,
    example: 'PROD-31-8982',
    description: 'Alias de tipo_habitacion_id para compatibilidad con nodos socios.',
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  producto_id?: string;

  @ApiProperty({
    required: false,
    type: [AcompananteDto],
    description: 'Acompañantes del titular. Como máximo (adultos − 1) adultos y `ninos` niños.',
  })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => AcompananteDto)
  @IsOptional()
  acompanantes?: AcompananteDto[];

  @ApiProperty({
    description:
      'El cliente confirma que quiere reservar aunque ya tenga una reserva en este alojamiento para fechas que se solapan.',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  confirmar_duplicado?: boolean;

  @ApiProperty({
    required: false,
    enum: ['CEDULA', 'PASAPORTE', 'RUC'],
    example: 'CEDULA',
    description: 'Tipo de documento del titular. Obligatorio (con documento_numero) en hoteles de socios: el hotel lo exige.',
  })
  @IsIn(['CEDULA', 'PASAPORTE', 'RUC'])
  @IsOptional()
  documento_tipo?: 'CEDULA' | 'PASAPORTE' | 'RUC';

  @ApiProperty({
    required: false,
    example: '1710034065',
    description: 'Número de documento del titular (cédula de 10 dígitos, pasaporte o RUC). El hotel lo valida.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,13}$/, { message: 'documento_numero debe tener entre 6 y 13 letras o dígitos' })
  @IsOptional()
  documento_numero?: string;
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
  // Opcional, como en Booking: el motivo se pide pero no bloquea la cancelación.
  @ApiProperty({ description: 'Razón de la cancelación', example: 'Cambio de planes de viaje', required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
