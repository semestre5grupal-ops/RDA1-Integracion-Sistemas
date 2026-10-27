# Revisión final de implementación (Claude)

## 1. Alcance y seguridad
- [ ] `git diff --stat` por tarea: sin cambios fuera de lo pedido; sin `.env*`, secretos ni datos reales (`grep -rniE "(secret|apikey|password|eyJ)"` en el diff).
- [ ] Migraciones solo como SQL sin aplicar; `.env.example` sin valores.
- [ ] Sin `push`, sin tocar `main`.

## 2. Compilación y pruebas
- [ ] `npm ci && npm run build` y `npm test` en limpio; `npm run test:all` si existe (I11).
- [ ] `frontend`: `npm run build`.
- [ ] Cada tarea tiene prueba que fallaba antes y pasa ahora (revisar el commit de la prueba).

## 3. Por tarea (comprobar con el código, no con el reporte)
- **I01:** 401/403 reales en toggle, telemetría, inventario; chatbot sin sesión sin herramientas con efectos; 429/413.
- **I02:** `traceparent` propagado a llamadas salientes y a eventos; `correlation_id` en errores.
- **I03:** logs JSONL en archivos, sin tokens; ya no hay escritura de logs a BD.
- **I04:** ORDER/PAGO/RESERVA no llegan a Kafka; telemetría no llega a RabbitMQ; dedupe e DLQ.
- **I05:** compensación en orden inverso (leer la prueba); idempotencia; estado consultable.
- **I06:** `GET /pagos/{paymentReference}` sin datos de tarjeta; reembolso acotado.
- **I07:** `timingSafeEqual`, `rawBody`, 202 asíncrono, dedupe, secreto no expuesto.
- **I08:** grafo con nodos verdes/rojos para saga OK y fallida; lectura de logs acotada.
- **I09:** un solo proto; auth por metadata; REST alterno.
- **I10:** rutas viejas `deprecated` pero funcionales; auditoría.
- **I11:** pruebas de contrato validan respuestas reales; tabla CP honesta.
- **I12:** compose valida; scripts coherentes; sin secretos.

## 4. Compatibilidad
- [ ] `/api/v1` y rutas anteriores siguen respondiendo igual (probar 5 rutas clave).
- [ ] Contratos actualizados reflejan el código (`x-status` con `implemented` real) y pasan lint/validate.

## 5. Trazabilidad
- [ ] Hallazgos y BL marcados como resueltos solo si hay prueba.
- [ ] `HALLAZGOS_CONTRATOS.md` y `BACKLOG_IMPLEMENTACION.md` coherentes con el código.

## 6. Informe
Veredicto por tarea (OK / corregir / rehacer), correcciones priorizadas, y lista de lo que queda fuera (para el plan de la defensa).
