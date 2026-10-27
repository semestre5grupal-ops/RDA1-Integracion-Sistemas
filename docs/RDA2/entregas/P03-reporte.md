# Reporte P03 — Paquetes y Promociones (contrato OpenAPI v2)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/paquetes-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 de Paquetes Dinámicos y Acuerdos B2B de Promociones v2 con 4 rutas implementadas y 1 planificada. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P03-01 a H-P03-04 (seguridad en endpoints, DTOs sin tipar, sincronización B2B y versiones/snapshot). |
| `docs/RDA2/entregas/P03-reporte.md` | Creado | Reporte formal de entrega de la tarea P03. |

---

## Cobertura de rutas (controlador vs contrato)

Se documentaron el 100% de las rutas implementadas en `src/modules/paquetes/paquetes.controller.ts`, agregando la ruta planificada para sincronización de acuerdos comerciales B2B:

| Método | Ruta | Handler | En el contrato | x-status | x-microservice |
|---|---|---|:---:|---|---|
| `GET` | `/paquetes` | `findAll` | Sí | `implemented` | `MS_PKG` |
| `GET` | `/paquetes/contratos` | `getContratos` | Sí | `implemented` | `MS_PKG` |
| `GET` | `/paquetes/:id` | `findById` | Sí | `implemented` | `MS_PKG` |
| `POST` | `/paquetes/dinamico` | `crearPaqueteDinamico` | Sí | `implemented` | `MS_PKG` |
| `PUT` | `/paquetes/contratos/:proveedorCodigo` | N/A (sincronización B2B) | Sí | `planned` | `MS_PKG` |

**Cobertura:** 4/4 rutas del controlador cubiertas (100%) + 1 ruta de extensión planificada para actualización de acuerdos B2B.

---

## Validación (comando y resultado resumido)

```bash
npx --yes @redocly/cli@1 lint contracts/paquetes-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[1].url` (`http://localhost:3000/api/v2`), requerido por la convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Tabla "Quién guarda qué" para Promociones y Combos:**
   - **En las tiendas satélites (`MS_ATR`, `MS_AUT`, `MS_VUE`):** Cada tienda guarda su propio acuerdo local en sus tablas de acuerdos (`permite_promociones`, `descuento_maximo_pct`, destinos autorizados y condiciones).
   - **En Booking Central (`MS_PKG`):** Se guarda la copia consolidada de todos los socios en `schema_paquetes.contrato_promociones`. Además, almacena los paquetes creados y su snapshot inmutable de precios en `schema_paquetes.paquetes` y `schema_paquetes.paquete_items`.
2. **Fórmula de cálculo de precios y snapshot inmutable:**
   - `descuentoAplicado = min(descuento_solicitado_pct || 10.0, maxDescuentoPermitido)` (donde `maxDescuentoPermitido` es el menor descuento autorizado por los socios de los ítems incluidos, con tope global del 20%).
   - `precioBaseTotal = sum(items.precio_individual)`.
   - `precioFinalPaquete = round(precioBaseTotal * (1 - descuentoAplicado / 100), 2)`.
   - Redondeo a 2 decimales exactos en USD.
3. **Mapeo de códigos de error:**
   - Si el paquete tiene menos de 2 ítems: `400 Bad Request` ("Un paquete o combo debe contener al menos 2 ítems de diferentes verticales").
   - Si un socio tiene `permite_promociones = false`: `409 Conflict` ("El proveedor '<codigo>' ha declarado en su contrato que no participa en promociones o combos").
4. **Relación con la Saga (P01):**
   - Una vez creado el paquete dinámico, la compra se ejecuta a través de `POST /esb/checkout-saga` enviando los ítems desglosados para reservar en cada vertical turística con compensación automática LIFO en caso de fallo.
5. **Ruta planificada de sincronización:**
   - Dado que no existe una ruta REST en Booking para actualizar los contratos comerciales (actualmente solo existen vía seed o BD), se propuso `PUT /paquetes/contratos/{proveedorCodigo}` como `x-status: planned`.

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P03-01** | Alta | `PaquetesController` no declara Guards de autenticación (`security: []`). La creación de combos y consulta de acuerdos comerciales privados es completamente pública. |
| **H-P03-02** | Media | DTO de entrada en `POST /paquetes/dinamico` carece de tipado y validación (`@Body() dto: any`). |
| **H-P03-03** | Media | No existe endpoint en Booking para actualizar o sincronizar contratos comerciales B2B (`PUT /paquetes/contratos/{proveedorCodigo}`). Diseñado como `planned`. |
| **H-P03-04** | Baja | Discrepancia con el modelo objetivo de `Faltantes RDA2` (ausencia de tabla `paquete_versiones` para histórico de versiones; la inmutabilidad actual se preserva directamente en `paquetes` y `paquete_items`). |

---

## Dudas para el revisor

1. ¿Se prevé activar webhooks en las tiendas socias para que, al modificar su acuerdo en `PUT /{vertical}/promociones/contrato`, notifiquen automáticamente a Booking y actualicen `schema_paquetes.contrato_promociones` sin intervención manual?
2. Para el catálogo público `GET /paquetes`, ¿se mantendrá abierto sin autenticación para que los turistas exploren ofertas en el marketplace, restringiendo únicamente `POST /paquetes/dinamico` a usuarios autenticados?
