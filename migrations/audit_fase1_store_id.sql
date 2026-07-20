-- ============================================================================
-- FASE 1 Audit Script: verify store_id migration completeness
-- Run AFTER migration 20260725_add_store_id_to_store_only_modules.sql
-- ============================================================================

-- 1. count NULL store_id per table (should all be 0 for NOT NULL tables)
SELECT 'return_requests' AS tbl, COUNT(*) AS total, COUNT(*) FILTER (WHERE store_id IS NULL) AS null_count FROM public.return_requests
UNION ALL
SELECT 'return_refunds', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NULL) FROM public.return_refunds
UNION ALL
SELECT 'return_events', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NULL) FROM public.return_events
UNION ALL
SELECT 'return_notifications', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NULL) FROM public.return_notifications
UNION ALL
SELECT 'store_credits', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NULL) FROM public.store_credits
UNION ALL
SELECT 'checkout_fulfillments', COUNT(*), COUNT(*) FILTER (WHERE store_id IS NULL) FROM public.checkout_fulfillments
ORDER BY tbl;

-- 2. validate no cross-store references: each store_id must exist in stores
SELECT 'return_requests' AS tbl, COUNT(*) AS orphan_count
FROM public.return_requests rr
LEFT JOIN public.stores s ON s.id = rr.store_id
WHERE rr.store_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'return_refunds', COUNT(*) FROM public.return_refunds rrf
LEFT JOIN public.stores s ON s.id = rrf.store_id
WHERE rrf.store_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'return_events', COUNT(*) FROM public.return_events re
LEFT JOIN public.stores s ON s.id = re.store_id
WHERE re.store_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'return_notifications', COUNT(*) FROM public.return_notifications rn
LEFT JOIN public.stores s ON s.id = rn.store_id
WHERE rn.store_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'store_credits', COUNT(*) FROM public.store_credits sc
LEFT JOIN public.stores s ON s.id = sc.store_id
WHERE sc.store_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'checkout_fulfillments', COUNT(*) FROM public.checkout_fulfillments cf
LEFT JOIN public.stores s ON s.id = cf.store_id
WHERE cf.store_id IS NOT NULL AND s.id IS NULL;

-- 3. check that store_id matches partner's store (consistency)
-- Each store_id should belong to the same partner_id
SELECT 'return_requests' AS tbl, COUNT(*) AS partner_mismatch
FROM public.return_requests rr
JOIN public.stores s ON s.id = rr.store_id
WHERE rr.store_id IS NOT NULL AND s.partner_id != rr.partner_id
UNION ALL
SELECT 'return_refunds', COUNT(*) FROM public.return_refunds rrf
JOIN public.stores s ON s.id = rrf.store_id
WHERE rrf.store_id IS NOT NULL AND s.partner_id != rrf.partner_id
UNION ALL
SELECT 'return_events', COUNT(*) FROM public.return_events re
JOIN public.stores s ON s.id = re.store_id
WHERE re.store_id IS NOT NULL AND s.partner_id != re.partner_id
UNION ALL
SELECT 'return_notifications', COUNT(*) FROM public.return_notifications rn
JOIN public.stores s ON s.id = rn.store_id
WHERE rn.store_id IS NOT NULL AND s.partner_id != rn.partner_id
UNION ALL
SELECT 'store_credits', COUNT(*) FROM public.store_credits sc
JOIN public.stores s ON s.id = sc.store_id
WHERE sc.store_id IS NOT NULL AND s.partner_id != sc.partner_id
UNION ALL
SELECT 'checkout_fulfillments', COUNT(*) FROM public.checkout_fulfillments cf
JOIN public.stores s ON s.id = cf.store_id
WHERE cf.store_id IS NOT NULL AND s.partner_id != cf.partner_id;

-- 4. summary: total records and distinct stores per table
SELECT 'return_requests' AS tbl,
  COUNT(*) AS total,
  COUNT(DISTINCT store_id) AS distinct_stores,
  COUNT(*) FILTER (WHERE store_id IS NULL) AS null_store
FROM public.return_requests
UNION ALL
SELECT 'return_refunds', COUNT(*), COUNT(DISTINCT store_id), COUNT(*) FILTER (WHERE store_id IS NULL)
FROM public.return_refunds
UNION ALL
SELECT 'return_events', COUNT(*), COUNT(DISTINCT store_id), COUNT(*) FILTER (WHERE store_id IS NULL)
FROM public.return_events
UNION ALL
SELECT 'return_notifications', COUNT(*), COUNT(DISTINCT store_id), COUNT(*) FILTER (WHERE store_id IS NULL)
FROM public.return_notifications
UNION ALL
SELECT 'store_credits', COUNT(*), COUNT(DISTINCT store_id), COUNT(*) FILTER (WHERE store_id IS NULL)
FROM public.store_credits
UNION ALL
SELECT 'checkout_fulfillments', COUNT(*), COUNT(DISTINCT store_id), COUNT(*) FILTER (WHERE store_id IS NULL)
FROM public.checkout_fulfillments
ORDER BY tbl;
