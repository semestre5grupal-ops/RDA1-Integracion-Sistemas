const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 1. Cargar el contrato OpenAPI v2 de Alojamientos
const yamlPath = path.resolve(__dirname, '../contracts/alojamientos-openapi-v2.yaml');
const rawYaml = fs.readFileSync(yamlPath, 'utf8');
const openapiDoc = yaml.load(rawYaml);

// 2. Generar el documento OpenAPI completo en JSON
const jsonOpenApiPath = path.resolve(__dirname, '../contracts/alojamientos-openapi-v2.json');
fs.writeFileSync(jsonOpenApiPath, JSON.stringify(openapiDoc, null, 2), 'utf8');
console.log(`[OK] Generado OpenAPI JSON completo: ${jsonOpenApiPath}`);

// 3. Transformar los esquemas a JSON Schema estándar (Draft-07 / 2020-12 compatible)
function transformOpenApiToJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(transformOpenApiToJsonSchema);

  const clone = {};

  for (const [key, value] of Object.entries(schema)) {
    // Reemplazar referencias internas #/components/schemas/X por #/$defs/X
    if (key === '$ref' && typeof value === 'string') {
      if (value.startsWith('#/components/schemas/')) {
        clone['$ref'] = value.replace('#/components/schemas/', '#/$defs/');
      } else {
        clone['$ref'] = value;
      }
    } else {
      clone[key] = transformOpenApiToJsonSchema(value);
    }
  }

  // Convertir 'nullable: true' de OpenAPI a 'type: [type, "null"]' de JSON Schema
  if (clone.nullable === true) {
    delete clone.nullable;
    if (typeof clone.type === 'string') {
      clone.type = [clone.type, 'null'];
    } else if (Array.isArray(clone.type) && !clone.type.includes('null')) {
      clone.type.push('null');
    }
  }

  return clone;
}

const schemas = openapiDoc.components?.schemas || {};
const transformedDefs = {};

for (const [name, schemaObj] of Object.entries(schemas)) {
  transformedDefs[name] = transformOpenApiToJsonSchema(schemaObj);
}

const jsonSchemaDoc = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://booking.epn.edu.ec/schemas/v2/alojamientos.json',
  title: 'Catálogo de Esquemas JSON Schema — Vertical de Alojamientos (RDA2 v2.2.0)',
  description:
    'Esquemas JSON Schema canónicos derivados del contrato OpenAPI 3.0.3 de Alojamientos (MS_ALO) para validación de DTOs, peticiones y respuestas.',
  type: 'object',
  $defs: transformedDefs,
  // Alias de compatibilidad para validadores más antiguos (Draft-04 / Draft-07)
  definitions: transformedDefs,
};

const jsonSchemaPath = path.resolve(__dirname, '../contracts/alojamientos-schemas.json');
fs.writeFileSync(jsonSchemaPath, JSON.stringify(jsonSchemaDoc, null, 2), 'utf8');
console.log(`[OK] Generado JSON Schema estándar ($defs con 69 esquemas): ${jsonSchemaPath}`);
