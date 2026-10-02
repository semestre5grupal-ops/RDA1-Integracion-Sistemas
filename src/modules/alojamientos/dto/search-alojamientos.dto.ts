import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class DatesDto {
  @ApiProperty({ example: '2026-12-18', format: 'date' })
  @IsString()
  checkin: string;

  @ApiProperty({ example: '2026-12-20', format: 'date' })
  @IsString()
  checkout: string;
}

class RatingFilterDto {
  @ApiProperty({ example: 4.0 })
  @IsNumber()
  @IsOptional()
  minimum_review_score?: number;

  @ApiProperty({ example: 50 })
  @IsInt()
  @IsOptional()
  minimum_review_count?: number;
}

class FiltersDto {
  @ApiProperty({ type: RatingFilterDto, required: false })
  @ValidateNested()
  @Type(() => RatingFilterDto)
  @IsOptional()
  rating?: RatingFilterDto;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  tienePiscina?: boolean;
}

export class SearchAlojamientosRequestDto {
  @ApiProperty({ example: 'Cancún', required: false })
  @IsString()
  @IsOptional()
  destino?: string;

  @ApiProperty({ example: 'USD', required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ type: DatesDto, required: false })
  @ValidateNested()
  @Type(() => DatesDto)
  @IsOptional()
  dates?: DatesDto;

  @ApiProperty({ example: 2, required: false })
  @IsInt()
  @IsOptional()
  adultos?: number;

  @ApiProperty({ example: 0, required: false })
  @IsInt()
  @IsOptional()
  ninos?: number;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  habitaciones?: number;

  @ApiProperty({ type: FiltersDto, required: false })
  @ValidateNested()
  @Type(() => FiltersDto)
  @IsOptional()
  filters?: FiltersDto;

  @ApiProperty({ example: 20, required: false })
  @IsInt()
  @IsOptional()
  rows?: number;
}
