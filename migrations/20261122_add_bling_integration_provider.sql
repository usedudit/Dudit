-- ============================================================================
-- Seed Bling ERP (API v3) into integration_providers catalog
-- ============================================================================

INSERT INTO public.integration_providers (slug, category, name, is_active, docs_url)
VALUES ('bling', 'other', 'Bling ERP', true, 'https://developer.bling.com.br')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = true,
  docs_url = EXCLUDED.docs_url,
  updated_at = now();
