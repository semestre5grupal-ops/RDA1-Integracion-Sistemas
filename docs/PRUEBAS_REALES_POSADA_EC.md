# Pruebas reales contra Posada EC (Sam) y el Booking desplegado

| | |
|---|---|
| **Socio** | Samantha Nuñez — Posada EC (`NODE_ALO_PEC`), vertical Alojamientos |
| **API del socio** | `https://posada-alojamientos-api.thankfulglacier-a27c5a77.northcentralus.azurecontainerapps.io/api/v2` |
| **Booking** | `https://booking-core-api.azurewebsites.net/api/v1` (configurable) |
| **Contrato de referencia** | `contracts/alojamientos-openapi-v2.yaml` (v2.2.0) |
| **Código de la suite** | `test/live/posada-ec/` (`ejecutar.js`, `cliente.js`) |
| **Resultados** | `test/live/posada-ec/resultados/<fecha>.md` y `.json` (se generan en cada corrida) |

## 1. Qué es esto y por qué

La certificación anterior de Posada (`scripts/test_posada_integration.js`, 6/6) sólo probaba el
**camino feliz**: health, catálogo, disponibilidad, una reserva y su cancelación. No probaba lo
que pasa cuando hay **dos canales vendiendo el mismo inventario** ni lo que hacen los usuarios
reales cuando se equivocan, se impacientan o hacen trampa.

El caso que reportó un compañero lo resume: reservó en la página de Posada, intentó reservar lo
mismo desde Booking y **no debería funcionar**. Esta suite convierte ese caso, y 57 más, en
pruebas automáticas que se ejecutan contra lo **desplegado** (no contra mocks).

## 2. Hallazgo previo por revisión de código (antes de ejecutar)

Revisando el código de este repositorio, **el resultado del caso del compañero es predecible**:

1. Cuando un cliente reserva un hotel en Booking, la reserva se guarda **sólo en la base de datos
   de Booking**. No se llama al `POST /alojamientos/orders/create` de Posada.
   - `src/modules/alojamientos/alojamientos.service.ts:1648` (`reservarEnSerie`) y `:1063`
     (`createOrderEnSerie`) crean la reserva localmente y descuentan el cupo local.
   - El adaptador que sí llamaría a Posada existe, `crearReservaExterna` en
     `src/modules/alojamientos/acl/alojamientos-circuit-breaker.adapter.ts:139`, pero **ningún
     código lo invoca**: el servicio sólo usa `aclAdapter` para mostrar el estado del circuito
     (`alojamientos.service.ts:2470`).
2. El cupo que Booking comprueba al reservar es el **suyo** (`tiposService.ocupacion`, vía
   `elegirTipo`, `alojamientos.service.ts:1713` y `:1107`). El stock que un socio pueda enviar por
   gRPC sólo se aplica al **mostrar** la disponibilidad (`:1602`), no al reservar, y vive en memoria.

**Consecuencia esperada:** Booking y Posada tienen cada uno su propio inventario y no se avisan
entre sí. Las pruebas A01–A04 deberían fallar (sobreventa en los dos sentidos y reservas de
Booking que el hotel nunca recibe). Es una predicción a partir del código: la ejecución real
(sección 5) la confirma o la desmiente. Si el Booking desplegado corre una versión distinta de la
de esta rama, manda la ejecución.

## 3. Catálogo de pruebas

Leyenda de resultados: ✅ **PASA** (correcto) · ❌ **FALLA** (defecto) · ⚠️ **AVISO** (funciona, pero
no como dice el contrato) · ⛔ **BLOQUEADO** (no se pudo evaluar: falta una precondición) ·
⏭️ **OMITIDO** (excluido por el modo de ejecución).

### S · Salud y catálogo
| ID | Situación real | Esperado |
|---|---|---|
| S01 | Booking verifica que el hotel responde | `health` 200, HEALTHY y devuelve `X-Correlation-ID` |
| S02 | Nuestro sistema está arriba | `GET /alojamientos` 200 |
| S03 | Un viajero busca en Booking un hotel que Posada ofrece | Todo hotel activo de Posada existe en Booking (por `id_externo`) |
| S04 | Posada retira un hotel y Booking lo sigue vendiendo | Ningún hotel retirado o inexistente a la venta en Booking |
| S05 | Un viajero elige un hotel de Posada en Booking y pulsa «Reservar» | 201 (o 409 sin cupo). Nunca 500 |

### A · Doble canal Booking ⇄ Posada (el núcleo)
| ID | Situación real | Esperado |
|---|---|---|
| A01 | Reservo en Booking, llego al hotel y no tienen mi reserva | Posada descuenta la habitación vendida por Booking |
| **A02** | **Caso del compañero:** se reserva en Posada la última habitación y alguien la intenta en Booking | Booking muestra 0 y responde **409** |
| A03 | Inverso: se agotan en Booking y alguien reserva directo en Posada | Posada responde **409 OUT_OF_STOCK** |
| A04 | Un cliente cancela directo con el hotel | Booking baja 1 al reservar y recupera 1 al cancelar |
| A05 | En Booking dice «quedan 3» y en el hotel «queda 1» | Mismas habitaciones libres en ambos |
| A06 | Booking anuncia un precio y el hotel cobra otro | Mismo precio por noche |

### P · Reserva normal en Posada
| ID | Situación real | Esperado |
|---|---|---|
| P01 | Un cliente reserva 1 habitación, 2 noches | 201 con `orderId`, `ORD-HTL-…`, `BK-HOTEL-…`, `CONFIRMED` |
| P02 | Tras mi reserva el hotel tiene una habitación menos | `habitacionesRemanentes` baja exactamente 1 |
| P03 | Me cotizan $X y me cobran $X, el desglose suma | total = cotizado; subtotal + IVA + tasa − descuento = total |

### B · Concurrencia e idempotencia
| ID | Situación real | Esperado |
|---|---|---|
| B01 | Dos personas reservan la última habitación en el mismo segundo | Una 201 y la otra 409 |
| B02 | Doble clic en «Pagar» (misma `Idempotency-Key`, en paralelo) | Una sola reserva |
| B03 | Se cae el wifi y la app reintenta | Misma orden, `Idempotent-Replayed: true` |
| B04 | Se reutiliza la clave para otra compra | 422 `IDEMPOTENCY_KEY_REUSED` |
| B05 | Integrador sin cabecera o con clave no UUID | 400 |
| B06 | Booking no recibió respuesta y pregunta si la reserva existe | `GET /orders?idempotency_key=` la devuelve |

### C · Fechas
| ID | Situación real | Esperado |
|---|---|---|
| C01 | Fechas en el pasado | 422 |
| C02 | Entrada y salida el mismo día | 422/400 |
| C03 | Fechas invertidas | 422/400 |
| C04 | 31 noches (máximo 30) | 422 |
| C05 | Formato `dd/mm/aaaa` | 400 |
| C06 | 30 de febrero | 400/422 |

### D · Ocupación y cupo
| ID | Situación real | Esperado |
|---|---|---|
| D01 | 20 adultos en una habitación | 422 `CAPACITY_EXCEEDED` |
| D02 | 0 adultos | 400/422 |
| D03 | Niños negativos | 400 |
| D04 | 0 habitaciones | 400 |
| D05 | Piden 4 habitaciones cuando quedan 3 | 409 `OUT_OF_STOCK` (sin reserva parcial) |

### E · Datos del huésped
| ID | Situación real | Esperado |
|---|---|---|
| E01 | Cédula con dígito verificador mal | 422 `INVALID_DOCUMENT` |
| E02 | Cédula de 9 dígitos | 400/422 |
| E03 | Turista con pasaporte | 201 |
| E04 | Correo `juan@` | 400 |
| E05 | Reserva sin datos del huésped | Rechazo (AVISO si se acepta: el contrato no lo exige) |
| E06 | `<script>` / SQL en el nombre | Nunca 500 |

### F · Precio, moneda y contrato
| ID | Situación real | Esperado |
|---|---|---|
| F01 | El usuario edita la petición y paga $1.00 | 409 `PRICE_MISMATCH` (si pasa, es crítico) |
| F02 | Total como número `153.5` | 400 (Money es string) |
| F03 | Pagar en EUR | 422 `UNSUPPORTED_CURRENCY` |
| F04 | Cotización vieja o inventada | 409 `QUOTE_EXPIRED` / 404 |
| F05 | Campo extra `descuentoVIP` | 400 |

### G · Recursos inexistentes
| ID | Situación real | Esperado |
|---|---|---|
| G01 | Enlace a un hotel eliminado | 404 `HOTEL_NOT_FOUND` |
| G02 | Tipo de habitación que ya no existe | 404/422/409/400 |
| G03 | Código de reserva mal escrito (consultar / cancelar) | 404 |

### H · Ciclo de vida de la reserva
| ID | Situación real | Esperado |
|---|---|---|
| H01 | El huésped da su `BK-HOTEL-…`, Booking usa `ORD-HTL-…` | Los tres identificadores resuelven la misma reserva |
| H02 | Check-in digital semanas antes | 422 `CHECKIN_TIME_NOT_REACHED` |
| H03 | El cliente cancela | 200 `CANCELLED`, `REF-HTL-…`, cupo restaurado |
| H04 | Pulsa «Cancelar» dos veces | 200 `yaCancelada: true`, mismo reembolso |
| H05 | Check-in de una reserva cancelada | 409 `INVALID_STATE_TRANSITION` |
| H06 | Falla otro paso del paquete y Booking compensa | `SAGA_ORCHESTRATOR` → reembolso 100 % |

### I · Seguridad
| ID | Situación real | Esperado |
|---|---|---|
| I01 | Bot anónimo crea reservas falsas | 401 |
| I02 | API key inventada | 401 |
| I03 | Listar reservas ajenas sin credenciales (cédulas, teléfonos) | 401 |
| I04 | El health público filtra secretos | Sin contraseñas, cadenas de conexión ni claves |
| I05 | Booking decide compensar según el `code` del error | `application/problem+json` con `code` del enum |

### J · Rendimiento
| ID | Situación real | Esperado |
|---|---|---|
| J01 | Hora pico: 10 consultas simultáneas | Sin 5xx ni timeouts (429 es aceptable) |
| J02 | Si el hotel tarda > 3 s, Booking compensa pero el hotel guardó la reserva | Toda `orders/create` ≤ 3000 ms |

## 4. Cómo se ejecuta

Requisitos: Node ≥ 22 (sin dependencias) y la X-API-Key que Posada entregó al Booking
(está en la ficha 2.8 de `Faltantes RDA2/Atracciones individuales/CONTROL_INTEGRACIONES_SOCIOS_RDA2.md`).

Corrida completa (crea reservas de prueba y las cancela al final):

```bash
POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js
```

Sólo lectura (no crea nada; sirve para S01–S04, A05, A06, G03, I03–I05, J01):

```bash
POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js --solo-lectura
```

Sólo algunas pruebas (S01–S03 y P01 se ejecutan siempre porque las demás dependen de ellas):

```bash
POSADA_API_KEY=<clave> node test/live/posada-ec/ejecutar.js --solo=A02,A03,B01
```

Variables opcionales: `POSADA_BASE_URL`, `BOOKING_BASE_URL`, `PRUEBAS_ESPERA_SYNC_MS` (espera para
que un canal se entere del otro, por defecto 5000), `PRUEBAS_MAX_AGOTAR` (máximo de habitaciones
que se reservan para agotar un tipo, por defecto 8), `PRUEBAS_TIMEOUT_MS`.
Detrás de un proxy corporativo, anteponer `NODE_USE_ENV_PROXY=1`.

El proceso termina con código 1 si alguna prueba FALLA.

### Cuidado con los datos de producción

- Las reservas se hacen con fechas **40 a 100 días en el futuro**, en ventanas separadas para que
  unas pruebas no interfieran con otras, y con huéspedes `Prueba Automatizada …` /
  `qa.posada+…@booking-pruebas.ec`.
- Para A02, A03 y B01 se **agota temporalmente** un tipo de habitación (el de menos cupo, como
  mucho `PRUEBAS_MAX_AGOTAR`). Mientras dura la corrida, ese tipo no se puede vender en esas fechas.
- Todo lo creado se cancela: al instante si se aceptó por error, y al final las demás. La sección
  **Limpieza** del reporte lista cada cancelación y avisa si alguna quedó abierta.
- Conviene avisar a Sam antes de la corrida completa, porque verá reservas y cancelaciones de prueba.

### Cómo se decide cada resultado

- Una petición inválida que el socio **acepta** → ❌ FALLA (y se cancela en el acto).
- Un 5xx o un timeout donde debía haber un rechazo controlado → ❌ FALLA.
- Rechazo con el HTTP y el `code` del contrato → ✅ PASA. Rechazo con otro código → ⚠️ AVISO.
- La suite tolera pequeñas diferencias de nombres (`/disponibilidad` frente a `/availability`,
  `opciones` frente a `tipos`) porque evalúa el comportamiento de negocio, no el nombre de un campo.
- Booking y Posada se emparejan por `id_externo` (hotel) y por código de tipo de habitación normalizado.

## 5. Resultados de la ejecución real (2026-11-04)

| Corrida | Modo | Resultado | Reporte |
|---|---|---|---|
| 16:29 UTC | sólo lectura | 10 ✅ · 1 ❌ (A05) · 46 ⏭️ | `resultados/2026-11-04T16-29-20-395Z.md` |
| 16:30 UTC | completa (57 pruebas) | 50 ✅ · 2 ❌ · 1 ⚠️ · 4 ⛔ | `resultados/2026-11-04T16-30-06-331Z.md` |
| 16:33 UTC | `--solo=S05,A01–A04` (con S05 nuevo y el criterio de A02 corregido) | S05 ❌ · A02 ❌ · A04 ❌ · A01 ⛔ · A03 ⛔ | `resultados/2026-11-04T16-33-46-503Z.md` |
| **2026-11-06 14:50 UTC** | `--solo=S05,A01–A04`, tras poner `DEFAULT` al `id` en Supabase | **S05 ✅** · A01 ❌ · A02 ❌ · A03 ❌ · A04 ❌ | `resultados/2026-11-06T14-50-07-985Z.md` |

Limpieza verificada al final: en Posada no queda ninguna reserva de prueba activa
(`GET /orders`: 21 `CANCELLED` de estas corridas y 3 `CHECKED_OUT` que ya existían). En Booking
no se llegó a crear ninguna reserva, por el error 500 descrito abajo.

### 5.0 Estado al 2026-11-06, tras arreglar el 500

Con el `DEFAULT` en `id` (ver `INVESTIGACION_BOOKING_ALOJAMIENTOS.md`), el Booking ya guarda y cancela
reservas (S05 ✅). Las cuatro pruebas de doble canal ahora fallan de verdad, tal como predecía el código:

- **A01:** una reserva hecha en Booking (BKG-603834) no llega a Posada: Posada siguió con 8 libres.
- **A02 (caso del compañero):** con Posada agotada (0 libres), Booking mostraba 5 libres **y vendió**
  la habitación (BKG-779672). **Sobreventa confirmada.**
- **A03:** con las 5 vendidas en Booking, Posada aceptó otra reserva directa (BK-HOTEL-9BDEA0AA).
  **Sobreventa confirmada en el otro sentido.**
- **A04:** Booking no refleja ni las reservas ni las cancelaciones hechas en Posada.

Todas las reservas de prueba se cancelaron: se verificó `CANCELLED` en las 4 de Booking y en las 3 de Posada.

### 5.1 Lo que está mal (en orden de gravedad)

1. **❌ S05 · En Booking no se puede reservar ningún hotel de Posada: HTTP 500.**
   `POST /api/v1/alojamientos/pec-htl-XXXX/reservations` responde `500 Error interno del servidor`
   en todos los intentos, con o sin tipo de habitación y con o sin teléfono. Las validaciones previas
   sí funcionan (fechas invertidas → 400, hotel inexistente → 404), así que el fallo ocurre al
   **guardar** la reserva. Hoy los 30 hoteles de Booking son todos de Posada, así que **ningún
   cliente puede reservar alojamiento en Booking**. Hay que revisar el log del backend en Azure
   (buscar `POST /api/v1/alojamientos/*/reservations` el 2026-11-04 entre 16:30 y 16:34 UTC). Un
   candidato a revisar es que la base de datos de producción no tenga aplicadas las migraciones de
   `database/migraciones/2026-10-1*_alojamientos_*.sql`, aunque esto no se pudo confirmar sin los logs.
2. **❌ A02 · El caso del compañero.** Se agotaron en Posada las 8 «Habitación Estándar» de HTL-1001
   (24 → 26 dic). Posada pasó a 0, pero Booking **seguía mostrando 5 libres**. Booking no llegó a
   vender la habitación sólo porque la reserva falló con 500, no porque supiera que estaba agotada.
   En cuanto se corrija el 500, esto será una sobreventa (como predice la sección 2).
3. **❌ A04 · Booking no se entera de nada de lo que pasa en Posada.** Se reservó y se canceló en
   Posada y Booking mostró siempre el mismo cupo.
4. **❌ A05 · El catálogo de Booking no coincide con el de Posada.** En Booking cada hotel de Posada
   tiene un único tipo genérico («Habitación Estándar», código `estandar`) y otro cupo. Ejemplo:
   HTL-1001 tiene en Posada Estándar ×8 + Suite Familiar ×3; en Booking, sólo Estándar ×5. La
   mayoría de los tipos reales de Posada (`SUITE_FAMILIAR`, `DEPARTAMENTO_COMPLETO`,
   `HABITACION_DOBLE`, `CABANA_PAREJA`, …) **no existen en Booking**. El precio por noche de los
   tipos que sí coinciden es igual (A06 ✅).
5. **⛔ A01 y A03** (reserva de Booking que llega al hotel; agotar en Booking y reservar en Posada)
   no se pudieron evaluar, porque requieren reservar en Booking (S05). Por el código se espera que fallen.
6. **⛔ H02 y H05** (check-in): Posada exige token de usuario (BearerAuth) y la API key de Booking
   no basta. Es lo que dice el contrato; no es un defecto.

### 5.2 Lo que está bien: el sistema de Sam

Posada EC cumple el contrato v2.2.0 en todas las pruebas que dependen sólo de ella:

- **Concurrencia:** dos clientes por la última habitación → una 201 y otra 409 (B01). El doble clic
  crea una sola reserva (B02). El reintento devuelve la misma orden con `Idempotent-Replayed: true`
  (B03). La misma clave con otro cuerpo → 422 `IDEMPOTENCY_KEY_REUSED` (B04).
- **Precio:** pagar $1.00 → 409 `PRICE_MISMATCH` («la tarifa vigente es 257.00»). La cotización
  se respeta y el desglose cuadra exacto (P03). EUR → 422.
- **Validaciones:** fechas pasadas, invertidas, 31 noches, 30 de febrero, 20 adultos, cédula con
  módulo 10 incorrecto, correo inválido, campos desconocidos y reserva sin huésped: todo rechazado
  con el código del contrato. El pasaporte de un turista sí se acepta.
- **Ciclo de vida y seguridad:** los tres identificadores resuelven la reserva; cancelar libera el
  cupo; cancelar dos veces es idempotente (mismo `REF-HTL-…`); la compensación de Saga reembolsa
  el 100 %; sin clave → 401; el health no filtra secretos; los errores son `problem+json`.
- **Rendimiento:** todas las reservas tardaron menos de 3000 ms y 10 consultas simultáneas no dieron errores.

**Conclusión:** el problema del caso del compañero **no está en el sistema de Sam, sino en el
Booking**. Posada controla bien su inventario, pero el Booking vende con un inventario propio,
desactualizado y con otros tipos de habitación, y ahora mismo ni siquiera puede guardar reservas.

> Antes de la corrida válida se depuró el script contra un simulador local descartable (no versionado),
> que no forma parte de estos resultados.

## 6. Qué haría falta para que A01–A04 pasen

Que Booking deje de vender a ciegas el inventario de Posada:

1. Al reservar un hotel de un proveedor externo, llamar a `POST /alojamientos/orders/create` de
   Posada **antes** de confirmar (el adaptador `crearReservaExterna` ya existe con circuit breaker)
   y guardar su `external_order_id`. Si Posada responde 409 `OUT_OF_STOCK`, Booking responde 409
   al cliente.
2. Al cancelar en Booking, llamar a `POST /alojamientos/orders/{external_order_id}/cancel`.
3. Consultar la disponibilidad de Posada en vivo (o aplicar el stock gRPC también al **reservar**,
   no sólo al mostrar) para que A05 coincida.
4. Revisar el mock de respaldo del adaptador: con el circuito abierto devuelve
   `CONFIRMED_FALLBACK` sin que el hotel sepa nada. Es justo la sobreventa que estas pruebas detectan.
