# Reporte P00 — Componentes comunes v2

## Archivos creados o modificados

| Archivo | Acción |
|---|---|
| `contracts/common/components-v2.yaml` | Creado — biblioteca de componentes compartidos |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Creado — registro de hallazgos del ciclo RDA2 |
| `docs/RDA2/entregas/P00-reporte.md` | Creado — este reporte |

## Cobertura de rutas (controlador vs contrato)

P00 no cubre un controlador específico. Es una biblioteca de componentes compartidos.
No aplica tabla de rutas.

## Validación (comando y resultado resumido)

```
npx --yes @redocly/cli@1 lint contracts/common/components-v2.yaml
```

**Resultado:** ✅ `Woohoo! Your API description is valid.` — **0 errores**.
**Warnings (23):** todos son `no-unused-components` (esperado: en un archivo de solo componentes sin `paths` que los referencie, Redocly los marca como no usados) y 1 `no-server-example.com` por la URL `localhost` de desarrollo. Los warnings son aceptables según las reglas.

### Detalle de warnings (listado resumido)

| Regla | Cantidad | Motivo aceptable |
|---|---|---|
| `no-unused-components` | 22 | Componentes son reutilizados por los contratos P01–P14 vía `$ref`; en este archivo aislado no hay `paths` |
| `no-server-example.com` | 1 | `localhost:3000` es la URL de desarrollo; no es example.com |

## Supuestos y decisiones tomadas

1. **`servers` con URLs reales:** Redocly exige al menos una entrada `servers` (regla `no-empty-servers`). Se añadieron las URLs documentadas en `00-REGLAS-COMUNES.md` (localhost y Render). No contienen secretos.
2. **`correlation_id` y `timestamp` en `ProblemDetails` como opcionales:** el filtro `rfc7807-exception.filter.ts` actual no emite estos campos en el cuerpo del error (solo los 5 campos base de RFC 7807 + `code` + `invalidParams`). Se marcan como opcionales en el esquema para que el contrato sea fiel al código, pero se registra como hallazgo H-P00-02 para mejora.
3. **Sin campo `Money`:** el código no tiene un tipo centralizado `Money`; los módulos manejan montos directamente como `number` o `string`. No se crea el schema hasta verificarlo módulo a módulo.
4. **Sin parámetros de paginación globales:** no hay `limit`/`cursor` en el middleware global de `main.ts`. Se evaluará en cada módulo (H-P00-03).
5. **`HateoasInterceptor` usa `/api/v1` hardcodeado:** el interceptor genera `_links` apuntando a v1 aunque el contrato es v2. Se documenta como hallazgo H-P00-01 sin corregir el código.
6. **Roles del guard:** `SupabaseAuthGuard` acepta bypass vía `X-Role` y `X-Admin-Key`. Ambos se documentan en `securitySchemes` como mecanismos reales del código.

## Hallazgos registrados (IDs)

| ID | Severidad | Descripción corta |
|---|---|---|
| H-P00-01 | Baja | `HateoasInterceptor` genera `_links` con `/api/v1` hardcodeado |
| H-P00-02 | Baja | El filtro RFC 7807 no incluye `correlation_id` ni `timestamp` en la respuesta de error |
| H-P00-03 | Baja | Paginación `limit`/`cursor` no existe a nivel global; verificar por módulo |

## Dudas para el revisor

1. ¿Se desea que el schema `ProblemDetails` marque `correlation_id` y `timestamp` como **required** aunque el código actual no los emite, como "objetivo" del contrato? Por ahora se dejan **opcionales** para fidelidad al código actual.
2. ¿El `AdminKey` (`X-Admin-Key`) con valores hardcodeados (`admin-secret`, `Admin123!`) debe documentarse como hallazgo de seguridad independiente con severidad Media/Alta? Por ahora se incluye la descripción del mecanismo pero no se levantó hallazgo separado.
