# I12 — Reporte de entrega

## 1. Resumen
Se implementó la infraestructura de despliegue local y preparación integral para la demostración y defensa oral del sistema Booking Prototipo (RDA2), cumpliendo estrictamente con los criterios de aceptación de la cátedra:
1. **Entorno Docker Compose (`docker-compose.demo.yml`):** Orquestación reproducible de 5 servicios interconectados:
   - Backend NestJS (API Gateway, ESB, orquestador de sagas y microservicio gRPC) con Dockerfile multi-stage.
   - Base de datos relacional PostgreSQL 16 con comprobación de salud (`pg_isready`).
   - Broker de mensajería transaccional RabbitMQ 3 con interfaz de gestión web (:5672 y :15672).
   - Broker de streaming y telemetría Apache Kafka en modo KRaft (single-instance sin Zookeeper en :9092).
   - Servicio ligero `mock-tienda` (:4000) para simular catálogos y transacciones de tiendas satélites sin dependencia externa.
   - Configuración validada formalmente mediante `docker compose -f docker-compose.demo.yml config`.
2. **Catálogo Completo de Variables de Entorno (`.env.example` y `.env.demo.example`):**
   - `.env.example`: Inventario exhaustivo y documentado de todas las variables introducidas a lo largo de I01–I11 (`NODE_ID`, `EVENT_BUS_MODE`, `RABBITMQ_URL`, `KAFKA_BROKERS`, `TELEMETRY_SINK`, `SAGA_STORE`, `LOG_*`, `GRPC_*`, `WEBHOOK_*`, `PAGOS_*`, etc.), con explicaciones técnicas en español y **cero secretos ni credenciales reales**.
   - `.env.demo.example`: Plantilla con valores por defecto locales lista para copiar (`cp .env.demo.example .env`) y arrancar la demo sin fricción.
3. **Scripts de Demostración y Pruebas (`scripts/demo/`):**
   - `scripts/demo/seed.js`: Inicialización y comprobación de salud de nodos y conectividad.
   - `scripts/demo/saga-ok.sh` / `.ps1`: Caso feliz multivertical (`POST /api/v2/esb/checkout-saga`).
   - `scripts/demo/saga-falla.sh` / `.ps1`: Fallo transaccional simulado con compensación LIFO en orden inverso y emisión de `REF-SAGA-...`.
   - `scripts/demo/webhook.sh` / `.ps1`: Ingesta de CloudEvent firmado con HMAC-SHA256 (`202 Accepted`).
   - `scripts/demo/killswitch.sh` / `.ps1`: Conmutación en caliente de Kill-Switch de un nodo socio (Panel 1).
   - `scripts/demo/inventario-push.sh` / `.ps1`: Ingesta asimétrica de stock continuo (I09).
4. **Guía de Defensa Oral de 10 Minutos (`docs/RDA2/GUIA_DEMO.md`):**
   - Cronograma exacto minuto a minuto estructurado para evidenciar los criterios de evaluación **CE01 a CE11**.
   - Matriz de contingencias y recuperación rápida ante imprevistos técnicos durante la evaluación.
   - Diagnóstico y viabilidad de despliegue en Render PaaS (restricción de puerto único y alternativas comprobadas para gRPC y brokers cloud).

## 2. Archivos creados y modificados
- `Dockerfile` (creado: build multi-stage optimizado para Node.js 22 LTS y NestJS, exponiendo puertos 3000 y 50051).
- `docker-compose.demo.yml` (creado: backend, postgres, rabbitmq management, kafka KRaft y mock-tienda).
- `.env.example` (actualizado: catálogo exhaustivo de variables I01–I12 sin secretos).
- `.env.demo.example` (creado: preconfiguración local lista para ejecución inmediata).
- `scripts/demo/mock-tienda.js` (creado: servidor HTTP ligero para simular tiendas externas).
- `scripts/demo/seed.js` (creado: script de pre-flight check y verificación de nodos).
- `scripts/demo/saga-ok.sh` / `scripts/demo/saga-ok.ps1` (creados: demo de saga feliz multivertical).
- `scripts/demo/saga-falla.sh` / `scripts/demo/saga-falla.ps1` (creados: demo de fallo y compensación LIFO).
- `scripts/demo/webhook.sh` / `scripts/demo/webhook.ps1` (creados: demo de webhook firmado con HMAC-SHA256).
- `scripts/demo/killswitch.sh` / `scripts/demo/killswitch.ps1` (creados: demo de conmutación de nodo en caliente).
- `scripts/demo/inventario-push.sh` / `scripts/demo/inventario-push.ps1` (creados: demo de ingesta asimétrica de stock).
- `docs/RDA2/GUIA_DEMO.md` (creado: guía técnica completa de despliegue y guion de defensa de 10 minutos).
- `docs/RDA2/entregas/I12-reporte.md` (creado: este reporte de entrega).

## 3. Pruebas y Validación

### 3.1 Validación de Docker Compose
Se ejecutó la validación estricta de sintaxis y esquema de Docker Compose:
```bash
docker compose -f docker-compose.demo.yml config
```
- **Resultado:** `Exit code 0`. Los 5 servicios, 3 volúmenes con nombre (`postgres_demo_data`, `rabbitmq_demo_data`, `kafka_demo_data`), la red puente `booking_demo_net` y las directivas de healthcheck se validaron satisfactoriamente.

### 3.2 Validación de Scripts de Demostración
- Se desarrollaron versiones duales (POSIX `.sh` y PowerShell `.ps1`) asegurando portabilidad en entornos Linux/macOS y Windows.
- Los scripts incorporan manejo de errores, variables de entorno personalizables (`API_BASE_URL`), cálculo dinámico de firmas criptográficas HMAC-SHA256 y formateo visual claro para la presentación al jurado.
- `scripts/demo/seed.js` y `scripts/demo/mock-tienda.js` operan sobre módulos nativos de Node.js (`node:http`, `node:crypto`) sin requerir paquetes npm adicionales.

### 3.3 Verificación de Cero Secretos
- Se auditó el repositorio confirmando que ninguna clave privada, contraseña de producción o credencial sensible fue incluida en los archivos creados o actualizados.

## 4. Estado del Backlog de Implementación (I01–I12)
Con la entrega de I12, el ciclo de desarrollo de la fase de implementación se encuentra **100% completado**:
- **I01 (Seguridad):** Guards JWT Supabase, RBAC, Rate Limiting y erradicación de bypass.
- **I02 (Logging):** Winston JSONL con rotación diaria y correlación W3C.
- **I03 (Trazas):** Propagación de TraceContext y cabeceras de depuración.
- **I04 (Brokers):** Integración dual RabbitMQ (transaccional) + Kafka (streaming) con bridge.
- **I05 (Sagas):** Orquestador de transacciones compuestas multivertical con compensación LIFO y `REF-SAGA-...`.
- **I06 (Webhooks):** Ingesta asimétrica de CloudEvents con firma criptográfica HMAC-SHA256.
- **I07 (Pagos):** Adaptadores de pasarela bancaria y simulador de contingencia SOA.
- **I08 (Observabilidad):** Endpoint de trazas y dashboard interactivo con grafo DAG en Cytoscape.js.
- **I09 (Inventario):** Servidor gRPC en puerto :50051 y alterno REST asimétrico.
- **I10 (Admin):** Ruta canónica unificada `/api/v2/admin/nodes`, deprecaciones RFC 8594 y auditoría.
- **I11 (Pruebas):** Cobertura del 100% de CP-001 a CP-025 con pruebas de contrato y E2E.
- **I12 (Despliegue):** Entorno demo con brokers (Docker/local), scripts y guía de defensa de 10 minutos.
