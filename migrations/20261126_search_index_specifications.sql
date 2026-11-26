-- ============================================================================
-- Migration: 20261126_search_index_specifications.sql
--
-- Objetivo:
--   Incluir as especificações técnicas de produtos (`products.technical_specs`)
--   e serviços (`services.technical_details`) no índice Full-Text Search (`fts`)
--   do marketplace, mantendo o custo de leitura em zero (usa o mesmo `tsvector`
--   pré-computado e o mesmo índice GIN `idx_products_fts` / `idx_services_fts`).
--
-- Estratégia:
--   1. `extract_marketplace_specs_text(jsonb)`: extrai apenas pares nome/valor
--      reais de especificações (compatível com `lib/utils/specifications.ts`),
--      ignorando chaves internas como `addon_groups`, `accepts_offers`, etc.
--   2. `build_marketplace_tsvector(...)`: adiciona parâmetro opcional `p_specs`
--      com peso 'B' (mesmo patamar de tags/subcategoria, abaixo de nome/categoria
--      peso 'A' e acima de descrição peso 'C').
--   3. Atualiza `refresh_product_marketplace_fts` e `refresh_service_marketplace_fts`
--      para enviar as especificações ao `tsvector`.
--   4. Atualiza os triggers `trg_products_marketplace_fts` e
--      `trg_services_marketplace_fts` para disparar também em alterações de
--      `technical_specs` / `technical_details` (e `store_id`).
--   5. Backfill cirúrgico apenas nos registros que possuem especificações.
--
-- Idempotente e segura para rodar em produção.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Extrator determinístico de texto de especificações (JSONB -> TEXT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extract_marketplace_specs_text(p_raw JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_source JSONB := p_raw;
  v_raw_str TEXT;
  v_subkey TEXT;
  v_has_explicit_subkey BOOLEAN := FALSE;
  v_elem JSONB;
  v_name TEXT;
  v_val_json JSONB;
  v_val TEXT;
  v_val_type TEXT;
  v_key TEXT;
  v_parts TEXT[] := ARRAY[]::TEXT[];
  v_ignored_keys CONSTANT TEXT[] := ARRAY[
    'id', 'short_id', 'partner_id', 'store_id', 'name', 'title', 'description',
    'price', 'cost_price', 'promotional_price', 'stock_quantity', 'stock_available',
    'stock_reserved', 'min_stock', 'max_stock', 'sku', 'gtin', 'images',
    'created_at', 'updated_at', 'is_active', 'status', 'moderation_status',
    'moderation_reason', 'category_id', 'subcategory_id', 'category', 'subcategory',
    'marketplace_category_id', 'marketplace_category', 'addon_groups',
    'accepts_offers', 'accepts_trades', 'condition', 'condicao', 'warranty',
    'warranty_value', 'warranty_period', 'availability_value', 'availability_unit',
    'brand', 'brand_id', 'location', 'location_id', 'tags', 'fulfillment_modes',
    'video_url', 'video_type', 'video_thumbnail', 'video_duration',
    'video_provider_id', 'payment_requirement', 'show_price_in_store',
    'show_in_marketplace', 'partners', 'stores', 'product_variants', 'variants',
    'product_type', 'service_type', 'billing_unit', 'price_type',
    'duration_minutes', 'buffer_minutes', 'resources', 'assigned_staff', 'notes',
    'rating', 'product_logistics', 'weight_gross', 'weight_net', 'width', 'height',
    'length', 'packaging_type', 'preparation_days', 'vendas_totais',
    'technical_specs', 'technical_details', 'attributes', 'specs', 'fts',
    'product_id', 'external_id', 'external_provider', 'last_external_sync_at',
    'marketplace_score', 'total_sales', 'sales_last_30_days', 'sales_last_7_days',
    'views_count', 'views_last_30_days', 'favorites_count', 'last_sale_at',
    'mp_store_name', 'is_on_promotion', 'primary_image_index',
    'allow_sell_without_stock', 'ncm', 'cest', 'origin', 'item_type',
    'cfop_internal', 'cfop_external', 'csosn', 'tax_percentage', 'pis_cst',
    'pis_rate', 'cofins_cst', 'cofins_rate', 'ipi_cst', 'ipi_code',
    'product_situation', 'c_benef', 'inf_ad_prod', 'fci_code', 'cst_ibs_cbs',
    'c_class_trib', 'unit', 'unidade', 'costPrice', 'stock', 'minStock',
    'maxStock', 'productType', 'localizacao', 'digital_format', 'delivery_format',
    'is_featured', 'has_variants', 'deleted_at', 'deleted_by', 'deleted_reason',
    'supplier_id', 'fiscal_profile_id', 'brand_rel', 'location_rel',
    'product_fiscal_profiles'
  ];
BEGIN
  IF v_source IS NULL THEN
    RETURN '';
  END IF;

  -- Caso raro: string JSON salva dentro de jsonb
  IF jsonb_typeof(v_source) = 'string' THEN
    v_raw_str := trim(v_source #>> '{}');
    IF (left(v_raw_str, 1) = '{' AND right(v_raw_str, 1) = '}')
       OR (left(v_raw_str, 1) = '[' AND right(v_raw_str, 1) = ']') THEN
      BEGIN
        v_source := v_raw_str::JSONB;
      EXCEPTION WHEN OTHERS THEN
        RETURN '';
      END;
    ELSE
      RETURN '';
    END IF;
  END IF;

  -- Caso wrapper explícito: { attributes: [...], addon_groups: [...], ... }
  IF jsonb_typeof(v_source) = 'object' THEN
    FOREACH v_subkey IN ARRAY ARRAY['attributes', 'technical_details', 'technical_specs', 'specs'] LOOP
      IF v_source ? v_subkey AND v_source->v_subkey IS NOT NULL AND jsonb_typeof(v_source->v_subkey) <> 'null' THEN
        v_has_explicit_subkey := TRUE;
        v_val := public.extract_marketplace_specs_text(v_source->v_subkey);
        IF v_val <> '' THEN
          RETURN v_val;
        END IF;
      END IF;
    END LOOP;

    -- Se é wrapper explícito mas a lista veio vazia, não percorrer chaves irmãs
    IF v_has_explicit_subkey THEN
      RETURN '';
    END IF;

    -- Caso mapa chave-valor legado: { "Material": "Algodão", "Voltagem": "220V" }
    FOR v_key, v_val_json IN SELECT key, value FROM jsonb_each(v_source) LOOP
      IF v_key = ANY(v_ignored_keys) OR v_val_json IS NULL THEN
        CONTINUE;
      END IF;

      v_val_type := jsonb_typeof(v_val_json);
      IF v_val_type = 'string' THEN
        v_val := trim(v_val_json #>> '{}');
      ELSIF v_val_type = 'number' THEN
        v_val := trim(v_val_json::TEXT);
      ELSIF v_val_type = 'boolean' THEN
        -- Só indexa booleano verdadeiro para evitar falso positivo (ex: "Backup incluso: Não")
        IF (v_val_json::TEXT) = 'true' THEN
          v_val := 'Sim';
        ELSE
          v_val := '';
        END IF;
      ELSIF v_val_type = 'array' THEN
        SELECT string_agg(trim(el #>> '{}'), ' ')
        INTO v_val
        FROM jsonb_array_elements(v_val_json) AS el
        WHERE jsonb_typeof(el) IN ('string', 'number')
          AND trim(el #>> '{}') <> '';
      ELSIF v_val_type = 'object' THEN
        v_val := trim(COALESCE(v_val_json->>'value', v_val_json->>'name', v_val_json->>'label', ''));
      ELSE
        v_val := '';
      END IF;

      v_name := trim(v_key);
      IF v_name <> '' AND COALESCE(v_val, '') <> '' THEN
        v_parts := array_append(v_parts, v_name || ' ' || v_val);
      END IF;
    END LOOP;

    RETURN array_to_string(v_parts, ' ');
  END IF;

  -- Caso array de objetos de especificação: [{ name/label/..., value/val/... }, ...]
  IF jsonb_typeof(v_source) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_source) LOOP
      IF jsonb_typeof(v_elem) <> 'object' THEN
        CONTINUE;
      END IF;

      v_name := trim(COALESCE(
        v_elem->>'name',
        v_elem->>'label',
        v_elem->>'key',
        v_elem->>'title',
        v_elem->>'titulo',
        v_elem->>'atributo',
        ''
      ));

      IF v_name = '' THEN
        CONTINUE;
      END IF;

      v_val_json := COALESCE(
        NULLIF(v_elem->'value', 'null'::jsonb),
        NULLIF(v_elem->'val', 'null'::jsonb),
        NULLIF(v_elem->'valor', 'null'::jsonb),
        NULLIF(v_elem->'descricao', 'null'::jsonb)
      );

      IF v_val_json IS NULL THEN
        CONTINUE;
      END IF;

      v_val_type := jsonb_typeof(v_val_json);
      IF v_val_type = 'string' THEN
        v_val := trim(v_val_json #>> '{}');
      ELSIF v_val_type = 'number' THEN
        v_val := trim(v_val_json::TEXT);
      ELSIF v_val_type = 'boolean' THEN
        IF (v_val_json::TEXT) = 'true' THEN
          v_val := 'Sim';
        ELSE
          v_val := '';
        END IF;
      ELSIF v_val_type = 'array' THEN
        SELECT string_agg(trim(el #>> '{}'), ' ')
        INTO v_val
        FROM jsonb_array_elements(v_val_json) AS el
        WHERE jsonb_typeof(el) IN ('string', 'number')
          AND trim(el #>> '{}') <> '';
      ELSIF v_val_type = 'object' THEN
        v_val := trim(COALESCE(v_val_json->>'value', v_val_json->>'name', v_val_json->>'label', ''));
      ELSE
        v_val := '';
      END IF;

      IF COALESCE(v_val, '') <> '' THEN
        v_parts := array_append(v_parts, v_name || ' ' || v_val);
      END IF;
    END LOOP;

    RETURN array_to_string(v_parts, ' ');
  END IF;

  RETURN '';
END;
$function$;

-- ============================================================================
-- 2. Atualizar `build_marketplace_tsvector` com parâmetro opcional `p_specs`
--    (drop da assinatura antiga de 7 args para evitar ambiguidade de overload)
-- ============================================================================

DROP FUNCTION IF EXISTS public.build_marketplace_tsvector(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.build_marketplace_tsvector(
  p_name TEXT,
  p_category TEXT,
  p_subcategory TEXT,
  p_tags TEXT,
  p_description TEXT,
  p_store TEXT,
  p_sku TEXT DEFAULT NULL,
  p_specs TEXT DEFAULT NULL
)
RETURNS tsvector
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_name, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_category, ''))), 'A') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_subcategory, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_tags, ''))), 'B') ||
    setweight(to_tsvector('portuguese', unaccent(public.strip_html_tags(p_description))), 'C') ||
    setweight(to_tsvector('portuguese', unaccent(coalesce(p_store, ''))), 'D') ||
    CASE
      WHEN coalesce(p_sku, '') <> '' THEN setweight(to_tsvector('portuguese', unaccent(p_sku)), 'B')
      ELSE ''::tsvector
    END ||
    CASE
      WHEN coalesce(p_specs, '') <> '' THEN setweight(to_tsvector('portuguese', unaccent(p_specs)), 'B')
      ELSE ''::tsvector
    END;
$function$;

-- ============================================================================
-- 3. Atualizar `refresh_product_marketplace_fts` e trigger em `products`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_product_marketplace_fts(p_product_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.products p
  SET
    mp_store_name = data.store_name,
    mp_search_category_text = data.category_text,
    mp_search_subcategory_text = data.subcategory_text,
    fts = data.fts
  FROM (
    SELECT
      p2.id,
      COALESCE(st.name, '') AS store_name,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN parent_cat.name
        ELSE cat.name
      END AS category_text,
      CASE
        WHEN cat.parent_id IS NOT NULL THEN cat.name
        ELSE NULL
      END AS subcategory_text,
      public.build_marketplace_tsvector(
        p2.name,
        CASE WHEN cat.parent_id IS NOT NULL THEN parent_cat.name ELSE cat.name END,
        CASE WHEN cat.parent_id IS NOT NULL THEN cat.name ELSE NULL END,
        array_to_string(coalesce(p2.tags, '{}'::text[]), ' '),
        p2.description,
        COALESCE(st.name, ''),
        p2.sku,
        public.extract_marketplace_specs_text(p2.technical_specs)
      ) AS fts
    FROM public.products p2
    LEFT JOIN public.stores st ON st.id = COALESCE(
      p2.store_id,
      (SELECT s.id FROM public.stores s WHERE s.partner_id = p2.partner_id LIMIT 1)
    )
    LEFT JOIN public.marketplace_product_categories cat ON cat.id = p2.marketplace_category_id
    LEFT JOIN public.marketplace_product_categories parent_cat ON parent_cat.id = cat.parent_id
    WHERE (p_product_id IS NULL OR p2.id = p_product_id)
  ) data
  WHERE p.id = data.id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_marketplace_fts ON public.products;
CREATE TRIGGER trg_products_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, sku, tags, technical_specs, marketplace_category_id, partner_id, store_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_products_marketplace_fts();

-- ============================================================================
-- 4. Atualizar `refresh_service_marketplace_fts` e trigger em `services`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_service_marketplace_fts(p_service_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $function$
BEGIN
  UPDATE public.services s
  SET
    mp_store_name = data.store_name,
    mp_search_category_text = data.category_text,
    mp_search_subcategory_text = data.subcategory_text,
    fts = data.fts
  FROM (
    SELECT
      s2.id,
      COALESCE(st.name, '') AS store_name,
      coalesce(
        CASE WHEN mcat.parent_id IS NOT NULL THEN mparent.name ELSE mcat.name END,
        sc.name
      ) AS category_text,
      CASE
        WHEN mcat.parent_id IS NOT NULL THEN mcat.name
        ELSE NULL
      END AS subcategory_text,
      public.build_marketplace_tsvector(
        s2.name,
        coalesce(
          CASE WHEN mcat.parent_id IS NOT NULL THEN mparent.name ELSE mcat.name END,
          sc.name
        ),
        CASE WHEN mcat.parent_id IS NOT NULL THEN mcat.name ELSE NULL END,
        coalesce((
          SELECT string_agg(elem, ' ')
          FROM jsonb_array_elements_text(coalesce(s2.tags, '[]'::jsonb)) AS elem
        ), ''),
        s2.description,
        COALESCE(st.name, ''),
        NULL,
        public.extract_marketplace_specs_text(s2.technical_details)
      ) AS fts
    FROM public.services s2
    LEFT JOIN public.stores st ON st.id = COALESCE(
      s2.store_id,
      (SELECT s.id FROM public.stores s WHERE s.partner_id = s2.partner_id LIMIT 1)
    )
    LEFT JOIN public.marketplace_service_categories mcat ON mcat.id = s2.marketplace_category_id
    LEFT JOIN public.marketplace_service_categories mparent ON mparent.id = mcat.parent_id
    LEFT JOIN public.service_categories sc ON sc.id = s2.category_id
    WHERE (p_service_id IS NULL OR s2.id = p_service_id)
  ) data
  WHERE s.id = data.id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_marketplace_fts ON public.services;
CREATE TRIGGER trg_services_marketplace_fts
  AFTER INSERT OR UPDATE OF
    name, description, tags, technical_details, marketplace_category_id, category_id, partner_id, store_id
  ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_services_marketplace_fts();

-- ============================================================================
-- 5. Backfill cirúrgico: reindexa apenas produtos/serviços que têm specs
-- ============================================================================

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.products
    WHERE technical_specs IS NOT NULL
      AND technical_specs <> '{}'::jsonb
      AND technical_specs <> '[]'::jsonb
      AND public.extract_marketplace_specs_text(technical_specs) <> ''
  LOOP
    PERFORM public.refresh_product_marketplace_fts(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id
    FROM public.services
    WHERE technical_details IS NOT NULL
      AND technical_details <> '{}'::jsonb
      AND technical_details <> '[]'::jsonb
      AND public.extract_marketplace_specs_text(technical_details) <> ''
  LOOP
    PERFORM public.refresh_service_marketplace_fts(v_id);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
