-- ============================================================================
-- Migration: DRE System, sale_items unit_cost, and Default Financial Categories
-- ============================================================================

BEGIN;

-- ── 1. Adicionar unit_cost em sale_items (snapshot de custo histórico no PDV) ──
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sale_items.unit_cost IS
  'Snapshot do custo unitário do produto/variante no momento da venda no PDV.';

-- Backfill seguro para vendas anteriores usando o preço de custo atual do produto
UPDATE public.sale_items si
SET unit_cost = COALESCE(p.cost_price, 0)
FROM public.products p
WHERE si.product_id = p.id
  AND si.unit_cost = 0
  AND p.cost_price IS NOT NULL;


-- ── 2. Adicionar dre_group em financial_categories ──────────────────────────
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS dre_group TEXT;

ALTER TABLE public.financial_categories
  DROP CONSTRAINT IF EXISTS financial_categories_dre_group_check;

ALTER TABLE public.financial_categories
  ADD CONSTRAINT financial_categories_dre_group_check
  CHECK (dre_group IS NULL OR dre_group IN (
    'receita_bruta',
    'deducao_receita',
    'custo_direto_cmv',
    'despesa_comercial',
    'despesa_administrativa',
    'pro_labore',
    'despesa_financeira',
    'receita_financeira',
    'nao_operacional'
  ));

COMMENT ON COLUMN public.financial_categories.dre_group IS
  'Classificação contábil/gerencial para consolidação na DRE.';


-- ── 3. Adicionar campos de alíquota/imposto em stores ───────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS simples_tax_rate_products NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simples_tax_rate_services NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mei_fixed_tax_amount NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN public.stores.simples_tax_rate_products IS
  'Alíquota estimada do Simples Nacional para Comércio (%).';
COMMENT ON COLUMN public.stores.simples_tax_rate_services IS
  'Alíquota estimada do Simples Nacional para Serviços (%).';
COMMENT ON COLUMN public.stores.mei_fixed_tax_amount IS
  'Valor fixo mensal do DAS-MEI (R$).';


-- ── 4. Atualizar finalize_pos_sale para gravar unit_cost em sale_items ──────
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
RETURNS TABLE(sale_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_draft RECORD;
    v_items JSONB;
    v_item JSONB;
    v_qty NUMERIC;
    v_up NUMERIC;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC;
    v_final_amount NUMERIC;
    v_final_amount_adjusted NUMERIC;
    v_shipping_fee NUMERIC;
    v_other_costs NUMERIC;
    v_discount_total NUMERIC := 0;
    v_clamped_paid NUMERIC;
    v_sale_number TEXT;
    v_sale_id UUID;
    v_payment_status TEXT;
    v_entry JSONB;
    v_interest_total NUMERIC := 0;
    v_fee_total NUMERIC := 0;
    v_fixed_fee_total NUMERIC := 0;
    v_breakdown_total NUMERIC := 0;
    v_original_amount_total NUMERIC := 0;
    v_stock_items JSONB := '[]'::JSONB;
    v_stock_movement_result JSON;
    v_stock_movement_id UUID;
    v_tx_id UUID;
    v_entry_amount NUMERIC;
    v_entry_pm_id UUID;
    v_payment_line INT := 0;
    v_now TIMESTAMPTZ := now();
    v_item_prod_id UUID;
    v_item_var_id UUID;
    v_item_unit_cost NUMERIC := 0;
BEGIN
    -- Validate cash session belongs to partner and is open
    IF p_cash_session_id IS NOT NULL THEN
        PERFORM 1
        FROM public.cash_sessions cs
        WHERE cs.id = p_cash_session_id
          AND cs.partner_id = p_partner_id
          AND cs.status = 'open'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caixa inválido ou já fechado.';
        END IF;
    END IF;

    -- Fetch the pre-sale / draft
    SELECT * INTO v_draft
    FROM public.pre_sales
    WHERE id = p_pre_sale_id AND partner_id = p_partner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pré-venda não encontrada';
    END IF;

    -- Load items from pre_sale
    SELECT COALESCE(v_draft.items, '[]'::JSONB) INTO v_items;

    -- ── Process items ────────────────────────────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
        v_discount := COALESCE((v_item->>'discount')::numeric, 0);

        v_subtotal := v_subtotal + (v_up * v_qty);

        IF (v_item->>'isPromotional')::bool IS NOT TRUE AND (v_item->>'is_promotional')::bool IS NOT TRUE THEN
            v_discount_total := v_discount_total + (v_discount * v_qty);
        END IF;
    END LOOP;

    v_final_amount := GREATEST(v_subtotal - v_discount_total, 0);
    v_shipping_fee := COALESCE(v_draft.shipping_fee, 0);
    v_other_costs := COALESCE(v_draft.other_costs, 0);
    v_final_amount := v_final_amount + v_shipping_fee + v_other_costs;

    v_final_amount_adjusted := v_final_amount;

    -- ── Parse payment_breakdown: read individual amounts directly ────────────
    IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
        SELECT COALESCE(SUM(GREATEST((e->>'amount')::numeric, 0)), 0)
          INTO v_breakdown_total
          FROM jsonb_array_elements(p_payment_breakdown) e;

        FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
        LOOP
            DECLARE
                v_adj_type TEXT := COALESCE(v_entry->>'adjustmentType', 'none');
                v_received NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'amountReceived')::numeric, 0), 0), 2);
                v_interest_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'interestAmount')::numeric, 0), 0), 2);
                v_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'feeAmount')::numeric, 0), 0), 2);
                v_fixed_fee_amt NUMERIC := ROUND(GREATEST(COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0), 0), 2);
                v_discount_amt NUMERIC := 0;
            BEGIN
                IF v_adj_type = 'discount' THEN
                    v_discount_amt := ROUND(GREATEST(COALESCE((v_entry->>'adjustmentAmount')::numeric, 0), 0), 2);
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
        v_original_amount_total := v_final_amount_adjusted;
    END IF;

    v_clamped_paid := LEAST(
        v_final_amount_adjusted,
        GREATEST(0, ROUND(
            CASE WHEN v_breakdown_total > 0 THEN v_breakdown_total ELSE COALESCE(p_paid_amount, 0) END
        , 2))
    );

    IF v_clamped_paid >= v_final_amount_adjusted AND v_final_amount_adjusted > 0 THEN
        v_payment_status := 'paid';
    ELSIF v_clamped_paid > 0 THEN
        v_payment_status := 'partially_paid';
    ELSE
        v_payment_status := 'pending';
    END IF;

    v_sale_number := public.generate_sale_number(p_partner_id);

    -- ── Insert sale ─────────────────────────────────────────────────────────
    INSERT INTO public.sales (
        partner_id, store_id, customer_id, pre_sale_id, sale_number,
        total_amount, discount_amount, final_amount, paid_amount,
        payment_status, status,
        finance_account_id, cash_session_id, notes, finalized_by_user_id,
        interest_amount, fee_amount, fixed_fee_amount
    ) VALUES (
        p_partner_id, p_store_id, v_draft.customer_id, v_draft.id, v_sale_number,
        v_subtotal, v_discount_total, v_final_amount_adjusted, v_clamped_paid,
        v_payment_status, v_payment_status,
        p_finance_account_id, p_cash_session_id, COALESCE(v_draft.notes, ''), p_user_id,
        COALESCE(NULLIF(v_interest_total, 0), 0),
        COALESCE(NULLIF(v_fee_total, 0), 0),
        COALESCE(NULLIF(v_fixed_fee_total, 0), 0)
    ) RETURNING id INTO v_sale_id;

    -- ── Insert sale items com snapshot de unit_cost ──────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_qty := COALESCE((v_item->>'quantity')::numeric, (v_item->>'qty')::numeric, 0);
        IF v_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_up := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
        v_item_prod_id := COALESCE(NULLIF(v_item->>'productId', '')::UUID, NULLIF(v_item->>'product_id', '')::UUID);
        v_item_var_id := COALESCE(NULLIF(v_item->>'variantId', '')::UUID, NULLIF(v_item->>'variant_id', '')::UUID);

        -- Resgata o custo unitário do produto
        v_item_unit_cost := 0;
        IF v_item_prod_id IS NOT NULL THEN
            SELECT COALESCE(cost_price, 0) INTO v_item_unit_cost
            FROM public.products
            WHERE id = v_item_prod_id;
        END IF;

        v_item_unit_cost := COALESCE(
            (v_item->>'unit_cost')::numeric,
            (v_item->>'cost_price')::numeric,
            (v_item->>'costPrice')::numeric,
            v_item_unit_cost,
            0
        );

        INSERT INTO public.sale_items (
            sale_id, partner_id, store_id, product_id, variant_id,
            product_name, variant_name, unit_price, unit_cost, quantity, subtotal, total_price,
            is_gift, original_price, is_promotional, promotion_id
        ) VALUES (
            v_sale_id, p_partner_id, p_store_id,
            v_item_prod_id,
            v_item_var_id,
            COALESCE(v_item->>'customName', v_item->>'custom_name', 'Item'),
            v_item->>'variant_name',
            v_up,
            v_item_unit_cost,
            v_qty,
            (v_up - COALESCE((v_item->>'discount')::numeric, 0)) * v_qty,
            v_up * v_qty,
            COALESCE((v_item->>'is_gift')::bool, (v_item->>'isGift')::bool, false),
            COALESCE((v_item->>'original_price')::numeric, (v_item->>'originalPrice')::numeric, 0),
            COALESCE((v_item->>'is_promotional')::bool, (v_item->>'isPromotional')::bool, false),
            NULLIF(v_item->>'promotionId', '')::UUID
        );
    END LOOP;

    -- ── Build stock items (products only, not services) for movement ─────────
    v_stock_items := (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'product_id', COALESCE(v_item2->>'productId', v_item2->>'product_id'),
                'variant_id', COALESCE(NULLIF(v_item2->>'variantId', ''), NULLIF(v_item2->>'variant_id', '')),
                'quantity', GREATEST(COALESCE((v_item2->>'quantity')::INT, (v_item2->>'qty')::INT, 0), 0)
            )
        ), '[]'::JSONB)
        FROM jsonb_array_elements(v_items) v_item2
        WHERE (
            (v_item2->>'lineType' IN ('product', 'simple') OR v_item2->>'line_type' IN ('product', 'simple'))
            OR (v_item2->>'productId') IS NOT NULL OR (v_item2->>'product_id') IS NOT NULL
        )
        AND (v_item2->>'serviceId') IS NULL AND (v_item2->>'service_id') IS NULL
        AND (v_item2->>'lineType') IS DISTINCT FROM 'service' AND (v_item2->>'line_type') IS DISTINCT FROM 'service'
    );

    -- ── Stock movement (delegates to create_batch_stock_movement) ────────────
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
            SET reference_type = 'pos_sale',
                reference_id = v_sale_id
            WHERE id = v_stock_movement_id;
        END IF;
    END IF;

    -- ── Update pre_sale status to 'completed' ────────────────────────────────
    UPDATE public.pre_sales
    SET status = 'completed',
        updated_at = v_now
    WHERE id = p_pre_sale_id AND partner_id = p_partner_id;

    -- ── Create Financial Transactions and Cash Movements ─────────────────────
    IF v_clamped_paid > 0 THEN
        IF p_payment_breakdown IS NOT NULL AND jsonb_array_length(p_payment_breakdown) > 0 THEN
            FOR v_entry IN SELECT * FROM jsonb_array_elements(p_payment_breakdown)
            LOOP
                v_entry_amount := GREATEST((v_entry->>'amount')::numeric, 0);
                v_entry_pm_id := NULLIF(v_entry->>'paymentMethodId', '')::UUID;
                v_payment_line := v_payment_line + 1;

                IF v_entry_amount > 0 THEN
                    INSERT INTO public.transactions (
                        partner_id, store_id, description, category,
                        amount, original_amount, interest_amount, fee_amount,
                        due_date, payment_date, status, transaction_type,
                        payment_type, origin, notes
                    ) VALUES (
                        p_partner_id, p_store_id,
                        'Venda PDV ' || v_sale_number || CASE WHEN jsonb_array_length(p_payment_breakdown) > 1 THEN ' (Parte ' || v_payment_line || ')' ELSE '' END,
                        'Vendas',
                        v_entry_amount,
                        COALESCE((v_entry->>'amountReceived')::numeric, v_entry_amount),
                        COALESCE((v_entry->>'interestAmount')::numeric, 0),
                        COALESCE((v_entry->>'feeAmount')::numeric, 0) + COALESCE((v_entry->>'fixedFeeAmount')::numeric, 0),
                        CURRENT_DATE, v_now,
                        'paid', 'income',
                        COALESCE(v_entry->>'paymentMethodName', p_payment_method, 'Outro'),
                        'system',
                        'Venda PDV ID: ' || v_sale_id
                    ) RETURNING id INTO v_tx_id;

                    INSERT INTO public.transaction_payments (
                        transaction_id, partner_id, amount, payment_date,
                        payment_method_id, finance_account_id, cash_session_id
                    ) VALUES (
                        v_tx_id, p_partner_id, v_entry_amount, v_now,
                        v_entry_pm_id, p_finance_account_id, p_cash_session_id
                    );

                    IF p_cash_session_id IS NOT NULL THEN
                        INSERT INTO public.cash_movements (
                            partner_id, store_id, cash_session_id, type, amount,
                            reason, description, payment_method_id, user_id,
                            transaction_id, sale_id
                        ) VALUES (
                            p_partner_id, p_store_id, p_cash_session_id, 'income', v_entry_amount,
                            'Venda PDV', 'Venda ' || v_sale_number, v_entry_pm_id, p_user_id,
                            v_tx_id, v_sale_id
                        );
                    END IF;
                END IF;
            END LOOP;
        ELSE
            INSERT INTO public.transactions (
                partner_id, store_id, description, category,
                amount, original_amount, interest_amount, fee_amount,
                due_date, payment_date, status, transaction_type,
                payment_type, origin, notes
            ) VALUES (
                p_partner_id, p_store_id,
                'Venda PDV ' || v_sale_number,
                'Vendas',
                v_clamped_paid,
                v_final_amount_adjusted,
                COALESCE(v_interest_total, 0),
                COALESCE(v_fee_total, 0) + COALESCE(v_fixed_fee_total, 0),
                CURRENT_DATE, v_now,
                'paid', 'income',
                COALESCE(p_payment_method, 'Outro'),
                'system',
                'Venda PDV ID: ' || v_sale_id
            ) RETURNING id INTO v_tx_id;

            INSERT INTO public.transaction_payments (
                transaction_id, partner_id, amount, payment_date,
                payment_method_id, finance_account_id, cash_session_id
            ) VALUES (
                v_tx_id, p_partner_id, v_clamped_paid, v_now,
                NULL, p_finance_account_id, p_cash_session_id
            );

            IF p_cash_session_id IS NOT NULL THEN
                INSERT INTO public.cash_movements (
                    partner_id, store_id, cash_session_id, type, amount,
                    reason, description, user_id,
                    transaction_id, sale_id
                ) VALUES (
                    p_partner_id, p_store_id, p_cash_session_id, 'income', v_clamped_paid,
                    'Venda PDV', 'Venda ' || v_sale_number, p_user_id,
                    v_tx_id, v_sale_id
                );
            END IF;
        END IF;
    END IF;

    RETURN QUERY SELECT v_sale_id;
END;
$$;


-- ── 5. Função de Inicialização do Plano de Contas Padrão DRE ───────────────
CREATE OR REPLACE FUNCTION public.seed_default_financial_categories(p_partner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_cat_id UUID;
BEGIN
    -- 1. RECEITAS OPERACIONAIS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'receitas operacionais' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Receitas Operacionais', NULL, 'income', 'receita_bruta', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'income', dre_group = 'receita_bruta', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias de Receitas
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Vendas de Produtos', v_cat_id, 'income', 'receita_bruta', true),
        (p_partner_id, 'Prestação de Serviços', v_cat_id, 'income', 'receita_bruta', true),
        (p_partner_id, 'Assinaturas e Recorrentes', v_cat_id, 'income', 'receita_bruta', true),
        (p_partner_id, 'Outras Receitas Operacionais', v_cat_id, 'income', 'receita_bruta', true)
    ON CONFLICT DO NOTHING;


    -- 2. DEDUÇÕES DA RECEITA
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'deduções da receita' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Deduções da Receita', NULL, 'expense', 'deducao_receita', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'deducao_receita', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias de Deduções
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Taxas de Cartão e Maquininhas', v_cat_id, 'expense', 'deducao_receita', true),
        (p_partner_id, 'Devoluções e Reembolsos', v_cat_id, 'expense', 'deducao_receita', true),
        (p_partner_id, 'Descontos Concedidos', v_cat_id, 'expense', 'deducao_receita', true),
        (p_partner_id, 'Impostos sobre Faturamento (DAS)', v_cat_id, 'expense', 'deducao_receita', true)
    ON CONFLICT DO NOTHING;


    -- 3. CUSTOS DIRETOS (CMV / CSP)
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'custos diretos (cmv/csp)' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Custos Diretos (CMV/CSP)', NULL, 'expense', 'custo_direto_cmv', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'custo_direto_cmv', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias de Custos Diretos
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Compra de Mercadorias para Revenda', v_cat_id, 'expense', 'custo_direto_cmv', true),
        (p_partner_id, 'Peças e Materiais de Serviços', v_cat_id, 'expense', 'custo_direto_cmv', true),
        (p_partner_id, 'Insumos e Matéria-Prima', v_cat_id, 'expense', 'custo_direto_cmv', true),
        (p_partner_id, 'Embalagens Diretas de Envio', v_cat_id, 'expense', 'custo_direto_cmv', true)
    ON CONFLICT DO NOTHING;


    -- 4. DESPESAS COM VENDAS (COMERCIAIS)
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'despesas com vendas' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Despesas com Vendas', NULL, 'expense', 'despesa_comercial', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'despesa_comercial', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias de Despesas com Vendas
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Comissões de Vendas', v_cat_id, 'expense', 'despesa_comercial', true),
        (p_partner_id, 'Fretes e Entregas (Logística)', v_cat_id, 'expense', 'despesa_comercial', true),
        (p_partner_id, 'Marketing e Tráfego Pago', v_cat_id, 'expense', 'despesa_comercial', true),
        (p_partner_id, 'Divulgação e Material Promocional', v_cat_id, 'expense', 'despesa_comercial', true)
    ON CONFLICT DO NOTHING;


    -- 5. DESPESAS ADMINISTRATIVAS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'despesas administrativas' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Despesas Administrativas', NULL, 'expense', 'despesa_administrativa', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'despesa_administrativa', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias Administrativas
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Aluguel e Condomínio Comercial', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Energia Elétrica e Água', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Internet, Telefonia e Softwares', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Honorários Contábeis', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Salários e Encargos da Equipe', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Material de Escritório e Limpeza', v_cat_id, 'expense', 'despesa_administrativa', true),
        (p_partner_id, 'Manutenção e Reparos Gerais', v_cat_id, 'expense', 'despesa_administrativa', true)
    ON CONFLICT DO NOTHING;


    -- 6. PRÓ-LABORE & SÓCIOS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'pró-labore & sócios' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Pró-Labore & Sócios', NULL, 'expense', 'pro_labore', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'pro_labore', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias Pró-Labore
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Pró-Labore dos Sócios', v_cat_id, 'expense', 'pro_labore', true),
        (p_partner_id, 'Retiradas do Titular', v_cat_id, 'expense', 'pro_labore', true)
    ON CONFLICT DO NOTHING;


    -- 7. DESPESAS FINANCEIRAS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'despesas financeiras' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Despesas Financeiras', NULL, 'expense', 'despesa_financeira', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'expense', dre_group = 'despesa_financeira', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias Despesas Financeiras
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Juros e Multas Pagos', v_cat_id, 'expense', 'despesa_financeira', true),
        (p_partner_id, 'Tarifas e Manutenção Bancária', v_cat_id, 'expense', 'despesa_financeira', true),
        (p_partner_id, 'Taxas de Antecipação de Recebíveis', v_cat_id, 'expense', 'despesa_financeira', true)
    ON CONFLICT DO NOTHING;


    -- 8. RECEITAS FINANCEIRAS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'receitas financeiras' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Receitas Financeiras', NULL, 'income', 'receita_financeira', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET category_type = 'income', dre_group = 'receita_financeira', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias Receitas Financeiras
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Rendimentos de Aplicações', v_cat_id, 'income', 'receita_financeira', true),
        (p_partner_id, 'Juros e Multas Recebidos', v_cat_id, 'income', 'receita_financeira', true)
    ON CONFLICT DO NOTHING;


    -- 9. OUTRAS / NÃO OPERACIONAIS
    SELECT id INTO v_cat_id FROM public.financial_categories
    WHERE partner_id = p_partner_id AND parent_id IS NULL AND LOWER(name) = 'não operacionais' LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
        VALUES (p_partner_id, 'Não Operacionais', NULL, 'expense', 'nao_operacional', true)
        RETURNING id INTO v_cat_id;
    ELSE
        UPDATE public.financial_categories
        SET dre_group = 'nao_operacional', is_active = true
        WHERE id = v_cat_id;
    END IF;

    -- Subcategorias Não Operacionais
    INSERT INTO public.financial_categories (partner_id, name, parent_id, category_type, dre_group, is_active)
    VALUES
        (p_partner_id, 'Venda de Ativos / Móveis Usados', v_cat_id, 'income', 'nao_operacional', true),
        (p_partner_id, 'Despesas Extraordinárias e Reformas', v_cat_id, 'expense', 'nao_operacional', true)
    ON CONFLICT DO NOTHING;
END;
$$;


-- ── 6. Trigger para auto-criar categorias padrão ao criar novo parceiro ─────
CREATE OR REPLACE FUNCTION public.trg_create_default_financial_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    PERFORM public.seed_default_financial_categories(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_financial_categories_for_partner ON public.partners;

CREATE TRIGGER trg_create_default_financial_categories_for_partner
AFTER INSERT ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.trg_create_default_financial_categories();


-- ── 7. Backfill para todos os parceiros existentes no banco ─────────────────
DO $$
DECLARE
    v_partner RECORD;
BEGIN
    FOR v_partner IN SELECT id FROM public.partners
    LOOP
        PERFORM public.seed_default_financial_categories(v_partner.id);
    END LOOP;
END;
$$;

COMMIT;
