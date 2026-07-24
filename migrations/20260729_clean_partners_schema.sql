-- Migration: Clean obsolete/moved columns from partners table and expand stores table
-- 1. Ensure all store/metrics columns exist on stores table
-- 2. Backfill stores table from partners table before dropping
-- 3. Drop moved and discontinued columns from partners table

BEGIN;

-- ─── 1. Add missing columns to stores table if not present ────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS risk_score INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_produtos INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_servicos INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS vendas_assinaturas INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS marketplace_reputation NUMERIC DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS completed_orders_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS completed_appointments_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS active_subscriptions_count INT DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cancellation_rate NUMERIC DEFAULT 0;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pickup_payment_policy TEXT;

-- ─── 2. Backfill stores metrics & settings from partners if stores column is default/null ─────
UPDATE public.stores s
SET 
  risk_score = COALESCE(s.risk_score, p.risk_score, 0),
  vendas_produtos = COALESCE(s.vendas_produtos, p.vendas_produtos, 0),
  vendas_servicos = COALESCE(s.vendas_servicos, p.vendas_servicos, 0),
  vendas_assinaturas = COALESCE(s.vendas_assinaturas, p.vendas_assinaturas, 0),
  marketplace_reputation = COALESCE(s.marketplace_reputation, p.marketplace_reputation, 0),
  completed_orders_count = COALESCE(s.completed_orders_count, p.completed_orders_count, 0),
  completed_appointments_count = COALESCE(s.completed_appointments_count, p.completed_appointments_count, 0),
  active_subscriptions_count = COALESCE(s.active_subscriptions_count, p.active_subscriptions_count, 0),
  cancellation_rate = COALESCE(s.cancellation_rate, p.cancellation_rate, 0),
  timezone = COALESCE(s.timezone, p.timezone, 'America/Sao_Paulo'),
  pickup_payment_policy = COALESCE(s.pickup_payment_policy, p.pickup_payment_policy)
FROM public.partners p
WHERE s.partner_id = p.id;

-- ─── 3. Drop moved and discontinued columns from partners table ───────────────
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_name CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_description CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS opening_hours CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS store_image_url CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS rating CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS risk_score CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_totais CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS latitude CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS longitude CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS phone CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS banner_url CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS gallery CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_produtos CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_servicos CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS vendas_assinaturas CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS marketplace_reputation CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS completed_orders_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS completed_appointments_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS active_subscriptions_count CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS cancellation_rate CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS timezone CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS pickup_payment_policy CASCADE;

-- Discontinued columns
ALTER TABLE public.partners DROP COLUMN IF EXISTS category CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS service_deposit_manual_enabled CASCADE;
ALTER TABLE public.partners DROP COLUMN IF EXISTS service_deposit_mp_enabled CASCADE;

COMMIT;
