import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, IsOptional } from 'class-validator';

export class DetailsRequestDto {
  @ApiProperty({ description: 'Arreglo de IDs de alojamientos a consultar', example: ['123e4567-e89b-12d3-a456-426614174000', '223e4567-e89b-12d3-a456-426614174000'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  accommodations: string[];

  @ApiProperty({ description: 'Idiomas requeridos (es por defecto)', example: ['es', 'en'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}
