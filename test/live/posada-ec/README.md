# Pruebas reales Posada EC ⇄ Booking

Suite de 57 escenarios que se ejecuta contra lo **desplegado** de Posada EC (Sam, `NODE_ALO_PEC`) y del Booking.

```bash
POSADA_API_KEY=<clave> npm run test:live:posada                  # completa (crea y cancela reservas)
POSADA_API_KEY=<clave> npm run test:live:posada -- --solo-lectura
POSADA_API_KEY=<clave> npm run test:live:posada -- --solo=A02,A03
```

- `ejecutar.js`: catálogo de escenarios, ejecución, limpieza y reporte.
- `cliente.js`: clientes HTTP de Posada y Booking, generador de cédulas válidas e inválidas y utilidades.
- `resultados/`: un `.md` legible y un `.json` con la bitácora completa por corrida.

El catálogo explicado, el criterio de cada resultado y el hallazgo previo están en
[`docs/PRUEBAS_REALES_POSADA_EC.md`](../../../docs/PRUEBAS_REALES_POSADA_EC.md).
