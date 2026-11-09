# Alojamientos: el gateway agrega a los socios

## Qué cambia

Antes, Booking vendía los hoteles de los socios a partir de una **copia local** (`pec-htl-*`, con un
único tipo «estandar») y **nunca le avisaba al hotel**. Así pasaba el caso reportado: se reservaba
en la web del hotel y Booking volvía a vender la misma habitación.

Ahora, igual que vuelos (`src/modules/vuelos/socios/`), el API Gateway actúa como **agregador**:

1. **Catálogo en vivo:** cada consulta se reparte entre los socios registrados en «Servicios & Prov.»
   (`schema_proveedores.config_proveedor`, vertical `ALOJAMIENTOS`, sin kill-switch). Sus hoteles se
   exponen como `NODO~id`, por ejemplo `NODE_ALO_PEC~HTL-1001`. Un hotel nuevo del socio aparece al
   refrescar (caché de 10 s).
2. **Reserva:** Booking sincroniza al huésped (`GET`/`POST /clientes` en el socio), cotiza y crea la
   orden **en el socio** (`orders/create`) con la misma `Idempotency-Key` del cliente. Solo si el
   socio confirma, guarda una copia en `RESERVADO`. Si el socio responde `OUT_OF_STOCK`, Booking
   responde **409**.
3. **Cancelación:** se reenvía al socio.
4. **Check-in (Flujo 2):** el socio avisa a `POST /api/v2/reservas/{external_order_id}/checkin` con
   **su** `X-API-Key` y la reserva pasa a `CONFIRMADO_ASISTIDO`. Con otra clave: 401.

Concurrencia: el doble clic se serializa por clave y la copia tiene `idempotency_key UNIQUE`. La
última habitación la decide el socio. Ante un timeout o un 5xx, antes de fallar se consulta
`GET /orders?idempotency_key=`. Si la copia no se puede guardar, se cancela en el socio (Saga).

## Código

| Archivo | Rol |
|---|---|
| `src/modules/alojamientos/socios/alojamientos-socios.service.ts` | Socios, autenticación (`X-API-Key` u `oauth2:id:secreto`), catálogo, ficha y disponibilidad en vivo |
| `src/modules/alojamientos/socios/alojamientos-socios-reservas.service.ts` | Reserva, cancelación, check-in y copia en `schema_alojamientos.alojamientos_reservas_socio` (se crea sola al arrancar) |
| `src/modules/alojamientos/socios/alojamientos-socios.spec.ts` | 24 pruebas con un socio simulado según el contrato v2.2.0 (incluye el overlay gRPC) |
| `src/modules/alojamientos/alojamientos.service.ts` | Desvía al agregador todo id `NODO~id` |
| `src/modules/reservas/reservas.service.ts` | Receptor de check-in: paso 0 para reservas de socios; la rama local usaba la columna inexistente `localizador` |
| `frontend/src/components/AlojamientoCheckoutModal.jsx` | Pide tipo y número de documento del titular, que el hotel exige |
| `database/migrations/20261106_alojamientos_reservas_id_default.sql` | Arregla el HTTP 500 al guardar reservas (ya aplicado en producción) |

## Inventario en tiempo real por gRPC (opt-in)

Además del REST en vivo, un socio de alojamientos puede empujar su stock por el canal de
eventos gRPC del Booking (`InventoryStockService`, puerto 50051, `src/proto/inventory.proto`), el
mismo que usa Atracciones. El agregador superpone ese stock sobre la disponibilidad que devuelve,
**sólo cuando existe un push** para esa combinación exacta; si el socio no empuja nada, manda el
REST en vivo (fuente de verdad), así que no hay riesgo de sobreventa por un dato cacheado.

Contrato del push (`PushStockUpdate` / `StreamInventoryChanges`), metadata gRPC `x-api-key` = la
clave del nodo:

| Campo | Valor para alojamientos |
|---|---|
| `service_id` | Código del nodo, p. ej. `NODE_ALO_PEC` |
| `item_id` | Id del hotel **en el socio** (la parte después de `~`), p. ej. `HTL-1` |
| `date` | Fecha de check-in `YYYY-MM-DD` |
| `time_slot` | Código del tipo de habitación, p. ej. `HABITACION_ESTANDAR` |
| `available_units` | Habitaciones libres de ese tipo en esa fecha |

El overlay vive en `AlojamientosSociosService.aplicarStockGrpc` y se prueba en
`alojamientos-socios.spec.ts` (con push → pisa el cupo; sin push → intacto).

Variable `ALOJAMIENTOS_FUENTE`:
- `socios` (por defecto): sólo los hoteles de los socios; la copia local de un socio se oculta.
- `mixto`: además, los hoteles locales dados de alta a mano.
- `local`: el comportamiento anterior.

## Verificación (2026-11-08)

- Pruebas unitarias del backend completas (`npx jest`).
- **El código del agregador contra Posada EC, Kawsay y LuxeStays reales: 28/28.**
  - El caso del compañero da 409.
  - 10 clics simultáneos → 1 reserva.
  - 6 clientes por la última habitación → 1 confirmada.
  - El check-in exige la clave del hotel dueño.
  - Cancelar libera la habitación en el hotel.
- Contra el gateway desplegado hoy (versión vieja), por el frontend: el caso del compañero **se
  reproduce** (el front confirma una habitación que el hotel ya no tiene). Se corrige al desplegar.

## Pendiente de los socios

- **LuxeStays:**
  - acepta dos reservas sobre la última habitación;
  - el doble clic con la misma clave crea 2 o 3 órdenes;
  - acepta fechas pasadas, 0 adultos, correo inválido y campos desconocidos;
  - no recupera órdenes por `idempotency_key`;
  - permite el check-in antes de hora;
  - tarda más de 3 s en reservar.
- **Posada EC y Kawsay:** pasan concurrencia e idempotencia. Aún no exponen `/clientes`; Booking
  reserva igual y no inventa el `client_id`.

## Pendiente en Booking (fuera de este cambio)

- Cancelaciones hechas en la web del socio: el cupo se ve bien (en vivo), pero la copia sigue en
  `RESERVADO` hasta leer el feed `GET /alojamientos/eventos`.
- API keys de socios escritas en el código (`atracciones.service.ts`, `reservas.service.ts`) y la
  contraseña de Supabase en `database/migrate_alojamientos.js`: hay que rotarlas.
- Atracciones confirma la reserva aunque el socio la rechace: tiene el mismo riesgo de sobreventa.

## Despliegue

El checkout pide y envía el documento del titular **solo para hoteles de socios** (id `NODO~id`).
Así el frontend funciona con el backend viejo (no hay ids de socio, no envía campos nuevos) y con el
nuevo. **Frontend y backend se pueden desplegar en cualquier orden.**

1. Backend (App Service `booking-core-api`) desde `main`. Coordinar con quien despliega vuelos: el
   reinicio corta 1–3 minutos.
2. `ALOJAMIENTOS_FUENTE=socios` (es el valor por defecto) y reiniciar.

Volver atrás sin redesplegar: `ALOJAMIENTOS_FUENTE=local` y reiniciar.

Comprobación: `GET /api/v1/alojamientos?limit=3` devuelve ids `NODE_…~…`, y luego
`POSADA_API_KEY=… npm run test:live:posada -- --solo=W01,W02,W03,W04,W05,W06`.
