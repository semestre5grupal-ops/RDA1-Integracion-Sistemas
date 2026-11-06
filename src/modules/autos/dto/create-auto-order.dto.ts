import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsIn,
  ValidateNested
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

function sanitizeString(val: any): any {
  if (typeof val === 'string') {
    return val.trim().replace(/\s{2,}/g, ' ');
  }
  return val;
}

export class ConductorAutoDto {
  @ApiProperty({ description: 'Nombre completo del conductor titular', example: 'Pedro Ramírez' })
  @IsString({ message: 'El nombre del conductor debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre del conductor es obligatorio.' })
  @MinLength(2, { message: 'El nombre del conductor debe tener al menos 2 caracteres.' })
  @MaxLength(80, { message: 'El nombre del conductor no puede superar 80 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  nombre: string;

  @ApiProperty({ description: 'Alias para nombre completo', example: 'Pedro Ramírez', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => sanitizeString(value))
  nombre_completo?: string;

  @ApiProperty({ description: 'Alias para full name', example: 'Pedro Ramírez', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => sanitizeString(value))
  full_name?: string;

  @ApiProperty({ description: 'Correo electrónico del conductor', example: 'pedro.ramirez@email.com' })
  @IsEmail({}, { message: 'El correo electrónico del conductor no tiene un formato válido.' })
  @MaxLength(120, { message: 'El correo del conductor no puede superar 120 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  email: string;

  @ApiProperty({ description: 'Alias para correo', example: 'pedro.ramirez@email.com', required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) => sanitizeString(value))
  correo?: string;

  @ApiProperty({ description: 'Teléfono de contacto', example: '+593998765432', required: false })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto.' })
  @MaxLength(25, { message: 'El teléfono no puede exceder 25 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  telefono?: string;

  @ApiProperty({ description: 'Alias para phone', example: '+593998765432', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Transform(({ value }) => sanitizeString(value))
  phone?: string;

  @ApiProperty({ description: 'Número de cédula o licencia', example: '1723456789', required: false })
  @IsOptional()
  @IsString({ message: 'La licencia debe ser texto.' })
  @MaxLength(25, { message: 'La licencia no puede exceder 25 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  licencia?: string;

  @ApiProperty({ description: 'Alias para licencia de conducir', example: '1723456789', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Transform(({ value }) => sanitizeString(value))
  licencia_conducir?: string;

  @ApiProperty({ description: 'País emisor de la licencia', example: 'Ecuador', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => sanitizeString(value))
  pais_licencia?: string;

  @ApiProperty({ description: 'Edad del conductor', example: 28, required: false })
  @IsOptional()
  @IsInt({ message: 'La edad del conductor debe ser un número entero.' })
  @Min(18, { message: 'El conductor debe tener al menos 18 años.' })
  @Max(99, { message: 'La edad máxima permitida es de 99 años.' })
  edad?: number;

  @ApiProperty({ description: 'Alias para edad del conductor', example: 28, required: false })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  edad_conductor?: number;

  @ApiProperty({ description: 'Alias para driver age', example: 28, required: false })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  driver_age?: number;

  @ApiProperty({ description: 'Número de vuelo de llegada', example: 'EQ-312', required: false })
  @IsOptional()
  @IsString({ message: 'El número de vuelo debe ser texto.' })
  @MaxLength(15, { message: 'El número de vuelo no puede exceder 15 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  numero_vuelo?: string;
}

export class CreateAutoOrderDto {
  @ApiProperty({ description: 'ID del vehículo a alquilar', example: 'auto-spark-01' })
  @IsString({ message: 'El ID del vehículo debe ser texto.' })
  @IsNotEmpty({ message: 'El ID del vehículo es obligatorio.' })
  @MaxLength(50, { message: 'El ID del vehículo no puede exceder 50 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  vehicle_id: string;

  @ApiProperty({ description: 'Alias en español para el ID del vehículo', example: 'auto-spark-01', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => sanitizeString(value))
  auto_id?: string;

  @ApiProperty({ description: 'Cantidad de días de alquiler', example: 3, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de días debe ser un número entero.' })
  @Min(1, { message: 'El período mínimo de alquiler es de 1 día.' })
  @Max(30, { message: 'El período máximo continuo de alquiler es de 30 días.' })
  dias?: number;

  @ApiProperty({ description: 'Fecha de recogida (YYYY-MM-DD)', example: '2026-11-10', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pickup_date?: string;

  @ApiProperty({ description: 'Alias fecha de recogida', example: '2026-11-10', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fecha_recogida?: string;

  @ApiProperty({ description: 'Hora de recogida (HH:MM)', example: '10:00', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hora_recogida?: string;

  @ApiProperty({ description: 'Fecha de devolución (YYYY-MM-DD)', example: '2026-11-12', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dropoff_date?: string;

  @ApiProperty({ description: 'Alias fecha de devolución', example: '2026-11-12', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fecha_devolucion?: string;

  @ApiProperty({ description: 'Hora de devolución (HH:MM)', example: '10:00', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hora_devolucion?: string;

  @ApiProperty({ description: 'Lugar u oficina de recogida', example: 'Aeropuerto Mariscal Sucre (UIO)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pickup_location?: string;

  @ApiProperty({ description: 'Alias lugar de recogida', example: 'UIO Aeropuerto', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lugar_recogida?: string;

  @ApiProperty({ description: 'Lugar u oficina de devolución', example: 'Aeropuerto Mariscal Sucre (UIO)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dropoff_location?: string;

  @ApiProperty({ description: 'Alias lugar de devolución', example: 'UIO Aeropuerto', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lugar_devolucion?: string;

  @ApiProperty({ description: 'Tipo de cobertura solicitada', example: 'BASICA', enum: ['BASICA', 'TOTAL', 'PREMIUM', 'Basica', 'Total'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['BASICA', 'TOTAL', 'PREMIUM', 'Basica', 'Total'], { message: 'El tipo de cobertura debe ser BASICA, TOTAL o PREMIUM.' })
  tipo_cobertura?: string;

  @ApiProperty({ description: 'Alias para tipo de cobertura', example: 'TOTAL', required: false })
  @IsOptional()
  @IsString()
  cobertura?: string;

  @ApiProperty({ description: 'Datos del conductor titular', type: ConductorAutoDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConductorAutoDto)
  conductor?: ConductorAutoDto;

  @ApiProperty({ description: 'Objeto de conductor opcional', required: false })
  @IsOptional()
  driver?: any;

  @ApiProperty({ description: 'Objeto de contratante opcional', required: false })
  @IsOptional()
  booker?: any;

  @ApiProperty({ description: 'Ruta o itinerario opcional', required: false })
  @IsOptional()
  route?: any;

  @ApiProperty({ description: 'Datos del vehículo opcional', required: false })
  @IsOptional()
  vehiculo?: any;

  @ApiProperty({ description: 'Método de pago', example: 'TARJETA', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  payment_method?: string;

  @ApiProperty({ description: 'Alias para método de pago', example: 'TARJETA', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  metodo_pago?: string;

  @ApiProperty({ description: 'Clave de idempotencia opcional', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotency_key?: string;

  @ApiProperty({ description: 'Identificador de la transacción Saga distribuida', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  saga_id?: string;
}
