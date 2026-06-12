-- Add pickup payment policy column to partners table
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS pickup_payment_policy TEXT
  DEFAULT 'require_online_payment'
  CHECK (pickup_payment_policy IN ('allow_pickup_payment', 'require_online_payment'));

COMMENT ON COLUMN partners.pickup_payment_policy IS
  'Pickup payment policy: allow_pickup_payment = customer can pay upon pickup, require_online_payment = customer must pay online before pickup';

-- Set default for Alimentação category partners (restaurants, etc.)
UPDATE partners p
SET pickup_payment_policy = 'require_online_payment'
FROM marketplace_partner_categories c
WHERE p.category_id = c.id
  AND (c.slug = 'alimentacao' OR c.parent_id IN (
    SELECT id FROM marketplace_partner_categories WHERE slug = 'alimentacao'
  ))
  AND (p.pickup_payment_policy IS NULL OR p.pickup_payment_policy = 'require_online_payment');
