-- Migration: Add monthly XML import counter to usage_counters
-- Limits Crescer plan to 20 NF-e imports/month; Escalar is unlimited (checked in app code).

ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS xml_imports_month_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xml_imports_month_reset timestamptz DEFAULT now();

-- Backfill existing rows so the reset timestamp is set to now
UPDATE public.usage_counters
  SET xml_imports_month_reset = now()
  WHERE xml_imports_month_reset IS NULL;
