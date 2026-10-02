import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Rfc7807ExceptionFilter } from './core/filters/rfc7807-exception.filter';
import { CodigoProblema, InvalidParam } from './core/errors/codigo-error';
import { HateoasInterceptor } from './core/interceptors/hateoas.interceptor';

/**
 * Aplana el arbol de `ValidationError` de `class-validator` a la lista plana
 * `{ name, reason }` que el contrato llama `invalidParams`.
 *
 * ── Por que hace falta ───────────────────────────────────────────────────────
 * Por defecto, `ValidationPipe` devuelve `message` como un array de CADENAS
 * ("No puede incluir mas de 6 itinerarios.", "itineraries must be an array"). El
 * filtro no puede saber que campo es cada una, asi que antes separaba la cadena
 * por el primer espacio y Sikube asi:
 *
 *     { name: "No", reason: "puede incluir mas de 6 itinerarios." }
 *
 * Un `name` de "No" no identifica ningun campo, asi que el dato era inservible
 * para el integrador. Los mensajes personalizados que escriben en los DTOs
 * empiezan por texto, no por el nombre de la propiedad, y por eso partir la
 * cadena no puede funcionar.
 *
 * `ValidationError` SI trae la estructura: `property` y `constraints`. Se recorre
 * el arbol —los DTOs anidados (`DateChangeItemDto` dentro de
 * `DateChangeSearchRequestDto`) producen subarboles— y se compone el nombre con
 * punto: `changes.0.newDepartureDate`.
 *
 * Solo se toma el PRIMER `constraint` de cada campo. `class-validator` ejecuta
 * todos los decoradores de un campo y puede dar cuatro motivos ("should not be
 * empty", "should be a string", ...), y el mas especifico ya no se distingue de
 * los demas. El campo queda identificado, que es lo que el cliente necesita para
 * corregirlo.
 */
function aplanarValidacion(
  errores: ValidationError[],
  prefijo = '',
): InvalidParam[] {
  const salida: InvalidParam[] = [];

  for (const error of errores) {
    // El nombre del campo lleva su indice cuando viene de un array:
    // `changes.0.newDepartureDate` y no `changes.newDepartureDate`, porque sin el
    // indice el cliente no sabe WHICH elemento corregir.
    const nombre = prefijo ? `${prefijo}.${error.property}` : error.property;

    const motivos = Object.values(error.constraints ?? {});
    if (motivos.length > 0) {
      salida.push({ name: nombre, reason: motivos[0] });
    }

    // Un DTO anidado sin `constraints` propias (porque sus reglas viven en el
    // hijo) aun asi aporta su nombre, asi que se recorre igual.
    if (error.children && error.children.length > 0) {
      salida.push(...aplanarValidacion(error.children, nombre));
    }
  }

  return salida;
}

/**
 * `exceptionFactory` del `ValidationPipe` global.
 *
 * Devuelve la `BadRequestException` de NestJS pero con el cuerpo YA en la forma
 * que el contrato define: `message` legible e `invalidParams` con el par
 * nombre/motivo. El filtro global lee `invalidParams` tal cual y no tiene que
 * adivinar nada.
 *
 * `VALIDATION_FAILED` se fija aqui y no en el filtro: el filtro lo deduce del
 * estado 400 como valor por defecto, pero esta excepcion si lo sabe con certeza,
 * y ponerlo en el sitio que lo sabe evita que el tipo y el titulo del catalogo
 * dependan de esa deduccion.
 */
function factoryDeValidacion(errores: ValidationError[]): BadRequestException {
  return new BadRequestException({
    message: 'La peticion no supera la validacion del esquema.',
    code: CodigoProblema.VALIDATION_FAILED,
    invalidParams: aplanarValidacion(errores),
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());

  // Habilita CORS para que el frontend pueda llamar al backend.
  //
  // `X-Device-Fingerprint` es OBLIGATORIA en `POST /vuelos/search` (contrato
  // v1.5.0.0). Como es una cabecera no simple, el navegador dispara un PREFLIGHT:
  // si no aparece en `allowedHeaders`, el navegador rechaza la peticion ANTES de
  // salir, y la busqueda falla con un error de red sin llegar al controlador.
  //
  // `credentials: true` es necesario para las rutas autenticadas, que viajan con
  // `withCredentials: true` para enviar la cookie httpOnly de sesion. Al
  // activarlo, el navegador exige que `origin` sea un valor EXACTO (nunca `*`),
  // por eso se mantiene la lista de origenes concreta en lugar de un comodin.
  app.enableCors({
    origin: [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.onrender\.com$/
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'idempotency-key',
      'Idempotency-Key',
      'x-device-fingerprint',
      'X-Device-Fingerprint',
    ],
  });

  app.setGlobalPrefix('api/v1');

  // `whitelist: true` + `forbidNonWhitelisted: true` es lo que hace que un campo
  // no declarado en el DTO sea un 400 y no se ignore en silencio. Sin eso, un
  // cliente podria mandar `{ departureDate: 'ayer' }` creyendo que habia
  // programado un vuelo.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: factoryDeValidacion,
    }),
  );

  // Registrar el filtro global de excepciones para cumplir con la RFC 7807
  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  // HATEOAS: inyectar enlaces en las respuestas (Richardson Nivel 3)
  app.useGlobalInterceptors(new HateoasInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Booking Prototipo API')
    .setDescription('API base para los dominios de Alojamientos, Autos, Atracciones y Vuelos.')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
