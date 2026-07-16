-- ============================================================================
-- Fase 1 - Migrar dados de partners para stores (Loja Principal)
-- ============================================================================
-- Para cada Partner que ainda não tem Loja Principal, criar ou atualizar
-- a store existente com os dados do Partner.
-- ============================================================================

BEGIN;

-- Função auxiliar para gerar slug único
CREATE OR REPLACE FUNCTION generate_store_slug(p_name TEXT, p_partner_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug TEXT;
  v_counter INTEGER := 0;
BEGIN
  v_slug := lower(regexp_replace(
    regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  v_slug := regexp_replace(v_slug, '^-|-$', '', 'g');
  IF v_slug = '' THEN
    v_slug := 'loja';
  END IF;

  -- Garantir unicidade
  WHILE EXISTS (SELECT 1 FROM stores WHERE slug = v_slug AND partner_id != p_partner_id) LOOP
    v_counter := v_counter + 1;
    v_slug := v_slug || '-' || v_counter::TEXT;
  END LOOP;

  RETURN v_slug;
END;
$$;

-- Migrar dados dos partners existentes para stores
DO $$
DECLARE
  r RECORD;
  v_existing_store_id UUID;
  v_slug TEXT;
BEGIN
  FOR r IN
    SELECT
      p.id AS partner_id,
      COALESCE(NULLIF(p.store_name, ''), 'Loja Principal') AS store_name,
      p.store_description,
      p.store_image_url,
      p.opening_hours
    FROM partners p
    WHERE NOT EXISTS (
      SELECT 1 FROM stores s
      WHERE s.partner_id = p.id AND s.is_headquarters = true
    )
  LOOP
    -- Verificar se já existe alguma store para este partner (sem ser headquarters)
    SELECT id INTO v_existing_store_id
    FROM stores
    WHERE partner_id = r.partner_id
    ORDER BY created_at ASC
    LIMIT 1;

    v_slug := generate_store_slug(r.store_name, r.partner_id);

    IF v_existing_store_id IS NOT NULL THEN
      -- Atualizar store existente com dados do Partner
      UPDATE stores SET
        name = COALESCE(NULLIF(r.store_name, ''), stores.name),
        slug = COALESCE(stores.slug, v_slug),
        description = COALESCE(stores.description, r.store_description),
        opening_hours = CASE
          WHEN stores.opening_hours IS NULL OR stores.opening_hours = '{}'::jsonb
          THEN COALESCE(r.opening_hours, '{}'::jsonb)
          ELSE stores.opening_hours
        END,
        logo_url = COALESCE(stores.logo_url, r.store_image_url),
        image_url = COALESCE(stores.image_url, r.store_image_url),
        is_headquarters = true,
        updated_at = NOW()
      WHERE id = v_existing_store_id;
    ELSE
      -- Criar nova store como Loja Principal
      INSERT INTO stores (
        partner_id,
        name,
        slug,
        description,
        opening_hours,
        logo_url,
        image_url,
        is_headquarters,
        is_active
      ) VALUES (
        r.partner_id,
        r.store_name,
        v_slug,
        r.store_description,
        COALESCE(r.opening_hours, '{}'::jsonb),
        r.store_image_url,
        r.store_image_url,
        true,
        true
      );
    END IF;
  END LOOP;
END;
$$;

-- Atualizar trigger existente para incluir novos campos ao criar Partner
CREATE OR REPLACE FUNCTION create_initial_store_for_partner()
RETURNS TRIGGER AS $$
DECLARE
  v_slug TEXT;
BEGIN
  v_slug := generate_store_slug(COALESCE(NULLIF(NEW.store_name, ''), 'Loja Principal'), NEW.id);

  INSERT INTO public.stores (
    partner_id, name, slug, description,
    opening_hours, logo_url, image_url,
    is_headquarters, is_active
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.store_name, ''), 'Loja Principal'),
    v_slug,
    NEW.store_description,
    COALESCE(NEW.opening_hours, '{}'::jsonb),
    NEW.store_image_url,
    NEW.store_image_url,
    true,
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_initial_store ON public.partners;
CREATE TRIGGER trigger_create_initial_store
  AFTER INSERT ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_store_for_partner();

COMMIT;
