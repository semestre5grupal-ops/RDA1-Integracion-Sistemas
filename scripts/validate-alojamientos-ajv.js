/**
 * ==============================================================================
 * scripts/validate-alojamientos-ajv.js
 * Script de validación con Ajv para esquemas de Alojamientos (Booking RDA2)
 * Permite validar objetos JSON directamente contra el catálogo canónico
 * 'contracts/alojamientos-schemas.json'.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// 1. Inicializar Ajv con formatos estándar (email, date, date-time, uuid, uri)
const ajv = new Ajv({
  allErrors: true,        // Reportar todos los errores encontrados, no solo el primero
  verbose: true,          // Incluir datos del esquema y valores inválidos
  strict: false,          // Permitir palabras clave personalizadas de OpenAPI si las hubiera
});

addFormats(ajv);

// 2. Cargar el catálogo completo de esquemas JSON Schema de Alojamientos
const schemasPath = path.resolve(__dirname, '../contracts/alojamientos-schemas.json');
if (!fs.existsSync(schemasPath)) {
  console.error(`[ERROR] No se encontró el archivo de esquemas en: ${schemasPath}`);
  process.exit(1);
}

const schemasDoc = JSON.parse(fs.readFileSync(schemasPath, 'utf8'));

// Compilar el documento maestro en Ajv (registra el $id y todos los $defs)
ajv.addSchema(schemasDoc);

/**
 * Validador genérico contra cualquier definición en $defs
 * @param {string} schemaName - Nombre del esquema en $defs (ej. 'OrderCreateRequestV2', 'Ocupantes')
 * @param {any} data - Objeto JSON a validar
 */
function validateSchema(schemaName, data) {
  const schemaRef = `${schemasDoc.$id}#/$defs/${schemaName}`;
  const validator = ajv.getSchema(schemaRef);

  if (!validator) {
    throw new Error(`Esquema no encontrado en $defs: '${schemaName}'`);
  }

  const isValid = validator(data);
  return {
    isValid,
    errors: validator.errors || [],
  };
}

// ==============================================================================
// CASOS DE PRUEBA DE DEMOSTRACIÓN
// ==============================================================================

console.log('====================================================================');
console.log('  VALIDADOR AJV — CONTRATO DE ALOJAMIENTOS (Booking Prototipo RDA2)  ');
console.log('====================================================================\n');

// ------------------------------------------------------------------------------
// Prueba 1: 'OrderCreateRequestV2' — Payload VÁLIDO (Caso Feliz)
// ------------------------------------------------------------------------------
console.log('▶ Prueba 1: Validando OrderCreateRequestV2 (Payload Válido)...');

const ordenValida = {
  alojamientoId: 'HTL-QUITO-001',
  tipoHabitacionCodigo: 'SUITE_DELUXE',
  fechaInicio: '2026-11-01',
  fechaFin: '2026-11-05',
  cantidadHabitaciones: 1,
  ocupantes: {
    adultos: 2,
    ninos: 0,
  },
  regimenSeleccionado: 'DESAYUNO_INCLUIDO',
  cotizacionId: '3f2b8a52-6d3e-4a43-9a0e-1f6d7a9b2c11',
  totalPagar: '560.00',
  currency: 'USD',
  payment_method: 'TARJETA_CREDITO',
  payment_reference: 'AUTH-VISA-982341',
  saga_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  huespedTitular: {
    nombreCompleto: 'Joselyn Cadena',
    tipoDocumento: 'CEDULA',
    identificacion: '1712345675',
    email: 'jlcadenac@puce.edu.ec',
    telefono: '+593991234567',
    nacionalidad: 'Ecuatoriana',
  },
  planTarifaCodigo: 'FLEX_BB',
};

const res1 = validateSchema('OrderCreateRequestV2', ordenValida);
if (res1.isValid) {
  console.log('  [OK] El payload cumple estrictamente con el esquema OrderCreateRequestV2.\n');
} else {
  console.error('  [FALLO INESPERADO]', res1.errors);
}

// ------------------------------------------------------------------------------
// Prueba 2: 'OrderCreateRequestV2' — Payload INVÁLIDO (Errores múltiples)
// ------------------------------------------------------------------------------
console.log('▶ Prueba 2: Validando OrderCreateRequestV2 con Errores Provocados...');

const ordenInvalida = {
  alojamientoId: 'HTL-QUITO-001',
  // Error 1: Falta tipoHabitacionCodigo (campo requerido)
  fechaInicio: '01/11/2026', // Error 2: Fecha en formato no ISO (debe ser YYYY-MM-DD)
  fechaFin: '2026-11-05',
  ocupantes: {
    adultos: 0, // Error 3: mínimo 1 adulto requerido (minimum: 1)
  },
  totalPagar: 560, // Error 4: Debe ser string decimal Money ("560.00"), no number
  currency: 'EUR', // Error 5: Solo se permite 'USD'
  payment_method: 'BITCOIN', // Error 6: Método de pago no soportado en enum
  saga_id: 'saga-01',
  huespedTitular: {
    nombreCompleto: 'Carlos Perez',
    tipoDocumento: 'CEDULA',
    email: 'correo-invalido-sin-arroba', // Error 7: Formato de email inválido
  },
};

const res2 = validateSchema('OrderCreateRequestV2', ordenInvalida);
if (!res2.isValid) {
  console.log(`  [OK] Ajv detectó correctamente ${res2.errors.length} infracciones del contrato:`);
  res2.errors.forEach((err, idx) => {
    console.log(`    ${idx + 1}. Ruta: '${err.instancePath || '/'}'`);
    console.log(`       Motivo: ${err.message}`);
    if (err.params) console.log(`       Parámetros: ${JSON.stringify(err.params)}`);
  });
  console.log('');
} else {
  console.error('  [ERROR] El payload inválido fue aceptado por error.\n');
}

// ------------------------------------------------------------------------------
// Prueba 3: 'Ocupantes' — Esquema individual de capacidad
// ------------------------------------------------------------------------------
console.log('▶ Prueba 3: Validando esquema específico Ocupantes...');
const ocupantesValidos = { adultos: 3, ninos: 2, edadesNinos: [5, 9] };
const res3 = validateSchema('Ocupantes', ocupantesValidos);
console.log(`  Resultado: ${res3.isValid ? '[OK] Válido' : '[FALLO]'}\n`);

console.log('====================================================================');
console.log('  Validación con Ajv completada con éxito.');
console.log('====================================================================');
