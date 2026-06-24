-- Evita que orçamentos finalizados (aprovados/rejeitados) sejam expirados automaticamente

-- 1. Atualiza a trigger function lock_finalized_quote para bloquear approved → expired
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
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
      RAISE EXCEPTION 'Altere apenas o status nesta operação, sem mudar outros dados do orçamento.';
    END IF;

    IF OLD.status = 'sent' AND NEW.status NOT IN ('pending_client', 'viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento enviado';
    END IF;

    IF OLD.status = 'pending_client' AND NEW.status NOT IN ('viewed', 'approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento pendente';
    END IF;

    IF OLD.status = 'viewed' AND NEW.status NOT IN ('approved', 'rejected', 'draft', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'Transição de status inválida para orçamento visualizado';
    END IF;

    IF OLD.status = 'approved' AND NEW.status NOT IN ('cancelled', 'converted_to_order') THEN
      RAISE EXCEPTION 'Orçamento aprovado não pode ser expirado. Cancele ou converta em pedido.';
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

    IF OLD.status = 'converted_to_order' THEN
      RAISE EXCEPTION 'Orçamento convertido em pedido não pode ter seu status alterado';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending_client', 'viewed', 'sent') THEN
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
      RAISE EXCEPTION 'Orçamento enviado/pendente: não é permitido alterar dados financeiros ou comerciais. Reabra como rascunho.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'rejected', 'expired', 'cancelled', 'converted_to_order') THEN
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
      RAISE EXCEPTION 'Orçamento finalizado: alterações de dados comerciais ou financeiros não são permitidas.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Atualiza a função auto_expire_quotes para nunca expirar orçamentos finalizados
CREATE OR REPLACE FUNCTION auto_expire_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE quotes
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('draft', 'sent')
    AND expiration_date IS NOT NULL
    AND expiration_date < CURRENT_DATE;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
