# Reporte I01 — Cierre de brechas de seguridad

## 1. Resumen

Se protegieron las mutaciones de nodos y las consultas REST de inventario con autenticación y roles; los bypasses de evaluación ya no funcionan en producción.
Telemetría y chatbot tienen validación, límites de tamaño y rate limit por IP/sesión; Panel 1 usa el toggle administrativo protegido y muestra errores del servidor.
Build y suite completa pasan; el contrato actualizado valida con una advertencia preexistente sobre el servidor localhost.

## 2. Archivos cambiados

- `.env.example`
- `contracts/common/components-v2.yaml`
- `contracts/observabilidad-openapi-v2.yaml`
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`
- `frontend/src/components/admin/Panel1_NodosProveedores.jsx`
- `src/app.module.ts`
- `src/core/guards/supabase-auth.guard.ts`
- `src/core/security/in-memory-rate-limit.service.ts`
- `src/core/security/security.module.ts`
- `src/modules/chatbot/chatbot-rate-limit.guard.ts`
- `src/modules/chatbot/chatbot.controller.ts`
- `src/modules/chatbot/chatbot.module.ts`
- `src/modules/inventory/inventory-grpc.controller.ts`
- `src/modules/inventory/inventory.module.ts`
- `src/modules/nodes/nodes.controller.ts`
- `src/modules/security/i01-security.spec.ts`
- `src/modules/telemetry/dto/telemetry-event.dto.ts`
- `src/modules/telemetry/telemetry-body-size.interceptor.ts`
- `src/modules/telemetry/telemetry-rate-limit.guard.ts`
- `src/modules/telemetry/telemetry.controller.ts`
- `src/modules/telemetry/telemetry.module.ts`

## 3. Pruebas

- Nueva suite `src/modules/security/i01-security.spec.ts`: guards y roles, bypass de cabeceras en producción, DTO allowlist y tamaño de propiedades, códigos 413/429, guards de inventario y listado de herramientas de solo lectura del chatbot.
- Pruebas enfocadas: `npm test -- --runInBand modules/security/i01-security.spec.ts`
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 8 passed, 8 total`
- Suite completa: `npm test -- --runInBand`
  - `Test Suites: 18 passed, 18 total`
  - `Tests: 773 passed, 773 total`
- Compilación: `npm run build`
  - `> nest build` — salida exitosa.
- Contrato: `npx --yes @redocly/cli@1 lint contracts/observabilidad-openapi-v2.yaml`
  - `validated` — descripción OpenAPI válida; una advertencia ya conocida indica que el servidor local usa `localhost`.
- Lint: no ejecutable en este worktree porque `node_modules/.bin/eslint.cmd` no está instalado. No se ejecutó `npm run lint`: el script agrega `--fix` a un glob de todo el repositorio, lo que podría modificar archivos ajenos a I01. No se instaló tooling.

## 4. Compatibilidad v1

- No se eliminaron ni renombraron rutas existentes; se conserva `POST /nodes/{codigoNodo}/toggle` y se mantiene pública la consulta `GET /nodes`.
- Los endpoints de mutación y las consultas REST de inventario conservan rutas y respuesta exitosa; únicamente rechazan solicitudes anónimas o sin el rol requerido.
- Panel 1 usa la ruta administrativa protegida ya existente, `/admin/nodes/{codigoNodo}/toggle-killswitch`; los fallos ahora se muestran sin simular un cambio local.
- Las pruebas automatizadas verifican el flujo de autorización 401/403 y el paso de roles autorizados por los guards. No se hicieron llamadas a servicios Supabase, brokers o despliegues reales.

## 5. Contratos y documentos actualizados

- `contracts/observabilidad-openapi-v2.yaml`: seguridad y respuestas 401/403 para acciones de nodos e inventario; respuestas 413/429 y límites documentados para telemetría.
- `contracts/common/components-v2.yaml`: respuesta común 413 y descripción precisa de los headers de evaluación.
- `docs/RDA2/HALLAZGOS_CONTRATOS.md`: H-P08-01, H-P08-02, H-P08-05, H-P08-06 y H-P06-03 marcados resueltos; H-P08-03 pendiente y H-P08-04 parcial.
- `docs/RDA2/BACKLOG_IMPLEMENTACION.md`: BL-001 y BL-002 resueltos; BL-012 parcial; BL-018 pendiente.
- No existe `contracts/chatbot-openapi-v2.yaml` en la rama. Se documentó el límite, sin inventar un contrato independiente.

## 6. Supuestos y decisiones

- El rol requerido para cambios de configuración y eliminación de nodos es `ADMIN`; toggle y ping permiten `ADMIN` o `MANTENIMIENTO`; sync requiere `ADMIN`. `GET /nodes` permanece público.
- El límite de telemetría por defecto es 60 solicitudes/minuto y el de chatbot 20/minuto, cada uno aplicado por IP y sesión. El límite de cuerpo de telemetría es 16 KiB y `properties` no puede exceder 8 KiB serializados.
- Rate limiting es en memoria por instancia; se habilita por defecto y puede desactivarse estableciendo `SECURITY_RATE_LIMIT_ENABLED=false`. No reemplaza un limitador distribuido si hay varias réplicas.
- `X-Role` y `X-Admin-Key` solo se admiten en pruebas o con `SECURITY_ALLOW_TEST_AUTH=true` en conexiones loopback de entornos no productivos; se ignoran en producción.
- Se conserva la escritura actual de telemetría en PostgreSQL. Migrarla a Kafka (H-P08-03) y unificar todas las variantes de kill-switch (H-P08-04) exceden el cambio mínimo de seguridad de I01.

## 7. Pendiente / no pude verificar

- ESLint no está instalado en el worktree; para habilitar esa verificación hace falta instalar/configurar la dependencia de lint y ejecutar el lint selectivo sin auto-fix global.
- H-P08-03: migración de telemetría de PostgreSQL a Kafka.
- H-P08-04 / BL-018: unificación de rutas y almacenamiento de todos los kill-switches; Panel 1 ya usa la ruta protegida canónica.
- No se validó el JWT contra Supabase real ni se hicieron pruebas manuales contra un entorno desplegado.

## 8. Cómo probarlo a mano

Con el backend local iniciado y un JWT válido de Supabase:

```powershell
curl.exe -i -X POST "http://localhost:3000/api/v1/nodes/NODE_ATR_DILAN/toggle" `
  -H "Authorization: Bearer <SUPABASE_JWT>" `
  -H "Content-Type: application/json" `
  -d '{"activar":true}'

curl.exe -i "http://localhost:3000/api/v1/inventory" `
  -H "Authorization: Bearer <SUPABASE_JWT>"

curl.exe -i -X POST "http://localhost:3000/api/v1/telemetry/events" `
  -H "Content-Type: application/json" `
  -d '{"event_name":"search_submitted","session_id":"sesion-prueba","vertical":"vuelos","device":"desktop","properties":{"origin":"UIO"}}'
```

Verificaciones negativas:

- Repetir el primer o segundo comando sin `Authorization`: debe responder 401; usar un JWT sin rol requerido debe responder 403.
- Enviar un `event_name` que no esté en la lista o una propiedad adicional: debe responder 400.
- Enviar a telemetría un JSON de más de 16 KiB: debe responder 413.
- Superar 60 eventos/minuto desde la misma IP o sesión: debe responder 429 con `Retry-After`.
- Enviar mensajes repetidos a `POST /api/v1/chatbot/mensaje` desde la misma IP o sesión: al superar 20/minuto debe responder 429.
