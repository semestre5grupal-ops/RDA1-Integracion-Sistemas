-- =============================================================================
-- Migración: Tabla de Idempotencia de Eventos (CloudEvents)
-- Tarea: I04 — Mensajería: RabbitMQ transaccional, Kafka solo telemetría
-- Fecha: 2026-10-25
-- NOTA: Archivo generado para trazabilidad de esquema según Cátedra §8.
--       NO APLICAR DIRECTAMENTE A PRODUCCIÓN sin migrador oficial.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS schema_auditoria;

CREATE TABLE IF NOT EXISTS schema_auditoria.event_idempotency (
    event_id UUID PRIMARY KEY,
    source VARCHAR(160) NOT NULL,
    event_type VARCHAR(160) NOT NULL,
    correlation_id VARCHAR(160),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 HOURS'),
    payload_hash VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_event_idempotency_expires_at
    ON schema_auditoria.event_idempotency (expires_at);

COMMENT ON TABLE schema_auditoria.event_idempotency IS
    'Registro inmutable de CloudEvents procesados para deduplicación estricta (at-least-once a exactly-once en consumidores)';
