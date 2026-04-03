-- ERP Quotes Module Optimizations & Advanced Transactions

-- ==========================================
-- 1. INDEXES AND SEARCH PERFORMANCE
-- ==========================================

-- Standard and Composite Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_partner_created
ON quotes (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_partner
ON customers (partner_id);

CREATE INDEX IF NOT EXISTS idx_products_partner_active
ON products (partner_id, is_active);

-- Foreign Keys Index Optimization (Quote Items)
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id
ON quote_items (quote_id);

-- TSVector Full-Text Search Configuration (Future Proofing)
-- Adding specialized search columns to handle massive catalogs natively

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS fts tsvector 
GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(sku, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_products_fts ON products USING GIN (fts);

-- ==========================================
-- 2. ATOMIC RPC TRANSACTIONS (PL/pgSQL)
-- ==========================================

-- A) CREATE QUOTE ATOMICALLY
CREATE OR REPLACE FUNCTION create_quote_with_items(
    p_partner_id UUID,
    p_user_id UUID,
    p_customer_id UUID,
    p_status TEXT,
    p_issue_date DATE,
    p_expiration_date DATE,
    p_notes TEXT,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_shipping_cost NUMERIC,
    p_additional_costs NUMERIC,
    p_items JSONB -- Expected array of items e.g., [{"product_id": "...", "custom_name": "...", "quantity": 1, "unit_price": 10.5, "sort_order": 0}]
) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_quote_id UUID;
    new_quote_number TEXT;
    item record;
BEGIN
    -- 1. Insert Quote
    INSERT INTO quotes (
        partner_id, customer_id, user_id, status, issue_date, 
        expiration_date, notes, discount_type, discount_value, 
        shipping_cost, additional_costs
    ) VALUES (
        p_partner_id, p_customer_id, p_user_id, COALESCE(p_status, 'draft'), p_issue_date,
        p_expiration_date, p_notes, COALESCE(p_discount_type, 'fixed'), 
        COALESCE(p_discount_value, 0), COALESCE(p_shipping_cost, 0), COALESCE(p_additional_costs, 0)
    )
    RETURNING id, quote_number INTO new_quote_id, new_quote_number;

    -- 2. Insert Items Loop
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            INSERT INTO quote_items (
                quote_id, partner_id, product_id, custom_name, description,
                quantity, unit_price, sort_order
            ) VALUES (
                new_quote_id,
                p_partner_id,
                NULLIF((item.value->>'product_id'), '')::UUID,
                item.value->>'custom_name',
                item.value->>'description',
                COALESCE((item.value->>'quantity')::NUMERIC, 1),
                COALESCE((item.value->>'unit_price')::NUMERIC, 0),
                COALESCE((item.value->>'sort_order')::INT, 0)
            );
        END LOOP;
    END IF;

    -- If any operation within this block fails, Postgres inherently rolls back the ENTIRE transaction.
    -- Returning success object.
    RETURN jsonb_build_object(
        'id', new_quote_id,
        'quote_number', new_quote_number
    );
EXCEPTION 
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to execute create transaction: %', SQLERRM;
END;
$$;


-- B) DUPLICATE QUOTE ATOMICALLY
CREATE OR REPLACE FUNCTION duplicate_quote_with_items(
    p_quote_id UUID,
    p_partner_id UUID,
    p_user_id UUID
) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    original_quote RECORD;
    new_quote_id UUID;
    new_quote_number TEXT;
BEGIN
    
    -- 1. Lock and Verify Original Quote exists
    SELECT * INTO original_quote
    FROM quotes 
    WHERE id = p_quote_id AND partner_id = p_partner_id
    FOR SHARE; -- Prevent modifications during reading

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orçamento original nao encontrado';
    END IF;

    -- 2. Create the base duplicated quote
    INSERT INTO quotes (
        partner_id, customer_id, user_id, status, 
        issue_date, expiration_date, notes, 
        discount_type, discount_value, shipping_cost, additional_costs
    ) VALUES (
        p_partner_id, original_quote.customer_id, p_user_id, 'draft', 
        CURRENT_DATE, original_quote.expiration_date, original_quote.notes, 
        original_quote.discount_type, original_quote.discount_value, 
        original_quote.shipping_cost, original_quote.additional_costs
    )
    RETURNING id, quote_number INTO new_quote_id, new_quote_number;

    -- 3. Copy items sequentially
    INSERT INTO quote_items (
        quote_id, partner_id, product_id, custom_name, description,
        product_name_snapshot, product_sku_snapshot, 
        quantity, unit_price, sort_order
    )
    SELECT 
        new_quote_id, p_partner_id, product_id, custom_name, description,
        product_name_snapshot, product_sku_snapshot, 
        quantity, unit_price, sort_order
    FROM quote_items 
    WHERE quote_id = p_quote_id AND partner_id = p_partner_id
    ORDER BY sort_order ASC;

    -- Return the newly minted quote wrapper
    RETURN jsonb_build_object(
        'id', new_quote_id,
        'quote_number', new_quote_number
    );
EXCEPTION 
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to execute duplicate transaction: %', SQLERRM;
END;
$$;
