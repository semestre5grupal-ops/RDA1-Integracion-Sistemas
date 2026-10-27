-- =============================================================================
-- Migración: Estructura de Persistencia de Sagas y Journal de Auditoría
-- Tarea: I05 — Saga de checkout: robustez y pruebas de compensación
-- Fecha: 2026-10-25
-- NOTA: Archivo generado para trazabilidad de esquema según Cátedra §8.
--       NO APLICAR DIRECTAMENTE A PRODUCCIÓN sin migrador oficial.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS schema_auditoria;

-- Tabla maestra de estado de Sagas
CREATE TABLE IF NOT EXISTS schema_auditoria.saga_transacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id VARCHAR(64) NOT NULL UNIQUE,
    saga_nombre VARCHAR(100) NOT NULL DEFAULT 'SAGA_CHECKOUT_COMPUESTO',
    estado VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'COMPENSATING', 'FAILED', 'COMPENSATION_FAILED'
    pasos_totales INT NOT NULL DEFAULT 4,
    paso_actual INT NOT NULL DEFAULT 1,
    error_detalle TEXT,
    codigo_compensacion VARCHAR(64), -- ej. 'REF-SAGA-XXXXXX'
    compensaciones JSONB DEFAULT '[]'::jsonb,
    iniciada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizada_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_saga_transacciones_corr_id 
    ON schema_auditoria.saga_transacciones (correlation_id);

CREATE INDEX IF NOT EXISTS idx_saga_transacciones_estado 
    ON schema_auditoria.saga_transacciones (estado);

-- Bitácora de pasos individuales (Journal)
CREATE TABLE IF NOT EXISTS schema_auditoria.saga_pasos_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_id UUID NOT NULL,
    orden_ejecucion INT NOT NULL,
    servicio_nombre VARCHAR(60) NOT NULL,
    operacion VARCHAR(100) NOT NULL,
    endpoint_invocado TEXT NOT NULL,
    payload_enviado JSONB,
    respuesta_recibida JSONB,
    estado_paso VARCHAR(30) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'COMPENSATED', 'CONFIRMED_FALLBACK'
    compensacion_endpoint TEXT,
    compensacion_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saga_pasos_journal_saga_id 
    ON schema_auditoria.saga_pasos_journal (saga_id);

COMMENT ON TABLE schema_auditoria.saga_transacciones IS
    'Transacciones distribuidas Saga con soporte LIFO, idempotencia y estado COMPENSATION_FAILED';

COMMENT ON TABLE schema_auditoria.saga_pasos_journal IS
    'Journal de auditoría paso a paso para reconstrucción forense de grafos Saga';
