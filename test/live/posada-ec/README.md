# Pruebas en vivo de alojamientos (socios ⇄ Booking)

Suite de 64 escenarios contra lo **desplegado**: un socio de alojamientos (por defecto Posada EC) y el
Booking. Crea reservas reales y las **cancela todas al final**.

```bash
POSADA_API_KEY=<clave> npm run test:live:posada                      # completa
POSADA_API_KEY=<clave> npm run test:live:posada -- --solo-lectura    # no crea nada
POSADA_API_KEY=<clave> npm run test:live:posada -- --solo=W01,W02    # solo algunas
```

Otro socio: `POSADA_BASE_URL=<url del socio>/api/v2 PRUEBAS_SOCIO="Kawsay Estancias"`.
Otro Booking: `BOOKING_BASE_URL=<url>/api/v1`.

| Grupo | Qué prueba |
|---|---|
| S | Salud y catálogo del socio en Booking |
| A | Doble canal Booking ⇄ socio (incluye el caso «reservo en el hotel y luego en Booking») |
| P, B | Reserva normal, concurrencia e idempotencia en el socio |
| C, D, E, F, G | Fechas, ocupación, documento, precio y recursos inexistentes |
| H, I, J | Ciclo de vida (cancelar, check-in, Saga), seguridad y tiempos |
| W | **A través del gateway**: doble clic, carrera, reintento, sin documento, check-in y cancelación |

Cada corrida deja un reporte `.md` y la bitácora `.json` en `resultados/`, que no se versiona.
Explicación de la integración: [`docs/ALOJAMIENTOS_SOCIOS.md`](../../../docs/ALOJAMIENTOS_SOCIOS.md).
