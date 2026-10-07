-- ============================================================================
-- ESQUEMA DE BASE DE DATOS PARA ALOJAMIENTOS
-- PostgreSQL / Supabase
-- Estructura optimizada en 3 tablas con soporte de documentos JSONB
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpieza preventiva
DROP TABLE IF EXISTS resenas_alojamiento CASCADE;
DROP TABLE IF EXISTS reservas_alojamiento CASCADE;
DROP TABLE IF EXISTS alojamientos CASCADE;

-- Limpieza de tablas heredadas si existieran
DROP TABLE IF EXISTS fotos_alojamiento CASCADE;
DROP TABLE IF EXISTS alojamiento_amenidades CASCADE;
DROP TABLE IF EXISTS amenidades CASCADE;
DROP TABLE IF EXISTS hosts CASCADE;
DROP TABLE IF EXISTS huespedes CASCADE;
DROP TABLE IF EXISTS disponibilidad_calendario CASCADE;

-- ============================================================================
-- 1. TABLA: ALOJAMIENTOS
-- Almacenamiento unificado de propiedades, características, multimedia y anfitriones
-- ============================================================================
CREATE TABLE alojamientos (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tipo_propiedad VARCHAR(100) DEFAULT 'Hotel / Resort',
    tipo_alojamiento VARCHAR(100) DEFAULT 'Habitación privada',
    destino VARCHAR(100) NOT NULL,
    precio_noche NUMERIC(10, 2) NOT NULL,
    moneda VARCHAR(10) DEFAULT 'USD',
    capacidad_adultos INT DEFAULT 2,
    capacidad_ninos INT DEFAULT 0,
    habitaciones INT DEFAULT 1,
    camas INT DEFAULT 1,
    banos NUMERIC(3, 1) DEFAULT 1.0,
    tiene_piscina BOOLEAN DEFAULT false,
    photos JSONB DEFAULT '[]'::jsonb,
    amenidades JSONB DEFAULT '[]'::jsonb,
    host JSONB DEFAULT '{}'::jsonb,
    ratings JSONB DEFAULT '{"score": 9.0, "number_of_reviews": 0}'::jsonb,
    ubicacion JSONB DEFAULT '{}'::jsonb,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX idx_alojamientos_destino ON alojamientos(destino);
CREATE INDEX idx_alojamientos_precio ON alojamientos(precio_noche);

-- ============================================================================
-- 2. TABLA: RESERVAS_ALOJAMIENTO
-- Registro de transacciones con soporte de idempotencia y desglose monetario
-- ============================================================================
CREATE TABLE reservas_alojamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_reserva VARCHAR(50) UNIQUE NOT NULL,
    alojamiento_id VARCHAR(50) NOT NULL REFERENCES alojamientos(id) ON DELETE CASCADE,
    cliente_nombre VARCHAR(150) NOT NULL,
    cliente_email VARCHAR(150),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    noches INT DEFAULT 1,
    huespedes INT DEFAULT 1,
    habitaciones_count INT DEFAULT 1,
    total NUMERIC(10, 2) NOT NULL,
    total_price JSONB,
    estado VARCHAR(50) DEFAULT 'CONFIRMED',
    idempotency_key VARCHAR(255) UNIQUE,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    actualizado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reservas_idempotency ON reservas_alojamiento(idempotency_key);
CREATE INDEX idx_reservas_alojamiento ON reservas_alojamiento(alojamiento_id);

-- ============================================================================
-- 3. TABLA: RESEÑAS_ALOJAMIENTO
-- Valoraciones y opiniones de los huéspedes
-- ============================================================================
CREATE TABLE resenas_alojamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alojamiento_id VARCHAR(50) NOT NULL REFERENCES alojamientos(id) ON DELETE CASCADE,
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

CREATE INDEX idx_resenas_alojamiento ON resenas_alojamiento(alojamiento_id);

-- ============================================================================
-- 4. TABLA: WEBHOOKS_ALOJAMIENTO
-- Suscripciones y entrega de eventos para socios y propietarios
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks_alojamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propietario_id VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    secret VARCHAR(255),
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_alojamiento_propietario ON webhooks_alojamiento(propietario_id);

-- ============================================================================
-- POBLADO INICIAL DE ALOJAMIENTOS CON MULTIMEDIA Y METADATOS
-- ============================================================================

INSERT INTO alojamientos (
    id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, precio_noche, moneda,
    capacidad_adultos, capacidad_ninos, habitaciones, camas, banos, tiene_piscina,
    photos, amenidades, host, ratings, ubicacion
) VALUES
(
    'hotel-cancun-01',
    'Grand Fiesta Americana Coral Beach',
    'Resort 5 estrellas frente a las aguas turquesas del Caribe. Cuenta con spa de clase mundial, 6 restaurantes gourmet y suites con balcón privado vista al mar.',
    'Resort Todo Incluido',
    'Suite Presidencial',
    'Cancún',
    320.00,
    'USD',
    4, 2, 2, 2, 2.0, true,
    '[
        {"url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200", "caption": "Piscina principal frente al mar"},
        {"url": "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200", "caption": "Suite con vista al Caribe"},
        {"url": "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200", "caption": "Terraza al atardecer"}
    ]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Vista panorámica al mar", "Gimnasio", "Acceso directo a playa privada"]'::jsonb,
    '{"id": "host-posadas-mex", "nombre": "Grupo Posadas México", "tiempo_respuesta": "en 1 hora", "es_superhost": true, "foto_perfil": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150"}'::jsonb,
    '{"score": 9.4, "limpieza": 9.7, "ubicacion": 9.8, "servicio": 9.5, "number_of_reviews": 412}'::jsonb,
    '{"address": "Blvd. Kukulcan km 9.5, Zona Hotelera", "city": "Cancún", "country": "MX", "coordinates": {"latitude": 21.1378, "longitude": -86.7469}}'::jsonb
),
(
    'hotel-cartagena-02',
    'Hotel Charleston Santa Teresa Cartagena',
    'Antiguo convento del siglo XVII transformado en el hotel boutique más exclusivo de la ciudad amurallada. Piscina infinita en azotea con vista al mar Caribe.',
    'Hotel Boutique Histórico',
    'Habitación Deluxe Colonial',
    'Cartagena',
    245.00,
    'USD',
    2, 0, 1, 1, 1.5, true,
    '[
        {"url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200", "caption": "Piscina en la azotea del claustro"},
        {"url": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200", "caption": "Habitación colonial de lujo"},
        {"url": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200", "caption": "Patio central con arcos"}
    ]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Restaurante Gourmet", "Bar y Lounge en azotea"]'::jsonb,
    '{"id": "host-decameron-co", "nombre": "Decameron All Inclusive", "tiempo_respuesta": "en pocas horas", "es_superhost": false, "foto_perfil": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150"}'::jsonb,
    '{"score": 9.6, "limpieza": 9.8, "ubicacion": 9.9, "servicio": 9.7, "number_of_reviews": 580}'::jsonb,
    '{"address": "Cra. 3 #31-23, Centro Amurallado", "city": "Cartagena", "country": "CO", "coordinates": {"latitude": 10.4223, "longitude": -75.5534}}'::jsonb
),
(
    'hotel-quito-03',
    'Casa Gangotena Relais & Châteaux',
    'Palacio renacentista situado en la emblemática Plaza San Francisco. Galardonado como uno de los mejores hoteles boutique de Sudamérica por su elegancia y gastronomía de autor.',
    'Palacio Patrimonial',
    'Luxury Suite',
    'Quito',
    280.00,
    'USD',
    3, 1, 1, 2, 1.5, false,
    '[
        {"url": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200", "caption": "Fachada y salón principal"},
        {"url": "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200", "caption": "Habitación señorial"},
        {"url": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200", "caption": "Mirador hacia la Plaza San Francisco"}
    ]'::jsonb,
    '["WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Parqueadero privado gratuito", "Restaurante Gourmet", "Traslado aeropuerto gratuito"]'::jsonb,
    '{"id": "host-boutique-quito", "nombre": "Hoteles Boutique del Ecuador", "tiempo_respuesta": "en pocos minutos", "es_superhost": true, "foto_perfil": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"}'::jsonb,
    '{"score": 9.7, "limpieza": 9.9, "ubicacion": 9.8, "servicio": 9.8, "number_of_reviews": 325}'::jsonb,
    '{"address": "Bolivar Cuenca esq., Plaza San Francisco", "city": "Quito", "country": "EC", "coordinates": {"latitude": -0.2209, "longitude": -78.5152}}'::jsonb
),
(
    'hotel-medellin-04',
    'The Click Clack Hotel Medellín',
    'Hotel de diseño vanguardista y arquitectura contemporánea en el corazón de El Poblado. Rodeado de vegetación, gastronomía de autor y vibrante vida nocturna.',
    'Design Hotel',
    'Room XL Urban View',
    'Medellín',
    160.00,
    'USD',
    2, 0, 1, 1, 1.0, true,
    '[
        {"url": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200", "caption": "Fachada verde y diseño contemporáneo"},
        {"url": "https://images.unsplash.com/photo-1591088398332-8a7791972843?w=1200", "caption": "Habitación industrial chic"},
        {"url": "https://images.unsplash.com/photo-1561501900-3701fa6a0864?w=1200", "caption": "Rooftop bar nocturno"}
    ]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Desayuno buffet incluido", "Gimnasio", "Restaurante Gourmet", "Bar y Lounge en azotea", "Pet Friendly"]'::jsonb,
    '{"id": "host-poblado-suites", "nombre": "Poblado Luxury Suites", "tiempo_respuesta": "en menos de una hora", "es_superhost": true, "foto_perfil": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"}'::jsonb,
    '{"score": 9.1, "limpieza": 9.3, "ubicacion": 9.7, "servicio": 9.2, "number_of_reviews": 290}'::jsonb,
    '{"address": "Cl. 10B #37-42, El Poblado", "city": "Medellín", "country": "CO", "coordinates": {"latitude": 6.2089, "longitude": -75.5684}}'::jsonb
),
(
    'hotel-puntacana-05',
    'The Westin Puntacana Resort & Club',
    'Exclusivo resort situado dentro del prestigioso complejo Puntacana Resort. Acceso a 5 kilómetros de playas de arena blanca virgen y campos de golf de campeonato.',
    'Luxury Golf & Beach Resort',
    'Ocean View Master Suite',
    'Punta Cana',
    390.00,
    'USD',
    4, 2, 2, 2, 2.0, true,
    '[
        {"url": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200", "caption": "Piscina infinita rodeada de palmeras"},
        {"url": "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200", "caption": "Vista aérea de la playa privada"},
        {"url": "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200", "caption": "Suite contemporánea de lujo"}
    ]'::jsonb,
    '["Piscina al aire libre", "WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Vista panorámica al mar", "Gimnasio", "Acceso directo a playa privada", "Restaurante Gourmet"]'::jsonb,
    '{"id": "host-marriott-latam", "nombre": "Marriott International", "tiempo_respuesta": "en menos de una hora", "es_superhost": true, "foto_perfil": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150"}'::jsonb,
    '{"score": 9.5, "limpieza": 9.6, "ubicacion": 9.9, "servicio": 9.6, "number_of_reviews": 470}'::jsonb,
    '{"address": "Playa Blanca, Puntacana Resort & Club", "city": "Punta Cana", "country": "DO", "coordinates": {"latitude": 18.5284, "longitude": -68.3712}}'::jsonb
),
(
    'hotel-cusco-06',
    'Palacio del Inka, a Luxury Collection Hotel',
    'Hotel de cinco siglos de historia construido sobre cimientos incas frente al templo de Qoricancha. Cuenta con patio colonial español y obras de arte cusqueñas.',
    'Hotel Museo Patrimonial',
    'Classic Inca Room',
    'Cusco',
    215.00,
    'USD',
    2, 0, 1, 1, 1.0, false,
    '[
        {"url": "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200", "caption": "Patio virreinal con fuente central"},
        {"url": "https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=1200", "caption": "Habitación con muros originales incas"}
    ]'::jsonb,
    '["WiFi 6 de alta velocidad", "Spa y Centro de bienestar", "Desayuno buffet incluido", "Restaurante Gourmet", "Traslado aeropuerto gratuito"]'::jsonb,
    '{"id": "host-marriott-latam", "nombre": "Marriott International", "tiempo_respuesta": "en menos de una hora", "es_superhost": true, "foto_perfil": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150"}'::jsonb,
    '{"score": 9.5, "limpieza": 9.7, "ubicacion": 9.8, "servicio": 9.6, "number_of_reviews": 385}'::jsonb,
    '{"address": "Plazoleta Santo Domingo 259", "city": "Cusco", "country": "PE", "coordinates": {"latitude": -13.5186, "longitude": -71.9774}}'::jsonb
);

-- ============================================================================
-- POBLADO INICIAL DE RESEÑAS
-- ============================================================================

INSERT INTO resenas_alojamiento (alojamiento_id, usuario_id, usuario_nombre, usuario_pais, comentario, puntuacion, limpieza, servicio, calidad) VALUES
('hotel-cancun-01', 'user-01', 'Alejandro Morales', 'México', 'Una experiencia inolvidable. Las instalaciones son impecables y el servicio de spa superó todas nuestras expectativas.', 9.8, 10.0, 9.5, 10.0),
('hotel-cartagena-02', 'user-02', 'Camila Restrepo', 'Colombia', 'La ubicación en el centro amurallado es mágica. Ver el atardecer desde la piscina de la azotea con una copa de vino no tiene precio.', 9.9, 10.0, 10.0, 9.8),
('hotel-quito-03', 'user-03', 'Jean-Luc Dupont', 'Francia', 'Hotel magnifique avec une histoire riche. Le personnel est aux petits soins et la vue sur la place San Francisco est sublime.', 9.7, 9.8, 9.8, 9.5),
('hotel-medellin-04', 'user-04', 'David Silva', 'Ecuador', 'Muy buen ambiente, diseño moderno e innovador. La ubicación en el Poblado te permite ir caminando a los mejores restaurantes y cafés.', 9.3, 9.5, 9.0, 9.4);
