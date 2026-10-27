# P13 — GraphQL (gateway cliente)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Dejar el esquema GraphQL de Booking como contrato versionado y explicar cómo se relaciona con REST y con la saga.

## Salida
- `contracts/graphql/schema.graphql`
- `contracts/graphql/README.md`
- `docs/RDA2/entregas/P13-reporte.md`
- Sección P13 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- El resolver GraphQL (busca con `grep -rn "@Resolver" src`) y sus `ObjectType` / `InputType` / `ArgsType`
- `src/app.module.ts` o donde esté `GraphQLModule` (`autoSchemaFile`, path `/graphql`, playground)
- `src/schema.gql` si existe en disco; si no, genera el esquema arrancando la app solo si es posible **sin variables secretas**; si no es posible, **derívalo del código** y dilo en el reporte.
- `docs Paúl Rosero/architecture/` (ADR de GraphQL/federación) y `PLAN_MAESTRO_AUDITORIA_E_IMPLEMENTACION_RDA2.md` (Reto 3)

## Qué debe contener
1. `schema.graphql` con: queries `catalogoUnificado`, `misReservas`, `obtenerFacturaCompleta`, `obtenerPaquetesDisponibles`; mutations `checkoutOrquestado`, `cancelarReservaConSaga`, `realizarCheckInDigital`; todos los tipos, inputs y enums reales, con descripciones (`"""doc"""`).
2. README con: endpoint, autenticación (¿el contexto GraphQL lee el JWT? ¿qué operaciones lo exigen?), ejemplos de query y mutation con variables, manejo de errores (`extensions.code`), y cómo se propaga `X-Correlation-Id` al ESB.
3. **Tabla de equivalencia** operación GraphQL ↔ ruta REST ↔ servicio interno.
4. **Nota de federación (Reto 3):** qué haría falta para federar (subgrafos por vertical), marcado como `planned`, sin implementarlo.
5. Qué devuelve `checkoutOrquestado` (referencia `REF-SAGA-XXXXXX`) y cómo consultar el estado (`GET /esb/sagas/{correlationId}`).

## Discrepancias ya detectadas (verifícalas y regístralas)
- Operaciones con efectos sin guard de autenticación.
- Resolvers que devuelven `JSON` genérico o `any` (esquema débil).
- Playground/introspección habilitados en producción.

## Criterios de aceptación
- [ ] `schema.graphql` parsea (usa `graphql` de npm con `buildSchema` en un script temporal fuera del repo).
- [ ] Las 7 operaciones están documentadas con ejemplo.
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P13 graphql schema y guia`
