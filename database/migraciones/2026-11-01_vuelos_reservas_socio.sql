-- RDA2 · Copia en Booking de las reservas hechas en aerolíneas socias (Mis Reservas, dueño, pago).
-- Booking la crea sola al arrancar; este archivo es para ejecutarla a mano si se prefiere.
CREATE TABLE IF NOT EXISTS public.vuelos_reservas_socio (
  booking_id        text PRIMARY KEY,
  codigo_nodo       varchar(50)  NOT NULL,
  booking_id_socio  text         NOT NULL,
  propietario_id    varchar(64)  NOT NULL,
  pnr               varchar(20),
  status            varchar(30)  NOT NULL DEFAULT 'CONFIRMED',
  origin            varchar(3),
  destination       varchar(3),
  departure_date    date,
  currency          varchar(3)   NOT NULL DEFAULT 'USD',
  grand_total       numeric(12,2) NOT NULL DEFAULT 0,
  transaccion_id    uuid,
  payment_reference varchar(80),
  reembolsado       numeric(12,2) NOT NULL DEFAULT 0,
  detalle           jsonb,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vuelos_reservas_socio_propietario
  ON public.vuelos_reservas_socio (propietario_id, created_at DESC);
