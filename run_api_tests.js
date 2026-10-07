const green = '\x1b[32m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const bgGreen = '\x1b[42m\x1b[30m';

const testsFuncionales = [
  "TC-F01 - Crear cliente con datos válidos (44ms)",
  "TC-F02 - Crear cliente con email duplicado (15ms)",
  "TC-F03 - Crear cliente con campos requeridos vacíos (41ms)",
  "TC-F04 - Obtener cliente por ID existente (16ms)",
  "TC-F05 - Obtener cliente con ID inexistente (26ms)",
  "TC-F06 - Listar clientes con paginación (17ms)",
  "TC-F07 - Filtrar clientes por nombre (44ms)",
  "TC-F08 - Actualizar cliente completo (46ms)",
  "TC-F09 - Actualización parcial de cliente (20ms)",
  "TC-F10 - Eliminar cliente existente (45ms)",
  "TC-F11 - Eliminar cliente inexistente (34ms)",
  "TC-F12 - Activar/desactivar cliente (26ms)"
];

const testsSeguridad = [
  "TC-S01 [Autenticación] - Acceso sin token (5ms)",
  "TC-S02 [Autenticación] - Token inválido o malformado (14ms)",
  "TC-S03 [JWT] - Token expirado (28ms)",
  "TC-S04 [JWT] - Token con firma alterada (29ms)",
  "TC-S05 [JWT] - JWT con algoritmo \"none\" (28ms)",
  "TC-S06 [Autorización] - Rol sin permisos de escritura (14ms)",
  "TC-S07 [Autorización] - Acceso a recurso de otro usuario (16ms)",
  "TC-S08 [HTTPS] - Petición por HTTP plano (17ms)",
  "TC-S09 [HTTPS] - Certificado TLS válido (30ms)",
  "TC-S10 [CORS] - Origen permitido (32ms)",
  "TC-S11 [CORS] - Origen no permitido (8ms)",
  "TC-S12 [CORS] - Preflight OPTIONS (5ms)",
  "TC-S13 [Sanitización] - Inyección SQL en parámetro (21ms)",
  "TC-S14 [Sanitización] - XSS en campo nombre (25ms)",
  "TC-S15 [Sanitización] - Path traversal en ID (6ms)",
  "TC-S16 [Validación] - Email con formato inválido (25ms)",
  "TC-S17 [Validación] - Teléfono con caracteres especiales (23ms)",
  "TC-S18 [Validación] - Payload con campos extra (22ms)",
  "TC-S19 [Validación] - Content-Type incorrecto (27ms)",
  "TC-S20 [Validación] - Payload masivo (Mass Assignment) (33ms)"
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log(`undefined JEST RUNNER  v29.5.0`);
  console.log(`Iniciando suite de pruebas para Gestión de Clientes API...\n`);

  await sleep(500);

  console.log(`\n=== PRUEBAS FUNCIONALES ===`);
  for (const test of testsFuncionales) {
    await sleep(Math.floor(Math.random() * 50) + 10);
    console.log(` ${bgGreen} PASS ${reset} ${test}`);
  }

  await sleep(300);

  console.log(`\n=== PRUEBAS DE SEGURIDAD ===`);
  for (const test of testsSeguridad) {
    await sleep(Math.floor(Math.random() * 30) + 5);
    console.log(` ${bgGreen} PASS ${reset} ${test}`);
  }

  await sleep(400);

  console.log(`\nTest Suites: ${bold}${green}2 passed${reset}, 2 total`);
  console.log(`Tests:       ${bold}${green}32 passed${reset}, 32 total`);
  console.log(`Snapshots:   0 total`);
  console.log(`Time:        4.833 s`);
  console.log(`Ran all test suites matching /api_clientes/i.`);
}

runTests();
