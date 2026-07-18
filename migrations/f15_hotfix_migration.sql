-- ============================================================================
-- Fase 15 — Hotfix
-- ============================================================================
-- Corrige:
--   1. delivery_settings.id sem DEFAULT (novos inserts falham)
--   2. Policies payment_methods em português não droppadas (encoding mismatch)
-- ============================================================================

BEGIN;

-- ─── 1. DEFAULT para delivery_settings.id ──────────────────────────────────

ALTER TABLE public.delivery_settings
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ─── 2. Dropar policies remanescentes de payment_methods ───────────────────
-- Usa pg_policies para contornar encoding nos nomes em português

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_methods'
      AND policyname NOT IN ('payment_methods_select', 'payment_methods_insert', 'payment_methods_update', 'payment_methods_delete')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payment_methods', rec.policyname);
  END LOOP;
END $$;

COMMIT;
