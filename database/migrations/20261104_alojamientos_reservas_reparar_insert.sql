-- ============================================================================
-- Reparar schema_alojamientos.alojamientos_reservas para que el Booking pueda
-- volver a GUARDAR reservas de alojamiento.
--
-- Síntoma (2026-11-04, Booking en Azure): POST /api/v1/alojamientos/{id}/reservations
-- responde 500 en todos los hoteles. Las validaciones previas funcionan y la lectura
-- de la tabla también, pero el INSERT falla. Repetir la misma petición con la misma
-- Idempotency-Key vuelve a dar 500 y no queda ninguna fila: falla el INSERT mismo.
-- Ver docs/INVESTIGACION_BOOKING_ALOJAMIENTOS.md.
--
-- La tabla nació con database/01_master_migration_12_schemas.sql (modelo viejo) y se
-- adaptó con 03_alojamientos_schema_completo.sql o con database/migrate_alojamientos.js.
-- Con esa historia quedan restricciones que la entidad actual
-- (src/modules/alojamientos/entities/reserva.entity.ts) no cumple:
--   1. `id` NOT NULL SIN DEFAULT: TypeORM (@PrimaryGeneratedColumn('uuid')) inserta
--      DEFAULT y espera que la base genere el id → "null value in column id".
--   2. CHECK estado IN ('CONFIRMADA', …) del 01: el código guarda 'CONFIRMED'.
--      migrate_alojamientos.js NO lo borra (el 03 sí).
--   3. Columnas viejas NOT NULL que la entidad no llena (nombre_titular, email_titular,
--      fecha_checkin, fecha_checkout, precio_total, idempotency_key…).
--   4. Columnas que la entidad usa y el 01 no tiene (`huespedes`, …).
--
-- Es IDEMPOTENTE y no borra datos: se puede ejecutar más de una vez.
-- Antes de aplicarla, ver el diagnóstico de la sección 0 (sólo lectura).
-- ============================================================================

-- 0. DIAGNÓSTICO (solo lectura). Ejecutar primero y guardar el resultado.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'schema_alojamientos' AND table_name = 'alojamientos_reservas'
--  ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'schema_alojamientos.alojamientos_reservas'::regclass;

BEGIN;

-- 1. El id lo genera la base (la columna es VARCHAR(64) en el modelo viejo).
ALTER TABLE schema_alojamientos.alojamientos_reservas
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 2. Fuera cualquier CHECK sobre `estado` heredado del modelo viejo
--    (el valor válido lo controla el código: CONFIRMED / CANCELLED / …).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'schema_alojamientos.alojamientos_reservas'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE schema_alojamientos.alojamientos_reservas DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE schema_alojamientos.alojamientos_reservas ALTER COLUMN estado SET DEFAULT 'CONFIRMED';

-- 3. Columnas del modelo viejo que la entidad no llena: dejan de ser obligatorias.
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['cliente_id', 'nombre_titular', 'email_titular', 'fecha_checkin',
                             'fecha_checkout', 'precio_total', 'huespedes_total', 'created_at']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'schema_alojamientos' AND table_name = 'alojamientos_reservas'
                  AND column_name = col) THEN
      EXECUTE format('ALTER TABLE schema_alojamientos.alojamientos_reservas ALTER COLUMN %I DROP NOT NULL', col);
    END IF;
  END LOOP;
END $$;
-- idempotency_key es opcional en la entidad y debe admitir 255 caracteres.
ALTER TABLE schema_alojamientos.alojamientos_reservas
  ALTER COLUMN idempotency_key DROP NOT NULL,
  ALTER COLUMN idempotency_key TYPE varchar(255);

-- 4. Todas las columnas que usa la entidad (las que falten se crean vacías).
ALTER TABLE schema_alojamientos.alojamientos_reservas
  ADD COLUMN IF NOT EXISTS codigo_reserva varchar(50),
  ADD COLUMN IF NOT EXISTS cliente_nombre varchar(150),
  ADD COLUMN IF NOT EXISTS cliente_email varchar(150),
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS huespedes int DEFAULT 1,
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
  ADD COLUMN IF NOT EXISTS habitacion_asignada varchar(50),
  ADD COLUMN IF NOT EXISTS clave_acceso_digital varchar(50),
  ADD COLUMN IF NOT EXISTS checkin_liberado_a_las_14 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_completado_at timestamptz,
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamp DEFAULT now();

-- Rellenar `huespedes` en filas viejas que solo tenían huespedes_total.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'schema_alojamientos' AND table_name = 'alojamientos_reservas'
                AND column_name = 'huespedes_total') THEN
    UPDATE schema_alojamientos.alojamientos_reservas
       SET huespedes = huespedes_total
     WHERE huespedes IS NULL AND huespedes_total IS NOT NULL;
  END IF;
END $$;

-- 5. Huéspedes: el servicio los guarda justo después de la reserva (sin try/catch),
--    así que la tabla vieja del 01 también rompería la reserva.
ALTER TABLE schema_alojamientos.alojamientos_huespedes
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS orden smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tipo varchar(10) DEFAULT 'ADULTO',
  ADD COLUMN IF NOT EXISTS documento_tipo varchar(20),
  ADD COLUMN IF NOT EXISTS nacionalidad varchar(2),
  ADD COLUMN IF NOT EXISTS email varchar(150),
  ADD COLUMN IF NOT EXISTS telefono varchar(30),
  ADD COLUMN IF NOT EXISTS creado_en timestamp DEFAULT now();
ALTER TABLE schema_alojamientos.alojamientos_huespedes ALTER COLUMN apellido SET DEFAULT '';

-- 6. Outbox de eventos (si falta, la reserva no falla, pero el evento se pierde).
CREATE TABLE IF NOT EXISTS schema_alojamientos.alojamientos_eventos_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  published_rabbit BOOLEAN NOT NULL DEFAULT FALSE,
  published_kafka BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
