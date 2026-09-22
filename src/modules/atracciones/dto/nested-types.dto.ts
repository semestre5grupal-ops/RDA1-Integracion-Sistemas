import { ApiProperty } from '@nestjs/swagger';

export class PriceDto {
  @ApiProperty({ description: 'Moneda (ISO 4217)', example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'Monto total', example: 45.0 })
  total: number;
}

export class CoordinatesDto {
  @ApiProperty({ description: 'Latitud', example: -0.680556 })
  latitude: number;

  @ApiProperty({ description: 'Longitud', example: -78.437778 })
  longitude: number;
}

export class LocationDto {
  @ApiProperty({ description: 'Dirección física', example: 'Parque Nacional Cotopaxi' })
  address: string;

  @ApiProperty({ description: 'ID de la ciudad (Booking ID)', example: -924216 })
  city: number;

  @ApiProperty({ description: 'Código de país', example: 'EC' })
  country: string;

  @ApiProperty({ description: 'Coordenadas GPS', type: CoordinatesDto })
  coordinates: CoordinatesDto;

  @ApiProperty({ description: 'Tipo de locación', example: 'STARTING_POINT' })
  type: string;
}

export class PhotoDto {
  @ApiProperty({ description: 'URL de la foto', example: 'https://example.com/photo.jpg' })
  url: string;
}

export class RatingDto {
  @ApiProperty({ description: 'Número de reseñas', example: 3250 })
  number_of_reviews: number;

  @ApiProperty({ description: 'Puntuación promedio', example: 4.8 })
  score: number;
}

export class OperatorDto {
  @ApiProperty({ description: 'ID de la empresa/proveedor', example: 123 })
  id: number;

  @ApiProperty({ description: 'Nombre de la empresa operadora', example: 'Quito Tour Bus' })
  name: string;
}
