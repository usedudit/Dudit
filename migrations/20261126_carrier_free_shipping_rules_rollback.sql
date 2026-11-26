-- Rollback: 20261126_carrier_free_shipping_rules.sql
BEGIN;

DROP TABLE IF EXISTS public.carrier_free_shipping_rules CASCADE;

COMMIT;
