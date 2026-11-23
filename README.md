# Booking Central - Plataforma de Integración Turística B2B

> **Proyecto de Integración de Sistemas (RDA2)**  
> Plataforma de comercio electrónico y orquestación distribuida para la reserva federada de servicios turísticos: **Atracciones, Autos, Alojamientos y Vuelos**.

---

## Tabla de Contenidos
1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Diagrama de la Arquitectura por Capas (RDA2 Producción)](#2-diagrama-de-la-arquitectura-por-capas-rda2-producción)
   - 2.1. [Conectividad y Flujo de Comunicación por Cada Capa](#21-conectividad-y-flujo-de-comunicación-por-cada-capa)
   - 2.2. [Clasificación Exhaustiva: Microservicios en ESB, Event Bus, RabbitMQ, Kafka y Service Mesh](#22-clasificación-exhaustiva-qué-microservicios-van-al-esb-event-bus-rabbitmq-kafka-y-service-mesh)
   - 2.3. [Mapeo Físico Exhaustivo de Archivos de la Arquitectura en `src/`](#23-mapeo-físico-exhaustivo-de-archivos-de-la-arquitectura-en-src)
   - 2.4. [Guía Práctica: Cómo Visualizar y Demostrar el ESB, Event Bus, RabbitMQ y Service Mesh](#24-guía-práctica-cómo-visualizar-y-demostrar-el-esb-event-bus-rabbitmq-y-service-mesh)
3. [Estilos Arquitectónicos](#3-estilos-arquitectónicos)
4. [Patrones Arquitectónicos de Integración (EIP)](#4-patrones-arquitectónicos-de-integración-eip)
5. [Componentes Arquitectónicos](#5-componentes-arquitectónicos)
6. [Vistas Arquitectónicas (Modelo C4 y 4+1)](#6-vistas-arquitectónicas-modelo-c4-y-41)
7. [Atributos de Calidad y Requerimientos No Funcionales (RNF)](#7-atributos-de-calidad-y-requerimientos-no-funcionales-rnf)
8. [Registro de Decisiones de Arquitectura (ADRs)](#8-registro-de-decisiones-de-arquitectura-adrs)
9. [Guía de Despliegue y Ejecución Local](#9-guía-de-despliegue-y-ejecución-local)
10. [Arquitectura Híbrida RDA3 y Marketplace Móvil Flutter](#10-arquitectura-híbrida-rda3-y-marketplace-móvil-flutter)
    - 10.1. [Segregación Arquitectónica: Web Administrativa vs Marketplace Móvil](#101-segregación-arquitectónica-web-administrativa-vs-marketplace-móvil)
    - 10.2. [Estructura del Proyecto Flutter (`booking_flutter/`)](#102-estructura-del-proyecto-flutter-booking_flutter)
    - 10.3. [Cobertura de las 4 Verticales y Reglas de Negocio en Móvil](#103-cobertura-de-las-4-verticales-y-reglas-de-negocio-en-móvil)
    - 10.4. [Guía de Compilación y Generación de APK Móvil](#104-guía-de-compilación-y-generación-de-apk-móvil)
    - 10.5. [Gobernanza de Socios B2B y Guía de Migración Multi-Framework](#105-gobernanza-de-socios-b2b-y-guía-de-migración-multi-framework)

---

## 1. Visión General del Sistema

**Booking Central** es un ecosistema distribuido federado diseñado bajo los principios de **Domain-Driven Design (DDD)** y arquitectura de **Integración Empresarial (EAI / B2B)**. Opera como un concentrador de servicios que conecta a usuarios finales (turistas) con plataformas externas e independientes desarrolladas por socios comerciales:

- **Atracciones**: Integración B2B con *Descubre EC* (Dilan), *Vívelo Ecuador* (Gloria), *TourGirls* (Michael), *EcuaTravel* (Ariel) y *Atracciones Ecuador* (Alisson).
- **Autos**: Integración con flotas federadas (*RutaLibre Autos*, *AutoSpot*, *DriveEC*).
- **Alojamientos**: Integración con cadenas hoteleras y motores de reserva asociados.
- **Vuelos**: Integración de itinerarios aéreos nacionales e internacionales con emisión de pases de abordar.

El núcleo central proporciona agregación de catálogos en tiempo real, orquestación de transacciones distribuidas (Sagas), tolerancia a fallos mediante Circuit Breakers, trazabilidad transversal distribuida y gobernanza de contratos OpenAPI v2 y v3.

---

## 2. Diagrama de la Arquitectura por Capas (RDA2 Producción)

El siguiente diagrama formaliza la arquitectura distribuida del ecosistema **Booking Central (RDA2)** bajo el principio de 7 capas desacopladas, persistencia independiente (*Database-per-Service* en 12 esquemas herméticos), Enterprise Service Bus (ESB) centralizado de dos capas, doble broker de eventos (RabbitMQ + Apache Kafka) y observabilidad física rotativa:

```mermaid
graph LR
    %% =========================================================================
    %% CAPA 1: PERSISTENCIA INDEPENDIENTE POSTGRESQL / SUPABASE (12 ESQUEMAS)
    %% =========================================================================
    subgraph CAPA1 ["CAPA 1: PERSISTENCIA INDEPENDIENTE POSTGRESQL (12 ESQUEMAS)"]
        subgraph SCH_CLI ["schema_clientes"]
            T_CLI[("clientes / identidades")]
        end

        subgraph SCH_CAR ["schema_carritos"]
            T_CAR[("carritos")]
            T_CIT[("carrito_items")]
        end

        subgraph SCH_FAC ["schema_facturacion"]
            T_FEN[("facturas_encabezado")]
            T_FDE[("facturas_detalle")]
        end

        subgraph SCH_PAG ["schema_pagos"]
            T_PAG[("transacciones_pago")]
        end

        subgraph SCH_PKG ["schema_paquetes"]
            T_PKG[("paquetes")]
            T_PIT[("paquete_items")]
            T_CPR[("contrato_promociones")]
        end

        subgraph SCH_FIN ["schema_finanzas"]
            T_FIN[("liquidaciones_proveedores")]
        end

        subgraph SCH_PROV ["schema_proveedores"]
            T_PROV[("config_proveedor / nodos")]
        end

        subgraph SCH_ATR ["schema_atracciones"]
            T_ATR_C[("atracciones_cache")]
            T_ATR_R[("categorias_recursivas")]
            T_ATR_O[("reservas_atraccion")]
            T_ATR_S[("resenas_atraccion")]
        end

        subgraph SCH_AUT ["schema_autos"]
            T_AUT_C[("autos_cache")]
            T_AUT_O[("reservas_auto")]
            T_AUT_M[("mantenimiento_autos")]
        end

        subgraph SCH_ALO ["schema_alojamientos"]
            T_ALO_C[("alojamientos_cache")]
            T_ALO_H[("tipos_habitacion")]
            T_ALO_O[("reservas_alojamiento")]
            T_ALO_U[("huespedes_reserva")]
        end

        subgraph SCH_VUE ["schema_vuelos"]
            T_VUE_C[("vuelos_cache")]
            T_VUE_O[("reservas_vuelo")]
            T_VUE_A[("asientos_vuelo")]
            T_VUE_P[("pases_abordar")]
        end

        subgraph SCH_AUD ["schema_auditoria"]
            T_AUD_TRX[("auditoria_transacciones")]
            T_AUD_ADM[("auditoria_administrativa")]
            T_AUD_SAG[("auditoria_sagas")]
        end
    end

    %% =========================================================================
    %% CAPA 2: MICROSERVICIOS BÁSICOS (12 REST TYPEORM + 1 gRPC EN PUERTO 50051)
    %% =========================================================================
    subgraph CAPA2 ["CAPA 2: MICROSERVICIOS BÁSICOS (12 REST + 1 gRPC 50051)"]
        MS_CLI["MS Clientes y Auth\n(REST / TypeORM)"]
        MS_CAR["MS Carrito y Checkout\n(REST / TypeORM)"]
        MS_FAC["MS Facturación\n(REST / TypeORM / Idempotency)"]
        MS_PAG["MS Simulación Pagos\n(REST / TypeORM / Idempotency)"]
        MS_PKG["MS Paquetes Dinámicos\n(REST / TypeORM)"]
        MS_FIN["MS Finanzas y Liquidaciones\n(REST / TypeORM)"]
        MS_PROV["MS Proveedores y Salud Nodos\n(REST / TypeORM / Kill-Switches)"]
        MS_AUD["MS Auditoría Transaccional\n(REST / TypeORM / SQL)"]

        MS_ATR["MS Atracciones\n(REST / TypeORM / Árbol Recursivo)"]
        MS_AUT["MS Autos y Flota\n(REST / TypeORM / Cooldown 2h)"]
        MS_ALO["MS Alojamientos\n(REST / TypeORM / Check-in 48h)"]
        MS_VUE["MS Vuelos\n(REST / TypeORM / PNR y Pases)"]
        MS_STK["MS Ingesta Stock\n(gRPC Inbound TCP 50051 / Redis)"]
    end

    %% Enlaces Capa 1 a Capa 2
    T_CLI -.-> MS_CLI
    T_CAR -.-> MS_CAR
    T_CIT -.-> MS_CAR
    T_FEN -.-> MS_FAC
    T_FDE -.-> MS_FAC
    T_PAG -.-> MS_PAG
    T_PKG -.-> MS_PKG
    T_PIT -.-> MS_PKG
    T_CPR -.-> MS_PKG
    T_FIN -.-> MS_FIN
    T_PROV -.-> MS_PROV

    T_ATR_C -.-> MS_ATR
    T_ATR_R -.-> MS_ATR
    T_ATR_O -.-> MS_ATR
    T_ATR_S -.-> MS_ATR

    T_AUT_C -.-> MS_AUT
    T_AUT_O -.-> MS_AUT
    T_AUT_M -.-> MS_AUT

    T_ALO_C -.-> MS_ALO
    T_ALO_H -.-> MS_ALO
    T_ALO_O -.-> MS_ALO
    T_ALO_U -.-> MS_ALO

    T_VUE_C -.-> MS_VUE
    T_VUE_O -.-> MS_VUE
    T_VUE_A -.-> MS_VUE
    T_VUE_P -.-> MS_VUE

    T_AUD_TRX -.-> MS_AUD
    T_AUD_ADM -.-> MS_AUD
    T_AUD_SAG -.-> MS_AUD

    %% =========================================================================
    %% CAPA 3: ESB CENTRALIZADO DE DOS CAPAS (ENTERPRISE SERVICE BUS)
    %% =========================================================================
    subgraph CAPA3 ["CAPA 3: ESB CENTRALIZADO DE DOS CAPAS"]
        subgraph ESB_INT ["ESB Capa Interna: Servicios Propios"]
            ESB_ROUTER["Enrutador de Negocio y Sustituto de SQL Joins"]
            ESB_SAGA["Orquestador Saga Compra y Compensación LIFO"]
            ESB_POLICIES["Validación de Reglas de Negocio Internas"]
        end

        subgraph ESB_EXT ["ESB Capa de Integración Externa: Socios B2B"]
            ESB_ACL["Capa Anti-Corrupción (ACL) y Normalización DTO"]
            ESB_CB["Circuit Breakers (Timeout 5s / Fallbacks)"]
            ESB_KILL["Kill-Switches de Aislamiento de Socios"]
        end
    end

    %% =========================================================================
    %% SERVICE MESH Y COMUNICACIÓN INTER-SERVICIO (ESTE-OESTE)
    %% =========================================================================
    subgraph SERVICE_MESH ["SERVICE MESH (GOBERNANZA ESTE-OESTE)"]
        SM_INTERCEPTOR["Sidecar Proxy Interceptor\n(sidecar-proxy.interceptor.ts)"]
        SM_TELEMETRY["Métricas Latencia y Tracing X-Correlation-Id"]
        SM_RATE_LIMIT["Rate Limiting Interno y Protección de Malla"]
        SM_INTERCEPTOR --- SM_TELEMETRY
        SM_TELEMETRY --- SM_RATE_LIMIT
    end

    %% Enlaces Capa 2 a Capa 3
    MS_CLI <--> ESB_ROUTER
    MS_CAR <--> ESB_ROUTER
    MS_FAC <--> ESB_ROUTER
    MS_PAG <--> ESB_ROUTER
    MS_PKG <--> ESB_ROUTER
    MS_FIN <--> ESB_ROUTER
    MS_PROV <--> ESB_ROUTER
    MS_AUD <--> ESB_ROUTER

    MS_ATR <--> ESB_ACL
    MS_AUT <--> ESB_ACL
    MS_ALO <--> ESB_ACL
    MS_VUE <--> ESB_ACL
    MS_STK -->|Stream de Stock Recibido| ESB_ACL

    ESB_ROUTER <--> ESB_SAGA
    ESB_ROUTER <--> ESB_ACL
    ESB_ACL --- ESB_CB
    ESB_CB --- ESB_KILL

    ESB_ROUTER -.->|Intercepción Tráfico Este-Oeste| SM_INTERCEPTOR
    ESB_ACL -.->|Telemetría y Tracing| SM_INTERCEPTOR

    %% =========================================================================
    %% SOCIOS EXTERNOS (COMPAÑEROS B2B)
    %% =========================================================================
    subgraph SOCIOS ["SOCIOS EXTERNOS (COMPAÑEROS B2B RDA2)"]
        EXT_GLORIA["Vívelo Ecuador (Gloria)\n[Azure Container App - ms-catalog]"]
        EXT_DILAN["Descubre EC (Dilan)\n[Azure Container App - descubre-gateway]"]
        EXT_MICHAEL["TourGirls (Michael)\n[Azure Web App - tourgirls-gateway]"]
        EXT_ARIEL["EcuaTravel (Ariel)\n[Azure Web App - ecuatravel-api]"]
        EXT_ALISSON["Atracciones EC (Alisson)\n[Azure Web App - alisson-api]"]
        EXT_AUTOS["RutaLibre Autos (Esteban/Mateo)\n[APIs REST Flota]"]
        EXT_ALOJ["Motores de Alojamiento\n[APIs REST Hoteles]"]
        EXT_VUELOS["Aerolíneas Aliadas\n[APIs REST Vuelos]"]
        EXT_GRPC["Push de Stock en Vivo Socios\n(gRPC Client Streaming)"]
    end

    ESB_ACL <-->|REST B2B: Disponibilidad / Reserva / Cancelación| EXT_GLORIA
    ESB_ACL <-->|REST B2B: Slots / Órdenes / Cancelación| EXT_DILAN
    ESB_ACL <-->|REST B2B: Time Slots / Sincronización Estado| EXT_MICHAEL
    ESB_ACL <-->|REST B2B: Catálogos y Reservas| EXT_ARIEL
    ESB_ACL <-->|REST B2B: Integración Atracciones| EXT_ALISSON
    ESB_ACL <-->|REST B2B: Reserva Vehículos y Cooldown| EXT_AUTOS
    ESB_ACL <-->|REST B2B: Check-in y Habitaciones| EXT_ALOJ
    ESB_ACL <-->|REST B2B: Itinerarios y Pases| EXT_VUELOS
    EXT_GRPC ==>|Inbound TCP Puerto 50051| MS_STK

    %% =========================================================================
    %% CAPA 4: EVENT BUS Y STREAMING (RABBITMQ + APACHE KAFKA DUAL BROKER)
    %% =========================================================================
    subgraph CAPA4 ["CAPA 4: EVENT BUS Y STREAMING DUAL (RABBITMQ + APACHE KAFKA)"]
        subgraph BROKER_RABBIT ["Broker Transaccional: RabbitMQ (AMQP 0-9-1)"]
            RB_EX["Exchange: booking.events (Topic)"]
            Q_SEARCH["Cola: q.busquedas.masivas (Dampening)"]
            Q_BUY["Cola: q.ordenes.confirmadas (Compras y Facturación)"]
            Q_SAGA["Cola: q.sagas.compensacion (Rollbacks LIFO)"]
            Q_STOCK["Cola: q.stock.actualizado (Alta Prioridad RAM)"]
            Q_DLQ["Cola: q.dead_letter (DLQ tras 3 reintentos)"]
        end

        subgraph BROKER_KAFKA ["Event Streaming Commit Log: Apache Kafka Cluster"]
            KF_BRIDGE["Cross-Broker Bridge: Conector RabbitMQ-Kafka"]
            TOPIC_CAT["Tópico: booking.catalogo.stream (Por Vertical)"]
            TOPIC_AUD["Tópico: booking.compras.audit (Por Cliente)"]
            TOPIC_TEL["Tópico: booking.telemetria.nodes (Salud y Latencia)"]
        end
    end

    ESB_ROUTER -->|Publica eventos negocio| RB_EX
    ESB_SAGA -->|Emite orden confirmada o fallo| RB_EX
    MS_STK -->|Emite stock.actualizado directo| RB_EX

    RB_EX --> Q_SEARCH
    RB_EX --> Q_BUY
    RB_EX --> Q_SAGA
    RB_EX --> Q_STOCK
    RB_EX --> Q_DLQ

    RB_EX -.->|Event Sourcing Replay| KF_BRIDGE
    KF_BRIDGE --> TOPIC_CAT
    KF_BRIDGE --> TOPIC_AUD
    KF_BRIDGE --> TOPIC_TEL

    %% =========================================================================
    %% CAPA 5: MICROSERVICIOS ORQUESTADOS (LÓGICA COMPUESTA & SEGURIDAD)
    %% =========================================================================
    subgraph CAPA5 ["CAPA 5: MICROSERVICIOS ORQUESTADOS"]
        ORQ_FAC["ORQ_FAC: Facturación Compuesta (Factura + Cliente + Detalle + IVA 15%)"]
        ORQ_PKG["ORQ_PKG: Motor Paquetes Dinámicos (Validación Combo y Descuentos)"]
        ORQ_STK["ORQ_STK: Orquestador Stock (Consolidación Stock gRPC + Catálogo)"]
        ORQ_RES["ORQ_RES: Orquestador Reservas (Checkout Multivertical y Sagas)"]
        SEC_AUTH["Seguridad Transversal: JWT Guard + RBAC (CLIENTE, ADMIN, MANTENIMIENTO)"]
    end

    ESB_ROUTER --> ORQ_FAC
    ESB_ROUTER --> ORQ_PKG
    ESB_SAGA <--> ORQ_RES
    Q_STOCK --> ORQ_STK
    Q_BUY --> ORQ_FAC
    Q_BUY --> MS_FIN
    Q_SAGA --> ORQ_RES

    TOPIC_AUD -.->|Stream Audit Inmutable| MS_AUD
    TOPIC_TEL -.->|Stream Telemetría| MS_PROV

    ORQ_FAC --- SEC_AUTH
    ORQ_PKG --- SEC_AUTH
    ORQ_STK --- SEC_AUTH
    ORQ_RES --- SEC_AUTH

    %% =========================================================================
    %% CAPA 6: API GATEWAY Y BFF UNIFICADO (GRAPHQL / REVERSE PROXY)
    %% =========================================================================
    subgraph CAPA6 ["CAPA 6: API GATEWAY Y BFF UNIFICADO (GRAPHQL / REVERSE PROXY)"]
        GW_SEC["Gateway Security: JWT Guards + Rate Limiter + Depth Limiting"]
        GQL_SRV["Apollo Server NestJS: Single Entry Point /graphql y /api/v1/*"]
        GQL_LOAD["DataLoaders: Resolución Batch (Anti-N+1 Problem)"]
        GQL_WS["Suscripciones WebSocket (ws://) para Alertas en Vivo"]
        subgraph GQL_OPS ["Operaciones GraphQL Schema"]
            GQL_Q["Queries: catalogoUnificado, misReservas, facturaCompleta, saludNodos, auditoriaTransacciones"]
            GQL_M["Mutations: checkoutOrquestado, cancelarReservaSaga, checkInDigital"]
            GQL_S["Subscriptions: stockActualizado, estadoReservaCambiado"]
        end
    end

    ORQ_FAC --> GQL_SRV
    ORQ_PKG --> GQL_SRV
    ORQ_STK --> GQL_SRV
    ORQ_RES --> GQL_SRV
    MS_AUD --> GQL_SRV
    GW_SEC --- GQL_SRV
    GQL_SRV --- GQL_LOAD
    GQL_SRV --- GQL_WS
    GQL_SRV --> GQL_OPS

    %% =========================================================================
    %% CAPA 7: PRESENTACIÓN (MARKETPLACE REACT 18 & 8 PANELES ADMIN & MÓVIL)
    %% =========================================================================
    subgraph CAPA7 ["CAPA 7: PRESENTACIÓN (REACT 18 SPA + APP MÓVIL)"]
        subgraph UI_CLIENT ["Cliente Web Marketplace Turístico & App Móvil"]
            UI_CAT["Catálogo Unificado y Búsqueda Masiva Multivertical"]
            UI_CART["Carrito de Compras y Checkout Unificado"]
            UI_BOOK["Mis Reservas y Check-in Digital (QR / Llave / PNR)"]
            UI_MOB["App Móvil: Flutter / React Native (Reto 3)"]
        end

        subgraph UI_ADMIN ["8 Paneles Administrativos Especializados"]
            ADM_NOD["1. Monitor Nodos y Kill-Switches (Grafo Semáforo 🟢/🔴)"]
            ADM_AUT["2. Gestión Flota Autos (Cooldown Cronometrado 2h y Taller)"]
            ADM_ATR["3. Árbol Categorías Atracciones (Comida, Guía, Transporte)"]
            ADM_FIN["4. Liquidaciones Finanzas (Cálculo 10% Comisión y Pagos)"]
            ADM_FAC["5. Consola Fiscal Facturación (Desglose IVA 15% y Auditoría)"]
            ADM_PAG["6. Simulador Transaccional Pagos (Inyección de Fallos SOA)"]
            ADM_STK["7. Monitor Ingesta Stock gRPC (Throughput msg/seg y Sync)"]
            ADM_AUD["8. Consola Auditoría Transaccional y Sagas (Quién compró / Quién administró)"]
        end
    end

    GQL_SRV ==>|Single Endpoint HTTP POST /graphql & REST /api/v1| UI_CLIENT
    GQL_WS ==>|Suscripciones WebSockets ws://| UI_CLIENT
    GQL_SRV -.->|Consultas y Mutaciones Administrativas| UI_ADMIN
    UI_ADMIN -.->|Comandos Directos de Kill-Switch| ESB_KILL

    %% =========================================================================
    %% SISTEMA DE ARCHIVOS FÍSICOS WINSTON (LOGS TÉCNICOS ROTATIVOS)
    %% =========================================================================
    subgraph LOGS ["TELEMETRÍA Y LOGS TÉCNICOS FÍSICOS (WINSTON - CERO LOGS RED EN BD)"]
        LOG_COMB[("logs/combined.log: Trazas Generales de Red")]
        LOG_ERR[("logs/error.log: Excepciones y Circuit Breakers")]
        LOG_AUD[("logs/audit.log: Trazabilidad Técnica y Handshakes")]
    end

    CAPA2 -.->|Winston Physical Logger| LOGS
    CAPA3 -.->|Winston Physical Logger| LOGS
    CAPA5 -.->|Winston Physical Logger| LOGS
    CAPA6 -.->|Winston Physical Logger| LOGS
    SERVICE_MESH -.->|Winston Physical Logger| LOGS
```

---

### 2.1. Conectividad y Flujo de Comunicación por Cada Capa

Para defender con solidez técnica la arquitectura ante el evaluador o docente, a continuación se desglosa con exactitud qué se conecta a cada capa, distinguiendo el tráfico **Norte-Sur** (cliente hacia infraestructura) del tráfico **Este-Oeste** (comunicación inter-servicio y socios B2B):

#### Capa 1: Persistencia Independiente (Multi-Esquema en PostgreSQL / Supabase)
- **Principio Fundamental**: *Database-per-Service*. Cada dominio posee su propio esquema relacional hermético. **No existen Foreign Keys ni SQL `JOINs` entre tablas de distintos esquemas**.
- **¿Qué se conecta aquí?**: Se conecta **únicamente la Capa 2 (Microservicios Básicos)** a través de conexiones TypeORM aisladas por esquema. Ningún componente externo, ni el API Gateway, ni el ESB tocan las tablas directamente.

#### Capa 2: Microservicios Básicos y gRPC
- **Conexión Inferior (Sur)**: Lee y persiste entidades atómicas en su respectivo esquema de la Capa 1.
- **Conexión Superior (Norte)**: Se expone hacia la Capa 3 (ESB) mediante servicios e interfaces locales en memoria/REST.
- **Punto de Llegada gRPC Inbound (Puerto 50051)**: El microservicio **MS Ingesta Stock** (`InventoryGrpcController`) levanta un servidor binario sobre HTTP/2 en el puerto TCP `50051` (`src/contracts/inventory.proto`). Aquí se conectan los socios externos para hacer push de inventario en tiempo real sin saturar HTTP/1.1.

#### Capa 3: Enterprise Service Bus (ESB Centralizado de Dos Capas)
El ESB es el núcleo inteligente que sustituye los SQL `JOINs` en memoria de aplicación y gobierna las reglas de negocio distribuidas:
1. **ESB Capa Interna (`esb-internal-router.service.ts`)**:
   - Conecta los microservicios propietarios (Clientes, Carrito, Facturación, Pagos, Paquetes).
   - Ensambla en memoria datos de múltiples esquemas (ej. combina una Factura con los datos del Cliente y el detalle de ítems sin hacer `JOIN` relacional).
   - Gobierna la máquina de estados de las Sagas (`saga-orchestrator.service.ts`).
2. **ESB Capa de Integración Externa / ACL (`src/modules/*/acl/`)**:
   - **¿A dónde llegan y salen los microservicios de los compañeros?**: **Llegan y salen por esta capa.** Las peticiones de sincronización de catálogo, consulta de slots en vivo (`GET /disponibilidad`), creación de reservas (`POST /reservas`) y cancelaciones (`POST /reservas/:id/cancel`) se canalizan a través de los adaptadores ACL (`DilanAtraccionesAdapter`, `AutosCircuitBreakerAdapter`, `AlojamientosCircuitBreakerAdapter`).
   - Cada adaptador traduce los DTOs heterogéneos de los socios (Gloria, Dilan, Michael, Ariel, Alisson, Autos, Alojamientos) al modelo canónico de Booking Central.
   - Aplica los **Circuit Breakers** (timeout estricto de 5000 ms, umbral de 3 fallos y tiempo de recuperación de 30s) y conmuta los **Kill-Switches** cuando un socio está en mantenimiento.

#### ¿Dónde se ubica el Service Mesh y qué diferencia tiene con el ESB y el Event Bus?
- **Ubicación**: El **Service Mesh** opera de manera transversal entre la Capa 3 (ESB) y la Capa 5/6, gobernando el **tráfico Este-Oeste** (comunicación interna inter-servicio).
- **Componente Físico**: Se implementa en `src/modules/service-mesh/` mediante el interceptor `sidecar-proxy.interceptor.ts`.
- **Diferenciación Clave para Defensa**:
  * **ESB (Capa 3 - Nivel de Negocio y Datos)**: Es un orquestador semántico. Entiende qué es una "Factura", qué es una "Reserva", une datos de distintos esquemas y ejecuta compensaciones de negocio (Sagas).
  * **Service Mesh (Capa 3/Transporte - Nivel de Red y Telemetría)**: Es agnóstico al negocio. No sabe qué es una reserva; solo inspecciona paquetes de red, inyecta y propaga cabeceras de trazabilidad (`X-Correlation-Id`, `X-Trace-Id`), aplica *Rate Limiting* entre servicios y monitorea latencias de red en milisegundos.
  * **Event Bus (Capa 4 - Nivel Asíncrono)**: Es el broker de mensajería desacoplada para operaciones no bloqueantes, streaming masivo y absorción de picos de carga.

#### Capa 4: Event Bus y Streaming Dual (RabbitMQ + Apache Kafka)
- **RabbitMQ (AMQP 0-9-1)**: Recibe del ESB eventos transaccionales de alta prioridad (`ordenes.confirmadas`, `sagas.compensacion`, `stock.actualizado`). Usa un Exchange Topic (`booking.events`) y enruta a colas dedicadas y a la Dead Letter Queue (`q.dead_letter`).
- **Apache Kafka**: Actúa como un commit log inmutable particionado por clave (`booking.catalogo.stream`, `booking.compras.audit`). Almacena el historial analítico para *Event Sourcing*.
- **Kafka-Rabbit Bridge (`kafka-rabbit-bridge.service.ts`)**: Espejea eventos críticos entre RabbitMQ y Kafka sin perder el Correlation ID.

#### Capa 5: Microservicios Orquestados
- Consume los eventos de RabbitMQ y los flujos del ESB para generar transacciones compuestas:
  * **Facturación Compuesta**: Calcula subtotal, IVA 15% ecuatoriano, y emite comprobante.
  * **Motor de Paquetes Dinámicos**: Valida descuentos por combo multivertical (Hotel + Auto + Tour).
  * **Orquestador de Reservas**: Coordina la reserva multivertical aplicando el patrón Saga.
  * **Seguridad Transversal**: Aplica `SupabaseAuthGuard` y `RolesGuard` (RBAC para CLIENTE, ADMIN, MANTENIMIENTO).

#### Capa 6: API Gateway & BFF Unificado (GraphQL & REST)
- **Punto de Entrada Único Norte-Sur**: Expone `/graphql` y `/api/v1/*` hacia los clientes web y móviles.
- **Optimizaciones BFF**:
  * Implementa **DataLoaders** (`reservas.dataloader.ts`) para erradicar el problema N+1 en GraphQL.
  * Expone suscripciones WebSocket (`ws://`) para actualizaciones de inventario y aforos en tiempo real sin requerir polling constante.
  * Control de profundidad de consultas (*Depth Limiting*) y sanitización de payloads contra inyección.

#### Capa 7: Presentación (Frontend SPA React 18 + Vite)
- **Clientes Finales**: Aplicación Web React 18 con catálogo unificado, selector dinámico de turnos/cupos, checkout centralizado y módulo "Mis Reservas" con emisión de vouchers QR y control de cancelación (24h/48h).
- **8 Paneles de Administración**: Permite auditar en tiempo real el estado de los nodos con semáforo 🟢/🔴, activar kill-switches, supervisar colas de RabbitMQ, consultar liquidaciones financieras y revisar el árbol jerárquico de categorías.

#### Sistema de Logs Físicos Winston (Cero Logs de Red en BD)
- Siguiendo la regla docente de rendimiento: **ninguna traza de red, ping o error HTTP se guarda en la base de datos PostgreSQL**.
- Se escriben mediante `WinstonLoggerService` en archivos planos rotativos:
  * `logs/combined.log`: Registro general de peticiones HTTP con correlation ID.
  * `logs/error.log`: Excepciones, timeouts y eventos de apertura de Circuit Breakers.
  * `logs/audit.log`: Trazabilidad técnica inmutable de transacciones y handshakes.
  * Los eventos de negocio auditables para usuarios y administradores se registran separadamente en `schema_auditoria`.

---

### 2.2. Clasificación Exhaustiva: ¿Qué Microservicios van al ESB, Event Bus, RabbitMQ, Kafka y Service Mesh?

Para una comprensión técnica transparente y una defensa impecable del sistema, a continuación se clasifica formalmente a qué componente de integración pertenece y se conecta cada microservicio:

```
+-------------------------------------------------------------------------------------------------------------+
|                                    DISTRIBUCIÓN DE MICROSERVICIOS POR CAPA                                  |
+-----------------------------------+------------------------------------+------------------------------------+
|  ENTERPRISE SERVICE BUS (ESB)     |  EVENT BUS & STREAMING DUAL        |  SERVICE MESH (ESTE-OESTE)         |
|  (Orquestación Síncrona & Sagas)  |  (Asincronía, Picos & Event Log)   |  (Telemetría, Red & mTLS)          |
+-----------------------------------+------------------------------------+------------------------------------+
| Capa Interna (Reemplazo Joins):   | Broker RabbitMQ (Topic Exchange):  | Nodos Registrados en Malla:        |
| - MS_CLI (Clientes y Auth)        | - MS Catálogo (q.busquedas.masivas)| - MS_CORE (BFF / Ingress Point)    |
| - MS_CAR (Carrito y Checkout)     | - MS_FAC (q.ordenes.confirmadas)   | - MS_ESB (Orquestador Sagas)       |
| - MS_FAC (Facturación Fiscal)     | - MS_FIN (q.ordenes.confirmadas)   | - MS_PAG (Pagos & Reembolsos)      |
| - MS_PAG (Simulación de Pagos)    | - MS_PAG (q.pagos.procesados)      | - MS_STK (Inventario gRPC :50051)  |
| - MS_PKG (Paquetes Dinámicos)     | - Saga Orchestrator (q.sagas)      | - MS_FAC (Facturación Fiscal)      |
| - MS_FIN (Finanzas/Liquidaciones) | - MS_STK (q.stock.actualizado)     | - MS_CLI (Clientes & Perfiles)     |
| - MS_PROV (Proveedores y Nodos)   | - Webhooks Inbound (4 verticales)  | - MS_PROV (Conectores Socios)      |
| - MS_AUD (Auditoría Negocio SQL)  | - DLQ (q.dead_letter - Fallos)     |                                    |
|                                   |                                    | Capacidades de Malla:              |
| Capa Externa / ACL (B2B):         | Cluster Apache Kafka:              | - mTLS Zero Trust (TLSv1.3)        |
| - MS_ATR (Socios Atracciones)     | - MS Catálogo (topic-catalogo-sync)| - Sidecar Proxy Interceptor        |
| - MS_AUT (Socios Autos)           | - MS_PROV (telemetry.events)       | - Rate Limiting Inter-Servicio     |
| - MS_ALO (Socios Alojamientos)    | - MS_AUD (compras.audit)           | - Trazabilidad X-Correlation-Id    |
| - MS_VUE (Socios Vuelos)          | - Kafka-Rabbit Bridge (Espejeo)    |                                    |
+-----------------------------------+------------------------------------+------------------------------------+
```

---

#### 1. Microservicios que van al ESB (Enterprise Service Bus)
El ESB opera como el motor síncrono de orquestación y mediación de datos. Se divide en dos capas funcionales:

* **A. ESB Capa Interna (`src/modules/esb/interna/`)**:
  Gobierna los microservicios propietarios de Booking Central. Su responsabilidad crítica es **sustituir los SQL `JOINs` entre los 12 esquemas herméticos en la memoria de la aplicación**:
  1. **MS Clientes y Auth (`MS_CLI`)**: Suministra la identidad verificada del comprador (cédula, nombres, teléfono E.164) para asociarla a reservas y facturas sin acoplar tablas de base de datos.
  2. **MS Carritos y Checkout (`MS_CAR`)**: Centraliza los ítems multiverticales en memoria antes de disparar el proceso transaccional de compra.
  3. **MS Facturación Fiscal (`MS_FAC`)**: Ensambla el encabezado y detalle fiscal, aplicando el IVA 15% ecuatoriano con estricta validación de idempotencia (`Idempotency-Key`).
  4. **MS Simulación de Pagos (`MS_PAG`)**: Coordina el cobro síncrono, retención temporal de fondos (*holds*) y emisión de reembolsos inmediatos ante cancelaciones.
  5. **MS Paquetes Dinámicos (`MS_PKG`)**: Evalúa en memoria reglas de negocio para promociones combinadas (ej. Alojamiento + Auto + Atracción) y valida topes de descuento permitidos según contratos.
  6. **MS Finanzas y Liquidaciones (`MS_FIN`)**: Calcula de forma automática la comisión del 10% retenida por Booking Central y genera las liquidaciones pendientes para los socios.
  7. **MS Proveedores y Salud de Nodos (`MS_PROV`)**: Administra la tabla de configuración de proveedores y conmutación de *kill-switches* de aislamiento.
  8. **MS Auditoría Transaccional (`MS_AUD`)**: Escribe los registros fiscales y transaccionales estructurados en `schema_auditoria` para consulta SQL.

* **B. ESB Capa de Integración Externa / Adaptadores ACL (`src/modules/*/acl/`)**:
  Gobierna la comunicación síncrona B2B hacia los sistemas externos de los compañeros, aplicando **traducción de modelos de datos (ACL)** y **Circuit Breakers (timeout 5000 ms, umbral de 3 fallos)**:
  1. **MS Atracciones (`MS_ATR`)**: Conecta con *Vívelo Ecuador* (Gloria), *Descubre EC* (Dilan), *TourGirls* (Michael), *EcuaTravel* (Ariel) y *Atracciones EC* (Alisson) para disponibilidad en tiempo real, reserva de turnos y cancelación coordinada.
  2. **MS Autos (`MS_AUT`)**: Conecta con las flotas de *RutaLibre Autos* (Esteban / Mateo) para cotización de días dinámicos, arriendo de vehículos y verificación de la regla de *cooldown* de 2 horas.
  3. **MS Alojamientos (`MS_ALO`)**: Conecta con los motores hoteleros federados para reservas de habitaciones, control de huéspedes y política de cancelación de 48 horas.
  4. **MS Vuelos (`MS_VUE`)**: Conecta con aerolíneas socias para consulta de itinerarios, selección de asientos y emisión de pases de abordar (PNR).

---

#### 2. Microservicios que van al Event Bus y a RabbitMQ (AMQP 0-9-1)
El Event Bus con RabbitMQ actúa como el broker transaccional desacoplado. Su función es **absorber picos de carga y descongestionar el ESB** mediante un Topic Exchange (`booking.events`):

1. **MS Catálogo Unificado y BFF**:
   - Conectado a la cola **`q.busquedas.masivas`** (routing key `search.*`). Absorbe avalanchas de miles de turistas consultando destinos concurrentemente, nivelando la carga (*load dampening*) para que el ESB no se congele.
2. **MS Facturación (`MS_FAC`), MS Finanzas (`MS_FIN`) y ESB Saga Orchestrator**:
   - Conectados a la cola **`q.ordenes.confirmadas`** (routing key `order.confirmed`). En cuanto se valida un pago exitoso, este evento dispara asíncronamente:
     * La emisión del comprobante fiscal electrónico en `MS_FAC`.
     * La liquidación de la comisión del 10% en `MS_FIN`.
     * La llamada REST final de confirmación a las tiendas externas de los socios.
3. **MS Pagos (`MS_PAG`)**:
   - Conectado a la cola **`q.pagos.procesados`** (routing key `payment.completed`), notificando al orquestador que el cobro fue liquidado para avanzar el siguiente paso de la Saga.
4. **Saga Orchestrator, MS Pagos y Adaptadores de Socios**:
   - Conectados a la cola **`q.sagas.compensacion`** (routing keys `saga.compensate`, `payment.refunded`). Si un socio externo responde con error (`HTTP 409 Conflict` o `504 Timeout`), el orquestador emite a esta cola para ejecutar los rollbacks LIFO (reembolso financiero automático al usuario y restitución del cupo local).
5. **MS Ingesta de Stock (`MS_STK`)**:
   - Conectado a la cola **`q.stock.actualizado`** (routing key `stock.updated`). En cuanto un socio envía un push gRPC por el puerto 50051, el evento se emite a esta cola de alta prioridad para refrescar la caché en memoria y propagar actualizaciones instantáneas al frontend vía WebSockets.
6. **Módulos de Integración Externa (Atracciones, Autos, Alojamientos, Vuelos)**:
   - Conectados a las colas de **Webhooks Inbound** (`booking.webhooks.inbound.{vertical}`) para procesar callbacks y notificaciones asíncronas de los socios.
7. **Consola Administrativa de Errores y Alertas**:
   - Conectada a la cola **`q.dead_letter`** (Dead Letter Queue). Almacena mensajes que han fallado tras 3 reintentos para inspección forense y resolución manual.

---

#### 3. Microservicios que van a Apache Kafka (Event Streaming Commit Log)
Apache Kafka se especializa en streaming distribuido de alto rendimiento, persistencia inmutable particionada y auditoría a largo plazo (*Event Sourcing*):

1. **MS Catálogo y MS Proveedores**:
   - Conectados al tópico **`booking.catalogo.stream`** (`topic-catalogo-sync`), particionado por vertical turística, para la sincronización masiva de inventario sin bloquear transacciones de compra.
2. **MS Proveedores (`MS_PROV`) y Service Mesh**:
   - Conectados al tópico **`booking.telemetria.nodes`** (`booking.telemetry.events`), transmitiendo un flujo continuo de métricas de salud, tasas de error y latencias de red Este-Oeste de cada nodo.
3. **MS Auditoría (`MS_AUD`)**:
   - Conectado al tópico **`booking.compras.audit`**, almacenando un historial inmutable de compras particionado por cliente para trazabilidad legal y fiscal.
4. **Conector Kafka-Rabbit Bridge (`kafka-rabbit-bridge.service.ts`)**:
   - Microservicio puente que intercepta eventos seleccionados de RabbitMQ y los replica en Kafka garantizando propagación transversal de `X-Correlation-Id` y `trace_id`.

---

#### 4. Microservicios que van al Service Mesh (Tráfico Este-Oeste)
El Service Mesh gobierna la comunicación interna entre microservicios (tráfico Este-Oeste). Cada nodo interno opera bajo el patrón *Sidecar Proxy* (`sidecar-proxy.interceptor.ts`), aplicando autenticación mutua mTLS (TLSv1.3 Zero Trust), rate limiting de malla y trazabilidad distribuida:

* **Nodos Formalmente Registrados en la Malla (`src/modules/service-mesh/service-mesh.service.ts`)**:
  1. **`MS_CORE` (Booking Core Backend / BFF)**: Punto de ingreso perimetral, agregador de consultas y proxy inverso hacia el frontend.
  2. **`MS_ESB` (Enterprise Service Bus)**: Coordinador transaccional y orquestador de Sagas LIFO.
  3. **`MS_PAG` (Microservicio de Pagos & Conciliación)**: Gestor de transacciones financieras, holds y reembolsos.
  4. **`MS_STK` (Microservicio de Inventario gRPC)**: Receptor de inventario en tiempo real sobre HTTP/2 (puerto TCP 50051).
  5. **`MS_FAC` (Microservicio de Facturación Fiscal)**: Emisor de comprobantes electrónicos autorizados SRI con cálculo de IVA 15%.
  6. **`MS_CLI` (Microservicio de Clientes & Deduplicación)**: Gestor de perfiles de clientes y normalización de documentos de identidad.
  7. **`MS_PROV` (Conectores a Proveedores Socios)**: Intermediario de despacho hacia las APIs de Atracciones, Autos, Hoteles y Vuelos.

---

### 2.3. Mapeo Físico Exhaustivo de Archivos de la Arquitectura en `src/`

La siguiente tabla relaciona de forma exhaustiva cada componente arquitectónico con su archivo físico exacto en el repositorio, permitiendo una verificación inmediata en el código fuente:

| Subsistema Arquitectónico | Componente / Rol | Ubicación del Archivo Físico en el Código |
| :--- | :--- | :--- |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Clientes | [`src/core/entities/usuario.entity.ts`](file:///src/core/entities/usuario.entity.ts)<br>[`src/modules/clientes/entities/cliente.entity.ts`](file:///src/modules/clientes/entities/cliente.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Carrito | [`src/core/entities/carrito.entity.ts`](file:///src/core/entities/carrito.entity.ts)<br>[`src/core/entities/carrito-item.entity.ts`](file:///src/core/entities/carrito-item.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Facturación | [`src/core/entities/factura.entity.ts`](file:///src/core/entities/factura.entity.ts)<br>[`src/core/entities/factura-item.entity.ts`](file:///src/core/entities/factura-item.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Atracciones | [`src/modules/atracciones/entities/atraccion.entity.ts`](file:///src/modules/atracciones/entities/atraccion.entity.ts)<br>[`src/modules/atracciones/entities/reserva.entity.ts`](file:///src/modules/atracciones/entities/reserva.entity.ts)<br>[`src/modules/atracciones/entities/resena.entity.ts`](file:///src/modules/atracciones/entities/resena.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Autos | [`src/modules/autos/entities/auto.entity.ts`](file:///src/modules/autos/entities/auto.entity.ts)<br>[`src/modules/autos/entities/order-auto.entity.ts`](file:///src/modules/autos/entities/order-auto.entity.ts)<br>[`src/modules/autos/entities/mantenimiento-auto.entity.ts`](file:///src/modules/autos/entities/mantenimiento-auto.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Alojamientos | [`src/modules/alojamientos/entities/alojamiento.entity.ts`](file:///src/modules/alojamientos/entities/alojamiento.entity.ts)<br>[`src/modules/alojamientos/entities/tipo-habitacion.entity.ts`](file:///src/modules/alojamientos/entities/tipo-habitacion.entity.ts)<br>[`src/modules/alojamientos/entities/reserva.entity.ts`](file:///src/modules/alojamientos/entities/reserva.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Vuelos | [`src/modules/vuelos/entities/vuelo.entity.ts`](file:///src/modules/vuelos/entities/vuelo.entity.ts)<br>[`src/modules/vuelos/entities/reserva.entity.ts`](file:///src/modules/vuelos/entities/reserva.entity.ts)<br>[`src/modules/vuelos/entities/boleto.entity.ts`](file:///src/modules/vuelos/entities/boleto.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Paquetes Dinámicos | [`src/modules/paquetes/entities/paquete.entity.ts`](file:///src/modules/paquetes/entities/paquete.entity.ts)<br>[`src/modules/paquetes/entities/paquete-items.entity.ts`](file:///src/modules/paquetes/entities/paquete-items.entity.ts) |
| **Capa 1: Persistencia (Multi-Esquema)** | Entidades Nodos & Proveedores | [`src/modules/nodes/entities/config-proveedor.entity.ts`](file:///src/modules/nodes/entities/config-proveedor.entity.ts)<br>[`src/core/entities/estado-servicio.entity.ts`](file:///src/core/entities/estado-servicio.entity.ts) |
| **Capa 2: Ingesta Stock gRPC** | Servidor RPC Binario (Puerto 50051) | [`src/modules/inventory/inventory-grpc.controller.ts`](file:///src/modules/inventory/inventory-grpc.controller.ts)<br>[`src/modules/inventory/inventory.service.ts`](file:///src/modules/inventory/inventory.service.ts)<br>[`src/contracts/inventory.proto`](file:///src/contracts/inventory.proto) |
| **Capa 3: ESB Capa Interna** | Enrutador y Sustituto de SQL Joins | [`src/modules/esb/interna/esb-internal-router.service.ts`](file:///src/modules/esb/interna/esb-internal-router.service.ts)<br>[`src/modules/esb/esb.controller.ts`](file:///src/modules/esb/esb.controller.ts)<br>[`src/modules/esb/esb.module.ts`](file:///src/modules/esb/esb.module.ts) |
| **Capa 3: ESB Sagas y Compensaciones** | Orquestador Saga LIFO y Diario | [`src/modules/esb/interna/saga-orchestrator.service.ts`](file:///src/modules/esb/interna/saga-orchestrator.service.ts)<br>[`src/modules/esb/entities/saga-transaccion.entity.ts`](file:///src/modules/esb/entities/saga-transaccion.entity.ts)<br>[`src/modules/esb/entities/saga-paso-journal.entity.ts`](file:///src/modules/esb/entities/saga-paso-journal.entity.ts) |
| **Capa 3: ESB Externa / ACL** | Adaptador Atracciones (Circuit Breaker 5s) | [`src/modules/atracciones/acl/dilan-atracciones.adapter.ts`](file:///src/modules/atracciones/acl/dilan-atracciones.adapter.ts)<br>[`src/modules/atracciones/atracciones.service.ts`](file:///src/modules/atracciones/atracciones.service.ts)<br>[`src/modules/atracciones/atracciones.controller.ts`](file:///src/modules/atracciones/atracciones.controller.ts) |
| **Capa 3: ESB Externa / ACL** | Adaptador Autos (Cooldown 2h & Fallbacks) | [`src/modules/autos/acl/autos-circuit-breaker.adapter.ts`](file:///src/modules/autos/acl/autos-circuit-breaker.adapter.ts)<br>[`src/modules/autos/autos.service.ts`](file:///src/modules/autos/autos.service.ts)<br>[`src/modules/autos/autos.controller.ts`](file:///src/modules/autos/autos.controller.ts) |
| **Capa 3: ESB Externa / ACL** | Adaptador Alojamientos & Hoteles | [`src/modules/alojamientos/acl/alojamientos-circuit-breaker.adapter.ts`](file:///src/modules/alojamientos/acl/alojamientos-circuit-breaker.adapter.ts)<br>[`src/modules/alojamientos/alojamientos.service.ts`](file:///src/modules/alojamientos/alojamientos.service.ts)<br>[`src/modules/alojamientos/alojamientos.controller.ts`](file:///src/modules/alojamientos/alojamientos.controller.ts) |
| **Capa 3: ESB Externa / ACL** | Integración Vuelos e Itinerarios | [`src/modules/vuelos/vuelos.service.ts`](file:///src/modules/vuelos/vuelos.service.ts)<br>[`src/modules/vuelos/vuelos.controller.ts`](file:///src/modules/vuelos/vuelos.controller.ts) |
| **Capa 3: ESB Kill-Switches** | Gestión de Nodos, Semáforo 🟢/🔴 | [`src/modules/nodes/nodes.service.ts`](file:///src/modules/nodes/nodes.service.ts)<br>[`src/modules/nodes/nodes.controller.ts`](file:///src/modules/nodes/nodes.controller.ts) |
| **Capa 4: Event Bus (RabbitMQ)** | Publicador Transaccional AMQP 0-9-1 | [`src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts`](file:///src/modules/event-bus/rabbitmq/rabbitmq-event-bus.service.ts)<br>[`src/modules/event-bus/consumer/rabbitmq-consumer.service.ts`](file:///src/modules/event-bus/consumer/rabbitmq-consumer.service.ts) |
| **Capa 4: Event Bus (Kafka)** | Commit Log Inmutable de Streaming | [`src/modules/event-bus/kafka/kafka-event-bus.service.ts`](file:///src/modules/event-bus/kafka/kafka-event-bus.service.ts) |
| **Capa 4: Bridge Dual** | Conector RabbitMQ - Apache Kafka | [`src/modules/event-bus/bridge/kafka-rabbit-bridge.service.ts`](file:///src/modules/event-bus/bridge/kafka-rabbit-bridge.service.ts) |
| **Capa 4: Consumidor Idempotente** | Deduplicación de Mensajes y Eventos | [`src/modules/event-bus/consumer/event-consumer-idempotency.service.ts`](file:///src/modules/event-bus/consumer/event-consumer-idempotency.service.ts) |
| **Transversal: Service Mesh** | Sidecar Proxy, mTLS y Métricas Este-Oeste | [`src/modules/service-mesh/interceptors/sidecar-proxy.interceptor.ts`](file:///src/modules/service-mesh/interceptors/sidecar-proxy.interceptor.ts)<br>[`src/modules/service-mesh/service-mesh.service.ts`](file:///src/modules/service-mesh/service-mesh.service.ts)<br>[`src/modules/service-mesh/service-mesh.controller.ts`](file:///src/modules/service-mesh/service-mesh.controller.ts)<br>[`src/modules/service-mesh/service-mesh.module.ts`](file:///src/modules/service-mesh/service-mesh.module.ts) |
| **Capa 5: Orquestación & Facturas** | Facturación Compuesta con IVA 15% | [`src/modules/facturas/facturas.service.ts`](file:///src/modules/facturas/facturas.service.ts)<br>[`src/modules/facturas/facturas.controller.ts`](file:///src/modules/facturas/facturas.controller.ts) |
| **Capa 5: Orquestación & Finanzas** | Liquidaciones y Comisiones 10% | [`src/modules/finanzas/finanzas.service.ts`](file:///src/modules/finanzas/finanzas.service.ts)<br>[`src/modules/finanzas/finanzas.controller.ts`](file:///src/modules/finanzas/finanzas.controller.ts) |
| **Capa 5: Orquestación & Pagos** | Simulación SOA y Reembolsos | [`src/modules/pagos/pagos.service.ts`](file:///src/modules/pagos/pagos.service.ts)<br>[`src/modules/pagos/pagos.controller.ts`](file:///src/modules/pagos/pagos.controller.ts) |
| **Capa 6: API Gateway & BFF** | GraphQL Resolver y Esquema Unificado | [`src/modules/graphql/graphql-bff.module.ts`](file:///src/modules/graphql/graphql-bff.module.ts)<br>[`src/modules/graphql/graphql-bff.resolver.ts`](file:///src/modules/graphql/graphql-bff.resolver.ts)<br>[`src/modules/graphql/graphql-bff.service.ts`](file:///src/modules/graphql/graphql-bff.service.ts) |
| **Capa 6: Anti N+1 GraphQL** | DataLoaders Batch para Consultas | [`src/modules/graphql/dataloaders/reservas.dataloader.ts`](file:///src/modules/graphql/dataloaders/reservas.dataloader.ts) |
| **Transversal: Trazabilidad** | Middleware y Servicio de Correlación | [`src/core/tracing/trace-context.middleware.ts`](file:///src/core/tracing/trace-context.middleware.ts)<br>[`src/core/tracing/trace-context.interceptor.ts`](file:///src/core/tracing/trace-context.interceptor.ts)<br>[`src/core/tracing/trace-context.service.ts`](file:///src/core/tracing/trace-context.service.ts) |
| **Transversal: Seguridad & Guards** | Supabase Auth Guard y RBAC | [`src/core/guards/supabase-auth.guard.ts`](file:///src/core/guards/supabase-auth.guard.ts)<br>[`src/core/guards/roles.guard.ts`](file:///src/core/guards/roles.guard.ts)<br>[`src/core/decorators/roles.decorator.ts`](file:///src/core/decorators/roles.decorator.ts) |
| **Transversal: Logs Físicos** | Winston Physical Logger (Cero Logs BD) | [`src/core/logger/winston-logger.service.ts`](file:///src/core/logger/winston-logger.service.ts)<br>[`src/core/logger/structured-http-request.middleware.ts`](file:///src/core/logger/structured-http-request.middleware.ts) |
| **Capa 7: Presentación Web SPA** | Catálogo, Detalle y Turnos Interactivos | [`frontend/src/pages/AtraccionDetailPage.jsx`](file:///frontend/src/pages/AtraccionDetailPage.jsx)<br>[`frontend/src/pages/AtraccionesPage.jsx`](file:///frontend/src/pages/AtraccionesPage.jsx) |
| **Capa 7: Presentación Web SPA** | Carrito, Checkout e Idempotencia | [`frontend/src/pages/CheckoutPage.jsx`](file:///frontend/src/pages/CheckoutPage.jsx)<br>[`frontend/src/pages/CartPage.jsx`](file:///frontend/src/pages/CartPage.jsx) |
| **Capa 7: Presentación Web SPA** | Mis Reservas, QR y Cancelación (24h/48h) | [`frontend/src/pages/MisReservasPage.jsx`](file:///frontend/src/pages/MisReservasPage.jsx)<br>[`frontend/src/components/BookingCard.jsx`](file:///frontend/src/components/BookingCard.jsx) |
| **Capa 7: Paneles Administrativos** | Semáforo de Nodos y Kill-Switches | [`frontend/src/pages/AdminNodesPage.jsx`](file:///frontend/src/pages/AdminNodesPage.jsx)<br>[`frontend/src/pages/AdminDashboard.jsx`](file:///frontend/src/pages/AdminDashboard.jsx) |

---

### 2.4. Guía Práctica: Cómo Visualizar y Demostrar el ESB, Event Bus, RabbitMQ y Service Mesh

Para defender y demostrar en vivo ante el docente o evaluador el funcionamiento del **ESB, Event Bus, RabbitMQ, Kafka y Service Mesh**, dispones de las siguientes 4 vías de visualización directa:

#### 1. Panel Visual de Administración del Frontend (En Vivo)
Al iniciar la aplicación (`npm run dev` en frontend y backend):
- Navega a la ruta protegida de administración: **`http://localhost:5173/admin`** (o en la barra de navegación: botón **Admin Dashboard**).
- **Para mostrar el Service Mesh y Tráfico Este-Oeste**:
  * Haz clic en la pestaña **"🔬 Servicios & Prov."** (o pestaña **"Observabilidad"**).
  * Observarás el componente [`PanelServiceMesh.jsx`](file:///frontend/src/components/admin/PanelServiceMesh.jsx) que renderiza el **Grafo Interactivo Mermaid** con la frontera entre el Tráfico Norte-Sur (API Gateway) y el Tráfico Este-Oeste (Service Mesh).
  * Verás la tabla de **Nodos de la Malla** (`MS_CORE`, `MS_ESB`, `MS_PAG`, `MS_STK`, `MS_FAC`, `MS_CLI`, `MS_PROV`) con su estado mTLS TLSv1.3, Sidecar Envoy Proxy, latencia en ms y estado de Circuit Breaker (`CLOSED` 🟢 / `OPEN` 🔴).
- **Para mostrar el ESB y las Sagas de Transacciones Distribuidas**:
  * En el mismo dashboard, desplázate a la sección del [`Panel8_AuditoriaSagas.jsx`](file:///frontend/src/components/admin/Panel8_AuditoriaSagas.jsx).
  * Muestra en tiempo real la lista de **Transacciones Saga** (`COMPLETED`, `IN_PROGRESS`, `COMPENSATING`, `FAILED`).
  * Al hacer clic sobre cualquier transacción, se expande el **Diario de Pasos (Saga Journal)** mostrando cada microservicio involucrado y la compensación inversa LIFO en caso de error de un socio.

#### 2. Endpoints REST de Telemetría y Diagnóstico (Swagger / Navegador / Postman)
Puedes consultar directamente desde el navegador o Swagger (`http://localhost:3000/api/docs`) los endpoints que exponen las métricas en tiempo real:

| Componente a Demostrar | Método y Endpoint | Qué muestra al evaluador |
| :--- | :--- | :--- |
| **Service Mesh (Salud Nodos)** | `GET /api/v1/service-mesh/health` | Estado de mTLS, huellas digitales criptográficas, estado de los 7 nodos y tasa de éxito general de la malla. |
| **Service Mesh (Telemetría)** | `GET /api/v1/service-mesh/telemetria` | Métricas de tráfico Este-Oeste: latencia media (ms), peticiones totales, fallos y reintentos por microservicio. |
| **Service Mesh (Declarativo)** | `GET /api/v1/service-mesh/declarativo/istio` | Manifiesto declarativo en YAML de `VirtualService` y `DestinationRule` (Istio / Envoy) para inyección de proxies. |
| **ESB (Sagas Activas)** | `GET /api/v1/esb/sagas` | Historial de orquestaciones distribuidas leídas desde `schema_auditoria.saga_transacciones`. |
| **ESB (Sustituto de SQL Joins)**| `GET /api/v1/esb/aggregate/mis-reservas/:cliente` | Demostración de cómo el ESB ensambla en memoria reservas de autos, hoteles y tours sin hacer SQL JOIN cross-schema. |
| **Event Bus & Trazas EDA** | `GET /api/v1/observabilidad/trazas/:correlationId` | Trazabilidad distribuida extremo a extremo con el árbol de spans y correlation ID a través de los brokers. |

#### 3. Consola de RabbitMQ (AMQP 0-9-1) y CLI
Si tienes el contenedor o broker de RabbitMQ levantado localmente o en el cluster:
- **RabbitMQ Management UI**: Accede a **`http://localhost:15672`** (Credenciales por defecto: `guest` / `guest`).
- **Ver el Exchange Topic**: Ir a la pestaña **Exchanges** -> seleccionar **`booking.events`**.
- **Ver las Colas de Negocio**: Pestaña **Queues**:
  * `q.busquedas.masivas`: Muestra los mensajes de búsqueda nivelados.
  * `q.ordenes.confirmadas`: Muestra las compras confirmadas disparando facturación y finanzas.
  * `q.sagas.compensacion`: Muestra los eventos de rollback transaccional.
  * `q.stock.actualizado`: Muestra las actualizaciones de inventario gRPC empujadas a la cola.
  * `q.dead_letter`: Muestra mensajes encolados para DLQ tras superar los 3 reintentos.
- **Vía Terminal (RabbitMQ CLI)**:
  ```bash
  rabbitmqctl list_queues name messages consumers
  ```

#### 4. Archivos Físicos Rotativos de Winston Logger (Inspección en Disco)
Para comprobar que no se ensucia la base de datos con logs de red conforme a la regla docente:
- Abre la carpeta [`logs/`](file:///logs/):
  * [`logs/audit.log`](file:///logs/audit.log): Trazas inmutables de transacciones distribuidas y correlación `X-Correlation-Id`.
  * [`logs/combined.log`](file:///logs/combined.log): Registro cronológico de todas las llamadas de red y handshakes inter-servicio.
  * [`logs/error.log`](file:///logs/error.log): Registro detallado de aperturas de Circuit Breakers y excepciones capturadas por el ESB y los adaptadores ACL.

---

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

### ADR-007: Adopción de Arquitectura Híbrida Segregada para RDA3 (Web Admin en React + Marketplace Móvil en Flutter)
- **Estado**: Aceptado.
- **Contexto**: El Reto 3 (RDA3) exige la incorporación de tecnología cliente móvil (Flutter, React Native o .NET MAUI) preservando al mismo tiempo la consola de observabilidad, el control del Service Mesh y la liquidación a socios sin alterar las APIs de producción en Azure.
- **Decisión**:
  1. Mantener la consola administrativa y de observabilidad en la aplicación Web React (`frontend/`), desplegada de forma continua en Render.
  2. Implementar el Marketplace para el usuario final (turista) en un cliente móvil nativo desarrollado en Flutter (`booking_flutter/`), organizado en monorepo aislado.
  3. Congelar estrictamente los contratos B2B en OpenAPI v3 (sin saltar a v4), consumiendo los mismos endpoints REST idempotentes tanto desde la Web como desde el Móvil.
- **Consecuencia**: Cero riesgo de regresión en backend y frontend web, separación limpia de perfiles de usuario (Operador/Admin en Web vs Turista en Móvil) y cumplimiento riguroso de la rúbrica de evaluación académica RDA3.

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

---

## 10. Arquitectura Híbrida RDA3 y Marketplace Móvil Flutter

### 10.1. Segregación Arquitectónica: Web Administrativa vs Marketplace Móvil

Para dar cumplimiento a los requerimientos del Reto 3 (**RDA3**) garantizando una estabilidad absoluta y cero interrupción de los servicios en producción, se implementó una estrategia de **Segregación Funcional por Dispositivo**:

```
                              ┌──────────────────────────────────────────────┐
                              │           BACKEND CENTRAL (AZURE)            │
                              │        NestJS REST / gRPC 50051 / DB         │
                              └──────────────────────┬───────────────────────┘
                                                     │
                          ┌──────────────────────────┴──────────────────────────┐
                          ▼                                                     ▼
        ┌───────────────────────────────────┐                 ┌───────────────────────────────────┐
        │       CONSOLA WEB OPERATIVA       │                 │     MARKETPLACE MÓVIL CLIENTE     │
        │      (frontend/ - React 18)       │                 │   (booking_flutter/ - Flutter)    │
        ├───────────────────────────────────┤                 ├───────────────────────────────────┤
        │ • Rol: Administrador y Operador   │                 │ • Rol: Turista / Viajero Final    │
        │ • Service Mesh y Nodos Activos    │                 │ • Catálogo de 4 Verticales        │
        │ • Auditoría de Sagas Distribuidas │                 │ • Carrito Multi-Vertical Reactivo │
        │ • Liquidación Financiera B2B      │                 │ • Vouchers con Código QR Offline  │
        │ • Despliegue: Render Continuo     │                 │ • Compilación: APK Android / Web  │
        └───────────────────────────────────┘                 └───────────────────────────────────┘
```

### 10.2. Estructura del Proyecto Flutter (`booking_flutter/`)

La aplicación móvil se encuentra totalmente autocontenida en la carpeta `booking_flutter/`, respetando una arquitectura limpia y modular:

```text
booking_flutter/
├── pubspec.yaml               # Dependencias (provider, http, qr_flutter, intl, uuid)
├── .gitignore                 # Reglas de exclusión para artefactos de compilación móvil
├── README.md                  # Documentación específica de desarrollo y empaquetado móvil
└── lib/
    ├── main.dart              # Entry-point, ThemeData Booking (#003580), MultiProvider
    ├── config/
    │   └── api_config.dart    # Resolución dinámica de host (Azure Prod vs Localhost/10.0.2.2)
    ├── models/                # Modelos de datos inmutables y mapeo JSON
    │   ├── atraccion.dart     # Atracción y TimeSlot con aforo disponible
    │   ├── auto.dart          # Vehículos, seguros y estado de Cooldown 2h
    │   ├── alojamiento.dart   # Hoteles, amenidades y Tipos de Habitación
    │   ├── vuelo.dart         # Vuelos, escalas, cabina y pases
    │   ├── reserva.dart       # Entidad de reserva y política de cancelación 24h/48h
    │   └── cart_item.dart     # Elemento de carrito con cálculo tributario 15% IVA
    ├── services/
    │   ├── api_client.dart    # Cliente HTTP con X-Correlation-Id e Idempotency-Key
    │   └── booking_services.dart # Consumo de endpoints B2B, disponibilidad y Sagas
    ├── providers/
    │   ├── cart_provider.dart # Estado global del carrito y cálculo de totales
    │   └── auth_provider.dart # Sesión del viajero y persistencia SharedPreferences
    └── screens/
        ├── main_shell.dart    # Barra de navegación inferior (Explorar, Mis Reservas, Perfil)
        ├── catalogo/
        │   └── home_screen.dart # Pestañas de categorías (Atracciones, Autos, Hoteles, Vuelos)
        ├── detalle/
        │   ├── atraccion_detail_screen.dart # Selección de turnos con aforo interactivo
        │   ├── auto_detail_screen.dart      # Rango de fechas y control de cooldown
        │   ├── alojamiento_detail_screen.dart # Selección de fechas y tipo de habitación
        │   └── vuelo_detail_screen.dart     # Selección de asientos y pasajeros
        ├── checkout/
        │   ├── cart_screen.dart             # Resumen de compra y desglose tributario
        │   └── checkout_screen.dart         # Formulario de pago y despacho de la Saga
        ├── reservas/
        │   ├── mis_reservas_screen.dart     # Historial y cancelación protegida (24h/48h)
        │   └── voucher_qr_screen.dart       # Generación de código QR para check-in
        ├── vuelos/
        │   └── estado_vuelo_screen.dart     # Rastreador de vuelos en tiempo real
        ├── perfil/
        │   ├── perfil_screen.dart           # Perfil de usuario, términos y soporte
        │   └── facturas_screen.dart         # Facturación electrónica SRI con clave 49 dígitos
        └── auth/
            └── login_screen.dart            # Inicio de sesión y acceso como invitado
```

### 10.3. Cobertura de las 4 Verticales y Reglas de Negocio en Móvil

| Vertical / Módulo | Implementación Móvil en Flutter | Regla de Negocio Protegida |
| :--- | :--- | :--- |
| **Atracciones** | `AtraccionDetailScreen` con selector interactivo de fechas y chips dinámicos de turnos horarios. | Capacidad máxima por turno respetada en tiempo real; cancelación bloqueada a < 48 horas. |
| **Autos** | `AutoDetailScreen` con cálculo de días y selección de seguros. | Validación visual del estado de Cooldown de 2 horas entre alquileres. |
| **Alojamientos** | `AlojamientoDetailScreen` con selector de fechas de entrada/salida y tipos de habitación. | Cálculo automático de noches de estancia y aforo por tipo de habitación. |
| **Vuelos** | `VueloDetailScreen` y `EstadoVueloScreen` con selector de asientos y rastreador en vivo. | Validación de asientos disponibles y emisión de datos para el pase de abordar. |
| **Checkout & Sagas** | `CartScreen` y `CheckoutScreen` con dispatch unificado. | Desglose fiscal de 15% IVA (Ecuador), cabecera `Idempotency-Key` y orquestación Saga. |
| **Check-in Offline** | `VoucherQrScreen` con renderizado vectorial nativo (`qr_flutter`). | Portabilidad de comprobantes de reserva con firma digital de acceso sin conexión. |

### 10.4. Guía de Compilación y Generación de APK Móvil

La aplicación Flutter se compila de manera independiente desde la carpeta `booking_flutter`:

```bash
# 1. Navegar a la carpeta móvil
cd booking_flutter

# 2. Descargar paquetes y dependencias de Flutter
flutter pub get

# 3. Probar la aplicación en el navegador (Web)
flutter run -d chrome

# 4. Compilar la aplicación en emulador o dispositivo Android conectado
flutter run

# 5. Generar el paquete APK para distribución y entrega
flutter build apk --release
```
*El archivo `.apk` resultante se ubica en*: `booking_flutter/build/app/outputs/flutter-apk/app-release.apk`

### 10.5. Gobernanza de Socios B2B y Guías de Migración Multi-Framework

Para garantizar que todos los equipos de la asignatura (Atracciones, Autos, Alojamientos, Vuelos) cumplan con la migración a sus respectivos entornos móviles sin causar incompatibilidades ni tocar sus servidores, se dividieron las directrices en guías específicas y autocontenidas:

- 🧭 **[Índice Maestro de Migración Móvil](RDA3/Indicaciones/GUIA_MIGRACION_MOVIL_SOCIOS_RDA3.md)**
- 📱 **[Guía Específica para FLUTTER](RDA3/Indicaciones/GUIA_MIGRACION_FLUTTER_SOCIOS_RDA3.md)** (Dart, `pubspec.yaml`, `provider`, `qr_flutter`)
- ⚛️ **[Guía Específica para REACT NATIVE](RDA3/Indicaciones/GUIA_MIGRACION_REACT_NATIVE_SOCIOS_RDA3.md)** (Expo, TypeScript, Axios, `react-native-qrcode-svg`)
- 🔷 **[Guía Específica para .NET MAUI](RDA3/Indicaciones/GUIA_MIGRACION_MAUI_SOCIOS_RDA3.md)** (C#, XAML, MVVM, `CommunityToolkit.Mvvm`, `QRCoder`)

#### Regla de Oro para Todos los Socios:
> **LOS BACKENDS Y CONTRATOS REST NO SE MODIFICAN.**
> Las APIs de producción en Azure Container Apps y Azure App Service se mantienen congeladas en sus contratos OpenAPI v3 actuales. La migración de RDA3 es **100% de capa de presentación cliente**.

Cada guía contiene:
- Directrices técnicas completas del framework asignado.
- Manejo transversal de cabeceras HTTP (`X-Correlation-Id`, `Idempotency-Key`).
- Implementación de reglas de negocio en móvil (cooldown de 2h en autos, ventanas de cancelación 24h/48h, aforos en atracciones).
- Comandos exactos para probar y compilar el APK Android.
- Un prompt listo para copiar y pegar directamente en el agente de IA del compañero (*Cascade, Cursor, Copilot, ChatGPT, etc.*).
