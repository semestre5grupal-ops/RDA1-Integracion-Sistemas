import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from '../../../common/dto/base-response.dto';
import { PhotoDto, RatingDto, LocationDto } from './nested-types.dto';

export class UrlDto {
  @ApiProperty({ description: 'URL web del alojamiento', example: 'https://www.booking.com/hotel/mx/resort-las-palmas.html' })
  web: string;

  @ApiProperty({ description: 'URL para App (Deep Link)', example: 'booking://hotel/product?id=123', required: false })
  app?: string;
}

export class AlojamientoResponseDto extends BaseResponseDto {
  @ApiProperty({ description: 'UUID único del alojamiento', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: 'Nombre del alojamiento', example: 'Resort Las Palmas' })
  nombre: string;

  @ApiProperty({ description: 'Destino o ciudad', example: 'Cancún' })
  destino: string;

  @ApiProperty({ description: 'Precio por noche', example: 120.50 })
  precioPorNoche: number;

  @ApiProperty({ description: 'Capacidad de adultos', example: 2 })
  capacidadAdultos: number;

  @ApiProperty({ description: 'Capacidad de niños', example: 1 })
  capacidadNinos: number;

  @ApiProperty({ description: 'Número de habitaciones', example: 1 })
  habitaciones: number;

  @ApiProperty({ description: 'Disponibilidad de piscina', example: true })
  tienePiscina: boolean;

  @ApiProperty({ description: 'Descripción detallada', example: 'Hotel frente al mar con servicio todo incluido.', required: false })
  descripcion?: string;

  @ApiProperty({ description: 'Fotos del alojamiento', type: [PhotoDto], required: false })
  photos?: PhotoDto[];

  @ApiProperty({ description: 'Puntuaciones y reseñas', type: RatingDto, required: false })
  ratings?: RatingDto;

  @ApiProperty({ description: 'Ubicación física', type: LocationDto, required: false })
  ubicacion?: LocationDto;

  @ApiProperty({ description: 'Enlaces directos', type: UrlDto, required: false })
  url?: UrlDto;

  @ApiProperty({
    description: 'HATEOAS links para navegación',
    example: {
      self: { href: '/api/v1/alojamientos/123e4567-e89b-12d3-a456-426614174000', method: 'GET' },
      reservar: { href: '/api/v1/alojamientos/123e4567-e89b-12d3-a456-426614174000/reservations', method: 'POST' },
      catalogo: { href: '/api/v1/alojamientos', method: 'GET' },
    },
    required: false,
  })
  _links?: any;
}
