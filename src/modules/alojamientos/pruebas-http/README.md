# Pruebas HTTP de Alojamientos

Suite de pruebas de punta a punta sobre la API real de `/api/v1/alojamientos`:
levanta la aplicación Nest con **la misma configuración que `main.ts`**
(ValidationPipe global, filtro RFC 7807, interceptor HATEOAS, prefijo `api/v1`)
y le hace peticiones HTTP de verdad con `fetch`. La base de datos se sustituye
por un repositorio en memoria (`repositorio-memoria.ts`) que imita a TypeORM,
así que no hace falta Postgres.

Cada prueba compara el comportamiento con el de **Booking.com** (sin
overbooking, cotizaciones que caducan, búsqueda tolerante a tildes, fechas
validadas, errores legibles por máquina, etc.).

```bash
npm run test:alojamientos          # solo alojamientos (unitarias + HTTP)
npx jest src/modules/alojamientos/pruebas-http/06   # una suite concreta
```

| Suite | Qué cubre |
|---|---|
| `01-contrato-http` | Formato RFC 7807 en todos los errores, `invalidParams`, JSON mal formado, campos no declarados, 200/201/204 según el verbo, cabeceras |
| `02-catalogo-admin` | Listado paginado y enlaces `next`/`prev`, detalle, alta/PATCH/PUT/DELETE, invalidación de caché tras cambios |
| `03-busqueda` | Destino con/sin tildes y mayúsculas, por nombre o país, filtros, `rows`, fechas, huéspedes, booker, moneda, disponibilidad por fechas, comodines SQL, telemetría |
| `04-catalogo-contrato` | `details`, `details/changes`, `chains`, `constants`, `reviews`, `reviews/scores`, `/:id/resenas` |
| `05-disponibilidad` | Tarifas y precios exactos, moneda, 404 sin cotizar otro hotel, solapamiento de fechas, inventario |
| `06-reservas` | Reserva directa: totales, Idempotency-Key, overbooking y concurrencia, capacidad, validación, consulta y cancelación |
| `07-ordenes` | Preview → create → get → modify → cancel, caducidad de 30 min, doble cobro, carreras entre preview y pago |
| `08-webhooks` | Alta/listado/baja, aislamiento entre socios, secreto enmascarado, entrega de eventos |
| `09-flujos-completos` | Recorridos de cliente y administrador de principio a fin |

Además, `../reglas-estancia.spec.ts` prueba las reglas de fechas y capacidad
(años bisiestos, cambio de año, límites de 30 noches y 500 días).

## Defectos que encontró esta suite (ya corregidos)

Con el código anterior fallaban **142 de las 458** pruebas HTTP. Lo principal:

- **Cobro incorrecto**: el total de una reserva directa usaba el `nights` enviado
  por el cliente y no las fechas (2 noches se cobraban como 1). Además, la moneda
  era siempre USD y los decimales no se redondeaban.
- **Reservas inventadas**: `orders/create` con una cotización inexistente o
  caducada creaba igualmente una reserva en *el primer hotel del catálogo*.
  `availability` y `orders/preview` con un ID inexistente cotizaban otro hotel.
- **Overbooking**: no había control de concurrencia; dos peticiones simultáneas
  podían quedarse con la última habitación. Tampoco se revalidaba el cupo entre
  el preview y el pago, ni al modificar una orden.
- **`POST /availability` siempre respondía 400**: el campo obligatorio
  `accommodation` no tenía decorador y `forbidNonWhitelisted` lo rechazaba.
- **Búsqueda**: "cancun" no encontraba "Cancún"; `%` o `_` devolvían todo el
  catálogo; un país sin oferta o un filtro sin resultados devolvían el catálogo
  entero; los filtros se aplicaban después de paginar.
- **Fechas sin validar**: se aceptaban llegadas pasadas, salida anterior a la
  entrada, fechas imposibles y estancias de cualquier longitud.
- **Capacidad**: se podían reservar 9 adultos en una habitación para 2.
- **500 en vez de 400**: orden sin `customer_details`; IDs de reserva que no son
  UUID llegaban a Postgres.
- **Cancelar una orden sin cuerpo** daba 400 (el motivo era obligatorio).
- **Caché obsoleta**: tras cambiar un precio o borrar un alojamiento, el detalle y
  el listado seguían mostrando lo anterior durante 60 s.
- `_links.next` aparecía también en la última página.
