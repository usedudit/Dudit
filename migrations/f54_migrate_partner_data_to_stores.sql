-- ============================================================================
-- F5.4a/b - Migrar dados de partners para stores (loja principal)
-- ============================================================================
-- Copia os dados existentes de partners para a store headquarters de cada
-- parceiro. Esses dados antes eram globais (partner-level); agora são
-- per-store.
-- ============================================================================

BEGIN;

-- Sincronizar dados da loja principal (headquarters) com os dados do partner
UPDATE stores s
SET
  is_showcase_active = COALESCE(p.is_showcase_active, true),
  order_flow         = COALESCE(NULLIF(p.order_flow, ''), 'dudit'),
  business_info      = COALESCE(p.business_info, '{"sells":["products"],"mode":"erp"}'::jsonb),
  category_id        = COALESCE(s.category_id, p.category_id),
  subcategory_id     = COALESCE(s.subcategory_id, p.subcategory_id),
  latitude           = COALESCE(s.latitude, p.latitude),
  longitude          = COALESCE(s.longitude, p.longitude),
  timezone           = COALESCE(NULLIF(s.timezone, ''), NULLIF(p.timezone, ''), 'America/Sao_Paulo'),
  phone              = COALESCE(NULLIF(s.phone, ''), NULLIF(p.phone, '')),
  opening_hours      = CASE
    WHEN s.opening_hours IS NULL OR s.opening_hours = '{}'::jsonb
    THEN COALESCE(p.opening_hours, '{}'::jsonb)
    ELSE s.opening_hours
  END,
  banner_url         = COALESCE(s.banner_url, p.banner_url),
  logo_url           = COALESCE(s.logo_url, p.store_image_url),
  gallery            = CASE
    WHEN s.gallery IS NULL OR s.gallery = '[]'::jsonb
    THEN COALESCE(p.gallery, '[]'::jsonb)
    ELSE s.gallery
  END,
  updated_at         = NOW()
FROM partners p
WHERE s.partner_id = p.id
  AND s.is_headquarters = true;

COMMIT;
