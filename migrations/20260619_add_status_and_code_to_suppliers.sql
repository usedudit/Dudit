-- Add status and supplier_code columns to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo' NOT NULL,
ADD COLUMN IF NOT EXISTS supplier_code TEXT;
