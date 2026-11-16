# Booking Central - Plataforma de Integración Turística B2B

> **Proyecto de Integración de Sistemas (RDA2)**  
> Plataforma de comercio electrónico y orquestación distribuida para la reserva federada de servicios turísticos: **Atracciones, Autos, Alojamientos y Vuelos**.

---

## Tabla de Contenidos
1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Diagrama de la Arquitectura por Capas](#2-diagrama-de-la-arquitectura-por-capas)
3. [Estilos Arquitectónicos](#3-estilos-arquitectónicos)
4. [Patrones Arquitectónicos de Integración (EIP)](#4-patrones-arquitectónicos-de-integración-eip)
5. [Componentes Arquitectónicos](#5-componentes-arquitectónicos)
6. [Vistas Arquitectónicas (Modelo C4 y 4+1)](#6-vistas-arquitectónicas-modelo-c4-y-41)
7. [Atributos de Calidad y Requerimientos No Funcionales (RNF)](#7-atributos-de-calidad-y-requerimientos-no-funcionales-rnf)
8. [Registro de Decisiones de Arquitectura (ADRs)](#8-registro-de-decisiones-de-arquitectura-adrs)
9. [Guía de Despliegue y Ejecución Local](#9-guía-de-despliegue-y-ejecución-local)

---

## 1. Visión General del Sistema

**Booking Central** es un ecosistema distribuido federado diseñado bajo los principios de **Domain-Driven Design (DDD)** y arquitectura de **Integración Empresarial (EAI / B2B)**. Opera como un concentrador de servicios que conecta a usuarios finales (turistas) con plataformas externas e independientes desarrolladas por socios comerciales:

- **Atracciones**: Integración B2B con *Descubre EC* (Dilan), *Vívelo Ecuador* (Gloria), *TourGirls* (Michael), *EcuaTravel* (Ariel) y *Atracciones Ecuador* (Alisson).
- **Autos**: Integración con flotas federadas (*RutaLibre Autos*, *AutoSpot*, *DriveEC*).
- **Alojamientos**: Integración con cadenas hoteleras y motores de reserva asociados.
- **Vuelos**: Integración de itinerarios aéreos nacionales e internacionales con emisión de pases de abordar.

El núcleo central proporciona agregación de catálogos en tiempo real, orquestación de transacciones distribuidas (Sagas), tolerancia a fallos mediante Circuit Breakers, trazabilidad transversal distribuida y gobernanza de contratos OpenAPI v2 y v3.

---

## 2. Diagrama de la Arquitectura por Capas

El siguiente diagrama ilustra la separación de responsabilidades y el flujo de comunicación este-oeste y norte-sur del sistema:

```mermaid
flowchart TD
    subgraph CAPA_PRESENTACION["Capa de Presentación (Frontend SPA)"]
        UI_WEB["React 18 + Vite SPA\n(Catálogos, Detalle, Checkout, Mis Reservas)"]
        UI_STATE["Gestión de Estado y Optimistic UI\n(Time Slots Dinámicos, Carrito, Moneda)"]
        UI_WEB --> UI_STATE
    end

    subgraph CAPA_BORDE["Capa de Borde y API Gateway (NestJS)"]
        GW_INGRESS["Reverse Proxy / Ingress Controller (Azure Linux)"]
        SEC_GUARDS["Guards de Seguridad\n(SupabaseAuthGuard, Roles, ApiKeyGuard)"]
        TRACE_MW["TraceContextMiddleware\n(X-Correlation-Id, Idempotency-Key)"]
        VAL_PIPE["Global ValidationPipe\n(class-validator, Sanitización DTOs)"]
        
        GW_INGRESS --> TRACE_MW
        TRACE_MW --> SEC_GUARDS
        SEC_GUARDS --> VAL_PIPE
    end

    subgraph CAPA_APLICACION["Capa de Aplicación y Orquestación"]
        SAGA_ORCH["Saga Orchestrator\n(Reservas Distribuidas y Compensaciones)"]
        AGGREGATOR["Catalog & Availability Aggregator\n(Time Slots, Cupos Dinámicos)"]
        OUTBOX_SVC["Transactional Outbox Worker\n(Eventos Asíncronos At-Least-Once)"]
    end

    subgraph CAPA_DOMINIO["Capa de Dominio (Módulos DDD)"]
        DOM_ATR["AtraccionesModule\n(Turnos, Aforo, Vouchers QR)"]
        DOM_AUT["AutosModule\n(Flota, Cooldown 2h, Días Dinámicos)"]
        DOM_ALO["AlojamientosModule\n(Check-in 48h, Tarifas)"]
        DOM_VUE["VuelosModule\n(Itinerarios, Pases de Abordar)"]
        DOM_CLI["ClientesModule\n(Sincronización Cross-Platform)"]
        DOM_PAG["PagosModule\n(Saga Reembolsos, Facturación)"]
    end

    subgraph CAPA_INTEGRACION["Capa de Integración y Adaptadores ACL (Anti-Corruption Layer)"]
        CB_DILAN["DilanAtraccionesAdapter\n(Circuit Breaker 5s / DTO Mapper)"]
        CB_AUTOS["AutosCircuitBreakerAdapter\n(Fallback Offline / Cache)"]
        CB_ALOJ["AlojamientosCircuitBreakerAdapter\n(Resiliencia / Graceful Degradation)"]
        HTTP_CLIENT["Axios HttpModule\n(Propagación Headers, Retries, Timeouts)"]
    end

    subgraph CAPA_INFRAESTRUCTURA["Capa de Infraestructura y Persistencia"]
        PG_DB[("Azure Database for PostgreSQL\n(Multi-Schema: atracciones, autos, alojamientos,\nvuelos, clientes, pagos, outbox)")]
        WINSTON_LOG["Winston Audit Logger\n(logs/audit.log, logs/combined.log)"]
    end

    subgraph SERVICIOS_EXTERNOS["Servicios Externos y Socios B2B"]
        SOC_GLORIA["Vívelo Ecuador (Gloria)\n[Azure Container App - ms-catalog]"]
        SOC_DILAN["Descubre EC (Dilan)\n[Azure Container App - descubre-gateway]"]
        SOC_MICHAEL["TourGirls (Michael)\n[Azure Web App - tourgirls-gateway-mm]"]
        SOC_ARIEL["EcuaTravel (Ariel)\n[Azure Web App - ecuatravel-api]"]
        SOC_ALISSON["Atracciones Ecuador (Alisson)\n[Azure Web App - alisson-api]"]
        SOC_SUPABASE["Supabase Cloud\n[OAuth2 / Auth JWT]"]
    end

    %% Relaciones entre capas
    UI_STATE -->|HTTPS / REST / JSON| GW_INGRESS
    VAL_PIPE --> SAGA_ORCH
    VAL_PIPE --> AGGREGATOR
    
    SAGA_ORCH --> DOM_ATR
    SAGA_ORCH --> DOM_AUT
    SAGA_ORCH --> DOM_ALO
    SAGA_ORCH --> DOM_VUE
    SAGA_ORCH --> DOM_CLI
    SAGA_ORCH --> DOM_PAG
    
    AGGREGATOR --> DOM_ATR
    AGGREGATOR --> DOM_AUT

    DOM_ATR --> CB_DILAN
    DOM_ATR --> HTTP_CLIENT
    DOM_AUT --> CB_AUTOS
    DOM_ALO --> CB_ALOJ
    DOM_PAG --> OUTBOX_SVC

    CB_DILAN --> HTTP_CLIENT
    CB_AUTOS --> HTTP_CLIENT
    CB_ALOJ --> HTTP_CLIENT

    DOM_ATR -->|TypeORM ORM| PG_DB
    DOM_AUT -->|TypeORM ORM| PG_DB
    DOM_ALO -->|TypeORM ORM| PG_DB
    DOM_VUE -->|TypeORM ORM| PG_DB
    DOM_CLI -->|TypeORM ORM| PG_DB
    DOM_PAG -->|TypeORM ORM| PG_DB
    OUTBOX_SVC -->|TypeORM ORM| PG_DB
    
    SAGA_ORCH -->|Auditoría Transaccional| WINSTON_LOG
    TRACE_MW -->|Registro Trazabilidad| WINSTON_LOG

    HTTP_CLIENT -->|HTTPS / REST B2B| SOC_GLORIA
    HTTP_CLIENT -->|HTTPS / REST B2B| SOC_DILAN
    HTTP_CLIENT -->|HTTPS / REST B2B| SOC_MICHAEL
    HTTP_CLIENT -->|HTTPS / REST B2B| SOC_ARIEL
    HTTP_CLIENT -->|HTTPS / REST B2B| SOC_ALISSON
    SEC_GUARDS -->|Verificación Tokens| SOC_SUPABASE
```

---

## 3. Estilos Arquitectónicos

El sistema combina de manera armónica tres estilos arquitectónicos reconocidos por la industria para resolver los retos de escalabilidad, acoplamiento y resiliencia:

### 3.1. Monolito Modular Basado en Dominio (Modular Monolith DDD)
- **Estructura Interna**: El núcleo central de la aplicación está organizado en módulos independientes guiados por el dominio (`src/modules/*`).
- **Límites Claros (Bounded Contexts)**: Cada dominio (Atracciones, Autos, Alojamientos, Vuelos, Clientes, Pagos) encapsula sus propias entidades, servicios, DTOs y reglas de negocio, prohibiendo el acoplamiento directo entre entidades de bases de datos ajenas.
- **Aislamiento en Base de Datos**: A nivel de PostgreSQL, la persistencia se segrega estrictamente en esquemas separados (`schema_atracciones`, `schema_autos`, `schema_alojamientos`, `schema_vuelos`, `schema_clientes`, `schema_pagos`).

### 3.2. Arquitectura Orientada a Servicios y Microservicios Federados (SOA / Microservices)
- **Integración B2B Externa**: Los socios de la red son microservicios completamente autónomos desplegados en diferentes suscripciones y regiones de Azure (Azure Container Apps en Brasil y Chile, Azure Web Apps en Linux).
- **Federación de Capacidades**: Booking Central actúa como el agregador y orquestador federado que unifica la experiencia de reserva sin centralizar el inventario físico de las atracciones ni la custodia de vehículos.

### 3.3. Arquitectura Basada en Eventos (Event-Driven Architecture - EDA)
- **Eventos de Negocio**: Cada cambio de estado de reserva (confirmación, compensación, cancelación o reembolso) genera un evento inmutable registrado en la tabla `schema_pagos.outbox` o `schema_atracciones.outbox`.
- **Desacoplamiento Temporal**: Las tareas de envío de comprobantes, facturación electrónica y notificaciones por correo operan de manera asíncrona, desacoplando el tiempo de respuesta del checkout web de la latencia de servicios de terceros.

### 3.4. Arquitectura Hexagonal / Puertos y Adaptadores
- El núcleo de negocio permanece limpio de detalles de infraestructura. La comunicación con APIs externas se realiza exclusivamente mediante **Puertos** (interfaces de servicio) y **Adaptadores** (clases ACL que implementan Circuit Breakers y traducción de esquemas).

---

## 4. Patrones Arquitectónicos de Integración (EIP)

El diseño del sistema implementa formalmente los patrones documentados por Gregor Hohpe en *Enterprise Integration Patterns*:

### 4.1. Saga Pattern (Orquestada)
- **Problema Resuelto**: Mantenimiento de la consistencia de datos a través de múltiples bases de datos distribuidas sin bloquear recursos con Two-Phase Commit (2PC).
- **Implementación**:
  - `AtraccionesService` y `AutosService` operan como **Saga Coordinators**.
  - En una reserva compuesta, se ejecutan las transacciones locales: 1) Verificación y descuento de cupos/stock; 2) Registro del cliente; 3) Notificación al socio B2B; 4) Registro de pago.
  - **Transacción Compensatoria**: Si el socio externo responde con error (`HTTP 409 Out of Stock` o `HTTP 503 Unavailable`), la saga activa de inmediato la compensación: revierte el stock local en PostgreSQL, cancela la reserva y emite el evento de compensación financiera (`RESERVA_COMPENSADA_STOCK_RESTITUIDO`).

### 4.2. Transactional Outbox Pattern
- **Problema Resuelto**: Dual-write problem (garantizar que la base de datos y la cola de eventos se actualicen atómicamente sin inconsistencias).
- **Implementación**:
  - Al cancelar o confirmar una reserva, el evento se guarda dentro de la **misma transacción de base de datos** en la tabla `schema_atracciones.outbox_events` con campos: `id`, `event_type`, `aggregate_id`, `payload`, `status` y `created_at`.
  - Un proceso worker en segundo plano procesa los eventos pendientes garantizando entrega *at-least-once*.

### 4.3. Anti-Corruption Layer (ACL)
- **Problema Resuelto**: Prevenir que modelos de datos y nombres de campos de sistemas externos "contaminen" el modelo de dominio interno.
- **Implementación**:
  - Clases como `DilanAtraccionesAdapter` y `AutosCircuitBreakerAdapter` traducen los DTOs de Booking (`ticketCount`, `customerName`, `adultCount`) al esquema específico del proveedor (`personas`, `cliente.documento_id`, `slot_id`).
  - Normalizan los números telefónicos al formato local estricto `09XXXXXXXX` o E.164 internacional requerido por cada proveedor.

### 4.4. Circuit Breaker Pattern
- **Problema Resuelto**: Fallos en cascada cuando un servicio externo experimenta alta latencia o indisponibilidad total.
- **Implementación**:
  - Máquina de estados finita: **CLOSED** (tráfico normal), **OPEN** (rechazo inmediato y llamada a fallback), **HALF-OPEN** (prueba controlada de recuperación).
  - Umbral de fallos: 3 errores consecutivos.
  - Tiempo de reset: 30 segundos (`RESET_TIMEOUT_MS`).
  - Timeout de petición: 5000 ms estrictos conforme a la directiva de Cátedra RDA2 CE01.

### 4.5. Idempotent Receiver
- **Problema Resuelto**: Evitar reservas duplicadas o cobros múltiples por reintentos de red o clics repetidos en el cliente.
- **Implementación**:
  - Cada solicitud de mutación (`POST /reservas`, `POST /cancel`) exige la cabecera `Idempotency-Key` (UUID v4).
  - El sistema valida si la clave ya fue procesada; si existe, retorna la respuesta cacheada previamente sin volver a descontar aforo ni invocar al socio externo.

### 4.6. Content-Based Router & Aggregator
- **Enrutamiento por Proveedor**: A partir del `proveedor_codigo` o identificador de recurso (`GLO-`, `DEC-`, `TG-`, `ECT-`, `ALI-`), el sistema despacha dinámicamente la transacción hacia la URL y credenciales del socio correspondiente.
- **Agregador de Aforos**: Al consultar disponibilidad, `getDisponibilidadAtraccion` consolida los time slots externos con la tabla local de turnos para calcular la disponibilidad neta en tiempo real.

---

## 5. Componentes Arquitectónicos

### 5.1. Módulos de Backend (NestJS)

| Módulo | Responsabilidad Principal | Esquema BD |
| :--- | :--- | :--- |
| **AtraccionesModule** | Catálogo unificado, time slots horarios, matriz de tickets por edad, vouchers QR vectoriales y coordinación B2B de atracciones. | `schema_atracciones` |
| **AutosModule** | Gestión de flotas de vehículos, validación de cooldown de 2 horas entre arriendos consecutivos, cálculo de días dinámico. | `schema_autos` |
| **AlojamientosModule** | Búsqueda de hoteles y habitaciones, control de políticas de cancelación de 48 horas, cálculo de noches y huéspedes. | `schema_alojamientos` |
| **VuelosModule** | Itinerarios aéreos, asignación de asientos, cálculo de tarifas aéreas y generación de pases de abordar. | `schema_vuelos` |
| **ClientesModule** | Registro y conciliación de clientes cross-platform (mapeo unívoco entre el turista local y sus IDs en Gloria/Dilan). | `schema_clientes` |
| **PagosModule** | Confirmación de transacciones con pasarelas de pago, procesamiento de reembolsos del 100% y emisión de facturas. | `schema_pagos` |
| **AdminModule / Health** | Monitoreo de salud de los conectores B2B, métricas de Circuit Breaker y tableros operativos. | `public` / metadata |

### 5.2. Componentes de Seguridad y Trazabilidad
- **TraceContextMiddleware**: Intercepta toda petición entrante, extrae o genera un `X-Correlation-Id` unívoco y lo asocia al contexto de ejecución asíncrono para correlacionar los logs de cliente, gateway y socio externo.
- **SupabaseAuthGuard**: Valida criptográficamente los tokens JWT emitidos por Supabase, extrayendo el rol y el identificador de usuario sin dependencias directas con el servidor de auth en cada petición.
- **WinstonLoggerService**: Registrador físico que escribe eventos de negocio auditables en archivos protegidos (`logs/audit.log`) con sello de tiempo ISO 8601, correlation ID y payload de auditoría.

### 5.3. Frontend SPA (React + Vite)
- **AtraccionDetail.jsx**: Vista de detalle con selector dinámico de fechas, turnos horarios en cuadrícula interactiva con conteo de cupos en tiempo real y selector adaptativo según tarifa única general o diferenciada por edad.
- **MisReservasPage.jsx**: Tablero de gestión de reservas con pestañas por servicio, visor de vouchers QR descargables y modal de cancelación con control estricto de plazo (bloqueo preventivo a menos de 24h para atracciones y autos, y 48h para alojamientos).

---

## 6. Vistas Arquitectónicas (Modelo C4 y 4+1)

### 6.1. Vista C4 - Nivel 1: Diagrama de Contexto
Representa a los usuarios del sistema y cómo Booking Central se comunica con el mundo exterior:

```mermaid
graph TD
    USER["Turista / Cliente Web\n(Navegador Móvil / Escritorio)"]
    ADMIN["Administrador de Operaciones\n(Panel de Gestión)"]
    
    BC["Sistema Booking Central\n(Plataforma Core de Integración)"]
    
    EXT_GLORIA["Socio B2B: Vívelo Ecuador (Gloria)\n[Sistema Externo de Atracciones]"]
    EXT_DILAN["Socio B2B: Descubre EC (Dilan)\n[Sistema Externo de Atracciones]"]
    EXT_MICHAEL["Socio B2B: TourGirls (Michael)\n[Sistema Externo de Atracciones]"]
    EXT_ARIEL["Socio B2B: EcuaTravel (Ariel)\n[Sistema Externo de Atracciones]"]
    EXT_AUTOS["Socio B2B: RutaLibre Autos (Esteban / Mateo)\n[Sistema Externo de Flota]"]
    AUTH_IDP["Proveedor de Identidad: Supabase\n[Auth / JWT / OAuth]"]

    USER -->|Navega, reserva y cancela servicios| BC
    ADMIN -->|Monitorea conectores y aforos| BC
    
    BC -->|Sincronización de cupos y reservas B2B| EXT_GLORIA
    BC -->|Sincronización de slots y órdenes B2B| EXT_DILAN
    BC -->|Consulta de disponibilidad en vivo y cancelaciones| EXT_MICHAEL
    BC -->|Catálogo y reservas| EXT_ARIEL
    BC -->|Reserva y bloqueo de vehículos| EXT_AUTOS
    BC -->|Verificación criptográfica de tokens| AUTH_IDP
```

### 6.2. Vista C4 - Nivel 2: Diagrama de Contenedores
Detalla los bloques ejecutables que componen la solución tecnológica:

```mermaid
graph LR
    subgraph CLIENTE["Navegador del Usuario"]
        SPA["Frontend SPA\n[React 18, Vite, React Router]\nPuerto: 5173 / CDN"]
    end

    subgraph CLOUD_AZURE["Nube Microsoft Azure (Región Brazil South)"]
        API_GW["Backend Core API\n[Node.js 22, NestJS, TypeScript]\nApp Service: booking-core-api"]
        DB[("Base de Datos Relacional\n[Azure Database for PostgreSQL 16]\nBase: booking_db")]
        DISK_LOGS["Almacenamiento Persistente\n[Azure App Service Storage]\nArchivos: logs/audit.log"]
    end

    subgraph EXTERNOS["Ecosistema Federado de Socios"]
        PARTNERS_ACA["Microservicios en Azure Container Apps\n(Gloria ms-catalog, Dilan descubre-gateway)"]
        PARTNERS_WA["Web Apps en Azure App Service\n(Michael tourgirls-api, Ariel ecuatravel-api)"]
    end

    SPA -->|HTTPS / REST / JSON| API_GW
    API_GW -->|TCP / SSL TypeORM (Pool conexiones)| DB
    API_GW -->|File System Streams| DISK_LOGS
    API_GW -->|HTTPS / REST B2B (X-API-Key)| PARTNERS_ACA
    API_GW -->|HTTPS / REST B2B (X-API-Key)| PARTNERS_WA
```

### 6.3. Vista 4+1 de Kruchten

| Vista | Perspectiva | Implementación en Booking Central |
| :--- | :--- | :--- |
| **Vista Lógica** | Clases, interfaces y relaciones conceptuales del dominio. | Entidades TypeORM (`Atraccion`, `ReservaAtraccion`, `TurnoAforo`, `Auto`, `ReservaAuto`), Value Objects y DTOs con decoradores de validación. |
| **Vista de Proceso** | Concurrencia, hilos, sincronización y transacciones. | Event loop no bloqueante de Node.js, bloqueos optimistas/pesimistas con PostgreSQL (`UPDATE ... SET cupos = cupos - $1`), Circuit Breaker asíncrono y tareas programadas de polling. |
| **Vista de Desarrollo** | Organización del código fuente y dependencias. | Estructura modular NestJS (`src/modules/*`, `src/core/*`, `contracts/*`), TypeScript estricto, ESLint y compilación Vite. |
| **Vista Física** | Nodos de hardware, redes y despliegue en nube. | Azure App Service Plan Linux (B1), Azure Database for PostgreSQL Flexible Server, contenedores Docker en Azure Container Apps. |
| **Vista de Escenarios** | Casos de uso críticos que validan la arquitectura. | Escenario 1: Reserva B2B exitosa con emisión de QR; Escenario 2: Compensación Saga por fallo de proveedor; Escenario 3: Intento de cancelación fuera de plazo (< 24h) y rechazo 409. |

---

## 7. Atributos de Calidad y Requerimientos No Funcionales (RNF)

### 7.1. Disponibilidad y Resiliencia (Criterio Excluyente CE01)
- **Garantía de Operatividad Continua**: Si una o todas las APIs de los compañeros externos se encuentran apagadas o inaccesibles, Booking Central **permanece 100% operativo**.
- **Degradación Elegante (Graceful Degradation)**: Al activarse el Circuit Breaker de un proveedor caído, el sistema no colapsa; ofrece respuestas de reserva locales con marca de sincronización diferida (`CANCELLED_LOCAL_REVERSED` / `PENDING_EXTERNAL_SYNC`) y continúa atendiendo reservas de los demás módulos.
- **Timeouts Controlados**: Límite estricto de 5000 ms por llamada externa para evitar que hilos bloqueados agoten el pool de conexiones del servidor.

### 7.2. Seguridad (Zero Trust y OWASP Top 10 API)
- **Autenticación y Autorización en el Borde**: Verificación obligatoria de Bearer Tokens JWT emitidos por el Identity Provider en todas las rutas protegidas.
- **Protección B2B**: Autenticación de máquina a máquina (M2M) con cabeceras `X-API-Key` y rotación de secretos en variables de entorno seguras.
- **Validación Estricta de Entradas (Injection Defense)**: Tubería global `ValidationPipe` con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true` para mitigar ataques de Mass Assignment y SQL Injection.
- **Aislamiento Multi-Tenant de Esquemas**: La base de datos no mezcla tablas en un esquema plano; cada módulo tiene permisos acotados en su esquema correspondiente.

### 7.3. Rendimiento y Escalabilidad
- **Throttling Inteligente de Sincronización**: Ventana de protección de 30 segundos (`throttle`) en `syncAllCatalogs` para prevenir ataques de denegación de servicio (DoS) por consultas concurrentes al catálogo.
- **Compresión y Minimización**: Assets del cliente empaquetados y minificados con Rolldown/Vite en chunks optimizados (< 600 kB gzip).
- **Consultas Idempotentes Indexadas**: Índices únicos compuestos en PostgreSQL sobre `(atraccion_id, fecha, hora_inicio)` para garantizar deduplicación de aforo en milisegundos.

### 7.4. Integridad Transaccional y Consistencia
- **Regla Estricta de Cancelación 24h / 48h**: Bloqueo preventivo tanto a nivel visual (frontend oculta el botón si `horasRestantes < 24`) como en el controlador backend (rechazo con `HTTP 409 CONFLICT CANCELLATION_WINDOW_CLOSED`).
- **Invariante de No-Silenciamiento (Anti-Swallow Rule)**: Prohibición absoluta de silenciar respuestas de error HTTP 409 de los socios; si un socio externo rechaza la cancelación, Booking Central preserva la consistencia y propaga el estado real al usuario.

---

## 8. Registro de Decisiones de Arquitectura (ADRs)

### ADR-001: Adopción de Monolito Modular DDD para el Núcleo Central
- **Estado**: Aceptado.
- **Contexto**: Se requería construir una plataforma que integre 4 dominios complejos con entregas semanales rápidas y consistencia transaccional.
- **Decisión**: Implementar un Monolito Modular en NestJS en lugar de múltiples repositorios de microservicios internos, pero manteniendo el aislamiento estricto de esquemas en PostgreSQL.
- **Consecuencia**: Alta velocidad de desarrollo, despliegue unificado en Azure App Service, costo de infraestructura reducido y preparación natural para extraer módulos a microservicios independientes mediante contratos OpenAPI.

### ADR-002: Orquestación de Sagas para Transacciones Distribuidas
- **Estado**: Aceptado.
- **Contexto**: Las reservas y cancelaciones involucran a múltiples plataformas externas donde Two-Phase Commit (2PC) es inviable debido a la autonomía de los socios.
- **Decisión**: Utilizar Sagas Orquestadas donde Booking Central actúa como orquestador central que ejecuta pasos secuenciales y transacciones compensatorias.
- **Consecuencia**: Consistencia eventual garantizada, trazabilidad completa de compensaciones y ausencia de bloqueos pesimistas en bases de datos externas.

### ADR-003: Implementación de Transactional Outbox Pattern
- **Estado**: Aceptado.
- **Contexto**: El envío de correos y la comunicación de eventos de pago no deben depender de la disponibilidad inmediata de agentes de mensajería externos durante el checkout.
- **Decisión**: Guardar los eventos en la tabla `outbox` en la misma transacción de la reserva y procesarlos de forma asíncrona.
- **Consecuencia**: Cero pérdida de eventos ante caídas temporales del servidor y experiencia de usuario fluida sin tiempos de espera innecesarios.

### ADR-004: Anti-Corruption Layer (ACL) y Circuit Breakers en Adaptadores B2B
- **Estado**: Aceptado.
- **Contexto**: Los socios utilizan esquemas heterogéneos, formatos diversos de fechas y horas, y pueden experimentar caídas o latencias altas.
- **Decisión**: Encapsular cada socio en un adaptador ACL con Circuit Breaker integrado (timeout 5s, umbral de 3 fallos).
- **Consecuencia**: Protección del dominio interno frente a esquemas externos y aislamiento de fallas para cumplir el criterio de disponibilidad continua CE01.

### ADR-005: Enfoque Contract-Driven con OpenAPI y JSON Schema
- **Estado**: Aceptado.
- **Contexto**: La colaboración B2B entre equipos de estudiantes requiere contratos claros para evitar malentendidos sobre tipos y nombres de campos.
- **Decisión**: Publicar contratos formales OpenAPI v2 y v3 documentados con Swagger y validación estricta de payloads.
- **Consecuencia**: Compatibilidad garantizada, generación de pruebas de contrato automatizadas y reducción a cero de discrepancias de integración.

### ADR-006: Invariante Transaccional de Cancelación y Propagación 409
- **Estado**: Aceptado.
- **Contexto**: Cancelaciones realizadas a menos de 24 horas generaban divergencias donde Booking mostraba "Cancelada" mientras el socio la mantenía "Confirmada".
- **Decisión**: Ocultar el botón de cancelación en frontend a menos de 24h, validar en backend con `HTTP 409` y exigir confirmación exitosa del socio antes de mutar la base de datos local.
- **Consecuencia**: Sincronización perfecta entre Booking Central y los paneles de los socios comerciales.

---

## 9. Guía de Despliegue y Ejecución Local

### Prerrequisitos
- Node.js versión 20 o 22 LTS.
- Docker y Docker Compose (para base de datos PostgreSQL local).
- Azure CLI (`az`) autenticada (para despliegue en nube).

### Ejecución en Entorno Local
1. **Instalar dependencias**:
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```
2. **Levantar base de datos PostgreSQL con Docker**:
   ```bash
   docker-compose up -d
   ```
3. **Iniciar backend en modo desarrollo**:
   ```bash
   npm run start:dev
   ```
   *Documentación Swagger interactiva*: `http://localhost:3000/api/docs`
4. **Iniciar frontend SPA**:
   ```bash
   cd frontend
   npm run dev
   ```
   *Aplicación web*: `http://localhost:5173`

### Despliegue Oficial en Producción (Azure)
El proyecto cuenta con empaquetado optimizado POSIX y despliegue directo en Azure App Service:
```bash
npm run deploy:azure
```
- **URL de Producción**: `https://booking-core-api.azurewebsites.net`
- **Ambiente de Base de Datos**: Azure Database for PostgreSQL Flexible Server en `booking-db.postgres.database.azure.com`.
