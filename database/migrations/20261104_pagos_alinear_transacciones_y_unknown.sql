-- 2026-11-04 · Alinea las tablas de pagos con las entidades de MS_PAG.
--
-- La base de Azure tenía schema_pagos.transacciones_pago creada con
-- 01_master_migration_12_schemas.sql (orden_id, monto, codigo_autorizacion NOT NULL,
-- CHECK de estado) y SIN las columnas que usa la entidad TransaccionPago
-- (factura_id, carrito_id, monto_total, ...). Resultado: todo cobro fallaba con
-- "column TransaccionPago.factura_id does not exist".
-- Tampoco existía schema_pagos.reembolsos_pago (20261025_pagos_idempotencia_reembolsos.sql
-- no se había aplicado), así que ningún reembolso se registraba.
--
-- Todo es aditivo o relaja restricciones: no borra datos. Ya se aplicó en Azure el 04-nov.

ALTER TABLE schema_pagos.transacciones_pago
  ADD COLUMN IF NOT EXISTS factura_id UUID NULL,
  ADD COLUMN IF NOT EXISTS carrito_id UUID NULL,
  ADD COLUMN IF NOT EXISTS monto_total NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS monto_reembolsado NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero_tarjeta_enmascarado VARCHAR(20) NOT NULL DEFAULT '•••• •••• •••• 4242',
  ADD COLUMN IF NOT EXISTS mensaje_pasarela TEXT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='schema_pagos' AND table_name='transacciones_pago' AND column_name='orden_id') THEN
    ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN orden_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='schema_pagos' AND table_name='transacciones_pago' AND column_name='monto') THEN
    ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN monto DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN codigo_autorizacion DROP NOT NULL;
ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN codigo_autorizacion TYPE VARCHAR(64);
ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN codigo_reembolso TYPE VARCHAR(64);
ALTER TABLE schema_pagos.transacciones_pago ALTER COLUMN estado SET DEFAULT 'INICIADA';
-- La entidad usa INICIADA, APROBADO, RECHAZADO, REEMBOLSADO, REEMBOLSO_PARCIAL, ERROR_TIMEOUT.
ALTER TABLE schema_pagos.transacciones_pago DROP CONSTRAINT IF EXISTS transacciones_pago_estado_check;

-- Proveedores: el estado honesto de un nodo nuevo es UNKNOWN (sin verificar).
ALTER TABLE schema_proveedores.config_proveedor DROP CONSTRAINT IF EXISTS config_proveedor_health_status_check;
ALTER TABLE schema_proveedores.config_proveedor ADD CONSTRAINT config_proveedor_health_status_check
  CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN'));

-- Después de esto aplicar también 20261025_pagos_idempotencia_reembolsos.sql y
-- 20261025_event_idempotency.sql si la base no los tiene.
