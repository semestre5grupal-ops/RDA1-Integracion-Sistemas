const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Ejecuta: DATABASE_URL="postgresql://..." node <script>  (nunca la escribas en el código).');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PG');

  // 1. Alojamientos catalogo
  await client.query(`
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
  `);
  console.log('Altered alojamientos_catalogo columns');

  await client.query(`
    INSERT INTO schema_alojamientos.alojamientos_catalogo (
      id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, precio_noche, moneda,
      capacidad_adultos, capacidad_ninos, habitaciones, camas, banos, tiene_piscina, photos,
      amenidades, host, ratings, ubicacion, creado_en, actualizado_en, deleted_at,
      proveedor_id, id_externo, ultima_sincronizacion, estado, politicas,
      ciudad, pais, precio_noche_base, activo
    )
    SELECT 
      id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, precio_noche, moneda,
      capacidad_adultos, capacidad_ninos, habitaciones, camas, banos, tiene_piscina, photos,
      amenidades, host, ratings, ubicacion, creado_en, actualizado_en, deleted_at,
      proveedor_id, id_externo, ultima_sincronizacion, estado, politicas,
      COALESCE(destino, 'Quito'), 'Ecuador', COALESCE(precio_noche, 85.00), (estado = 'ACTIVO')
    FROM public.alojamientos
    ON CONFLICT (id) DO UPDATE SET
      tipo_alojamiento = EXCLUDED.tipo_alojamiento,
      destino = EXCLUDED.destino,
      precio_noche = EXCLUDED.precio_noche,
      capacidad_adultos = EXCLUDED.capacidad_adultos,
      capacidad_ninos = EXCLUDED.capacidad_ninos,
      habitaciones = EXCLUDED.habitaciones,
      camas = EXCLUDED.camas,
      banos = EXCLUDED.banos,
      tiene_piscina = EXCLUDED.tiene_piscina,
      photos = EXCLUDED.photos,
      amenidades = EXCLUDED.amenidades,
      host = EXCLUDED.host,
      ratings = EXCLUDED.ratings,
      ubicacion = EXCLUDED.ubicacion,
      creado_en = EXCLUDED.creado_en,
      actualizado_en = EXCLUDED.actualizado_en,
      deleted_at = EXCLUDED.deleted_at,
      proveedor_id = EXCLUDED.proveedor_id,
      id_externo = EXCLUDED.id_externo,
      ultima_sincronizacion = EXCLUDED.ultima_sincronizacion,
      estado = EXCLUDED.estado,
      politicas = EXCLUDED.politicas,
      ciudad = EXCLUDED.ciudad,
      precio_noche_base = EXCLUDED.precio_noche_base;
  `);
  console.log('Populated alojamientos_catalogo');

  // 2. Tipos habitacion
  await client.query(`
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
  `);
  console.log('Altered alojamientos_tipos_habitacion columns');

  await client.query(`
    INSERT INTO schema_alojamientos.alojamientos_tipos_habitacion (
      id, alojamiento_id, codigo, nombre, nombre_tipo, descripcion, capacidad_adultos, capacidad_ninos,
      camas, descripcion_camas, tamano_m2, precio_noche, cantidad, cupo_habitaciones, regimen,
      cancelacion_gratuita_horas, amenidades, photos, activo, orden, creado_en, actualizado_en
    )
    SELECT 
      id, alojamiento_id, codigo, nombre, nombre, descripcion, capacidad_adultos, capacidad_ninos,
      camas, descripcion_camas, tamano_m2, precio_noche, cantidad, COALESCE(cantidad, 1), regimen,
      cancelacion_gratuita_horas, amenidades, photos, activo, orden, creado_en, actualizado_en
    FROM public.tipos_habitacion
    ON CONFLICT (id) DO UPDATE SET
      codigo = EXCLUDED.codigo,
      nombre = EXCLUDED.nombre,
      nombre_tipo = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      descripcion_camas = EXCLUDED.descripcion_camas,
      tamano_m2 = EXCLUDED.tamano_m2,
      cantidad = EXCLUDED.cantidad,
      cupo_habitaciones = EXCLUDED.cupo_habitaciones,
      regimen = EXCLUDED.regimen,
      cancelacion_gratuita_horas = EXCLUDED.cancelacion_gratuita_horas,
      amenidades = EXCLUDED.amenidades,
      photos = EXCLUDED.photos,
      activo = EXCLUDED.activo,
      orden = EXCLUDED.orden,
      creado_en = EXCLUDED.creado_en,
      actualizado_en = EXCLUDED.actualizado_en;
  `);
  console.log('Populated alojamientos_tipos_habitacion');

  // 3. Reservas
  await client.query(`
    ALTER TABLE schema_alojamientos.alojamientos_reservas
      ALTER COLUMN cliente_id DROP NOT NULL,
      ALTER COLUMN nombre_titular DROP NOT NULL,
      ALTER COLUMN email_titular DROP NOT NULL,
      ALTER COLUMN fecha_checkin DROP NOT NULL,
      ALTER COLUMN fecha_checkout DROP NOT NULL,
      ALTER COLUMN precio_total DROP NOT NULL,
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
  `);
  console.log('Altered alojamientos_reservas columns');

  await client.query(`
    INSERT INTO schema_alojamientos.alojamientos_reservas (
      id, codigo_reserva, alojamiento_id, cliente_nombre, nombre_titular, cliente_email, email_titular,
      fecha_inicio, fecha_checkin, fecha_fin, fecha_checkout,
      noches, huespedes_total, habitaciones_count, total, precio_total, total_price, estado, idempotency_key,
      creado_en, actualizado_en, usuario_id, tipo_habitacion_id, adultos, ninos, precio_noche,
      moneda, cliente_telefono, peticiones_especiales, hora_llegada, motivo_cancelacion, cancelada_en
    )
    SELECT 
      id, codigo_reserva, alojamiento_id, cliente_nombre, cliente_nombre, cliente_email, cliente_email,
      fecha_inicio, fecha_inicio, fecha_fin, fecha_fin,
      noches, huespedes, habitaciones_count, total, total, total_price, estado, idempotency_key,
      creado_en, actualizado_en, usuario_id, tipo_habitacion_id, adultos, ninos, precio_noche,
      moneda, cliente_telefono, peticiones_especiales, hora_llegada, motivo_cancelacion, cancelada_en
    FROM public.reservas_alojamiento
    ON CONFLICT (id) DO UPDATE SET
      codigo_reserva = EXCLUDED.codigo_reserva,
      cliente_nombre = EXCLUDED.cliente_nombre,
      nombre_titular = EXCLUDED.cliente_nombre,
      cliente_email = EXCLUDED.cliente_email,
      email_titular = EXCLUDED.cliente_email,
      fecha_inicio = EXCLUDED.fecha_inicio,
      fecha_checkin = EXCLUDED.fecha_inicio,
      fecha_fin = EXCLUDED.fecha_fin,
      fecha_checkout = EXCLUDED.fecha_fin,
      total = EXCLUDED.total,
      precio_total = EXCLUDED.total,
      total_price = EXCLUDED.total_price,
      estado = EXCLUDED.estado,
      idempotency_key = EXCLUDED.idempotency_key,
      creado_en = EXCLUDED.creado_en,
      actualizado_en = EXCLUDED.actualizado_en;
  `);
  console.log('Populated alojamientos_reservas');

  // 4. Huespedes
  await client.query(`
    ALTER TABLE schema_alojamientos.alojamientos_huespedes
      ADD COLUMN IF NOT EXISTS orden smallint DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tipo varchar(10) DEFAULT 'ADULTO',
      ADD COLUMN IF NOT EXISTS documento_tipo varchar(20),
      ADD COLUMN IF NOT EXISTS nacionalidad varchar(2),
      ADD COLUMN IF NOT EXISTS email varchar(150),
      ADD COLUMN IF NOT EXISTS telefono varchar(30),
      ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT NOW();
  `);
  console.log('Altered alojamientos_huespedes columns');

  await client.query(`
    INSERT INTO schema_alojamientos.alojamientos_huespedes (
      id, reserva_id, orden, es_titular, tipo, nombre, apellido, edad,
      documento_tipo, documento_numero, nacionalidad, email, telefono, creado_en
    )
    SELECT 
      id, reserva_id, orden, es_titular, tipo, nombre, apellido, edad,
      documento_tipo, documento_numero, nacionalidad, email, telefono, creado_en
    FROM public.huespedes_reserva
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('Populated alojamientos_huespedes');

  // 5. Resenas y Proveedores
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_alojamientos.resenas_alojamiento (LIKE public.resenas_alojamiento INCLUDING ALL);
    INSERT INTO schema_alojamientos.resenas_alojamiento SELECT * FROM public.resenas_alojamiento ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS schema_alojamientos.proveedores_alojamiento (LIKE public.proveedores_alojamiento INCLUDING ALL);
    INSERT INTO schema_alojamientos.proveedores_alojamiento SELECT * FROM public.proveedores_alojamiento ON CONFLICT (id) DO NOTHING;
  `);
  console.log('Created and populated resenas and proveedores');

  console.log('🎉 SUCCESS: All schema_alojamientos tables aligned and populated!');
}

run().catch(console.error).finally(() => client.end());
