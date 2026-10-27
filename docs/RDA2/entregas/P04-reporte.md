# Reporte P04 — Finanzas y Liquidaciones B2B (contrato OpenAPI v2)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/finanzas-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del microservicio de finanzas y liquidaciones (`MS_FIN`) con las 4 rutas oficiales del controlador. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P04-01 a H-P04-03 (solapamiento arquitectónico, impacto de reembolsos e idempotencia de pagos). |
| `docs/RDA2/entregas/P04-reporte.md` | Creado | Reporte formal de entrega de la tarea P04. |

---

## Cobertura de rutas (controlador vs contrato)

Se documentaron el 100% de las rutas implementadas en `src/modules/finanzas/finanzas.controller.ts`:

| Método | Ruta | Handler | En el contrato | x-status | x-microservice |
|---|---|---|:---:|---|---|
| `GET` | `/finanzas/resumen` | `getResumen` | Sí | `implemented` | `MS_FIN` |
| `GET` | `/finanzas/liquidaciones` | `getLiquidaciones` | Sí | `implemented` | `MS_FIN` |
| `POST` | `/finanzas/liquidaciones/:id/pagar` | `marcarPagada` | Sí | `implemented` | `MS_FIN` |
| `GET` | `/finanzas/libro-mayor` | `getLibroMayor` | Sí | `implemented` | `MS_FIN` |

**Cobertura:** 4/4 rutas del controlador cubiertas (100%).

---

## Validación (comando y resultado resumido)

```bash
npx --yes @redocly/cli@1 lint contracts/finanzas-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[1].url` (`http://localhost:3000/api/v2`), requerido por la convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Modelo Económico y Regla 10% / 90% (Criterio CE05):**
   - Booking retiene el **10%** del importe bruto de cada orden confirmada como comisión de plataforma. El **90%** remanente se acumula para liquidación al proveedor externo.
   - *Ejemplo Numérico:* En una venta de $220.00 USD, Booking retiene $22.00 USD de comisión y acumula $198.00 USD netos a favor del socio (desglosado por vertical turística).
   - El asiento se genera automáticamente en `schema_finanzas.libro_mayor_comisiones` cada vez que el orquestador Saga completa una transacción exitosa.
2. **Periodicidad de Liquidación Quincenal (`YYYY-MM-Q1` / `YYYY-MM-Q2`):**
   - Del análisis del código en `FinanzasService.registrarVentaYCalcularComision()`, se confirmó que la periodicidad es **estrictamente quincenal**: días 1 a 15 corresponden a `Q1` y días 16 a fin de mes corresponden a `Q2` (ej. `2026-10-Q1`, `2026-10-Q2`).
3. **Seguridad y Control de Acceso:**
   - A diferencia de los controladores de pagos o paquetes, `FinanzasController` implementa `@UseGuards(SupabaseAuthGuard, RolesGuard)` y `@Roles(Rol.ADMIN)`. Por ende, el contrato declara explícitamente los esquemas `SupabaseBearer` y `AdminKey`, documentando respuestas 401 y 403.
4. **Resolución del Solapamiento Arquitectónico:**
   - Se verificó que `frontend/src/components/admin/Panel4_LiquidacionesFinanzas.jsx` consume exclusivamente `FinanzasController` (`/finanzas/liquidaciones` y `/finanzas/liquidaciones/:id/pagar`). El módulo paralelo `AdminFinanzasService` (`/admin/finanzas`, `/admin/payouts`) calcula métricas al vuelo leyendo tablas de otras verticales para el widget general de `AdminDashboard.jsx`. El contrato formaliza la API canónica `MS_FIN` conforme al estándar de microservicios.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P04-01** | Media | Solapamiento arquitectónico entre `FinanzasController` (`MS_FIN`, esquema `schema_finanzas`, quincenal) y `AdminFinanzasService` (`/admin/finanzas`, mensual, consulta cruzada de tablas de reservas). |
| **H-P04-02** | Media | Los reembolsos procesados en `MS_PAG` no debitan automáticamente las liquidaciones quincenales en `schema_finanzas`, existiendo riesgo de sobrepago al proveedor. |
| **H-P04-03** | Baja | `POST /finanzas/liquidaciones/:id/pagar` no valida idempotencia ante liquidaciones previamente pagadas, sobrescribiendo la fecha de pago y comprobante. |

---

## Dudas para el revisor

1. ¿Se prevé unificar en una siguiente iteración el widget de finanzas de `AdminDashboard.jsx` para que consuma directamente `/finanzas/resumen` y `/finanzas/liquidaciones`, deprecando `AdminFinanzasService`?
2. Para el flujo de reembolsos, ¿se prefiere debitar la liquidación pendiente del período en curso, o generar una liquidación con saldo negativo si el período ya fue cerrado y pagado?
