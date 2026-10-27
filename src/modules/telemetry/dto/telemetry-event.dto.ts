import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const EVENT_NAMES = [
  'search_submitted',
  'checkout_started',
  'form_step_completed',
  'payment_started',
  'payment_succeeded',
  'payment_failed',
  'booking_confirmed',
  'page_view',
] as const;
const VERTICALS = ['vuelos', 'autos', 'atracciones', 'alojamientos', 'global'] as const;
const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
const MAX_PROPERTIES_BYTES = 8 * 1024;

@ValidatorConstraint({ name: 'maxPropertiesBytes', async: false })
class MaxPropertiesBytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_PROPERTIES_BYTES;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return `properties no puede superar ${MAX_PROPERTIES_BYTES} bytes serializados.`;
  }
}

export class TelemetryEventDto {
  @IsString()
  @IsIn(EVENT_NAMES)
  event_name!: (typeof EVENT_NAMES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  session_id?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsIn(VERTICALS)
  vertical?: (typeof VERTICALS)[number];

  @IsOptional()
  @IsIn(DEVICES)
  device?: (typeof DEVICES)[number];

  @IsOptional()
  @IsObject()
  @Validate(MaxPropertiesBytesConstraint)
  properties?: Record<string, unknown>;
}
