-- Migration: Add store_credit_amount column to public.orders table
BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMIT;
