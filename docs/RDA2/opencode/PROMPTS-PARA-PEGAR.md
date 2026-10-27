# Prompts para pegar en OpenCode

Pega **uno por etapa**, en sesión nueva, en el orden indicado. Reemplaza `<ID>` y `<ARCHIVO>` con los valores de la tabla.

## Plantilla de contratos (P00–P14)
```
Ejecuta la tarea <ID>. Lee primero docs/RDA2/opencode/00-REGLAS-COMUNES.md y luego docs/RDA2/opencode/prompts/<ARCHIVO> completo, y síguelos al pie de la letra. No modifiques código fuente (solo contracts/** y docs/RDA2/**). Al terminar, haz el commit indicado y muéstrame el resumen del reporte.
```

## Plantilla de documentos (D1–D7)
Igual que la anterior; recuerda que aquí el entregable va en `docs/RDA2/`.

## Tabla de etapas
| Orden | ID | `<ARCHIVO>` | Resultado |
|---|---|---|---|
| 1 | P00 | `P00-componentes-comunes.md` | `contracts/common/components-v2.yaml` + rama |
| 2 | P01 | `P01-esb-sagas.md` | `esb-sagas-openapi-v2.yaml` |
| 3 | P02 | `P02-pagos.md` | `pagos-openapi-v2.yaml` |
| 4 | P03 | `P03-paquetes-promociones.md` | `paquetes-openapi-v2.yaml` |
| 5 | P04 | `P04-finanzas.md` | `finanzas-openapi-v2.yaml` |
| 6 | P05 | `P05-facturacion.md` | `facturacion-openapi-v2.yaml` |
| 7 | P06 | `P06-clientes-auth.md` | `clientes-openapi-v2.yaml` |
| 8 | P07 | `P07-administracion.md` | `admin-openapi-v2.yaml` |
| 9 | P08 | `P08-nodos-observabilidad.md` | `observabilidad-openapi-v2.yaml` |
| 10 | P09 | `P09-webhooks-entrantes.md` | `webhooks-inbound-openapi-v2.yaml` |
| 11 | P10 | `P10-chatbot.md` | `chatbot-openapi-v2.yaml` |
| 12 | P11 | `P11-asyncapi-eventos.md` | `asyncapi-eventos-v2.yaml` |
| 13 | P12 | `P12-grpc-inventario.md` | `contracts/grpc/` |
| 14 | P13 | `P13-graphql.md` | `contracts/graphql/` |
| 15 | P14 | `P14-indice-consistencia.md` | índice, lint global, planificados |
| 16 | D1 | `D1-requisitos-funcionales.md` | `REQUISITOS_FUNCIONALES.md` |
| 17 | D2 | `D2-requisitos-no-funcionales.md` | `REQUISITOS_NO_FUNCIONALES.md` |
| 18 | D3 | `D3-plan-de-pruebas.md` | `PLAN_DE_PRUEBAS.md` |
| 19 | D4 | `D4-matriz-trazabilidad.md` | `MATRIZ_TRAZABILIDAD.md` |
| 20 | D5 | `D5-plan-de-integracion.md` | `PLAN_DE_INTEGRACION.md` |
| 21 | D6 | `D6-plan-de-despliegue.md` | `PLAN_DE_DESPLIEGUE.md` |
| 22 | D7 | `D7-backlog.md` | `BACKLOG_IMPLEMENTACION.md` |
| opc. | P15 | `P15-vuelos-v2.0.1-opcional.md` | vuelos v2.0.1 (solo con aprobación) |

## Ejemplo listo para copiar (P01)
```
Ejecuta la tarea P01. Lee primero docs/RDA2/opencode/00-REGLAS-COMUNES.md y luego docs/RDA2/opencode/prompts/P01-esb-sagas.md completo, y síguelos al pie de la letra. No modifiques código fuente (solo contracts/** y docs/RDA2/**). Al terminar, haz el commit indicado y muéstrame el resumen del reporte.
```

## Si OpenCode se desvía
```
Detente. Revisa docs/RDA2/opencode/00-REGLAS-COMUNES.md: solo puedes escribir en contracts/** y docs/RDA2/**, y debes documentar lo que el código hace, no inventar. Deshaz cualquier cambio fuera de esas rutas (git checkout -- <ruta>) y continúa con la tarea.
```

## Cierre
```
Muestra git status y git diff --stat main...HEAD, y confirma que no hay cambios fuera de contracts/** y docs/RDA2/**. Luego lista los commits de la rama rda2/contratos-booking.
```
