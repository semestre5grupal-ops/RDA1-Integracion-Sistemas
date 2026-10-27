# D6 — Plan de despliegue y operación

> Lee y respeta primero `docs/RDA2/opencode/00-REGLAS-COMUNES.md`. Ejecuta después de D5.

## Objetivo
Cómo se despliega y opera Booking, incluyendo la viabilidad de gRPC y los brokers en el hosting actual.

## Salida
- `docs/RDA2/PLAN_DE_DESPLIEGUE.md`
- `docs/RDA2/entregas/D6-reporte.md`

## Lee primero
- Archivos de despliegue (`render.yaml`, `Dockerfile`, `docker-compose*.yml`, `vercel.json`, `package.json` scripts), `.env.example` (**nunca** `.env*` reales)
- `src/main.ts`, `docs/RDA2/PLAN_DE_INTEGRACION.md`, `contracts/asyncapi-eventos-v2.yaml`, `contracts/grpc/README.md`
- `docs Paúl Rosero/architecture/` (ADR de despliegue/mensajería)

## Contenido
1. Topología actual: Render (backend), Vercel (frontend), Supabase (Postgres/Auth); variables de entorno por servicio (nombre y propósito, sin valores).
2. **Brokers y gRPC:** para RabbitMQ, Kafka y gRPC (50051) indica qué hay realmente configurado en el repo y qué **falta**. Para el hosting, busca la documentación oficial vigente (WebSearch/WebFetch) sobre soporte de gRPC/HTTP2, puertos adicionales y servicios privados, **cita las fuentes con fecha de consulta**, y si no logras confirmarlo, escribe "no verificado". Opciones: broker gestionado (CloudAMQP, Upstash/Confluent), contenedor con docker-compose para la demo local, modo simulado.
3. Entornos (local, demo, producción), estrategia de versiones `/api/v1` y `/api/v2` en el despliegue, y plan de rollback.
4. Observabilidad operativa: dónde quedan los logs JSON Lines, rotación, cómo se alimenta el dashboard de grafo.
5. Checklist de puesta en marcha para la demo/defensa y plan de contingencia (qué pasa si cae un broker o una tienda).
6. Costos y límites del plan gratuito relevantes (solo con fuente).

## Criterios de aceptación
- [ ] Cada afirmación sobre el hosting tiene fuente o dice "no verificado".
- [ ] Sin secretos ni valores reales de variables.
- [ ] Reporte con supuestos.

## Entrega
Commit: `docs(rda2): D6 plan de despliegue`
