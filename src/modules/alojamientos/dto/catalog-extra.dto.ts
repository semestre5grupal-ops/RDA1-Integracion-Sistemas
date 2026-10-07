import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsInt, Min } from 'class-validator';

// --- Details & Changes ---
export class AccommodationDetailsRequestDto {
  @ApiProperty({ description: 'Arreglo de IDs de alojamientos', example: ['aloj-1', 'aloj-2'] })
  @IsArray()
  accommodations: (string | number)[];

  @ApiProperty({ description: 'ID de ciudad', example: 1234, required: false })
  @IsOptional()
  city?: number | string;

  @ApiProperty({ description: 'Código de país', example: 'ec', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    description: 'Extras o secciones detalladas a incluir',
    example: ['description', 'photos', 'facilities', 'policies', 'rooms'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  extras?: string[];

  @ApiProperty({ description: 'Idiomas solicitados', example: ['es', 'en'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}

export class AccommodationDetailsResponseDto {
  @ApiProperty({ description: 'Identificador único de la petición', example: 'req_det_123' })
  request_id: string;

  @ApiProperty({ description: 'Detalles extendidos de cada alojamiento' })
  data: any[];

  @ApiProperty({ description: 'Token de siguiente página si aplica', required: false, nullable: true })
  next_page?: string | null;
}

export class DetailsChangesFiltersDto {
  @ApiProperty({ description: 'Filtro por países', example: ['ec', 'co'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  countries?: string[];

  @ApiProperty({ description: 'Filtro por ciudades', example: [100, 200], required: false })
  @IsArray()
  @IsOptional()
  cities?: (number | string)[];
}

export class DetailsChangesRequestDto {
  @ApiProperty({ description: 'Fecha y hora desde la cual consultar cambios (ISO 8601)', example: '2026-09-01T00:00:00Z' })
  @IsString()
  last_change: string;

  @ApiProperty({ description: 'Filtros opcionales de países o ciudades', type: DetailsChangesFiltersDto, required: false })
  @IsOptional()
  filters?: DetailsChangesFiltersDto;
}

export class DetailsChangesResponseDto {
  @ApiProperty({ description: 'Identificador de la consulta', example: 'req_chg_999' })
  request_id: string;

  @ApiProperty({
    description: 'Resumen de modificaciones',
    example: {
      from: '2026-09-01T00:00:00Z',
      next: '2026-10-01T00:00:00Z',
      total_changes: 2,
      changes: { updated_accommodations: ['aloj-1', 'aloj-3'], deleted_accommodations: [] },
    },
  })
  data: {
    from: string;
    next?: string;
    total_changes: number;
    changes: any;
  };
}

// --- Chains ---
export class ChainsResponseDto {
  @ApiProperty({ description: 'Identificador de la respuesta', example: 'req_chains_111' })
  request_id: string;

  @ApiProperty({
    description: 'Catálogo de cadenas hoteleras y sus marcas',
    example: [
      {
        id: 1,
        name: 'Marriott International',
        brands: [{ id: 101, name: 'Courtyard' }, { id: 102, name: 'Sheraton' }],
      },
    ],
  })
  data: any[];
}

// --- Constants ---
export class ConstantsRequestDto {
  @ApiProperty({ description: 'Idiomas solicitados', example: ['es'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiProperty({
    description: 'Categorías de constantes a consultar',
    example: ['facilities', 'room_types', 'meal_plans', 'bed_types', 'property_types'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  constants?: string[];
}

export class ConstantsResponseDto {
  @ApiProperty({ description: 'Identificador de la respuesta', example: 'req_const_333' })
  request_id: string;

  @ApiProperty({ description: 'Diccionario de constantes del sistema' })
  data: any;
}

// --- Reviews ---
export class ReviewsRequestDto {
  @ApiProperty({ description: 'Lista de IDs de alojamientos', example: ['aloj-1'] })
  @IsArray()
  accommodations: (string | number)[];

  @ApiProperty({ description: 'Idiomas', example: ['es'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiProperty({ description: 'Token de página', required: false })
  @IsString()
  @IsOptional()
  page?: string;

  @ApiProperty({ description: 'Cantidad de filas', example: 10, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  rows?: number;
}

export class ReviewsResponseDto {
  @ApiProperty({ description: 'Identificador de la respuesta', example: 'req_rev_444' })
  request_id: string;

  @ApiProperty({ description: 'Reseñas detalladas de los alojamientos' })
  data: any[];

  @ApiProperty({ description: 'Siguiente página', required: false, nullable: true })
  next_page?: string | null;
}

export class ReviewsScoresRequestDto {
  @ApiProperty({ description: 'Lista de IDs de alojamientos', example: ['aloj-1'] })
  @IsArray()
  accommodations: (string | number)[];

  @ApiProperty({ description: 'Idiomas', example: ['es'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}

export class ReviewsScoresResponseDto {
  @ApiProperty({ description: 'Identificador de la respuesta', example: 'req_scores_555' })
  request_id: string;

  @ApiProperty({ description: 'Puntuaciones desglosadas por categoría' })
  data: any[];
}
