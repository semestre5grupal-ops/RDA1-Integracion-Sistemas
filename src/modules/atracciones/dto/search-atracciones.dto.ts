import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsInt, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class DatesDto {
  @ApiProperty({ example: '2025-12-18', format: 'date' })
  @IsString()
  start_date: string;

  @ApiProperty({ example: '2025-12-20', format: 'date' })
  @IsString()
  end_date: string;
}

class RatingFilterDto {
  @ApiProperty({ example: 4.2 })
  @IsNumber()
  @IsOptional()
  minimum_review_score?: number;

  @ApiProperty({ example: 100 })
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
}

class SortDto {
  @ApiProperty({ example: 'most_popular' })
  @IsString()
  by: string;
}

export class SearchAtraccionesRequestDto {
  @ApiProperty({ example: 'EUR' })
  @IsString()
  currency: string;

  @ApiProperty({ type: [Number], example: [-2140479], required: false })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  cities?: number[];

  @ApiProperty({ type: [String], example: ['nl'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  countries?: string[];

  @ApiProperty({ type: DatesDto, required: false })
  @ValidateNested()
  @Type(() => DatesDto)
  @IsOptional()
  dates?: DatesDto;

  @ApiProperty({ type: FiltersDto, required: false })
  @ValidateNested()
  @Type(() => FiltersDto)
  @IsOptional()
  filters?: FiltersDto;

  @ApiProperty({ example: 20, required: false })
  @IsInt()
  @IsOptional()
  rows?: number;

  @ApiProperty({ type: SortDto, required: false })
  @ValidateNested()
  @Type(() => SortDto)
  @IsOptional()
  sort?: SortDto;
}
