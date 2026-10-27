import { IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Equals } from 'class-validator';

export class InboundCloudEventDto {
  @Equals('1.0')
  specversion: string;

  @IsUUID('4')
  id: string;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsISO8601()
  time: string;

  @IsString()
  @IsNotEmpty()
  datacontenttype: string;

  @IsOptional()
  @IsString()
  correlationid?: string;

  @IsOptional()
  @IsString()
  traceparent?: string;

  @IsOptional()
  @IsString()
  node_id?: string;

  @IsObject()
  data: Record<string, unknown>;
}
