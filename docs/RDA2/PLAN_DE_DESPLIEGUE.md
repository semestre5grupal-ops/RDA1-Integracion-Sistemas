# Plan Maestro de Despliegue y Operación — Booking Prototipo (RDA2)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Prototipo (Plataforma Agregadora Central, API Gateway ESB y BFF)  
> **Documento:** Plan de Despliegue, Topología en la Nube, Viabilidad de Protocolos Asimétricos (gRPC/Brokers) y Operación  
> **Versión Estándar:** 2.0.0 (SemVer)  
> **Fecha de Elaboración:** Octubre 2026  
> **Estado:** Aprobado / Consolidado con Criterios CE01–CE11 y Arquitectura Cloud Híbrida  

---

## 1. Topología de Despliegue Actual y Entornos Cloud

La arquitectura de **Booking Prototipo (RDA2)** adopta un modelo de despliegue híbrido desacoplado en la nube pública, combinando infraestructura PaaS (*Platform as a Service*), BaaS (*Backend as a Service*) y Serverless Edge:

```mermaid
graph TD
    subgraph Clientes_Externos ["Usuarios y Tiendas Socias"]
        TURISTA["Cliente Turista (Navegador Web / Movil)"]
        ADMIN["Administrador Booking (Consola 8 Paneles)"]
        PARTNERS["Tiendas Satelites (Vuelos, Autos, Tours, Hoteles)"]
    end

    subgraph Frontend_Hosting ["Frontend CDN / Edge (Vercel)"]
        VERCEL["Vercel Edge Network\nReact 18 + Vite SPA\nHTTPS Publico (vercel.app)"]
    end

    subgraph Backend_Hosting ["Backend Core / API Gateway (Render PaaS)"]
        RENDER["Render Web Service (Linux Container)\nNode.js 22 LTS / NestJS 10.x\nPuerto Web: $PORT (10000 / 3000)\nHTTPS Publico (onrender.com)"]
        FS_LOGS[("Sistema de Archivos Efimero /logs\nlogs/audit-YYYY-MM-DD.log\nlogs/integration-YYYY-MM-DD.log")]
        RENDER -.->|Escritura fisica JSONL| FS_LOGS
    end

    subgraph Persistencia_BaaS ["Persistencia Centralizada (Supabase Cloud)"]
        SUPA_AUTH["Supabase Auth (GoTrue)\nTokens JWT con claims 'roles'"]
        SUPA_DB[("PostgreSQL 15+ Cloud\n12 Esquemas Relacionales Aislados\nCero Foreign Keys Cruzadas")]
    end

    subgraph Brokers_Mensajeria ["Brokers de Eventos Asincronos (Opciones Cloud)"]
        RABBIT_BROKER["RabbitMQ (AMQP 0-9-1)\nCloudAMQP 'Little Lemur'\nExchange: booking.events"]
        KAFKA_BROKER["Apache Kafka\nUpstash Serverless Kafka\nTopics: topic-*-sync/b2b"]
    end

    TURISTA -->|HTTPS / WSS| VERCEL
    ADMIN -->|HTTPS / WSS| VERCEL
    VERCEL -->|REST HTTPS / GraphQL + JWT + X-Correlation-Id| RENDER
    PARTNERS -->|REST Outbound / Inbound Webhooks HMAC| RENDER
    PARTNERS -.->|gRPC PushStockUpdate TCP :50051| RENDER

    RENDER -->|Pool TCP SSL / TLS| SUPA_DB
    RENDER -->|Auth API REST| SUPA_AUTH
    RENDER -.->|AMQP 5672 SSL| RABBIT_BROKER
    RENDER -.->|Kafka TLS 9092 / REST| KAFKA_BROKER
```

### 1.1 Servicios de Hosting y Distribución de Responsabilidades

| Componente | Proveedor de Hosting | Nivel de Servicio / Tier | Propósito Técnico en la Solución | Protocolos Expuestos |
|---|---|---|---|---|
| **Frontend Web SPA** | **Vercel** | Hobby Plan (Serverless / CDN) | Aplicación cliente en React 18 + Vite, TailwindCSS y Lucide Icons. Ofrece navegación fluida al turista y consola de administración con 8 paneles desacoplados. | HTTPS (TLS 1.3), HTTP/2 |
| **API Gateway / ESB Backend** | **Render** | Free Web Service (Contenedor Linux) | API Gateway central NestJS 10.x, router ESB, BFF GraphQL en `/graphql`, orquestador de Sagas LIFO, adaptadores ACL con Circuit Breakers y receptor de webhooks. | HTTPS (TLS 1.3 terminado en edge), HTTP/1.1, HTTP/2 |
| **Persistencia Transaccional** | **Supabase** | Free Cloud Database | Clúster PostgreSQL 15 gestionado. Aloja los 12 esquemas relacionales independientes (`schema_clientes`, `schema_vuelos`, `schema_autos`, `schema_atracciones`, `schema_alojamientos`, `schema_pagos`, `schema_facturacion`, `schema_finanzas`, `schema_paquetes`, `schema_carritos`, `schema_auditoria`, `schema_proveedores`) sin claves foráneas cruzadas (ADR-002). | TCP 5432 / 6543 (PgBouncer con SSL) |
| **Identidad y Roles (RBAC)** | **Supabase Auth** | Free Auth Service | Gestión de sesiones de clientes y personal operativo con tokens JWT firmados criptográficamente y claims de rol (`CLIENTE`, `ADMIN`, `MANTENIMIENTO`). | HTTPS REST |

### 1.2 Catálogo de Variables de Entorno por Servicio (Sin Valores ni Secretos)

Para garantizar la seguridad perimetral (**Criterio de Aceptación: Cero Secretos en Documentación**), a continuación se lista el catálogo exhaustivo de variables de entorno requeridas en tiempo de ejecución:

#### A. Backend (Render Web Service)
* `PORT`: Puerto asignado automáticamente por el runtime de Render (por defecto `10000`, en local `3000`).
* `NODE_ENV`: Entorno de ejecución (`development`, `test`, `production`).
* `DATABASE_URL`: URI de conexión a PostgreSQL en Supabase con credenciales y parámetro `?schema=public`.
* `SUPABASE_URL`: Endpoint HTTPS del proyecto Supabase Cloud para validación de tokens y firmas de autenticación.
* `SUPABASE_ANON_KEY`: Llave pública perimetral para consumo de API de Supabase en cliente.
* `SUPABASE_SERVICE_ROLE_KEY`: Clave administrativa de backend para bypass de RLS en operaciones de reconciliación interna.
* `GRPC_PORT`: Puerto TCP para la ingesta de inventario continuo (por defecto `50051`).
* `RABBITMQ_URL`: Cadena de conexión AMQP (`amqp://usuario:clave@host:puerto/vhost`) hacia el broker de mensajería transaccional.
* `KAFKA_BROKERS`: Lista delimitada por comas de hosts y puertos de brokers Apache Kafka para telemetría y réplicas B2B.
* `TIENDA_ATRACCIONES_URL`: URL base HTTPS de la tienda Descubre EC (Dilan Mendoza) para REST outbound.
* `TIENDA_AUTOS_URL`: URL base HTTPS de la tienda de Renta de Autos para REST outbound y control de flota.
* `TIENDA_VUELOS_URL`: URL base HTTPS del GDS Flight Core para búsqueda, holds y emisión de boletos.
* `TIENDA_ALOJAMIENTOS_URL`: URL base HTTPS del sistema de Hoteles para sincronización de inventario.
* `ALOJAMIENTOS_API_KEYS`: Lista delimitada por comas de llaves de socio autorizadas para `X-Api-Key`.
* `WEBHOOK_SECRET_VUELOS`: Secreto criptográfico compartido para validación de firma HMAC-SHA256 en webhooks de vuelos.
* `WEBHOOK_SECRET_AUTOS`: Secreto criptográfico compartido para validación de firma HMAC-SHA256 en webhooks de flota de autos.
* `WEBHOOK_SECRET_ATRACCIONES`: Secreto criptográfico compartido para validación de firma HMAC-SHA256 en webhooks de tours.
* `SMTP_HOST`: Nombre de host del servidor de correo saliente para remisión de facturas fiscales electrónicas.
* `SMTP_PORT`: Puerto TCP de transporte TLS/STARTTLS para correo electrónico.
* `SMTP_USER`: Cuenta de usuario remitente de facturación fiscal.
* `SMTP_PASS`: Contraseña de aplicación segura para envío SMTP.
* `MAIL_FROM`: Etiqueta visible del remitente en correos transaccionales.
* `FRONTEND_URL`: URL base del frontend para generación de enlaces dinámicos en correos y configuración de CORS.
* `GROQ_API_KEY`: Credencial de acceso a la API del modelo de lenguaje para el asistente virtual de consulta turística.
* `GROQ_MODEL`: Identificador del modelo LLM optimizado para tool-calling.
* `GROQ_REASONING`: Nivel de esfuerzo computacional de razonamiento (`low`, `medium`, `high`).
* `ADMIN_SECRET_KEY`: Llave maestra perimetral (`X-Admin-Key`) para el panel de simulación de fallos en pasarela SOA.

#### B. Frontend (Vercel SPA)
* `VITE_API_URL`: URL pública HTTPS del backend en Render (ej. `https://booking-prototipo-api.onrender.com/api`).
* `VITE_SUPABASE_URL`: URL base del proyecto Supabase Cloud para inicio de sesión en cliente.
* `VITE_SUPABASE_ANON_KEY`: Llave anónima pública de Supabase para inicialización del SDK `@supabase/supabase-js`.

---

## 2. Diagnóstico Técnico de Brokers y Protocolo gRPC (50051)

### 2.1 Estado Real en el Repositorio

| Protocolo / Broker | Implementación en Código Fuente | Componentes y Archivos Clave | Estado Actual en Repositorio | Brecha / Qué Falta para Operación Cloud |
|---|---|---|:---:|---|
| **RabbitMQ (AMQP 0-9-1)** | • Dependencia `amqplib: ^2.2.0` instalada.<br>• Servicio `RabbitMqEventBusService`.<br>• Declaración de Topic Exchange `booking.events` y 5 colas fijas.<br>• Modo Fallback in-memory y log a disco si el broker no responde. | [`src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts) | **Configurado con Fallback** | Provisionar y configurar la variable `RABBITMQ_URL` con una instancia cloud activa (ej. CloudAMQP) o levantar el contenedor local para la demo. |
| **Apache Kafka (Streaming)** | • Dependencia `kafkajs: ^2.2.4` instalada.<br>• Servicio `KafkaEventBusService`.<br>• Tópicos declarados (`topic-catalogo-sync`, `topic-ordenes-b2b`, `topic-auditoria-sagas`).<br>• Fallback in-memory hacia Winston Physical Logger. | [`src/modules/event-bus/kafka/kafka-event-bus.service.ts`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/modules/event-bus/kafka/kafka-event-bus.service.ts) | **Configurado con Fallback** | Configurar la variable `KAFKA_BROKERS` apuntando a un clúster Kafka o utilizar Upstash Serverless Kafka con SASL/SCRAM. |
| **gRPC Server (Socket :50051)** | • Dependencias `@grpc/grpc-js` y `@grpc/proto-loader` instaladas.<br>• Definición Protocol Buffers `inventory.proto`.<br>• Microservicio montado en `src/main.ts` en `0.0.0.0:${GRPC_PORT\|\|50051}`.<br>• Controlador `InventoryStockService` implementando RPC `PushStockUpdate`. | [`src/main.ts`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/main.ts)<br>[`src/proto/inventory.proto`](file:///c:/Users/aleji/Desktop/Semestre%206/Integracion%20de%20sistemas/Contratos/RDA1/src/proto/inventory.proto) | **Totalmente Implementado en Backend** | Render Free Web Service **no permite exponer múltiples puertos públicos** simultáneamente (no puede abrir el 3000 y el 50051 al Internet exterior en la misma instancia). |

### 2.2 Viabilidad de gRPC y Puertos Adicionales en el Hosting (Fuentes Oficiales Consultadas)

> **Investigación de Documentación Oficial:**  
> *Fecha de Consulta:* **24 de Octubre de 2026**  
> *Fuentes Oficiales:* [Render Documentation — Web Services Port Binding](https://render.com/docs/web-services#port-binding), [Render Documentation — Private Services & Networking](https://render.com/docs/private-services), [Render Community — Multiple Ports & gRPC Support](https://render.com/docs).

Tras investigar la documentación técnica oficial de Render, se determinan los siguientes hechos arquitectónicos:

1. **Restricción de Puerto Único en Web Services Públicos:**
   - Render Web Services asigna y monitorea **un único puerto por servicio** mediante la variable de entorno `PORT` (por defecto `10000`).
   - El balanceador perimetral de Render enruta el tráfico HTTPS público exclusivamente hacia dicho puerto.
   - **Render no soporta exponer múltiples puertos públicos en un solo Web Service**. Por ende, una sola instancia no puede recibir peticiones HTTP en el puerto 3000/10000 y recibir conexiones gRPC directas en el puerto 50051 desde la Internet pública.
2. **Limitaciones de Terminación gRPC/HTTP-2 en el Edge Proxy de Render:**
   - Aunque Render soporta HTTP/2 en su capa de entrada, el proxy de terminación TLS no gestiona de forma nativa tramas complejas de gRPC (como *trailers* gRPC HTTP/2 y *multiplexing* binario bidireccional) provenientes de clientes gRPC externos sin una capa de traducción como Envoy Proxy o gRPC-Web.
3. **Comportamiento en Private Services (Servicios Privados):**
   - Los *Private Services* de Render sí admiten cualquier puerto TCP arbitrario (incluyendo el 50051) y cualquier protocolo sin restricciones (gRPC nativo, TCP directo), pero **no están expuestos a la Internet pública**: solo son accesibles por otros servicios que residen dentro de la misma red privada de la cuenta de Render.

### 2.3 Opciones Arquitectónicas de Operación para la Demo y Producción

Frente a la restricción técnica del hosting en la nube, se establecen tres vías de operación:

```mermaid
graph LR
    subgraph Opcion_A ["Opcion A: Demo Academica Hibrida (Recomendada)"]
        LOCAL["Backend en Localhost:3000 + gRPC:50051"]
        NGROK["Tunel TCP ngrok (ngrok tcp 50051)"]
        PARTNER_A["Tiendas Companeros"] -->|TCP Publico ngrok| NGROK -->|Socket :50051| LOCAL
    end

    subgraph Opcion_B ["Opcion B: Brokers Cloud Gestionados"]
        C_AMQP["CloudAMQP Little Lemur (AMQP 5672)"]
        U_KAFKA["Upstash Serverless Kafka (SASL SSL)"]
        RENDER_B["Render Web Service"] --> C_AMQP
        RENDER_B --> U_KAFKA
    end

    subgraph Opcion_C ["Opcion C: Modo Resiliente Simulado"]
        FALLBACK["Winston Physical Logger (In-Memory Fallback)"]
        RENDER_C["Render Gateway"] -->|Sin caidas de checkout| FALLBACK
    end
```

1. **Opción A — Híbrida para Sustentación y Demo en Vivo (Recomendada):**
   - Ejecutar el backend en entorno local (`npm run start:dev`) donde los puertos `3000` (REST/GraphQL) y `50051` (gRPC) escuchan en paralelo.
   - Exponer el puerto `50051` al exterior mediante un túnel TCP seguro: `ngrok tcp 50051`.
   - Proporcionar la URL del túnel (ej. `tcp://2.tcp.ngrok.io:14522`) a los equipos de Vuelos, Autos y Atracciones para la prueba de streaming gRPC.
2. **Opción B — Brokers Gestionados Gratuitos en la Nube:**
   - **RabbitMQ:** Utilizar el plan *Little Lemur* de CloudAMQP (gratuito, 1M mensajes/mes, soporte de Topic Exchanges).
   - **Kafka:** Utilizar Upstash Serverless Kafka (gratuito, 10,000 mensajes/día, autenticación SASL/SCRAM vía TLS o REST API compatible con Serverless).
3. **Opción C — Modo Fallback / Simulado In-Memory (Garantía de Cero Bloqueos):**
   - El código implementado en `RabbitMqEventBusService` y `KafkaEventBusService` detecta si el broker no responde dentro de un timeout de 1000 ms.
   - En lugar de abortar las compras o congelar el servidor, el Gateway continúa la ejecución de la Saga, registra el evento en los archivos físicos de Winston (`RABBITMQ_EVENTO_EMITIDO_IN_MEMORY`) y entrega respuesta exitosa al usuario final.

---

## 3. Entornos de Ejecución, Estrategia de Versionado y Plan de Rollback

### 3.1 Matriz de Entornos de Operación

| Parámetro | Entorno Local / Desarrollo | Entorno Demo / Evaluación Oral | Entorno Producción (Cloud) |
|---|---|---|---|
| **Frontend** | `http://localhost:5173` (Vite dev) | `http://localhost:5173` o Vercel Preview | `https://booking-prototipo.vercel.app` |
| **Backend REST**| `http://localhost:3000/api` | `http://localhost:3000/api` o Render | `https://booking-prototipo-api.onrender.com/api` |
| **GraphQL BFF** | `http://localhost:3000/graphql` | `http://localhost:3000/graphql` | `https://booking-prototipo-api.onrender.com/graphql` |
| **gRPC Inbound** | `localhost:50051` | `localhost:50051` + `ngrok tcp 50051` | Modo Fallback / Render Private Service |
| **Persistencia**| Docker PostgreSQL o Supabase Dev | Supabase Cloud (12 esquemas) | Supabase Cloud (12 esquemas con RLS) |
| **Brokers** | Docker Compose (`rabbitmq`, `kafka`) | CloudAMQP / Upstash o Fallback | CloudAMQP / Upstash Serverless |

### 3.2 Estrategia de Versionado en el Despliegue (`/api/v1` y `/api/v2`)

El API Gateway de Booking implementa versionado a nivel de URI mediante la API oficial de NestJS (`src/main.ts`):

```typescript
app.setGlobalPrefix('api');
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: ['1', '2'],
  prefix: 'v',
});
```

* **Rutas `/api/v1` (Compatibilidad Inicial):** Mantiene retrocompatibilidad con las interfaces iniciales de consulta directa y generación de facturas en cliente (`POST /api/v1/facturas/enviar`, `GET /api/v1/chatbot/estado`).
* **Rutas `/api/v2` (Estándar RDA2 Consolidado):** Aloja las operaciones de arquitectura distribuida: orquestación de Sagas (`/api/v2/esb/checkout-saga`), pasarela SOA con compensaciones (`/api/v2/pagos/reembolsos`), árbol jerárquico de atracciones (`/api/v2/atracciones/categorias/arbol`), control de flota con cooldown 2h (`/api/v2/autos/orders/:id/checkin-devolucion`) y receptor de webhooks HMAC (`/api/v2/webhooks/*`).
* **Regla de No Ruptura:** Ambos esquemas de rutas coexisten pacíficamente en el mismo despliegue. Ninguna actualización v2 elimina ni modifica el comportamiento esperado de endpoints v1.

### 3.3 Plan de Rollback Inmediato ante Fallos en Producción

En caso de que un nuevo despliegue introduzca regresiones o incompatibilidades críticas durante la evaluación:

1. **Rollback de Frontend (Vercel):**
   - Vercel genera *Deployments inmutables* por cada commit.
   - En la consola de Vercel (`Project -> Deployments`), ubicar el despliegue estable inmediatamente anterior y seleccionar `Promote to Production`.
   - Tiempo de conmutación: **Instantáneo ($< 5\text{ segundos}$)** a nivel de CDN global sin necesidad de re-compilar.
2. **Rollback de Backend (Render):**
   - En el panel de Render (`Web Service -> Events / Deploys`), seleccionar el despliegue previo exitoso y pulsar `Rollback to this deploy`.
   - Render mantiene las imágenes de contenedor de despliegues previos, permitiendo reiniciar el contenedor anterior en aproximadamente **60 segundos**.
3. **Rollback de Esquemas de Base de Datos (Supabase):**
   - Las migraciones relacionales se encuentran aisladas por esquema. Cada script en `database/migrations/` cuenta con su contraparte de reversión DDL (`DROP TABLE IF EXISTS ... CASCADE`).
   - Dado que no existen claves foráneas cruzadas entre los 12 esquemas (`ADR-002`), revertir un esquema defectuoso no bloquea ni corrompe las tablas de los otros 11 módulos.

---

## 4. Observabilidad Operativa y Alimentación de Dashboards

### 4.1 Persistencia Física en Archivos Planos (Mandato RDA2 §2 / ADR-003)

Para cumplir con la política institucional de cero saturación de la base de datos relacional:
* **Ubicación Física:** Todos los logs de auditoría y llamadas de integración se escriben en el directorio `logs/` en la raíz del backend:
  - `logs/audit-YYYY-MM-DD.log`: Eventos de negocio (búsquedas, creación de reservas, inicios de saga, compensaciones LIFO, reembolsos, autorizaciones).
  - `logs/integration-YYYY-MM-DD.log`: Trazabilidad de latencia, código de estado HTTP y fallos de Circuit Breakers al contactar a tiendas socias.
* **Formato de Registro:** JSON Lines (JSONL), una entrada JSON por línea, garantizando procesamiento por streaming y fácil análisis:
  ```json
  {"timestamp":"2026-10-24T22:30:15.112Z","type":"AUDIT","event":"SAGA_CHECKOUT_ROLLBACK_COMPENSADO","correlation_id":"cid-f47ac10b","payload":{"sagaId":"saga-002","reciboReembolso":"REF-SAGA-A9C302-LIFO"}}
  ```
* **Rotación de Archivos:** Rotación diaria automatizada basada en la fecha ISO UTC (`getTodayDateString()`).

### 4.2 Alimentación de los Dashboards y Paneles Administrativos

El flujo de información hacia la consola de administración opera mediante lectura física desacoplada:

```mermaid
sequenceDiagram
    autonumber
    participant UI as "AdminDashboard.jsx (Panel 1 y 8)"
    participant Controller as "AdminController (/admin/*)"
    participant AuditSvc as "AdminAuditService"
    participant WinstonSvc as "WinstonPhysicalLoggerService"
    participant FS as "Disco Local (logs/*.log)"
    participant Supa as "PostgreSQL (12 Esquemas)"

    UI->>Controller: GET /admin/audit?limit=300
    Controller->>AuditSvc: listar(limit=300)
    AuditSvc->>WinstonSvc: getRecentAuditLogs(300)
    WinstonSvc->>FS: Leer lineas de archivos audit-*.log en streaming
    FS-->>WinstonSvc: Buffer de lineas JSONL
    WinstonSvc-->>AuditSvc: Array de eventos parseados
    AuditSvc->>Supa: SELECT no bloqueante de eventos de negocio activos
    Supa-->>AuditSvc: Registros de clientes y reservas
    AuditSvc-->>Controller: Fusion estructurada de auditoria
    Controller-->>UI: 200 OK (Historial de Sagas, Compensaciones y Logs)
    UI->>UI: Renderiza grafo de ejecucion y tabla forense
```

* **Semáforo LED de 5 Nodos (Panel 1):** `ConnectorHealthService` sondea activamente los 5 nodos del sistema (Atracciones, Autos, Alojamientos, Vuelos, gRPC Inventory). La respuesta alimenta los indicadores luminosos (Verde: Online, Amarillo: Degradado / Circuit Breaker Half-Open, Rojo: Offline / Circuit Breaker Abierto) y permite disparar Kill-Switches dinámicos en caliente.
* **Monitor Forense de Sagas (Panel 8):** Renderiza visualmente las trazas de compensación en orden LIFO y expone el identificador `REF-SAGA-XXXXXX` ante fallos de cobro o reservas.

---

## 5. Checklist de Puesta en Marcha y Plan de Contingencia

### 5.1 Checklist de Verificación Previa para la Defensa Oral (15 minutos antes)

- [ ] **Paso 1 — Despertar el Backend en Render (Warmup Anti Cold-Start):**
  - Enviar un ping HTTP mediante `curl -I https://booking-prototipo-api.onrender.com/api/admin/nodes/health` para despertar el contenedor gratuito de Render y evitar la demora de 30-50 segundos durante la evaluación.
- [ ] **Paso 2 — Verificar Conectividad con Supabase Cloud:**
  - Comprobar que el proyecto no se encuentre pausado por inactividad de 7 días accediendo al dashboard de Supabase o consultando `/api/v2/atracciones/categorias/arbol`.
- [ ] **Paso 3 — Comprobar Semáforo de 5 Nodos:**
  - Abrir la consola de administración en el frontend (`/admin -> Panel 1`), pulsar "Sondear Nodos Ahora" y confirmar que los 5 nodos se encuentren en verde (o con Circuit Breakers listos).
- [ ] **Paso 4 — Validar Recepción gRPC y Túnel (si aplica demostración distribuida):**
  - Si se evalúa gRPC en vivo con los compañeros, arrancar backend local y túnel `ngrok tcp 50051`. Ejecutar el script `node test-grpc-inventory.js` y confirmar salida `1/1 PASS`.
- [ ] **Paso 5 — Comprobar Directorio de Logs Físicos:**
  - Verificar que la carpeta `logs/` exista en el servidor y cuente con permisos de escritura.

### 5.2 Plan de Contingencia ante Fallas en Tiempo Real

| Escenario de Falla Durante la Sustentación | Comportamiento del Sistema y Mitigación Inmediata | Acción del Expositor / Defensa Oral |
|---|---|---|
| **Falla 1: Caída o lentitud extrema de una tienda socia (ej. Autos o Atracciones).** | **Mitigación CE01 Automática:** El Circuit Breaker del Gateway detecta timeout a los 5000 ms, abre el circuito tras 3 fallos consecutivos y entrega el catálogo de contingencia con la bandera `CONFIRMED_FALLBACK`. | Explicar al jurado: *"El sistema aplicó el Criterio CE01 de resiliencia perimetral: el fallo del socio externo no congeló la plataforma ni arrojó un error 500 al turista"*. |
| **Falla 2: Interrupción o falta de conexión con el broker RabbitMQ / Kafka.** | **Mitigación Fallback In-Memory:** `RabbitMqEventBusService` y `KafkaEventBusService` atrapan el error, evitan que la compra falle, registran el evento en `logs/audit-*.log` y permiten completar la Saga. | Mostrar la consola y los archivos físicos en disco evidenciando que el evento quedó registrado bajo `RABBITMQ_EVENTO_EMITIDO_IN_MEMORY`. |
| **Falla 3: Latencia por Cold Start en Render (30-50 segundos en primera carga).** | El frontend React cuenta con loaders visuales (`LoadingSpinner`) y no se bloquea. | Realizar la primera llamada al endpoint de salud 5 minutos antes de iniciar la presentación para asegurar que el contenedor esté caliente. |
| **Falla 4: Desconexión de Internet en el aula de clases.** | **Modo Respaldo Local:** Todo el ecosistema está configurado para ejecutarse en `localhost:3000` con `npm run start:dev` y base de datos local vía `docker-compose up -d`. | Conmutar inmediatamente el navegador a `http://localhost:5173` y continuar la defensa sin depender de la red institucional. |

---

## 6. Matriz de Costos y Límites de Planes Gratuitos (con Fuentes Verificadas)

La siguiente tabla resume los límites operacionales vigentes para cada servicio gratuito utilizado en la arquitectura:

| Proveedor / Servicio | Plan / Tier | Límites de Cuota y Recursos | Comportamiento al Superar el Límite | Fuente Oficial Consultada *(Fecha: 24/10/2026)* |
|---|---|---|---|---|
| **Render** | Free Web Service | • **750 horas de cómputo gratuitas por mes** por workspace.<br>• **512 MB de memoria RAM** y 0.1 vCPU compartida.<br>• **Spin-down automático (sleep)** tras **15 minutos** de inactividad de tráfico HTTP.<br>• **1 solo puerto expuesto** vía variable `PORT`. | El contenedor se apaga. La siguiente petición experimenta un *cold start* de 30 a 60 segundos. Si se agotan las 750 horas, el servicio se suspende hasta el siguiente mes. | [Render Docs — Free Plans & Pricing](https://render.com/docs/free) *(Consultado: 24/10/2026)* |
| **Supabase** | Free Tier | • **500 MB de almacenamiento PostgreSQL**.<br>• Hasta 2 proyectos activos.<br>• **Pausa automática por inactividad** tras **7 días consecutivos** sin consultas SQL directas a la base de datos.<br>• 50,000 usuarios activos mensuales (MAU). | La base de datos entra en pausa y deja de responder consultas. Los datos y esquemas se preservan íntegros y se reactivan con un clic en la consola. | [Supabase Docs — Free Tier Quotas](https://supabase.com/docs/guides/platform/manage-your-usage) *(Consultado: 24/10/2026)* |
| **Vercel** | Hobby (Personal) | • **100 GB de transferencia CDN (Bandwidth)** por mes.<br>• **1,000,000 de invocaciones Serverless** mensuales.<br>• **4 CPU-hours** de cómputo activo.<br>• Duración máxima de ejecución: **300 segundos** por función. | Las invocaciones adicionales se bloquean o pausan hasta el reinicio del ciclo de 30 días. | [Vercel Docs — Limits & Fair Use](https://vercel.com/docs/limits/overview) *(Consultado: 24/10/2026)* |
| **CloudAMQP** | Little Lemur (Free) | • **1,000,000 de mensajes mensuales**.<br>• Máximo **20 conexiones concurrentes**.<br>• Máximo **100 colas** activas.<br>• Máximo **10,000 mensajes encolados** simultáneos. | Bloqueo de nuevas conexiones si se superan los límites de concurrencia o caída forzada de conexiones con exceso de mensajes no confirmados (*unacked*). | [CloudAMQP Plans — Little Lemur](https://www.cloudamqp.com/plans.html) *(Consultado: 24/10/2026)* |
| **Upstash Kafka** | Serverless Free | • **10,000 mensajes gratuitos por día**.<br>• Arquitectura *scale-to-zero*.<br>• Acceso mediante protocolo binario Kafka (SASL/SCRAM + TLS) o REST API ligera. | Retención de mensajes y cobro pay-as-you-go únicamente si se excede la cuota diaria; no requiere tarjeta de crédito para uso dentro del límite. | [Upstash Pricing — Kafka Serverless](https://upstash.com/pricing/kafka) *(Consultado: 24/10/2026)* |

---
*Fin del Plan Maestro de Despliegue y Operación RDA2.*
