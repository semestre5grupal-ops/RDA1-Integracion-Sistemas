import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  CodigoProblema,
  InvalidParam,
  codigoPorDefecto,
  presentacionDe,
} from '../errors/codigo-error';

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  /**
   * Sin este log, un error que no sea `HttpException` (por ejemplo un
   * `QueryFailedError` de TypeORM) se convertía en un 500 completamente mudo:
   * el cuerpo decía "Error interno del servidor", la consola no mostraba nada y
   * el origen era imposible de localizar. El filtro es un `catch` global, así
   * que es el último punto donde se puede registrar la excepción original.
   */
  private readonly logger = new Logger(Rfc7807ExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Solo los 5xx son fallos del servidor y merecen traza completa. Un 4xx es
    // una peticion invalida del cliente: registrarla entero satura el log sin
    // aportar nada, asi que se deja en `debug`.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(`${request.method} ${request.url} -> ${status}`);
    }

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

    // ── `code` e `invalidParams` ──────────────────────────────────────────────
    // El contrato declara `code` como OBLIGATORIO en `ProblemDetails`, con un
    // enum cerrado. Sin el, dos 409 distintos (`SEAT_TAKEN` y `CUTOFF_PASSED`)
    // llegan iguales y el integrador no tiene forma de decidir sin leer el
    // texto, que es fragile.
    //
    // Se toma del `code` que la excepcion transporta, y si no lo tiene se deduce
    // del estado. Un 404 y un 500 se quedan SIN `code` a proposito: `codigo_error`
    // no tiene un miembro "NOT_FOUND" ni uno de error interno, y emitir un valor
    // inventado haria que un cliente que valida el esquema rechazase la
    // respuesta, que es peor que no mandar el campo.
    const codigo: CodigoProblema | null =
      exceptionResponse?.code ?? codigoPorDefecto(status);

    // `type` y `title` salen de la MISMA tabla `codigo_error` que fija el estado
    // (`cer_tipouri`, `cer_titulo`). Antes se emitia `https://httpstatuses.com/409`
    // y el nombre de la clase de Nest como titulo, que es un placeholder: dos
    // errores con el mismo estado salian con `type` identico.
    //
    // Se consulta con el `code` EFECTIVO, no con el que traia la excepcion: un 400
    // de `ValidationPipe` no trae `code` pero `codigoPorDefecto` se lo deduce, y
    // ese deducido tambien tiene su `type` y su `title` en el catalogo. Preguntar
    // solo por el de la excepcion hacia que un 400 de esquema saliera con el
    // `type` generico mientras que un 400 lanzo a mano saldria con el URN.
    const presentacion = presentacionDe(codigo ?? undefined);

    // `invalidParams` llega ESTRUCTURADO desde `exceptionFactory` del
    // `ValidationPipe` de `main.ts`, que recorre el arbol de `class-validator` y
    // sabe que propiedad fallo. No se deduce de los mensajes de texto: con
    // mensajes personalizados ("No puede incluir mas de 6 itinerarios.") no hay
    // forma de saber que campo es, y la primera version partia la cadena por el
    // primer espacio y devolvia `{ name: "No", ... }`.
    const invalidParams: InvalidParam[] = Array.isArray(exceptionResponse?.invalidParams)
      ? exceptionResponse.invalidParams
      : [];

    // Formato Problem Details (RFC 7807)
    const problemDetails: Record<string, unknown> = {
      type: presentacion?.tipoUri ?? `https://httpstatuses.com/${status}`,
      title:
        presentacion?.titulo ??
        (exception instanceof HttpException ? exception.name : 'Internal Server Error'),
      status: status,
      detail: detail,
      instance: request.url,
      correlation_id:
        typeof request.headers['x-correlation-id'] === 'string'
          ? request.headers['x-correlation-id']
          : undefined,
      timestamp: new Date().toISOString(),
    };
    if (codigo) problemDetails.code = codigo;
    if (invalidParams.length > 0) problemDetails.invalidParams = invalidParams;

    // La RFC recomienda usar el content-type "application/problem+json"
    response.status(status).setHeader('Content-Type', 'application/problem+json').json(problemDetails);
  }
}
