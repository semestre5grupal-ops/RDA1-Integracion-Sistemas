-- Booking no podía guardar reservas de alojamiento (HTTP 500 en POST /alojamientos/{id}/reservations).
-- Causa: en schema_alojamientos.alojamientos_reservas la columna `id` es NOT NULL sin valor por
-- defecto (viene del esquema 01_master_migration_12_schemas.sql), y TypeORM
-- (@PrimaryGeneratedColumn('uuid')) inserta DEFAULT esperando que la base genere el id.
-- Ya se aplicó en el Supabase de producción el 2026-11-06. Es idempotente.
ALTER TABLE schema_alojamientos.alojamientos_reservas ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
