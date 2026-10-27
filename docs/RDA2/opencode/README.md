# RDA2 · Paquete de instrucciones para OpenCode

Este directorio contiene todo lo necesario para que **OpenCode** deje listos los contratos internos de Booking y los documentos de RDA2. Tú pegas un prompt por etapa; OpenCode hace el trabajo; Claude revisa al final.

## Reglas del juego
- OpenCode **solo escribe** en `contracts/**` y `docs/RDA2/**`. No toca `src/`, `frontend/`, `test/` ni `.env*`.
- Documenta **lo que el código hace**; lo que no existe va como `x-status: planned` y lo que no cuadra se registra en `docs/RDA2/HALLAZGOS_CONTRATOS.md`.
- Una tarea = un commit en la rama `rda2/contratos-booking` (sin push). Cada tarea deja un reporte en `docs/RDA2/entregas/`.

## Archivos
| Archivo | Para qué |
|---|---|
| `00-REGLAS-COMUNES.md` | Reglas que aplican a todas las tareas |
| `prompts/P00…P15` | Una tarea de contrato por archivo |
| `prompts/D1…D7` | Una tarea de documento por archivo |
| `PROMPTS-PARA-PEGAR.md` | El texto exacto que pegas en OpenCode por etapa |
| `REVISION-CLAUDE.md` | Lista con la que Claude revisa al final |

## Preparación (una vez)
1. Haz `git pull` y confirma que estás en `main` limpio.
2. Abre OpenCode en la raíz del repositorio (`RDA1`).
3. Verifica que existen `docs/RDA2/opencode/00-REGLAS-COMUNES.md` y `docs/RDA2/opencode/prompts/`.

## Orden de ejecución
**Contratos:** P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10 → P11 → P12 → P13 → P14.
**Documentos:** D1 → D2 → D3 → D4 → D5 → D6 → D7.
**Opcional (solo si lo apruebas):** P15, parche de vuelos v2.0.1.

P00 debe ir primero (crea la rama y los componentes comunes). P14 va después de P13 y antes de los documentos.

## Consejos
- **Sesión nueva de OpenCode por tarea:** evita que se acumule contexto y se invente cosas.
- Revisa **P00 y P01** apenas terminen: si salen bien, el resto sigue el mismo patrón. Si algo viene mal, corrígelo ahí antes de seguir.
- Si OpenCode pide permiso para escribir fuera de `contracts/` o `docs/RDA2/`, **niégalo**.
- Si una tarea falla el lint y no logra arreglarlo, que lo deje documentado en el reporte; no es motivo para parar todo.
- No hagas push hasta que Claude haya revisado.

## Hallazgos que ya se sospechan (OpenCode debe confirmarlos o descartarlos)
1. `POST /nodes/{codigoNodo}/toggle` público (kill-switch sin guard).
2. El bridge de eventos manda ORDER/RESERVA/PAGO a Kafka (la cátedra pide RabbitMQ para transacciones).
3. Tres rutas distintas para conmutar nodos.
4. Booking no tiene receptor de webhooks.
5. El contrato de clientes v1 describe `/register`, `/auth/token`, `/me`, que no existen (Supabase Auth).
6. Dos o tres versiones del proto de inventario.
7. Chatbot público con herramientas que podrían tener efectos.
8. Solapamiento finanzas ↔ payouts de admin.

## Al terminar
Avísale a Claude: revisará con `REVISION-CLAUDE.md` y te dará un informe de correcciones.
