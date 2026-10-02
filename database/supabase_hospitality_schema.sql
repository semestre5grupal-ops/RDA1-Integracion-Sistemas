-- ============================================================================
-- BASE DE DATOS HOTELERA Y ALOJAMIENTOS - ESTÁNDAR OPEN HOSPITALITY & INSIDE AIRBNB
-- Diseñada para PostgreSQL / Supabase
-- ============================================================================

-- Extensión para generación de UUIDs si no estuviera activa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpieza preventiva en cascada (para poder re-ejecutar el script limpiamente)
DROP TABLE IF EXISTS resenas_alojamiento CASCADE;
DROP TABLE IF EXISTS reservas_alojamiento CASCADE;
DROP TABLE IF EXISTS huespedes CASCADE;
DROP TABLE IF EXISTS disponibilidad_calendario CASCADE;
DROP TABLE IF EXISTS fotos_alojamiento CASCADE;
DROP TABLE IF EXISTS alojamiento_amenidades CASCADE;
DROP TABLE IF EXISTS amenidades CASCADE;
DROP TABLE IF EXISTS alojamientos CASCADE;
DROP TABLE IF EXISTS hosts CASCADE;

-- ============================================================================
-- 1. TABLA: HOSTS / OPERADORES HOTELEROS
-- Basada en la especificación de administradores de propiedades
-- ============================================================================
CREATE TABLE hosts (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    acerca_de TEXT,
    tiempo_respuesta VARCHAR(50) DEFAULT 'en menos de una hora',
    tasa_respuesta INT DEFAULT 98,
    es_superhost BOOLEAN DEFAULT true,
    foto_perfil TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. TABLA: ALOJAMIENTOS / PROPIEDADES (LISTINGS)
-- Atributos granulares: ubicación geográfica, tipología, capacidad y ratings
-- ============================================================================
CREATE TABLE alojamientos (
    id VARCHAR(50) PRIMARY KEY,
    host_id VARCHAR(50) REFERENCES hosts(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tipo_propiedad VARCHAR(100) DEFAULT 'Hotel / Resort',
    tipo_alojamiento VARCHAR(100) DEFAULT 'Habitación privada',
    destino VARCHAR(100) NOT NULL,
    barrio VARCHAR(150),
    direccion VARCHAR(255),
    latitud NUMERIC(10, 7),
    longitud NUMERIC(10, 7),
    capacidad_maxima INT DEFAULT 2,
    habitaciones INT DEFAULT 1,
    camas INT DEFAULT 1,
    banos NUMERIC(3, 1) DEFAULT 1.0,
    precio_noche NUMERIC(10, 2) NOT NULL,
    moneda VARCHAR(10) DEFAULT 'USD',
    rating NUMERIC(3, 2) DEFAULT 9.00,
    rating_limpieza NUMERIC(3, 2) DEFAULT 9.40,
    rating_ubicacion NUMERIC(3, 2) DEFAULT 9.70,
    rating_servicio NUMERIC(3, 2) DEFAULT 9.30,
    total_reviews INT DEFAULT 0,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alojamientos_destino ON alojamientos(destino);
CREATE INDEX idx_alojamientos_precio ON alojamientos(precio_noche);

-- ============================================================================
-- 3. TABLA: CATÁLOGO DE AMENIDADES / SERVICIOS
-- Normalizado para permitir filtrado profesional (piscina, wifi, spa, etc.)
-- ============================================================================
CREATE TABLE amenidades (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    categoria VARCHAR(50) NOT NULL, -- 'Básicos', 'Instalaciones', 'Bienestar', 'Gastronomía'
    icono VARCHAR(50) -- Identificador de icono para el frontend
);

-- ============================================================================
-- 4. TABLA INTERMEDIA: ALOJAMIENTO_AMENIDADES (Relación N:M)
-- ============================================================================
CREATE TABLE alojamiento_amenidades (
    alojamiento_id VARCHAR(50) REFERENCES alojamientos(id) ON DELETE CASCADE,
    amenidad_id INT REFERENCES amenidades(id) ON DELETE CASCADE,
    PRIMARY KEY (alojamiento_id, amenidad_id)
);

-- ============================================================================
-- 5. TABLA: FOTOS / MULTIMEDIA EN ALTA RESOLUCIÓN
-- Soporta múltiples fotos por propiedad con indicación de portada
-- ============================================================================
CREATE TABLE fotos_alojamiento (
    id SERIAL PRIMARY KEY,
    alojamiento_id VARCHAR(50) REFERENCES alojamientos(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    titulo VARCHAR(150),
    es_principal BOOLEAN DEFAULT false,
    orden INT DEFAULT 0
);

CREATE INDEX idx_fotos_alojamiento_id ON fotos_alojamiento(alojamiento_id);

-- ============================================================================
-- 6. TABLA: DISPONIBILIDAD Y TARIFAS POR CALENDARIO (CALENDAR)
-- Estándar Inside Airbnb para control día a día de precios y stock
-- ============================================================================
CREATE TABLE disponibilidad_calendario (
    id SERIAL PRIMARY KEY,
    alojamiento_id VARCHAR(50) REFERENCES alojamientos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    disponible BOOLEAN DEFAULT true,
    precio_noche NUMERIC(10, 2) NOT NULL,
    CONSTRAINT uq_alojamiento_fecha UNIQUE (alojamiento_id, fecha)
);

CREATE INDEX idx_calendario_fecha ON disponibilidad_calendario(alojamiento_id, fecha);

-- ============================================================================
-- 7. TABLA: HUÉSPEDES / CLIENTES
-- Directorio de personas que reservan en la plataforma
-- ============================================================================
CREATE TABLE huespedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    telefono VARCHAR(50),
    doc_tipo VARCHAR(20) DEFAULT 'Pasaporte',
    doc_numero VARCHAR(50),
    nacionalidad VARCHAR(50),
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. TABLA: RESERVAS_ALOJAMIENTO
-- Núcleo transaccional con llave de Idempotencia y estados
-- ============================================================================
CREATE TABLE reservas_alojamiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_reserva VARCHAR(50) UNIQUE NOT NULL,
    alojamiento_id VARCHAR(50) REFERENCES alojamientos(id) ON DELETE RESTRICT,
    huesped_id UUID REFERENCES huespedes(id) ON DELETE SET NULL,
    cliente_nombre VARCHAR(150) NOT NULL,
    cliente_email VARCHAR(150) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    huespedes INT NOT NULL DEFAULT 1,
    total NUMERIC(10, 2) NOT NULL,
    estado VARCHAR(50) DEFAULT 'CONFIRMADA', -- 'PENDIENTE', 'CONFIRMADA', 'CANCELADA'
    idempotency_key VARCHAR(255) UNIQUE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservas_idempotency ON reservas_alojamiento(idempotency_key);
CREATE INDEX idx_reservas_alojamiento ON reservas_alojamiento(alojamiento_id);

-- ============================================================================
-- 9. TABLA: RESEÑAS / REVIEWS (INSIDE AIRBNB FORMAT)
-- Comentarios reales y calificaciones detalladas
-- ============================================================================
CREATE TABLE resenas_alojamiento (
    id SERIAL PRIMARY KEY,
    alojamiento_id VARCHAR(50) REFERENCES alojamientos(id) ON DELETE CASCADE,
    reviewer_name VARCHAR(100) NOT NULL,
    fecha DATE DEFAULT CURRENT_DATE,
    puntuacion NUMERIC(3, 1) NOT NULL,
    comentario TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resenas_alojamiento ON resenas_alojamiento(alojamiento_id);

-- ============================================================================
-- POBLADO INICIAL CON DATOS VALIDADOS DE LA INDUSTRIA HOTELERA
-- ============================================================================

-- 1. Insertar Hosts / Operadores
INSERT INTO hosts (id, nombre, acerca_de, tiempo_respuesta, tasa_respuesta, es_superhost, foto_perfil) VALUES
('host-marriott-latam', 'Marriott International Latin America', 'Cadena hotelera de lujo con presencia en los mejores destinos del Caribe y Sudamérica.', 'en menos de una hora', 99, true, 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150'),
('host-posadas-mex', 'Grupo Posadas México', 'Operadora líder en hospitalidad mexicana con resorts todo incluido y hoteles de negocios.', 'en 1 hora', 96, true, 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150'),
('host-decameron-co', 'Decameron All Inclusive Hotels & Resorts', 'Especialistas en vacaciones frente al mar con servicio todo incluido de primera clase.', 'en pocas horas', 94, false, 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150'),
('host-boutique-quito', 'Colección de Hoteles Boutique del Ecuador', 'Casas coloniales y haciendas históricas restauradas con encanto y calidez patrimonial.', 'en pocos minutos', 100, true, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'),
('host-poblado-suites', 'Poblado Luxury Suites & Penthouses', 'Propiedades de diseño moderno y alta tecnología en la mejor zona de Medellín.', 'en menos de una hora', 98, true, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150');

-- 2. Insertar Catálogo de Amenidades
INSERT INTO amenidades (nombre, categoria, icono) VALUES
('Piscina al aire libre', 'Instalaciones', 'swimming-pool'),
('WiFi 6 de alta velocidad', 'Básicos', 'wifi'),
('Spa y Centro de bienestar', 'Bienestar', 'spa'),
('Desayuno buffet incluido', 'Gastronomía', 'utensils'),
('Parqueadero privado gratuito', 'Instalaciones', 'parking'),
('Aire acondicionado central', 'Básicos', 'snowflake'),
('Vista panorámica al mar', 'Instalaciones', 'water'),
('Gimnasio de última generación', 'Bienestar', 'dumbbell'),
('Restaurante Gourmet', 'Gastronomía', 'wine-glass'),
('Acceso directo a playa privada', 'Instalaciones', 'umbrella-beach'),
('Bar y Lounge en azotea', 'Gastronomía', 'cocktail'),
('Pet Friendly', 'Servicios', 'dog'),
('Traslado aeropuerto gratuito', 'Servicios', 'shuttle-van'),
('Servicio a la habitación 24 horas', 'Servicios', 'concierge-bell');

-- 3. Insertar Alojamientos / Hoteles
INSERT INTO alojamientos (id, host_id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, barrio, direccion, latitud, longitud, capacidad_maxima, habitaciones, camas, banos, precio_noche, moneda, rating, rating_limpieza, rating_ubicacion, rating_servicio, total_reviews) VALUES
('hotel-cancun-01', 'host-posadas-mex', 'Grand Fiesta Americana Coral Beach', 'Resort 5 estrellas frente a las aguas turquesas del Caribe. Cuenta con spa de clase mundial, 6 restaurantes gourmet y suites con balcón privado vista al mar.', 'Resort Todo Incluido', 'Suite Presidencial', 'Cancún', 'Zona Hotelera', 'Blvd. Kukulcan km 9.5, Zona Hotelera, Cancún, México', 21.1378000, -86.7469000, 4, 2, 2, 2.0, 320.00, 'USD', 9.40, 9.70, 9.80, 9.50, 412),
('hotel-cartagena-02', 'host-decameron-co', 'Hotel Charleston Santa Teresa Cartagena', 'Antiguo convento del siglo XVII transformado en el hotel boutique más exclusivo de la ciudad amurallada. Piscina infinita en azotea con vista al mar Caribe.', 'Hotel Boutique Histórico', 'Habitación Deluxe Colonial', 'Cartagena', 'Ciudad Amurallada', 'Cra. 3 #31-23, Centro, Cartagena de Indias, Colombia', 10.4223000, -75.5534000, 2, 1, 1, 1.5, 245.00, 'USD', 9.60, 9.80, 9.90, 9.70, 580),
('hotel-quito-03', 'host-boutique-quito', 'Casa Gangotena Relais & Châteaux', 'Palacio renacentista situado en la emblemática Plaza San Francisco. Galardonado como uno de los mejores hoteles boutique de Sudamérica por su elegancia y gastronomía de autor.', 'Palacio Patrimonial', 'Luxury Suite', 'Quito', 'Centro Histórico', 'Bolivar Cuenca esq., Plaza San Francisco, Quito, Ecuador', -0.2209000, -78.5152000, 3, 1, 2, 1.5, 280.00, 'USD', 9.70, 9.90, 9.80, 9.80, 325),
('hotel-medellin-04', 'host-poblado-suites', 'The Click Clack Hotel Medellín', 'Hotel de diseño vanguardista y arquitectura contemporánea en el corazón de El Poblado. Rodeado de vegetación, gastronomía de autor y vibrante vida nocturna.', 'Design Hotel', 'Room XL Urban View', 'Medellín', 'El Poblado', 'Cl. 10B #37-42, El Poblado, Medellín, Colombia', 6.2089000, -75.5684000, 2, 1, 1, 1.0, 160.00, 'USD', 9.10, 9.30, 9.70, 9.20, 290),
('hotel-puntacana-05', 'host-marriott-latam', 'The Westin Puntacana Resort & Club', 'Exclusivo resort situado dentro del prestigioso complejo Puntacana Resort. Acceso a 5 kilómetros de playas de arena blanca virgen y campos de golf de campeonato.', 'Luxury Golf & Beach Resort', 'Ocean View Master Suite', 'Punta Cana', 'Puntacana Resort', 'Playa Blanca, Puntacana Resort & Club, República Dominicana', 18.5284000, -68.3712000, 4, 2, 2, 2.0, 390.00, 'USD', 9.50, 9.60, 9.90, 9.60, 470),
('hotel-cusco-06', 'host-marriott-latam', 'Palacio del Inka, a Luxury Collection Hotel', 'Hotel de cinco siglos de historia construido sobre cimientos incas frente al templo de Qoricancha. Cuenta con patio colonial español y obras de arte cusqueñas.', 'Hotel Museo Patrimonial', 'Classic Inca Room', 'Cusco', 'Centro Histórico', 'Plazoleta Santo Domingo 259, Cusco, Perú', -13.5186000, -71.9774000, 2, 1, 1, 1.0, 215.00, 'USD', 9.50, 9.70, 9.80, 9.60, 385);

-- 4. Asociar Amenidades a Alojamientos (Tabla puente)
INSERT INTO alojamiento_amenidades (alojamiento_id, amenidad_id) VALUES
-- Cancún
('hotel-cancun-01', 1), ('hotel-cancun-01', 2), ('hotel-cancun-01', 3), ('hotel-cancun-01', 4), ('hotel-cancun-01', 6), ('hotel-cancun-01', 7), ('hotel-cancun-01', 8), ('hotel-cancun-01', 9), ('hotel-cancun-01', 10), ('hotel-cancun-01', 14),
-- Cartagena
('hotel-cartagena-02', 1), ('hotel-cartagena-02', 2), ('hotel-cartagena-02', 3), ('hotel-cartagena-02', 4), ('hotel-cartagena-02', 6), ('hotel-cartagena-02', 9), ('hotel-cartagena-02', 11), ('hotel-cartagena-02', 14),
-- Quito
('hotel-quito-03', 2), ('hotel-quito-03', 3), ('hotel-quito-03', 4), ('hotel-quito-03', 5), ('hotel-quito-03', 9), ('hotel-quito-03', 11), ('hotel-quito-03', 13), ('hotel-quito-03', 14),
-- Medellín
('hotel-medellin-04', 1), ('hotel-medellin-04', 2), ('hotel-medellin-04', 4), ('hotel-medellin-04', 6), ('hotel-medellin-04', 8), ('hotel-medellin-04', 9), ('hotel-medellin-04', 11), ('hotel-medellin-04', 12),
-- Punta Cana
('hotel-puntacana-05', 1), ('hotel-puntacana-05', 2), ('hotel-puntacana-05', 3), ('hotel-puntacana-05', 4), ('hotel-puntacana-05', 5), ('hotel-puntacana-05', 6), ('hotel-puntacana-05', 7), ('hotel-puntacana-05', 8), ('hotel-puntacana-05', 10), ('hotel-puntacana-05', 14),
-- Cusco
('hotel-cusco-06', 2), ('hotel-cusco-06', 3), ('hotel-cusco-06', 4), ('hotel-cusco-06', 5), ('hotel-cusco-06', 8), ('hotel-cusco-06', 9), ('hotel-cusco-06', 13), ('hotel-cusco-06', 14);

-- 5. Insertar Fotos de Galería HD
INSERT INTO fotos_alojamiento (alojamiento_id, url, titulo, es_principal, orden) VALUES
('hotel-cancun-01', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200', 'Piscina principal frente al mar', true, 1),
('hotel-cancun-01', 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200', 'Suite con vista al Caribe', false, 2),
('hotel-cancun-01', 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200', 'Terraza al atardecer', false, 3),

('hotel-cartagena-02', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200', 'Piscina en la azotea del claustro', true, 1),
('hotel-cartagena-02', 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200', 'Habitación colonial de lujo', false, 2),
('hotel-cartagena-02', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200', 'Patio central con arcos', false, 3),

('hotel-quito-03', 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200', 'Fachada y salón principal', true, 1),
('hotel-quito-03', 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200', 'Habitación señorial', false, 2),
('hotel-quito-03', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200', 'Mirador hacia la Plaza San Francisco', false, 3),

('hotel-medellin-04', 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200', 'Fachada verde y arquitectura de diseño', true, 1),
('hotel-medellin-04', 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=1200', 'Habitación industrial chic', false, 2),
('hotel-medellin-04', 'https://images.unsplash.com/photo-1561501900-3701fa6a0864?w=1200', 'Rooftop bar nocturno', false, 3),

('hotel-puntacana-05', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200', 'Piscina infinita rodeada de palmeras', true, 1),
('hotel-puntacana-05', 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200', 'Vista aérea de la playa privada', false, 2),
('hotel-puntacana-05', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200', 'Suite contemporánea de lujo', false, 3),

('hotel-cusco-06', 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200', 'Patio virreinal con fuente central', true, 1),
('hotel-cusco-06', 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=1200', 'Habitación con muros originales incas', false, 2);

-- 6. Insertar Disponibilidad y Tarifas en Calendario (Muestra)
INSERT INTO disponibilidad_calendario (alojamiento_id, fecha, disponible, precio_noche) VALUES
('hotel-cancun-01', CURRENT_DATE, true, 320.00),
('hotel-cancun-01', CURRENT_DATE + INTERVAL '1 day', true, 320.00),
('hotel-cancun-01', CURRENT_DATE + INTERVAL '2 day', true, 340.00),
('hotel-cartagena-02', CURRENT_DATE, true, 245.00),
('hotel-cartagena-02', CURRENT_DATE + INTERVAL '1 day', true, 245.00),
('hotel-quito-03', CURRENT_DATE, true, 280.00),
('hotel-quito-03', CURRENT_DATE + INTERVAL '1 day', true, 280.00);

-- 7. Insertar Huéspedes de Prueba
INSERT INTO huespedes (id, nombre, apellido, email, telefono, doc_tipo, doc_numero, nacionalidad) VALUES
('c7a10f82-3d84-4e2a-9cb1-9a72df9b1001', 'Carlos', 'Mendoza', 'carlos.mendoza@example.com', '+57 300 123 4567', 'Cédula', '1020304050', 'Colombiana'),
('d8b21e93-4e95-5f3b-adb2-0b83ef0c2002', 'Valeria', 'Santos', 'valeria.santos@example.com', '+52 998 765 4321', 'Pasaporte', 'P98765432', 'Mexicana'),
('e9c32f04-5fa6-604c-bec3-1c94f01d3003', 'Mateo', 'Andrade', 'mateo.andrade@example.com', '+593 99 888 7777', 'Cédula', '1718192021', 'Ecuatoriana');

-- 8. Insertar Reseñas Reales (Inside Airbnb format)
INSERT INTO resenas_alojamiento (alojamiento_id, reviewer_name, fecha, puntuacion, comentario) VALUES
('hotel-cancun-01', 'Alejandro Morales', CURRENT_DATE - INTERVAL '15 days', 9.8, 'Una experiencia inolvidable. Las instalaciones son impecables y el servicio de spa superó todas nuestras expectativas.'),
('hotel-cancun-01', 'Sarah Jenkins', CURRENT_DATE - INTERVAL '40 days', 9.2, 'The ocean view from the terrace was breathtaking. Food at the French restaurant was Michelin-level quality.'),
('hotel-cartagena-02', 'Camila Restrepo', CURRENT_DATE - INTERVAL '10 days', 9.9, 'La ubicación en el centro amurallado es mágica. Ver el atardecer desde la piscina de la azotea con una copa de vino no tiene precio.'),
('hotel-quito-03', 'Jean-Luc Dupont', CURRENT_DATE - INTERVAL '25 days', 9.7, 'Hotel magnifique avec une histoire riche. Le personnel est aux petits soins et la vue sur la place San Francisco est sublime.'),
('hotel-medellin-04', 'David Silva', CURRENT_DATE - INTERVAL '5 days', 9.3, 'Muy buen ambiente, diseño moderno e innovador. La ubicación en el Poblado te permite ir caminando a los mejores restaurantes y cafés.');

-- ============================================================================
-- FIN DEL SCRIPT SQL DDL Y POBLADO
-- ============================================================================
