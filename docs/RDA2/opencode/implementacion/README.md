# RDA2 · Fase 2: IMPLEMENTACIÓN con OpenCode

Esta fase **sí modifica código**. Se ejecuta cuando la fase de contratos y documentos (P00–P14, D1–D7) ya está revisada y unida. Cada tarea implementa lo que los contratos y el backlog (`docs/RDA2/BACKLOG_IMPLEMENTACION.md`) dicen que falta.

## Archivos
| Archivo | Para qué |
|---|---|
| `00-REGLAS-IMPLEMENTACION.md` | Reglas de todas las tareas (método, prohibiciones, git, reporte) |
| `prompts/I01…I12` | Una tarea por archivo |
| `PROMPTS-PARA-PEGAR.md` | Texto exacto a pegar en OpenCode |
| `REVISION-CLAUDE-IMPLEMENTACION.md` | Lista de revisión final de Claude |

## Tareas, dependencias y reparto sugerido (3 personas)
| ID | Qué | Depende de | Persona |
|---|---|---|---|
| I01 | Seguridad (toggle público, telemetría, inventario, chatbot) | — | A |
| I02 | Correlation-Id, `traceparent`, `node_id` | — | B |
| I03 | Logs JSON Lines en archivos | I02 | B |
| I04 | RabbitMQ transaccional / Kafka solo telemetría | I02 | C |
| I05 | Saga: compensación LIFO, idempotencia, estado persistente | I02, I04 | C |
| I06 | Pagos: `GET /pagos/{paymentReference}`, idempotencia | — | A |
| I07 | Receptor de webhooks | I02, I04 | A |
| I08 | Endpoint de trazas + dashboard de grafo | I02, I03, I05 | B |
| I09 | gRPC inventario: proto unificado, auth, alterno REST | — | C |
| I10 | Consolidar rutas de nodos/finanzas, auditoría | I01 | A |
| I11 | Pruebas de contrato y E2E | I01–I10 | quien termine primero |
| I12 | Entorno demo, scripts y guía de defensa | I01–I10 | quien termine primero |

## Olas (qué corre en paralelo)
1. **Ola 1:** I01, I02, I06, I09 (sin dependencias).
2. **Ola 2:** I03, I04, I10.
3. **Ola 3:** I05, I07.
4. **Ola 4:** I08.
5. **Ola 5:** I11 → I12.

Antes de cada ola, todos hacen `git pull` de la rama común. Una persona a la vez integra (merge) y corre `npm run build && npm test`.

## Prioridad si falta tiempo
Para la defensa pesan más: **I05 (saga), I02+I03 (trazabilidad), I08 (dashboard), I04 (mensajería)** y **I01 (seguridad)**. Luego I07, I06, I10, I09, I11, I12.

## Riesgos
- Dos tareas tocan los mismos archivos (`event-bus`, `esb`): por eso I04 e I05 van con la misma persona.
- OpenCode puede "arreglar" cosas fuera de alcance: exige commits pequeños y revisa `git diff --stat` antes de aceptar.
- Si `npm test` ya fallaba antes, que lo anote (no es culpa de la tarea).
- Cambios de BD: solo archivos SQL; los aplica el equipo a mano en Supabase, no OpenCode.

## Al terminar
Avísale a Claude: revisa con `REVISION-CLAUDE-IMPLEMENTACION.md`.
