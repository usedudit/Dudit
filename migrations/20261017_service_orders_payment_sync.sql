-- ============================================================================
-- Migration: 20261017_service_orders_payment_sync.sql
-- Description: Sincroniza o status de pagamento do pedido vinculado (orders)
--   de volta para a Ordem de Serviço (service_orders).
--
-- Motivo: o pagamento da OS é registrado pelo módulo Pedidos (redirect
--   /erp/pedidos?edit=<order_id>&payment=1). Sem esta sincronização, a OS
--   permanecia como "não paga" mesmo após o pedido vinculado ser quitado,
--   exibindo o botão "Registrar Pagamento" indefinidamente.
--
-- Vínculo: orders.source_service_order_id -> service_orders.id
--          e service_orders.order_id -> orders.id (bidirecional)
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_service_order_payment_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_status TEXT;
BEGIN
  -- Só reage quando situação ou valor pago mudam
  IF NEW.situation IS NOT DISTINCT FROM OLD.situation
     AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN
    RETURN NEW;
  END IF;

  v_payment_status := CASE
    WHEN NEW.situation = 'paid' THEN 'paid'
    WHEN NEW.situation = 'partially_paid' THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE public.service_orders
  SET payment_status = v_payment_status,
      paid_amount = GREATEST(COALESCE(NEW.paid_amount, 0), 0),
      updated_at = NOW()
  WHERE (NEW.source_service_order_id IS NOT NULL AND id = NEW.source_service_order_id)
     OR (order_id = NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_service_order_payment ON public.orders;
CREATE TRIGGER trg_sync_service_order_payment
  AFTER UPDATE OF situation, paid_amount ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_service_order_payment_from_order();

-- Backfill: alinha OS já existentes ao estado atual do pedido vinculado.
UPDATE public.service_orders so
SET payment_status = CASE
      WHEN o.situation = 'paid' THEN 'paid'
      WHEN o.situation = 'partially_paid' THEN 'partially_paid'
      ELSE 'unpaid'
    END,
    paid_amount = GREATEST(COALESCE(o.paid_amount, 0), 0)
FROM public.orders o
WHERE (o.source_service_order_id IS NOT NULL AND o.source_service_order_id = so.id)
   OR (so.order_id = o.id);

NOTIFY pgrst, 'reload schema';
