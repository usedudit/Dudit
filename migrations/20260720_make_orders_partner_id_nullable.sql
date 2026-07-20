-- Alter orders.partner_id column to be nullable to match the ON DELETE SET NULL constraint delete rule
ALTER TABLE public.orders ALTER COLUMN partner_id DROP NOT NULL;
