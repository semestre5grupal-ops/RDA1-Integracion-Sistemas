# D5 — Plan de integración

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta después de D1–D4.

## Objetivo
Plan que explique cómo Booking se integra con cada tienda (vuelos, autos, atracciones, alojamientos) y con los servicios internos, con diagramas.

## Salida
- `docs/RDA2/PLAN_DE_INTEGRACION.md`
- `docs/RDA2/entregas/D5-reporte.md`

## Lee primero
- `contracts/README.md` y todos los contratos (tiendas e internos)
- `docs Paúl Rosero/architecture/ADR-001…007`, `Semana 8 Consideraciones.md`
- `Pendientes/*.md`, `docs Paúl Rosero/context/active-context.md`
- `contracts/asyncapi-eventos-v2.yaml`, `contracts/webhooks-inbound-openapi-v2.yaml`, `contracts/grpc/README.md`

## Contenido obligatorio
1. **Mapa de integración** (diagrama Mermaid de contexto): frontend, API Gateway/ESB, microservicios internos, brokers, tiendas, Supabase, pasarela.
2. **Matriz por tienda:** REST, gRPC, webhooks, eventos; autenticación (OAuth2 de socio, `X-Api-Key`, HMAC); estado de cada integración (lista/por hacer) y responsable.
3. **Secuencias Mermaid** (`sequenceDiagram`): checkout feliz (búsqueda → hold → pago → emisión → factura); **saga con fallo y compensación LIFO** (con `REF-SAGA-XXXXXX`); webhook entrante con firma; actualización de inventario por gRPC; reembolso; circuit breaker abierto con fallback.
4. **Contratos de datos compartidos:** ID de reserva, `paymentReference`, `correlationId`, formatos de fecha y moneda, tabla de equivalencia de eventos entre tiendas.
5. **Orden de integración** (hitos y dependencias), pruebas de integración por hito (enlaza CP de D3) y criterios de "listo".
6. **Riesgos y mitigaciones** (contratos desalineados, brokers en Render, latencia de tiendas, claves) con probabilidad/impacto.
7. Qué debe entregar cada equipo de tienda a Booking (sin sustituir los contratos; solo checklist de integración).

## Criterios de aceptación
- [ ] Al menos 6 diagramas Mermaid que rendericen (valídalos con `npx @mermaid-js/mermaid-cli` o `mmdc` si está disponible; si no, revisa la sintaxis a mano y dilo).
- [ ] Cada integración enlaza a su contrato.
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D5 plan de integracion`
