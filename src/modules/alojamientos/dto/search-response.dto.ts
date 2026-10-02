import { ApiProperty } from '@nestjs/swagger';
import { AlojamientoResponseDto } from './alojamiento-response.dto';

export class SearchMetadataDto {
  @ApiProperty({ example: 45 })
  total_results: number;

  @ApiProperty({ description: 'Token de paginación para la siguiente página de resultados', example: 'eyJwYWdlIjoyfQ==', required: false })
  next_page?: string;
}

export class SearchAlojamientosResponseDto {
  @ApiProperty({ type: [AlojamientoResponseDto] })
  data: AlojamientoResponseDto[];

  @ApiProperty({ type: SearchMetadataDto })
  metadata: SearchMetadataDto;

  @ApiProperty({ example: 'req-aloj-001' })
  request_id: string;
}
