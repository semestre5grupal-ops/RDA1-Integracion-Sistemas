# P03 — Paquetes y Promociones (contrato OpenAPI)

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Depende de **P00**.

## Objetivo
Documentar el módulo de paquetes/combos turísticos y los acuerdos B2B de promociones con los socios.

## Salida
- `contracts/paquetes-openapi-v2.yaml`
- `docs/RDA2/entregas/P03-reporte.md`
- Sección P03 en `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Lee primero (solo esto)
- `src/modules/paquetes/paquetes.controller.ts`
- `src/modules/paquetes/paquetes.service.ts`
- `src/modules/paquetes/entities/*.ts` (`paquete`, `paquete-item`, `contrato-promociones`)
- `Faltantes RDA2/src/modules/promotions-packages/entities/*.ts` (modelo objetivo: paquete, ítems, **versiones/snapshot**, contrato)
- `Faltantes RDA2/docs/IMPLEMENTACION_RDA2.md` (sección 9 "Promociones y Paquetes")
- De cada tienda, solo la parte de **promociones**: `contracts/autos-openapi-v2.yaml`, `contracts/atracciones-openapi-v2.yaml`, `contracts/vuelos-openapi-v2.yaml` (rutas `.../promociones/contrato` y schemas `ContratoPromociones*`)
- `contracts/common/components-v2.yaml`

## Rutas que debe cubrir (4)
| Método | Ruta | Handler |
|---|---|---|
| GET | `/paquetes` | `findAll` |
| GET | `/paquetes/contratos` | `getContratos` |
| GET | `/paquetes/{id}` | `findById` |
| POST | `/paquetes/dinamico` | `crearPaqueteDinamico` |

## Qué debe documentar
1. **Regla de negocio de la cátedra (§9):** el contrato con cada socio se pide una sola vez y define si **acepta promociones** y el **porcentaje máximo de descuento**. Explica cómo Booking lo usa para armar combos.
2. **`GET /paquetes/contratos`**: schema de la respuesta (por socio/vertical: `permite_promociones`, `porcentaje_descuento_maximo`, vigencia, destinos). Indica de dónde salen los datos (tabla local vs consulta a las tiendas).
3. **`POST /paquetes/dinamico`**: entrada (deducida del servicio, el DTO es `any`), validaciones contra los acuerdos, respuesta **201** con **snapshot inmutable de precios**, y **409** cuando un socio no acepta promociones o se supera el descuento máximo (documenta el `code` real).
4. Cómo se calcula el precio final (descuento, redondeo, moneda) según el servicio.
5. Relación con los endpoints de promociones de cada tienda (`GET/PUT /{vertical}/promociones/contrato`): una tabla "quién guarda qué".
6. Relación con la Saga: el paquete se compra por `POST /esb/checkout-saga` (referencia a P01).

## Discrepancias ya detectadas (verifícalas y regístralas)
- Entidades implementadas vs modelo objetivo de `Faltantes RDA2` (¿existe `paquete_versiones` / snapshot?).
- `@Body() dto: any`.
- No hay ruta para **actualizar** un contrato de promociones en Booking: ¿se carga por SQL/seed? Si hace falta, propón `PUT /paquetes/contratos/{vertical}` como `x-status: planned`.

## Criterios de aceptación
- [ ] Las 4 rutas están en el contrato con `x-source` y `x-status`.
- [ ] Redocly lint sin errores.
- [ ] Tabla "quién guarda qué" y fórmula de precio documentadas.
- [ ] Reporte con cobertura, supuestos y hallazgos.

## Entrega
Commit: `docs(contracts): P03 paquetes-promociones openapi v2`
