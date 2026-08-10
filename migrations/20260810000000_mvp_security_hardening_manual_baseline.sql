-- Historical baseline for the manually applied MVP security hardening.
-- The original script is kept at migrations/20260810_mvp_security_hardening.sql.
-- This migration is intentionally a verification-only marker: it must not
-- replay destructive DDL on an already hardened database.

DO $$
BEGIN
    IF to_regclass('public.user_has_active_partner_role') IS NULL
       OR to_regclass('public.fraud_checks') IS NULL
       OR to_regclass('public.services') IS NULL THEN
        RAISE EXCEPTION 'MVP security baseline is not present';
    END IF;
END;
$$;
