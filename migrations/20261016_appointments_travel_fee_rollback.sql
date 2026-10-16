-- ROLLBACK: remove colunas de taxa de deslocamento de appointments
BEGIN;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS travel_fee_breakdown;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS travel_fee;
COMMIT;
