# Investigación: errores del Booking con los alojamientos de Posada EC

Fecha: 2026-11-04. Origen: los fallos de las pruebas reales
([PRUEBAS_REALES_POSADA_EC.md](PRUEBAS_REALES_POSADA_EC.md)). El sistema de Posada EC (Sam)
pasó todas sus pruebas; todo lo que sigue es del **Booking**.

| # | Problema | Prueba | Gravedad | Estado |
|---|---|---|---|---|
| 1 | Reservar cualquier hotel da HTTP 500 | S05 | Crítica: nadie puede reservar alojamiento | **Causa confirmada en Supabase** (`id` sin valor por defecto); migración lista, **sin aplicar** |
| 2 | Booking no envía las reservas a Posada ni las cancela allí | A01, A03 | Crítica en cuanto se arregle el 1: sobreventa y huéspedes sin reserva en el hotel | Confirmado en el código |
| 3 | Booking no se entera de lo que se reserva o cancela en Posada | A02, A04 | Crítica: sobreventa | Confirmado en vivo y en el código |
| 4 | El catálogo de Booking tiene otros tipos de habitación y otros cupos | A05 | Alta | Causa encontrada |
| 5 | Contraseña de la base de datos de producción subida al repositorio | — | Seguridad | Hay que rotarla |

## 1. HTTP 500 al reservar (S05)

### Qué se observó en lo desplegado

- `POST /api/v1/alojamientos/pec-htl-XXXX/reservations` → `500 Error interno del servidor` en todos
  los intentos: con o sin `tipo_habitacion_id`, con o sin teléfono y en varios hoteles.
- Las validaciones previas sí responden: fechas invertidas → 400 y hotel inexistente → 404. La
  reserva primero **lee** la tabla de reservas por `idempotency_key` (`alojamientos.service.ts:1652`),
  y esa lectura funciona.
- **Prueba decisiva:** si se repite la petición con la **misma** `Idempotency-Key`, vuelve a dar 500
  (si la fila se hubiera guardado, la segunda respondería 409 «ya procesada»). Tampoco aparece
  ninguna reserva en la disponibilidad. **Falla el `INSERT` en `schema_alojamientos.alojamientos_reservas`.**
- Lo desplegado es de entre el 1 y el 4 de noviembre (tiene `admin/procesos/vuelos/en-vivo` del
  1-nov, pero no `observabilidad`, que entró hoy a las 10:33). La entidad de reservas no cambia
  desde el 22-oct, así que el código que guarda la reserva es el mismo que el de `main`.

### Por qué (según los scripts del repo)

El 22-oct (`549b839`) la entidad pasó de `public.reservas_alojamiento` a
`schema_alojamientos.alojamientos_reservas`. Esa tabla nace en `database/01_master_migration_12_schemas.sql`
con el modelo viejo y luego se adapta con `03_alojamientos_schema_completo.sql` o con
`database/migrate_alojamientos.js`. Con esa historia quedan restricciones que el `INSERT` actual no cumple:

1. **`id VARCHAR(64) PRIMARY KEY` sin valor por defecto.** La entidad usa
   `@PrimaryGeneratedColumn('uuid')`. Con Postgres, TypeORM envía `DEFAULT` y espera que la base
   genere el id (`node_modules/typeorm/query-builder/InsertQueryBuilder.js:860`). Ni el 03
   (`CREATE TABLE IF NOT EXISTS` no toca una tabla existente) ni `migrate_alojamientos.js` le ponen
   un valor por defecto → `null value in column "id"`.
2. **`CHECK (estado IN ('CONFIRMADA', 'CHECKED_IN', 'FINALIZADA', 'CANCELADA'))`.** El código
   guarda `'CONFIRMED'`. El 03 borra ese CHECK; `migrate_alojamientos.js` **no**.

**Confirmado en producción (consulta en el SQL Editor de Supabase, 2026-11-06):**

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| `id` | varchar | NO | **NULL** ← causa del 500 |
| `alojamiento_id` | varchar | NO | NULL (el código siempre lo envía) |
| `estado` | varchar | NO | `'CONFIRMADA'` (el código siempre envía `CONFIRMED`) |
| `idempotency_key` | varchar | NO | NULL (la API la exige) |

Las restricciones de la tabla son sólo la PK, el UNIQUE de `idempotency_key` y las FK a catálogo y
tipos: **no hay CHECK sobre `estado`**, así que la causa 2 queda descartada. La causa es la 1.

El arreglo mínimo es una sola línea:

```sql
ALTER TABLE schema_alojamientos.alojamientos_reservas ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
```

Efecto secundario a revisar: las reservas viejas guardadas con `estado = 'CONFIRMADA'` no las cuenta
el código, que busca `CONFIRMED`, al calcular el cupo.

Al resolverlo aparece un riesgo más: tras guardar la reserva se guardan los huéspedes
(`guardarHuespedes`, `alojamientos.service.ts:400`) **sin transacción y sin `try/catch`**. Si la tabla
`alojamientos_huespedes` también está en su versión vieja, el cliente vería otro 500 **y la reserva
quedaría guardada** ocupando cupo.

### Arreglo propuesto (no aplicado)

`database/migrations/20261104_alojamientos_reservas_reparar_insert.sql`. Es idempotente y no borra datos:

- pone `DEFAULT gen_random_uuid()::text` en `id`;
- borra cualquier CHECK sobre `estado`;
- quita `NOT NULL` a las columnas viejas que la entidad no llena;
- crea las columnas de la entidad que falten (`huespedes`, …);
- repara `alojamientos_huespedes` y crea el outbox si falta.

**Cómo aplicarlo con seguridad** (desde el *SQL Editor* de Supabase, que es donde hay acceso):

1. Ejecutar el **diagnóstico** (sección 0 del archivo, sólo lectura) y guardar el resultado.
2. Probar sin riesgo: pegar el archivo, cambiar el `COMMIT;` final por un `INSERT` de prueba y un `ROLLBACK;`.
3. Aplicar de verdad y repetir `POSADA_API_KEY=… node test/live/posada-ec/ejecutar.js --solo=S05`.

Este entorno no pudo conectarse a Supabase por el protocolo de Postgres (su salida a Internet sólo
admite HTTPS), por eso estos pasos quedan para hacerlos desde Supabase.

Mejora de código recomendada aparte: envolver reserva + huéspedes en una transacción y registrar en
el log el `message` del `QueryFailedError` (hoy el 500 no dice qué columna falló).

## 2. Booking no envía las reservas a Posada (A01, A03)

- `reservarEnSerie` (`alojamientos.service.ts:1648`) y `createOrderEnSerie` (`:1063`) guardan la
  reserva **sólo** en la base del Booking.
- El adaptador que llamaría a `POST /alojamientos/orders/create` de Posada,
  `crearReservaExterna` (`acl/alojamientos-circuit-breaker.adapter.ts:139`), **no se invoca en
  ningún sitio**. Lo mismo pasa con la cancelación: nunca se llama a `orders/{id}/cancel` de Posada.
- Consecuencias:
  - el huésped llega al hotel y el hotel no tiene su reserva;
  - Posada vuelve a vender esa habitación;
  - cancelar en Booking no libera nada en Posada.
- Además, con el circuito abierto el adaptador devuelve `CONFIRMED_FALLBACK` sin avisar al hotel.
  Si algún día se conecta tal cual, seguiría habiendo sobreventa.

## 3. Booking no se entera de Posada (A02, A04)

- **En vivo:** con las 8 «Habitación Estándar» de HTL-1001 agotadas en Posada, el Booking seguía
  mostrando 5 libres. Reservar y cancelar en Posada no movió nunca el cupo del Booking.
- **En el código**, el único canal de entrada es el stock por gRPC, y no puede funcionar con Posada:
  - El contrato dice que Posada envía `item_id = "HTL-1001:SUITE_FAMILIAR"` y `time_slot = "14:00"`.
    El Booking busca `item_id = "pec-htl-1001"` y compara `time_slot` con el código del tipo
    (`alojamientos.service.ts:1601`, `inventory.service.ts:424`). **Nunca coincide.**
  - Ese stock se guarda en memoria: se pierde al reiniciar.
  - Sólo se mira la noche de llegada.
  - Sólo se usa para **mostrar** la disponibilidad; al **reservar** se cuenta únicamente el cupo
    propio del Booking (`elegirTipo` → `tiposService.ocupacion`).

## 4. El catálogo no coincide (A05)

- Los 30 hoteles de Posada están en Booking con ids `pec-htl-XXXX` y `proveedor_id = posada-ec`. Esos
  ids **no** son los que genera `POST /alojamientos/sincronizar` (`posada-ec-<hash>`): se insertaron
  directamente en la base y **sin tipos de habitación**. No hay en el repositorio ningún script que
  los cree.
- Al no tener tipos, el Booking les crea uno genérico «estandar» con el número de habitaciones del
  hotel (`tipos-habitacion.service.ts:94`, `asegurarTipoBase`). Por ejemplo, HTL-1001: en Posada
  Estándar ×8 + Suite Familiar ×3; en Booking, sólo Estándar ×5.
- Arreglo: sincronizar desde Posada (`GET /alojamientos` + `/{id}/availability` de Sam) hacia
  `/alojamientos/sincronizar` con `tiposHabitacion` (código, precio y cantidad reales), o consultar
  la disponibilidad de Posada en vivo.

## 5. Seguridad

- `database/migrate_alojamientos.js:4` contiene la cadena de conexión de Supabase **con la contraseña**
  en texto plano. Hay que **rotar la contraseña** en Supabase y leer la conexión de una variable de
  entorno. Borrarla del archivo no basta, porque sigue en el historial de git.
- La X-API-Key de Posada también está en el repositorio (`scripts/test_posada_integration.js`,
  `CONTROL_INTEGRACIONES_SOCIOS_RDA2.md`). Conviene pedirle a Sam que la rote.

## Orden recomendado

1. Rotar la contraseña de Supabase.
2. Diagnóstico y migración del punto 1, y volver a correr S05.
3. **Antes** de dejar que la gente reserve: conectar la reserva y la cancelación con Posada (punto 2)
   y la disponibilidad en vivo (punto 3). Si no, arreglar el 500 convierte el problema en sobreventa real.
4. Re-sincronizar el catálogo con los tipos reales (punto 4).
5. Volver a correr la suite completa.
