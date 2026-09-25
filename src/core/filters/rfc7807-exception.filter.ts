import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse: any =
      exception instanceof HttpException ? exception.getResponse() : null;

    let detail = 'Error interno del servidor';
    if (exceptionResponse) {
      if (typeof exceptionResponse === 'string') {
        detail = exceptionResponse;
      } else if (exceptionResponse.message) {
        detail = Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message.join(', ')
          : exceptionResponse.message;
      }
    }

    // Formato Problem Details (RFC 7807)
    const problemDetails = {
      type: `https://httpstatuses.com/${status}`,
      title: exception instanceof HttpException ? exception.name : 'Internal Server Error',
      status: status,
      detail: detail,
      instance: request.url,
    };

    // La RFC recomienda usar el content-type "application/problem+json"
    response.status(status).setHeader('Content-Type', 'application/problem+json').json(problemDetails);
  }
}
