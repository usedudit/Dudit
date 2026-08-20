-- Migration: Add Short Public Tokens to Quotes and Service Orders
-- Purpose: Replace 36-char UUIDs in /quote/[token] and /os/[token] with 6-char clean alphanumeric tokens (e.g. /quote/k7x9pa, /os/3m8qza).

-- 1. Ensure generate_short_id helper exists
CREATE OR REPLACE FUNCTION generate_short_id(size INT DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
  characters TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..size LOOP
    result := result || substr(characters, floor(random() * length(characters) + 1)::INT, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. Alter column types from UUID to TEXT
ALTER TABLE quotes ALTER COLUMN public_token TYPE TEXT;
ALTER TABLE service_orders ALTER COLUMN public_token TYPE TEXT;

-- 3. Backfill existing records with short_id if null or legacy long UUID (> 20 chars)
UPDATE quotes 
SET public_token = generate_short_id(6) 
WHERE public_token IS NULL OR length(public_token) > 20;

UPDATE service_orders 
SET public_token = generate_short_id(6) 
WHERE public_token IS NULL OR length(public_token) > 20;

-- 4. Update trigger for Quotes defaults
CREATE OR REPLACE FUNCTION set_quote_approval_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_salt TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := generate_quote_number();
  END IF;

  IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
    NEW.public_token := generate_short_id(6);
  END IF;

  IF NEW.approval_code_hash IS NULL THEN
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    NEW.approval_code_salt := v_salt;
    NEW.approval_code_hash := compute_approval_hash(v_salt, v_code);
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{plain_code}', to_jsonb(v_code));
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Update trigger for Service Orders defaults
CREATE OR REPLACE FUNCTION set_service_order_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_salt TEXT;
BEGIN
  IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
    NEW.public_token := generate_short_id(6);
  END IF;

  IF NEW.approval_code_hash IS NULL THEN
    v_code := lpad(floor(random() * 10000)::text, 4, '0');
    v_salt := md5(random()::text);
    NEW.approval_code_salt := v_salt;
    NEW.approval_code_hash := compute_approval_hash(v_salt, v_code);
    NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{plain_code}', to_jsonb(v_code));
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Indexes for ultra-fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token_clean ON quotes(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_public_token_clean ON service_orders(public_token);

NOTIFY pgrst, 'reload schema';
