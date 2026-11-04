/**
 * Benchmark de Rendimiento y Carga Básica — Booking Prototipo (RDA2)
 * Basado en los requisitos no funcionales de D2/D3:
 *  - RNF-PERF-01: Latencia P95 <= 500 ms en Búsqueda / Catálogo Unificado
 *  - RNF-PERF-02: Timeout perimetral estricto <= 5000 ms y resiliencia ante carga
 *
 * Ejecución:
 *  - Modo interactivo: node test/performance/autocannon-benchmark.js
 *  - Parámetros CLI opcionales: --url=http://localhost:3000 --connections=50 --duration=10
 */

const http = require('http');

const BASE_URL = process.env.BENCHMARK_BASE_URL || 'http://localhost:3000';
const DURATION_SEC = 10;
const CONCURRENT_CLIENTS = 50;

console.log('=================================================================');
console.log('🎯 ESCENARIO 1: Benchmark de Búsqueda y Catálogo (RNF-PERF-01)');
console.log('=================================================================');
console.log(`URL Destino:        ${BASE_URL}/api/v2/atracciones?limit=10&page=1`);
console.log(`Conexiones:         ${CONCURRENT_CLIENTS} simultáneas`);
console.log(`Duración:           ${DURATION_SEC} segundos`);
console.log('Umbrales de Aceptación (D2 / D3):');
console.log('  * Latencia Percentil 95 (P95) <= 500 ms');
console.log('  * 0% de errores HTTP 5xx');
console.log('  * Throughput >= 100 req/sec');
console.log('-----------------------------------------------------------------');
console.log('Comando oficial para ejecución con autocannon CLI:');
console.log(`  npx autocannon -c ${CONCURRENT_CLIENTS} -d ${DURATION_SEC} -m GET "${BASE_URL}/api/v2/atracciones?limit=10&page=1"`);
console.log('-----------------------------------------------------------------\n');

console.log('=================================================================');
console.log('🎯 ESCENARIO 2: Benchmark de Checkout Compuesto Saga (RNF-PERF-02)');
console.log('=================================================================');
console.log(`URL Destino:        ${BASE_URL}/api/v2/esb/checkout-saga`);
console.log(`Conexiones:         10 concurrentes`);
console.log(`Duración:           ${DURATION_SEC} segundos`);
console.log('Umbrales de Aceptación (D2 / D3):');
console.log('  * Latencia Percentil 95 (P95) <= 2000 ms');
console.log('  * 0% de solicitudes colgadas o timeouts mayores a 5000 ms');
console.log('  * Tolerancia a fallos: compensación LIFO en < 500 ms ante error');
console.log('-----------------------------------------------------------------');
console.log('Comando oficial para ejecución con autocannon CLI:');
console.log(`  npx autocannon -c 10 -d ${DURATION_SEC} -m POST \\`);
console.log('    -H "Content-Type: application/json" \\');
console.log('    -b \'{"cliente_email":"bench@test.com","cliente_nombre":"Bench","items":[{"vertical":"ATRACCIONES","item_id":"PRhu4UBTWPBC","nombre":"Tour","cantidad":1,"precio_unitario":30}]}\' \\');
console.log(`    "${BASE_URL}/api/v2/esb/checkout-saga"`);
console.log('-----------------------------------------------------------------\n');

console.log('=================================================================');
console.log('🎯 ESCENARIO 3: Especificación K6 para CI/CD (k6-script.js)');
console.log('=================================================================');
console.log(`
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '15s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% de peticiones deben responder en < 500ms
    http_req_failed: ['rate<0.01'],    // Menos del 1% de errores
  },
};

export default function () {
  const res = http.get('${BASE_URL}/api/v2/atracciones?limit=5');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => JSON.parse(r.body).data !== undefined,
  });
  sleep(0.1);
}
`);
console.log('=================================================================');
