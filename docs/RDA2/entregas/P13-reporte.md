# Reporte P13 — GraphQL (Gateway Cliente BFF)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/graphql/schema.graphql` | Creado | Esquema SDL canónico de GraphQL para el API Gateway BFF de Booking (`POST /graphql`). Define las 4 queries y 3 mutations reales, 15 tipos/inputs, resolución batch anti-N+1 (`ReservasDataLoader`) y documentación granular en bloques `"""doc"""`. |
| `contracts/graphql/README.md` | Creado | Documentación integral del Gateway GraphQL: endpoint `/graphql`, estado real vs objetivo de autenticación, propagación de `X-Correlation-Id` a Sagas en ESB, ejemplos completos con variables para las 7 operaciones, formato de errores con `extensions.code`, matriz de equivalencia GraphQL ↔ REST y notas sobre Apollo Federation v2 para el Reto 3. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P13-01 a H-P13-04 (mutaciones y queries privadas sin autenticación ni RBAC, Playground e introspección habilitados incondicionalmente en producción, tipado débil con JSON strings sin validación de esquema, y arquitectura monolítica sin supergrafo federado). |
| `docs/RDA2/entregas/P13-reporte.md` | Creado | Reporte formal de entrega de la tarea P13. |

---

## Cobertura de operaciones (controlador/resolver vs contrato)

Todas las operaciones expuestas en `GraphqlBffResolver` (`src/modules/graphql/graphql-bff.resolver.ts`) están reflejadas al 100% en el contrato `schema.graphql`:

| Tipo Operación | Nombre de Operación | Handler (Resolver) | En el contrato | x-status | Microservicio / Capa |
|---|---|---|:---:|:---:|---|
| `Query` | `catalogoUnificado` | `GraphqlBffResolver.catalogoUnificado` | Sí (`schema.graphql` l. 272) | `implemented` | `ORQ_PKG` / Gateway BFF |
| `Query` | `misReservas` | `GraphqlBffResolver.misReservas` | Sí (`schema.graphql` l. 285) | `implemented` | `MS_CLI` / `ORQ_RES` |
| `Query` | `obtenerFacturaCompleta` | `GraphqlBffResolver.obtenerFacturaCompleta` | Sí (`schema.graphql` l. 294) | `implemented` | `ORQ_FAC` / `MS_FAC` |
| `Query` | `obtenerPaquetesDisponibles` | `GraphqlBffResolver.obtenerPaquetesDisponibles` | Sí (`schema.graphql` l. 302) | `implemented` | `MS_PKG` / `ORQ_PKG` |
| `Mutation` | `checkoutOrquestado` | `GraphqlBffResolver.checkoutOrquestado` | Sí (`schema.graphql` l. 314) | `implemented` | `MS_ESB` / Saga Engine |
| `Mutation` | `cancelarReservaConSaga` | `GraphqlBffResolver.cancelarReservaConSaga` | Sí (`schema.graphql` l. 323) | `implemented` | `MS_ESB` / Compensación |
| `Mutation` | `realizarCheckInDigital` | `GraphqlBffResolver.realizarCheckInDigital` | Sí (`schema.graphql` l. 339) | `implemented` | `MS_ATR`, `MS_AUT`, `MS_VUE`, `MS_ALO` |

---

## Validación

De conformidad con `00-REGLAS-COMUNES.md`, el esquema GraphQL fue parseado y validado mediante la biblioteca oficial `graphql` (método `buildSchema`) a través de un script en el entorno scratch fuera del repositorio, sin alterar las dependencias del proyecto:

```bash
node scratch/validate-graphql.js
```

### Resultado de la Validación Sintáctica

```text
--- VALIDACIÓN DE ESQUEMA GRAPHQL ---
Leyendo: contracts/graphql/schema.graphql
✅ Esquema GraphQL parseado y validado exitosamente con buildSchema()!
Queries disponibles (4):
  - catalogoUnificado
  - misReservas
  - obtenerFacturaCompleta
  - obtenerPaquetesDisponibles
Mutations disponibles (3):
  - checkoutOrquestado
  - cancelarReservaConSaga
  - realizarCheckInDigital
Tipos definidos (15): CatalogoItem, ReservaUnificada, AggregateBookingResponse, FacturaItem, ClienteFactura, FacturaCompleta, PaqueteItemDetalle, PaqueteCombo, CheckoutResult, CheckInResult, CheckoutItemInput, CheckoutSagaInputGql, CheckInInputGql, Query, Mutation
```

### Comprobación de Integridad de Código Fuente (`src/` intacto)

Comando ejecutado:
```bash
git diff --stat src/
```
**Resultado:** Sin salida (`0` modificaciones en `src/`).

---

## Supuestos y decisiones tomadas

1. **Derivación Fidedigna del Esquema:**
   - Dado que `src/schema.gql` no preexistía físicamente en disco y el proyecto no debe ser ejecutado en frío con variables secretas faltantes, el contrato `contracts/graphql/schema.graphql` se derivó minuciosamente de los modelos TypeScript (`@ObjectType`, `@InputType`, `@Field`) y del resolver `GraphqlBffResolver`.
2. **Compatibilidad con GraphQL SDL Standard:**
   - Se estructuró el archivo con el bloque formal `schema { query: Query mutation: Mutation }` y comentarios `#` para cabeceras de archivo, evitando fallos de parseo por docstrings huérfanos.
3. **Mapeo de Compensación en Sagas:**
   - Se documentó con precisión que `checkoutOrquestado` devuelve `codigoCompensacion` (referencia `REF-SAGA-XXXXXX`) y `correlationId` ante fallos LIFO, y que dicho estado puede auditarse en REST mediante `GET /api/v2/esb/sagas/{correlationId}`.

---

## Hallazgos registrados (IDs)

* **H-P13-01 (Severidad Alta):** Mutaciones transaccionales y queries privadas de GraphQL sin guard de autenticación ni RBAC (`misReservas`, `checkoutOrquestado`, `cancelarReservaConSaga` carecen de `SupabaseAuthGuard` o validación de tokens Bearer).
* **H-P13-02 (Severidad Media):** Playground e introspección de GraphQL habilitados incondicionalmente en producción (`playground: true` rígido en `graphql-bff.module.ts`).
* **H-P13-03 (Severidad Media):** Tipado débil mediante JSON strings sin validación de esquema en `metadata_json` y `detallesReservaJson` en lugar de inputs tipados o scalars estructurados.
* **H-P13-04 (Severidad Baja):** Inexistencia de arquitectura federada (Reto 3 - Supergrafo): Gateway opera como monolito BFF que consulta tablas SQL locales en lugar de federar subgrafos mediante Apollo Federation v2.

---

## Dudas para el revisor

1. ¿Se debe incorporar `GqlAuthGuard` en la tarea de implementación I01 para proteger uniformemente todas las mutaciones de GraphQL exigiendo el rol `CLIENTE`?
2. ¿Para la fase de producción en Render, se confirmará la desactivación de `playground` e introspección mediante variable de entorno `GRAPHQL_PLAYGROUND_ENABLED=false`?
