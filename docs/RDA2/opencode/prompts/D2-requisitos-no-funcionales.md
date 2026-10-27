# D2 — Requisitos no funcionales

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta después de D1.

## Objetivo
Requisitos no funcionales medibles de Booking, con la forma en que se verifica cada uno.

## Salida
- `docs/RDA2/REQUISITOS_NO_FUNCIONALES.md`
- `docs/RDA2/entregas/D2-reporte.md`

## Lee primero
- `Pendientes/*.md`, `docs Paúl Rosero/technical-requirements.md`
- `docs Paúl Rosero/architecture/ADR-001…007`
- `docs Paúl Rosero/teoria RDA2/Semana 8 Consideraciones.md`
- `contracts/common/components-v2.yaml`, `contracts/asyncapi-eventos-v2.yaml`, `docs/RDA2/HALLAZGOS_CONTRATOS.md`

## Categorías obligatorias
Rendimiento (latencia, timeout 5 s del circuit breaker), disponibilidad y resiliencia (circuit breaker, mock fallback, kill-switch, saga con compensación LIFO), seguridad (JWT, roles, `X-Admin-Key`, `X-Api-Key`, HMAC de webhooks, secretos), observabilidad (`X-Correlation-Id`, `traceparent`, logs JSON Lines en archivos, dashboard de grafo), consistencia e idempotencia (`Idempotency-Key`), mensajería (RabbitMQ vs Kafka), interoperabilidad (versionado `/api/v1` y `/api/v2`, RFC 7807, CloudEvents), mantenibilidad, portabilidad/despliegue (Render, Vercel, Supabase), cumplimiento (B2B promociones: tope de descuento).

## Formato
Tabla por categoría: **ID** `RNF-<CAT>-NN`, requisito, **métrica y umbral**, método de verificación (prueba, inspección, monitor), estado actual (cumple / parcial / no cumple / no verificado) con evidencia, y hallazgo relacionado (`H-Pxx-NN`).

## Reglas
- Cada umbral debe venir de una fuente del repo o marcarse `Propuesto`.
- Cualquier "no cumple" debe enlazar a un hallazgo de `HALLAZGOS_CONTRATOS.md`.

## Criterios de aceptación
- [ ] Todas las categorías cubiertas, cada RNF medible.
- [ ] Resumen de cumplimiento (conteo por estado).
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D2 requisitos no funcionales`
