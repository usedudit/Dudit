-- ============================================================================
-- MIGRATION: Recurring billing - correcoes P0 (Fase 1)
-- Data: 2026-10-04
-- Projeto: Dudit
--
--   1. AJUSTE de status de assinaturas (recurring_subscriptions)
--      Inclui os estados que o codigo ja escreve mas o CHECK rejeitava:
--        pending          - assinatura criada aguardando webhook do MP
--        payment_failed   - cobranca recusada (recurring-execution.service)
--        past_due         - cobranca em andamento / dunning em retry
--
--   2. AJUSTE de status de execucoes (recurring_executions)
--      awaiting_payment - execucao aguardando confirmacao do MP
--      + colunas de dunning (payment_attempts, last_payment_failed_at)
--
--   3. recurring_plans.price (coluna materializada)
--      O preapproval do Mercado Pago exige um valor fixo; ate entao o valor
--      era calculado somente em runtime a partir dos itens. Com a coluna o
--      valor fica disponivel para:
--        - app/actions/marketplace/preapproval.ts (select de plan.price)
--        - checkout (marketplace-cart-resolver.ts)
--        - payload auto_recurring.transaction_amount do MP
--
--   4. Trigger de manutencao de recurring_plans.price
--      Recalcula quando os itens do plano mudam e quando o preco de catalogo
--      (products / product_variants / services) muda.
--
--   5. CORRECAO do trigger create_subscription_snapshot
--      Referencia public.product_variants.price, coluna INEXISTENTE (o schema
--      usa product_variants.price_adjustment). Qualquer assinatura com item
--      variante e unit_price nulo quebrava a insercao da assinatura.
--
-- Base: tabelas de assinaturas recorrentes estao vazias (0 planos, 0
-- assinaturas, 0 execucoes) -> nenhuma regra de backfill de dados.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) recurring_subscriptions: liberar estados usados pelo codigo
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_status_check CHECK (status IN (
    'active',
    'paused',
    'cancelled',
    'expired',
    'awaiting_restock',
    'pending',
    'payment_failed',
    'past_due'
  ));

COMMENT ON COLUMN public.recurring_subscriptions.status IS
  'active | paused | cancelled | expired | awaiting_restock | '
  'pending (aguardando webhook do MP) | past_due (dunning em retry) | '
  'payment_failed (tentativas esgotadas)';

-- ---------------------------------------------------------------------------
-- 2) recurring_executions: awaiting_payment + colunas de dunning
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_executions
  DROP CONSTRAINT IF EXISTS recurring_executions_status_check;

ALTER TABLE public.recurring_executions
  ADD CONSTRAINT recurring_executions_status_check CHECK (status IN (
    'pending',
    'processing',
    'awaiting_payment',
    'completed',
    'failed'
  ));

ALTER TABLE public.recurring_executions
  ADD COLUMN IF NOT EXISTS payment_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.recurring_executions
  ADD COLUMN IF NOT EXISTS last_payment_failed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.recurring_executions.payment_attempts IS
  'Quantas vezes o MP recusou o pagamento deste ciclo. Ate 3 tentativas a '
  'execucao permanece em awaiting_payment; na 3a passa a failed.';
COMMENT ON COLUMN public.recurring_executions.last_payment_failed_at IS
  'Momento da ultima recusa de pagamento recebida do Mercado Pago.';

-- ---------------------------------------------------------------------------
-- 3) recurring_plans.price
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.recurring_plans.price IS
  'Valor materializado por ciclo (soma dos itens, com fallback de catalogo). '
  'Mantido por recurring_plans_refresh_price().';

-- ---------------------------------------------------------------------------
-- 4) preco do plano materializado
-- ---------------------------------------------------------------------------

-- Expressao de preco espelhando o fallback do create_subscription_snapshot.
-- Regra de variante no catalogo da Dudit: product.price + price_adjustment.
CREATE OR REPLACE FUNCTION public.recurring_plan_item_price(
  p_item_type TEXT,
  p_product_id UUID,
  p_variant_id UUID,
  p_service_id UUID,
  p_unit_price NUMERIC
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(
    p_unit_price,
    CASE
      WHEN p_item_type = 'product' AND p_variant_id IS NOT NULL THEN
        COALESCE((SELECT pr.price FROM public.products pr WHERE pr.id = p_product_id), 0)
        + COALESCE((SELECT v.price_adjustment FROM public.product_variants v WHERE v.id = p_variant_id), 0)
      WHEN p_item_type = 'product' THEN
        COALESCE((SELECT pr.price FROM public.products pr WHERE pr.id = p_product_id), 0)
      WHEN p_item_type = 'service' THEN
        COALESCE((SELECT sv.price FROM public.services sv WHERE sv.id = p_service_id), 0)
      ELSE 0.00
    END,
    0.00
  )::numeric(14,2);
$$;

COMMENT ON FUNCTION public.recurring_plan_item_price(TEXT, UUID, UUID, UUID, NUMERIC) IS
  'Preco de um item de plano: unit_price se definido, senao fallback de catalogo.';

-- Soma dos itens de um plano (0 quando o plano nao tem itens).
CREATE OR REPLACE FUNCTION public.recurring_plan_total(p_plan_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(
    SUM(
      i.quantity * public.recurring_plan_item_price(
        i.item_type, i.product_id, i.variant_id, i.service_id, i.unit_price
      )
    ),
    0
  )::numeric(14,2)
  FROM public.recurring_plan_items i
  WHERE i.plan_id = p_plan_id;
$$;

COMMENT ON FUNCTION public.recurring_plan_total(UUID) IS
  'Soma de recurring_plans.price para o plano informado.';

CREATE OR REPLACE FUNCTION public.recurring_plans_refresh_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_plan_id    UUID;
  v_catalog_id UUID;
BEGIN
  -- Triggers sobre recurring_plan_items: recalcula apenas o plano afetado.
  IF TG_TABLE_NAME = 'recurring_plan_items' THEN
    IF TG_OP = 'DELETE' THEN
      v_plan_id := OLD.plan_id;
    ELSE
      v_plan_id := NEW.plan_id;
    END IF;

    IF v_plan_id IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.recurring_plans
    SET price = public.recurring_plan_total(v_plan_id)
    WHERE id = v_plan_id;

    -- Item movido para outro plano: o plano de origem tambem muda.
    IF TG_OP = 'UPDATE' AND OLD.plan_id IS DISTINCT FROM NEW.plan_id AND OLD.plan_id IS NOT NULL THEN
      UPDATE public.recurring_plans
      SET price = public.recurring_plan_total(OLD.plan_id)
      WHERE id = OLD.plan_id;
    END IF;

    RETURN NULL;
  END IF;

  -- Triggers de catalogo: ignora atualizacoes que nao mexem no preco.
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'product_variants' THEN
      IF NEW.price_adjustment IS NOT DISTINCT FROM OLD.price_adjustment THEN
        RETURN NULL;
      END IF;
    ELSIF NEW.price IS NOT DISTINCT FROM OLD.price THEN
      RETURN NULL;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_catalog_id := OLD.id;
  ELSE
    v_catalog_id := NEW.id;
  END IF;

  UPDATE public.recurring_plans p
  SET price = public.recurring_plan_total(p.id)
  WHERE CASE
    -- item com variante usa o preco da variante; nao reage ao preco base
    WHEN TG_TABLE_NAME = 'products' THEN EXISTS (
      SELECT 1 FROM public.recurring_plan_items i
      WHERE i.plan_id = p.id AND i.product_id = v_catalog_id AND i.variant_id IS NULL
    )
    WHEN TG_TABLE_NAME = 'product_variants' THEN EXISTS (
      SELECT 1 FROM public.recurring_plan_items i
      WHERE i.plan_id = p.id AND i.variant_id = v_catalog_id
    )
    WHEN TG_TABLE_NAME = 'services' THEN EXISTS (
      SELECT 1 FROM public.recurring_plan_items i
      WHERE i.plan_id = p.id AND i.service_id = v_catalog_id
    )
    ELSE FALSE
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.recurring_plans_refresh_price() IS
  'Mantem recurring_plans.price sincronizado com os itens e com o catalogo.';

DROP TRIGGER IF EXISTS trigger_recurring_plan_items_refresh_price
  ON public.recurring_plan_items;
CREATE TRIGGER trigger_recurring_plan_items_refresh_price
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_plan_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recurring_plans_refresh_price();

DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_products
  ON public.products;
CREATE TRIGGER trigger_recurring_plans_price_from_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.recurring_plans_refresh_price();

DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_variants
  ON public.product_variants;
CREATE TRIGGER trigger_recurring_plans_price_from_variants
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.recurring_plans_refresh_price();

DROP TRIGGER IF EXISTS trigger_recurring_plans_price_from_services
  ON public.services;
CREATE TRIGGER trigger_recurring_plans_price_from_services
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.recurring_plans_refresh_price();

-- Recalcula todos os planos existentes.
UPDATE public.recurring_plans
SET price = public.recurring_plan_total(id);

-- Funcoes internas: bloquear invocacao direta via PostgREST.
REVOKE EXECUTE ON FUNCTION public.recurring_plan_item_price(TEXT, UUID, UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurring_plan_total(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurring_plans_refresh_price()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Correcao do snapshot de itens da assinatura
--    product_variants nao possui coluna "price"; o preco efetivo de uma
--    variante e products.price + product_variants.price_adjustment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subscription_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.recurring_subscription_items (
    subscription_id, item_type, product_id, variant_id, service_id,
    quantity, unit_price, staff_partner_user_id, preferred_time,
    duration_minutes, sort_order
  )
  SELECT
    NEW.id,
    rpi.item_type,
    rpi.product_id,
    rpi.variant_id,
    rpi.service_id,
    rpi.quantity,
    public.recurring_plan_item_price(
      rpi.item_type, rpi.product_id, rpi.variant_id, rpi.service_id, rpi.unit_price
    ),
    rpi.staff_partner_user_id,
    rpi.preferred_time,
    rpi.duration_minutes,
    rpi.sort_order
  FROM public.recurring_plan_items rpi
  WHERE rpi.plan_id = NEW.recurring_plan_id;

  RETURN NEW;
END;
$$;

COMMIT;
