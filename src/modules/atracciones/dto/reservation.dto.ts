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
  Matches
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PriceDto } from './nested-types.dto';

/**
 * Función auxiliar para colapsar espacios y recortar extremos en cadenas de texto
 */
function sanitizeString(val: any): any {
  if (typeof val === 'string') {
    return val.trim().replace(/\s{2,}/g, ' ');
  }
  return val;
}

export class ReservationRequestDto {
  @ApiProperty({ description: 'ID de la atracción', example: 'PRhu4UBTWPBC', required: false })
  @IsOptional()
  @IsString({ message: 'El ID de la atracción debe ser texto.' })
  @MaxLength(64)
  atraccion_id?: string;

  @ApiProperty({ description: 'ID de la atracción (alias camelCase)', required: false })
  @IsOptional()
  @IsString()
  atraccionId?: string;

  @ApiProperty({ description: 'Código del proveedor del socio', required: false })
  @IsOptional()
  @IsString()
  proveedor_codigo?: string;

  @ApiProperty({ description: 'Partner ID del socio', required: false })
  @IsOptional()
  @IsString()
  partner_id?: string;

  @ApiProperty({ description: 'Fecha para la reserva (YYYY-MM-DD)', example: '2026-10-25', format: 'date', required: false })
  @IsOptional()
  @IsString({ message: 'La fecha debe ser una cadena de texto.' })
  @MaxLength(10, { message: 'La fecha no puede exceder 10 caracteres.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El formato de fecha debe ser estrictamente YYYY-MM-DD.' })
  @Transform(({ value }) => sanitizeString(value))
  date?: string;

  @ApiProperty({ description: 'Alias canónico fecha para la reserva (YYYY-MM-DD)', example: '2026-10-25', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;

  @ApiProperty({ description: 'Alias fecha de uso', example: '2026-10-25', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_uso?: string;

  @ApiProperty({ description: 'Hora o turno seleccionado', example: '10:00 a.m.', required: false })
  @IsString({ message: 'El turno horario debe ser una cadena de texto.' })
  @IsOptional()
  @MaxLength(30, { message: 'La hora seleccionada no puede exceder 30 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  time?: string;

  @ApiProperty({ description: 'Alias canónico hora del turno', example: '10:30 a.m.', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  hora?: string;

  @ApiProperty({ description: 'Hora normalizada en formato 24 horas', example: '10:30:00', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  time_24h?: string;

  @ApiProperty({ description: 'Alias hora de inicio', example: '10:00 a.m.', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  hora_inicio?: string;

  @ApiProperty({ description: 'Identificador unívoco del turno horario (Time Slot)', example: 'slot-20261025-1030', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slot_id?: string;

  @ApiProperty({ description: 'Cantidad total de tickets', example: 2, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de tickets debe ser un número entero.' })
  @Min(1, { message: 'Debe reservar al menos 1 ticket.' })
  @Max(30, { message: 'El límite máximo por reserva es de 30 tickets.' })
  ticket_count?: number;

  @ApiProperty({ description: 'Cantidad de adultos (tarifa 100%)', example: 1, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de adultos debe ser entero.' })
  @Min(0)
  @Max(30)
  adult_count?: number;

  @ApiProperty({ description: 'Alias español cantidad de adultos', example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidad_adultos?: number;

  @ApiProperty({ description: 'Cantidad de niños (tarifa 50%)', example: 0, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de niños debe ser entero.' })
  @Min(0)
  @Max(30)
  child_count?: number;

  @ApiProperty({ description: 'Alias español cantidad de niños', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidad_ninos?: number;

  @ApiProperty({ description: 'Cantidad de adultos mayores / senior 65+ (tarifa 70%)', example: 0, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de seniors debe ser entero.' })
  @Min(0)
  @Max(30)
  senior_count?: number;

  @ApiProperty({ description: 'Alias español cantidad de seniors', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidad_seniors?: number;

  @ApiProperty({ description: 'Cantidad de estudiantes', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  student_count?: number;

  @ApiProperty({ description: 'Alias español cantidad de estudiantes', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidad_estudiantes?: number;

  @ApiProperty({ description: 'Cantidad de bebés / infantes ($0 con aforo legal)', example: 0, required: false })
  @IsOptional()
  @IsInt({ message: 'La cantidad de infantes debe ser entero.' })
  @Min(0)
  @Max(30)
  infant_count?: number;

  @ApiProperty({ description: 'Alias español cantidad de infantes', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  cantidad_infantes?: number;

  @ApiProperty({ description: 'Nombre completo del cliente titular', example: 'Juan Pérez', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre del cliente debe ser una cadena de texto.' })
  @MaxLength(80, { message: 'El nombre del cliente no puede exceder 80 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  customer_name?: string;

  @ApiProperty({ description: 'Email del cliente', example: 'juan@example.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido.' })
  @MaxLength(120, { message: 'El correo electrónico no puede exceder 120 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  customer_email?: string;

  @ApiProperty({ description: 'Número de documento de identidad o pasaporte', example: '1723456789', required: false })
  @IsOptional()
  @IsString({ message: 'El documento debe ser una cadena de texto.' })
  @MaxLength(20, { message: 'El documento no puede exceder 20 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  document_id?: string;

  @ApiProperty({ description: 'Teléfono de contacto', example: '+593987654321', required: false })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto.' })
  @MaxLength(25, { message: 'El teléfono no puede exceder 25 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  customer_phone?: string;

  @ApiProperty({ description: 'Objeto de contacto del cliente titular conforme a OpenAPI v2', required: false })
  @IsOptional()
  customer?: {
    full_name?: string;
    nombre?: string;
    email?: string;
    phone?: string;
    telefono?: string;
    document_id?: string;
    documento_identidad?: string;
  };

  @ApiProperty({ description: 'Listado de acompañantes adicionales', required: false })
  @IsOptional()
  passengers?: any[];

  @ApiProperty({ description: 'Identificador de la transacción distribuida Saga', example: 'SAGA-7K2X9M', required: false })
  @IsOptional()
  @IsString()
  saga_id?: string;

  @ApiProperty({ description: 'Método de pago seleccionado', example: 'SOA_BOOKING_GATEWAY', required: false })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiProperty({ description: 'Alias español método de pago', example: 'SOA_BOOKING_GATEWAY', required: false })
  @IsOptional()
  @IsString()
  metodo_pago?: string;

  @ApiProperty({ description: 'Requerimientos especiales, alergias o movilidad reducida', example: 'Silla de ruedas', required: false })
  @IsOptional()
  @IsString({ message: 'Los requerimientos especiales deben ser una cadena de texto.' })
  @MaxLength(300, { message: 'Los requerimientos especiales no pueden exceder 300 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  special_requirements?: string;

  @ApiProperty({ description: 'Alias español observaciones', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @ApiProperty({ description: 'ID de cliente local opcional', required: false })
  @IsOptional()
  @IsString()
  cliente_id?: string;

  @ApiProperty({ description: 'Idempotency key opcional en body', required: false })
  @IsOptional()
  @IsString()
  idempotency_key?: string;

  @ApiProperty({ description: 'Correlation ID opcional en body', required: false })
  @IsOptional()
  @IsString()
  correlation_id?: string;
}

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED'
}

export class ReservationResponseDto {
  @ApiProperty({ description: 'ID único de reserva', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  reservation_id: string;

  @ApiProperty({ description: 'Estado de la reserva', enum: ReservationStatus, example: ReservationStatus.CONFIRMED })
  status: ReservationStatus;

  @ApiProperty({ description: 'Cantidad de tickets reservados', example: 2 })
  ticket_count: number;

  @ApiProperty({ description: 'Precio total de la reserva', type: PriceDto })
  total_price: PriceDto;
}

export class CancelReservationRequestDto {
  @ApiProperty({ description: 'Razón justificada de la cancelación', example: 'Imprevisto de viaje' })
  @IsString({ message: 'La razón de cancelación debe ser texto.' })
  @IsNotEmpty({ message: 'El motivo de cancelación no puede estar vacío.' })
  @MinLength(3, { message: 'El motivo de cancelación debe tener al menos 3 caracteres descriptivos.' })
  @MaxLength(500, { message: 'El motivo de cancelación no puede superar 500 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  reason: string;

  @ApiProperty({ description: 'Solicitante de la cancelación', example: 'CLIENTE', required: false })
  @IsOptional()
  @IsString()
  solicitante?: string;
}

export class CheckinAtraccionDto {
  @ApiProperty({ description: 'Documento de identidad o pasaporte del visitante', example: '1723456789', required: false })
  @IsOptional()
  @IsString({ message: 'El documento de identidad debe ser una cadena de texto.' })
  @MaxLength(20, { message: 'El documento de identidad no puede exceder 20 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  documento_identidad?: string;

  @ApiProperty({ description: 'Alias canónico titular documento', example: '1723456789', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  titular_documento?: string;

  @ApiProperty({ description: 'Guía turístico asignado opcional', example: 'Carlos Villacís', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre del guía debe ser una cadena de texto.' })
  @MaxLength(80, { message: 'El nombre del guía no puede exceder 80 caracteres.' })
  @Transform(({ value }) => sanitizeString(value))
  guia_asignado?: string;

  @ApiProperty({ description: 'Código del guía oficial', example: 'GUIA-CARLOS-01', required: false })
  @IsOptional()
  @IsString()
  guia_codigo?: string;

  @ApiProperty({ description: 'Payload del código QR presentado', example: 'DEC-7F3K9Q', required: false })
  @IsOptional()
  @IsString()
  qr_payload?: string;

  @ApiProperty({ description: 'Hora de check-in ISO', example: '2026-10-25T08:45:12Z', required: false })
  @IsOptional()
  @IsString()
  hora_checkin?: string;

  @ApiProperty({ description: 'Identificador del dispositivo escáner', example: 'SCANNER-TERMINAL-04', required: false })
  @IsOptional()
  @IsString()
  scanner_device_id?: string;
}
