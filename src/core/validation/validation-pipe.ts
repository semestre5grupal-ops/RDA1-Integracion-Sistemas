import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { CodigoProblema, InvalidParam } from '../errors/codigo-error';

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
export function aplanarValidacion(
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
export function factoryDeValidacion(errores: ValidationError[]): BadRequestException {
  return new BadRequestException({
    message: 'La peticion no supera la validacion del esquema.',
    code: CodigoProblema.VALIDATION_FAILED,
    invalidParams: aplanarValidacion(errores),
  });
}

/**
 * `ValidationPipe` global de la API. Vive aqui (y no dentro de `main.ts`) para
 * que las pruebas HTTP levanten la aplicacion con EXACTAMENTE la misma
 * configuracion que produccion: importar `main.ts` arrancaria el servidor.
 *
 * `whitelist: true` + `forbidNonWhitelisted: true` es lo que hace que un campo
 * no declarado en el DTO sea un 400 y no se ignore en silencio.
 */
export function crearValidationPipeGlobal(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: factoryDeValidacion,
  });
}
