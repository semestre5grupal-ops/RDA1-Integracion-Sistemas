import { ApiProperty } from '@nestjs/swagger';

export class PriceDto {
  @ApiProperty({ description: 'Moneda (ISO 4217)', example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'Monto total o por noche', example: 120.0 })
  total: number;
}

export class CoordinatesDto {
  @ApiProperty({ description: 'Latitud', example: 21.1619 })
  latitude: number;

  @ApiProperty({ description: 'Longitud', example: -86.8515 })
  longitude: number;
}

export class LocationDto {
  @ApiProperty({ description: 'Dirección física', example: 'Zona Hotelera Km 12' })
  address: string;

  @ApiProperty({ description: 'Ciudad o destino', example: 'Cancún' })
  city: string;

  @ApiProperty({ description: 'Código de país', example: 'MX' })
  country: string;

  @ApiProperty({ description: 'Coordenadas GPS', type: CoordinatesDto, required: false })
  coordinates?: CoordinatesDto;
}

export class PhotoDto {
  @ApiProperty({ description: 'URL de la foto', example: 'https://example.com/hotel.jpg' })
  url: string;
}

export class RatingDto {
  @ApiProperty({ description: 'Número de reseñas', example: 450 })
  number_of_reviews: number;

  @ApiProperty({ description: 'Puntuación promedio', example: 4.7 })
  score: number;
}
