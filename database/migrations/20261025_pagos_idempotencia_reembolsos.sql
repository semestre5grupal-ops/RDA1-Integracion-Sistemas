-- I06: persistencia para idempotencia de reembolsos, importes parciales
-- acumulados y reservas asociadas a una referencia de pago.
-- NO aplicar en bases de datos reales sin el procedimiento oficial de migración.

ALTER TABLE schema_pagos.transacciones_pago
  ADD COLUMN IF NOT EXISTS monto_reembolsado NUMERIC(10, 2) NOT NULL DEFAULT 0;

UPDATE schema_pagos.transacciones_pago
SET monto_reembolsado = monto_total
WHERE estado = 'REEMBOLSADO' AND monto_reembolsado = 0;

CREATE TABLE IF NOT EXISTS schema_pagos.reembolsos_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL REFERENCES schema_pagos.transacciones_pago(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(64) NOT NULL,
  monto_reembolsado NUMERIC(10, 2) NOT NULL CHECK (monto_reembolsado > 0),
  codigo_reembolso VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_reembolsos_pago_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_pago_transaccion_id
  ON schema_pagos.reembolsos_pago(transaccion_id);

CREATE TABLE IF NOT EXISTS schema_pagos.reservas_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaccion_id UUID NOT NULL REFERENCES schema_pagos.transacciones_pago(id) ON DELETE CASCADE,
  reserva_id VARCHAR(128) NOT NULL,
  CONSTRAINT uq_reservas_pago_transaccion_reserva UNIQUE (transaccion_id, reserva_id)
);

CREATE INDEX IF NOT EXISTS idx_reservas_pago_transaccion_id
  ON schema_pagos.reservas_pago(transaccion_id);
