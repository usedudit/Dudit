-- ============================================================================
-- Quotes: internal_notes, status "cancelled", stricter edit policies (DB)
-- ============================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'cancelled'));

-- ─── Items: só em rascunho ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_item_change_on_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_status TEXT;
  target_quote_id UUID;
BEGIN
  target_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  SELECT status INTO quote_status
  FROM public.quotes WHERE id = target_quote_id;

  IF quote_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Itens do orçamento só podem ser alterados em status Rascunho. Status atual: %', quote_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── Atualização de linha de orçamento por status ────────────────────────────
CREATE OR REPLACE FUNCTION lock_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Campos imutáveis do orçamento não podem ser alterados';
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Qualquer mudança de status: não misturar com alteração de dados comerciais
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.converted IS DISTINCT FROM OLD.converted
       OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
       OR NEW.converted_without_approval IS DISTINCT FROM OLD.converted_without_approval
       OR NEW.converted_order_id IS DISTINCT FROM OLD.converted_order_id
    THEN
      RAISE EXCEPTION 'Altere apenas o status nesta operação, sem mudar outros dados do orçamento.';
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento enviado';
    END IF;

    IF OLD.status = 'approved' AND NEW.status NOT IN ('expired', 'cancelled') THEN
      RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado ou cancelado';
    END IF;
    IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
    END IF;
    IF OLD.status = 'expired' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento expirado só pode ser reaberto como rascunho';
    END IF;
    IF OLD.status = 'cancelled' AND NEW.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'Orçamento cancelado só pode ser reaberto como rascunho';
    END IF;

    RETURN NEW;
  END IF;

  -- Mesmo status: enviado - só observações, validade, internas e conversão
  IF OLD.status = 'sent' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento enviado: não é permitido alterar dados financeiros ou comerciais. Reabra como rascunho.';
    END IF;
    RETURN NEW;
  END IF;

  -- Aprovado: snapshot comercial + notas ao cliente congelados; internas e conversão ok
  IF OLD.status = 'approved' THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Orçamento aprovado: duplique o orçamento para alterar dados comerciais ou financeiros.';
    END IF;
    RETURN NEW;
  END IF;

  -- Rejeitado / expirado / cancelado: só observações internas
  IF OLD.status IN ('rejected', 'expired', 'cancelled') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
       OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.status IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'Neste status o orçamento está bloqueado; apenas observações internas podem ser alteradas.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── create_quote_with_items: nova assinatura (internal_notes + só draft) ──
DROP FUNCTION IF EXISTS public.create_quote_with_items(uuid, uuid, uuid, text, date, date, text, text, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION create_quote_with_items(
    p_partner_id UUID,
    p_user_id UUID,
    p_customer_id UUID,
    p_status TEXT,
    p_issue_date DATE,
    p_expiration_date DATE,
    p_notes TEXT,
    p_internal_notes TEXT,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_shipping_cost NUMERIC,
    p_additional_costs NUMERIC,
    p_items JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_quote_id UUID;
    new_quote_number TEXT;
    item record;
BEGIN
    IF p_status IS NOT NULL AND lower(trim(p_status)) <> 'draft' THEN
        RAISE EXCEPTION 'Novos orçamentos só podem ser criados em status Rascunho';
    END IF;

    INSERT INTO quotes (
        partner_id, customer_id, user_id, status, issue_date,
        expiration_date, notes, internal_notes, discount_type, discount_value,
        shipping_cost, additional_costs
    ) VALUES (
        p_partner_id, p_customer_id, p_user_id, 'draft', p_issue_date,
        p_expiration_date, p_notes, NULLIF(trim(p_internal_notes), ''), COALESCE(p_discount_type, 'fixed'),
        COALESCE(p_discount_value, 0), COALESCE(p_shipping_cost, 0), COALESCE(p_additional_costs, 0)
    )
    RETURNING id, quote_number INTO new_quote_id, new_quote_number;

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

    RETURN jsonb_build_object(
        'id', new_quote_id,
        'quote_number', new_quote_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to execute create transaction: %', SQLERRM;
END;
$$;

-- ─── duplicate: copiar internal_notes ───────────────────────────────────────
CREATE OR REPLACE FUNCTION duplicate_quote_with_items(
    p_quote_id UUID,
    p_partner_id UUID,
    p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    original_quote RECORD;
    new_quote_id UUID;
    new_quote_number TEXT;
BEGIN
    SELECT * INTO original_quote
    FROM quotes
    WHERE id = p_quote_id AND partner_id = p_partner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orçamento original nao encontrado';
    END IF;

    INSERT INTO quotes (
        partner_id, customer_id, user_id, status,
        issue_date, expiration_date, notes, internal_notes,
        discount_type, discount_value, shipping_cost, additional_costs
    ) VALUES (
        p_partner_id, original_quote.customer_id, p_user_id, 'draft',
        CURRENT_DATE, original_quote.expiration_date, original_quote.notes, original_quote.internal_notes,
        original_quote.discount_type, original_quote.discount_value,
        original_quote.shipping_cost, original_quote.additional_costs
    )
    RETURNING id, quote_number INTO new_quote_id, new_quote_number;

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

    RETURN jsonb_build_object(
        'id', new_quote_id,
        'quote_number', new_quote_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to execute duplicate transaction: %', SQLERRM;
END;
$$;
