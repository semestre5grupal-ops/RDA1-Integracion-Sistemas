-- ============================================================================
-- SCRIPT 03: ESQUEMA COMPLETO Y SEMILLAS DE ALOJAMIENTOS (schema_alojamientos)
-- Proyecto: Booking Prototipo — Reto 2: Integración de Sistemas (RDA2)
-- Propósito:
--   1. Garantizar que schema_alojamientos tenga las 7 tablas completas con
--      TODAS las columnas que usan tanto el microservicio MS_ALO (TypeORM)
--      como el ESB, GraphQL BFF y DataLoaders.
--   2. Poblar el catálogo inicial de hoteles, tipos de habitación, reseñas,
--      nodo de salud (NODE_ALO_LOCAL) y acuerdo B2B de promociones.
-- Idempotente: Se puede ejecutar múltiples veces en el SQL Editor de Supabase.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS schema_alojamientos;

-- ============================================================================
-- 1. PROVEEDORES DE ALOJAMIENTO (schema_alojamientos.proveedores_alojamiento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.proveedores_alojamiento (
  id               VARCHAR(60)  PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL,
  email_contacto   VARCHAR(150),
  api_key_hash     CHAR(64),
  api_key_prefijo  VARCHAR(16),
  activo           BOOLEAN      NOT NULL DEFAULT true,
  ultimo_uso       TIMESTAMP WITHOUT TIME ZONE,
  creado_en        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CATÁLOGO DE ALOJAMIENTOS (schema_alojamientos.alojamientos_catalogo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_catalogo (
    id VARCHAR(64) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tipo_propiedad VARCHAR(100) NOT NULL DEFAULT 'Hotel',
    tipo_alojamiento VARCHAR(100) DEFAULT 'Habitación privada',
    destino VARCHAR(100) DEFAULT 'Quito',
    ciudad VARCHAR(100) DEFAULT 'Quito',
    pais VARCHAR(60) DEFAULT 'Ecuador',
    direccion VARCHAR(255),
    latitud NUMERIC(10, 7) DEFAULT -0.180653,
    longitud NUMERIC(10, 7) DEFAULT -78.467838,
    precio_noche NUMERIC(10, 2) DEFAULT 85.00,
    precio_noche_base NUMERIC(10, 2) DEFAULT 85.00,
    moneda VARCHAR(10) NOT NULL DEFAULT 'USD',
    capacidad_adultos INT DEFAULT 2,
    capacidad_ninos INT DEFAULT 0,
    habitaciones INT DEFAULT 1,
    camas INT DEFAULT 1,
    banos NUMERIC(3, 1) DEFAULT 1.0,
    tiene_piscina BOOLEAN DEFAULT false,
    photos JSONB DEFAULT '[]'::jsonb,
    fotos_urls TEXT[] DEFAULT ARRAY['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    amenidades JSONB DEFAULT '[]'::jsonb,
    host JSONB DEFAULT '{}'::jsonb,
    ratings JSONB DEFAULT '{"score": 9.2, "number_of_reviews": 0}'::jsonb,
    rating_general NUMERIC(3, 1) DEFAULT 9.2,
    ubicacion JSONB DEFAULT '{}'::jsonb,
    proveedor_id VARCHAR(60),
    id_externo VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    activo BOOLEAN DEFAULT TRUE,
    politicas JSONB,
    ultima_sincronizacion TIMESTAMP WITHOUT TIME ZONE,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMP WITHOUT TIME ZONE
);

ALTER TABLE schema_alojamientos.alojamientos_catalogo
  ALTER COLUMN precio_noche_base DROP NOT NULL,
  ALTER COLUMN ciudad DROP NOT NULL,
  ALTER COLUMN pais DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS tipo_alojamiento varchar(100) DEFAULT 'Habitación privada',
  ADD COLUMN IF NOT EXISTS destino varchar(100),
  ADD COLUMN IF NOT EXISTS precio_noche numeric(10,2),
  ADD COLUMN IF NOT EXISTS capacidad_adultos int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS capacidad_ninos int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS habitaciones int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS camas int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS banos numeric(3,1) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS tiene_piscina boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS host jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ratings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ubicacion jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS proveedor_id varchar(60),
  ADD COLUMN IF NOT EXISTS id_externo varchar(100),
  ADD COLUMN IF NOT EXISTS estado varchar(20) DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS politicas jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacion timestamp,
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamp DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- ============================================================================
-- 3. TIPOS DE HABITACIÓN (schema_alojamientos.alojamientos_tipos_habitacion)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_tipos_habitacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alojamiento_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_catalogo(id) ON DELETE CASCADE,
    codigo VARCHAR(60) DEFAULT 'estandar',
    nombre VARCHAR(150) DEFAULT 'Habitación Estándar',
    nombre_tipo VARCHAR(150) DEFAULT 'Habitación Estándar',
    descripcion TEXT,
    capacidad_adultos INT NOT NULL DEFAULT 2,
    capacidad_ninos INT NOT NULL DEFAULT 1,
    camas SMALLINT DEFAULT 1,
    descripcion_camas VARCHAR(150) DEFAULT '1 Cama King',
    tamano_m2 NUMERIC(6, 1) DEFAULT 28.0,
    precio_noche NUMERIC(10, 2) NOT NULL DEFAULT 85.00,
    cantidad SMALLINT DEFAULT 5,
    cupo_habitaciones INT DEFAULT 5,
    regimen VARCHAR(20) DEFAULT 'SOLO_ALOJAMIENTO',
    cancelacion_gratuita_horas SMALLINT DEFAULT 48,
    amenidades JSONB DEFAULT '[]'::jsonb,
    photos JSONB DEFAULT '[]'::jsonb,
    activo BOOLEAN DEFAULT true,
    orden SMALLINT DEFAULT 1,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schema_alojamientos.alojamientos_tipos_habitacion
  ALTER COLUMN nombre_tipo DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS codigo varchar(60),
  ADD COLUMN IF NOT EXISTS nombre varchar(150),
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS descripcion_camas varchar(150),
  ADD COLUMN IF NOT EXISTS tamano_m2 numeric(6,1),
  ADD COLUMN IF NOT EXISTS cantidad smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regimen varchar(20) DEFAULT 'SOLO_ALOJAMIENTO',
  ADD COLUMN IF NOT EXISTS cancelacion_gratuita_horas smallint DEFAULT 48,
  ADD COLUMN IF NOT EXISTS amenidades jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS orden smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamp DEFAULT NOW();

-- Asegurar que la columna camas sea compatible con SMALLINT si fue creada como VARCHAR en 01_master
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'schema_alojamientos'
      AND table_name = 'alojamientos_tipos_habitacion'
      AND column_name = 'camas'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE schema_alojamientos.alojamientos_tipos_habitacion
      ALTER COLUMN camas DROP DEFAULT,
      ALTER COLUMN camas TYPE SMALLINT USING (CASE WHEN camas ~ '^[0-9]+$' THEN camas::smallint ELSE 1 END),
      ALTER COLUMN camas SET DEFAULT 1;
  END IF;
END $$;

-- ============================================================================
-- 4. RESERVAS DE ALOJAMIENTO (schema_alojamientos.alojamientos_reservas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_reservas (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    codigo_reserva VARCHAR(50),
    alojamiento_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_catalogo(id),
    tipo_habitacion_id UUID REFERENCES schema_alojamientos.alojamientos_tipos_habitacion(id),
    usuario_id UUID,
    cliente_id UUID,
    cliente_nombre VARCHAR(150),
    nombre_titular VARCHAR(150),
    cliente_email VARCHAR(150),
    email_titular VARCHAR(150),
    cliente_telefono VARCHAR(30),
    fecha_inicio DATE,
    fecha_checkin DATE,
    fecha_fin DATE,
    fecha_checkout DATE,
    noches INT NOT NULL DEFAULT 1,
    adultos SMALLINT DEFAULT 1,
    ninos SMALLINT DEFAULT 0,
    huespedes_total INT NOT NULL DEFAULT 2,
    habitaciones_count INT DEFAULT 1,
    precio_noche NUMERIC(10, 2),
    moneda VARCHAR(3) DEFAULT 'USD',
    total NUMERIC(10, 2),
    precio_total NUMERIC(10, 2),
    total_price JSONB,
    estado VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
    peticiones_especiales TEXT,
    hora_llegada VARCHAR(20),
    motivo_cancelacion VARCHAR(500),
    cancelada_en TIMESTAMP WITHOUT TIME ZONE,
    habitacion_asignada VARCHAR(50),
    clave_acceso_digital VARCHAR(50),
    checkin_liberado_a_las_14 BOOLEAN NOT NULL DEFAULT FALSE,
    checkin_completado_at TIMESTAMPTZ,
    idempotency_key VARCHAR(255) UNIQUE,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schema_alojamientos.alojamientos_reservas
  ALTER COLUMN cliente_id DROP NOT NULL,
  ALTER COLUMN nombre_titular DROP NOT NULL,
  ALTER COLUMN email_titular DROP NOT NULL,
  ALTER COLUMN fecha_checkin DROP NOT NULL,
  ALTER COLUMN fecha_checkout DROP NOT NULL,
  ALTER COLUMN precio_total DROP NOT NULL,
  ALTER COLUMN tipo_habitacion_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS alojamientos_reservas_estado_check,
  ADD COLUMN IF NOT EXISTS codigo_reserva varchar(50),
  ADD COLUMN IF NOT EXISTS cliente_nombre varchar(150),
  ADD COLUMN IF NOT EXISTS cliente_email varchar(150),
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS habitaciones_count int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_price jsonb,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS adultos smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ninos smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_noche numeric(10,2),
  ADD COLUMN IF NOT EXISTS moneda varchar(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS cliente_telefono varchar(30),
  ADD COLUMN IF NOT EXISTS peticiones_especiales text,
  ADD COLUMN IF NOT EXISTS hora_llegada varchar(20),
  ADD COLUMN IF NOT EXISTS motivo_cancelacion varchar(500),
  ADD COLUMN IF NOT EXISTS cancelada_en timestamp,
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamp DEFAULT NOW();

-- ============================================================================
-- 5. HUÉSPEDES POR RESERVA (schema_alojamientos.alojamientos_huespedes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_huespedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reserva_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_reservas(id) ON DELETE CASCADE,
    orden SMALLINT DEFAULT 1,
    es_titular BOOLEAN NOT NULL DEFAULT FALSE,
    tipo VARCHAR(10) DEFAULT 'ADULTO',
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL DEFAULT '',
    edad INT,
    documento_tipo VARCHAR(20),
    documento_numero VARCHAR(30),
    nacionalidad VARCHAR(2),
    email VARCHAR(150),
    telefono VARCHAR(30),
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schema_alojamientos.alojamientos_huespedes
  ADD COLUMN IF NOT EXISTS orden smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo varchar(10) DEFAULT 'ADULTO',
  ADD COLUMN IF NOT EXISTS documento_tipo varchar(20),
  ADD COLUMN IF NOT EXISTS nacionalidad varchar(2),
  ADD COLUMN IF NOT EXISTS email varchar(150),
  ADD COLUMN IF NOT EXISTS telefono varchar(30),
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT NOW();

-- ============================================================================
-- 6. RESEÑAS DE ALOJAMIENTO (schema_alojamientos.resenas_alojamiento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.resenas_alojamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alojamiento_id VARCHAR(64) NOT NULL REFERENCES schema_alojamientos.alojamientos_catalogo(id) ON DELETE CASCADE,
    usuario_id VARCHAR(100) NOT NULL,
    usuario_nombre VARCHAR(100) DEFAULT 'Anónimo',
    usuario_pais VARCHAR(100) DEFAULT 'Ecuador',
    comentario TEXT NOT NULL,
    puntuacion FLOAT DEFAULT 10.0,
    limpieza FLOAT DEFAULT 10.0,
    servicio FLOAT DEFAULT 10.0,
    calidad FLOAT DEFAULT 10.0,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 7. TRANSACTIONAL OUTBOX (schema_alojamientos.alojamientos_eventos_outbox)
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_eventos_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    published_rabbit BOOLEAN NOT NULL DEFAULT FALSE,
    published_kafka BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alojamientos_outbox
  ON schema_alojamientos.alojamientos_eventos_outbox(published_rabbit, published_kafka);

-- ============================================================================
-- 8. SEMILLAS DE CATÁLOGO INICIAL DE ALOJAMIENTOS Y TIPOS DE HABITACIÓN
-- ============================================================================
INSERT INTO schema_alojamientos.alojamientos_catalogo (
    id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, ciudad, pais,
    precio_noche, precio_noche_base, moneda, capacidad_adultos, capacidad_ninos,
    habitaciones, camas, banos, tiene_piscina, photos, amenidades, host, ratings, ubicacion, estado, activo
) VALUES
(
    'hotel-quito-03',
    'Casa Gangotena Relais & Châteaux',
    'Palacio renacentista situado en la emblemática Plaza San Francisco. Galardonado como uno de los mejores hoteles boutique de Sudamérica por su elegancia y gastronomía de autor.',
    'Palacio Patrimonial',
    'Luxury Suite',
    'Quito', 'Quito', 'Ecuador',
    280.00, 280.00, 'USD', 3, 1, 6, 2, 1.5, false,
    '[{"url": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200", "caption": "Fachada y salón principal"}]'::jsonb,
    '["WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Parqueadero privado gratuito", "Restaurante Gourmet"]'::jsonb,
    '{"id": "host-boutique-quito", "nombre": "Hoteles Boutique del Ecuador", "es_superhost": true}'::jsonb,
    '{"score": 9.7, "limpieza": 9.9, "ubicacion": 9.8, "servicio": 9.8, "number_of_reviews": 325}'::jsonb,
    '{"address": "Bolivar y Cuenca, Plaza San Francisco", "city": "Quito", "country": "EC", "coordinates": {"latitude": -0.2209, "longitude": -78.5152}}'::jsonb,
    'ACTIVO', true
),
(
    'hotel-cancun-01',
    'Grand Fiesta Americana Coral Beach',
    'Resort 5 estrellas frente a las aguas turquesas del Caribe. Cuenta con spa de clase mundial, 6 restaurantes gourmet y suites con balcón privado vista al mar.',
    'Resort Todo Incluido',
    'Suite Presidencial',
    'Cancún', 'Cancún', 'México',
    320.00, 320.00, 'USD', 4, 2, 8, 2, 2.0, true,
    '[{"url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200", "caption": "Piscina principal frente al mar"}]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Vista panorámica al mar"]'::jsonb,
    '{"id": "host-posadas-mex", "nombre": "Grupo Posadas México", "es_superhost": true}'::jsonb,
    '{"score": 9.4, "limpieza": 9.7, "ubicacion": 9.8, "servicio": 9.5, "number_of_reviews": 412}'::jsonb,
    '{"address": "Blvd. Kukulcan km 9.5, Zona Hotelera", "city": "Cancún", "country": "MX", "coordinates": {"latitude": 21.1378, "longitude": -86.7469}}'::jsonb,
    'ACTIVO', true
),
(
    'hotel-cartagena-02',
    'Hotel Charleston Santa Teresa Cartagena',
    'Antiguo convento del siglo XVII transformado en el hotel boutique más exclusivo de la ciudad amurallada. Piscina infinita en azotea con vista al mar Caribe.',
    'Hotel Boutique Histórico',
    'Habitación Deluxe Colonial',
    'Cartagena', 'Cartagena', 'Colombia',
    245.00, 245.00, 'USD', 2, 0, 6, 1, 1.5, true,
    '[{"url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200", "caption": "Piscina en la azotea del claustro"}]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido"]'::jsonb,
    '{"id": "host-decameron-co", "nombre": "Decameron All Inclusive", "es_superhost": false}'::jsonb,
    '{"score": 9.6, "limpieza": 9.8, "ubicacion": 9.9, "servicio": 9.7, "number_of_reviews": 580}'::jsonb,
    '{"address": "Cra. 3 #31-23, Centro Amurallado", "city": "Cartagena", "country": "CO", "coordinates": {"latitude": 10.4223, "longitude": -75.5534}}'::jsonb,
    'ACTIVO', true
)
ON CONFLICT (id) DO NOTHING;

-- Crear tipo de habitación estándar para cada alojamiento que aún no tenga uno
INSERT INTO schema_alojamientos.alojamientos_tipos_habitacion (
    alojamiento_id, codigo, nombre, nombre_tipo, descripcion,
    capacidad_adultos, capacidad_ninos, camas, descripcion_camas, tamano_m2,
    precio_noche, cantidad, cupo_habitaciones, regimen, cancelacion_gratuita_horas, amenidades, activo, orden
)
SELECT
    a.id,
    'estandar',
    COALESCE(a.tipo_alojamiento, 'Habitación Estándar'),
    COALESCE(a.tipo_alojamiento, 'Habitación Estándar'),
    'Habitación principal equipada con todas las comodidades de la propiedad.',
    COALESCE(a.capacidad_adultos, 2),
    COALESCE(a.capacidad_ninos, 0),
    COALESCE(a.camas, 1)::smallint,
    '1 cama king',
    32.0,
    COALESCE(a.precio_noche, a.precio_noche_base, 85.00),
    GREATEST(COALESCE(a.habitaciones, 5), 5)::smallint,
    GREATEST(COALESCE(a.habitaciones, 5), 5),
    'DESAYUNO',
    48,
    COALESCE(a.amenidades, '["WiFi gratis","Desayuno incluido"]'::jsonb),
    true,
    1
FROM schema_alojamientos.alojamientos_catalogo a
WHERE NOT EXISTS (
    SELECT 1 FROM schema_alojamientos.alojamientos_tipos_habitacion t
    WHERE t.alojamiento_id = a.id
);


