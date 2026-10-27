# Prompts para pegar en OpenCode (implementación)

Una sesión nueva por tarea. Reemplaza `<ID>` y `<ARCHIVO>` (ver tabla).

## Plantilla
```
Ejecuta la tarea <ID>. Lee primero docs/RDA2/opencode/implementacion/00-REGLAS-IMPLEMENTACION.md y luego docs/RDA2/opencode/implementacion/prompts/<ARCHIVO> completo, y síguelos al pie de la letra. Trabaja con pruebas primero, haz cambios mínimos y compatibles con /api/v1, no leas .env, no hagas push. Al terminar, ejecuta npm run build y npm test, escribe el reporte en docs/RDA2/entregas/<ID>-reporte.md, haz el commit indicado y muéstrame el resumen.
```

## Tabla
| ID | `<ARCHIVO>` |
|---|---|
| I01 | `I01-seguridad.md` |
| I02 | `I02-correlacion-trazabilidad.md` |
| I03 | `I03-logs-jsonl.md` |
| I04 | `I04-mensajeria-rabbit-kafka.md` |
| I05 | `I05-saga-compensacion.md` |
| I06 | `I06-pagos.md` |
| I07 | `I07-webhooks-receptor.md` |
| I08 | `I08-trazas-dashboard.md` |
| I09 | `I09-grpc-inventario.md` |
| I10 | `I10-consolidar-nodos-admin.md` |
| I11 | `I11-pruebas-contrato-e2e.md` |
| I12 | `I12-despliegue-demo.md` |

## Si se desvía
```
Detente. Revisa 00-REGLAS-IMPLEMENTACION.md: cambios mínimos, solo lo que pide la tarea, compatibles con /api/v1, sin leer .env ni hacer push. Muestra git diff --stat, deshaz lo que esté fuera del alcance y continúa.
```

## Si las pruebas fallan
```
Muestra la salida completa del fallo. Comprueba con git stash si ya fallaba antes de tus cambios. Corrige solo lo que tu cambio rompió; si ya fallaba antes, anótalo en el reporte y no lo toques.
```

## Cierre de cada persona
```
Muestra git status, git diff --stat contra la rama base y la lista de commits. Confirma que no hay cambios no relacionados con las tareas I<NN> que hice.
```
