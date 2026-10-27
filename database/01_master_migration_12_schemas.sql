-- ============================================================================
-- SCRIPT MAESTRO DE MIGRACIÓN: ARQUITECTURA 12 ESQUEMAS INDEPENDIENTES (RDA2)
-- Proyecto: Booking Prototipo — Reto 2: Integración de Sistemas
-- Principio de Cátedra: "Database-per-Service: 1 microservicio = 1 esquema propio"
-- Prohibido: Compartir tablas físicas o ejecutar sentencias SQL JOIN cross-schema
-- Cero Logs en BD: Auditoría técnica exclusivamente a logs/*.log físicos (Winston)
-- ============================================================================

-- Habilitar extensión para UUIDs automáticos
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ESQUEMA: schema_clientes (Microservicio MS_CLI)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_clientes;

CREATE TABLE IF NOT EXISTS schema_clientes.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT,
    cedula_ruc VARCHAR(20),
    telefono VARCHAR(30),
    direccion TEXT,
    pais VARCHAR(60) DEFAULT 'Ecuador',
    rol VARCHAR(30) NOT NULL DEFAULT 'CLIENTE' CHECK (rol IN ('CLIENTE', 'ADMIN', 'MANTENIMIENTO')),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'SUSPENDIDO', 'INACTIVO')),
    refresh_token_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clientes_email ON schema_clientes.clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_rol ON schema_clientes.clientes(rol);

-- ============================================================================
-- 2. ESQUEMA: schema_carritos (Microservicio MS_CAR)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_carritos;

CREATE TABLE IF NOT EXISTS schema_carritos.carritos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL, -- Identificador lógico del cliente (sin FK física cross-schema)
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'PROCESADO', 'ABANDONADO')),
    moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_carritos.carrito_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrito_id UUID NOT NULL REFERENCES schema_carritos.carritos(id) ON DELETE CASCADE,
    vertical VARCHAR(30) NOT NULL CHECK (vertical IN ('ATRACCIONES', 'AUTOS', 'ALOJAMIENTOS', 'VUELOS', 'PAQUETES')),
    item_referencia_id VARCHAR(64) NOT NULL, -- ID del producto en su vertical correspondiente
    nombre_producto VARCHAR(255) NOT NULL,
    precio_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    detalles_json JSONB, -- Fechas, turno horario, desglose etario, seguros, etc.
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carritos_cliente ON schema_carritos.carritos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_carritos_estado ON schema_carritos.carritos(estado);
CREATE INDEX IF NOT EXISTS idx_carrito_items_carrito ON schema_carritos.carrito_items(carrito_id);

-- ============================================================================
-- 3. ESQUEMA: schema_facturacion (Microservicio MS_FAC)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_facturacion;

CREATE TABLE IF NOT EXISTS schema_facturacion.facturas_encabezado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_factura VARCHAR(50) UNIQUE NOT NULL, -- Formato formal: FAC-YYYYMMDD-XXXXXX
    cliente_id UUID NOT NULL, -- Identificador lógico del cliente
    nombre_cliente VARCHAR(150) NOT NULL,
    cedula_ruc_cliente VARCHAR(20) NOT NULL,
    email_cliente VARCHAR(150) NOT NULL,
    direccion_cliente TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    iva_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 15.00, -- IVA Ecuador vigente 15%
    iva_valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    metodo_pago VARCHAR(50) NOT NULL DEFAULT 'TARJETA_CREDITO',
    estado VARCHAR(30) NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA', 'PAGADA', 'ANULADA_POR_COMPENSACION')),
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    transaccion_pago_id UUID, -- Referencia lógica a schema_pagos
    emitida_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_facturacion.facturas_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id UUID NOT NULL REFERENCES schema_facturacion.facturas_encabezado(id) ON DELETE CASCADE,
    vertical VARCHAR(30) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    descripcion TEXT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_numero ON schema_facturacion.facturas_encabezado(numero_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON schema_facturacion.facturas_encabezado(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_idempotency ON schema_facturacion.facturas_encabezado(idempotency_key);

-- ============================================================================
-- 4. ESQUEMA: schema_pagos (Microservicio MS_PAG - Simulación SOA Transaccional)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_pagos;

CREATE TABLE IF NOT EXISTS schema_pagos.transacciones_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_autorizacion VARCHAR(50) UNIQUE NOT NULL, -- Formato: AUTH-XXXXXX
    orden_id VARCHAR(64) NOT NULL,
    cliente_id UUID NOT NULL,
    monto NUMERIC(10, 2) NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    metodo_pago VARCHAR(50) NOT NULL DEFAULT 'TARJETA_CREDITO',
    estado VARCHAR(30) NOT NULL DEFAULT 'APROBADO' CHECK (estado IN ('APROBADO', 'RECHAZADO', 'REEMBOLSADO', 'TIMEOUT')),
    motivo_rechazo VARCHAR(255),
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    codigo_reembolso VARCHAR(50), -- Generado en compensación Saga: REF-PAG-XXXXXX
    reembolsado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_codigo_auth ON schema_pagos.transacciones_pago(codigo_autorizacion);
CREATE INDEX IF NOT EXISTS idx_pagos_idempotency ON schema_pagos.transacciones_pago(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON schema_pagos.transacciones_pago(estado);

-- ============================================================================
-- 5. ESQUEMA: schema_paquetes (Microservicio MS_PKG - Combos B2B y Promociones)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_paquetes;

CREATE TABLE IF NOT EXISTS schema_paquetes.paquetes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    destino VARCHAR(100) NOT NULL,
    descripcion TEXT,
    descuento_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    precio_regular_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    precio_paquete_promocional NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fecha_inicio_validez DATE NOT NULL,
    fecha_fin_validez DATE NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_paquetes.paquete_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paquete_id UUID NOT NULL REFERENCES schema_paquetes.paquetes(id) ON DELETE CASCADE,
    vertical VARCHAR(30) NOT NULL CHECK (vertical IN ('ATRACCIONES', 'AUTOS', 'ALOJAMIENTOS', 'VUELOS')),
    item_referencia_id VARCHAR(64) NOT NULL,
    item_nombre VARCHAR(255) NOT NULL,
    precio_base_socio NUMERIC(10, 2) NOT NULL,
    descuento_aplicado_item NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_paquetes.contrato_promociones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_codigo VARCHAR(50) UNIQUE NOT NULL, -- ej. 'DESCUBRE_EC'
    proveedor_vertical VARCHAR(30) NOT NULL,
    permite_promociones BOOLEAN NOT NULL DEFAULT TRUE,
    descuento_maximo_permitido NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vigente_hasta TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 YEAR'),
    cuestionario_respuestas JSONB, -- Respuestas formales a preguntas B2B
    actualizado_por VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paquetes_destino ON schema_paquetes.paquetes(destino);
CREATE INDEX IF NOT EXISTS idx_contrato_proveedor ON schema_paquetes.contrato_promociones(proveedor_codigo);

-- ============================================================================
-- 6. ESQUEMA: schema_finanzas (Microservicio MS_FIN - Comisiones y Liquidaciones)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_finanzas;

CREATE TABLE IF NOT EXISTS schema_finanzas.liquidaciones_proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_liquidacion VARCHAR(50) UNIQUE NOT NULL, -- Formato: LIQ-YYYYMM-XXXX
    proveedor_codigo VARCHAR(50) NOT NULL,
    vertical VARCHAR(30) NOT NULL,
    periodo VARCHAR(20) NOT NULL, -- ej. '2026-10-Q1'
    monto_bruto_ventas NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    porcentaje_comision_booking NUMERIC(5, 2) NOT NULL DEFAULT 10.00, -- Retención 10%
    comision_retenida_booking NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_neto_a_pagar NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'PAGADO')),
    comprobante_pago_url TEXT,
    pagado_at TIMESTAMPTZ,
    aprobado_por VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_finanzas.libro_mayor_comisiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id VARCHAR(64) NOT NULL,
    factura_id UUID NOT NULL, -- Referencia lógica
    vertical VARCHAR(30) NOT NULL,
    total_venta NUMERIC(10, 2) NOT NULL,
    comision_booking_10pct NUMERIC(10, 2) NOT NULL,
    neto_socio_90pct NUMERIC(10, 2) NOT NULL,
    fecha_asiento TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_proveedor ON schema_finanzas.liquidaciones_proveedores(proveedor_codigo);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_periodo ON schema_finanzas.liquidaciones_proveedores(periodo);
CREATE INDEX IF NOT EXISTS idx_libro_mayor_orden ON schema_finanzas.libro_mayor_comisiones(orden_id);

-- ============================================================================
-- 7. ESQUEMA: schema_proveedores (Microservicio MS_PROV - Salud y Kill-Switches)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_proveedores;

CREATE TABLE IF NOT EXISTS schema_proveedores.config_proveedor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_nodo VARCHAR(50) UNIQUE NOT NULL, -- ej. 'NODE_ATR_DILAN', 'NODE_AUT_LOCAL', etc.
    nombre_proveedor VARCHAR(150) NOT NULL,
    vertical VARCHAR(30) NOT NULL,
    base_url_rest TEXT NOT NULL,
    endpoint_grpc VARCHAR(100),
    api_key VARCHAR(255),
    health_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'DOWN')),
    latencia_ms INT NOT NULL DEFAULT 0,
    ultimo_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kill_switch_activo BOOLEAN NOT NULL DEFAULT FALSE,
    circuit_breaker_estado VARCHAR(20) NOT NULL DEFAULT 'CLOSED' CHECK (circuit_breaker_estado IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
    tasa_fallos_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_nodo ON schema_proveedores.config_proveedor(codigo_nodo);
CREATE INDEX IF NOT EXISTS idx_proveedores_status ON schema_proveedores.config_proveedor(health_status);

-- ============================================================================
-- 8. ESQUEMA: schema_atracciones (Microservicio MS_ATR - 100% OpenAPI v2)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_atracciones;

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_categorias_recursivas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    descripcion TEXT,
    parent_id UUID REFERENCES schema_atracciones.atracciones_categorias_recursivas(id) ON DELETE SET NULL,
    nivel_profundidad INT NOT NULL DEFAULT 0,
    incluye_comida BOOLEAN NOT NULL DEFAULT FALSE,
    incluye_transporte BOOLEAN NOT NULL DEFAULT FALSE,
    incluye_guia BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_items (
    id VARCHAR(64) PRIMARY KEY, -- Soporta códigos alfanuméricos tipo Booking ('PRhu4UBTWPBC') o UUID
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    ciudad VARCHAR(100) NOT NULL DEFAULT 'Quito',
    pais VARCHAR(60) NOT NULL DEFAULT 'Ecuador',
    descripcion_corta TEXT,
    descripcion_larga TEXT,
    duracion_estimada VARCHAR(50) DEFAULT 'PT3H',
    categoria_id UUID REFERENCES schema_atracciones.atracciones_categorias_recursivas(id) ON DELETE SET NULL,
    precio_unitario_adulto NUMERIC(10, 2) NOT NULL DEFAULT 55.00,
    moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    cancelacion_gratis BOOLEAN NOT NULL DEFAULT TRUE,
    adicion_animales_servicio BOOLEAN NOT NULL DEFAULT TRUE,
    accesible_silla_ruedas BOOLEAN NOT NULL DEFAULT FALSE,
    idiomas_soportados TEXT[] DEFAULT ARRAY['es', 'en'],
    punto_encuentro VARCHAR(255) DEFAULT 'Boulevard Naciones Unidas, Quito',
    latitud NUMERIC(10, 7) DEFAULT -0.220164,
    longitud NUMERIC(10, 7) DEFAULT -78.512327,
    fotos_urls TEXT[] DEFAULT ARRAY['https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800'],
    itinerario_cronologico JSONB, -- Hitos paso a paso de Booking Attractions
    inclusiones TEXT[] DEFAULT ARRAY['Transporte ida y vuelta', 'Guía profesional bilingüe'],
    exclusiones TEXT[] DEFAULT ARRAY['Propinas', 'Gastos personales'],
    rating_general NUMERIC(3, 1) DEFAULT 9.8,
    reviews_count INT DEFAULT 142,
    rating_limpieza NUMERIC(3, 1) DEFAULT 9.9,
    rating_servicio NUMERIC(3, 1) DEFAULT 9.8,
    rating_calidad NUMERIC(3, 1) DEFAULT 9.6,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_turnos_aforo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atraccion_id VARCHAR(64) NOT NULL REFERENCES schema_atracciones.atracciones_items(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_inicio VARCHAR(15) NOT NULL, -- ej. '10:30 a.m.'
    hora_fin VARCHAR(15),
    capacidad_total INT NOT NULL DEFAULT 20,
    cupos_disponibles INT NOT NULL DEFAULT 20,
    estado VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE', 'ULTIMOS_CUPOS', 'AGOTADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_atracciones_turno_hora UNIQUE (atraccion_id, fecha, hora_inicio)
);

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_reservas (
    id VARCHAR(64) PRIMARY KEY, -- Formato localizador: RES-ATR-XXXXXX
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    atraccion_id VARCHAR(64) NOT NULL REFERENCES schema_atracciones.atracciones_items(id),
    turno_id UUID NOT NULL REFERENCES schema_atracciones.atracciones_turnos_aforo(id),
    cliente_id UUID, -- Referencia lógica opcional a cliente autenticado
    customer_name VARCHAR(150) NOT NULL,
    customer_email VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    document_id VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(15) NOT NULL,
    adult_count INT NOT NULL DEFAULT 1,
    child_count INT NOT NULL DEFAULT 0,
    senior_count INT NOT NULL DEFAULT 0, -- Tarifa preferencial 3ra edad (30% desc)
    infant_count INT NOT NULL DEFAULT 0, -- Tarifa $0 pero ocupa cupo de aforo legal en bus
    ticket_count INT NOT NULL, -- Suma total de los 4 grupos etarios
    subtotal NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'COMPENSATED')),
    special_requirements TEXT,
    voucher_qr_payload TEXT,
    ics_calendar_url TEXT,
    checkin_at TIMESTAMPTZ,
    guia_oficial_asignado VARCHAR(150),
    motivo_cancelacion VARCHAR(255),
    cancel_code VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_resenas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atraccion_id VARCHAR(64) NOT NULL REFERENCES schema_atracciones.atracciones_items(id) ON DELETE CASCADE,
    cliente_id UUID,
    nombre_cliente VARCHAR(120) NOT NULL,
    pais_origen VARCHAR(60) DEFAULT 'Ecuador',
    calificacion_general NUMERIC(3, 1) NOT NULL,
    calificacion_limpieza NUMERIC(3, 1) NOT NULL,
    calificacion_servicio NUMERIC(3, 1) NOT NULL,
    calificacion_calidad NUMERIC(3, 1) NOT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_atracciones.atracciones_eventos_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    published_rabbit BOOLEAN NOT NULL DEFAULT FALSE,
    published_kafka BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atracciones_ciudad ON schema_atracciones.atracciones_items(ciudad);
CREATE INDEX IF NOT EXISTS idx_atracciones_categoria ON schema_atracciones.atracciones_items(categoria_id);
CREATE INDEX IF NOT EXISTS idx_atracciones_turnos ON schema_atracciones.atracciones_turnos_aforo(atraccion_id, fecha);
CREATE INDEX IF NOT EXISTS idx_atracciones_reservas_idem ON schema_atracciones.atracciones_reservas(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_atracciones_reservas_status ON schema_atracciones.atracciones_reservas(status);
CREATE INDEX IF NOT EXISTS idx_atracciones_outbox ON schema_atracciones.atracciones_eventos_outbox(published_rabbit, published_kafka);

-- ============================================================================
-- 9. ESQUEMA: schema_autos (Microservicio MS_AUT - Cooldown 2h y Odómetro)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_autos;

CREATE TABLE IF NOT EXISTS schema_autos.autos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marca VARCHAR(60) NOT NULL,
    modelo VARCHAR(60) NOT NULL,
    anio INT NOT NULL,
    categoria VARCHAR(30) NOT NULL DEFAULT 'ECONOMICO' CHECK (categoria IN ('ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN')),
    transmision VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (transmision IN ('MANUAL', 'AUTOMATICA')),
    capacidad_pasajeros INT NOT NULL DEFAULT 5,
    precio_diario NUMERIC(10, 2) NOT NULL DEFAULT 40.00,
    kilometraje_actual INT NOT NULL DEFAULT 12000,
    umbral_mantenimiento_km INT NOT NULL DEFAULT 15000,
    alerta_mantenimiento_activa BOOLEAN NOT NULL DEFAULT FALSE,
    -- Máquina de estados obligatoria de 6 fases (§5 Consideraciones)
    estado_operativo VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE' CHECK (
        estado_operativo IN ('DISPONIBLE', 'RESERVADO', 'LISTO_PARA_ENTREGAR', 'ENTREGADO', 'EN_LIMPIEZA', 'EN_MANTENIMIENTO')
    ),
    limpieza_inicio_at TIMESTAMPTZ, -- Marca de tiempo al iniciar la fase EN_LIMPIEZA
    disponible_estimado_at TIMESTAMPTZ, -- Calculado como limpieza_inicio_at + 2 HORAS
    foto_url TEXT DEFAULT 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    ciudad VARCHAR(100) NOT NULL DEFAULT 'Quito',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_autos.autos_reservas (
    id VARCHAR(64) PRIMARY KEY, -- Formato: RES-AUT-XXXXXX
    auto_id UUID NOT NULL REFERENCES schema_autos.autos_catalogo(id),
    cliente_id UUID,
    nombre_conductor VARCHAR(150) NOT NULL,
    licencia_conducir VARCHAR(50) NOT NULL,
    fecha_recogida TIMESTAMPTZ NOT NULL,
    fecha_devolucion TIMESTAMPTZ NOT NULL,
    dias_renta INT NOT NULL DEFAULT 1,
    km_salida INT,
    km_retorno INT,
    total NUMERIC(10, 2) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'CONFIRMADA' CHECK (estado IN ('CONFIRMADA', 'ACTIVA', 'COMPLETADA', 'CANCELADA')),
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_autos.autos_mantenimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auto_id UUID NOT NULL REFERENCES schema_autos.autos_catalogo(id) ON DELETE CASCADE,
    tipo_mantenimiento VARCHAR(100) NOT NULL,
    kilometraje_servicio INT NOT NULL,
    descripcion TEXT,
    costo NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tecnico_responsable VARCHAR(120),
    fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_salida TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autos_estado ON schema_autos.autos_catalogo(estado_operativo);
CREATE INDEX IF NOT EXISTS idx_autos_limpieza ON schema_autos.autos_catalogo(limpieza_inicio_at);
CREATE INDEX IF NOT EXISTS idx_autos_km ON schema_autos.autos_catalogo(kilometraje_actual);

-- ============================================================================
-- 10. ESQUEMA: schema_alojamientos (Microservicio MS_ALO - Check-in 14:00)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_alojamientos;

CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_catalogo (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tipo_propiedad VARCHAR(60) NOT NULL DEFAULT 'Hotel',
    ciudad VARCHAR(100) NOT NULL DEFAULT 'Quito',
    pais VARCHAR(60) NOT NULL DEFAULT 'Ecuador',
    direccion VARCHAR(255),
    latitud NUMERIC(10, 7) DEFAULT -0.180653,
    longitud NUMERIC(10, 7) DEFAULT -78.467838,
    precio_noche_base NUMERIC(10, 2) NOT NULL DEFAULT 85.00,
    moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    fotos_urls TEXT[] DEFAULT ARRAY['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    amenidades JSONB,
    rating_general NUMERIC(3, 1) DEFAULT 9.2,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_tipos_habitacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alojamiento_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_catalogo(id) ON DELETE CASCADE,
    nombre_tipo VARCHAR(120) NOT NULL,
    capacidad_adultos INT NOT NULL DEFAULT 2,
    capacidad_ninos INT NOT NULL DEFAULT 1,
    camas VARCHAR(100) DEFAULT '1 Cama King',
    precio_noche NUMERIC(10, 2) NOT NULL,
    cupo_habitaciones INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_reservas (
    id VARCHAR(64) PRIMARY KEY, -- Formato: RES-ALO-XXXXXX
    alojamiento_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_catalogo(id),
    tipo_habitacion_id UUID NOT NULL REFERENCES schema_alojamientos.alojamientos_tipos_habitacion(id),
    cliente_id UUID,
    nombre_titular VARCHAR(150) NOT NULL,
    email_titular VARCHAR(150) NOT NULL,
    fecha_checkin DATE NOT NULL,
    fecha_checkout DATE NOT NULL,
    noches INT NOT NULL DEFAULT 1,
    huespedes_total INT NOT NULL DEFAULT 2,
    precio_total NUMERIC(10, 2) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'CONFIRMADA' CHECK (estado IN ('CONFIRMADA', 'CHECKED_IN', 'FINALIZADA', 'CANCELADA')),
    habitacion_asignada VARCHAR(20),
    clave_acceso_digital VARCHAR(30), -- Clave liberada estrictamente a partir de las 14:00 (§4)
    checkin_liberado_a_las_14 BOOLEAN NOT NULL DEFAULT FALSE,
    checkin_completado_at TIMESTAMPTZ,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_huespedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reserva_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_reservas(id) ON DELETE CASCADE,
    es_titular BOOLEAN NOT NULL DEFAULT FALSE,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    edad INT,
    documento_numero VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alojamientos_ciudad ON schema_alojamientos.alojamientos_catalogo(ciudad);
CREATE INDEX IF NOT EXISTS idx_alojamientos_res_checkin ON schema_alojamientos.alojamientos_reservas(fecha_checkin);
CREATE INDEX IF NOT EXISTS idx_alojamientos_res_status ON schema_alojamientos.alojamientos_reservas(estado);

-- ============================================================================
-- 11. ESQUEMA: schema_vuelos (Microservicio MS_VUE - PNR y Asientos)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_vuelos;

CREATE TABLE IF NOT EXISTS schema_vuelos.vuelos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_vuelo VARCHAR(20) NOT NULL,
    aerolinea_codigo VARCHAR(10) NOT NULL DEFAULT 'EQ',
    aerolinea_nombre VARCHAR(100) NOT NULL DEFAULT 'TAME / Latam Ecuador',
    origen_aeropuerto VARCHAR(10) NOT NULL DEFAULT 'UIO',
    destino_aeropuerto VARCHAR(10) NOT NULL DEFAULT 'GYE',
    salida_programada TIMESTAMPTZ NOT NULL,
    llegada_programada TIMESTAMPTZ NOT NULL,
    duracion_minutos INT NOT NULL DEFAULT 50,
    precio_base NUMERIC(10, 2) NOT NULL DEFAULT 75.00,
    moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
    estado VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADO' CHECK (estado IN ('PROGRAMADO', 'EN_VUELO', 'ATERRIZADO', 'CANCELADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_vuelos.vuelos_asientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vuelo_id UUID NOT NULL REFERENCES schema_vuelos.vuelos_catalogo(id) ON DELETE CASCADE,
    numero_asiento VARCHAR(10) NOT NULL, -- ej. '12A', '12B'
    clase_cabina VARCHAR(20) NOT NULL DEFAULT 'ECONOMICA' CHECK (clase_cabina IN ('ECONOMICA', 'EJECUTIVA', 'PRIMERA')),
    esta_disponible BOOLEAN NOT NULL DEFAULT TRUE,
    precio_adicional NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vuelo_asiento UNIQUE (vuelo_id, numero_asiento)
);

CREATE TABLE IF NOT EXISTS schema_vuelos.vuelos_reservas (
    id VARCHAR(64) PRIMARY KEY, -- Formato PNR: PNR-XXXXXX
    vuelo_id UUID NOT NULL REFERENCES schema_vuelos.vuelos_catalogo(id),
    cliente_id UUID,
    pasajero_nombre VARCHAR(150) NOT NULL,
    pasajero_documento VARCHAR(30) NOT NULL,
    asiento_asignado VARCHAR(10),
    precio_total NUMERIC(10, 2) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'EMITIDO' CHECK (estado IN ('EMITIDO', 'CHECKED_IN', 'CANCELADO')),
    pase_abordar_base64 TEXT,
    checkin_at TIMESTAMPTZ,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vuelos_ruta ON schema_vuelos.vuelos_catalogo(origen_aeropuerto, destino_aeropuerto);
CREATE INDEX IF NOT EXISTS idx_vuelos_res_pnr ON schema_vuelos.vuelos_reservas(id);

-- ============================================================================
-- 12. ESQUEMA: schema_auditoria (Microservicio MS_AUD - Bitácora y Sagas LIFO)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS schema_auditoria;

CREATE TABLE IF NOT EXISTS schema_auditoria.auditoria_transaccional (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modulo VARCHAR(50) NOT NULL,
    accion VARCHAR(100) NOT NULL,
    registro_id VARCHAR(64),
    usuario_id UUID,
    usuario_email VARCHAR(150),
    ip_origen VARCHAR(45),
    detalles_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_auditoria.saga_transacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id VARCHAR(64) UNIQUE NOT NULL,
    saga_nombre VARCHAR(100) NOT NULL, -- ej. 'SAGA_CHECKOUT_COMPUESTO'
    estado VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (estado IN ('IN_PROGRESS', 'COMPLETED', 'COMPENSATING', 'FAILED')),
    pasos_totales INT NOT NULL DEFAULT 4,
    paso_actual INT NOT NULL DEFAULT 1,
    error_detalle TEXT,
    codigo_compensacion VARCHAR(64), -- ej. 'REF-SAGA-XXXXXX'
    iniciada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizada_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS schema_auditoria.saga_pasos_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_id UUID NOT NULL REFERENCES schema_auditoria.saga_transacciones(id) ON DELETE CASCADE,
    orden_ejecucion INT NOT NULL,
    servicio_nombre VARCHAR(60) NOT NULL,
    operacion VARCHAR(100) NOT NULL,
    endpoint_invocado TEXT NOT NULL,
    payload_enviado JSONB,
    respuesta_recibida JSONB,
    estado_paso VARCHAR(30) NOT NULL DEFAULT 'SUCCESS' CHECK (estado_paso IN ('SUCCESS', 'FAILED', 'COMPENSATED')),
    compensacion_endpoint TEXT,
    compensacion_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saga_correlation ON schema_auditoria.saga_transacciones(correlation_id);
CREATE INDEX IF NOT EXISTS idx_saga_estado ON schema_auditoria.saga_transacciones(estado);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON schema_auditoria.auditoria_transaccional(modulo);

-- ============================================================================
-- 13. LIMPIEZA OBLIGATORIA DE LOGS EN BASE DE DATOS (MANDATO CÁTEDRA RDA2 §2)
-- Consideraciones RDA2 §2: "Cero logs en base de datos. La auditoría técnica 
-- debe residir única y exclusivamente en archivos físicos planos rotativos bajo logs/"
-- ============================================================================
DROP TABLE IF EXISTS public.api_request_logs CASCADE;
DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
DROP TABLE IF EXISTS public.panel_audit_logs CASCADE;
DROP TABLE IF EXISTS public.log_auditoria_vuelos CASCADE;

-- ============================================================================
-- FIN DEL SCRIPT MAESTRO DE MIGRACIÓN (12 ESQUEMAS CREADOS CON ÉXITO)
-- ============================================================================
