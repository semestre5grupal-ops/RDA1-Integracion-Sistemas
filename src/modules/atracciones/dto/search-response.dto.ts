import { ApiProperty } from '@nestjs/swagger';
import { AtraccionResponseDto } from './atraccion-response.dto';

export class SearchMetadataDto {
  @ApiProperty({ example: 128 })
  total_results: number;

  @ApiProperty({ description: 'Token de paginación para la siguiente página de resultados', example: 'eyJwYWdlIjoyfQ==', required: false })
  next_page?: string;
}

export class SearchAtraccionesResponseDto {
  @ApiProperty({ type: [AtraccionResponseDto] })
  data: AtraccionResponseDto[];

  @ApiProperty({ type: SearchMetadataDto })
  metadata: SearchMetadataDto;

  @ApiProperty({ example: '01fr9ez700exycb98w90w5r9sh' })
  request_id: string;
}
