# P10 — Chatbot (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar la API del asistente conversacional de Booking.

## Salida
- `contracts/chatbot-openapi-v2.yaml`
- `docs/RDA2/entregas/P10-reporte.md`
- Sección P10 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/chatbot/chatbot.controller.ts` (incluye el comentario que explica por qué **no** lleva `SupabaseAuthGuard`)
- `src/modules/chatbot/dto/chat-mensaje.dto.ts`
- `src/modules/chatbot/chatbot.constants.ts` (límites, mensajes)
- `src/modules/chatbot/chatbot.concurrency.ts` (límite de concurrencia y respuesta cuando se excede)
- `src/modules/chatbot/chatbot.tools.ts` (herramientas que el bot puede invocar → qué APIs de Booking consume)
- `src/modules/chatbot/chatbot.prompt.ts` (solo el alcance; **no copies el prompt completo al contrato**)
- `docs/Chatbot_Integracion.md`
- `contracts/common/components-v2.yaml`

## Rutas que debe cubrir (4)
| Método | Ruta | Handler |
|---|---|---|
| POST | `/chatbot/mensaje` | verifica |
| POST | `/chatbot/nueva-conversacion` | verifica |
| GET | `/chatbot/estado` | verifica |
| GET | `/chatbot/alcance` | verifica |

## Qué debe documentar
1. Cuerpo de `mensaje` (límites de longitud y reglas de `chat-mensaje.dto.ts`), respuesta (`RespuestaChatDto`) y gestión de la conversación (`conversacion_id` o el campo real).
2. Respuestas: 200, 400 (mensaje vacío/inválido), 429 (si hay límite de concurrencia o *throttle*), **503** (sin `GROQ_API_KEY` o proveedor caído).
3. **Seguridad:** explica el motivo por el que el endpoint es público según el comentario del controlador y qué datos del usuario puede o no puede ver el bot sin sesión.
4. **Herramientas del bot** (tabla): nombre, qué endpoint interno de Booking invoca, si es de solo lectura o puede crear/cancelar algo.
5. `GET /chatbot/alcance`: qué devuelve y para qué lo usa el frontend.
6. Proveedor de IA externo (Groq): menciona que es una dependencia externa con su propio timeout; **no incluyas claves**.

## Discrepancias ya detectadas (verifícalas y regístralas)
- Endpoint público que puede ejecutar herramientas con efectos (¿alguna crea o cancela reservas sin sesión?). (Alta si se confirma.)
- Falta de `X-Correlation-Id` en las llamadas del bot a los demás módulos.
- Almacén de conversaciones en memoria (`chatbot.conversation.store.ts`): ¿se pierde al reiniciar o con varias instancias?

## Criterios de aceptación
- [ ] Las 4 rutas están en el contrato con `x-source` y `x-status`.
- [ ] Tabla de herramientas del bot con su efecto.
- [ ] Redocly lint sin errores.
- [ ] Reporte con cobertura, supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P10 chatbot openapi v2`
