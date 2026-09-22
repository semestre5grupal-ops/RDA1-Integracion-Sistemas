import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from '../../../common/dto/base-response.dto';
import { PriceDto, LocationDto, PhotoDto, RatingDto, OperatorDto } from './nested-types.dto';

export class UrlDto {
  @ApiProperty({ description: 'URL web', example: 'https://www.booking.com/attractions/nl/prahazwttraa-heineken-experience-amsterdam.en-gb.html' })
  web: string;

  @ApiProperty({ description: 'URL para App (Deep Link)', example: 'booking://attractions/product?slug=prahazwttraa', required: false })
  app?: string;
}

export enum ProductType {
  SINGLE_TICKET = 'SINGLE_TICKET',
  GUIDED_TOUR = 'GUIDED_TOUR',
  PACKAGE = 'PACKAGE'
}

export class AtraccionResponseDto extends BaseResponseDto {
  @ApiProperty({ description: 'UUID único de la atracción', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: 'Nombre de la atracción', example: 'Heineken Experience Amsterdam' })
  name: string;

  @ApiProperty({ description: 'Descripción detallada', example: 'Discover the history of Heineken...' })
  long_description: string;

  @ApiProperty({ description: 'Duración (Formato ISO 8601)', example: 'PT2H' })
  duration: string;

  @ApiProperty({ description: 'Precio de la atracción', type: PriceDto })
  price: PriceDto;

  @ApiProperty({ description: 'Empresa Operadora', type: OperatorDto })
  operator: OperatorDto;

  @ApiProperty({ description: 'Tipo de producto', enum: ProductType, example: ProductType.GUIDED_TOUR })
  product_type: ProductType;

  @ApiProperty({ description: 'Qué incluye el paquete o tour', example: ['Transporte', 'Guía'] })
  includes: string[];

  @ApiProperty({ description: 'Categorías de la atracción', example: ['food_drinks'] })
  categories: string[];

  @ApiProperty({ description: 'Insignias comerciales', example: ['best_seller'] })
  badges: string[];

  @ApiProperty({ description: 'Ubicaciones asociadas a la atracción', type: [LocationDto] })
  locations: LocationDto[];

  @ApiProperty({ description: 'Fotos de la atracción', type: [PhotoDto] })
  photos: PhotoDto[];

  @ApiProperty({ description: 'Idiomas soportados', example: ['en-gb', 'nl'] })
  supported_languages: string[];

  @ApiProperty({ description: 'Tiene cancelación gratuita', example: true })
  free_cancellation: boolean;

  @ApiProperty({ description: 'Puntuaciones y reseñas', type: RatingDto, required: false })
  ratings?: RatingDto;

  @ApiProperty({ description: 'Enlaces directos a la plataforma', type: UrlDto, required: false })
  url?: UrlDto;

  @ApiProperty({
    description: 'HATEOAS links para navegación',
    example: {
      self: { href: '/api/v1/atracciones/123e4567-e89b-12d3-a456-426614174000', method: 'GET' },
      reservar: { href: '/api/v1/atracciones/123e4567-e89b-12d3-a456-426614174000/reservar', method: 'POST' },
      catalogo: { href: '/api/v1/atracciones', method: 'GET' }
    }
  })
  _links?: any;
}
