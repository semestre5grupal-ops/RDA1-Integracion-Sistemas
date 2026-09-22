import { ApiProperty } from '@nestjs/swagger';

export class AvailabilityResponseDto {
  @ApiProperty({ description: 'Fecha de disponibilidad', format: 'date', example: '2026-10-10' })
  date: string;

  @ApiProperty({ description: 'Cupos disponibles', example: 15 })
  available_spots: number;

  @ApiProperty({ description: 'Horarios disponibles', example: ['10:00', '14:00'] })
  times: string[];
}
