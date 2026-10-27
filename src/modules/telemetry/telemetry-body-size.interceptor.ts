import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

export const MAX_TELEMETRY_BODY_BYTES = 16 * 1024;

@Injectable()
export class TelemetryBodySizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    const serializedBody = JSON.stringify(request.body ?? {});
    if (Buffer.byteLength(serializedBody, 'utf8') > MAX_TELEMETRY_BODY_BYTES) {
      throw new HttpException(
        `El cuerpo de telemetría no puede superar ${MAX_TELEMETRY_BODY_BYTES} bytes.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    return next.handle();
  }
}
