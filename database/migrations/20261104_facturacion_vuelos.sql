-- 2026-11-04 · Facturación de vuelos con aerolíneas socias.
-- El backend lo crea solo al arrancar (vuelos-facturacion.ts, SQL_FACTURACION_VUELOS);
-- este archivo queda como referencia y para aplicarlo a mano si hace falta.
CREATE SEQUENCE IF NOT EXISTS schema_facturacion.seq_factura_vuelos;
CREATE SEQUENCE IF NOT EXISTS schema_facturacion.seq_nota_credito;
CREATE TABLE IF NOT EXISTS schema_facturacion.notas_credito (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nota         varchar(50)   UNIQUE NOT NULL,
  factura_id          uuid          NOT NULL REFERENCES schema_facturacion.facturas_encabezado(id),
  reserva_id          text          NOT NULL,
  monto               numeric(10,2) NOT NULL CHECK (monto > 0),
  motivo              text,
  transaccion_pago_id uuid,
  idempotency_key     varchar(64)   UNIQUE NOT NULL,
  emitida_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notas_credito_factura ON schema_facturacion.notas_credito (factura_id);
ALTER TABLE public.vuelos_reservas_socio
  ADD COLUMN IF NOT EXISTS partner_order_id varchar(40),
  ADD COLUMN IF NOT EXISTS factura_id       uuid,
  ADD COLUMN IF NOT EXISTS numero_factura   varchar(50);
