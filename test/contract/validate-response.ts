import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv, { ErrorObject } from 'ajv';

export interface ValidationParams {
  contractPath: string;
  operationId?: string;
  path?: string;
  method?: string;
  statusCode: number | string;
  responseBody: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: ErrorObject[];
  schema?: any;
  resolvedOperation?: {
    path: string;
    method: string;
    operationId?: string;
  };
}

// Caché de documentos YAML y de instancias de Ajv
const parsedContractsCache = new Map<string, any>();
const ajvInstancesCache = new Map<string, Ajv>();

/**
 * Carga y cachea una especificación OpenAPI en YAML
 */
export function loadContract(contractPath: string): any {
  const resolvedPath = path.isAbsolute(contractPath)
    ? contractPath
    : path.resolve(process.cwd(), contractPath);

  if (parsedContractsCache.has(resolvedPath)) {
    return parsedContractsCache.get(resolvedPath);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Contrato OpenAPI no encontrado en la ruta: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const doc = yaml.load(raw) as any;
  parsedContractsCache.set(resolvedPath, doc);
  return doc;
}

/**
 * Obtiene o inicializa la instancia de Ajv configurada para un contrato
 */
function getAjvForContract(contractPath: string, doc: any): Ajv {
  const resolvedPath = path.isAbsolute(contractPath)
    ? contractPath
    : path.resolve(process.cwd(), contractPath);

  if (ajvInstancesCache.has(resolvedPath)) {
    return ajvInstancesCache.get(resolvedPath)!;
  }

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  // Pre-registrar esquemas comunes si existen
  try {
    const commonPath = path.resolve(process.cwd(), 'contracts/common/components-v2.yaml');
    if (fs.existsSync(commonPath)) {
      const commonDoc = yaml.load(fs.readFileSync(commonPath, 'utf8')) as any;
      if (commonDoc?.components?.schemas) {
        for (const [name, schema] of Object.entries(commonDoc.components.schemas)) {
          try {
            ajv.addSchema(schema as object, `./common/components-v2.yaml#/components/schemas/${name}`);
          } catch {}
          try {
            ajv.addSchema(schema as object, `common/components-v2.yaml#/components/schemas/${name}`);
          } catch {}
          try {
            ajv.addSchema(schema as object, `#/components/schemas/${name}`);
          } catch {}
        }
      }
    }
  } catch {}

  // Pre-registrar esquemas de components/schemas para resolución de $ref locales
  if (doc?.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      try {
        ajv.addSchema(schema as object, `#/components/schemas/${name}`);
      } catch {
        // Ignorar si ya fue registrado
      }
    }
  }

  ajvInstancesCache.set(resolvedPath, ajv);
  return ajv;
}

/**
 * Localiza la operación OpenAPI a partir de operationId o del par (path, method)
 */
export function findOperation(
  doc: any,
  criteria: { operationId?: string; path?: string; method?: string },
): { path: string; method: string; operation: any } | null {
  const { operationId, path: targetPath, method: targetMethod } = criteria;

  if (targetPath && targetMethod) {
    const normMethod = targetMethod.toLowerCase();
    const pathItem = doc.paths?.[targetPath];
    if (pathItem && pathItem[normMethod]) {
      return {
        path: targetPath,
        method: normMethod,
        operation: pathItem[normMethod],
      };
    }
  }

  if (operationId) {
    for (const [p, methods] of Object.entries(doc.paths || {})) {
      for (const [m, op] of Object.entries(methods as any)) {
        if (op && typeof op === 'object' && (op as any).operationId === operationId) {
          return {
            path: p,
            method: m.toLowerCase(),
            operation: op,
          };
        }
      }
    }
  }

  // Búsqueda flexible por coincidencia parcial si se proveyó targetPath
  if (targetPath) {
    for (const [p, methods] of Object.entries(doc.paths || {})) {
      if (p.replace(/\{[^}]+\}/g, '*') === targetPath.replace(/\{[^}]+\}/g, '*')) {
        for (const [m, op] of Object.entries(methods as any)) {
          if (!targetMethod || m.toLowerCase() === targetMethod.toLowerCase()) {
            return {
              path: p,
              method: m.toLowerCase(),
              operation: op,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Valida un cuerpo de respuesta contra el esquema definido en el contrato OpenAPI
 */
export function validateResponse(params: ValidationParams): ValidationResult {
  const { contractPath, operationId, path: endpointPath, method, statusCode, responseBody } = params;
  const doc = loadContract(contractPath);
  const found = findOperation(doc, { operationId, path: endpointPath, method });

  if (!found) {
    throw new Error(
      `Operación no encontrada en ${contractPath} con criteria: ` +
        JSON.stringify({ operationId, path: endpointPath, method }),
    );
  }

  const responses = found.operation.responses || {};
  const statusStr = String(statusCode);
  const responseDef = responses[statusStr] || responses.default;

  if (!responseDef) {
    throw new Error(
      `No se encontró definición de respuesta para status '${statusStr}' en operación ${found.operation.operationId || found.path} de ${contractPath}`,
    );
  }

  // Buscar schema en content['application/json'] o similar
  const content = responseDef.content || {};
  const jsonContent =
    content['application/json'] ||
    content['application/problem+json'] ||
    content['*/*'];

  const schema = jsonContent?.schema;
  if (!schema) {
    // Si la respuesta no define schema (ej: 204 No Content), se considera válida si el cuerpo está vacío
    return {
      isValid: true,
      schema: null,
      resolvedOperation: {
        path: found.path,
        method: found.method,
        operationId: found.operation.operationId,
      },
    };
  }

  const ajv = getAjvForContract(contractPath, doc);
  let validateFn: any;
  try {
    validateFn = ajv.compile(schema);
  } catch (err: any) {
    // Si falla la compilación por $ref no registrado, intentar compilar con esquema envuelto
    validateFn = ajv.compile({
      ...schema,
      definitions: doc?.components?.schemas,
    });
  }

  const isValid = Boolean(validateFn(responseBody));

  return {
    isValid,
    errors: isValid ? undefined : validateFn.errors,
    schema,
    resolvedOperation: {
      path: found.path,
      method: found.method,
      operationId: found.operation.operationId,
    },
  };
}

/**
 * Aserción estricta de cumplimiento de contrato OpenAPI (lanza Error si no cumple)
 */
export function assertMatchesContract(params: ValidationParams): void {
  const result = validateResponse(params);
  if (!result.isValid) {
    const errorDetails = (result.errors || [])
      .map((e) => ` - ${e.instancePath || 'root'}: ${e.message} (params: ${JSON.stringify(e.params)})`)
      .join('\n');

    throw new Error(
      `[FAIL CONTRATO OpenAPI] La respuesta para status ${params.statusCode} en ` +
        `'${result.resolvedOperation?.operationId || result.resolvedOperation?.path}' ` +
        `(${params.contractPath}) no cumple el schema:\n${errorDetails}\nPayload recibido: ${JSON.stringify(params.responseBody, null, 2)}`,
    );
  }
}
