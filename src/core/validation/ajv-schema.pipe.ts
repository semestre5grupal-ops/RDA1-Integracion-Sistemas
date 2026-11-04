import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/**
 * ==============================================================================
 * AjvSchemaPipe (NestJS Custom Validation Pipe)
 * ==============================================================================
 * Valida el cuerpo (Body) de las peticiones HTTP contra un esquema JSON Schema
 * definido en 'contracts/alojamientos-schemas.json'.
 *
 * Cumple con el estándar RFC 7807 (Problem Details) devolviendo el arreglo
 * canónico 'invalidParams' exigido por la cátedra RDA2.
 *
 * Ejemplo de uso en controlador:
 *   @Post('orders')
 *   @UsePipes(new AjvSchemaPipe('OrderCreateRequestV2'))
 *   async crearOrden(@Body() body: any) { ... }
 */
@Injectable()
export class AjvSchemaPipe implements PipeTransform {
  private static ajvInstance: Ajv | null = null;
  private static schemasDoc: any = null;
  private readonly validator: ValidateFunction;

  constructor(private readonly schemaName: string) {
    // Inicialización singleton perezosa de Ajv
    if (!AjvSchemaPipe.ajvInstance) {
      AjvSchemaPipe.ajvInstance = new Ajv({
        allErrors: true,
        verbose: true,
        strict: false,
      });
      addFormats(AjvSchemaPipe.ajvInstance);

      const schemasPath = path.resolve(process.cwd(), 'contracts/alojamientos-schemas.json');
      if (fs.existsSync(schemasPath)) {
        AjvSchemaPipe.schemasDoc = JSON.parse(fs.readFileSync(schemasPath, 'utf8'));
        AjvSchemaPipe.ajvInstance.addSchema(AjvSchemaPipe.schemasDoc);
      }
    }

    if (!AjvSchemaPipe.schemasDoc) {
      throw new Error('No se pudo cargar el catálogo de esquemas contracts/alojamientos-schemas.json');
    }

    const schemaRef = `${AjvSchemaPipe.schemasDoc.$id}#/$defs/${this.schemaName}`;
    const compiled = AjvSchemaPipe.ajvInstance.getSchema(schemaRef);

    if (!compiled) {
      throw new Error(`Esquema no encontrado en $defs: '${this.schemaName}'`);
    }

    this.validator = compiled;
  }

  transform(value: any, metadata: ArgumentMetadata) {
    // Solo validar si el valor proviene del cuerpo (@Body) o datos planos
    if (metadata.type !== 'body' && metadata.type !== 'custom') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      throw new BadRequestException({
        type: 'https://httpstatuses.com/400',
        title: 'Cuerpo de petición inválido',
        status: 400,
        detail: 'El cuerpo de la petición debe ser un objeto JSON válido.',
        code: 'VALIDATION_FAILED',
        invalidParams: [{ name: 'body', reason: 'Debe ser un objeto JSON' }],
      });
    }

    const isValid = this.validator(value);

    if (!isValid) {
      const invalidParams = (this.validator.errors || []).map((err) => {
        let fieldName = err.instancePath ? err.instancePath.replace(/^\//, '').replace(/\//g, '.') : '';
        if (err.keyword === 'required' && err.params && (err.params as any).missingProperty) {
          fieldName = fieldName ? `${fieldName}.${(err.params as any).missingProperty}` : (err.params as any).missingProperty;
        }
        return {
          name: fieldName || 'root',
          reason: err.message || 'Valor inválido para el esquema',
        };
      });

      throw new BadRequestException({
        type: 'https://httpstatuses.com/400',
        title: 'Violación de contrato OpenAPI / JSON Schema',
        status: 400,
        detail: `La petición no cumple con el esquema canónico '${this.schemaName}'.`,
        code: 'VALIDATION_FAILED',
        invalidParams,
      });
    }

    return value;
  }
}
