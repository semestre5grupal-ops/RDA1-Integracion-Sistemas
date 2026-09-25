import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty, IsOptional } from 'class-validator';

export class DetailsRequestDto {
  @ApiProperty({ description: 'Arreglo de IDs de atracciones a consultar', example: ['PRahAzWtTraa', 'PRAmdacCwQLH'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  attractions: string[];

  @ApiProperty({ description: 'Idiomas requeridos (en-gb por defecto si no se encuentra)', example: ['en-gb', 'es'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}
