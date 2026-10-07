import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, ArrayMinSize, IsIn, IsOptional, Matches } from 'class-validator';

export const ALOJAMIENTOS_WEBHOOK_EVENTS = [
  'ORDER_CONFIRMED',
  'ORDER_CANCELLED',
  'ORDER_MODIFIED',
  'AVAILABILITY_CHANGED',
] as const;

export type TipoEventoAlojamientoWebhook = typeof ALOJAMIENTOS_WEBHOOK_EVENTS[number];

export class CreateAccommodationWebhookDto {
  @ApiProperty({
    description: 'URL de destino para las notificaciones (debe ser HTTPS)',
    example: 'https://webhook.site/test-integration',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^https:\/\//i, { message: 'La URL del webhook debe usar protocolo seguro https://' })
  url: string;

  @ApiProperty({
    description: 'Lista de eventos a los cuales suscribirse',
    example: ['ORDER_CONFIRMED', 'ORDER_CANCELLED'],
    enum: ALOJAMIENTOS_WEBHOOK_EVENTS,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un evento para la suscripción' })
  @IsIn(ALOJAMIENTOS_WEBHOOK_EVENTS, { each: true, message: 'Evento de webhook no reconocido' })
  events: TipoEventoAlojamientoWebhook[];

  @ApiProperty({
    description: 'Secreto compartido para firma HMAC de las notificaciones',
    example: 'whsec_99af2810de19',
    required: false,
  })
  @IsString()
  @IsOptional()
  secret?: string;
}

export class AccommodationWebhookSubscriptionDto {
  @ApiProperty({ description: 'UUID de la suscripción de webhook', format: 'uuid', example: 'd3b07384-d113-4638-b7e6-7640c490a213' })
  id: string;

  @ApiProperty({ description: 'URL receptora del webhook', example: 'https://partner-hub.com/api/alojamientos/webhook' })
  url: string;

  @ApiProperty({ description: 'Eventos suscritos', example: ['ORDER_CONFIRMED', 'ORDER_CANCELLED'] })
  events: string[];

  @ApiProperty({ description: 'Secreto enmascarado', example: 'whsec_...19a2', required: false })
  secret?: string;

  @ApiProperty({ description: 'Fecha de creación', example: '2026-10-07T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ description: 'Estado activo de la suscripción', example: true })
  active: boolean;
}

export class WebhookPayloadDto {
  @ApiProperty({ description: 'Identificador del evento', format: 'uuid', example: 'e71822c1-d309-482f-8d07-285b736b0091' })
  eventId: string;

  @ApiProperty({ description: 'Tipo de evento ocurrido', example: 'ORDER_CONFIRMED' })
  eventType: string;

  @ApiProperty({ description: 'Timestamp del evento', example: '2026-10-07T12:00:00Z' })
  timestamp: string;

  @ApiProperty({ description: 'ID del recurso afectado (ej. order_id)', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  resourceId: string;

  @ApiProperty({ description: 'Datos del recurso' })
  data: any;
}
