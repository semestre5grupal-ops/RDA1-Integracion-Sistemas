# Pruebas automáticas de Vuelos

Prueba de punta a punta contra el backend real (Azure por defecto) con las aerolíneas socias registradas.

```bash
node scripts/pruebas-vuelos/probar-vuelos-e2e.mjs
# con webhooks y solo una aerolínea:
WEBHOOK_SECRET_VUELOS=... AEROLINEAS=NODE_VUE_RAM node scripts/pruebas-vuelos/probar-vuelos-e2e.mjs
```

Cubre: búsqueda (ida y ida-vuelta), hold, mapa de asientos, compra con factura y orden
(`salesChannel.partnerOrderId`), referencia `PAY-BKP`, detalle, dueño (IDOR), Mis Reservas,
estado de vuelo, asiento ocupado y duplicado, check-in, cancelación con nota de crédito,
dato inválido + reintento, hold liberado, Idempotency-Key y webhooks firmados.

Cancela al final todas las reservas que crea (los cobros de prueba se devuelven).
Sale con código 1 si algún caso falla.
