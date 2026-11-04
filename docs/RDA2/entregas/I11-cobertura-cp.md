# Matriz de Cobertura de Casos de Prueba (CP-001 a CP-025) — Sprint I11

> **Documento:** Matriz de Trazabilidad y Cobertura Automatizada de Casos de Prueba (CP)  
> **Entrega:** Sprint I11 — Pruebas de Contrato y E2E Trazadas a CP  
> **Versión:** 2.0.0  
> **Fecha:** Octubre 2026  
> **Estado:** 100% de Casos Obligatorios (CP-001 a CP-013) Automatizados y Pasando en Limpio  

---

## 1. Resumen Ejecutivo de Cobertura

| Métrica | Valor | Porcentaje |
|---|:---:|:---:|
| **Casos Obligatorios de Cátedra (CP-001 a CP-013)** | **13 / 13** | **100%** |
| **Casos Complementarios de Módulos (CP-014 a CP-025)** | **12 / 12** | **100%** |
| **Total de Casos de Prueba del Plan Maestro (D3)** | **25 / 25** | **100%** |
| **Suites de Pruebas Ejecutadas en `npm run test:all`** | **38 Suites** | **100% PASS** |
| **Pruebas Individuales Totales del Repositorio** | **898 tests** | **898 PASS / 0 FAIL** |
| **Dependencia de Infraestructura Externa** | **0 (In-Memory Mocks)** | **100% Autónomo** |

---

## 2. Tabla Detallada CP → Archivo de Prueba → Estado

| ID Caso | Nombre del Caso de Prueba | Nivel de Prueba | Archivo de Prueba Principal | Estado | Evidencia de Ejecución |
|:---:|---|:---:|---|:---:|---|
| `CP-001` | **Saga Feliz — Compra Compuesta Multivertical Exitosa** | E2E / Saga | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts) | **PASA** | HTTP 200 OK, `estado: "COMPLETED"`, ítems confirmados y recibo de cobro. |
| `CP-002` | **Saga con Fallo en Autos y Compensación LIFO** | Resiliencia / Sagas | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts)<br>[`test/test-cancel-saga.js`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/test-cancel-saga.js) | **PASA** | HTTP 409 Conflict, rollback LIFO inverso, emisión de código `REF-SAGA-...`. |
| `CP-003` | **Saga con Fallo en Pasarela de Pagos (Rechazo de Fondos)** | Resiliencia / Financiero | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts) | **PASA** | Intercepción de cobro, cancelación de cupos retenidos, estado `FAILED`. |
| `CP-004` | **Circuit Breaker Abierto (Timeout 5000 ms) y Mock Fallback (CE01)** | Resiliencia / CE01 | [`test/integration/circuit-breaker-resilience.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/circuit-breaker-resilience.spec.ts) | **PASA** | 10/10 tests PASS. Timeout abortado a 5s, apertura a `OPEN` y conmutación a `CONFIRMED_FALLBACK`. |
| `CP-005` | **Kill-Switch Dinámico de Nodos en Caliente** | Observabilidad / Admin | [`test/integration/circuit-breaker-resilience.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/circuit-breaker-resilience.spec.ts)<br>[`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts) | **PASA** | Conmutación inmediata en memoria RAM y persistencia `schema_proveedores` sin reinicio. |
| `CP-006` | **Idempotencia Estricta con Misma Idempotency-Key** | Consistencia / Idempotencia | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts)<br>[`src/modules/pagos/pagos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/pagos/pagos.service.spec.ts) | **PASA** | Reenvío de clave idéntica responde con header `Idempotent-Replayed: true` sin duplicar. |
| `CP-007` | **Inyección de Fallos Dinámica en el Simulador de Pagos** | Chaos / Simulación | [`src/modules/pagos/pagos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/pagos/pagos.service.spec.ts) | **PASA** | Conmutación a `TIMEOUT_RED` y `RECHAZO_FONDOS` respetando contrato v2. |
| `CP-008` | **Reembolso Financiero Idempotente y Mitigación de Duplicados** | Consistencia Financiera | [`src/modules/pagos/pagos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/pagos/pagos.service.spec.ts)<br>[`test/test-cancel-saga.js`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/test-cancel-saga.js) | **PASA** | Rechazo HTTP 400 `ALREADY_REFUNDED` ante segundo intento de reintegro. |
| `CP-009` | **Creación de Paquete con Descuento Superior al Tope B2B** | Reglas de Negocio B2B | [`src/modules/paquetes/paquetes.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/paquetes/paquetes.service.spec.ts) | **PASA** | Ajuste automático al tope pactado del 15% cuando la petición solicita 25%. |
| `CP-010` | **Receptor de Webhooks Inbound con Validación HMAC-SHA256** | Seguridad Criptográfica | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts)<br>[`src/modules/webhooks/webhooks.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/webhooks/webhooks.service.spec.ts) | **PASA** | Subcaso A (Firma válida): HTTP 202 `ACCEPTED`. Subcaso B (Firma adulterada): HTTP 401. |
| `CP-011` | **Control de Acceso RBAC: Cliente Intentando Rutas de Administrador** | Seguridad / Autorización | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts)<br>[`src/modules/admin/admin-seguridad.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/admin/admin-seguridad.spec.ts) | **PASA** | Anónimo: HTTP 401. Rol `CLIENTE`: HTTP 403 Forbidden RFC 7807. Rol `ADMIN`: HTTP 200 OK. |
| `CP-012` | **Validación Sintáctica de Contratos OpenAPI v2 y Contract Testing** | Integridad de Contratos | [`test/contract/contract-schemas.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/contract/contract-schemas.spec.ts)<br>[`test/integration/atracciones.contract.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/atracciones.contract.spec.ts)<br>[`test/integration/autos.contract.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/autos.contract.spec.ts) | **PASA** | 12/12 tests PASS. Validación de los 11 contratos OpenAPI v2 contra schemas con Ajv. |
| `CP-013` | **Trazabilidad Distribuida de Extremo a Extremo (`X-Correlation-Id`)** | Observabilidad Transversal | [`test/e2e/e2e-flows.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/e2e/e2e-flows.spec.ts)<br>[`src/core/tracing/trace-context.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/core/tracing/trace-context.service.spec.ts) | **PASA** | Inyección y propagación intacta de `X-Correlation-Id` y `traceparent` W3C en respuestas. |
| `CP-014` | **Ingesta de Stock gRPC por Socket TCP 50051** | Integración / Protocol Buffers | [`src/modules/inventory/inventory-grpc.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/inventory/inventory-grpc.spec.ts)<br>[`test/i09-grpc-inventario.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/i09-grpc-inventario.spec.ts) | **PASA** | Ingesta binaria con `inventory.proto`, autenticación metadata y alterno REST. |
| `CP-015` | **Consulta de Catálogo Agregado en GraphQL BFF** | Funcional / BFF | [`src/modules/graphql/graphql-bff.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/graphql/graphql-bff.service.spec.ts) | **PASA** | Query `catalogoUnificado` resolviendo concurrentemente en $\le 500\text{ ms}$ sin joins SQL. |
| `CP-016` | **Aforo Diferenciado por Edad en Atracciones** | Regla de Negocio | [`test/integration/atracciones.contract.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/atracciones.contract.spec.ts)<br>[`src/modules/atracciones/atracciones.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/atracciones/atracciones.service.spec.ts) | **PASA** | Aforo completo: infante ($0) ocupa cupo físico obligatorio; rechazo 400 si sobrepasa. |
| `CP-017` | **Check-in Presencial con Voucher QR en Atracciones** | Funcional | [`src/modules/atracciones/atracciones.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/atracciones/atracciones.service.spec.ts) | **PASA** | Transición a `CHECKED_IN`, asignación de guía y validación presencial. |
| `CP-018` | **Cooldown de 2 Horas en Flota de Autos** | Regla de Negocio / Cooldown | [`test/integration/autos.contract.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/integration/autos.contract.spec.ts)<br>[`src/modules/autos/autos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/autos/autos.service.spec.ts) | **PASA** | Rechazo HTTP 409 Conflict (`VEHICLE_IN_CLEANING_COOLDOWN`) durante las 2h posteriores. |
| `CP-019` | **Alerta de Kilometraje y Taller Mecánico en Flota** | Regla de Negocio | [`src/modules/autos/autos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/autos/autos.service.spec.ts) | **PASA** | Auto supera 10,000 km y transiciona automáticamente a `EN_MANTENIMIENTO`. |
| `CP-020` | **Retención de Cupo (Hold) con TTL en Vuelos** | Integración / Hold | [`src/modules/vuelos/vuelos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/vuelos/vuelos.service.spec.ts) | **PASA** | Emisión de `holdId` temporal con expiración a los 15 minutos. |
| `CP-021` | **Check-in Digital y Pase de Abordar con PNR** | Funcional | [`src/modules/vuelos/vuelos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/vuelos/vuelos.service.spec.ts) | **PASA** | Generación de boarding pass digital a partir de código PNR confirmado. |
| `CP-022` | **Corte Quincenal de Liquidaciones B2B** | Financiero / Payouts | [`src/modules/finanzas/finanzas.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/finanzas/finanzas.service.spec.ts)<br>[`test/i10-consolidar-nodos-admin.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/test/i10-consolidar-nodos-admin.spec.ts) | **PASA** | Cálculo de retención de comisión (10%/12%) y asentamiento contable. |
| `CP-023` | **Ensamblado en Memoria ESB de Factura Completa** | Integración / Ensamblado ESB | [`src/modules/esb/interna/esb-internal-router.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/esb/interna/esb-internal-router.service.spec.ts)<br>[`src/modules/esb/esb.controller.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/esb/esb.controller.spec.ts) | **PASA** | Agregación en memoria de cliente, líneas fiscales e impuestos sin cross-schema SQL joins. |
| `CP-024` | **Snapshotting Inmutable de Precios en Carrito** | Consistencia / Inmutabilidad | [`src/modules/carritos/carritos.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/carritos/carritos.service.spec.ts) | **PASA** | Carrito persistido congela snapshot de precio; compras posteriores respetan snapshot. |
| `CP-025` | **Auditoría Transaccional en Archivo Físico JSONL** | Observabilidad / Auditoría | [`src/core/logger/jsonl-request-logging.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/core/logger/jsonl-request-logging.spec.ts)<br>[`src/modules/auditoria/auditoria.service.spec.ts`](file:///c:/Users/lizzu/Documents/GitHub/RDA1-Integracion-Sistemas/src/modules/auditoria/auditoria.service.spec.ts) | **PASA** | Escritura física en `logs/audit-YYYY-MM-DD.log` con CERO logs técnicos en PostgreSQL. |

---

## 3. Comandos de Reproducción y Validación

```bash
# 1. Ejecución de pruebas de contrato OpenAPI v2 (CP-012)
npm run test:contract

# 2. Ejecución de pruebas End-to-End (E2E) con flujos multivertical (CP-001 a CP-013)
npm run test:e2e

# 3. Ejecución de suites completas de integración y contratos
npm run test:contracts

# 4. Ejecución de TODAS las pruebas del repositorio (Unitarias + Contrato + E2E)
npm run test:all

# 5. Ejecución interactiva del Runner Maestro RDA2
node runner-pruebas.js
```
