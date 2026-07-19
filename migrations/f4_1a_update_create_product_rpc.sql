-- ============================================================================
-- F4.1a — Atualizar RPC create_product_transaction
-- Remove write to products.store_id (legacy), cria store_products via bridge.
-- ============================================================================
-- Contexto:
--   products.store_id é coluna legada (Fase 4). Novos produtos devem criar
--   relação via store_products em vez de escrever store_id diretamente.
--   O RPC ainda aceita store_id no JSONB para compatibilidade, mas não o
--   persiste em products — em vez disso, insere em store_products.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_product_transaction(
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_product_id UUID;
  v_result JSONB;
  v_partner_id UUID;
  v_store_id UUID;
BEGIN
  v_partner_id := (p_product_data->>'partner_id')::UUID;
  v_store_id := (p_product_data->>'store_id')::UUID;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM partner_users 
    WHERE partner_id = v_partner_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM partners
    WHERE id = v_partner_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para adicionar produtos a este negócio (partner_id: %)', v_partner_id;
  END IF;

  INSERT INTO products (
    id, partner_id, name, description, sku, gtin,
    brand_id, category_id, subcategory_id, marketplace_category_id,
    condition, unit, product_type, location_id,
    cost_price, price, promotional_price, min_stock, max_stock, stock_quantity,
    is_active, is_on_promotion, show_price_in_store, show_in_marketplace,
    images, is_featured, availability_value, availability_unit,
    warranty, video_url, technical_specs, delivery_format,
    tags, allow_sell_without_stock, moderation_status, created_at, updated_at
  ) VALUES (
    COALESCE((p_product_data->>'id')::UUID, gen_random_uuid()),
    v_partner_id,
    p_product_data->>'name',
    p_product_data->>'description',
    p_product_data->>'sku',
    p_product_data->>'gtin',
    CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END,
    CASE WHEN p_product_data->>'marketplace_category_id' IS NOT NULL AND p_product_data->>'marketplace_category_id' <> '' THEN (p_product_data->>'marketplace_category_id')::UUID ELSE NULL END,
    p_product_data->>'condition',
    p_product_data->>'unit',
    p_product_data->>'product_type',
    CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END,
    (p_product_data->>'cost_price')::NUMERIC,
    COALESCE((p_product_data->>'price')::NUMERIC, 0),
    (p_product_data->>'promotional_price')::NUMERIC,
    (p_product_data->>'min_stock')::INTEGER,
    (p_product_data->>'max_stock')::INTEGER,
    COALESCE((p_product_data->>'stock_quantity')::INTEGER, 0),
    (p_product_data->>'is_active')::BOOLEAN,
    (p_product_data->>'is_on_promotion')::BOOLEAN,
    (p_product_data->>'show_price_in_store')::BOOLEAN,
    COALESCE((p_product_data->>'show_in_marketplace')::BOOLEAN, true),
    COALESCE(p_product_data->'images', '[]'::JSONB),
    (p_product_data->>'is_featured')::BOOLEAN,
    COALESCE((p_product_data->>'availability_value')::INTEGER, 0),
    p_product_data->>'availability_unit',
    p_product_data->>'warranty',
    p_product_data->>'video_url',
    COALESCE(p_product_data->'technical_specs', '{}'::JSONB),
    p_product_data->>'delivery_format',
    (SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product_data->'tags', '[]'::JSONB))::TEXT)),
    COALESCE((p_product_data->>'allow_sell_without_stock')::BOOLEAN, false),
    COALESCE(p_product_data->>'moderation_status', 'approved'),
    COALESCE((p_product_data->>'created_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_product_data->>'updated_at')::TIMESTAMPTZ, NOW())
  ) RETURNING id, row_to_json(products.*) INTO v_product_id, v_result;

  -- F4.1: criar bridge store_products em vez de escrever store_id em products
  IF v_store_id IS NOT NULL THEN
    INSERT INTO store_products (product_id, store_id, is_active, updated_at)
    VALUES (v_product_id, v_store_id, true, NOW())
    ON CONFLICT (product_id, store_id) DO UPDATE SET updated_at = NOW();
  END IF;

  -- Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      v_product_id,
      p_fiscal_data->>'ncm', p_fiscal_data->>'cest', (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type', p_fiscal_data->>'cfop_internal', p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn', (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst', (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst', (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst', p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation', p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod', p_fiscal_data->>'fci_code'
    );
  END IF;

  -- Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      v_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC, (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC, (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC, p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) TO authenticated, service_role;

COMMIT;
