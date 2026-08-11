-- ============================================================================
-- Fase 10 - Store-Aware PDV / Cash Register
-- ============================================================================
--
-- Changes:
-- 1. Add store_id to pre_sales, sales, sale_items
-- 2. Add store_id to cash_sessions, cash_movements
-- 3. Update unique index on cash_sessions to be (partner_id, store_id, user_id)
-- 4. Update RLS policies for store-aware access
-- 5. Update finalize_pos_sale RPC to accept p_store_id
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. pre_sales
-- ============================================================
ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pre_sales_store_id ON public.pre_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_pre_sales_partner_store_status
  ON public.pre_sales(partner_id, store_id, status, created_at DESC);

-- ============================================================
-- 2. sales
-- ============================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_store_id ON public.sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_store_created
  ON public.sales(partner_id, store_id, created_at DESC);

-- ============================================================
-- 3. sale_items
-- ============================================================
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON public.sale_items(store_id);

-- ============================================================
-- 4. cash_sessions
-- ============================================================
ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_id ON public.cash_sessions(store_id);

-- Backfill existing open sessions: assign to the partner's first store
-- M6: Fase 10.1 concluída. Pendente: verificar dados existentes e adicionar NOT NULL
DO $$
DECLARE
  v_store RECORD;
BEGIN
  FOR v_store IN SELECT s.id, s.partner_id FROM public.stores s WHERE s.is_active = true
  LOOP
    UPDATE public.cash_sessions cs
    SET store_id = v_store.id
    WHERE cs.partner_id = v_store.partner_id
      AND cs.store_id IS NULL;
  END LOOP;
END $$;

-- Replace unique index: (partner_id) -> (partner_id, store_id, opened_by_user_id)
-- NOTE: user_id was renamed to opened_by_user_id in 20260421_cash_register_production.sql
DROP INDEX IF EXISTS public.idx_cash_sessions_open_partner;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_user_partner_store
  ON public.cash_sessions (partner_id, store_id, opened_by_user_id)
  WHERE status = 'open';

-- ============================================================
-- 5. cash_movements
-- ============================================================
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_store_id ON public.cash_movements(store_id);

-- Backfill cash_movements store_id from their parent cash_session
UPDATE public.cash_movements cm
SET store_id = cs.store_id
FROM public.cash_sessions cs
WHERE cm.cash_session_id = cs.id
  AND cm.store_id IS NULL;

-- ============================================================
-- 6. Update RLS Policies - pre_sales
-- ============================================================
DROP POLICY IF EXISTS "pre_sales_select_own" ON public.pre_sales;
CREATE POLICY "pre_sales_select_own" ON public.pre_sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "pre_sales_insert_own" ON public.pre_sales;
CREATE POLICY "pre_sales_insert_own" ON public.pre_sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "pre_sales_update_own" ON public.pre_sales;
CREATE POLICY "pre_sales_update_own" ON public.pre_sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "pre_sales_delete_own" ON public.pre_sales;
CREATE POLICY "pre_sales_delete_own" ON public.pre_sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

-- ============================================================
-- 7. Update RLS Policies - sales
-- ============================================================
DROP POLICY IF EXISTS "sales_select_own" ON public.sales;
CREATE POLICY "sales_select_own" ON public.sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sales_insert_own" ON public.sales;
CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sales_update_own" ON public.sales;
CREATE POLICY "sales_update_own" ON public.sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sales_delete_own" ON public.sales;
CREATE POLICY "sales_delete_own" ON public.sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

-- ============================================================
-- 8. Update RLS Policies - sale_items
-- ============================================================
DROP POLICY IF EXISTS "sale_items_select_own" ON public.sale_items;
CREATE POLICY "sale_items_select_own" ON public.sale_items
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sale_items_insert_own" ON public.sale_items;
CREATE POLICY "sale_items_insert_own" ON public.sale_items
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sale_items_update_own" ON public.sale_items;
CREATE POLICY "sale_items_update_own" ON public.sale_items
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "sale_items_delete_own" ON public.sale_items;
CREATE POLICY "sale_items_delete_own" ON public.sale_items
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

-- ============================================================
-- 9. Update RLS Policies - cash_sessions
-- ============================================================
DROP POLICY IF EXISTS "cash_sessions_select_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_own" ON public.cash_sessions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_sessions_insert_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_insert_own" ON public.cash_sessions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_sessions_update_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_update_own" ON public.cash_sessions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_sessions_delete_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_delete_own" ON public.cash_sessions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

-- ============================================================
-- 10. Update RLS Policies - cash_movements
-- ============================================================
DROP POLICY IF EXISTS "cash_movements_select_own" ON public.cash_movements;
CREATE POLICY "cash_movements_select_own" ON public.cash_movements
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_movements_insert_own" ON public.cash_movements;
CREATE POLICY "cash_movements_insert_own" ON public.cash_movements
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_movements_update_own" ON public.cash_movements;
CREATE POLICY "cash_movements_update_own" ON public.cash_movements
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS "cash_movements_delete_own" ON public.cash_movements;
CREATE POLICY "cash_movements_delete_own" ON public.cash_movements
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
    OR
    (store_id IS NOT NULL AND public.user_has_store_access(store_id))
  );

-- ============================================================
-- 11. Update finalize_pos_sale RPC with p_store_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_pos_sale(
  p_partner_id UUID,
  p_pre_sale_id UUID,
  p_finance_account_id UUID,
  p_cash_session_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_breakdown JSONB,
  p_user_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft RECORD;
  v_items JSONB;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_final_amount NUMERIC;
  v_shipping_fee NUMERIC;
  v_other_costs NUMERIC;
  v_product RECORD;
  v_variant RECORD;
  v_available NUMERIC;
  v_sale_id UUID;
  v_stock_items JSONB := '[]'::jsonb;
  v_clamped_paid NUMERIC;
  v_payment_status TEXT;
  v_tx_id UUID;
  v_now TIMESTAMPTZ;
  v_entry JSONB;
  v_entry_amount NUMERIC;
  v_entry_pm_id UUID;
  v_breakdown_total NUMERIC := 0;
  v_is_cash BOOLEAN;
  v_sale_number TEXT;
  v_stock_movement_result JSON;
  v_stock_movement_id UUID;
  v_payment_line INT := 0;

  -- Individual adjustment totals (read from JSONB directly)
  v_interest_total NUMERIC := 0;
  v_fee_total NUMERIC := 0;
  v_fixed_fee_total NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_original_amount_total NUMERIC := 0;
  v_final_amount_adjusted NUMERIC := 0;

  -- Store-aware stock check variables
  v_store_product_id UUID;
  v_store_override_qty INT;
  v_store_reserved INT;
  v_allow_sell_without_stock BOOLEAN;
BEGIN
  SELECT * INTO v_draft
    FROM public.pre_sales
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pré-venda não encontrada.';
  END IF;

  IF v_draft.status != 'draft' THEN
    RAISE EXCEPTION 'Esta pré-venda já foi finalizada.';
  END IF;

  SELECT id INTO v_sale_id
    FROM public.sales
   WHERE pre_sale_id = p_pre_sale_id
     AND partner_id = p_partner_id
     LIMIT 1;
  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  v_items := COALESCE(v_draft.items, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Não é possível finalizar venda sem itens.';
  END IF;

  v_subtotal := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_unit_price NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_unit_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'Preço inválido para item "%".', COALESCE(v_item->>'name', 'desconhecido');
      END IF;
      v_subtotal := v_subtotal + ROUND(v_qty * v_unit_price, 2);
    END;
  END LOOP;

  v_discount := LEAST(COALESCE(v_draft.discount_amount, 0), v_subtotal);
  v_shipping_fee := GREATEST(COALESCE(v_draft.shipping_fee, 0), 0);
  v_other_costs := GREATEST(COALESCE(v_draft.other_costs, 0), 0);
  v_final_amount := GREATEST(ROUND(v_subtotal - v_discount + v_shipping_fee + v_other_costs, 2), 0);

  IF v_final_amount <= 0 THEN
    RAISE EXCEPTION 'A venda não pode ser finalizada com valor zerado.';
  END IF;

  IF ABS(v_subtotal - COALESCE(v_draft.subtotal, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  IF ABS(v_final_amount - COALESCE(v_draft.total_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Total inconsistente. Atualize a pré-venda antes de finalizar.';
  END IF;

  -- Validate stock: when p_store_id is provided, check store_products;
  -- otherwise fall back to products (legacy compatibility)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_pid UUID;
      v_vid UUID;
      v_qty NUMERIC;
      v_name TEXT;
    BEGIN
      v_pid := (v_item->>'product_id')::uuid;
      IF v_pid IS NULL THEN v_pid := (v_item->>'productId')::uuid; END IF;
      IF v_pid IS NULL THEN CONTINUE; END IF;

      v_vid := (v_item->>'variant_id')::uuid;
      IF v_vid IS NULL THEN v_vid := (v_item->>'variantId')::uuid; END IF;

      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_name := COALESCE(v_item->>'name', 'item');

      IF v_vid IS NOT NULL THEN
        -- Products with variants: use product_variants (store_product_variants not yet available)
        -- M6: Substituir por store_product_variants quando integração estiver completa
        SELECT p.id, p.stock_available, p.allow_sell_without_stock,
               (SELECT count(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count
          INTO v_product
          FROM products p
         WHERE p.id = v_pid
           AND p.partner_id = p_partner_id
           FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Produto não encontrado para "%".', v_name;
        END IF;

        IF v_product.variant_count > 0 AND v_vid IS NULL THEN
          RAISE EXCEPTION 'Variação não informada para o item %', v_name;
        END IF;

        IF NOT COALESCE(v_product.allow_sell_without_stock, false) THEN
          SELECT pv.id, pv.stock_available, pv.product_id
            INTO v_variant
            FROM product_variants pv
           WHERE pv.id = v_vid
             FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'A variação do item % não existe mais.', v_name;
          END IF;

          IF v_variant.product_id != v_pid THEN
            RAISE EXCEPTION 'Combinação inválida de variação para o item %', v_name;
          END IF;

          v_available := COALESCE(v_variant.stock_available, 0);
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
          END IF;
        END IF;
      ELSIF p_store_id IS NOT NULL THEN
        -- Product without variant, store-aware: check store_products
        SELECT sp.id, sp.override_stock_quantity, sp.stock_reserved,
               COALESCE(p.allow_sell_without_stock, false) as allow_sell_without_stock
          INTO v_store_product_id, v_store_override_qty, v_store_reserved, v_allow_sell_without_stock
          FROM public.store_products sp
          JOIN public.products p ON p.id = sp.product_id
         WHERE sp.product_id = v_pid
           AND sp.store_id = p_store_id
           FOR UPDATE OF sp;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Produto "%" não está vinculado a esta loja.', v_name;
        END IF;

        IF NOT COALESCE(v_allow_sell_without_stock, false) THEN
          v_available := GREATEST(0, COALESCE(v_store_override_qty, 0) - COALESCE(v_store_reserved, 0));
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente na loja para o item %', v_name;
          END IF;
        END IF;
      ELSE
        -- No store_id: fall back to products (legacy single-store compatibility)
        SELECT id, stock_available, allow_sell_without_stock,
               (SELECT count(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count
          INTO v_product
          FROM products p
         WHERE p.id = v_pid
           AND p.partner_id = p_partner_id
           FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Produto não encontrado para "%".', v_name;
        END IF;

        IF NOT COALESCE(v_product.allow_sell_without_stock, false) THEN
          v_available := COALESCE(v_product.stock_available, 0);
          IF v_qty > v_available THEN
            RAISE EXCEPTION 'Estoque insuficiente para o item %', v_name;
          END IF;
        END IF;
      END IF;
    END;
  END LOOP;

  -- Parse JSONB breakdown: read individual amounts directly
  IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
    SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
      INTO v_breakdown_total
      FROM jsonb_array_elements(p_payment_breakdown) e;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
    LOOP
      DECLARE
        v_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
        v_received NUMERIC := ROUND(GREATEST((v_entry->>'amountReceived')::numeric, 0), 2);
        -- Read individual amounts from JSONB directly (never derive from adjustmentType)
        v_interest_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
        v_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
        v_fixed_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
        v_discount_amt NUMERIC := 0;
      BEGIN
        -- Discount: only read from adjustmentAmount when adjustmentType is 'discount'
        IF v_adj_type = 'discount' THEN
          v_discount_amt := ROUND(GREATEST((v_entry->>'adjustmentAmount')::numeric, 0), 2);
        END IF;

        v_interest_total := v_interest_total + v_interest_amt;
        v_fee_total := v_fee_total + v_fee_amt;
        v_fixed_fee_total := v_fixed_fee_total + v_fixed_fee_amt;
        v_discount_total := v_discount_total + v_discount_amt;
        v_original_amount_total := v_original_amount_total + v_received;
      END;
    END LOOP;
  END IF;

  IF v_breakdown_total > 0 THEN
    v_final_amount_adjusted := v_breakdown_total;
  ELSE
    v_final_amount_adjusted := v_final_amount;
    v_original_amount_total := v_final_amount;
  END IF;

  v_clamped_paid := LEAST(
    v_final_amount_adjusted,
    GREATEST(0, ROUND(
      CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
    , 2))
  );

  IF v_clamped_paid >= v_final_amount_adjusted - 0.01 THEN
    v_payment_status := 'paid';
  ELSIF v_clamped_paid > 0 THEN
    v_payment_status := 'partially_paid';
  ELSE
    v_payment_status := 'pending';
  END IF;

  v_now := NOW();

  PERFORM 1
    FROM public.cash_sessions cs
   WHERE cs.id = p_cash_session_id
     AND cs.partner_id = p_partner_id
     AND cs.status = 'open'
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa inválido ou já fechado.';
  END IF;

  v_sale_number := public.generate_sale_number();

  INSERT INTO public.sales (
    partner_id, store_id, customer_id, pre_sale_id, total_amount, discount_amount,
    final_amount, paid_amount, payment_status, status, finance_account_id,
    cash_session_id, notes, finalized_by_user_id, sale_number
  ) VALUES (
    p_partner_id, p_store_id, v_draft.customer_id, v_draft.id, v_subtotal, v_discount,
    v_final_amount_adjusted, v_clamped_paid, v_payment_status, v_payment_status,
    p_finance_account_id, p_cash_session_id, v_draft.notes, p_user_id,
    v_sale_number
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_qty NUMERIC;
      v_up NUMERIC;
    BEGIN
      v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
      v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

      INSERT INTO public.sale_items (
        sale_id, partner_id, store_id, product_id, variant_id, product_name, variant_name,
        unit_price, quantity, subtotal, total_price,
        is_gift, original_price, is_promotional, promotion_id
      ) VALUES (
        v_sale_id, p_partner_id, p_store_id,
        COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid),
        COALESCE((v_item->>'variant_id')::uuid, (v_item->>'variantId')::uuid),
        COALESCE(v_item->>'name', 'Item'),
        COALESCE(v_item->>'variant_name', v_item->>'variantName'),
        v_up, v_qty,
        ROUND(v_qty * v_up, 2),
        ROUND(v_qty * v_up, 2),
        COALESCE((v_item->>'is_gift')::boolean, false),
        (v_item->>'original_price')::numeric,
        COALESCE((v_item->>'is_promotional')::boolean, false),
        (v_item->>'promotion_id')::uuid
      );

      IF COALESCE((v_item->>'product_id')::uuid, (v_item->>'productId')::uuid) IS NOT NULL THEN
        v_stock_items := v_stock_items || jsonb_build_object(
          'product_id', COALESCE(v_item->>'product_id', v_item->>'productId'),
          'variant_id', COALESCE(v_item->>'variant_id', v_item->>'variantId'),
          'quantity', v_qty
        );
      END IF;
    END;
  END LOOP;

  -- Create stock movement - pass p_store_id so create_batch_stock_movement
  -- updates store_products.override_stock_quantity instead of products.stock_quantity
  IF jsonb_array_length(v_stock_items) > 0 THEN
    v_stock_movement_result := public.create_batch_stock_movement(
      p_partner_id := p_partner_id,
      p_movement_type := 'out',
      p_reason := 'Venda de Produtos',
      p_notes := NULLIF(BTRIM(COALESCE(v_draft.notes, '')), ''),
      p_created_by := p_user_id,
      p_items := v_stock_items,
      p_store_id := p_store_id
    );
    v_stock_movement_id := NULLIF((v_stock_movement_result->>'id'), '')::uuid;
    IF v_stock_movement_id IS NOT NULL THEN
      UPDATE public.stock_movements
      SET reference_name = 'Pedido #' || v_sale_number
      WHERE id = v_stock_movement_id;
    END IF;
  END IF;

  IF v_clamped_paid > 0 THEN
    INSERT INTO public.transactions (
      partner_id, store_id, description, category, customer_id, contact_type,
      amount, due_date, payment_date, transaction_date,
      status, notes, payment_type, original_amount, interest_amount, fee_amount,
      discount_amount,
      transaction_type, origin, reference_note, account_id,
      payment_method_id, created_by_user_id
    ) VALUES (
      p_partner_id, p_store_id,
      v_sale_number,
      'Vendas',
      v_draft.customer_id,
      'customer',
      v_clamped_paid, NULL, v_now, v_now,
      'paid',
      NULL,
      COALESCE(p_payment_method, 'Não informado'),
      v_original_amount_total,
      NULLIF(v_interest_total, 0),
      NULLIF(v_fee_total + v_fixed_fee_total, 0),
      v_discount_total,
      'income', 'system', v_sale_id::text, p_finance_account_id,
      NULL, p_user_id
    ) RETURNING id INTO v_tx_id;

    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      v_payment_line := 0;
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_payment_line := v_payment_line + 1;
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;

          DECLARE
            v_entry_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
            v_entry_received NUMERIC := ROUND(GREATEST((v_entry->>'amountReceived')::numeric, 0), 2);
            -- Read individual amounts from JSONB directly
            v_entry_interest NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
            v_entry_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
            v_entry_fixed_fee NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
            v_entry_discount NUMERIC := 0;
            v_entry_bearer TEXT := COALESCE(v_entry->>'feeBearer', 'merchant');
          BEGIN
            -- Discount: only from adjustmentType='discount'
            IF v_entry_adj_type = 'discount' THEN
              v_entry_discount := ROUND(GREATEST((v_entry->>'adjustmentAmount')::numeric, 0), 2);
            END IF;

            INSERT INTO public.transaction_payments (
              partner_id, transaction_id, amount, base_amount,
              interest_amount, fee_amount, discount_amount, fee_bearer,
              payment_method_id,
              created_by_user_id, created_at, idempotency_key
            ) VALUES (
              p_partner_id, v_tx_id, v_entry_amount, v_entry_received,
              v_entry_interest, v_entry_fee + v_entry_fixed_fee, v_entry_discount, v_entry_bearer,
              v_entry_pm_id,
              p_user_id, v_now,
              p_partner_id::text || ':' || v_sale_id::text || ':line' || v_payment_line::text || ':' || COALESCE(v_entry_pm_id::text, 'none')
            );
          END;
        END IF;
      END LOOP;
    END IF;

    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
      LOOP
        v_entry_amount := ROUND(GREATEST((v_entry->>'amount')::numeric, 0), 2);
        IF v_entry_amount > 0 THEN
          v_entry_pm_id := (v_entry->>'paymentMethodId')::uuid;
          IF v_entry_pm_id IS NULL THEN
            v_is_cash := true;
          ELSE
            SELECT EXISTS (
              SELECT 1 FROM public.payment_methods pm
              WHERE pm.id = v_entry_pm_id
                AND pm.partner_id = p_partner_id
                AND pm.type = 'cash'
            ) INTO v_is_cash;
          END IF;

          IF v_is_cash THEN
            INSERT INTO public.cash_movements (
              partner_id, store_id, cash_session_id, type, description,
              payment_method_id, amount, reference_id,
              created_by_user_id
            ) VALUES (
              p_partner_id, p_store_id, p_cash_session_id, 'sale',
              'Venda PDV ' || v_sale_number || ' - PDV',
              v_entry_pm_id,
              ABS(v_entry_amount),
              v_sale_id,
              p_user_id
            );
          END IF;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.cash_movements (
        partner_id, store_id, cash_session_id, type, description,
        payment_method_id, amount, reference_id,
        created_by_user_id
      ) VALUES (
        p_partner_id, p_store_id, p_cash_session_id, 'sale',
        'Venda PDV ' || v_sale_number || ' - PDV',
        NULL, ABS(v_clamped_paid), v_sale_id,
        p_user_id
      );
    END IF;
  END IF;

  UPDATE public.pre_sales
     SET status = 'completed',
         completed_sale_id = v_sale_id,
         updated_at = NOW()
   WHERE id = p_pre_sale_id
     AND partner_id = p_partner_id
     AND status = 'draft';

  RETURN v_sale_id;
END;
$$;

COMMIT;
