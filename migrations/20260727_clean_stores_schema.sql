-- Migration: Clean redundant and misplaced columns from stores table
-- 1. City & State are stored in addresses table
-- 2. Logo uses logo_url exclusively (dropping image_url)
-- 3. Contact uses phone exclusively (dropping whatsapp_phone)
-- 4. order_flow and pickup_payment_policy belong exclusively to partners

-- 1. Backfill logo_url from image_url if logo_url is null
UPDATE stores
SET logo_url = image_url
WHERE logo_url IS NULL AND image_url IS NOT NULL;

-- 2. Backfill phone from whatsapp_phone if phone is null
UPDATE stores
SET phone = whatsapp_phone
WHERE phone IS NULL AND whatsapp_phone IS NOT NULL;

-- 3. Backfill partner order_flow and pickup_payment_policy from stores if missing on partner
UPDATE partners p
SET order_flow = s.order_flow
FROM stores s
WHERE p.id = s.partner_id
  AND (p.order_flow IS NULL OR p.order_flow = '')
  AND s.order_flow IS NOT NULL;

UPDATE partners p
SET pickup_payment_policy = s.pickup_payment_policy
FROM stores s
WHERE p.id = s.partner_id
  AND p.pickup_payment_policy IS NULL
  AND s.pickup_payment_policy IS NOT NULL;

-- 4. Drop redundant and misplaced columns from stores
ALTER TABLE stores DROP COLUMN IF EXISTS city;
ALTER TABLE stores DROP COLUMN IF EXISTS state;
ALTER TABLE stores DROP COLUMN IF EXISTS image_url;
ALTER TABLE stores DROP COLUMN IF EXISTS whatsapp_phone;
ALTER TABLE stores DROP COLUMN IF EXISTS order_flow;
ALTER TABLE stores DROP COLUMN IF EXISTS pickup_payment_policy;
