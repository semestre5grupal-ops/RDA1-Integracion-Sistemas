import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, Matches, IsArray, IsInt, Min } from 'class-validator';

export enum PlatformEnum {
  ANDROID = 'android',
  DESKTOP = 'desktop',
  IOS = 'ios',
  MOBILE = 'mobile',
  TABLET = 'tablet',
}

export enum TravelPurposeEnum {
  BUSINESS = 'business',
  LEISURE = 'leisure',
}

export class BookerDto {
  @ApiProperty({ description: 'Código ISO 3166-1 alpha-2 del país del comprador (minúsculas)', example: 'ec' })
  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'El país del booker debe ser de 2 letras minúsculas (ej. "ec", "mx")' })
  country: string;

  @ApiProperty({ description: 'Plataforma del comprador', enum: PlatformEnum, example: PlatformEnum.DESKTOP })
  @IsEnum(PlatformEnum)
  platform: PlatformEnum;

  @ApiProperty({ description: 'Estado o provincia (2 letras)', example: 'pi', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z]{2}$/, { message: 'El estado debe ser de 2 letras minúsculas' })
  state?: string;

  @ApiProperty({ description: 'Propósito del viaje', enum: TravelPurposeEnum, example: TravelPurposeEnum.LEISURE, required: false })
  @IsEnum(TravelPurposeEnum)
  @IsOptional()
  travel_purpose?: TravelPurposeEnum;

  @ApiProperty({ description: 'Grupos de usuario', example: ['authenticated'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  user_groups?: string[];
}

export class GuestAllocationDto {
  @ApiProperty({ description: 'Adultos en la habitación', example: 2, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  adults?: number;

  @ApiProperty({ description: 'Edades de los niños en la habitación', example: [5], required: false })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  children?: number[];
}

export class AccommodationsGuestsDto {
  @ApiProperty({ description: 'Número de adultos (mínimo 1)', example: 2 })
  @IsInt()
  @Min(1)
  number_of_adults: number;

  @ApiProperty({ description: 'Número de habitaciones (mínimo 1)', example: 1 })
  @IsInt()
  @Min(1)
  number_of_rooms: number;

  @ApiProperty({ description: 'Edades de los niños que viajan', example: [4, 7], required: false })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  children?: number[];

  @ApiProperty({ description: 'Distribución por habitación', type: [GuestAllocationDto], required: false })
  @IsArray()
  @IsOptional()
  allocation?: GuestAllocationDto[];
}
