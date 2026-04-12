-- ============================================================================
-- Quotes: conversion metadata, order link, history table, lock trigger tweak
-- Orders: optional source_quote_id (idempotent one order per quote)
-- ============================================================================

-- ─── Quotes: conversion columns ─────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS converted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_without_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_partner_converted
  ON public.quotes (partner_id, converted)
  WHERE converted = TRUE;

COMMENT ON COLUMN public.quotes.converted IS 'True after this quote was turned into an ERP order (idempotent guard).';
COMMENT ON COLUMN public.quotes.converted_without_approval IS 'True when conversion happened while status was sent (not formally approved).';

-- ─── Orders: link back to originating quote ─────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_quote_id_unique
  ON public.orders (source_quote_id)
  WHERE source_quote_id IS NOT NULL;

-- ─── Quote history (mirrors orders_history / transactions_history) ──────────
CREATE TABLE IF NOT EXISTS public.quotes_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type VARCHAR(32) NOT NULL,
  change_lines TEXT[] NOT NULL CHECK (cardinality(change_lines) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_history_quote_created_idx
  ON public.quotes_history (quote_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS quotes_history_partner_created_idx
  ON public.quotes_history (partner_id, created_at DESC, id DESC);

ALTER TABLE public.quotes_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_history_select_own" ON public.quotes_history;
CREATE POLICY "quotes_history_select_own"
  ON public.quotes_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.partners
      WHERE partners.id = quotes_history.partner_id
        AND partners.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quotes_history_insert_own" ON public.quotes_history;
CREATE POLICY "quotes_history_insert_own"
  ON public.quotes_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.partners
      WHERE partners.id = quotes_history.partner_id
        AND partners.user_id = auth.uid()
    )
  );

-- ─── Allow approved quotes to receive conversion-only updates ──────────────
CREATE OR REPLACE FUNCTION lock_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Approved + same status: allow bookkeeping fields used after conversion
  IF OLD.status = 'approved' AND NEW.status = OLD.status THEN
    IF NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id
       AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.quote_number IS NOT DISTINCT FROM OLD.quote_number
       AND NEW.issue_date IS NOT DISTINCT FROM OLD.issue_date
       AND NEW.expiration_date IS NOT DISTINCT FROM OLD.expiration_date
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
       AND NEW.discount_type IS NOT DISTINCT FROM OLD.discount_type
       AND NEW.discount_value IS NOT DISTINCT FROM OLD.discount_value
       AND NEW.shipping_cost IS NOT DISTINCT FROM OLD.shipping_cost
       AND NEW.additional_costs IS NOT DISTINCT FROM OLD.additional_costs
       AND NEW.total IS NOT DISTINCT FROM OLD.total
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Orçamento com status "%" não pode ser editado. Duplique-o para criar uma nova versão.', OLD.status;
  END IF;

  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'Orçamento com status "%" não pode ser editado. Duplique-o para criar uma nova versão.', OLD.status;
  END IF;

  IF OLD.status = 'approved' AND NEW.status NOT IN ('expired') THEN
    RAISE EXCEPTION 'Orçamento aprovado só pode ser marcado como expirado';
  END IF;
  IF OLD.status = 'rejected' AND NEW.status NOT IN ('draft') THEN
    RAISE EXCEPTION 'Orçamento rejeitado só pode ser reaberto como rascunho';
  END IF;

  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
     OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
     OR NEW.additional_costs IS DISTINCT FROM OLD.additional_costs
     OR NEW.converted IS DISTINCT FROM OLD.converted
     OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
     OR NEW.converted_without_approval IS DISTINCT FROM OLD.converted_without_approval
     OR NEW.converted_order_id IS DISTINCT FROM OLD.converted_order_id
  THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de um orçamento com status "%". Apenas mudanças de status são aceitas.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;
