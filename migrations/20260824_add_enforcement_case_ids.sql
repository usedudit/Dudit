-- Migration: Add enforcement case ID columns to user_profiles, partners, and stores
-- This allows generating and tracking unique human-readable case IDs (e.g., CAS-8F42B19D)
-- for banned users, suspended partners/stores, and disabled ERP accounts.

-- 1. user_profiles
ALTER TABLE public.user_profiles 
    ADD COLUMN IF NOT EXISTS banned_case_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_banned_case_id 
    ON public.user_profiles(banned_case_id) 
    WHERE banned_case_id IS NOT NULL;

-- 2. partners
ALTER TABLE public.partners 
    ADD COLUMN IF NOT EXISTS suspended_case_id TEXT;

CREATE INDEX IF NOT EXISTS idx_partners_suspended_case_id 
    ON public.partners(suspended_case_id) 
    WHERE suspended_case_id IS NOT NULL;

-- 3. stores
ALTER TABLE public.stores 
    ADD COLUMN IF NOT EXISTS suspended_case_id TEXT;

CREATE INDEX IF NOT EXISTS idx_stores_suspended_case_id 
    ON public.stores(suspended_case_id) 
    WHERE suspended_case_id IS NOT NULL;
