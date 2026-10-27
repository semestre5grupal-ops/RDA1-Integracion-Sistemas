# Reglas comunes — todas las tareas de OpenCode (RDA2 · Booking)

> Este archivo se lee **antes de cada tarea**. Si un prompt contradice algo de aquí, gana este archivo.

## 1. Contexto

- **Proyecto:** Booking Prototipo (RDA2). Es el gateway / BFF NestJS que integra las tiendas de los compañeros: Vuelos, Autos, Atracciones y Alojamientos.
- **Repo:** este (`RDA1-Integracion-Sistemas`). Backend en `src/`, frontend en `frontend/`, contratos en `contracts/`.
- **Tu trabajo:** escribir **contratos y documentos**. **No programas.**
- **Versionado:** `src/main.ts` ya publica `/api/v1` y `/api/v2` a la vez (`setGlobalPrefix('api')` + `enableVersioning({ type: URI, defaultVersion: ['1','2'] })`). Por eso todo contrato v2 usa:
  - `servers: /api/v2` (y también `http://localhost:3000/api/v2` y `https://rda1-backend-integracion-sistemas.onrender.com/api/v2`);
  - **rutas sin prefijo**, por ejemplo `/pagos/procesar` (no `/api/v2/pagos/procesar`).
- **Referencia de estilo:** `contracts/vuelos-openapi-v2.yaml`, `contracts/autos-openapi-v2.yaml` y `contracts/atracciones-openapi-v2.yaml` (bloque `info.description` con secciones numeradas, `tags`, `components`, ejemplos).
- **Revisor final:** Claude. Compara cada entrega contra el código. Si dices que algo existe y no existe, se detecta.

## 2. Qué puedes y qué no puedes tocar

| Puedes escribir | Solo lectura | Prohibido (ni leer) |
|---|---|---|
| `contracts/**` (solo los archivos de tu tarea) | `src/**`, `frontend/**`, `database/**`, `test/**` | `.env`, `.env.*` (contienen secretos) |
| `docs/RDA2/**` | `Faltantes RDA2/**`, `Pendientes/**`, `docs Paúl Rosero/**` | `node_modules/**`, `dist/**` |
| | Contratos existentes (`contracts/*.yaml` que no sean tuyos) | |

- **No modifiques** `src/`, `frontend/`, `package.json`, `package-lock.json`, ni contratos de otras tareas.
- **No toques Alojamientos** (vertical de otra persona) ni `vuelos-*` (salvo la tarea P15).
- **No pongas secretos** (claves, tokens, URLs privadas) en ningún archivo.
- **No instales dependencias en el proyecto.** Para validar usa `npx --yes ...` (no modifica `package.json`).
- **No ejecutes la aplicación ni uses la base de datos.** Todo se deduce leyendo el código.

## 3. Principio rector: documentar lo que el código hace, no inventar

Cada operación del contrato lleva estas extensiones:

| Extensión | Valores | Significado |
|---|---|---|
| `x-source` | `ruta/archivo.ts#metodo` | Dónde está implementada (ej. `src/modules/pagos/pagos.controller.ts#procesarPago`) |
| `x-status` | `implemented` | Existe en el código y el contrato lo describe tal cual |
| | `planned` | **No existe aún**, pero Booking lo necesita. Se diseña en el contrato y se registra como pendiente |
| | `delegated` | Lo hace un tercero (ej. Supabase Auth), no el backend |

Reglas:
1. **Cada ruta de cada controlador de tu módulo debe aparecer en el contrato.** Si falta una, la tarea no está terminada.
2. **No inventes rutas** que no existen y presentes como `implemented`. Si hace falta una ruta nueva, va como `planned` con `x-source: n/a`.
3. **Nombres de campos exactamente como el código** (respeta `snake_case` o `camelCase` según el DTO/servicio). No renombres.
4. Si un DTO es `any` o no está tipado, **deduce los campos leyendo el servicio** y dilo en la descripción (`"Campos deducidos del servicio; el DTO no está tipado"`).
5. Si un valor depende de una decisión que no está en el código, **elige el valor más razonable, déjalo escrito en el reporte como supuesto** y sigue. No te detengas a preguntar.

## 4. Estructura mínima de cada contrato OpenAPI

- `openapi: 3.0.3`
- `info`: `title`, `version: 2.0.0`, `description` (markdown con: propósito, alcance, tabla de rutas por tema, seguridad, errores, eventos que emite, estado de implementación), `contact` y `license`.
- `servers`, `tags` (con descripción), `paths`, `components`.
- Cada operación: `operationId` único, `tags`, `summary`, `description`, `x-source`, `x-status`, `security` (explícito), `parameters`, `requestBody` (con `example`), `responses` con **todos** los códigos que el código puede devolver (los errores con `application/problem+json`).
- Cada schema: `type`, `required` donde aplique, `description` y `example`.
- Descripciones en **español**. Nombres técnicos tal cual el código.

## 5. Componentes comunes (los crea P00)

Todos los contratos de Booking reutilizan `contracts/common/components-v2.yaml`:

```yaml
$ref: './common/components-v2.yaml#/components/schemas/ProblemDetails'
$ref: './common/components-v2.yaml#/components/parameters/CorrelationId'
$ref: './common/components-v2.yaml#/components/responses/Problem404'
```

No redefinas `ProblemDetails`, encabezados de trazabilidad ni respuestas de error en cada contrato.
(P00 es la única tarea que no depende de este archivo.)

## 6. Seguridad: documenta lo que el código hace

Esquemas disponibles: `SupabaseBearer` (JWT de Supabase), `AdminKey` (`X-Admin-Key`, solo pruebas), `ProviderApiKey` (`X-Api-Key`, proveedores de alojamientos).
Roles reales (`src/core/auth/roles.enum.ts`): `CLIENTE`, `ADMIN`, `MANTENIMIENTO`.

- Si la ruta tiene guard → `security` lo refleja y se documentan 401/403.
- Si la ruta **no tiene guard** → `security: []` y **registra un hallazgo** (no la "arregles" en el contrato).

## 7. Reglas de mensajería (Cátedra, Semana 8)

> **RabbitMQ** para lo que el negocio no puede fallar (Sagas, compras, pagos, compensaciones).
> **Kafka** para lo que el negocio necesita escalar (telemetría, métricas, analítica, observabilidad).

- El `correlation_id` viaja en REST, gRPC, RabbitMQ y Kafka. Vive **a nivel de aplicación (logs en archivo JSON Lines), no en la base de datos**.
- Los eventos son **CloudEvents v1.0** con las extensiones `correlationid` y `traceparent` (W3C Trace Context).
- Si el código hace algo distinto de esta regla, **documenta el estado real y el estado objetivo por separado** y registra un hallazgo.

## 8. Validación (obligatoria antes de cerrar la tarea)

| Tipo de archivo | Comando |
|---|---|
| OpenAPI | `npx --yes @redocly/cli@1 lint contracts/<archivo>.yaml` |
| AsyncAPI | `npx --yes @asyncapi/cli validate contracts/<archivo>.yaml` |
| Proto | `node -e "require('@grpc/proto-loader').loadSync('<archivo>.proto',{keepCase:true});console.log('ok')"` |
| GraphQL | `node -e "require('graphql').buildSchema(require('fs').readFileSync('<archivo>.graphql','utf8'));console.log('ok')"` |

- **0 errores.** Los *warnings* se permiten, pero lístalos en el reporte.
- Si un comando no corre (sin red, falta de módulo), **dilo en el reporte**; no afirmes que pasó.

## 9. Hallazgos (cosas del código que no encajan)

Mientras trabajas, anota lo que encuentres en `docs/RDA2/HALLAZGOS_CONTRATOS.md` (créalo si no existe; agrega una sección por tarea).

```markdown
## P02 — Pagos
| ID | Severidad | Hallazgo | Evidencia | Sugerencia |
|---|---|---|---|---|
| H-P02-01 | Alta | `POST /pagos/procesar` no exige autenticación | `src/modules/pagos/pagos.controller.ts` (clase sin `@UseGuards`) | Agregar `SupabaseAuthGuard` |
```

- Severidad: **Alta** (seguridad o pérdida de datos), **Media** (contradice la cátedra o un contrato), **Baja** (inconsistencia menor).
- **No corrijas el código.** Solo registra.

## 10. Reporte de entrega (obligatorio)

Crea `docs/RDA2/entregas/<ID>-reporte.md` con exactamente estas secciones:

```markdown
# Reporte <ID> — <título>
## Archivos creados o modificados
## Cobertura de rutas (controlador vs contrato)
| Método | Ruta | Handler | En el contrato | x-status |
## Validación (comando y resultado resumido)
## Supuestos y decisiones tomadas
## Hallazgos registrados (IDs)
## Dudas para el revisor
```

La tabla de cobertura debe listar **todas** las rutas del controlador, una por fila.

## 11. Git

- Rama única: `rda2/contratos-booking` (créala en la primera tarea: `git checkout -b rda2/contratos-booking`; las siguientes tareas siguen en esa rama).
- **Un commit por tarea**, mensaje `docs(contracts): <ID> <descripción corta>` (los documentos: `docs(rda2): <ID> ...`).
- **No hagas push. No toques `main`.** El push lo hace el usuario después de la revisión.
- Antes de cada commit: `git status` debe mostrar **solo** archivos de `contracts/` y `docs/RDA2/`.

## 12. Cuando algo falla

- Si no encuentras un archivo, **búscalo** (`grep`/glob) antes de rendirte. Si de verdad no existe, regístralo como hallazgo y sigue.
- Si el módulo es demasiado grande para leerlo entero, **léelo por partes** (controlador primero, luego el servicio solo para los campos que necesites).
- Si dudas entre dos interpretaciones, elige la que **coincida con el código** y anótalo en "Supuestos".
- Nunca dejes `TODO` ni `...` dentro de un contrato. Todo lo que está en el archivo debe ser válido.
