-- Migration to ensure columns used by recurring subscriptions and deletion exist safely
ALTER TABLE public.recurring_subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;
