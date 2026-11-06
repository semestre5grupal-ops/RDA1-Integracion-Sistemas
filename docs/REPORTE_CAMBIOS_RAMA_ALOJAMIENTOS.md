# Reporte de cambios de la rama `claude/hopeful-cray-sos1je`

Comparación: `git diff origin/main...HEAD` (base `4a094f6`, el último `main` fusionado en la rama).
Fecha: 2026-11-06.

**Total: 27 archivos, +11 545 / −25 líneas.** El 63 % (7 271 líneas) son reportes generados por las
corridas de prueba, no código.

## 1. Desglose

| Grupo | Archivos | + | − | Qué es |
|---|---|---:|---:|---|
| Reportes de corridas reales | `test/live/posada-ec/resultados/*.md` y `*.json` (10) | 7 271 | 0 | Generados por la suite: resultado de cada prueba y bitácora HTTP. Se pueden borrar sin afectar nada. |
| Suite de pruebas reales | `test/live/posada-ec/ejecutar.js`, `cliente.js`, `README.md` | 1 714 | 0 | 64 escenarios contra los socios y el gateway. No se cargan en el backend. |
| Código nuevo (agregador) | `src/modules/alojamientos/socios/alojamientos-socios.service.ts`, `alojamientos-socios-reservas.service.ts` | 1 147 | 0 | Agregador de socios y Saga de reserva, cancelación y check-in. |
| Pruebas unitarias nuevas | `src/modules/alojamientos/socios/alojamientos-socios.spec.ts` | 398 | 0 | 21 pruebas con un socio simulado. |
| Cambios en código existente | ver §2 | 229 | 24 | Conexión del agregador con alojamientos y con el receptor de check-in. |
| Frontend | `frontend/src/components/AlojamientoCheckoutModal.jsx` | 64 | 0 | Campo «Documento del titular» en el checkout de alojamientos. |
| `package.json` | 1 | 2 | 1 | Script `test:live:posada`. |
| Documentación | `docs/INVESTIGACION_BOOKING_ALOJAMIENTOS.md`, `docs/PRUEBAS_REALES_POSADA_EC.md` | 579 | 0 | Investigación, resultados y solución. |
| Migración SQL | `database/migrations/20261104_alojamientos_reservas_reparar_insert.sql` | 141 | 0 | **No se ejecuta sola.** La corrección real del 500 fue una línea que se ejecutó a mano en Supabase. |

## 2. Cambios en archivos que ya existían (las 25 líneas borradas)

| Archivo | + | − | Cambio |
|---|---:|---:|---|
| `src/modules/alojamientos/alojamientos.service.ts` | 181 | 17 | Si el id es `NODO~id`, cada método público se desvía al agregador: catálogo, búsqueda, ficha, tipos, disponibilidad, cotización, reserva, cancelación, Mis Reservas y reseñas. Las 17 líneas borradas son de `search()` y `getReservas()`: el mismo código se reescribió para añadir los hoteles de socios **al final** de los resultados locales. |
| `src/modules/alojamientos/alojamientos.controller.ts` | 3 | 4 | Se quitó la caché de 60 s de `GET /alojamientos` y `GET /alojamientos/:id` (y sus imports), para que un hotel nuevo del socio aparezca al refrescar. |
| `src/modules/alojamientos/alojamientos.module.ts` | 7 | 0 | Registra los 2 servicios nuevos y la entidad `ConfigProveedor`. |
| `src/modules/alojamientos/dto/reservation.dto.ts` | 20 | 0 | Campos opcionales `documento_tipo` y `documento_numero`. |
| `src/modules/reservas/reservas.module.ts` | 2 | 0 | Importa `AlojamientosModule`. |
| `src/modules/reservas/reservas.service.ts` | 16 | 3 | Receptor de check-in: (1) **paso 0 nuevo**: si la referencia es de una reserva hecha en un hotel socio, la marca y exige la X-API-Key del socio dueño; (2) `atracciones` se omite **solo** si el paso 0 ya encontró la reserva; (3) la rama local de alojamientos usaba la columna inexistente `localizador` → ahora `codigo_reserva`. |
| `package.json` | 2 | 1 | Coma y script nuevo (la línea «borrada» es la misma, con coma). |

## 3. Otros módulos: comprobación

| Comprobación | Resultado |
|---|---|
| Módulos de `src/modules` con cambios | Solo **alojamientos** (7 archivos) y **reservas** (2). |
| `src/core`, `src/common`, `src/main.ts`, `src/app.module.ts` | **Sin cambios.** |
| Vuelos, autos, atracciones, pagos, paquetes, facturas, admin, nodes, ESB, webhooks, inventory, GraphQL, chatbot, telemetría, finanzas, observabilidad, security, contracts, event-bus | **Sin cambios.** |
| Frontend fuera del checkout de alojamientos | **Sin cambios.** |
| Esquema de base de datos de otras verticales | **Sin cambios.** Lo único nuevo es la tabla `schema_alojamientos.alojamientos_reservas_socio`, que se crea sola (`CREATE TABLE IF NOT EXISTS`). |
| `main` avanzó (`13fc1f9`, `87a0791`) y también tocó `reservas.service.ts` (autos) | **Se fusiona sin conflictos** (`git merge-tree`). |
| Rama + `main` actual, todas las pruebas | `tsc` OK y **888/888** (36 suites). |
| Equivalencia del receptor de check-in (prueba temporal, no se sube) | Con referencias de atracciones, autos, vuelos y una desconocida, el receptor hace **las mismas consultas en el mismo orden y devuelve lo mismo** que sin el cambio. Si la reserva es de un hotel socio, no toca las tablas de las otras verticales. 5/5. |

**Riesgo residual (bajo):** los códigos `BKG-123456` de las reservas locales de alojamientos y los de
las copias de socios se generan con el mismo formato, en tablas distintas. Si un hotel socio
avisara un check-in con un código local idéntico al de una copia, se marcaría la copia (y solo con
la clave de ese socio). La probabilidad es de ~1 en 900 000 por par.

## 4. Comportamiento que cambia en alojamientos (esperado)

- Con `ALOJAMIENTOS_FUENTE=socios` (valor por defecto) se **ocultan** los hoteles locales que son
  copia de un socio (`pec-htl-*`). Se ven los hoteles en vivo de los socios. `mixto` muestra además
  los hoteles locales sin proveedor y `local` vuelve exactamente al comportamiento anterior.
- La reserva en un hotel socio **exige el documento del titular** (400 si falta). Los hoteles
  locales siguen igual.
- El check-in local de alojamientos ahora sí funciona: antes fallaba en silencio.

## 5. Archivos sin subir

- `test/live/posada-ec/resultados/2026-11-06T17-28-42-559Z.md` / `.json`: corrida de verificación del
  grupo W contra el gateway sin desplegar. Se puede borrar.
