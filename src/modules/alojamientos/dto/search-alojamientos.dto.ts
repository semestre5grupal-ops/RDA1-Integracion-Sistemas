import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, ValidateNested, IsNumber, IsArray, Matches, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BookerDto, AccommodationsGuestsDto } from './contract-common.dto';

export class DatesDto {
  @ApiProperty({ example: '2026-12-18', format: 'date' })
  @IsString()
  checkin: string;

  @ApiProperty({ example: '2026-12-20', format: 'date' })
  @IsString()
  checkout: string;
}

export class RatingFilterDto {
  @ApiProperty({ example: 4.0 })
  @IsNumber()
  @IsOptional()
  minimum_review_score?: number;

  @ApiProperty({ example: 50 })
  @IsInt()
  @IsOptional()
  minimum_review_count?: number;
}

export class FiltersDto {
  @ApiProperty({ type: RatingFilterDto, required: false })
  @ValidateNested()
  @Type(() => RatingFilterDto)
  @IsOptional()
  rating?: RatingFilterDto;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  tienePiscina?: boolean;

  @ApiProperty({ example: 50, required: false })
  @IsNumber()
  @IsOptional()
  precioMin?: number;

  @ApiProperty({ example: 300, required: false })
  @IsNumber()
  @IsOptional()
  precioMax?: number;
}

export class SearchAlojamientosRequestDto {
  // --- Campos estándar del contrato OpenAPI (GDS Core) ---
  @ApiProperty({ description: 'Información del comprador', type: BookerDto, required: false })
  @ValidateNested()
  @Type(() => BookerDto)
  @IsOptional()
  booker?: BookerDto;

  @ApiProperty({ description: 'Fecha de llegada (YYYY-MM-DD)', example: '2026-12-18', format: 'date', required: false })
  @IsString()
  @IsOptional()
  checkin?: string;

  @ApiProperty({ description: 'Fecha de salida (YYYY-MM-DD)', example: '2026-12-20', format: 'date', required: false })
  @IsString()
  @IsOptional()
  checkout?: string;

  @ApiProperty({ description: 'ID o código de ciudad numérica', example: 1234, required: false })
  @IsOptional()
  city?: number | string;

  @ApiProperty({ description: 'Código ISO de país (2 letras minúsculas)', example: 'ec', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ description: 'Composición de huéspedes y habitaciones', type: AccommodationsGuestsDto, required: false })
  @ValidateNested()
  @Type(() => AccommodationsGuestsDto)
  @IsOptional()
  guests?: AccommodationsGuestsDto;

  @ApiProperty({ description: 'Extras solicitados', example: ['extra_charges', 'products'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  extras?: string[];

  @ApiProperty({ description: 'Moneda requerida (3 letras mayúsculas)', example: 'USD', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda debe tener 3 letras mayúsculas (ej. USD)' })
  currency?: string;

  @ApiProperty({ description: 'Cantidad de resultados por página', example: 20, default: 20, required: false })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  rows?: number;

  @ApiProperty({ description: 'Token de paginación', example: 'eyJwYWdlIjoyfQ==', required: false })
  @IsString()
  @IsOptional()
  page?: string;

  // --- Campos de compatibilidad con Frontend de la aplicación ---
  @ApiProperty({ description: 'Destino o ciudad de búsqueda (texto libre)', example: 'Cancún', required: false })
  @IsString()
  @IsOptional()
  destino?: string;

  @ApiProperty({ description: 'Rango de fechas', type: DatesDto, required: false })
  @ValidateNested()
  @Type(() => DatesDto)
  @IsOptional()
  dates?: DatesDto;

  @ApiProperty({ description: 'Cantidad de adultos', example: 2, required: false })
  @IsInt()
  @IsOptional()
  adultos?: number;

  @ApiProperty({ description: 'Cantidad de niños', example: 0, required: false })
  @IsInt()
  @IsOptional()
  ninos?: number;

  @ApiProperty({ description: 'Cantidad de habitaciones', example: 1, required: false })
  @IsInt()
  @IsOptional()
  habitaciones?: number;

  @ApiProperty({ description: 'Filtros adicionales', type: FiltersDto, required: false })
  @ValidateNested()
  @Type(() => FiltersDto)
  @IsOptional()
  filters?: FiltersDto;
}
