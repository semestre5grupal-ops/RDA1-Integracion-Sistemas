# Reporte P06 — Clientes, Identidad y Sesión v2 (contrato OpenAPI)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/clientes-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del microservicio de clientes e identidad (`MS_CLI`), operaciones delegadas en Supabase Auth (`x-status: delegated`), gestión administrativa de usuarios (`x-status: implemented`) y endpoints canónicos de perfiles (`x-status: planned`). |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P06-01 a H-P06-04 (contrato v1 ficticio vs IdP delegado, administradores estáticos en código, riesgo de bypass con `X-Role` y desconexión entre `auth.users` y `schema_clientes`). |
| `docs/RDA2/entregas/P06-reporte.md` | Creado | Reporte formal de entrega de la tarea P06. |

---

## Cobertura de rutas y clasificación (código vs contrato v1 vs contrato v2)

| Ruta | Método | Handler / Servicio | ¿Existe en código? | x-status | x-microservice | Justificación técnica |
|---|---|---|:---:|---|---|---|
| `/auth/v1/signup` | `POST` | Supabase Auth SDK (`signUp`) | **Sí** (delegado) | `delegated` | `MS_CLI` (IdP) | Invocado por `frontend/src/pages/RegisterPage.jsx`. Registra usuario en `auth.users` y guarda cédula (validada módulo 10) y teléfono en `raw_user_meta_data`. |
| `/auth/v1/token` | `POST` | Supabase Auth SDK (`signInWithPassword`) | **Sí** (delegado) | `delegated` | `MS_CLI` (IdP) | Invocado por `frontend/src/pages/LoginPage.jsx`. Valida credenciales y emite token JWT con claims `sub`, `email`, `app_metadata` y `user_metadata`. |
| `/auth/v1/user` | `GET` | Supabase Auth API (`getUser`) | **Sí** (delegado) | `delegated` | `MS_CLI` (IdP) | Invocado por `SesionSupabaseService.obtenerUsuario` para autenticar peticiones en el gateway mediante `SupabaseAuthGuard`. |
| `/auth/v1/user` | `PUT` | Supabase Auth SDK (`updateUser`) | **Sí** (delegado) | `delegated` | `MS_CLI` (IdP) | Permite actualizar metadatos del cliente (`user_metadata`). |
| `/auth/v1/logout` | `POST` | Supabase Auth SDK (`signOut`) | **Sí** (delegado) | `delegated` | `MS_CLI` (IdP) | Invocado por `frontend/src/context/AuthContext.jsx` para invalidar sesión activa y purgar tokens locales. |
| `/admin/users` | `GET` | `AdminController.getUsers` | **Sí** | `implemented` | `MS_CLI` / Admin | Consulta consolidada de usuarios leyendo directamente `auth.users` o la Admin API de Supabase (`listUsers`). |
| `/admin/users` | `POST` | `AdminController.crearUsuario` | **Sí** | `implemented` | `MS_CLI` / Admin | Creación directa de usuarios cliente o administradores desde el panel con hash bcrypt. |
| `/admin/users/{id}/action` | `PUT` | `AdminController.userAction` | **Sí** | `implemented` | `MS_CLI` / Admin | Bloquear, desbloquear, promover a admin, quitar admin y cambio forzoso de contraseña. |
| `/admin/users/{id}/historial` | `GET` | `AdminController.getUserHistorial` | **Sí** | `implemented` | `MS_CLI` / Admin | Agregación multivertical de reservas del cliente sin SQL JOINs entre esquemas. |
| `/clientes/{id}` | `GET` | n/a (Blueprint §5.2) | **No** | `planned` | `MS_CLI` | Ficha canónica del cliente en `schema_clientes.clientes` requerida por ESB (`ORQ_FAC`). |
| `/clientes/{id}` | `PATCH` | n/a (Blueprint §5.2) | **No** | `planned` | `MS_CLI` | Actualización de perfil y datos fiscales en base de datos relacional. |
| `/clientes/{id}/rol` | `PATCH` | n/a (Blueprint §5.2) | **No** | `planned` | `MS_CLI` | Asignación formal de roles en `schema_clientes.clientes`. |
| `/register` (v1) | `POST` | n/a | **No** | `deprecated` | `MS_CLI` | Ruta ficticia del contrato v1; reemplazada por `/auth/v1/signup` de Supabase Auth. |
| `/auth/token` (v1) | `POST` | n/a | **No** | `deprecated` | `MS_CLI` | Ruta ficticia del contrato v1; reemplazada por `/auth/v1/token` de Supabase Auth. |
| `/me` (v1) | `GET` / `PATCH` / `DELETE` | n/a | **No** | `deprecated` | `MS_CLI` | Ruta ficticia del contrato v1; reemplazada por `/auth/v1/user` y gestión administrativa. |

---

## Matriz de Roles × Módulos (RBAC RDA2 §5)

| Rol | Ámbito de Acción | Rutas del Ecosistema que lo Exigen | Guard Validador | Comportamiento |
|---|---|---|---|---|
| `CLIENTE` | Usuario estándar del marketplace | `POST /esb/checkout-saga`<br>`POST /pagos/procesar`<br>`POST /facturas/enviar`<br>`GET /esb/aggregate/mis-reservas/{cliente}` | `SupabaseAuthGuard` | Acceso a operaciones de compra, consulta de reservas personales y recepción de comprobantes fiscales por correo. |
| `MANTENIMIENTO` | Personal operativo de flota y atracciones | `POST /autos/orders/{id}/checkin-entrega`<br>`POST /autos/orders/{id}/checkin-devolucion`<br>`POST /autos/{id}/mantenimiento/registro` | `RolesGuard`<br>(`@Roles(Rol.MANTENIMIENTO, Rol.ADMIN)`) | Control de kilometraje (`km_salida`, `km_retorno`), combustible, estado operativo del vehículo y registro de servicios mecánicos. |
| `ADMIN` | Superadministrador de Booking | `GET/POST /admin/users`<br>`PUT /admin/users/{id}/action`<br>`GET /admin/users/{id}/historial`<br>`GET/POST /finanzas/*`<br>`GET/POST /admin/nodes/*`<br>`GET/PUT /admin/config`<br>`PATCH /facturas/{id}/anular` | `AdminRoleGuard`<br>(`esAdministrador`) | Control absoluto de la plataforma: gestión de usuarios, liquidaciones a socios, kill-switches de tiendas externas y anulación fiscal. |

---

## Validación con Redocly CLI

```bash
npx --yes @redocly/cli@1 lint contracts/clientes-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[0].url` (`http://localhost:3000/api/v2`), requerido por la convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Autenticación Delegada y Arquitectura de Dos Capas:**
   - Se evidenció que el backend NestJS no actúa como servidor de autorización OAuth2 propio. El frontend delega íntegramente la gestión de contraseñas, confirmación de correo y emisión de tokens en **Supabase Auth**.
   - El contrato v2 documenta formalmente estas operaciones bajo la categoría `x-status: delegated` con servidor variable `{supabaseUrl}/auth/v1`, citando la documentación oficial de Supabase.
2. **Validación Perimetral de Tokens en Backend (`SupabaseAuthGuard`):**
   - El backend valida criptográficamente cada token recibido mediante `supabase.auth.getUser(token)` en `SesionSupabaseService`. Los claims esenciales extraídos son `sub` (UUID del usuario), `email` y `app_metadata.role`.
3. **Manejo Seguro de Roles Privilegiados:**
   - La función `esAdministrador` (`src/core/auth/administradores.ts`) evalúa **únicamente** `app_metadata.role === 'admin'` o pertenencia a `ADMIN_EMAILS`. El contrato explicita que `user_metadata.role` no otorga privilegios administrativos porque puede ser sobreescrito por el propio cliente en su navegador.
4. **Contrato de Identidad hacia las Tiendas Socias:**
   - Las tiendas satélites (vuelos, autos, atracciones, alojamientos) **no crean usuarios ni administran credenciales**. Booking propaga `X-User-Id`, `X-User-Roles` y `X-Correlation-Id` en las llamadas HTTP, mientras que los datos del pasajero, huésped o conductor viajan explícitamente en el cuerpo del JSON para permitir reservas a terceros.
5. **Alineación con el Blueprint `MS_CLI` y `schema_clientes`:**
   - La entidad TypeORM `Usuario` está mapeada a `schema_clientes.clientes`. Almacena directamente los campos fiscales y de contacto (`nombre`, `email`, `cedula_ruc`, `telefono`, `direccion`, `pais`, `rol`, `estado`), a diferencia del objeto anidado `defaultBillingInfo` del contrato v1. Se diseñaron las rutas planificadas (`GET/PATCH /clientes/{id}`) para formalizar la integración canónica con el ESB.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P06-01** | Alta | Contrato v1 ficticio vs arquitectura real delegada en Supabase Auth (el backend no tiene controlador de clientes). |
| **H-P06-02** | Media | Lista de administradores fija en código duro (`ADMIN_EMAILS`), requiriendo re-despliegues para altas y bajas. |
| **H-P06-03** | Alta | Riesgo de escalamiento de privilegios por bypass técnico de roles (`X-Role`) en `SupabaseAuthGuard` sin validación criptográfica. |
| **H-P06-04** | Media | Desconexión relacional entre `auth.users` de Supabase y `schema_clientes.clientes` (falta de sincronización automática por webhooks). |

---

## Dudas para el revisor

1. ¿Se prevé implementar a corto plazo un Supabase Database Webhook que sincronice automáticamente los nuevos registros de `auth.users` hacia la tabla relacional `schema_clientes.clientes`, garantizando la consistencia del ESB?
2. Para el bypass de evaluación académica mediante `X-Role`, ¿se desea restringir su aceptación condicionalmente únicamente cuando `NODE_ENV !== 'production'` para eliminar el riesgo de escalamiento de privilegios?
