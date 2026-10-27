-- I07: historial durable e idempotente de webhooks inbound.
-- NO aplicar en bases de datos reales sin el procedimiento oficial de migración.

CREATE SCHEMA IF NOT EXISTS schema_auditoria;

CREATE TABLE IF NOT EXISTS schema_auditoria.webhook_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  vertical VARCHAR(20) NOT NULL,
  event_type VARCHAR(200) NOT NULL,
  source TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (
    status IN ('EN_COLA', 'PROCESADO', 'ERROR')
  ),
  signature_valid BOOLEAN NOT NULL DEFAULT TRUE,
  correlation_id VARCHAR(200),
  subject VARCHAR(200),
  traceparent VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  payload_summary JSONB,
  CONSTRAINT uq_webhook_entregas_evento_id UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_entregas_vertical_recibido
  ON schema_auditoria.webhook_entregas(vertical, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_entregas_correlation_id
  ON schema_auditoria.webhook_entregas(correlation_id);
