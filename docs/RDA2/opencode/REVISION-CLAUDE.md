# Lista de revisión final (Claude)

Se ejecuta cuando Alejandro avisa que OpenCode terminó. Resultado: informe con correcciones, no reescritura.

## 1. Alcance y seguridad del repo
- [ ] `git diff --stat main...HEAD` solo toca `contracts/**` y `docs/RDA2/**`.
- [ ] Un commit por tarea con el mensaje pedido; sin push; sin archivos `.env*`, claves ni secretos en contratos o docs (`grep -rniE "(secret|apikey|password|eyJ)"`).

## 2. Contratos OpenAPI
- [ ] Redocly lint sin errores en cada `*-v2.yaml`.
- [ ] **Cobertura:** para cada `@Controller`, todas las rutas aparecen en algún contrato (comparar con `grep -rn "@Get\|@Post\|@Put\|@Patch\|@Delete" src`).
- [ ] `x-status` honesto: muestreo de ≥ 5 operaciones `implemented` por contrato contra su `x-source`; las `planned` no existen en el código.
- [ ] Usan `components-v2.yaml` (sin duplicar `ProblemDetails`, parámetros ni seguridad) y `servers` `/api/v2`.
- [ ] Seguridad por operación coherente con los guards reales; sin guard → `security: []` + hallazgo.
- [ ] Ejemplos presentes y consistentes con los schemas; sin `example.com`.

## 3. AsyncAPI, gRPC, GraphQL
- [ ] AsyncAPI valida; tabla Hoy vs Objetivo (RabbitMQ/Kafka) correcta.
- [ ] Proto carga; `src/proto/inventory.proto` intacto.
- [ ] `schema.graphql` parsea; 7 operaciones con ejemplo.

## 4. Hallazgos
- [ ] `HALLAZGOS_CONTRATOS.md` tiene resumen por severidad; verificar personalmente los 8 sospechados del README y las Altas.
- [ ] Cada hallazgo cita archivo y línea/símbolo.

## 5. Documentos
- [ ] RF/RNF: IDs únicos, fuentes reales, sin requisitos inventados no marcados `Propuesto`.
- [ ] Plan de pruebas cubre todos los RF `implementado`; matriz sin celdas vacías; los 11 CE presentes.
- [ ] Plan de integración: diagramas Mermaid renderizan (probar con `mmdc`).
- [ ] Plan de despliegue: afirmaciones de hosting con fuente o "no verificado".
- [ ] Backlog cubre todos los hallazgos Alta/Media y todos los `planned`.

## 6. Consistencia cruzada
- [ ] Nombres de operación, IDs de RF y contratos coinciden entre docs y contratos.
- [ ] `contracts/README.md` lista todo lo creado.

## 7. Informe
Entregar: veredicto por tarea (OK / corregir / rehacer), lista priorizada de correcciones y, si corresponde, prompts de corrección para OpenCode.
