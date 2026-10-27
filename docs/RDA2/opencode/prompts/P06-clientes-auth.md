# P06 — Clientes, identidad y sesión (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar **cómo se autentica y se identifica a un cliente en Booking hoy** y cómo se lo comunica a las tiendas. El contrato v1 (`clientes-openapi.yaml`) describe `/register`, `/auth/token` y `/me`, pero **el backend no tiene un controlador de clientes**: el frontend usa Supabase Auth directamente. El contrato v2 debe reflejar esa realidad.

## Salida
- `contracts/clientes-openapi-v2.yaml` (el v1 **no se toca**)
- `docs/RDA2/entregas/P06-reporte.md`
- Sección P06 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `contracts/clientes-openapi.yaml` (v1)
- `src/core/auth/sesion-supabase.service.ts`, `administradores.ts`, `roles.enum.ts`
- `src/core/guards/supabase-auth.guard.ts`, `roles.guard.ts`, `admin-role.guard.ts`
- `src/core/entities/usuario.entity.ts`
- `frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx` (llamadas `supabase.auth.*` y campos del registro: nombres, cédula, etc.)
- En `src/modules/admin/admin.controller.ts`: rutas `users` y `users/{id}/action` (solo para enlazar; se documentan en P07)
- `contracts/vuelos-openapi-v2.yaml` sección 5 "Seguridad (dos capas)" (cómo Booking pasa `X-User-Id` a las tiendas)
- `contracts/common/components-v2.yaml`

## Qué debe contener
1. **Operaciones `x-status: delegated`** (las ejecuta Supabase Auth, no el backend de Booking): registro (`signUp`), inicio de sesión con contraseña, consulta/actualización del usuario autenticado. Usa un `server` con variable `{supabaseUrl}`. Describe solo las llamadas que el frontend **realmente usa** (verifícalo en el código); si documentas la ruta HTTP de Supabase, cita su documentación oficial en la descripción.
2. **Cómo Booking valida el JWT** (`SupabaseAuthGuard`): qué claims usa (`sub`, `email`, rol), de dónde sale el rol y cómo se normaliza (`normalizarRol`).
3. **Roles** `CLIENTE`, `ADMIN`, `MANTENIMIENTO` y qué puede hacer cada uno (tabla por módulo, con las rutas que lo exigen).
4. **Perfil / datos de facturación** (`BillingInfo` del v1): qué campos existen realmente en `usuario.entity.ts` y cuáles son solo del contrato v1.
5. **Contrato de identidad hacia las tiendas:** encabezados que Booking envía (`X-User-Id`, `X-User-Roles`, `X-Correlation-Id`) y regla "las tiendas no crean cuentas; reciben el pasajero/huésped en el body".
6. **Rutas v1 sin implementación** (`/register`, `/auth/token`, `/me`): márcalas `deprecated: true` con nota "reemplazadas por Supabase Auth", o déjalas fuera con justificación en el reporte.

## Discrepancias ya detectadas (verifícalas y regístralas)
- Contrato v1 describe una API que **no existe** en el backend.
- La lista de administradores está en código (`administradores.ts`): ¿es lista fija o consulta a base de datos?
- Cualquier lugar donde el rol se confíe a un valor enviado por el cliente.

## Criterios de aceptación
- [ ] Cada operación está marcada `delegated`, `implemented` o `deprecated` con evidencia.
- [ ] Tabla de roles × módulos incluida.
- [ ] Redocly lint sin errores.
- [ ] Reporte con supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P06 clientes-auth openapi v2`
