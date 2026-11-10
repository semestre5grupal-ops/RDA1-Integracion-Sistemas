# ADR 008: Adopción y Delimitación de API Gateway (Norte-Sur) vs Service Mesh (Este-Oeste)

**Estado:** Aprobado  
**Fecha:** 2026-11-09  
**Cátedra:** Integración de Sistemas — Semana 08: API Gateways y Service Mesh (PUCE)  
**Docente:** Damián Nicolalde  

---

## 1. Contexto del Problema

El ecosistema de Booking Prototipo Ecuador ha evolucionado a través de las Semanas 1 a 7 incorporando múltiples paradigmas de integración:
- APIs REST (Vuelos, Autos, Atracciones, Alojamientos).
- Ingesta de stock gRPC HTTP/2 sobre el puerto 50051.
- Orquestación ESB con transacciones Saga LIFO compensatorias.
- Coreografía asíncrona de eventos con RabbitMQ y Apache Kafka.
- Capa de agregación GraphQL BFF y validación estricta de contratos JSON Schema.

En la **Semana 08**, surge la necesidad de formalizar la gestión de tráfico del sistema ante dos vectores de comunicación completamente distintos:
1. **Tráfico Norte-Sur:** Peticiones que provienen del exterior del sistema (clientes web, aplicaciones móviles, partners comerciales externos B2B) hacia el borde de la infraestructura.
2. **Tráfico Este-Oeste:** Peticiones internas que ocurren entre los microservicios del ecosistema (ej. `Booking Core` invocando a `MS_PAG` para cobrar, a `MS_STK` para reservar cupo, o a `MS_FAC` para emitir comprobantes fiscales).

---

## 2. Decisión Arquitectónica

Conforme a las directrices de la **Semana 08 del libro de texto**, se define una separación estricta de responsabilidades entre el **API Gateway** y el **Service Mesh**:

```
+-------------------------------------------------------------------------------+
|                      TRÁFICO NORTE-SUR (API Gateway)                         |
|  Clientes Externos / Web / Móvil / Partners B2B                              |
|                              │                                                |
|                              ▼                                                |
|            [ Kong Gateway DB-less (deploy/kong.yml) ]                        |
|            • Rate-limiting / Throttling perimetral                            |
|            • IP Whitelisting / Blacklisting                                   |
|            • Autenticación JWT / API Key en el borde                         |
|            • Validación de esquemas JSON Schema (AJV)                         |
|            • Inyección de trazabilidad (X-Correlation-Id)                    |
+-------------------------------------------------------------------------------+
                               │
                               ▼
+-------------------------------------------------------------------------------+
|                      TRÁFICO ESTE-OESTE (Service Mesh)                       |
|                                                                               |
|   [ Booking Core / ESB ]  ◄────────(Sidecar Envoy)────────►  [ MS_PAG ]       |
|            ▲                                                    ▲             |
|            │ (Sidecar Envoy)                     (Sidecar Envoy)│             |
|            ▼                                                    ▼             |
|       [ MS_STK ]           ◄────────(Sidecar Envoy)────────►  [ MS_FAC ]      |
|                                                                               |
|   • mTLS Automático (Mutual TLS / Zero Trust interno)                         |
|   • Circuit Breakers independientes por microservicio (Closed/Open/Half-Open) |
|   • Retries y Timeouts configurables sin tocar código de negocio              |
|   • Observabilidad este-oeste (Métricas inter-servicio y Traceparent)          |
+-------------------------------------------------------------------------------+
```

---

## 3. Justificación según la Tabla 3b de la Semana 08

En la sección 8.4 del libro (*¿Cuándo SÍ y cuándo NO conviene un Service Mesh?*, pág. 21) se establece la siguiente matriz de decisión:

| Señal en el ecosistema | ¿Justifica un Service Mesh completo en Kubernetes? | Estado en Booking Prototipo |
|---|---|---|
| **2-5 microservicios, un solo equipo** | **No**: la complejidad operativa supera el beneficio (sobre-ingeniería). | Fase de desarrollo actual (6 microservicios internos en Azure App Service). |
| **Decenas de microservicios, varios equipos, sin mTLS interno** | **Empieza a justificarse**, especialmente con requisitos de auditoría y Zero Trust. | Arquitectura objetivo proyectada. |
| **Cientos de microservicios, alta rotación de versiones, canary interno fino** | **Sí**: el escenario para el que Istio y Envoy fueron diseñados. | Producción a escala industrial. |

### Decisión Concreta de Implementación:
1. **API Gateway Norte-Sur:**
   - Se provee el manifiesto declarativo oficial `deploy/kong.yml` en modo DB-less (§8.3) con plugins de seguridad.
   - En el entorno actual de Azure App Service, se complementa con `EdgeRateLimitMiddleware` y `IpAccessControlMiddleware` para aplicar las políticas en el borde sin requerir un clúster de infraestructura adicional.
2. **Service Mesh Este-Oeste:**
   - Se provee el manifiesto declarativo oficial `deploy/istio-mesh.yaml` (§8.4) con políticas de `PeerAuthentication` (mTLS STRICT), `DestinationRule` (Circuit Breaking) y `VirtualService` (despliegue canary 90/10).
   - En el código de ejecución se implementa el patrón **Sidecar Proxy Embebido** (`SidecarProxyInterceptor` y `ServiceMeshService`), permitiendo medir latencia este-oeste, simular mTLS Zero Trust y activar Circuit Breakers sin incurrir en los costos operativos de Kubernetes ni romper el despliegue actual.

---

## 4. Consecuencias y Beneficios

- **Sin lógica de negocio en la infraestructura (§8.1):** Ni el Gateway ni los Sidecars absorben reglas de dominio; solo gestionan políticas transversales de red, seguridad y observabilidad.
- **Aislamiento de fallas:** Si `MS_PAG` o `MS_STK` experimenta latencias o caídas, el Circuit Breaker del Service Mesh se abre de inmediato protegiendo al resto del ecosistema sin saturar sockets.
- **Zero Trust Criptográfico:** Ninguna comunicación interna se realiza en texto plano o sin identidad validada en los encabezados `X-Mesh-mTLS`.
- **Preservación de Negocio:** La deduplicación de clientes (`CustomerMergeService`) se mantiene como lógica de dominio de `MS_CLI`, desacoplada de la infraestructura de malla.

