import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateNested, IsArray, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { BookerDto, AccommodationsGuestsDto } from './contract-common.dto';

export class AvailabilityProductDto {
  @ApiProperty({ description: 'ID de la opción/producto de habitación', example: 'room_deluxe_bb' })
  product_id: string;

  @ApiProperty({ description: 'Nombre descriptivo de la habitación', example: 'Habitación Deluxe con Vista al Mar' })
  room_name: string;

  @ApiProperty({ description: 'Plan de alimentación incluido', example: 'Desayuno Buffet Incluido' })
  meal_plan: string;

  @ApiProperty({ description: 'Política de cancelación', example: 'Cancelación gratuita hasta 48h antes' })
  cancellation_type: string;

  @ApiProperty({ description: 'Precio total del producto', example: 280.0 })
  price: number;

  @ApiProperty({ description: 'Moneda del precio', example: 'USD' })
  currency: string;
}

export class AvailabilityRequestDto {
  @ApiProperty({ description: 'ID del alojamiento a verificar', example: 'aloj-1' })
  accommodation: string | number;

  @ApiProperty({ description: 'Información del comprador', type: BookerDto, required: false })
  @ValidateNested()
  @Type(() => BookerDto)
  @IsOptional()
  booker?: BookerDto;

  @ApiProperty({ description: 'Fecha de check-in (YYYY-MM-DD)', example: '2026-10-10', format: 'date' })
  @IsString()
  checkin: string;

  @ApiProperty({ description: 'Fecha de check-out (YYYY-MM-DD)', example: '2026-10-12', format: 'date' })
  @IsString()
  checkout: string;

  @ApiProperty({ description: 'Composición de huéspedes y habitaciones', type: AccommodationsGuestsDto, required: false })
  @ValidateNested()
  @Type(() => AccommodationsGuestsDto)
  @IsOptional()
  guests?: AccommodationsGuestsDto;

  @ApiProperty({ description: 'Moneda requerida (3 letras mayúsculas)', example: 'USD', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda debe ser código ISO de 3 letras' })
  currency?: string;

  @ApiProperty({ description: 'Extras adicionales', example: ['extra_charges', 'include_bundle_variants'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  extras?: string[];
}

export class AvailabilityResponseDto {
  @ApiProperty({ description: 'Identificador único de la petición de disponibilidad', example: 'req_avail_7890' })
  request_id: string;

  @ApiProperty({
    description: 'Datos de disponibilidad y tarifas de productos',
    example: {
      id: 'aloj-1',
      currency: 'USD',
      url: '/api/v1/alojamientos/aloj-1',
      products: [],
    },
  })
  data: {
    id: string | number;
    currency: string;
    products: AvailabilityProductDto[];
    url?: string;
  };
}

export class BulkAvailabilityFiltersDto {
  @ApiProperty({ description: 'Plan de alimentación deseado', example: 'breakfast_included', required: false })
  @IsString()
  @IsOptional()
  meal_plan?: string;

  @ApiProperty({ description: 'Tipo de cancelación', example: 'free_cancellation', required: false })
  @IsString()
  @IsOptional()
  cancellation_type?: string;
}

export class BulkAvailabilityRequestDto {
  @ApiProperty({ description: 'Lista de IDs de alojamientos', example: ['aloj-1', 'aloj-2'] })
  @IsArray()
  accommodations: (string | number)[];

  @ApiProperty({ description: 'Información del comprador', type: BookerDto, required: false })
  @ValidateNested()
  @Type(() => BookerDto)
  @IsOptional()
  booker?: BookerDto;

  @ApiProperty({ description: 'Fecha de check-in (YYYY-MM-DD)', example: '2026-10-10', format: 'date' })
  @IsString()
  checkin: string;

  @ApiProperty({ description: 'Fecha de check-out (YYYY-MM-DD)', example: '2026-10-12', format: 'date' })
  @IsString()
  checkout: string;

  @ApiProperty({ description: 'Composición de huéspedes y habitaciones', type: AccommodationsGuestsDto, required: false })
  @ValidateNested()
  @Type(() => AccommodationsGuestsDto)
  @IsOptional()
  guests?: AccommodationsGuestsDto;

  @ApiProperty({ description: 'Filtros de tarifas para la búsqueda múltiple', type: BulkAvailabilityFiltersDto, required: false })
  @ValidateNested()
  @Type(() => BulkAvailabilityFiltersDto)
  @IsOptional()
  filters?: BulkAvailabilityFiltersDto;

  @ApiProperty({ description: 'Moneda solicitada', example: 'USD', required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ description: 'Extras adicionales', example: ['extra_charges'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  extras?: string[];
}

export class BulkAvailabilityResponseDto {
  @ApiProperty({ description: 'Identificador único de la solicitud', example: 'req_bulk_456' })
  request_id: string;

  @ApiProperty({ description: 'Disponibilidad por cada alojamiento consultado' })
  data: any[];
}
