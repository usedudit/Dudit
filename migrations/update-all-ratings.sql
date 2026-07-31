-- Script to recalculate all product and store ratings based on existing reviews
-- Run this if you need to fix ratings after data migration or cleanup
-- NOTE: rating lives on stores.rating (moved from partners.rating in 20260729)

-- Update all product ratings based on their reviews
UPDATE products p
SET rating = (
  SELECT AVG(r.rating)::numeric(3,2)
  FROM reviews r
  WHERE r.product_id = p.id
  AND r.rating IS NOT NULL
)
WHERE EXISTS (
  SELECT 1 FROM reviews r 
  WHERE r.product_id = p.id 
  AND r.rating IS NOT NULL
);

-- Update all store ratings based on store-specific reviews
UPDATE stores s
SET rating = (
  SELECT AVG(r.rating)::numeric(3,2)
  FROM reviews r
  WHERE r.store_id = s.id
  AND r.rating IS NOT NULL
)
WHERE EXISTS (
  SELECT 1 FROM reviews r 
  WHERE r.store_id = s.id 
  AND r.rating IS NOT NULL
);

-- Store ratings fallback: partner-level reviews (no store_id)
UPDATE stores s
SET rating = (
  SELECT AVG(r.rating)::numeric(3,2)
  FROM reviews r
  WHERE r.store_id IS NULL
  AND r.partner_id = s.partner_id
  AND r.rating IS NOT NULL
)
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r 
  WHERE r.store_id = s.id 
  AND r.rating IS NOT NULL
);

-- Reset ratings to 0 for products with no reviews
UPDATE products
SET rating = 0
WHERE rating IS NULL
OR NOT EXISTS (
  SELECT 1 FROM reviews r 
  WHERE r.product_id = products.id 
  AND r.rating IS NOT NULL
);

-- Reset ratings to 0 for stores with no reviews
UPDATE stores
SET rating = 0
WHERE rating IS NULL
OR NOT EXISTS (
  SELECT 1 
  FROM reviews r
  WHERE (r.store_id = stores.id OR r.partner_id = stores.partner_id)
  AND r.rating IS NOT NULL
);
