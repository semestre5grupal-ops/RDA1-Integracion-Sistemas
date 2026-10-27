import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Validador en tiempo de ejecución con AJV (Another JSON Schema Validator)
 * Verifica que los payloads entrantes cumplan rigurosamente con los contratos
 * JSON Schema derivados de OpenAPI v3 (Cátedra RDA2 Semana 9).
 */
@Injectable()
export class AjvValidationPipe implements PipeTransform {
  private readonly logger = new Logger(AjvValidationPipe.name);
  private readonly ajv: Ajv;
  private readonly validators: Map<string, ValidateFunction> = new Map();
  private schemaBundle: any = null;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      coerceTypes: true,
      strict: false,
    });
    addFormats(this.ajv);

    this.loadSchemas();
  }

  private loadSchemas() {
    try {
      const schemaPath = path.resolve('contracts/schemas/atracciones.schema.json');
      if (fs.existsSync(schemaPath)) {
        const raw = fs.readFileSync(schemaPath, 'utf8');
        this.schemaBundle = JSON.parse(raw);

        // Registrar el bundle principal con sus definitions
        this.ajv.addSchema(this.schemaBundle, 'atracciones-bundle');

        // Compilar validadores clave
        if (this.schemaBundle.definitions) {
          if (this.schemaBundle.definitions.CreateReservaRequestV3) {
            this.validators.set(
              'CreateReservaRequestV3',
              this.ajv.compile({
                $ref: 'atracciones-bundle#/definitions/CreateReservaRequestV3',
              }),
            );
          }
          if (this.schemaBundle.definitions.CreateReservaRequestV2) {
            this.validators.set(
              'CreateReservaRequestV2',
              this.ajv.compile({
                $ref: 'atracciones-bundle#/definitions/CreateReservaRequestV2',
              }),
            );
          }
        }
        this.logger.log('AJV: Schemas de OpenAPI v3 de Atracciones cargados exitosamente.');
      } else {
        this.logger.warn(`AJV: Archivo de schemas no encontrado en ${schemaPath}`);
      }

      // Cargar Schemas de Autos v3
      const autosSchemaPath = path.resolve('contracts/schemas/autos.schema.json');
      if (fs.existsSync(autosSchemaPath)) {
        const rawAutos = fs.readFileSync(autosSchemaPath, 'utf8');
        const autosBundle = JSON.parse(rawAutos);
        this.ajv.addSchema(autosBundle, 'autos-bundle');

        if (autosBundle.definitions && autosBundle.definitions.CreateAutoOrderRequestV2) {
          this.validators.set(
            'CreateAutoOrderRequestV2',
            this.ajv.compile({
              $ref: 'autos-bundle#/definitions/CreateAutoOrderRequestV2',
            }),
          );
        }
        this.logger.log('AJV: Schemas de OpenAPI v3 de Autos cargados exitosamente.');
      }
    } catch (e: any) {
      this.logger.error(`AJV: Error al cargar schemas: ${e.message}`);
    }
  }

  transform(value: any, metadata: ArgumentMetadata) {
    // Solo validar cuerpos de petición tipo 'body'
    if (metadata.type !== 'body' || !value || typeof value !== 'object') {
      return value;
    }

    // Regla de Integridad de Checkout: Concordancia slot_id vs date / time
    this.validarConcordanciaSlot(value);

    // Si es una petición de reserva, validar contra el JSON Schema compilado
    const isReservaRequest =
      value.slot_id !== undefined ||
      value.atraccion_id !== undefined ||
      value.attraction_id !== undefined;

    if (isReservaRequest) {
      this.validarReservaSchema(value);
    }

    return value;
  }

  /**
   * Valida la concordancia entre slot_id y la fecha/hora proporcionadas.
   * Regla de Negocio Semana 9: slot_id manda para bloqueo de aforo;
   * discrepancia retorna 400 Bad Request con code: SLOT_TIME_MISMATCH.
   */
  private validarConcordanciaSlot(value: any) {
    const slotId: string | undefined = value.slot_id || value.slotId;
    const tourDate: string | undefined = value.date || value.fecha;
    const tourTime: string | undefined = value.time || value.hora || value.time_24h;

    if (!slotId) return;

    // Si el slot_id tiene formato canónico: slot-YYYYMMDD-HHMM (ej. slot-20261025-1030)
    const slotMatch = slotId.match(/^slot-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (slotMatch) {
      const [, year, month, day, hours, minutes] = slotMatch;
      const expectedDate = `${year}-${month}-${day}`;
      const expectedTimePrefix = `${hours}:${minutes}`;

      if (tourDate && tourDate !== expectedDate) {
        throw new HttpException(
          {
            type: 'https://booking.epn.edu.ec/errors/slot-mismatch',
            title: 'Inconsistencia de Franja Horaria (Slot Date Mismatch)',
            status: HttpStatus.BAD_REQUEST,
            detail: `El slot_id '${slotId}' codifica la fecha ${expectedDate}, pero la petición envió 'date': '${tourDate}'.`,
            instance: '/api/v3/atracciones/reservas',
            code: 'SLOT_TIME_MISMATCH',
            correlation_id: `corr-val-${Date.now()}`,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (tourTime) {
        // Normalizar hora para comparar dígitos de hora y minutos
        const cleanDigits = tourTime.replace(/[^0-9]/g, '');
        const expectedDigits = `${hours}${minutes}`;
        if (cleanDigits.length >= 4 && !cleanDigits.startsWith(expectedDigits)) {
          throw new HttpException(
            {
              type: 'https://booking.epn.edu.ec/errors/slot-mismatch',
              title: 'Inconsistencia de Franja Horaria (Slot Time Mismatch)',
              status: HttpStatus.BAD_REQUEST,
              detail: `El slot_id '${slotId}' codifica la franja de las ${expectedTimePrefix}, pero la petición envió 'time': '${tourTime}'.`,
              instance: '/api/v3/atracciones/reservas',
              code: 'SLOT_TIME_MISMATCH',
              correlation_id: `corr-val-${Date.now()}`,
              timestamp: new Date().toISOString(),
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  /**
   * Valida el payload de reserva con AJV contra CreateReservaRequestV3 / V2.
   */
  private validarReservaSchema(value: any) {
    const validatorV3 = this.validators.get('CreateReservaRequestV3');
    const validatorV2 = this.validators.get('CreateReservaRequestV2');

    // Intentar validar primero con v3 (inglés canónico)
    if (validatorV3) {
      const valid = validatorV3(value);
      if (valid) return;
    }

    // Intentar validar con v2 si vino en español
    if (validatorV2) {
      const valid = validatorV2(value);
      if (valid) return;
    }

    // Si ambos fallaron o falta un campo indispensable
    const adultCount = Number(value.adult_count ?? value.cantidad_adultos ?? value.ticket_count ?? 0);
    if (adultCount < 1) {
      throw new HttpException(
        {
          type: 'https://booking.epn.edu.ec/errors/contract-validation',
          title: 'Contract Schema Validation Failed (AJV)',
          status: HttpStatus.BAD_REQUEST,
          detail: 'El campo adult_count es requerido y debe ser mayor o igual a 1 conforme al contrato OpenAPI v3.',
          code: 'CONTRACT_VALIDATION_ERROR',
          invalid_params: [
            {
              name: 'adult_count',
              reason: 'must be >= 1',
            },
          ],
          instance: '/api/v3/atracciones/reservas',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
