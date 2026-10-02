import { ApiProperty } from '@nestjs/swagger';

export class AvailabilityResponseDto {
  @ApiProperty({ description: 'Fecha de disponibilidad', format: 'date', example: '2026-10-10' })
  date: string;

  @ApiProperty({ description: 'Habitaciones disponibles', example: 5 })
  available_rooms: number;

  @ApiProperty({ description: 'Tarifa por noche disponible', example: 120.0 })
  price_per_night: number;

  @ApiProperty({ description: 'Horarios de check-in disponibles', example: ['14:00', '15:00'] })
  checkin_times: string[];
}
