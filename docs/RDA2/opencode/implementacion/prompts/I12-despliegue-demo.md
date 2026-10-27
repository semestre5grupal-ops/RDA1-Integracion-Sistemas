# I12 — Despliegue y entorno de demostración

> Lee primero `00-REGLAS-IMPLEMENTACION.md`. Ejecutar al final. **No despliega nada**: solo deja los archivos y la guía.

## Objetivo
Que la demo/defensa se pueda levantar de forma reproducible, con brokers y gRPC, localmente y con plan para Render/Vercel.

## Lee primero
`docs/RDA2/PLAN_DE_DESPLIEGUE.md`, `render.yaml`/`Dockerfile`/`docker-compose*.yml` si existen, `.env.example`, `src/main.ts`, `contracts/asyncapi-eventos-v2.yaml`, `contracts/grpc/README.md`.

## Alcance
1. **`docker-compose.demo.yml`:** backend, RabbitMQ (con management), Kafka (modo KRaft de una sola instancia) y, si procede, un `mock-tienda` mínimo. Healthchecks y volúmenes; sin credenciales reales (usuarios de demo en `.env.demo.example`).
2. **`.env.example` completo:** todas las variables nuevas de I01–I10 (`NODE_ID`, `EVENT_BUS_MODE`, `TELEMETRY_SINK`, `SAGA_STORE`, `LOG_*`, `GRPC_ENABLED`, límites, secretos de webhook por proveedor) con descripción, **sin valores**.
3. **Scripts de demo:** `scripts/demo/seed.js` (datos mínimos), `scripts/demo/saga-ok.sh`, `scripts/demo/saga-falla.sh` (provoca fallo y compensación con el simulador/kill-switch) y `scripts/demo/webhook.sh` (usa `scripts/webhooks/sign.js`).
4. **Guía `docs/RDA2/GUIA_DEMO.md`:** pasos para levantar, guion de 10 minutos para la defensa (saga feliz → fallo y compensación → traza en el dashboard → webhook → inventario), y cómo apagar un nodo.
5. **Render:** ajusta `render.yaml` solo si existe y de forma mínima (healthcheck, variables). Para brokers/gRPC en Render, documenta opciones **sin afirmar** soporte no verificado.

## Criterios de aceptación
- [ ] `docker compose -f docker-compose.demo.yml config` valida (si Docker no está, dilo).
- [ ] Los scripts corren contra el entorno local (o se explica por qué no pudieron ejecutarse).
- [ ] Sin secretos en ningún archivo.

## Entrega
Commit: `chore(deploy): entorno demo con brokers, scripts y guia [I12]`
