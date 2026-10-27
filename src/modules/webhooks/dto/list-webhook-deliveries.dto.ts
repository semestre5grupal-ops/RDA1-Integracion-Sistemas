import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WebhookDeliveryStatus } from '../entities';

export class ListWebhookDeliveriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(['PROCESADO', 'ERROR', 'EN_COLA'])
  status?: WebhookDeliveryStatus;

  @IsOptional()
  @IsString()
  correlationid?: string;
}
